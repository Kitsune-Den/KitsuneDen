"use client";

import { useState, useCallback } from "react";
import { useServer } from "@/contexts/ServerContext";
import { Trash2, Pencil, Plus, FolderOpen, Sparkles, Loader, TriangleAlert, Info } from "lucide-react";
import ConfirmModal from "./ConfirmModal";
import { gameMeta, statusMeta } from "@/lib/game-meta";
import { portDefault, recipeDefaults, recipeFor, type RecipePort } from "@/lib/recipes";
import GamePicker from "./GamePicker";
import { PORT_FIELDS, useServerAutofill } from "./servers/useServerAutofill";


interface DeleteTarget {
  id: string;
  name: string;
  type: string;
  status: string;
}

interface FieldDef {
  key: string;
  label: string;
  type: "text" | "number" | "password";
  hint?: string;
}

const SHARED_FIELDS: FieldDef[] = [
  { key: "name", label: "Server Name", type: "text", hint: "Display name shown in the dashboard" },
  { key: "dir", label: "Install Directory", type: "text", hint: "Full path to the server's root folder" },
  { key: "gamePort", label: "Game Port", type: "number", hint: "Port players connect to" },
];

// Defaults and port facts live in the game's recipe (src/lib/recipes.ts);
// fieldHint() adds them, so no number here can drift from it.
const TYPE_FIELDS: Record<string, FieldDef[]> = {
  "7d2d": [
    { key: "telnetPort", label: "Telnet Port", type: "number", hint: "Telnet port for server commands" },
    { key: "telnetPassword", label: "Telnet Password", type: "password", hint: "Password set in serverconfig.xml under TelnetPassword" },
    { key: "configFile", label: "Config File", type: "text", hint: "Config filename (e.g. serverconfig.xml or serverconfig-custom.xml)" },
    { key: "modsDir", label: "Mods Directory", type: "text", hint: "Mods folder name relative to install dir" },
  ],
  minecraft: [
    { key: "rconPort", label: "RCON Port", type: "number", hint: "RCON port from server.properties" },
    { key: "rconPassword", label: "RCON Password", type: "password", hint: "RCON password from server.properties" },
    { key: "javaPath", label: "Java Path", type: "text", hint: "Full path to java.exe (e.g. C:\\Program Files\\Java\\bin\\java.exe)" },
    { key: "loader", label: "Loader", type: "text", hint: "Mod loader type (Fabric, NeoForge, Paper, Vanilla, etc.)" },
    { key: "version", label: "Version", type: "text", hint: "Minecraft version (e.g. 1.21.4)" },
  ],
  hytale: [
    { key: "startScript", label: "Start Script", type: "text", hint: "Bat file to launch the server, relative to the install directory" },
    { key: "backupScript", label: "Backup Script", type: "text", hint: "PowerShell script for backups, relative to the install directory (optional)" },
    { key: "processFilter", label: "Process Filter", type: "text", hint: "Process name to detect if server is running" },
  ],
  palworld: [
    { key: "rconPort", label: "RCON Port", type: "number", hint: "RCON port" },
    { key: "rconPassword", label: "RCON Password", type: "password", hint: "RCON password from PalWorldSettings.ini" },
    { key: "steamCmdPath", label: "SteamCMD Path", type: "text", hint: "Full path to steamcmd.exe for updates" },
    { key: "restApiPort", label: "REST API Port", type: "number", hint: "REST API port" },
    { key: "restApiPassword", label: "REST API Password", type: "password", hint: "Admin password for the REST API" },
  ],
  enshrouded: [
    { key: "configFile", label: "Config File", type: "text", hint: "Config filename" },
    { key: "startScript", label: "Start Script", type: "text", hint: "Optional bat file in the install directory. Falls back to launching enshrouded_server.exe directly." },
    { key: "steamCmdPath", label: "SteamCMD Path", type: "text", hint: "Full path to steamcmd.exe for updates" },
  ],
};

