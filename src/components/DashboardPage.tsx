"use client";

import { useServer } from "@/contexts/ServerContext";
import { useEffect, useState } from "react";
import StatCard from "@/components/StatCard";
import MemoryAllocation from "@/components/minecraft/MemoryAllocation";
import { Activity, Users, Globe, Cpu, Copy, Check, ArrowRight } from "lucide-react";
import { gameMeta } from "@/lib/game-meta";

interface StatsData {
  process: {
    pid: number;
    memory: string;
    memoryBytes: number;
    upSince: string | null;
  } | null;
  system: {
    platform: string;
    hostname: string;
    totalMemory: string;
    freeMemory: string;
    totalMemoryBytes: number;
    freeMemoryBytes: number;
    cpus: number;
    cpuModel: string;
    uptime: number;
  };
  // Hytale extra fields
  running?: boolean;
  serverName?: string;
  motd?: string;
  maxPlayers?: number;
  registeredPlayers?: number;
  worlds?: string[];
  defaultWorld?: string;
  gameMode?: string;
  viewRadius?: number;
  serverVersion?: string;
  mods?: string[];
  npcCount?: number;
}

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function Meter({ label, detail, pct, barClass }: { label: string; detail: string; pct: number; barClass: string }) {
  return (
    <div>
      <div className="flex justify-between items-baseline mb-2">
        <span className="text-[13px] text-den-text-muted">{label}</span>
        <span className="text-[12px] text-den-text font-mono tabular-nums">{detail}</span>
      </div>
      <div
        className="h-1.5 bg-den-bg/80 rounded-full overflow-hidden"
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(pct)}
      >
        <div
          className={`h-full rounded-full transition-[width] duration-700 ${barClass}`}
          style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
        />
      </div>
    </div>
  );
}

interface DashboardPageProps {
  onNavigate?: (page: string) => void;
}

