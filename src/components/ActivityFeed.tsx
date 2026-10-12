"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { TriangleAlert, Activity as ActivityIcon } from "lucide-react";

interface ActivityEvent {
  id: string;
  ts: number;
  level: "info" | "warn" | "error";
  kind: string;
  message: string;
  serverId?: string;
  serverName?: string;
}

const FILTERS: { id: string; label: string; kinds?: string }[] = [
  { id: "all", label: "Everything" },
  { id: "server", label: "Starts & stops", kinds: "server" },
  { id: "crash", label: "Crashes", kinds: "crash" },
  { id: "config", label: "Config & setup", kinds: "config,setup" },
  { id: "players", label: "Players", kinds: "players" },
  { id: "backup", label: "Backups", kinds: "backup" },
  { id: "mods", label: "Mods", kinds: "mods" },
  { id: "auth", label: "Sign-ins", kinds: "auth" },
];

const LEVEL_TONE: Record<string, string> = {
  info: "var(--accent-bright)",
  warn: "var(--amber)",
  error: "var(--red)",
};

function ago(ts: number): string {
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (s < 45) return "just now";
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  const d = Math.round(s / 86400);
  return d === 1 ? "yesterday" : `${d}d ago`;
}

/** Recent events, newest first, refreshed every 5s. Scoped to one server when serverId is set. */
export default function ActivityFeed({ serverId, limit = 100 }: { serverId?: string; limit?: number }) {
  const [filter, setFilter] = useState("all");
  const [events, setEvents] = useState<ActivityEvent[] | null>(null);
  const [, setNow] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const kinds = FILTERS.find((f) => f.id === filter)?.kinds;
    const q = new URLSearchParams({ limit: String(limit) });
    if (serverId) q.set("server", serverId);
    if (kinds) q.set("kind", kinds);
    const load = () =>
      fetch(`/api/activity?${q}`)
        .then((r) => r.json())
        .then((d) => !cancelled && setEvents(d.events || []))
        .catch(() => !cancelled && setEvents((e) => e ?? []));
    load();
    const id = setInterval(() => {
      load();
      setNow(Date.now()); // re-render relative times
    }, 5000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [filter, serverId, limit]);

  return (
    <section className="den-card overflow-hidden">
      <div className="den-card-header">
        <h3 className="den-card-title">{serverId ? "Recent activity" : "Everything that happened"}</h3>
        <label className="flex items-center gap-2 text-[12.5px] text-den-text-muted">
          Show
          <select className="input !h-8 !text-[12.5px]" value={filter} onChange={(e) => setFilter(e.target.value)}>
            {FILTERS.filter((f) => !(serverId && f.id === "auth")).map((f) => (
              <option key={f.id} value={f.id}>
                {f.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {events === null ? (
        <div className="p-5 space-y-3">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="skel h-9" />
          ))}
        </div>
      ) : events.length === 0 ? (
        <div className="flex flex-col items-center text-center px-5 py-14 text-den-text-dim">
          <ActivityIcon size={24} className="mb-2" aria-hidden />
          <p className="text-[13.5px]">Nothing yet. Starts, stops, config saves and roster changes show up here.</p>
        </div>
      ) : (
        <ol className="divide-y divide-den-border/70">
          {events.map((ev) => (
            <li key={ev.id} className="flex items-start gap-3 px-5 py-3">
              <span
                className="mt-[7px] w-[7px] h-[7px] rounded-full shrink-0"
                style={{ background: LEVEL_TONE[ev.level] }}
                aria-hidden
              />
              <div className="min-w-0 flex-1">
                <div className="text-[13.5px] text-den-text flex items-center gap-1.5">
                  {ev.level !== "info" && (
                    <TriangleAlert size={13} style={{ color: LEVEL_TONE[ev.level] }} aria-label={ev.level} />
                  )}
                  <span className="break-words">{ev.message}</span>
                </div>
                <div className="text-[12px] text-den-text-dim mt-0.5">
                  {!serverId && ev.serverId && (
                    <>
                      <Link href={`/instances/${encodeURIComponent(ev.serverId)}`} className="hover:text-den-accent">
                        {ev.serverName || ev.serverId}
                      </Link>
                      {" · "}
                    </>
                  )}
                  <time dateTime={new Date(ev.ts).toISOString()} title={new Date(ev.ts).toLocaleString()}>
                    {ago(ev.ts)}
                  </time>
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
