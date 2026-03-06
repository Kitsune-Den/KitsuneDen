"use client";

import { useServer } from "@/contexts/ServerContext";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Upload, Package, RefreshCcw } from "lucide-react";

interface ModFile {
  name: string;
  sizeBytes: number;
  isDir?: boolean;
  displayName?: string;
  version?: string;
  author?: string;
}

function formatBytes(bytes: number): string {
  if (!bytes) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

export default function ModsPage() {
  const { serverId, currentServer } = useServer();
  const [mods, setMods] = useState<ModFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [removing, setRemoving] = useState("");
  const [libraryAction, setLibraryAction] = useState("");
  const [message, setMessage] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const acceptTypes = useMemo(() => {
    if (currentServer?.type === "minecraft") {
      return ".jar";
    }
    if (currentServer?.type === "hytale") {
      return ".jar";
    }
    if (currentServer?.type === "7d2d") {
      return ".zip";
    }
    return "";
  }, [currentServer?.type]);

  const loadMods = useCallback(async () => {
    if (!serverId) return;
    setRefreshing(true);
    try {
      const res = await fetch(`/api/mods?server=${serverId}`);
      if (!res.ok) {
        setMods([]);
        return;
      }
      const data = await res.json();
      setMods((data.files as ModFile[]) || []);
    } catch {
      setMods([]);
    } finally {
      setRefreshing(false);
    }
  }, [serverId]);

  useEffect(() => {
    loadMods();
  }, [loadMods]);

  const handleUpload = async (files: FileList | null) => {
    if (!files || files.length === 0 || !serverId) return;
    setUploading(true);
    setMessage("");
    try {
      const formData = new FormData();
      Array.from(files).forEach((file) => formData.append("files", file));
      const res = await fetch(`/api/mods?server=${serverId}`, {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (data.success) {
        setMessage(`Uploaded ${data.files.length} mod${data.files.length === 1 ? "" : "s"}.`);
        loadMods();
      } else {
        setMessage(`Upload failed: ${data.message || data.error}`);
      }
    } catch {
      setMessage("Upload failed. Try again.");
    } finally {
      setUploading(false);
    }
  };

  const handleRemove = async (name: string) => {
    if (!serverId) return;
    setRemoving(name);
    setMessage("");
    try {
      const res = await fetch(`/api/mods?server=${serverId}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (data.success) {
        setMessage(`Removed ${name}.`);
        loadMods();
      } else {
        setMessage(`Remove failed: ${data.message || data.error}`);
      }
    } catch {
      setMessage("Remove failed. Try again.");
    } finally {
      setRemoving("");
    }
  };

  const handleAddToLibrary = async (name: string) => {
    if (!serverId) return;
    setLibraryAction(name);
    setMessage("");
    try {
      const res = await fetch(`/api/mods-library?server=${serverId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "add-from-mods", name }),
      });
      const data = await res.json();
      if (data.success) {
        setMessage(`Added ${name} to mods-library.`);
      } else {
        setMessage(`Library add failed: ${data.message || data.error}`);
      }
    } catch {
      setMessage("Library add failed. Try again.");
    } finally {
      setLibraryAction("");
    }
  };

  if (!currentServer?.capabilities.hasMods) {
    return (
      <div className="bg-gradient-to-br from-den-card to-den-surface border border-den-border rounded-xl p-6 text-den-text-dim">
        Mods are not available for this server.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="bg-gradient-to-br from-den-card to-den-surface border border-den-border rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-den-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Package size={16} className="text-den-cyan" />
            <h3 className="text-sm font-bold">Mods</h3>
          </div>
          <button
            onClick={loadMods}
            disabled={refreshing}
            className="px-3 py-1 text-xs font-semibold text-den-text-muted border border-den-border rounded-lg hover:bg-den-surface disabled:opacity-40 transition-colors inline-flex items-center gap-2"
          >
            <RefreshCcw size={12} />
            Refresh
          </button>
        </div>
        <div className="p-5 space-y-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <label className="inline-flex items-center gap-2 px-3 py-2 bg-den-surface rounded-lg border border-den-border hover:border-den-border-light transition-colors text-[12px] font-semibold cursor-pointer">
              <Upload size={14} />
              {uploading ? "Uploading..." : "Upload Mods"}
              <input
                type="file"
                multiple
                accept={acceptTypes}
                onChange={(e) => handleUpload(e.target.files)}
                className="hidden"
                disabled={uploading}
              />
            </label>
            <div className="text-[12px] text-den-text-dim">
              {currentServer?.type === "minecraft"
                ? "Drop .jar files here and restart the server."
                : currentServer?.type === "7d2d"
                  ? "Upload .zip mod archives and restart the server."
                  : "Upload mod files and restart the server."}
            </div>
          </div>

          {mods.length === 0 ? (
            <div className="text-center py-8 text-den-text-dim text-[13px]">
              No mods found yet.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {mods.map((mod) => (
                <div
                  key={mod.name}
                  className="flex items-center justify-between gap-3 px-4 py-3 rounded-lg bg-den-surface border border-den-border"
                >
                  <div className="flex flex-col min-w-0">
                    <span className="text-[13px] font-semibold truncate">
                      {mod.displayName || mod.name}
                      {mod.isDir && (
                        <span className="ml-1.5 text-[10px] text-den-cyan font-normal">folder</span>
                      )}
                    </span>
                    <span className="text-[11px] text-den-text-dim">
                      {formatBytes(mod.sizeBytes)}
                      {mod.version && ` \u00b7 v${mod.version}`}
                      {mod.author && ` \u00b7 ${mod.author}`}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {currentServer?.type === "minecraft" && currentServer?.capabilities.hasModPacks && (
                      <button
                        onClick={() => handleAddToLibrary(mod.name)}
                        disabled={libraryAction === mod.name}
                        className="px-2.5 py-1 text-[11px] font-semibold text-den-text-muted border border-den-border rounded-md hover:bg-den-surface-hover disabled:opacity-40 transition-colors"
                      >
                        {libraryAction === mod.name ? "Adding..." : "Add to Library"}
                      </button>
                    )}
                    <button
                      onClick={() => handleRemove(mod.name)}
                      disabled={removing === mod.name}
                      className="px-2.5 py-1 text-[11px] font-semibold text-den-text-muted border border-den-border rounded-md hover:bg-den-surface-hover disabled:opacity-40 transition-colors"
                    >
                      {removing === mod.name ? "Removing..." : "Remove"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {message && (
        <div
          className={`px-4 py-3 rounded-lg text-sm font-medium ${
            message.includes("failed")
              ? "bg-den-red-dim/20 text-den-red border border-den-red/30"
              : "bg-den-green-dim/20 text-den-green border border-den-green/30"
          }`}
        >
          {message}
        </div>
      )}
    </div>
  );
}
