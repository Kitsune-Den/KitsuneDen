import { Pickaxe, Skull, Castle, PawPrint, Flame, Axe, Server } from "lucide-react";
import { gameMeta, type GameIcon } from "@/lib/game-meta";

const ICONS: Record<GameIcon, typeof Server> = {
  pickaxe: Pickaxe,
  skull: Skull,
  castle: Castle,
  paw: PawPrint,
  flame: Flame,
  axe: Axe,
  server: Server,
};

export function GameIconGlyph({ type, size = 16, className }: { type: string; size?: number; className?: string }) {
  const Icon = ICONS[gameMeta(type).icon];
  return <Icon size={size} className={className} aria-hidden />;
}

/** Card artwork: per-game gradient with a large faded glyph, no image assets needed. */
export default function GameArt({ type, className = "", glyph = 120 }: { type: string; className?: string; glyph?: number }) {
  const meta = gameMeta(type);
  const Icon = ICONS[meta.icon];
  return (
    <div className={`absolute inset-0 overflow-hidden ${className}`} style={{ background: meta.art }} aria-hidden>
      <Icon
        size={glyph}
        strokeWidth={1.25}
        className="absolute right-4 top-3 text-white/15 rotate-[-8deg]"
      />
    </div>
  );
}
