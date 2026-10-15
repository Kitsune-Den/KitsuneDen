"use client";

import { BadgeCheck, FlaskConical, Globe2 } from "lucide-react";
import { GameIconGlyph } from "@/components/instances/GameArt";
import { gameMeta } from "@/lib/game-meta";
import { PROTO_LABEL, serverPorts } from "@/lib/networking";
import { RECIPES, recipeFor, type GameRecipe, type GameType } from "@/lib/recipes";
import { TIER_LABEL, backupText, consoleText, installText } from "@/lib/recipe-text";

const GAME_TYPES = Object.keys(RECIPES) as GameType[];

/** Recipe text marks commands and file names with `backticks`; show them as code. */
function Prose({ text }: { text: string }) {
  return (
    <>
      {text.split("`").map((part, i) =>
        i % 2 === 1 ? (
          <code key={i} className="font-mono text-[11.5px] px-1 rounded bg-den-surface border border-den-border text-den-text">
            {part}
          </code>
        ) : (
          part
        )
      )}
    </>
  );
}

function TierBadge({ recipe }: { recipe: GameRecipe }) {
  const verified = recipe.tier === "verified";
  const Icon = verified ? BadgeCheck : FlaskConical;
  return (
    <span
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10.5px] font-semibold border ${
        verified ? "text-den-green border-den-green/30 bg-den-green/10" : "text-den-amber border-den-amber/40 bg-den-amber/10"
      }`}
    >
      <Icon size={11} aria-hidden="true" />
      {TIER_LABEL[recipe.tier]}
    </span>
  );
}

/** What the Den knows about one game, shown before you add a server for it. */
export function RecipeCard({ recipe }: { recipe: GameRecipe }) {
  const forward = serverPorts({ id: "", name: "", type: recipe.type }).filter((p) => p.public);
  const rows: [string, React.ReactNode][] = [
    ["Install", <Prose key="install" text={installText(recipe)} />],
    ["Console", consoleText(recipe)],
    ["Stop", <Prose key="stop" text={recipe.control.stop} />],
    ["Backups", backupText(recipe)],
    [
      "Forward",
      <span key="ports" className="flex flex-wrap gap-1.5">
        {forward.map((p) => (
          <span
            key={p.field}
            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-den-surface border border-den-border font-mono text-[11px] text-den-text"
          >
            <Globe2 size={11} className="text-den-cyan" aria-hidden="true" />
            {PROTO_LABEL[p.proto]} {p.port}
          </span>
        ))}
      </span>,
    ],
    ["Players join", recipe.connect],
  ];

  return (
    <div className="rounded-lg border border-den-border bg-den-bg/40 px-3.5 py-3 text-[12.5px] leading-snug" aria-live="polite">
      <div className="flex items-center justify-between gap-2">
        <span className="font-semibold text-den-text text-[13px]">{gameMeta(recipe.type).label}</span>
        <TierBadge recipe={recipe} />
      </div>
      <p className="text-[11.5px] text-den-text-dim mt-1">{recipe.evidence}</p>

      <dl className="mt-2.5 space-y-1.5">
        {rows.map(([label, value]) => (
          <div key={label} className="grid grid-cols-[84px_1fr] gap-2">
            <dt className="text-den-text-dim">{label}</dt>
            <dd className="text-den-text-muted min-w-0 break-words">{value}</dd>
          </div>
        ))}
      </dl>

      {recipe.gaps.length > 0 ? (
        <details className="mt-2.5 group">
          <summary className="cursor-pointer text-[12px] font-medium text-den-amber select-none">
            Known gaps ({recipe.gaps.length})
          </summary>
          <ul className="mt-1.5 space-y-1 list-disc pl-4 text-den-text-muted">
            {recipe.gaps.map((gap) => (
              <li key={gap}>
                <Prose text={gap} />
              </li>
            ))}
          </ul>
        </details>
      ) : (
        <p className="mt-2.5 text-[12px] text-den-text-dim">No known gaps.</p>
      )}
    </div>
  );
}

/**
 * Pick the game for a new server. Radio inputs underneath, so arrow keys
 * and screen readers behave like any other choice.
 */
export default function GamePicker({ value, onChange }: { value: string; onChange: (type: GameType) => void }) {
  const recipe = recipeFor(value);
  return (
    <div className="space-y-3">
      <fieldset>
        <legend className="block text-[11px] text-den-text-muted font-medium mb-1.5">Game</legend>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {GAME_TYPES.map((t) => {
            const selected = t === value;
            const meta = gameMeta(t);
            return (
              <label
                key={t}
                className={`relative flex items-center gap-2 px-2 py-2 rounded-lg border cursor-pointer transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-den-cyan/60 ${
                  selected
                    ? "border-den-cyan/60 bg-den-cyan/10"
                    : "border-den-border bg-den-base hover:border-den-border-hover"
                }`}
              >
                <input
                  type="radio"
                  name="add-server-game"
                  value={t}
                  checked={selected}
                  onChange={() => onChange(t)}
                  className="sr-only"
                />
                <span
                  className="w-7 h-7 shrink-0 rounded-md flex items-center justify-center text-white/90"
                  style={{ background: meta.art }}
                >
                  <GameIconGlyph type={t} size={14} />
                </span>
                <span className="min-w-0">
                  <span className={`block text-[12.5px] leading-tight ${selected ? "text-den-text font-semibold" : "text-den-text-muted"}`}>
                    {meta.label}
                  </span>
                  {RECIPES[t].tier === "experimental" && (
                    <span className="flex items-center gap-0.5 text-[10px] text-den-amber leading-tight">
                      <FlaskConical size={9} aria-hidden="true" />
                      {TIER_LABEL.experimental}
                    </span>
                  )}
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>
      {recipe && <RecipeCard recipe={recipe} />}
    </div>
  );
}
