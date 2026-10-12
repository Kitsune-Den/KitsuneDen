/**
 * 7 Days to Die 3.0+ Sandbox codes - the encoder/decoder the game itself uses.
 *
 * 3.0 ("Dead Hot Summer") moved the world/gameplay ruleset out of
 * serverconfig.xml and into the in-game Sandbox, then squeezed the whole thing
 * into one `SandboxCode` property. Until now the panel could only pass that
 * string through: the operator generated it in-game and pasted it. This module
 * reads and writes it directly, so the settings can be edited in the panel.
 *
 * Ported from PackRelay (packages/adapters/src/seven-days-sandbox.ts); keep the
 * two in step. Pure, so the config editor encodes live in the browser with the
 * table the /api/7d2d-sandbox route hands it.
 *
 * THE FORMAT (SandboxOptionPreset.saveOptionsToCode / LoadOptionsFromCode):
 *
 *     code   := <version letter> <triple>*
 *     triple := <option index, base 26, two letters> <value index, one letter>
 *
 * "AA" is option 0, "AB" is 1, ... "GI" is 164; the third letter indexes into
 * that option's own list of allowed values ("A" = the first). Options at their
 * default are simply left out - loading a code resets everything to default
 * first - and the game emits them in category order. There is no checksum and
 * no escaping: a code is exactly 1 + 3n letters.
 *
 * The option list and the value list behind each letter are hardcoded in the
 * game assembly and DIFFER BETWEEN VERSIONS, so every function here takes a
 * table (see ./seven-days-sandbox-tables and PackRelay's scripts/extract-sandbox-options.mjs).
 * The version letter is only bumped for format changes, never for table
 * changes, so a code carries no usable hint about which game version wrote it.
 * `sandboxDrift` is the honest answer to "will this code mean the same thing
 * over there".
 */

const A = 65; // 'A'

/** Value indices are one letter, so no option may offer more than 26 values. */
export const SANDBOX_MAX_VALUES = 26;
/** Option indices are two letters (26 * 26). */
export const SANDBOX_MAX_OPTIONS = 676;

export type SandboxValueKind = "float" | "int" | "bool";

export interface SandboxValue {
  /** The value the game applies - the number/flag, not the display text. */
  value: number | boolean;
  /** How the game's own menu labels it ("150%", "3 Days", "Nightmare"). */
  label: string;
}

export interface SandboxValueSet {
  kind: SandboxValueKind;
  /** Index order IS the wire format - never reorder, only append. */
  values: SandboxValue[];
}

export interface SandboxOptionDef {
  /** Position in the game's SandboxOptions enum - the two-letter code index. */
  index: number;
  /** Registration order, which is the order the game writes options in. */
  order: number;
  name: string;
  label: string;
  category: string;
  description: string;
  kind: SandboxValueKind;
  valueSet: string;
  defaultIndex: number;
}

export interface SandboxTable {
  /** Game minor version this table was extracted from ("3.0", "3.1"). */
  version: string;
  gameVersion: string;
  /** The code's leading letter for this version ("A"). */
  codeVersion: string;
  source: string;
  strings?: string;
  /** Category keys in the game's own tab order. These are CODE names; the
   *  game's tabs show the localized ones - "General" is labelled "Player". */
  categories: string[];
  /** Category key -> the name the game's own tab shows. */
  categoryLabels?: Record<string, string>;
  valueSets: Record<string, SandboxValueSet>;
  options: SandboxOptionDef[];
  /** The game's built-in presets, if they could be extracted. */
  presets?: SandboxPreset[];
}

/** A built-in preset - the difficulties and the Official set. A preset is
 *  nothing but a name and a SandboxCode, which is why the panel can offer them
 *  the moment it can read a code. */
export interface SandboxPreset {
  /** The name in the game's XML ("True Survivalist"). */
  name: string;
  /** The name the game DISPLAYS, which can differ ("Survivalist"). */
  label: string;
  description: string;
  group: string;
  groupLabel: string;
  /** The game's own skull rating, 1 (easiest) to 9. */
  rating?: number;
  /** The one the game starts a new world on (Adventurer). */
  isDefault?: boolean;
  /** Empty for Nomad, which IS the defaults. */
  code: string;
}

