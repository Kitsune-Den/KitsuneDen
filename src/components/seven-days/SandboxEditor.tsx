"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronRight, Copy, Check, RotateCcw } from "lucide-react";
import {
  decodeSandboxCode,
  encodeSandboxCode,
  sandboxDefaults,
  sandboxPresetMatching,
  sandboxSelectionFromCode,
  sandboxSelectionFromPreset,
  sandboxValues,
  type SandboxOptionDef,
  type SandboxTable,
} from "@/lib/seven-days-sandbox";

interface SandboxInfo {
  supported: boolean;
  versionSource?: "log" | "assumed";
  serverVersion?: string | null;
  tableBehind?: boolean;
  table?: SandboxTable;
}

const inputClass =
  "px-3 py-2 bg-den-bg text-den-text text-[13px] rounded-lg border border-den-border focus:border-den-border-light outline-none";

/**
 * The 7D2D 3.x Sandbox editor, ported from PackRelay's SandboxOptions.
 *
 * 3.x keeps the world/gameplay ruleset in one opaque SandboxCode. This decodes
 * it against the option table for the server's game version, lets each option
 * be set directly, and re-encodes the code byte for byte the way the game
 * writes it. It edits the config editor's SandboxCode value, so saving goes
 * through the normal Save bar like every other setting.
 */
