/**
 * Display metadata for each game type: the human name, a short tag for
 * tight spaces, tag colors, and the card art (a gradient + icon, since the
 * Den ships no game artwork). One place, so every surface agrees.
 */

export type GameIcon = "pickaxe" | "skull" | "castle" | "paw" | "flame" | "axe" | "droplet" | "biohazard" | "server";

export interface GameMeta {
  label: string;
  short: string;
  /** Tailwind classes for a tinted tag: background, text, border */
  tag: string;
  /** CSS background for instance-card art */
  art: string;
  icon: GameIcon;
}

const art = (a: string, b: string, glow: string) =>
  `radial-gradient(120% 90% at 85% 0%, ${glow} 0%, transparent 55%), ` +
  `radial-gradient(rgba(255,255,255,0.07) 1px, transparent 1.4px) 0 0 / 14px 14px, ` +
  `linear-gradient(150deg, ${a}, ${b})`;

const GAME_META: Record<string, GameMeta> = {
  minecraft: {
    label: "Minecraft",
    short: "MC",
    tag: "bg-emerald-400/10 text-emerald-500 border-emerald-400/30",
    art: art("#1f6b45", "#0d2016", "rgba(134,239,172,0.35)"),
    icon: "pickaxe",
  },
  "7d2d": {
    label: "7 Days to Die",
    short: "7D2D",
    tag: "bg-rose-400/10 text-rose-500 border-rose-400/30",
    art: art("#7a2618", "#1c0c0a", "rgba(251,146,60,0.32)"),
    icon: "skull",
  },
  hytale: {
    label: "Hytale",
    short: "Hytale",
    tag: "bg-amber-400/10 text-amber-500 border-amber-400/30",
    art: art("#7c5312", "#1b1308", "rgba(253,224,71,0.3)"),
    icon: "castle",
  },
  palworld: {
    label: "Palworld",
    short: "Palworld",
    tag: "bg-sky-400/10 text-sky-500 border-sky-400/30",
    art: art("#1c5a86", "#0a1826", "rgba(125,211,252,0.32)"),
    icon: "paw",
  },
  enshrouded: {
    label: "Enshrouded",
    short: "Enshrouded",
    tag: "bg-violet-400/10 text-violet-500 border-violet-400/30",
    art: art("#4a2a7a", "#130c21", "rgba(196,181,253,0.32)"),
    icon: "flame",
  },
  valheim: {
    label: "Valheim",
    short: "Valheim",
    tag: "bg-teal-400/10 text-teal-500 border-teal-400/30",
    art: art("#1d5a5a", "#0a1a1c", "rgba(153,246,228,0.3)"),
    icon: "axe",
  },
  vrising: {
    label: "V Rising",
    short: "V Rising",
    tag: "bg-fuchsia-400/10 text-fuchsia-500 border-fuchsia-400/30",
    art: art("#5c1033", "#1a060f", "rgba(244,114,182,0.32)"),
    icon: "droplet",
  },
  projectzomboid: {
    label: "Project Zomboid",
    short: "PZ",
    tag: "bg-lime-400/10 text-lime-600 border-lime-400/30",
    art: art("#3d4a1a", "#12160a", "rgba(190,242,100,0.28)"),
    icon: "biohazard",
  },
};

export function gameMeta(type: string | undefined): GameMeta {
  return (
    (type && GAME_META[type]) || {
      label: type || "Unknown",
      short: type || "?",
      tag: "bg-slate-400/10 text-slate-400 border-slate-400/30",
      art: art("#3a3150", "#140f1e", "rgba(167,139,250,0.3)"),
      icon: "server",
    }
  );
}

export interface StatusMeta {
  label: string;
  /** CSS color for pills, meters and dots */
  tone: string;
  dot: string;
  text: string;
}

export const STATUS_META: Record<string, StatusMeta> = {
  running: { label: "Online", tone: "var(--green)", dot: "bg-den-green animate-[pulse_2.4s_ease-in-out_infinite]", text: "text-den-green" },
  starting: { label: "Starting…", tone: "var(--accent-bright)", dot: "bg-den-accent animate-pulse", text: "text-den-accent" },
  stopping: { label: "Stopping…", tone: "var(--accent-bright)", dot: "bg-den-accent animate-pulse", text: "text-den-accent" },
  stopped: { label: "Offline", tone: "var(--text-dim)", dot: "bg-den-text-dim", text: "text-den-text-dim" },
};

export function statusMeta(status: string | undefined): StatusMeta {
  return STATUS_META[status || "stopped"] || STATUS_META.stopped;
}
