"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { LayoutGrid, List, Play, Square, RotateCcw, Settings2, Loader, Plus, CircleDot, Circle } from "lucide-react";
import { useServer, type ServerInfo } from "@/contexts/ServerContext";
import { gameMeta, statusMeta } from "@/lib/game-meta";
import GameArt, { GameIconGlyph } from "@/components/instances/GameArt";
import { useLifecycle } from "@/components/instances/InstanceControls";
import { useInstanceStats, formatSince, type InstanceStats } from "@/components/instances/useInstanceStats";
import ConfirmModal from "@/components/ConfirmModal";

const VIEW_KEY = "kitsuneden-view";

function StatusIcon({ status, size = 12 }: { status: string; size?: number }) {
  if (status === "running") return <Play size={size} className="fill-current" aria-hidden />;
  if (status === "starting" || status === "stopping") return <Loader size={size} className="animate-spin" aria-hidden />;
  if (status === "stopped") return <Square size={size} aria-hidden />;
  return <Circle size={size} aria-hidden />;
}

function Stat({ label, value, pct, tone, onArt }: { label: string; value: string; pct?: number | null; tone?: string; onArt?: boolean }) {
  return (
    <div className="min-w-0">
      <div className={`text-[10px] font-semibold uppercase tracking-[0.06em] ${onArt ? "text-white/60" : "text-den-text-dim"}`}>{label}</div>
      <div className={`text-[12.5px] font-medium tabular-nums truncate ${onArt ? "text-white" : "text-den-text"}`}>{value}</div>
      {pct !== undefined && (
        <div className={`meter mt-1 ${onArt ? "" : "!bg-den-surface"}`}>
          <span style={{ width: `${Math.min(100, Math.max(0, pct ?? 0))}%`, ["--tone" as string]: tone }} />
        </div>
      )}
    </div>
  );
}

function statsCells(stats: InstanceStats, running: boolean) {
  const dash = "—";
  const players =
    running && stats.online !== null ? `${stats.online}${stats.maxPlayers ? ` / ${stats.maxPlayers}` : ""}` : dash;
  const playersPct = running && stats.online !== null && stats.maxPlayers ? (stats.online / stats.maxPlayers) * 100 : 0;
  const memTone = (stats.memoryPct ?? 0) > 85 ? "var(--red)" : (stats.memoryPct ?? 0) > 65 ? "var(--amber)" : "var(--accent)";
  return [
    { label: "Memory", value: running && stats.memory ? stats.memory : dash, pct: running ? stats.memoryPct ?? 0 : 0, tone: memTone },
    { label: "Players", value: players, pct: playersPct, tone: "var(--green)" },
    { label: "Uptime", value: running ? formatSince(stats.upSince) ?? dash : dash },
  ];
}

function useCardActions(server: ServerInfo) {
  const { pending, run } = useLifecycle(server.id, server.status);
  const [confirm, setConfirm] = useState<"stop" | "restart" | null>(null);
  const busy = !!pending || server.status === "starting" || server.status === "stopping";
  const modal = (
    <ConfirmModal
      open={confirm !== null}
      title={confirm === "stop" ? `Stop ${server.name}?` : `Restart ${server.name}?`}
      confirmLabel={confirm === "stop" ? "Stop server" : "Restart server"}
      confirmDestructive={confirm === "stop"}
      onCancel={() => setConfirm(null)}
      onConfirm={() => {
        const a = confirm;
        setConfirm(null);
        if (a) run(a);
      }}
    >
      Anyone playing will be disconnected.
    </ConfirmModal>
  );
  return { pending, run, busy, ask: setConfirm, modal };
}

function InstanceCard({ server }: { server: ServerInfo }) {
  const running = server.status === "running";
  const stats = useInstanceStats(server.id, running);
  const status = statusMeta(server.status);
  const game = gameMeta(server.type);
  const { pending, run, busy, ask, modal } = useCardActions(server);
  const href = `/instances/${encodeURIComponent(server.id)}`;

  return (
    <article className="gcard group">
      <GameArt type={server.type} />
      <Link href={href} className="absolute inset-0 z-[1]" aria-label={`Open ${server.name}`} />

      <span className="glass-pill absolute top-3 right-3 z-[2]" style={{ ["--tone" as string]: status.tone }}>
        <StatusIcon status={server.status} size={11} />
        {status.label}
      </span>
      <span className="glass-pill absolute top-3 left-3 z-[2] !font-medium" style={{ ["--tone" as string]: "#ffffff" }}>
        <GameIconGlyph type={server.type} size={12} />
        {game.label}
      </span>

      <div className="gcard-overlay z-[2] pointer-events-none">
        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-[17px] font-semibold leading-tight truncate">{server.name}</h3>
            <p className="text-[12px] text-white/65 truncate">
              {[server.loader, server.version].filter(Boolean).join(" ") || game.label}
              {server.gamePort ? ` · port ${server.gamePort}` : ""}
            </p>
          </div>
          <div className="flex gap-1.5 shrink-0 pointer-events-auto">
            <Link href={`${href}/config`} className="cbtn" title="Configure" aria-label={`Configure ${server.name}`}>
              <Settings2 size={15} />
            </Link>
            <button
              className="cbtn"
              disabled={busy || !running}
              onClick={() => ask("restart")}
              title="Restart"
              aria-label={`Restart ${server.name}`}
            >
              {pending === "restart" ? <Loader size={15} className="animate-spin" /> : <RotateCcw size={15} />}
            </button>
            {running ? (
              <button className="cbtn cbtn-stop" disabled={busy} onClick={() => ask("stop")} title="Stop" aria-label={`Stop ${server.name}`}>
                {pending === "stop" ? <Loader size={15} className="animate-spin" /> : <Square size={15} />}
              </button>
            ) : (
              <button
                className="cbtn cbtn-go"
                disabled={busy}
                onClick={() => run("start")}
                title="Start"
                aria-label={`Start ${server.name}`}
              >
                {pending === "start" ? <Loader size={15} className="animate-spin" /> : <Play size={15} />}
              </button>
            )}
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3 mt-3">
          {statsCells(stats, running).map((c) => (
            <Stat key={c.label} {...c} onArt />
          ))}
        </div>
      </div>
      {modal}
    </article>
  );
}

