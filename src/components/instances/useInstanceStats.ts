"use client";

import { useEffect, useState } from "react";

export interface InstanceStats {
  memory: string | null;
  memoryPct: number | null;
  upSince: string | null;
  online: number | null;
  maxPlayers: number | null;
}

const EMPTY: InstanceStats = { memory: null, memoryPct: null, upSince: null, online: null, maxPlayers: null };

/** Count players currently online from whichever shape the players API returns. */
function countOnline(data: { players?: { groups?: string[] }[]; online?: unknown[] } | null): number | null {
  if (!data) return null;
  if (Array.isArray(data.online)) return data.online.length;
  const players = Array.isArray(data.players) ? data.players : null;
  if (!players) return null;
  const tagged = players.some((p) => Array.isArray(p.groups) && (p.groups.includes("online") || p.groups.includes("offline")));
  return tagged ? players.filter((p) => p.groups?.includes("online")).length : players.length;
}

/**
 * Light per-card stats: memory every 5s, online players every 15s, and only
 * while the server runs and the browser tab is visible. Skips overlapping
 * requests so a slow server never queues up calls.
 */
export function useInstanceStats(serverId: string, running: boolean): InstanceStats {
  const [stats, setStats] = useState<InstanceStats>(EMPTY);

  useEffect(() => {
    if (!running) {
      setStats(EMPTY);
      return;
    }
    let cancelled = false;
    let tick = 0;
    let inFlight = false;
    const q = `server=${encodeURIComponent(serverId)}`;

    const poll = async () => {
      if (inFlight || document.visibilityState === "hidden") return;
      inFlight = true;
      try {
        const wantPlayers = tick % 3 === 0;
        const [s, p] = await Promise.all([
          fetch(`/api/stats?${q}`).then((r) => r.json()).catch(() => null),
          wantPlayers ? fetch(`/api/players?${q}`).then((r) => r.json()).catch(() => null) : Promise.resolve(undefined),
        ]);
        if (cancelled) return;
        setStats((prev) => ({
          memory: s?.process?.memory ?? null,
          memoryPct:
            s?.process?.memoryBytes && s?.system?.totalMemoryBytes
              ? (s.process.memoryBytes / s.system.totalMemoryBytes) * 100
              : null,
          upSince: s?.process?.upSince ?? null,
          maxPlayers: typeof s?.maxPlayers === "number" ? s.maxPlayers : prev.maxPlayers,
          online: p === undefined ? prev.online : countOnline(p),
        }));
      } finally {
        inFlight = false;
        tick++;
      }
    };

    poll();
    const id = setInterval(poll, 5000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [serverId, running]);

  return stats;
}

export function formatSince(iso: string | null): string | null {
  if (!iso) return null;
  const secs = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (!Number.isFinite(secs)) return null;
  const d = Math.floor(secs / 86400);
  const h = Math.floor((secs % 86400) / 3600);
  const m = Math.floor((secs % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}
