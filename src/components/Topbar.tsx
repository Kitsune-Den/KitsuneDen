"use client";

import { useServer } from "@/contexts/ServerContext";
import { gameMeta, statusMeta } from "@/lib/game-meta";
import { Play, Square, RotateCcw, LogOut } from "lucide-react";
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
  update: "Update",
  docs: "Library",
};

interface TopbarProps {
  activePage: string;
}

export default function Topbar({ activePage }: TopbarProps) {
  const { serverId, currentServer } = useServer();
  const [loading, setLoading] = useState(false);

  const status = currentServer?.status || "stopped";
  const meta = statusMeta(status);

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

  const ctrl =
    "flex items-center gap-1.5 h-8 px-3 rounded-md text-[13px] font-semibold transition-all disabled:text-den-text-dim disabled:bg-transparent disabled:cursor-not-allowed";

  return (
    <header className="h-16 min-h-16 bg-den-base/80 backdrop-blur-md border-b border-den-border flex items-center justify-between gap-4 px-6 sticky top-0 z-40">
      <div className="min-w-0">
        <h1 className="text-[17px] font-semibold tracking-tight leading-tight">
          {PAGE_TITLES[activePage] || activePage}
        </h1>
        {currentServer && (
          <p className="text-[12px] text-den-text-dim truncate">
            {currentServer.name} · {gameMeta(currentServer.type).label}
          </p>
        )}
      </div>

      <div className="flex items-center gap-2.5 shrink-0">
        {/* Status Pill */}
        <div
          className="flex items-center gap-2 h-8 px-3 rounded-full text-xs font-semibold bg-den-surface border border-den-border"
          aria-live="polite"
        >
          <span className={`w-2 h-2 rounded-full ${meta.dot}`} />
          <span className="text-den-text-muted">{meta.label}</span>
        </div>

        {/* Server Controls: one segmented group so they read as a single unit */}
        <div className="flex items-center gap-0.5 p-0.5 rounded-lg bg-den-surface border border-den-border">
          <button
            onClick={() => handleAction("start")}
            disabled={loading || status !== "stopped"}
            className={`${ctrl} bg-den-green/15 text-den-green hover:bg-den-green/25`}
            title="Start server"
          >
            <Play size={13} />
            <span className="max-[1100px]:hidden">Start</span>
          </button>
          <button
            onClick={() => handleAction("stop")}
            disabled={loading || status !== "running"}
            className={`${ctrl} bg-den-red/15 text-den-red hover:bg-den-red/25`}
            title="Stop server"
          >
            <Square size={13} />
            <span className="max-[1100px]:hidden">Stop</span>
          </button>
          <button
            onClick={() => handleAction("restart")}
            disabled={loading || status !== "running"}
            className={`${ctrl} bg-den-amber/15 text-den-amber hover:bg-den-amber/25`}
            title="Restart server"
          >
            <RotateCcw size={13} />
            <span className="max-[1100px]:hidden">Restart</span>
          </button>
        </div>

        {/* Sign out — clears the shared-password session cookie and bounces to /login. */}
        <button
          onClick={async () => {
            await fetch("/api/auth/logout", { method: "POST" });
            window.location.href = "/login";
          }}
          className="flex items-center justify-center w-9 h-9 rounded-lg text-den-text-dim hover:text-den-text hover:bg-den-surface transition-all"
          title="Sign out"
          aria-label="Sign out"
        >
          <LogOut size={15} />
        </button>
      </div>
    </header>
  );
}
