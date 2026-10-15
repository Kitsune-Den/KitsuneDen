"use client";

import { useServer } from "@/contexts/ServerContext";
import { useState, useEffect, useCallback } from "react";
import { Download, RefreshCw, AlertTriangle } from "lucide-react";
import { gameMeta } from "@/lib/game-meta";

interface UpdateInfo {
  serverVersion: string;
  steamAppId: number;
  steamCmdConfigured: boolean;
  /** The Steam branch the install is on, when the game reports it. */
  branch?: string;
}

/** Where each SteamCMD game's update API lives. */
const ENDPOINTS: Record<string, string> = {
  palworld: "/api/palworld-update",
  enshrouded: "/api/enshrouded-update",
  "7d2d": "/api/7d2d-update",
  valheim: "/api/valheim-update",
  vrising: "/api/vrising-update",
  projectzomboid: "/api/projectzomboid-update",
};

/**
 * The Update tab for games the Den updates with SteamCMD. One component for
 * every such game; each has its own update route behind it.
 */
export default function SteamUpdateManager() {
  const { serverId, currentServer } = useServer();
  const type = currentServer?.type ?? "";
  const endpoint = ENDPOINTS[type];
  const label = gameMeta(type).label;
  const [info, setInfo] = useState<UpdateInfo | null>(null);
  const [updating, setUpdating] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<"info" | "success" | "error">("info");

  const loadInfo = useCallback(async () => {
    if (!endpoint) return;
    try {
      const res = await fetch(`${endpoint}?server=${serverId}`);
      if (res.ok) {
        setInfo(await res.json());
      }
    } catch {
      // ignore
    }
  }, [endpoint, serverId]);

  useEffect(() => {
    loadInfo();
  }, [loadInfo]);

  const runUpdate = async () => {
    if (currentServer?.status === "running") {
      setMessage("Stop the server before updating.");
      setMessageType("error");
      return;
    }

    setUpdating(true);
    setMessage("Running SteamCMD update... This can take several minutes for a large download.");
    setMessageType("info");

    try {
      const res = await fetch(`${endpoint}?server=${serverId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json();
      if (data.success) {
        const detail = typeof data.message === "string" && data.message !== "Update complete" ? ` ${data.message}` : "";
        setMessage(`Update completed successfully!${detail} You can now start the server.`);
        setMessageType("success");
        loadInfo();
      } else {
        setMessage(`Update failed: ${data.message}`);
        setMessageType("error");
      }
    } catch (e) {
      setMessage(`Update error: ${e instanceof Error ? e.message : "Unknown error"}`);
      setMessageType("error");
    } finally {
      setUpdating(false);
    }
  };

  if (!endpoint) return null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-den-text">Server Update</h2>
          <p className="text-sm text-den-text-muted mt-1">
            Update the {label} dedicated server via SteamCMD
          </p>
        </div>
        <button
          onClick={loadInfo}
          className="flex items-center gap-2 px-3 py-2 text-sm rounded-lg bg-den-surface border border-den-border text-den-text-muted hover:text-den-text hover:bg-den-surface/80 transition-colors"
        >
          <RefreshCw size={14} />
          Refresh
        </button>
      </div>

      <div className="bg-den-card border border-den-border rounded-xl p-5">
        <h3 className="text-sm font-semibold text-den-text-muted mb-4">Current Version</h3>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-den-text-dim">Server Version</span>
            <p className="text-den-text font-mono mt-1">{info?.serverVersion || "Unknown"}</p>
          </div>
          <div>
            <span className="text-den-text-dim">Steam App ID</span>
            <p className="text-den-text font-mono mt-1">{info?.steamAppId ?? "--"}</p>
          </div>
          {info?.branch && (
            <div>
              <span className="text-den-text-dim">Branch</span>
              <p className="text-den-text font-mono mt-1">{info.branch}</p>
              <p className="text-[11.5px] text-den-text-dim mt-0.5">Updates stay on this branch.</p>
            </div>
          )}
          <div>
            <span className="text-den-text-dim">SteamCMD</span>
            <p className={`mt-1 font-medium ${info?.steamCmdConfigured ? "text-den-green" : "text-den-red"}`}>
              {info?.steamCmdConfigured ? "Configured" : "Not configured"}
            </p>
          </div>
          <div>
            <span className="text-den-text-dim">Server Status</span>
            <p className={`mt-1 font-medium ${currentServer?.status === "running" ? "text-den-green" : "text-den-text-muted"}`}>
              {currentServer?.status || "Unknown"}
            </p>
          </div>
        </div>
      </div>

      <div className="bg-den-card border border-den-border rounded-xl p-5">
        <h3 className="text-sm font-semibold text-den-text-muted mb-4">Update Server</h3>

        {currentServer?.status === "running" && (
          <div className="flex items-center gap-2 mb-4 p-3 rounded-lg bg-den-amber/10 border border-den-amber/30 text-den-amber text-sm">
            <AlertTriangle size={16} />
            Server must be stopped before updating.
          </div>
        )}

        {info && !info.steamCmdConfigured && (
          <p className="mb-4 text-sm text-den-text-muted">Set the SteamCMD path in Server setup to enable updates.</p>
        )}

        <button
          onClick={runUpdate}
          disabled={updating || currentServer?.status === "running" || !info?.steamCmdConfigured}
          className="flex items-center gap-2 px-4 py-2.5 rounded-lg font-medium text-sm transition-all bg-gradient-to-r from-den-cyan/20 to-den-purple/20 border border-den-cyan/30 text-den-cyan hover:border-den-cyan/60 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {updating ? <RefreshCw size={16} className="animate-spin" /> : <Download size={16} />}
          {updating ? "Updating..." : "Update via SteamCMD"}
        </button>

        {message && (
          <div
            className={`mt-4 p-3 rounded-lg text-sm ${
              messageType === "success"
                ? "bg-den-green/10 border border-den-green/30 text-den-green"
                : messageType === "error"
                ? "bg-den-red/10 border border-den-red/30 text-den-red"
                : "bg-den-cyan/10 border border-den-cyan/30 text-den-cyan"
            }`}
          >
            {message}
          </div>
        )}
      </div>
    </div>
  );
}
