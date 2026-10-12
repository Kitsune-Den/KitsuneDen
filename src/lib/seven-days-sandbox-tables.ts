/**
 * The extracted Sandbox option tables, one per 7 Days to Die version.
 *
 * These are generated, not hand-written - see PackRelay's scripts/extract-sandbox-options.mjs,
 * which reads them straight out of the game assembly. Adding a version means
 * running that script against the new install and listing the file here; do not
 * edit the JSON by hand, and never "tidy" the option or value ORDER in it,
 * because that order is the wire format of every SandboxCode (see
 * ./seven-days-sandbox).
 */

import sandbox30 from "./sandbox/sandbox-3.0.json";
import sandbox31 from "./sandbox/sandbox-3.1.json";
import sandbox32 from "./sandbox/sandbox-3.2.json";
import sandbox33 from "./sandbox/sandbox-3.3.json";
import type { SandboxTable } from "./seven-days-sandbox";

/** Newest last - `latestSandboxTable` and the fallback below depend on it. */
export const SANDBOX_TABLES: readonly SandboxTable[] = [
  sandbox30 as SandboxTable,
  sandbox31 as SandboxTable,
  sandbox32 as SandboxTable,
  sandbox33 as SandboxTable,
];

export const latestSandboxTable = SANDBOX_TABLES[
  SANDBOX_TABLES.length - 1
] as SandboxTable;

/** Parse a major.minor out of anything 7D2D calls a version: the steamcmd
 *  branch string recorded at install ("v3.0"), the game's own log line
 *  ("V 3.1.0 (b14)"), or a bare "3.1". Null when it says nothing useful -
 *  "latest", "", a named branch. */
export function parseSevenDaysVersion(
  version?: string | null,
): { major: number; minor: number } | null {
  const m = (version ?? "").match(/(\d+)\.(\d+)/);
  if (m) return { major: Number(m[1]), minor: Number(m[2]) };
  // "v3" with no minor still pins the major.
  const only = (version ?? "").match(/^[vV]?(\d+)$/);
  return only ? { major: Number(only[1]), minor: 0 } : null;
}

/**
 * The option table to use for a server on `version`.
 *
 * Exact match when we have that version's table. Otherwise the newest table
 * that isn't ahead of the server, because a table from a LATER version can
 * describe options the server doesn't have (writing one of those produces a
 * code the server ignores). An earlier table is the lesser risk, NOT a safe
 * one: besides missing newer options, the game can shift an existing value
 * list under an unchanged code version letter. 3.2 prepended "Default" to the
 * item-tier values, so the 3.1 table read and wrote Max Loot/Crafting/Trader
 * Quality one tier off on every 3.2 and 3.3 server until those tables were
 * extracted. `sandboxTableIsBehind` lets the editor say when this fallback
 * is in play; the real fix is always extracting the new version's table.
 *
 * Null for pre-3.0, which has no Sandbox at all. An unknown/blank version
 * ("latest") also returns null: guessing which table applies is exactly the
 * mistake that writes a code meaning something else. Callers that know the
 * server is 3.0+ some other way (a SandboxCode in its config) can fall back to
 * `latestSandboxTable` deliberately.
 */
export function sandboxTableFor(version?: string | null): SandboxTable | null {
  const v = parseSevenDaysVersion(version);
  if (!v) return null;
  if (v.major < 3) return null;
  const wanted = `${v.major}.${v.minor}`;
  const exact = SANDBOX_TABLES.find((t) => t.version === wanted);
  if (exact) return exact;
  const older = SANDBOX_TABLES.filter((t) => {
    const tv = parseSevenDaysVersion(t.version);
    return (
      tv &&
      (tv.major < v.major || (tv.major === v.major && tv.minor <= v.minor))
    );
  });
  return older.length > 0 ? (older[older.length - 1] as SandboxTable) : null;
}

/** True when `version` is NEWER than `table` - the case where sandboxTableFor
 *  fell back to the nearest older table because the game has moved on past the
 *  newest one extracted. False when either side names no version. */
export function sandboxTableIsBehind(
  version: string | null | undefined,
  table: SandboxTable,
): boolean {
  const v = parseSevenDaysVersion(version);
  const t = parseSevenDaysVersion(table.version);
  if (!v || !t) return false;
  return v.major > t.major || (v.major === t.major && v.minor > t.minor);
}

/** Table by its own version key ("3.1"), for callers that already know it. */
export function sandboxTableByVersion(
  version: string,
): SandboxTable | undefined {
  return SANDBOX_TABLES.find((t) => t.version === version);
}
