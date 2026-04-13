"use client";

import { useServer } from "@/contexts/ServerContext";
import { Play, Square, RotateCcw } from "lucide-react";
import { useState, useCallback } from "react";

const PAGE_TITLES: Record<string, string> = {
  dashboard: "Dashboard",
  console: "Live Console",
  servers: "Servers",
  config: "Configuration",
  players: "Players",
  worlds: "Worlds",
  backups: "Backups",
  mods: "Mods",
  modpacks: "Mod Packs",
  airdrops: "Airdrops",
};

interface TopbarProps {
  activePage: string;
}

export default function Topbar({ activePage }: TopbarProps) {
  const { serverId, currentServer } = useServer();
  const [loading, setLoading] = useState(false);

  const status = currentServer?.status || "stopped";
  const isOnline = status === "running";

  const handleAction = useCallback(async (action: string) => {
    if (loading) return;
    setLoading(true);
    try {
      await fetch(`/api/server?server=${serverId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
    } catch {
      // handled by status polling
    } finally {
      setTimeout(() => setLoading(false), 3000);
    }
  }, [loading, serverId]);

  return (
    <header className="h-16 min-h-16 bg-den-base border-b border-den-border flex items-center justify-between px-6">
      <h1 className="text-xl font-bold tracking-tight">
        {PAGE_TITLES[activePage] || activePage}
      </h1>
      <div className="flex items-center gap-3">
        {/* Status Pill */}
        <div
          className={`flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-semibold border ${
            isOnline
              ? "bg-den-surface border-den-border"
              : "bg-den-surface border-den-border"
          }`}
        >
          <span
            className={`w-2 h-2 rounded-full transition-colors ${
              isOnline
                ? "bg-den-green shadow-[0_0_8px_rgba(102,187,106,0.6)] animate-[pulse_2s_ease-in-out_infinite]"
                : status === "starting" || status === "stopping"
                ? "bg-yellow-500 animate-pulse"
                : "bg-den-red"
            }`}
          />
          <span className="text-den-text-muted">
            {isOnline ? "Online" : status === "starting" ? "Starting..." : status === "stopping" ? "Stopping..." : "Offline"}
          </span>
        </div>

        {/* Server Controls */}
        <button
          onClick={() => handleAction("start")}
          disabled={loading || status !== "stopped"}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold bg-den-green hover:bg-[#6db563] disabled:bg-den-border disabled:text-den-text-dim text-white transition-all"
          title="Start"
        >
          <Play size={14} />
          Start
        </button>
        <button
          onClick={() => handleAction("stop")}
          disabled={loading || status !== "running"}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold bg-den-red hover:bg-[#e53935] disabled:bg-den-border disabled:text-den-text-dim text-white transition-all"
          title="Stop"
        >
          <Square size={14} />
          Stop
        </button>
        <button
          onClick={() => handleAction("restart")}
          disabled={loading || status !== "running"}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold bg-gradient-to-r from-den-amber to-[#fb8c00] text-den-bg hover:brightness-110 hover:shadow-[0_0_16px_rgba(255,167,38,0.3)] disabled:bg-den-border disabled:text-den-text-dim disabled:bg-none disabled:shadow-none transition-all"
          title="Restart"
        >
          <RotateCcw size={14} />
          Restart
        </button>
      </div>
    </header>
  );
}