function InstanceRow({ server }: { server: ServerInfo }) {
  const running = server.status === "running";
  const stats = useInstanceStats(server.id, running);
  const status = statusMeta(server.status);
  const game = gameMeta(server.type);
  const { pending, run, busy, ask, modal } = useCardActions(server);
  const href = `/instances/${encodeURIComponent(server.id)}`;

  return (
    <div className="den-card flex items-center gap-4 px-4 py-3 flex-wrap">
      <div className="relative w-16 h-10 rounded-lg overflow-hidden shrink-0">
        <GameArt type={server.type} glyph={34} />
      </div>
      <div className="min-w-[180px] flex-1">
        <Link href={href} className="text-[15px] font-semibold hover:text-den-accent transition-colors">
          {server.name}
        </Link>
        <div className="flex items-center gap-2 text-[12.5px]">
          <span className="flex items-center gap-1.5" style={{ color: status.tone }}>
            <StatusIcon status={server.status} size={11} />
            {status.label}
          </span>
          <span className="text-den-text-dim">·</span>
          <span className="text-den-text-muted">{game.label}</span>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-5 w-[min(380px,100%)]">
        {statsCells(stats, running).map((c) => (
          <Stat key={c.label} {...c} />
        ))}
      </div>
      <div className="flex gap-1.5">
        {running ? (
          <button className="btn btn-sm btn-danger" disabled={busy} onClick={() => ask("stop")}>
            {pending === "stop" ? <Loader size={13} className="animate-spin" /> : <Square size={13} />} Stop
          </button>
        ) : (
          <button className="btn btn-sm btn-primary" disabled={busy} onClick={() => run("start")}>
            {pending === "start" ? <Loader size={13} className="animate-spin" /> : <Play size={13} />} Start
          </button>
        )}
        <button className="btn btn-sm" disabled={busy || !running} onClick={() => ask("restart")} aria-label={`Restart ${server.name}`}>
          <RotateCcw size={13} />
        </button>
        <Link href={href} className="btn btn-sm">
          Open
        </Link>
      </div>
      {modal}
    </div>
  );
}

export function useViewMode(): ["grid" | "list", (v: "grid" | "list") => void] {
  const [view, setView] = useState<"grid" | "list">("grid");
  useEffect(() => {
    try {
      if (localStorage.getItem(VIEW_KEY) === "list") setView("list");
    } catch {}
  }, []);
  return [
    view,
    (v) => {
      setView(v);
      try {
        localStorage.setItem(VIEW_KEY, v);
      } catch {}
    },
  ];
}

export function ViewToggle({ view, onChange }: { view: "grid" | "list"; onChange: (v: "grid" | "list") => void }) {
  return (
    <div className="seg" role="group" aria-label="Layout">
      <button aria-pressed={view === "grid"} onClick={() => onChange("grid")} title="Grid" aria-label="Grid view">
        <LayoutGrid size={14} />
      </button>
      <button aria-pressed={view === "list"} onClick={() => onChange("list")} title="List" aria-label="List view">
        <List size={14} />
      </button>
    </div>
  );
}

export default function InstanceGrid({ view }: { view: "grid" | "list" }) {
  const { servers, loaded } = useServer();

  if (!loaded) {
    return view === "grid" ? (
      <div className="grid gap-4 grid-cols-[repeat(auto-fill,minmax(290px,1fr))]">
        {[0, 1, 2].map((i) => (
          <div key={i} className="skel h-[236px] !rounded-[14px]" />
        ))}
      </div>
    ) : (
      <div className="space-y-2">
        {[0, 1, 2].map((i) => (
          <div key={i} className="skel h-[66px] !rounded-[14px]" />
        ))}
      </div>
    );
  }

  if (servers.length === 0) {
    return (
      <div className="den-card flex flex-col items-center text-center px-5 py-16">
        <CircleDot size={28} className="text-den-text-dim mb-3" aria-hidden />
        <h2 className="text-[16px] font-semibold">No servers in the Den yet</h2>
        <p className="text-[13.5px] text-den-text-muted mt-1 mb-5 max-w-sm">
          Point KitsuneDen at a game server folder and it&apos;ll take it from there.
        </p>
        <Link href="/manage" className="btn btn-primary">
          <Plus size={15} /> Add a server
        </Link>
      </div>
    );
  }

  return view === "grid" ? (
    <div className="grid gap-4 grid-cols-[repeat(auto-fill,minmax(290px,1fr))]">
      {servers.map((s) => (
        <InstanceCard key={s.id} server={s} />
      ))}
    </div>
  ) : (
    <div className="space-y-2">
      {servers.map((s) => (
        <InstanceRow key={s.id} server={s} />
      ))}
    </div>
  );
}