export default function SandboxEditor({
  serverId,
  code,
  savedCode,
  onChange,
}: {
  serverId: string;
  /** The SandboxCode as currently edited. */
  code: string;
  /** The SandboxCode on disk, for the per-option unsaved markers. */
  savedCode: string;
  onChange: (code: string) => void;
}) {
  const [info, setInfo] = useState<SandboxInfo | null>(null);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [query, setQuery] = useState("");
  const [copied, setCopied] = useState(false);

  // The parent keys this component by server, so state starts fresh per server.
  useEffect(() => {
    let active = true;
    fetch(`/api/7d2d-sandbox?server=${serverId}`)
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((data: SandboxInfo) => {
        if (!active) return;
        setInfo(data);
        if (data.table) setOpen({ [data.table.categories[0] ?? ""]: true });
      })
      .catch(() => active && setFailed(true));
    return () => {
      active = false;
    };
  }, [serverId]);

  const table = info?.supported ? info.table : undefined;
  const decoded = useMemo(() => (table ? decodeSandboxCode(code, table) : null), [code, table]);
  const selection = useMemo(() => (table ? sandboxSelectionFromCode(code, table) : {}), [code, table]);
  const savedSelection = useMemo(
    () => (table ? sandboxSelectionFromCode(savedCode, table) : {}),
    [savedCode, table]
  );

  const codeInput = (
    <div className="flex flex-col gap-2">
      <label className="text-[13px] text-den-text-muted" htmlFor="sandbox-code">
        Sandbox Code
      </label>
      <div className="flex items-center gap-2">
        <input
          id="sandbox-code"
          type="text"
          value={code}
          onChange={(e) => onChange(e.target.value.trim())}
          spellCheck={false}
          autoComplete="off"
          className={`${inputClass} flex-1 font-mono`}
        />
        <button
          type="button"
          onClick={() => {
            navigator.clipboard.writeText(code);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
          className="flex items-center gap-1.5 px-3 py-2 text-[12px] rounded-lg border border-den-border text-den-text-muted hover:bg-den-surface"
          aria-label="Copy sandbox code"
        >
          {copied ? <Check size={14} /> : <Copy size={14} />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <div className="text-[12px] text-den-text-dim">
        {table
          ? "Edit the options below and the code updates to match, or paste a code copied from the game's Sandbox Options screen."
          : "Paste a code copied from the game's Sandbox Options screen (New Game > Sandbox Options > Copy Code)."}
      </div>
    </div>
  );

  if (!info && !failed) {
    return (
      <div className="space-y-3">
        {codeInput}
        <div className="text-[12px] text-den-text-dim">Loading Sandbox options...</div>
      </div>
    );
  }
  if (failed || !table || !decoded) {
    return (
      <div className="space-y-3">
        {codeInput}
        <div className="text-[12px] text-den-text-dim">
          {failed
            ? "Couldn't load the Sandbox options, so only the raw code can be edited."
            : "The game version couldn't be matched to a Sandbox option table, so only the raw code can be edited."}
        </div>
      </div>
    );
  }

  const encode = (next: Record<string, number>, keepUnknown = true) =>
    encodeSandboxCode(next, table, { passthrough: keepUnknown ? decoded.unknown : [] });
  const set = (name: string, valueIndex: number) => onChange(encode({ ...selection, [name]: valueIndex }));

  // Which preset the settings currently ARE, by resolved values, not code text.
  const presets = table.presets ?? [];
  const current = decoded.ok ? sandboxPresetMatching(selection, table) : null;
  const presetGroups = [...new Set(presets.map((p) => p.group))];
  const applyPreset = (name: string) => {
    const preset = presets.find((p) => p.name === name);
    // Like the game, a preset REPLACES the ruleset rather than layering on top.
    if (preset) onChange(encode(sandboxSelectionFromPreset(preset, table), false));
  };

  const q = query.trim().toLowerCase();
  const matches = (o: SandboxOptionDef) =>
    q === "" || [o.label, o.name, o.description].some((s) => s.toLowerCase().includes(q));
  const visible = table.options.filter(matches);
  const changedCount = table.options.filter((o) => selection[o.name] !== o.defaultIndex).length;

  return (
    <div className="space-y-4">
      {codeInput}

      {info?.versionSource === "assumed" && (
        <div className="text-[12px] text-den-amber">
          {info.serverVersion
            ? `The server reported ${info.serverVersion}, which doesn't name a Sandbox table, so these options assume ${table.gameVersion}.`
            : `The server hasn't logged its version yet, so these options assume ${table.gameVersion}.`}{" "}
          Option letters mean different things across game versions; start the server once so its version is
          known before relying on this.
        </div>
      )}
      {info?.versionSource === "log" && info.tableBehind && (
        <div className="text-[12px] text-den-amber">
          The server runs {info.serverVersion}, newer than the newest Sandbox table here ({table.gameVersion}).
          Options it added won&apos;t show, and an existing option&apos;s values may have shifted. Check the code
          in-game before relying on it.
        </div>
      )}
      {code !== "" && !decoded.ok && (
        <div className="text-[12px] text-den-red">
          {decoded.error === "wrong-version"
            ? `This code starts with "${decoded.codeVersion}", but ${table.gameVersion} codes start with "${table.codeVersion}". The options below show the defaults; changing one replaces the code.`
            : "This isn't a readable Sandbox code. The options below show the defaults; changing one replaces the code."}
        </div>
      )}
      {decoded.unknown.length > 0 && (
        <div className="text-[12px] text-den-text-dim">
          {decoded.unknown.length} setting{decoded.unknown.length === 1 ? "" : "s"} in this code{" "}
          {decoded.unknown.length === 1 ? "isn't" : "aren't"} known to {table.gameVersion}. The game skips{" "}
          {decoded.unknown.length === 1 ? "it" : "them"}; edits here keep {decoded.unknown.length === 1 ? "it" : "them"}{" "}
          in the code.
        </div>
      )}

      <div className="flex flex-wrap items-end gap-3">
        {presets.length > 0 && (
          <div className="flex flex-col gap-2 min-w-[240px]">
            <label className="text-[13px] text-den-text-muted" htmlFor="sandbox-preset">
              Difficulty preset
            </label>
            <select
              id="sandbox-preset"
              value={current?.name ?? ""}
              onChange={(e) => applyPreset(e.target.value)}
              className={inputClass}
            >
              {!current && <option value="">Custom</option>}
              {presetGroups.map((g) => (
                <optgroup key={g} label={presets.find((p) => p.group === g)?.groupLabel ?? g}>
                  {presets
                    .filter((p) => p.group === g)
                    .map((p) => (
                      <option key={p.name} value={p.name}>
                        {p.label}
                        {p.rating ? ` (${p.rating}/9)` : ""}
                      </option>
                    ))}
                </optgroup>
              ))}
            </select>
          </div>
        )}
        <input
          type="search"
          placeholder="Search options"
          aria-label="Search Sandbox options"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className={`${inputClass} flex-1 min-w-[180px]`}
        />
        <button
          type="button"
          onClick={() => onChange(encode(sandboxDefaults(table)))}
          className="flex items-center gap-1.5 px-3 py-2 text-[12px] rounded-lg border border-den-border text-den-text-muted hover:bg-den-surface"
        >
          <RotateCcw size={14} />
          Reset all to defaults
        </button>
      </div>
      <div className="text-[12px] text-den-text-dim">
        {current?.description ??
          `${changedCount} of ${table.options.length} options changed from the defaults (${table.gameVersion}).`}
      </div>

      {q !== "" && visible.length === 0 && (
        <div className="text-[12px] text-den-text-dim">No options match &ldquo;{query}&rdquo;.</div>
      )}

      <div className="space-y-2">
        {table.categories.map((category) => {
          const options = visible.filter((o) => o.category === category);
          if (options.length === 0) return null;
          // A search shows what it found rather than making you open every section.
          const isOpen = q !== "" || (open[category] ?? false);
          const changedHere = options.filter((o) => selection[o.name] !== o.defaultIndex).length;
          const unsavedHere = options.some((o) => selection[o.name] !== savedSelection[o.name]);
          return (
            <section key={category} className="border border-den-border rounded-xl bg-den-surface/40">
              <button
                type="button"
                aria-expanded={isOpen}
                onClick={() => setOpen((p) => ({ ...p, [category]: !(p[category] ?? false) }))}
                className="w-full flex items-center gap-2 px-4 py-3 text-left"
              >
                <ChevronRight
                  size={16}
                  aria-hidden="true"
                  className={`text-den-text-dim transition-transform ${isOpen ? "rotate-90" : ""}`}
                />
                <span className="text-[12px] uppercase tracking-widest text-den-text-dim font-semibold">
                  {table.categoryLabels?.[category] ?? category}
                </span>
                <span className="text-[12px] text-den-text-dim">
                  {options.length}
                  {changedHere > 0 ? ` · ${changedHere} changed` : ""}
                </span>
                {unsavedHere && (
                  <span className="w-[7px] h-[7px] rounded-full bg-den-accent-fill" aria-label="unsaved changes" />
                )}
              </button>
              {isOpen && (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 px-4 pb-4">
                  {options.map((o) => (
                    <OptionField
                      key={o.name}
                      option={o}
                      table={table}
                      value={selection[o.name] ?? o.defaultIndex}
                      unsaved={selection[o.name] !== savedSelection[o.name]}
                      onChange={(v) => set(o.name, v)}
                    />
                  ))}
                </div>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}

function OptionField({
  option,
  table,
  value,
  unsaved,
  onChange,
}: {
  option: SandboxOptionDef;
  table: SandboxTable;
  value: number;
  unsaved: boolean;
  onChange: (valueIndex: number) => void;
}) {
  const values = sandboxValues(table, option);
  const id = `sandbox-${option.name}`;
  return (
    <div className="flex flex-col gap-1.5">
      <label
        htmlFor={id}
        className="text-[13px] text-den-text-muted flex items-center gap-1.5"
        title={`Sandbox option: ${option.name}`}
      >
        {option.label}
        {value !== option.defaultIndex && <span className="text-[11px] text-den-text-dim">(changed)</span>}
        {unsaved && (
          <span className="w-[7px] h-[7px] rounded-full bg-den-accent-fill" title="Unsaved change" aria-label="unsaved" />
        )}
      </label>
      <select id={id} value={value} onChange={(e) => onChange(Number(e.target.value))} className={inputClass}>
        {values.map((v, i) => (
          // Labels aren't unique within a set, so the wire index is the key.
          <option key={i} value={i}>
            {v.label}
            {i === option.defaultIndex ? " (default)" : ""}
          </option>
        ))}
      </select>
      {option.description && (
        // The game's text writes line breaks as a literal "\n".
        <div className="text-[12px] text-den-text-dim whitespace-pre-line">
          {option.description.replace(/\\n/g, "\n")}
        </div>
      )}
    </div>
  );
}