const PROTO_LABEL: Record<RecipePort["proto"], string> = { tcp: "TCP", udp: "UDP", "tcp+udp": "TCP and UDP" };

function fieldsFor(type: string): FieldDef[] {
  return [...SHARED_FIELDS, ...(TYPE_FIELDS[type] || [])];
}

/**
 * The recipe's default for a field, shown as its placeholder. Not filled in:
 * autofill only fills empty fields, and it knows better (what's in the
 * install folder, which ports are free). Left empty, the adapter uses this.
 */
function defaultPlaceholder(type: string, field: FieldDef): string | undefined {
  if (field.type === "password") return undefined;
  const v: unknown = (recipeDefaults(type) as Record<string, unknown>)[field.key];
  return typeof v === "string" || typeof v === "number" ? `${v} (default)` : undefined;
}

/** The field's own hint, plus what the game's recipe says about it. */
function fieldHint(type: string, field: FieldDef): string | undefined {
  const recipe = recipeFor(type);
  if (!recipe) return field.hint;
  const parts = [field.hint];
  const port = recipe.ports.find((p) => p.field === field.key);
  if (port) {
    const n = portDefault(recipe, port.field);
    parts.push(`${PROTO_LABEL[port.proto]}${n !== undefined ? `, default ${n}` : ""}`);
    parts.push(port.public ? "forward it for players" : "keep it off the internet");
    if (port.note) parts.push(port.note);
  } else {
    const d: unknown = (recipe.defaults as Record<string, unknown>)[field.key];
    if (typeof d === "string" || typeof d === "number") parts.push(`default ${d}`);
  }
  return parts.filter(Boolean).join(" · ");
}

