/**
 * Display metadata for each game type: the human name, a short tag for
 * tight spaces, and the tag colors. One place, so the switcher, topbar and
 * dashboard never disagree about what a Palworld chip looks like.
 */

export interface GameMeta {
  label: string;
  short: string;
  /** Tailwind classes for a tinted tag: background, text, border */
  tag: string;
}

const GAME_META: Record<string, GameMeta> = {
  minecraft: { label: "Minecraft", short: "MC", tag: "bg-emerald-400/10 text-emerald-300 border-emerald-400/25" },
  "7d2d": { label: "7 Days to Die", short: "7D2D", tag: "bg-rose-400/10 text-rose-300 border-rose-400/25" },
  hytale: { label: "Hytale", short: "Hytale", tag: "bg-amber-400/10 text-amber-300 border-amber-400/25" },
  palworld: { label: "Palworld", short: "Palworld", tag: "bg-sky-400/10 text-sky-300 border-sky-400/25" },
  enshrouded: { label: "Enshrouded", short: "Enshrouded", tag: "bg-violet-400/10 text-violet-300 border-violet-400/25" },
};

export function gameMeta(type: string | undefined): GameMeta {
  return (
    (type && GAME_META[type]) || {
      label: type || "Unknown",
      short: type || "?",
      tag: "bg-slate-400/10 text-slate-300 border-slate-400/25",
    }
  );
}

export const STATUS_META: Record<string, { label: string; dot: string; text: string }> = {
  running: { label: "Online", dot: "bg-den-green animate-[pulse_2.4s_ease-in-out_infinite]", text: "text-den-green" },
  starting: { label: "Starting…", dot: "bg-den-amber animate-pulse", text: "text-den-amber" },
  stopping: { label: "Stopping…", dot: "bg-den-amber animate-pulse", text: "text-den-amber" },
  stopped: { label: "Offline", dot: "bg-den-red/80", text: "text-den-red" },
};

export function statusMeta(status: string | undefined) {
  return STATUS_META[status || "stopped"] || STATUS_META.stopped;
}