export default function DashboardPage({ onNavigate }: DashboardPageProps) {
  const { serverId, currentServer } = useServer();
  const [stats, setStats] = useState<StatsData | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [lanIp, setLanIp] = useState("...");
  const [publicIp, setPublicIp] = useState("...");
  const [copied, setCopied] = useState("");

  useEffect(() => {
    if (!serverId) return;
    // Drop responses that land after a server switch or unmount.
    let cancelled = false;

    const fetchData = async () => {
      try {
        const [statsRes, logsRes] = await Promise.all([
          fetch(`/api/stats?server=${serverId}`),
          fetch(`/api/console?server=${serverId}`),
        ]);
        const statsData = await statsRes.json();
        const logsData = await logsRes.json();
        if (cancelled) return;
        setStats(statsData);
        setLogs((logsData.logs || []).slice(-15));
      } catch {
        // ignore
      }
    };

    fetchData();
    const interval = setInterval(fetchData, 10000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [serverId]);

  useEffect(() => {
    fetch("/api/network")
      .then((res) => res.json())
      .then((data) => {
        setLanIp(data.lanIp || "unknown");
        setPublicIp(data.publicIp || "unknown");
      })
      .catch(() => {
        setLanIp("unknown");
        setPublicIp("unknown");
      });
  }, []);

  const connectionPort = currentServer?.gamePort;
  const lanConnection =
    connectionPort && lanIp !== "unknown" && lanIp !== "..."
      ? `${lanIp}:${connectionPort}`
      : "--";
  const publicConnection =
    connectionPort && publicIp !== "unknown" && publicIp !== "..."
      ? `${publicIp}:${connectionPort}`
      : "--";

  const copyConnection = (value: string, label: string) => {
    if (value === "--") return;
    navigator.clipboard.writeText(value);
    setCopied(label);
    setTimeout(() => setCopied(""), 2000);
  };

  const isOnline = currentServer?.status === "running";
  const memUsed = stats
    ? stats.system.totalMemoryBytes - stats.system.freeMemoryBytes
    : 0;
  const memPct = stats
    ? ((memUsed / stats.system.totalMemoryBytes) * 100).toFixed(1)
    : "0";
  const procMemPct =
    stats?.process && stats.system.totalMemoryBytes
      ? ((stats.process.memoryBytes / stats.system.totalMemoryBytes) * 100).toFixed(1)
      : "0";

  const game = gameMeta(currentServer?.type);
  const typeLabel =
    currentServer?.type === "minecraft" && currentServer.loader
      ? `${game.label} · ${currentServer.loader}`
      : currentServer
        ? game.label
        : "--";
  const status = currentServer?.status;
  const memPctNum = Number(memPct);
  const memBar = memPctNum > 90 ? "bg-den-red" : memPctNum > 75 ? "bg-den-amber" : "bg-den-cyan";

  return (
    <div className="space-y-5">
      {/* Stat Cards Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard
          icon={<Activity size={20} />}
          value={isOnline ? "Online" : status === "starting" ? "Starting" : status === "stopping" ? "Stopping" : "Offline"}
          label="Server status"
          tone={isOnline ? "green" : status === "starting" || status === "stopping" ? "accent" : "dim"}
          highlight
        />
        <StatCard
          icon={<Users size={20} />}
          value={stats?.registeredPlayers?.toString() || "--"}
          suffix={stats?.maxPlayers ? `/ ${stats.maxPlayers}` : undefined}
          label="Registered players"
          tone="cyan"
        />
        <StatCard
          icon={<Globe size={20} />}
          value={
            currentServer?.type === "7d2d"
              ? stats?.defaultWorld || "--"
              : stats?.worlds?.length?.toString() || "--"
          }
          label={currentServer?.type === "7d2d" ? "World" : "Worlds"}
          tone="purple"
        />
        <StatCard
          icon={<Cpu size={20} />}
          value={stats?.process?.memory || "--"}
          label="Server memory"
          tone="amber"
        />
      </div>

      {/* Two-column grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Server Info Card */}
        <section className="den-card overflow-hidden">
          <div className="den-card-header">
            <h3 className="den-card-title">Server information</h3>
            <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold border ${game.tag}`}>
              {stats?.gameMode || game.label}
            </span>
          </div>
          <div className="px-5 py-2">
            {[
              ["Server name", stats?.serverName || currentServer?.name || "--"],
              ["MOTD", stats?.motd || "--"],
              ["Version", stats?.serverVersion || currentServer?.version || "--"],
              ["Default world", stats?.defaultWorld || "--"],
              ["Game", typeLabel],
            ].map(([label, value]) => (
              <div key={label} className="den-row">
                <span className="text-[13px] text-den-text-muted shrink-0">{label}</span>
                <span
                  className={`text-[13px] font-medium text-right truncate ${
                    label === "MOTD" && value !== "--" ? "text-den-lantern" : ""
                  }`}
                  title={value}
                >
                  {value}
                </span>
              </div>
            ))}
          </div>
          <div className="px-5 pb-5 pt-2">
            <div className="den-eyebrow mb-2">Connect</div>
            <div className="flex flex-wrap gap-2">
              {[
                ["LAN", lanConnection],
                ["Public", publicConnection],
              ].map(([label, value]) => (
                <button
                  key={label}
                  onClick={() => copyConnection(value, label)}
                  className="group flex items-center gap-2 pl-3 pr-2.5 py-1.5 bg-den-bg/60 rounded-lg border border-den-border hover:border-den-cyan/40 disabled:hover:border-den-border transition-colors text-[12px] font-mono"
                  disabled={value === "--"}
                  title={value === "--" ? undefined : `Copy ${label} address`}
                >
                  <span className="text-den-text-dim">{label}</span>
                  <span className={value === "--" ? "text-den-text-dim" : "text-den-text"}>{value}</span>
                  {copied === label ? (
                    <Check size={13} className="text-den-green" />
                  ) : (
                    <Copy size={13} className="text-den-text-dim group-hover:text-den-cyan transition-colors" />
                  )}
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* System Resources Card */}
        <section className="den-card overflow-hidden">
          <div className="den-card-header">
            <h3 className="den-card-title">System resources</h3>
            <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold font-mono bg-den-surface text-den-text-muted border border-den-border">
              {stats?.system.hostname || "--"}
            </span>
          </div>
          <div className="p-5 space-y-5">
            <Meter
              label="Host memory"
              detail={stats ? `${(memUsed / 1073741824).toFixed(1)} GB / ${stats.system.totalMemory}` : "-- / --"}
              pct={memPctNum}
              barClass={memBar}
            />
            <Meter
              label="Server process"
              detail={stats?.process ? `${stats.process.memory} · ${procMemPct}%` : "Not running"}
              pct={Number(procMemPct)}
              barClass="bg-den-purple"
            />

            <div>
              {[
                ["CPU", stats?.system.cpuModel?.replace(/\s+/g, " ").trim().substring(0, 48) || "--"],
                ["Cores", stats?.system.cpus?.toString() || "--"],
                ["Host uptime", stats ? formatUptime(stats.system.uptime) : "--"],
                ["PID", stats?.process?.pid?.toString() || "--"],
              ].map(([label, value]) => (
                <div key={label} className="den-row">
                  <span className="text-[13px] text-den-text-muted shrink-0">{label}</span>
                  <span
                    className={`text-[13px] font-medium text-right truncate ${
                      label === "PID" || label === "Cores" ? "font-mono tabular-nums" : ""
                    }`}
                    title={value}
                  >
                    {value}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>

      {/* Minecraft -Xms/-Xmx (renders nothing for other games / remote MC) */}
      <MemoryAllocation />

      {/* Recent Log Preview */}
      <section className="den-card overflow-hidden">
        <div className="den-card-header">
          <h3 className="den-card-title">Recent log activity</h3>
          {onNavigate && (
            <button
              onClick={() => onNavigate("console")}
              className="flex items-center gap-1 text-[12px] text-den-cyan font-medium hover:text-den-text transition-colors"
            >
              Open console <ArrowRight size={13} />
            </button>
          )}
        </div>
        <div className="px-5 py-4 max-h-[240px] overflow-y-auto font-mono text-[11.5px] leading-6 text-den-text-muted bg-den-bg/40">
          {logs.length === 0 ? (
            <div className="text-center py-10 text-den-text-dim text-[13px] font-sans">
              {isOnline ? "Waiting for log lines…" : "No recent log lines."}
            </div>
          ) : (
            logs.map((line, i) => (
              <div
                key={i}
                className={`whitespace-pre-wrap break-all ${
                  line.includes("SEVERE") || line.includes("ERROR") || line.includes(" ERR ")
                    ? "text-den-red"
                    : line.includes("WARN") || line.includes(" WRN ")
                    ? "text-den-amber"
                    : ""
                }`}
              >
                {line}
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
