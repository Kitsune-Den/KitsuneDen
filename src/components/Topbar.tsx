"use client";

import { useServer } from "@/contexts/ServerContext";
import { RotateCcw } from "lucide-react";
import { useState } from "react";

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
  const [restarting, setRestarting] = useState(false);

  const status = currentServer?.status || "stopped";
  const isOnline = status === "running";

  const handleRestart = async () => {
    if (restarting) return;
    setRestarting(true);
    try {
      await fetch(`/api/server?server=${serverId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "restart" }),
      });
    } catch {
      // handled by status polling
    } finally {
      setTimeout(() => setRestarting(false), 3000);
    }
  };

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

        {/* Restart Button */}
        <button
          onClick={handleRestart}
          disabled={restarting}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-gradient-to-r from-den-amber to-[#fb8c00] text-den-bg hover:brightness-110 hover:shadow-[0_0_16px_rgba(255,167,38,0.3)] disabled:opacity-50 transition-all"
        >
          <RotateCcw size={14} />
          Restart
        </button>
      </div>
    </header>
  );
}