/** One option/value pair read out of a code. */
export interface SandboxEntry {
  option: SandboxOptionDef;
  valueIndex: number;
  value: SandboxValue;
}

/** A triple the table can't make sense of - an option this version doesn't
 *  have, or a value index outside that option's list. The game skips these
 *  silently; we keep them so the panel can say so, and so a save doesn't
 *  quietly drop settings a newer server understands. */
export interface SandboxUnknownEntry {
  optionIndex: number;
  valueIndex: number;
  /** The three letters as written. */
  raw: string;
  reason: "unknown-option" | "value-out-of-range";
}

export interface DecodedSandbox {
  /** False when the string isn't a code for this table at all. */
  ok: boolean;
  /** Why not, when !ok. */
  error?: "empty" | "wrong-version" | "not-letters";
  /** The code's leading letter, whatever it was. */
  codeVersion: string;
  entries: SandboxEntry[];
  unknown: SandboxUnknownEntry[];
  /** Leftover characters when the length isn't 1 + 3n. The game ignores them. */
  trailing: string;
}

// ------------------------------------------------------------- letter maths

/** 0-25 -> "A"-"Z". Mirrors SandboxOptionManager.IndexToAlpha. */
export function indexToAlpha(index: number): string {
  if (!Number.isInteger(index) || index < 0 || index >= SANDBOX_MAX_VALUES)
    throw new RangeError(`sandbox value index out of range: ${index}`);
  return String.fromCharCode(A + index);
}

/** 0-675 -> "AA"-"ZZ". Mirrors SandboxOptionManager.IndexToAlpha2. */
export function indexToAlpha2(index: number): string {
  if (!Number.isInteger(index) || index < 0 || index >= SANDBOX_MAX_OPTIONS)
    throw new RangeError(`sandbox option index out of range: ${index}`);
  return (
    String.fromCharCode(A + Math.floor(index / 26)) +
    String.fromCharCode(A + (index % 26))
  );
}

/** "A"-"Z" -> 0-25, or -1 if it isn't a letter. */
export function alphaToIndex(value: string): number {
  const c = value.toUpperCase().charCodeAt(0) - A;
  return c >= 0 && c < 26 ? c : -1;
}

/** "AA"-"ZZ" -> 0-675, or -1 if either character isn't a letter. */
export function alpha2ToIndex(value: string): number {
  if (value.length !== 2) return -1;
  const hi = alphaToIndex(value[0] as string);
  const lo = alphaToIndex(value[1] as string);
  return hi < 0 || lo < 0 ? -1 : hi * 26 + lo;
}

// -------------------------------------------------------------------- table

/** Look an option up by its game name ("BloodMoonFrequency"). */
export function sandboxOption(
  table: SandboxTable,
  name: string,
): SandboxOptionDef | undefined {
  return table.options.find((o) => o.name === name);
}

/** The values an option can take, in wire order. */
export function sandboxValues(
  table: SandboxTable,
  option: SandboxOptionDef,
): SandboxValue[] {
  return table.valueSets[option.valueSet]?.values ?? [];
}

/** Every option at its default, as the editor's starting point. */
export function sandboxDefaults(table: SandboxTable): Record<string, number> {
  const out: Record<string, number> = {};
  for (const o of table.options) out[o.name] = o.defaultIndex;
  return out;
}

// ------------------------------------------------------------------- decode

/**
 * Read a code against a table. Never throws: a malformed code comes back with
 * `ok: false`, and individual triples this version can't place land in
 * `unknown` rather than being dropped - the same triples the game itself would
 * skip, but visible instead of silent.
 */
