"use client";

import { useServer } from "@/contexts/ServerContext";
import { useState, useEffect, useCallback } from "react";
import { Download, RefreshCw, AlertTriangle } from "lucide-react";

interface UpdateInfo {
  serverVersion: string;
  steamAppId: number;
  steamCmdConfigured: boolean;
}

export default function UpdateManager() {
  const { serverId, currentServer } = useServer();
  const [info, setInfo] = useState<UpdateInfo | null>(null);
  const [updating, setUpdating] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<"info" | "success" | "error">("info");

  const loadInfo = useCallback(async () => {
    try {
      const res = await fetch(`/api/enshrouded-update?server=${serverId}`);
      if (res.ok) {
        setInfo(await res.json());
      }
    } catch {
      // ignore
    }
  }, [serverId]);

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
    setMessage("Running SteamCMD update... This may take several minutes (multi-GB download).");
    setMessageType("info");

    try {
      const res = await fetch(`/api/enshrouded-update?server=${serverId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json();
      if (data.success) {
        setMessage("Update completed successfully! You can now start the server.");
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-den-text">Server Update</h2>
          <p className="text-sm text-den-text-muted mt-1">
            Update Enshrouded dedicated server via SteamCMD
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
            <p className="text-den-text font-mono mt-1">{info?.steamAppId || 2278520}</p>
          </div>
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

        <button
          onClick={runUpdate}
          disabled={updating || currentServer?.status === "running" || !info?.steamCmdConfigured}
          className="flex items-center gap-2 px-4 py-2.5 rounded-lg font-medium text-sm transition-all bg-gradient-to-r from-den-cyan/20 to-den-purple/20 border border-den-cyan/30 text-den-cyan hover:border-den-cyan/60 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {updating ? (
            <RefreshCw size={16} className="animate-spin" />
          ) : (
            <Download size={16} />
          )}
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
