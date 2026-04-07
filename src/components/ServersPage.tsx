"use client";

import { useState } from "react";
import { useServer } from "@/contexts/ServerContext";
import { Trash2, Pencil } from "lucide-react";
import ConfirmModal from "./ConfirmModal";

const STATUS_DOT: Record<string, string> = {
  stopped: "bg-den-red",
  starting: "bg-yellow-500 animate-pulse",
  running: "bg-den-green",
  stopping: "bg-yellow-500 animate-pulse",
};

const TYPE_PILL: Record<string, { label: string; color: string }> = {
  minecraft: { label: "Minecraft", color: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" },
  "7d2d": { label: "7 Days to Die", color: "bg-red-500/20 text-red-400 border-red-500/30" },
  hytale: { label: "Hytale", color: "bg-amber-500/20 text-amber-400 border-amber-500/30" },
  palworld: { label: "Palworld", color: "bg-blue-500/20 text-blue-400 border-blue-500/30" },
};

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
}

const SHARED_FIELDS: FieldDef[] = [
  { key: "name", label: "Server Name", type: "text" },
  { key: "dir", label: "Install Directory", type: "text" },
  { key: "gamePort", label: "Game Port", type: "number" },
];

const TYPE_FIELDS: Record<string, FieldDef[]> = {
  "7d2d": [
    { key: "telnetPort", label: "Telnet Port", type: "number" },
    { key: "telnetPassword", label: "Telnet Password", type: "password" },
    { key: "configFile", label: "Config File", type: "text" },
    { key: "modsDir", label: "Mods Directory", type: "text" },
  ],
  minecraft: [
    { key: "rconPort", label: "RCON Port", type: "number" },
    { key: "rconPassword", label: "RCON Password", type: "password" },
    { key: "javaPath", label: "Java Path", type: "text" },
    { key: "loader", label: "Loader", type: "text" },
    { key: "version", label: "Version", type: "text" },
  ],
  hytale: [
    { key: "startScript", label: "Start Script", type: "text" },
    { key: "backupScript", label: "Backup Script", type: "text" },
    { key: "processFilter", label: "Process Filter", type: "text" },
  ],
  palworld: [
    { key: "rconPort", label: "RCON Port", type: "number" },
    { key: "rconPassword", label: "RCON Password", type: "password" },
    { key: "steamCmdPath", label: "SteamCMD Path", type: "text" },
    { key: "restApiPort", label: "REST API Port", type: "number" },
    { key: "restApiPassword", label: "REST API Password", type: "password" },
  ],
};

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
    const fields = [...SHARED_FIELDS, ...(TYPE_FIELDS[server.type] || [])];
    const draft: Record<string, string | number> = {};
    for (const f of fields) {
      const val = full?.[f.key as keyof typeof full];
      draft[f.key] = val !== undefined && val !== null ? val as string | number : "";
    }
    setEditDraft(draft);
    setEditTarget(server);
    setEditMessage(null);
  };

  const handleSaveEdit = async () => {
    if (!editTarget) return;
    setSaving(true);
    setEditMessage(null);

    try {
      // Convert number fields from strings
      const fields = [...SHARED_FIELDS, ...(TYPE_FIELDS[editTarget.type] || [])];
      const updates: Record<string, unknown> = {};
      for (const f of fields) {
        const val = editDraft[f.key];
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

      {/* Server cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {servers.map((s) => {
          const pill = TYPE_PILL[s.type] || {
            label: s.type,
            color: "bg-gray-500/20 text-gray-400 border-gray-500/30",
          };
          const isActive = s.id === serverId;

          return (
            <div
              key={s.id}
              className={`bg-den-card border rounded-xl p-5 transition-all ${
                isActive
                  ? "border-[rgba(79,195,247,0.3)] shadow-sm shadow-[rgba(79,195,247,0.08)]"
                  : "border-den-border hover:border-den-border-hover"
              }`}
            >
              {/* Header row */}
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2.5">
                  <div
                    className={`w-2.5 h-2.5 rounded-full ${STATUS_DOT[s.status] || "bg-gray-500"}`}
                  />
                  <h3 className="text-[15px] font-bold text-den-text">{s.name}</h3>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={`text-[11px] font-semibold px-2 py-0.5 rounded border ${pill.color}`}
                  >
                    {pill.label}
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
          No servers configured. Add servers to <code className="text-den-text-muted">servers.json</code> to get started.
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
            {[...SHARED_FIELDS, ...(TYPE_FIELDS[editTarget.type] || [])].map((field) => (
              <div key={field.key}>
                <label className="block text-[11px] text-den-text-muted font-medium mb-1">
                  {field.label}
                </label>
                <input
                  type={field.type === "password" ? "password" : field.type === "number" ? "number" : "text"}
                  value={editDraft[field.key] ?? ""}
                  onChange={(e) =>
                    setEditDraft((prev) => ({ ...prev, [field.key]: e.target.value }))
                  }
                  className="w-full bg-den-base border border-den-border rounded-lg px-3 py-2 text-[13px] text-den-text font-mono focus:outline-none focus:border-[rgba(79,195,247,0.5)] transition-colors"
                />
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
