"use client";

import { useServer } from "@/contexts/ServerContext";
import { useEffect, useState, useCallback } from "react";
import StatCard from "@/components/StatCard";
import { Activity, Users, Globe, Cpu, Copy, Check } from "lucide-react";

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

export default function DashboardPage() {
  const { serverId, currentServer } = useServer();
  const [stats, setStats] = useState<StatsData | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [lanIp, setLanIp] = useState("...");
  const [publicIp, setPublicIp] = useState("...");
  const [copied, setCopied] = useState("");

  const fetchData = useCallback(async () => {
    if (!serverId) return;
    try {
      const [statsRes, logsRes] = await Promise.all([
        fetch(`/api/stats?server=${serverId}`),
        fetch(`/api/console?server=${serverId}`),
      ]);
      setStats(await statsRes.json());
      const logsData = await logsRes.json();
      setLogs((logsData.logs || []).slice(-15));
    } catch {
      // ignore
    }
  }, [serverId]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 10000);
    return () => clearInterval(interval);
  }, [fetchData]);

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

  return (
    <div className="space-y-6">
      {/* Stat Cards Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard
          icon={<Activity size={24} />}
          value={isOnline ? "Online" : "Offline"}
          label="Server Status"
          iconColor={isOnline ? "text-den-green" : "text-den-red"}
          iconBg={isOnline ? "bg-[rgba(102,187,106,0.12)]" : "bg-[rgba(239,83,80,0.12)]"}
          borderColor={isOnline ? "#2e7d32" : "#c62828"}
          accentBar
        />
        <StatCard
          icon={<Users size={24} />}
          value={stats?.registeredPlayers?.toString() || "--"}
          suffix={stats?.maxPlayers ? `/ ${stats.maxPlayers}` : undefined}
          label="Registered Players"
          iconColor="text-den-cyan"
          iconBg="bg-[rgba(79,195,247,0.12)]"
        />
        <StatCard
          icon={<Globe size={24} />}
          value={
            currentServer?.type === "7d2d"
              ? stats?.defaultWorld || "--"
              : stats?.worlds?.length?.toString() || "--"
          }
          label={currentServer?.type === "7d2d" ? "World" : "Worlds"}
          iconColor="text-den-purple"
          iconBg="bg-[rgba(171,71,188,0.12)]"
        />
        <StatCard
          icon={<Cpu size={24} />}
          value={stats?.process?.memory || "--"}
          label="Memory Usage"
          iconColor="text-den-amber"
          iconBg="bg-[rgba(255,167,38,0.12)]"
        />
      </div>

      {/* Two-column grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Server Info Card */}
        <div className="bg-gradient-to-br from-den-card to-den-surface border border-den-border rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-den-border flex items-center justify-between">
            <h3 className="text-sm font-bold">Server Information</h3>
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-den-green-glow text-den-green border border-[rgba(102,187,106,0.25)]">
              {stats?.gameMode || currentServer?.type || "--"}
            </span>
          </div>
          <div className="p-5">
            <div className="flex flex-col">
              {[
                ["Server Name", stats?.serverName || currentServer?.name || "--"],
                ["MOTD", stats?.motd || "--"],
                ["Version", stats?.serverVersion || currentServer?.version || "--"],
                ["Default World", stats?.defaultWorld || "--"],
                ["Type", currentServer?.type === "minecraft"
                  ? `${currentServer.loader} ${currentServer.version}`
                  : currentServer?.type === "7d2d"
                    ? "7 Days to Die"
                    : currentServer?.type === "hytale"
                      ? "Hytale"
                      : "--"],
              ].map(([label, value]) => (
                <div key={label} className="flex justify-between items-center py-2.5 border-b border-[rgba(42,51,85,0.5)] last:border-0">
                  <span className="text-[13px] text-den-text-muted">{label}</span>
                  <span className={`text-[13px] font-semibold ${label === "MOTD" ? "text-den-amber italic" : ""}`}>
                    {value}
                  </span>
                </div>
              ))}
            </div>
            <div className="mt-4 pt-3 border-t border-[rgba(42,51,85,0.5)]">
              <span className="text-[13px] text-den-text-muted">Connection Info</span>
              <div className="mt-2 flex flex-wrap gap-2">
                {[
                  ["LAN", lanConnection],
                  ["Public", publicConnection],
                ].map(([label, value]) => (
                  <button
                    key={label}
                    onClick={() => copyConnection(value, label)}
                    className="flex items-center gap-2 px-3 py-1.5 bg-den-surface rounded-lg border border-den-border hover:border-den-border-light transition-colors text-[12px] font-mono font-semibold"
                    disabled={value === "--"}
                  >
                    <span className="text-den-text-muted">{label}:</span>
                    <span className={value === "--" ? "text-den-text-dim" : "text-den-text"}>
                      {value}
                    </span>
                    {copied === label ? (
                      <Check size={14} className="text-den-green" />
                    ) : (
                      <Copy size={14} className="text-den-text-dim" />
                    )}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* System Resources Card */}
        <div className="bg-gradient-to-br from-den-card to-den-surface border border-den-border rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-den-border flex items-center justify-between">
            <h3 className="text-sm font-bold">System Resources</h3>
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-[rgba(79,195,247,0.1)] text-den-cyan border border-[rgba(79,195,247,0.2)]">
              {stats?.system.hostname || "--"}
            </span>
          </div>
          <div className="p-5 space-y-4">
            {/* Memory Bar */}
            <div>
              <div className="flex justify-between mb-2 text-xs">
                <span className="text-den-text-muted font-medium">Memory</span>
                <span className="text-den-text font-semibold font-mono text-[11px]">
                  {stats ? `${((memUsed / 1073741824)).toFixed(1)} GB / ${stats.system.totalMemory}` : "-- / --"}
                </span>
              </div>
              <div className="h-2 bg-den-bg rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-den-cyan to-[#29b6f6] transition-all duration-600"
                  style={{ width: `${memPct}%` }}
                />
              </div>
            </div>

            {/* Process Memory Bar */}
            <div>
              <div className="flex justify-between mb-2 text-xs">
                <span className="text-den-text-muted font-medium">Server Process</span>
                <span className="text-den-text font-semibold font-mono text-[11px]">
                  {stats?.process ? `${stats.process.memory} (${procMemPct}%)` : "Not running"}
                </span>
              </div>
              <div className="h-2 bg-den-bg rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-den-purple to-[#8e24aa] transition-all duration-600"
                  style={{ width: `${procMemPct}%` }}
                />
              </div>
            </div>

            {/* System Info Grid */}
            <div className="pt-2">
              {[
                ["CPU", stats?.system.cpuModel?.replace(/\s+/g, " ").substring(0, 40) || "--"],
                ["Cores", stats?.system.cpus?.toString() || "--"],
                ["Uptime", stats ? formatUptime(stats.system.uptime) : "--"],
                ["PID", stats?.process?.pid?.toString() || "--"],
              ].map(([label, value]) => (
                <div key={label} className="flex justify-between items-center py-2 border-b border-[rgba(42,51,85,0.5)] last:border-0">
                  <span className="text-[13px] text-den-text-muted">{label}</span>
                  <span className={`text-[13px] font-semibold ${label === "PID" ? "font-mono text-xs" : ""}`}>
                    {value}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Recent Log Preview */}
      <div className="bg-gradient-to-br from-den-card to-den-surface border border-den-border rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-den-border flex items-center justify-between">
          <h3 className="text-sm font-bold">Recent Log Activity</h3>
          <span className="text-xs text-den-cyan font-medium cursor-pointer hover:underline">
            View Full Console
          </span>
        </div>
        <div className="p-5 max-h-[200px] overflow-y-auto font-mono text-[11px] leading-7 text-den-text-muted">
          {logs.length === 0 ? (
            <div className="text-center py-10 text-den-text-dim text-[13px] font-sans">
              Loading logs...
            </div>
          ) : (
            logs.map((line, i) => (
              <div
                key={i}
                className={`whitespace-pre-wrap break-all ${
                  line.includes("SEVERE") || line.includes("ERROR")
                    ? "text-den-red font-semibold"
                    : line.includes("WARN")
                    ? "text-den-amber"
                    : ""
                }`}
              >
                {line}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
