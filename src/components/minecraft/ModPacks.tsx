"use client";

import { useServer } from "@/contexts/ServerContext";
import { Boxes, Plus, Trash2, Save, RefreshCcw } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

interface ModPack {
  id: string;
  name: string;
  description?: string;
  mods: string[];
}

export default function ModPacks() {
  const { currentServer } = useServer();
  const [packs, setPacks] = useState<ModPack[]>([]);
  const [libraryMods, setLibraryMods] = useState<string[]>([]);
  const [activePackId, setActivePackId] = useState("");
  const [selectedId, setSelectedId] = useState<string>("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [selectedMods, setSelectedMods] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");
  const [filter, setFilter] = useState("");

  const loadData = useCallback(async () => {
    if (!currentServer) return;
    try {
      const res = await fetch(`/api/modpacks?server=${currentServer.id}`);
      if (!res.ok) {
        setPacks([]);
        setLibraryMods([]);
        return;
      }
      const data = await res.json();
      setPacks((data.packs as ModPack[]) || []);
      setLibraryMods((data.libraryMods as string[]) || []);
      setActivePackId((data.activePackId as string) || "");
    } catch {
      setPacks([]);
      setLibraryMods([]);
      setActivePackId("");
    }
  }, [currentServer]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const filteredLibrary = useMemo(() => {
    if (!filter.trim()) return libraryMods;
    const lower = filter.trim().toLowerCase();
    return libraryMods.filter((m) => m.toLowerCase().includes(lower));
  }, [libraryMods, filter]);

  const selectPack = (pack: ModPack | null) => {
    if (!pack) {
      setSelectedId("");
      setName("");
      setDescription("");
      setSelectedMods(new Set());
      return;
    }
    setSelectedId(pack.id);
    setName(pack.name);
    setDescription(pack.description || "");
    setSelectedMods(new Set(pack.mods || []));
  };

  const toggleMod = (modName: string) => {
    setSelectedMods((prev) => {
      const next = new Set(prev);
      if (next.has(modName)) {
        next.delete(modName);
      } else {
        next.add(modName);
      }
      return next;
    });
  };

  const savePack = async () => {
    if (!currentServer) return;
    if (!name.trim()) {
      setMessage("Pack name is required.");
      return;
    }
    setSaving(true);
    setMessage("");
    try {
      const res = await fetch(`/api/modpacks?server=${currentServer.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: selectedId || undefined,
          name: name.trim(),
          description: description.trim(),
          mods: Array.from(selectedMods),
        }),
      });
      const data = await res.json();
      if (data.success) {
        setMessage("Mod pack saved.");
        await loadData();
        const saved = data.pack as ModPack;
        if (saved) selectPack(saved);
      } else {
        setMessage(data.message || data.error || "Save failed.");
      }
    } catch {
      setMessage("Save failed.");
    } finally {
      setSaving(false);
    }
  };

  const deletePack = async (packId: string) => {
    if (!currentServer) return;
    if (!confirm("Delete this mod pack?")) return;
    setSaving(true);
    setMessage("");
    try {
      const res = await fetch(`/api/modpacks?server=${currentServer.id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: packId }),
      });
      const data = await res.json();
      if (data.success) {
        setMessage("Mod pack deleted.");
        if (selectedId === packId) {
          selectPack(null);
        }
        loadData();
      } else {
        setMessage(data.message || data.error || "Delete failed.");
      }
    } catch {
      setMessage("Delete failed.");
    } finally {
      setSaving(false);
    }
  };

  const uploadToLibrary = async (files: FileList | null) => {
    if (!currentServer || !files || files.length === 0) return;
    setUploading(true);
    setMessage("");
    try {
      const formData = new FormData();
      Array.from(files).forEach((file) => formData.append("files", file));
      const res = await fetch(`/api/mods-library?server=${currentServer.id}`, {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (data.success) {
        setMessage(`Uploaded ${data.files.length} mod${data.files.length === 1 ? "" : "s"} to library.`);
        loadData();
      } else {
        setMessage(data.message || data.error || "Upload failed.");
      }
    } catch {
      setMessage("Upload failed.");
    } finally {
      setUploading(false);
    }
  };

  const activatePack = async () => {
    if (!currentServer || !selectedId) return;
    if (!confirm("Activate this pack? This will replace the current mods folder.")) return;
    setSaving(true);
    setMessage("");
    try {
      const res = await fetch(`/api/modpacks?server=${currentServer.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "activate", id: selectedId }),
      });
      const data = await res.json();
      if (data.success) {
        setActivePackId(selectedId);
        const missing = (data.missing as string[]) || [];
        if (missing.length > 0) {
          setMessage(`Activated with missing mods: ${missing.join(", ")}`);
        } else {
          setMessage("Pack activated. Restart server for changes to take effect.");
        }
      } else {
        setMessage(data.message || data.error || "Activation failed.");
      }
    } catch {
      setMessage("Activation failed.");
    } finally {
      setSaving(false);
    }
  };

  if (currentServer?.type !== "minecraft") {
    return null;
  }

  return (
    <div className="space-y-4">
      <div className="bg-gradient-to-br from-den-card to-den-surface border border-den-border rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-den-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Boxes size={16} className="text-den-purple" />
            <h3 className="text-sm font-bold">Mod Packs</h3>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => selectPack(null)}
              className="px-3 py-1 text-xs font-semibold text-den-text-muted border border-den-border rounded-lg hover:bg-den-surface transition-colors inline-flex items-center gap-2"
            >
              <Plus size={12} />
              New Pack
            </button>
            <button
              onClick={loadData}
              className="px-3 py-1 text-xs font-semibold text-den-text-muted border border-den-border rounded-lg hover:bg-den-surface transition-colors inline-flex items-center gap-2"
            >
              <RefreshCcw size={12} />
              Refresh
            </button>
          </div>
        </div>

        <div className="p-5 grid grid-cols-1 xl:grid-cols-[280px_1fr] gap-4">
          <div className="space-y-3">
            {packs.length === 0 ? (
              <div className="text-[13px] text-den-text-dim">
                No mod packs yet. Create one on the right.
              </div>
            ) : (
              packs.map((pack) => (
                <button
                  key={pack.id}
                  onClick={() => selectPack(pack)}
                  className={`w-full text-left p-3 rounded-lg border transition-colors ${
                    selectedId === pack.id
                      ? "border-den-cyan bg-den-elevated"
                      : "border-den-border bg-den-surface hover:border-den-border-light"
                  }`}
                >
                  <div className="text-[13px] font-semibold">{pack.name}</div>
                  <div className="text-[11px] text-den-text-dim">
                    {pack.mods?.length || 0} mods
                  </div>
                  {activePackId === pack.id && (
                    <div className="mt-2 inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold bg-den-green-glow/20 text-den-green border border-den-green/30">
                      ACTIVE
                    </div>
                  )}
                </button>
              ))
            )}
          </div>

          <div className="bg-den-surface/30 border border-den-border rounded-xl p-4 space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              <div className="flex flex-col gap-2">
                <label className="text-[12px] text-den-text-dim">Pack Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3 py-2 bg-den-bg text-den-text text-[13px] rounded-lg border border-den-border focus:border-den-border-light outline-none"
                />
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-[12px] text-den-text-dim">Description</label>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full px-3 py-2 bg-den-bg text-den-text text-[13px] rounded-lg border border-den-border focus:border-den-border-light outline-none"
                />
              </div>
            </div>

            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="text-[12px] text-den-text-dim">
                {selectedMods.size} selected
              </div>
              {selectedId && (
                <button
                  onClick={() => deletePack(selectedId)}
                  className="px-3 py-1 text-xs font-semibold text-den-text-muted border border-den-border rounded-lg hover:bg-den-surface transition-colors inline-flex items-center gap-2"
                >
                  <Trash2 size={12} />
                  Delete Pack
                </button>
              )}
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-[12px] text-den-text-dim">Search Mods</label>
              <input
                type="text"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Filter mods..."
                className="w-full px-3 py-2 bg-den-bg text-den-text text-[13px] rounded-lg border border-den-border focus:border-den-border-light outline-none"
              />
            </div>

            {filteredLibrary.length === 0 ? (
              <div className="text-[13px] text-den-text-dim">
                No mods found in mods-library.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-[360px] overflow-y-auto pr-1">
                {filteredLibrary.map((mod) => (
                  <label
                    key={mod}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-[12px] cursor-pointer transition-colors ${
                      selectedMods.has(mod)
                        ? "border-den-cyan bg-den-elevated text-den-text"
                        : "border-den-border bg-den-surface text-den-text-dim hover:border-den-border-light"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={selectedMods.has(mod)}
                      onChange={() => toggleMod(mod)}
                      className="accent-den-cyan"
                    />
                    <span className="truncate">{mod}</span>
                  </label>
                ))}
              </div>
            )}

            {selectedMods.size > 0 && (
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="text-[12px] text-den-text-dim">
                  Selected: {selectedMods.size} mods
                </div>
                <button
                  onClick={() => setSelectedMods(new Set())}
                  className="px-2.5 py-1 text-[11px] font-semibold text-den-text-muted border border-den-border rounded-md hover:bg-den-surface transition-colors"
                >
                  Clear Selection
                </button>
              </div>
            )}

            <div className="flex items-center justify-between gap-3 flex-wrap border-t border-den-border pt-3">
              <label className="inline-flex items-center gap-2 px-3 py-2 bg-den-surface rounded-lg border border-den-border hover:border-den-border-light transition-colors text-[12px] font-semibold cursor-pointer">
                {uploading ? "Uploading..." : "Upload to Library"}
                <input
                  type="file"
                  multiple
                  accept=".jar"
                  onChange={(e) => uploadToLibrary(e.target.files)}
                  className="hidden"
                  disabled={uploading}
                />
              </label>
              <span className="text-[11px] text-den-text-dim">
                Upload .jar mods directly to mods-library.
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={savePack}
                disabled={saving}
                className="px-3 py-2 text-xs font-semibold bg-gradient-to-r from-den-cyan to-[#29b6f6] text-den-bg rounded-lg disabled:opacity-40 hover:brightness-110 transition-all inline-flex items-center gap-2"
              >
                <Save size={12} />
                {saving ? "Saving..." : "Save Pack"}
              </button>
              <button
                onClick={activatePack}
                disabled={saving || !selectedId}
                className="px-3 py-2 text-xs font-semibold text-den-text-muted border border-den-border rounded-lg hover:bg-den-surface transition-colors disabled:opacity-40"
              >
                Activate Pack
              </button>
              <div className="text-[11px] text-den-text-dim">
                Packs saved to modpacks.json in the server directory.
              </div>
            </div>
          </div>
        </div>
      </div>

      {message && (
        <div className="px-4 py-3 rounded-lg text-sm font-medium bg-den-cyan-dim/20 text-den-cyan border border-den-cyan/30">
          {message}
        </div>
      )}
    </div>
  );
}
