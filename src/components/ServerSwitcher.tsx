"use client";

import { useServer } from "@/contexts/ServerContext";
import { gameMeta, statusMeta } from "@/lib/game-meta";

export default function ServerSwitcher() {
  const { serverId, setServerId, servers } = useServer();

  return (
    <div className="flex gap-2 flex-wrap" role="tablist" aria-label="Servers">
      {servers.map((s) => {
        const active = s.id === serverId;
        const game = gameMeta(s.type);
        const status = statusMeta(s.status);
        return (
          <button
            key={s.id}
            role="tab"
            aria-selected={active}
            onClick={() => setServerId(s.id)}
            title={`${s.name} · ${game.label} · ${status.label}`}
            className={`group flex items-center gap-2.5 pl-3 pr-2 py-1.5 rounded-lg text-[13px] font-medium border transition-all ${
              active
                ? "bg-den-card text-den-text border-den-cyan/40 shadow-[0_0_0_3px_color-mix(in_srgb,var(--color-den-cyan)_10%,transparent)]"
                : "bg-den-surface/60 text-den-text-muted border-den-border hover:bg-den-card hover:text-den-text hover:border-den-border-light"
            }`}
          >
            <span className={`w-2 h-2 rounded-full shrink-0 ${status.dot}`} />
            <span>{s.name}</span>
            {s.version && <span className="text-[11px] text-den-text-dim font-mono">{s.version}</span>}
            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-md border ${game.tag}`}>
              {game.short}
            </span>
          </button>
        );
      })}
    </div>
  );
}
