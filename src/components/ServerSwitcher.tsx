"use client";

import { useServer } from "@/contexts/ServerContext";

const STATUS_DOT: Record<string, string> = {
  stopped: "bg-den-red",
  starting: "bg-yellow-500 animate-pulse",
  running: "bg-den-green",
  stopping: "bg-yellow-500 animate-pulse",
};

export default function ServerSwitcher() {
  const { serverId, setServerId, servers } = useServer();

  return (
    <div className="flex gap-2 flex-wrap">
      {servers.map((s) => {
        const active = s.id === serverId;
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
            {s.version && (
              <span className="text-xs opacity-60">{s.version}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
