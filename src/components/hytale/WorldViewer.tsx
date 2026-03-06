"use client";

import { useServer } from "@/contexts/ServerContext";
import { useEffect, useState, useCallback } from "react";

interface WorldData {
  name: string;
  config: Record<string, unknown>;
}

interface Warp {
  Id: string;
  World: string;
  X: number;
  Y: number;
  Z: number;
}

function getWarpIcon(name: string) {
  const lower = name.toLowerCase();
  if (lower.includes("sand") || lower.includes("desert") || lower.includes("dune"))
    return { icon: "\uD83C\uDFDC\uFE0F", bg: "bg-[rgba(255,167,38,0.15)]" };
  if (lower.includes("tundra") || lower.includes("snow") || lower.includes("ice"))
    return { icon: "\u2744\uFE0F", bg: "bg-[rgba(79,195,247,0.15)]" };
  if (lower.includes("manala") || lower.includes("dark") || lower.includes("void"))
    return { icon: "\uD83C\uDF11", bg: "bg-[rgba(171,71,188,0.15)]" };
  if (lower.includes("home") || lower.includes("spawn"))
    return { icon: "\uD83C\uDFE0", bg: "bg-[rgba(102,187,106,0.15)]" };
  return { icon: "\uD83D\uDCCD", bg: "bg-[rgba(102,187,106,0.15)]" };
}

export default function WorldViewer() {
  const { serverId, currentServer } = useServer();
  const [worlds, setWorlds] = useState<WorldData[]>([]);
  const [warps, setWarps] = useState<Warp[]>([]);
  const [defaultWorld, setDefaultWorld] = useState("");

  const loadData = useCallback(async () => {
    try {
      const res = await fetch(`/api/worlds?server=${serverId}`);
      const data = await res.json();
      setWorlds(data.worlds || []);
      setWarps((data.warps as Warp[]) || []);
      setDefaultWorld((data.defaultWorld as string) || "");
    } catch {
      // ignore
    }
  }, [serverId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  if (currentServer?.type !== "hytale") {
    return null;
  }

  return (
    <div className="space-y-6">
      {/* Worlds */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {worlds.map((world) => {
          const isDefault = world.name === defaultWorld;
          const cfg = world.config;

          return (
            <div key={world.name} className="bg-gradient-to-br from-den-card to-den-surface border border-den-border rounded-xl overflow-hidden">
              {/* Banner */}
              <div
                className={`h-20 flex items-center justify-center text-4xl ${
                  world.name === "den"
                    ? "bg-gradient-to-r from-[#1a4a2e] via-[#0b3d1a] to-[#1a4a2e]"
                    : "bg-gradient-to-r from-[#1a2a4a] via-[#0b1d3d] to-[#1a2a4a]"
                }`}
              >
                {world.name === "den" ? "\uD83E\uDD8A" : "\uD83C\uDF0D"}
              </div>
              <div className="p-5">
                <div className="text-base font-bold mb-3">
                  {world.name}
                  {isDefault && (
                    <span className="ml-2 text-[10px] font-semibold px-2 py-0.5 rounded-md bg-[rgba(255,167,38,0.15)] text-den-amber">
                      DEFAULT
                    </span>
                  )}
                </div>
                <div className="text-[12px] text-den-text-dim font-mono mb-3">
                  /teleport world {world.name}
                </div>
                <div className="flex flex-col">
                  {([
                    ["Seed", String(cfg.Seed || "--")],
                    ["PvP", cfg.IsPvpEnabled ? "Enabled" : "Disabled"],
                    ["Fall Damage", cfg.IsFallDamageEnabled ? "Enabled" : "Disabled"],
                    ["NPC Spawning", cfg.IsSpawningNPC ? "Active" : "Disabled"],
                    ["Block Ticking", cfg.IsBlockTicking ? "Active" : "Paused"],
                  ] as [string, string][]).map(([label, value]) => (
                    <div key={label} className="flex justify-between py-2 border-b border-[rgba(42,51,85,0.5)] last:border-0 text-[13px]">
                      <span className="text-den-text-muted">{label}</span>
                      <span className="font-semibold">{value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          );
        })}
        {worlds.length === 0 && (
          <div className="col-span-full bg-gradient-to-br from-den-card to-den-surface border border-den-border rounded-xl p-6 text-center text-den-text-dim">
            No worlds found yet. Start the server or check the universe folder.
          </div>
        )}
      </div>

      {/* Warps */}
      {warps.length > 0 && (
        <div className="bg-gradient-to-br from-den-card to-den-surface border border-den-border rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-den-border flex items-center justify-between">
            <h3 className="text-sm font-bold">Warp Points</h3>
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-den-elevated text-den-text-muted border border-den-border min-w-[24px] text-center">
              {warps.length}
            </span>
          </div>
          <div className="p-5 flex flex-col gap-2">
            {warps.map((w) => {
              const wi = getWarpIcon(w.Id);
              return (
                <div
                  key={w.Id}
                  className="flex items-center gap-3 px-3 py-2.5 bg-den-surface rounded-lg border border-transparent hover:border-den-border-light hover:bg-den-elevated transition-all"
                >
                  <div className={`w-8 h-8 rounded-md flex items-center justify-center text-base shrink-0 ${wi.bg}`}>
                    {wi.icon}
                  </div>
                  <div>
                    <div className="text-[13px] font-semibold">{w.Id}</div>
                    <div className="text-[11px] text-den-text-dim font-mono">
                      {Math.round(w.X)}, {Math.round(w.Y)}, {Math.round(w.Z)}
                    </div>
                  </div>
                  <div className="ml-auto text-[11px] text-den-text-dim">{w.World}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