export function decodeSandboxCode(
  code: string,
  table: SandboxTable,
): DecodedSandbox {
  const raw = (code ?? "").trim();
  const base: DecodedSandbox = {
    ok: false,
    codeVersion: raw.slice(0, 1),
    entries: [],
    unknown: [],
    trailing: "",
  };
  if (raw === "") return { ...base, error: "empty" };
  if (!/^[A-Za-z]+$/.test(raw)) return { ...base, error: "not-letters" };
  if (raw[0]?.toUpperCase() !== table.codeVersion)
    return { ...base, error: "wrong-version" };

  const body = raw.slice(1);
  const count = Math.floor(body.length / 3);
  const byIndex = new Map(table.options.map((o) => [o.index, o]));
  const entries: SandboxEntry[] = [];
  const unknown: SandboxUnknownEntry[] = [];
  const seen = new Set<number>();

  for (let i = 0; i < count; i++) {
    const triple = body.slice(i * 3, i * 3 + 3);
    const optionIndex = alpha2ToIndex(triple.slice(0, 2));
    const valueIndex = alphaToIndex(triple[2] as string);
    const option = byIndex.get(optionIndex);
    if (!option) {
      unknown.push({
        optionIndex,
        valueIndex,
        raw: triple,
        reason: "unknown-option",
      });
      continue;
    }
    const value = sandboxValues(table, option)[valueIndex];
    if (!value) {
      unknown.push({
        optionIndex,
        valueIndex,
        raw: triple,
        reason: "value-out-of-range",
      });
      continue;
    }
    // A repeated option would make the game's Dictionary.Add throw on load;
    // keep the first, which is what a hand-edited code most likely meant.
    if (seen.has(optionIndex)) continue;
    seen.add(optionIndex);
    entries.push({ option, valueIndex, value });
  }

  return {
    ...base,
    ok: true,
    entries,
    unknown,
    trailing: body.slice(count * 3),
  };
}

/**
 * A code as a full option-name -> value-index map: every option in the table,
 * at its default unless the code says otherwise. This is what the editor binds
 * to, and it matches what the server ends up running (loading a code resets
 * everything to default first).
 */
export function sandboxSelectionFromCode(
  code: string,
  table: SandboxTable,
): Record<string, number> {
  const out = sandboxDefaults(table);
  const decoded = decodeSandboxCode(code, table);
  for (const e of decoded.entries) out[e.option.name] = e.valueIndex;
  return out;
}

// ------------------------------------------------------------------- encode

export interface EncodeOptions {
  /** Triples for options this table doesn't know, carried over from the code
   *  being edited so a save doesn't strip settings a newer game understands. */
  passthrough?: SandboxUnknownEntry[];
}

/**
 * Write a code from an option-name -> value-index map. Options at their
 * default and options the table doesn't have are left out, and the rest are
 * emitted in the game's own order - so for a given set of settings this
 * produces the byte-identical string the game would.
 *
 * Throws on a value index the option can't take: that's a programming error,
 * not user input, and writing it would produce a code the game silently
 * reinterprets.
 */
export function encodeSandboxCode(
  selection: Record<string, number>,
  table: SandboxTable,
  opts: EncodeOptions = {},
): string {
  const chosen: { option: SandboxOptionDef; valueIndex: number }[] = [];
  for (const [name, valueIndex] of Object.entries(selection)) {
    const option = sandboxOption(table, name);
    if (!option) continue;
    if (valueIndex === option.defaultIndex) continue;
    const values = sandboxValues(table, option);
    if (
      !Number.isInteger(valueIndex) ||
      valueIndex < 0 ||
      valueIndex >= values.length
    )
      throw new RangeError(
        `sandbox option ${name}: value index ${valueIndex} is outside its ${values.length} values`,
      );
    chosen.push({ option, valueIndex });
  }
  chosen.sort((a, b) => a.option.order - b.option.order);

  let out = table.codeVersion;
  for (const { option, valueIndex } of chosen)
    out += indexToAlpha2(option.index) + indexToAlpha(valueIndex);
  for (const u of opts.passthrough ?? []) out += u.raw.toUpperCase();
  return out;
}