export default function ServersPage() {
  const { servers, serverId, setServerId, refreshServers } = useServer();

  // Delete flow state
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [deleteFiles, setDeleteFiles] = useState(false);
  const [showFileWarning, setShowFileWarning] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);

  // Edit flow state
  const [editTarget, setEditTarget] = useState<{ id: string; name: string; type: string } | null>(null);
  const [editDraft, setEditDraft] = useState<Record<string, string | number>>({});
  const [saving, setSaving] = useState(false);
  const [editMessage, setEditMessage] = useState<{ text: string; error: boolean } | null>(null);

  // Add flow state
  const [showAdd, setShowAdd] = useState(false);
  const [addType, setAddType] = useState<string>("7d2d");
  const [addDraft, setAddDraft] = useState<Record<string, string | number>>({});
  const [addSaving, setAddSaving] = useState(false);
  const [addMessage, setAddMessage] = useState<{ text: string; error: boolean } | null>(null);
  const autofill = useServerAutofill(showAdd, addType, addDraft, setAddDraft);

  const openAdd = () => {
    setAddType("7d2d");
    setAddDraft({});
    setAddMessage(null);
    setShowAdd(true);
    autofill.reset("7d2d");
  };

  const handleSaveAdd = async () => {
    const name = String(addDraft.name || "").trim();
    const dir = String(addDraft.dir || "").trim();
    if (!name || !dir) {
      setAddMessage({ text: "Name and Install Directory are required", error: true });
      return;
    }

    // Auto-generate ID from name
    const id = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    if (!id) {
      setAddMessage({ text: "Could not generate a valid ID from the name", error: true });
      return;
    }

    setAddSaving(true);
    setAddMessage(null);

    try {
      const fields = fieldsFor(addType);
      // Detected launch settings (jar, launch mode, arg files) have no inputs; form values win.
      const server: Record<string, unknown> = { ...autofill.hiddenFields(), id, type: addType };
      for (const f of fields) {
        const val = addDraft[f.key];
        if (f.type === "number" && val !== "" && val !== undefined) {
          server[f.key] = Number(val);
        } else if (val !== undefined) {
          server[f.key] = val;
        }
      }

      const res = await fetch("/api/servers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ server, syncPortsToGame: autofill.syncPorts }),
      });
      const data = await res.json();

      if (data.success) {
        setAddMessage({ text: data.message, error: false });
        refreshServers();
        setTimeout(() => {
          setShowAdd(false);
          setAddMessage(null);
        }, 1200);
      } else {
        setAddMessage({ text: data.message, error: true });
      }
    } catch (err) {
      setAddMessage({ text: `Request failed: ${err}`, error: true });
    } finally {
      setAddSaving(false);
    }
  };

  const [browsing, setBrowsing] = useState(false);
  const browseFolder = useCallback(async (setter: (fn: (prev: Record<string, string | number>) => Record<string, string | number>) => void) => {
    setBrowsing(true);
    try {
      const res = await fetch("/api/browse-folder");
      const data = await res.json();
      if (data.path && !data.cancelled) {
        setter((prev) => ({ ...prev, dir: data.path }));
      }
    } catch { /* ignore */ }
    finally { setBrowsing(false); }
  }, []);

  const openDelete = (server: DeleteTarget) => {
    setDeleteTarget(server);
    setDeleteFiles(false);
    setShowFileWarning(false);
    setMessage(null);
  };

  const handleDelete = async () => {
    // If they checked "delete files" and haven't confirmed the file warning yet, show it
    if (deleteFiles && !showFileWarning) {
      setShowFileWarning(true);
      return;
    }

    if (!deleteTarget) return;
    setDeleting(true);
    setMessage(null);

    try {
      const res = await fetch("/api/servers", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          serverId: deleteTarget.id,
          deleteFiles,
        }),
      });
      const data = await res.json();

      if (data.success) {
        setMessage({ text: data.message, error: false });
        // If we deleted the active server, the context will auto-switch on refresh
        refreshServers();
        setTimeout(() => {
          setDeleteTarget(null);
          setMessage(null);
        }, 1500);
      } else {
        setMessage({ text: data.message, error: true });
      }
    } catch (err) {
      setMessage({ text: `Request failed: ${err}`, error: true });
    } finally {
      setDeleting(false);
    }
  };

  const openEdit = (server: { id: string; name: string; type: string }) => {
    // Pre-populate draft from the full server data
    const full = servers.find((s) => s.id === server.id);
    const fields = fieldsFor(server.type);
    const draft: Record<string, string | number> = {};
    for (const f of fields) {
      // Secrets are write-only: the API never returns them, so the input
      // starts blank and blank-on-save means "keep the existing value".
      if (f.type === "password") {
        draft[f.key] = "";
        continue;
      }
      const val = full?.[f.key as keyof typeof full];
      draft[f.key] = val !== undefined && val !== null ? val as string | number : "";
    }
    setEditDraft(draft);
    setEditTarget(server);
    setEditMessage(null);
  };

  const editSecretsSet = servers.find((s) => s.id === editTarget?.id)?.secretsSet ?? [];

  const handleSaveEdit = async () => {
    if (!editTarget) return;
    setSaving(true);
    setEditMessage(null);

    try {
      // Convert number fields from strings
      const fields = fieldsFor(editTarget.type);
      const updates: Record<string, unknown> = {};
      for (const f of fields) {
        const val = editDraft[f.key];
        if (f.type === "password" && val === "") continue;
        if (f.type === "number" && val !== "") {
          updates[f.key] = Number(val);
        } else {
          updates[f.key] = val;
        }
      }

      const res = await fetch("/api/servers", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ serverId: editTarget.id, updates }),
      });
      const data = await res.json();

      if (data.success) {
        setEditMessage({ text: data.message, error: false });
        refreshServers();
        setTimeout(() => {
          setEditTarget(null);
          setEditMessage(null);
        }, 1200);
      } else {
        setEditMessage({ text: data.message, error: true });
      }
    } catch (err) {
      setEditMessage({ text: `Request failed: ${err}`, error: true });
    } finally {
      setSaving(false);
    }
  };

  const cancelDelete = () => {
    if (showFileWarning) {
      // Go back to first confirmation
      setShowFileWarning(false);
      return;
    }
    setDeleteTarget(null);
  };

  return (
    <div className="space-y-6">
      {/* Message toast */}
      {message && !deleteTarget && (
        <div
          className={`px-4 py-3 rounded-lg text-[13px] font-medium border ${
            message.error
              ? "bg-red-500/10 text-red-400 border-red-500/20"
              : "bg-den-green/10 text-den-green border-den-green/20"
          }`}
        >
          {message.text}
        </div>
      )}

      {/* Add server button */}
      <div className="flex justify-end">
        <button
          onClick={openAdd}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold bg-den-accent-deep text-white border border-den-accent-fill hover:brightness-110 transition-all"
        >
          <Plus size={16} />
          Add Server
        </button>
      </div>

      {/* Server cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {servers.map((s) => {
          const game = gameMeta(s.type);
          const isActive = s.id === serverId;

          return (
            <div
              key={s.id}
              className={`bg-den-card border rounded-xl p-5 transition-all ${
                isActive
                  ? "border-den-cyan/30 shadow-sm shadow-den-cyan/8"
                  : "border-den-border hover:border-den-border-hover"
              }`}
            >
              {/* Header row */}
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2.5">
                  <div
                    className={`w-2.5 h-2.5 rounded-full ${statusMeta(s.status).dot}`}
                  />
                  <h3 className="text-[15px] font-bold text-den-text">{s.name}</h3>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={`text-[11px] font-semibold px-2 py-0.5 rounded-md border ${game.tag}`}
                  >
                    {game.label}
                  </span>
                </div>
              </div>

              {/* Details */}
              <div className="space-y-1.5 text-[12px] text-den-text-dim mb-4">
                <div className="flex items-center gap-1.5">
                  <span className="text-den-text-muted font-medium w-14">Status</span>
                  <span
                    className={
                      s.status === "running"
                        ? "text-den-green font-semibold"
                        : s.status === "stopped"
                        ? "text-den-red"
                        : "text-yellow-400"
                    }
                  >
                    {s.status.charAt(0).toUpperCase() + s.status.slice(1)}
                  </span>
                </div>
                {s.version && (
                  <div className="flex items-center gap-1.5">
                    <span className="text-den-text-muted font-medium w-14">Version</span>
                    <span>{s.version}</span>
                  </div>
                )}
                {s.loader && (
                  <div className="flex items-center gap-1.5">
                    <span className="text-den-text-muted font-medium w-14">Loader</span>
                    <span>{s.loader}</span>
                  </div>
                )}
                {s.gamePort && (
                  <div className="flex items-center gap-1.5">
                    <span className="text-den-text-muted font-medium w-14">Port</span>
                    <span className="font-mono">{s.gamePort}</span>
                  </div>
                )}
                <div className="flex items-center gap-1.5">
                  <span className="text-den-text-muted font-medium w-14">ID</span>
                  <span className="font-mono opacity-60">{s.id}</span>
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center justify-between pt-3 border-t border-den-border">
                <button
                  onClick={() => setServerId(s.id)}
                  className={`text-[12px] font-medium px-3 py-1.5 rounded-md transition-colors ${
                    isActive
                      ? "text-den-cyan bg-den-cyan-glow cursor-default"
                      : "text-den-text-muted hover:text-den-text hover:bg-den-surface"
                  }`}
                >
                  {isActive ? "Active" : "Switch to"}
                </button>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => openEdit({ id: s.id, name: s.name, type: s.type })}
                    className="text-den-text-dim hover:text-den-cyan transition-colors p-1.5 rounded-md hover:bg-den-cyan-glow"
                    title="Edit settings"
                  >
                    <Pencil size={16} />
                  </button>
                  <button
                    onClick={() =>
                      openDelete({
                        id: s.id,
                        name: s.name,
                        type: s.type,
                        status: s.status,
                      })
                    }
                    className="text-den-text-dim hover:text-red-400 transition-colors p-1.5 rounded-md hover:bg-red-500/10"
                    title="Delete server"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {servers.length === 0 && (
        <div className="text-center py-16 text-den-text-dim text-[14px]">
          No servers configured. Click &quot;Add Server&quot; above to get started.
        </div>
      )}

      {/* Delete confirmation modal — Step 1 */}
      <ConfirmModal
        open={!!deleteTarget && !showFileWarning}
        title="Remove Server"
        confirmLabel="Remove Server"
        confirmDestructive
        onConfirm={handleDelete}
        onCancel={cancelDelete}
        loading={deleting}
      >
        {deleteTarget && (
          <div className="space-y-3">
            <p>
              Remove <strong className="text-den-text">{deleteTarget.name}</strong> from
              the dashboard?
            </p>
            {deleteTarget.status === "running" && (
              <div className="px-3 py-2 rounded-lg bg-yellow-500/10 text-yellow-400 border border-yellow-500/20 text-[12px]">
                This server is currently running. It will be stopped before removal.
              </div>
            )}
            <label className="flex items-start gap-2.5 pt-2 cursor-pointer group">
              <input
                type="checkbox"
                checked={deleteFiles}
                onChange={(e) => setDeleteFiles(e.target.checked)}
                className="mt-0.5 accent-red-500"
              />
              <span className="text-[12px] leading-relaxed">
                <span className="text-den-text font-medium">Also delete server files from disk</span>
                <br />
                <span className="text-den-text-dim">
                  Removes the entire server directory permanently
                </span>
              </span>
            </label>
            {message && (
              <div
                className={`px-3 py-2 rounded-lg text-[12px] border ${
                  message.error
                    ? "bg-red-500/10 text-red-400 border-red-500/20"
                    : "bg-den-green/10 text-den-green border-den-green/20"
                }`}
              >
                {message.text}
              </div>
            )}
          </div>
        )}
      </ConfirmModal>

      {/* Delete confirmation modal — Step 2: file deletion warning */}
      <ConfirmModal
        open={showFileWarning}
        title="Delete Server Files?"
        confirmLabel="Yes, Delete Everything"
        confirmDestructive
        onConfirm={handleDelete}
        onCancel={cancelDelete}
        loading={deleting}
      >
        {deleteTarget && (
          <div className="space-y-3">
            <div className="px-3 py-2 rounded-lg bg-red-500/10 text-red-400 border border-red-500/20 text-[12px] font-semibold">
              This cannot be undone!
            </div>
            <p>
              You are about to permanently delete all server files for{" "}
              <strong className="text-den-text">{deleteTarget.name}</strong>.
            </p>
            <p className="text-[12px]">
              This includes the world, configs, mods, and everything else in the server
              directory. Make sure you have backups if you need them.
            </p>
            {message && (
              <div
                className={`px-3 py-2 rounded-lg text-[12px] border ${
                  message.error
                    ? "bg-red-500/10 text-red-400 border-red-500/20"
                    : "bg-den-green/10 text-den-green border-den-green/20"
                }`}
              >
                {message.text}
              </div>
            )}
          </div>
        )}
      </ConfirmModal>

      {/* Add server modal */}
      <ConfirmModal
        open={showAdd}
        title="Add Server"
        confirmLabel="Add Server"
        onConfirm={handleSaveAdd}
        onCancel={() => { setShowAdd(false); setAddMessage(null); }}
        loading={addSaving}
      >
        <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
          <GamePicker
            value={addType}
            onChange={(type) => {
              // Keep the name and folder; autofill re-detects the rest for the new game.
              setAddType(type);
              setAddDraft((prev) => ({ name: prev.name ?? "", dir: prev.dir ?? "" }));
              autofill.reset(type);
            }}
          />

          <div className="text-[10px] font-bold text-den-text-dim tracking-widest pt-2 pb-1">
            CONNECTION
          </div>
          {fieldsFor(addType).map((field) => {
            const autoLabel = autofill.autoLabel(field.key);
            const advice = autofill.portAdvice(field.key);
            const secretIn = field.type === "password" ? autofill.secretFoundIn(field.key) : null;
            const configWas = autofill.configPortMismatch(field.key);
            return (
            <div key={field.key}>
              <label className="flex items-center gap-1.5 text-[11px] text-den-text-muted font-medium mb-1">
                {field.label}
                {autoLabel && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-den-accent" title={`Auto-filled ${autoLabel}`}>
                    <Sparkles size={10} aria-hidden /> auto
                  </span>
                )}
              </label>
              <div className={field.key === "dir" ? "flex gap-2" : ""}>
                <input
                  type={field.type === "password" ? "password" : field.type === "number" ? "number" : "text"}
                  value={addDraft[field.key] ?? ""}
                  placeholder={secretIn ? `Found in ${secretIn}. Leave blank to use it.` : defaultPlaceholder(addType, field)}
                  onChange={(e) => {
                    autofill.markEdited(field.key);
                    setAddDraft((prev) => ({ ...prev, [field.key]: e.target.value }));
                  }}
                  onBlur={(PORT_FIELDS as readonly string[]).includes(field.key) ? autofill.recheckPorts : undefined}
                  className="w-full bg-den-base border border-den-border rounded-lg px-3 py-2 text-[13px] text-den-text font-mono focus:outline-none focus:border-den-cyan/50 transition-colors placeholder:font-sans placeholder:text-den-text-dim"
                />
                {field.key === "dir" && (
                  <button
                    type="button"
                    onClick={() => browseFolder(setAddDraft)}
                    disabled={browsing}
                    className="flex items-center gap-1.5 px-3 py-2 bg-den-surface border border-den-border rounded-lg text-[12px] text-den-text-muted hover:text-den-text hover:border-den-border-hover transition-colors whitespace-nowrap disabled:opacity-50"
                    title="Browse for folder"
                  >
                    <FolderOpen size={14} />
                    Browse
                  </button>
                )}
              </div>
              {advice && advice.status === "conflict" ? (
                <div className="mt-1 flex items-center gap-2 flex-wrap text-[11px] text-den-amber">
                  <TriangleAlert size={12} aria-hidden />
                  <span>{advice.reason}.</span>
                  {advice.suggestion && (
                    <button
                      type="button"
                      onClick={() => autofill.useSuggestion(field.key as (typeof PORT_FIELDS)[number])}
                      className="btn btn-sm !h-6 !px-2 !text-[11px]"
                    >
                      Use {advice.suggestion}
                    </button>
                  )}
                </div>
              ) : advice && advice.status === "adjusted" && autoLabel ? (
                <div className="text-[11px] text-den-text-dim mt-1">{advice.reason}. This one is free.</div>
              ) : configWas ? (
                <div className="text-[11px] text-den-text-dim mt-1">
                  {autofill.configFile?.split("/").pop()} says {configWas}.
                </div>
              ) : autoLabel ? (
                <div className="text-[11px] text-den-text-dim mt-1">Auto-filled {autoLabel}.</div>
              ) : (
                fieldHint(addType, field) && <div className="text-[11px] text-den-text-dim mt-1">{fieldHint(addType, field)}</div>
              )}
              {field.key === "dir" && (autofill.detecting || autofill.dirError || autofill.notes.length > 0) && (
                <div className="mt-2 space-y-1 text-[11.5px]">
                  {autofill.detecting && (
                    <div className="flex items-center gap-1.5 text-den-text-dim">
                      <Loader size={12} className="animate-spin" aria-hidden /> Checking the folder and free ports…
                    </div>
                  )}
                  {autofill.dirError && <div className="text-den-red">{autofill.dirError}</div>}
                  {autofill.notes.map((n) => (
                    <div key={n} className="flex items-start gap-1.5 text-den-text-muted">
                      <Info size={12} className="mt-0.5 shrink-0" aria-hidden /> {n}
                    </div>
                  ))}
                </div>
              )}
            </div>
            );
          })}
          {autofill.configPortChanged && (
            <label className="flex items-start gap-2 text-[12px] cursor-pointer rounded-lg border border-den-border bg-den-surface/60 px-3 py-2">
              <input
                type="checkbox"
                className="mt-0.5 accent-[var(--accent)]"
                checked={autofill.syncPorts}
                onChange={(e) => autofill.setSyncPorts(e.target.checked)}
              />
              <span>
                Also change the port in <code className="font-mono">{autofill.configFile?.split("/").pop()}</code> to match
                <span className="block text-den-text-dim text-[11px]">
                  The game reads its port from there. A backup is kept as <code className="font-mono">.bak</code>.
                </span>
              </span>
            </label>
          )}
          {addMessage && (
            <div
              className={`px-3 py-2 rounded-lg text-[12px] border ${
                addMessage.error
                  ? "bg-red-500/10 text-red-400 border-red-500/20"
                  : "bg-den-green/10 text-den-green border-den-green/20"
              }`}
            >
              {addMessage.text}
            </div>
          )}
        </div>
      </ConfirmModal>

      {/* Edit server settings modal */}
      <ConfirmModal
        open={!!editTarget}
        title={`${editTarget?.name ?? "Server"} Settings`}
        confirmLabel="Save Changes"
        onConfirm={handleSaveEdit}
        onCancel={() => { setEditTarget(null); setEditMessage(null); }}
        loading={saving}
      >
        {editTarget && (
          <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
            <div className="text-[10px] font-bold text-den-text-dim tracking-widest pb-1">
              CONNECTION
            </div>
            {fieldsFor(editTarget.type).map((field) => (
              <div key={field.key}>
                <label className="block text-[11px] text-den-text-muted font-medium mb-1">
                  {field.label}
                </label>
                <div className={field.key === "dir" ? "flex gap-2" : ""}>
                  <input
                    type={field.type === "password" ? "password" : field.type === "number" ? "number" : "text"}
                    value={editDraft[field.key] ?? ""}
                    placeholder={
                      field.type === "password"
                        ? editSecretsSet.includes(field.key)
                          ? "Saved — leave blank to keep"
                          : "Not set"
                        : undefined
                    }
                    autoComplete={field.type === "password" ? "new-password" : undefined}
                    onChange={(e) =>
                      setEditDraft((prev) => ({ ...prev, [field.key]: e.target.value }))
                    }
                    className="w-full bg-den-base border border-den-border rounded-lg px-3 py-2 text-[13px] text-den-text font-mono focus:outline-none focus:border-den-cyan/50 transition-colors"
                  />
                  {field.key === "dir" && (
                    <button
                      type="button"
                      onClick={() => browseFolder(setEditDraft)}
                      disabled={browsing}
                      className="flex items-center gap-1.5 px-3 py-2 bg-den-surface border border-den-border rounded-lg text-[12px] text-den-text-muted hover:text-den-text hover:border-den-border-hover transition-colors whitespace-nowrap disabled:opacity-50"
                      title="Browse for folder"
                    >
                      <FolderOpen size={14} />
                      Browse
                    </button>
                  )}
                </div>
                {fieldHint(editTarget.type, field) && <div className="text-[11px] text-den-text-dim mt-1">{fieldHint(editTarget.type, field)}</div>}
              </div>
            ))}
            {editMessage && (
              <div
                className={`px-3 py-2 rounded-lg text-[12px] border ${
                  editMessage.error
                    ? "bg-red-500/10 text-red-400 border-red-500/20"
                    : "bg-den-green/10 text-den-green border-den-green/20"
                }`}
              >
                {editMessage.text}
              </div>
            )}
          </div>
        )}
      </ConfirmModal>
    </div>
  );
}
