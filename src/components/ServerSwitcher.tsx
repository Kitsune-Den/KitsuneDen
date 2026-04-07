"use client";

import { useServer } from "@/contexts/ServerContext";

const STATUS_DOT: Record<string, string> = {
  stopped: "bg-den-red",
  starting: "bg-yellow-500 animate-pulse",
  running: "bg-den-green",
  stopping: "bg-yellow-500 animate-pulse",
};

const TYPE_PILL: Record<string, { label: string; color: string }> = {
  minecraft: { label: "MC", color: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" },
  "7d2d": { label: "7D2D", color: "bg-red-500/20 text-red-400 border-red-500/30" },
  hytale: { label: "Hytale", color: "bg-amber-500/20 text-amber-400 border-amber-500/30" },
};

export default function ServerSwitcher() {
  const { serverId, setServerId, servers } = useServer();

  return (
    <div className="flex gap-2 flex-wrap">
      {servers.map((s) => {
        const active = s.id === serverId;
        const pill = TYPE_PILL[s.type] || { label: s.type, color: "bg-gray-500/20 text-gray-400 border-gray-500/30" };
        return (
          <button
            key={s.id}
            onClick={() => setServerId(s.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              active
                ? "bg-den-cyan-glow text-den-cyan border border-[rgba(79,195,247,0.4)] shadow-sm shadow-[rgba(79,195,247,0.1)]"
                : "bg-den-surface text-den-text-muted border border-den-border hover:bg-den-card-hover hover:text-den-text"
            }`}
          >
            <div
              className={`w-2 h-2 rounded-full ${STATUS_DOT[s.status] || "bg-gray-500"}`}
            />
            <span>{s.name}</span>
            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${pill.color}`}>
              {pill.label}
            </span>
            {s.version && (
              <span className="text-xs opacity-60">{s.version}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