// -------------------------------------------------------------------- drift

export interface SandboxDriftEntry {
  optionIndex: number;
  /** What the code sets on each side; null when that version has no such option. */
  from: { name: string; label: string; value: SandboxValue } | null;
  to: { name: string; label: string; value: SandboxValue } | null;
}

/**
 * What a code would do differently on another game version.
 *
 * Option indices have been stable so far (3.0 even reserved two empty enum
 * slots that 3.1 later filled), but VALUE LISTS have not: 3.1 prepended a
 * value to the biome enemy-density list, so every letter for that option means
 * something different there. Since the version letter didn't change, nothing in
 * the code itself reveals this - only comparing the tables does.
 *
 * Returns one entry per option whose applied value differs (or that only one of
 * the two versions has). Empty means the code is safe to move across.
 */
export function sandboxDrift(
  code: string,
  from: SandboxTable,
  to: SandboxTable,
): SandboxDriftEntry[] {
  const a = decodeSandboxCode(code, from);
  const b = decodeSandboxCode(code, to);
  if (!a.ok || !b.ok) return [];
  const bByIndex = new Map(b.entries.map((e) => [e.option.index, e]));
  const out: SandboxDriftEntry[] = [];
  for (const e of a.entries) {
    const other = bByIndex.get(e.option.index);
    if (
      other &&
      other.value.value === e.value.value &&
      other.option.name === e.option.name
    )
      continue;
    out.push({
      optionIndex: e.option.index,
      from: { name: e.option.name, label: e.option.label, value: e.value },
      to: other
        ? {
            name: other.option.name,
            label: other.option.label,
            value: other.value,
          }
        : null,
    });
  }
  // Options the target version applies that the source one never had.
  for (const e of b.entries)
    if (!a.entries.some((x) => x.option.index === e.option.index))
      out.push({
        optionIndex: e.option.index,
        from: null,
        to: { name: e.option.name, label: e.option.label, value: e.value },
      });
  return out.sort((x, y) => x.optionIndex - y.optionIndex);
}

// ------------------------------------------------------------------ presets

/** The full option-name -> value-index map a preset produces. A preset is
 *  applied the same way a code is loaded: everything back to default first,
 *  then the preset's own values on top. */
export function sandboxSelectionFromPreset(
  preset: SandboxPreset,
  table: SandboxTable,
): Record<string, number> {
  return sandboxSelectionFromCode(preset.code, table);
}

/**
 * Which preset the current settings ARE, if any.
 *
 * Compared by resolved values rather than by code text: a preset's code lists
 * its options in whatever order the game's designers saved it, so two codes
 * that mean the same thing need not be the same string. Returns null for
 * settings that match no preset - the game calls that "Custom".
 */
export function sandboxPresetMatching(
  selection: Record<string, number>,
  table: SandboxTable,
): SandboxPreset | null {
  const differs = (a: Record<string, number>) =>
    table.options.some(
      (o) =>
        (selection[o.name] ?? o.defaultIndex) !== (a[o.name] ?? o.defaultIndex),
    );
  for (const preset of table.presets ?? [])
    if (!differs(sandboxSelectionFromPreset(preset, table))) return preset;
  return null;
}

// ------------------------------------------------------------------ summary

export interface SandboxSummaryEntry {
  name: string;
  label: string;
  category: string;
  value: string;
  /** The value it would have without this code, for a "changed from" line. */
  defaultValue: string;
}

/** A code in plain language - what it changes, in the game's own wording.
 *  For read-only display (activity log, a config diff, the CLI). */
export function describeSandboxCode(
  code: string,
  table: SandboxTable,
): SandboxSummaryEntry[] {
  return decodeSandboxCode(code, table).entries.map((e) => ({
    name: e.option.name,
    label: e.option.label,
    category: e.option.category,
    value: e.value.label,
    defaultValue:
      sandboxValues(table, e.option)[e.option.defaultIndex]?.label ?? "",
  }));
}
