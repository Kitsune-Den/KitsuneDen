/**
 * 7 Days to Die serverconfig.xml helpers, shared by the adapter (read/write on
 * disk) and the config editor (which settings to show).
 *
 * 7D2D 3.0 ("Dead Hot Summer") moved the world/gameplay ruleset out of
 * serverconfig.xml and into the in-game Sandbox, carried as a single
 * `SandboxCode` property. On a 3.x server the old individual settings below are
 * overwritten from the Sandbox at load, so editing them does nothing. 3.3
 * (v3.30 b18) keeps the same mechanism and the same key set; its stock
 * serverconfig.xml ships without any of them.
 *
 * Pure (no fs) so the client component can import it.
 */

/** The property 7D2D 3.x uses to carry the whole world/gameplay ruleset. */
export const SANDBOX_CODE_KEY = "SandboxCode";

/** The code the stock 3.3 serverconfig.xml ships with. Its comment calls it
 *  Adventurer, but against 3.3's presets it's Adventurer plus Block and Terrain
 *  Damage at 150%, so the Sandbox editor shows it as Custom. Used as-is because
 *  it's what a fresh 3.3 install runs. */
export const STOCK_SANDBOX_CODE = "AAAJABJACJADJARFBNC";

/**
 * Settings a 3.x server takes from the SandboxCode instead of serverconfig.xml.
 * Mirrors the governed sets in PackRelay (seven-days-config.ts) and
 * KitsuneCommand (ServerConfigFieldDefinitions.cs), which were derived from the
 * game assembly: EnumGamePrefs members that share a name with a SandboxOptions
 * member, plus the prefs the Sandbox writes back from a differently-named
 * option (BlockDamagePlayer from Block Damage, LootAbundance from Global Loot
 * Count, GameDifficulty from the difficulty preset, EnemyDifficulty from Max
 * Enemy Tier).
 */
export const SANDBOX_GOVERNED_KEYS: ReadonlySet<string> = new Set([
  "GameDifficulty",
  "BlockDamagePlayer",
  "EnemyDifficulty",
  "LootAbundance",
  "DeathPenalty",
  "DropOnDeath",
  "DropOnQuit",
  "DayNightLength",
  "DayLightLength",
  "QuestProgressionDailyLimit",
  "JarRefund",
  "BiomeProgression",
  "StormFreq",
  "BlockDamageAI",
  "BlockDamageAIBM",
  "XPMultiplier",
  "EnemySpawnMode",
  "ZombieFeralSense",
  "ZombieMove",
  "ZombieMoveNight",
  "ZombieFeralMove",
  "ZombieBMMove",
  "AISmellMode",
  "BloodMoonFrequency",
  "BloodMoonRange",
  "BloodMoonWarning",
  "BloodMoonEnemyCount",
  "LootRespawnDays",
  "LootTimer",
  "AirDropFrequency",
  "AirDropMarker",
]);

/** Pull the major version out of anything 7D2D calls a version: the log line
 *  ("V 3.3.0 (b18)"), a bare "3.3", or "v3". Null when it says nothing. */
export function sevenDaysMajorVersion(version?: string | null): number | null {
  const m = (version ?? "").match(/(\d+)(?:\.\d+)?/);
  return m ? Number(m[1]) : null;
}

/**
 * True when the server runs the 3.x Sandbox ruleset. A SandboxCode in the
 * config is proof on its own (2.x configs never carry one); otherwise the
 * version the game reported in its log decides, which catches a 3.x install
 * still running an old 2.x-shaped serverconfig.xml.
 */
export function isSandboxEra(
  config: Record<string, unknown>,
  gameVersion?: string | null,
): boolean {
  if (Object.prototype.hasOwnProperty.call(config, SANDBOX_CODE_KEY)) return true;
  const major = sevenDaysMajorVersion(gameVersion);
  return major !== null && major >= 3;
}

/** The game's self-reported version from its log ("V 3.3.0 (b18)"). The last
 *  boot wins when a log spans several. Null when no version line is present. */
export function sevenDaysVersionFromLog(log: string): string | null {
  const all = [...log.matchAll(/INF Version:\s*(V\s*[\d.]+\s*\([^)]+\))/g)];
  return all.at(-1)?.[1] ?? null;
}

const COMMENT_SPLIT = /(<!--[\s\S]*?-->)/;
const PROPERTY_RE = /<property\s+name="([^"]+)"\s+value="([^"]*)"\s*\/>/g;

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Escape a value for a double-quoted XML attribute. Newlines and tabs become
 * character references so attribute-value normalization doesn't turn them
 * into spaces. Also used for serveradmin.xml (player names, ban reasons). */
export function xmlEscape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/\r/g, "&#13;")
    .replace(/\n/g, "&#10;")
    .replace(/\t/g, "&#9;");
}

const NAMED_ENTITIES: Record<string, string> = { amp: "&", quot: '"', apos: "'", lt: "<", gt: ">" };

/** Decode the predefined entities and numeric character references in one
 * pass (so "&amp;quot;" stays "&quot;"). Malformed references are left as-is. */
export function xmlUnescape(s: string): string {
  return s.replace(/&(?:#(\d+)|#x([0-9a-fA-F]+)|(amp|quot|apos|lt|gt));/g, (match, dec, hex, name) => {
    if (name) return NAMED_ENTITIES[name];
    const code = dec !== undefined ? parseInt(dec, 10) : parseInt(hex, 16);
    try {
      return String.fromCodePoint(code);
    } catch {
      return match;
    }
  });
}

/** 7D2D property names are plain identifiers. Anything else is refused: the
 * name is written into the file unescaped. */
const PROPERTY_NAME = /^[A-Za-z][A-Za-z0-9_.-]*$/;

/**
 * Read every live property into a name→value map. Commented-out properties are
 * skipped: the stock 3.x file ships `<!-- <property name="UserDataFolder" …/> -->`,
 * which the game ignores and so must the editor.
 */
export function parseServerConfigXml(xml: string): Record<string, string> {
  const props: Record<string, string> = {};
  const live = xml
    .split(COMMENT_SPLIT)
    .filter((_, i) => i % 2 === 0)
    .join("");
  for (const m of live.matchAll(PROPERTY_RE)) {
    props[xmlUnescape(m[1])] = xmlUnescape(m[2]);
  }
  return props;
}

/**
 * Set properties in place, preserving comments, ordering and whitespace.
 * Only live properties are replaced; a key that's missing (or only present
 * inside a comment) is appended before `</ServerSettings>`. Values are
 * XML-escaped, so a quote in a server description can't break the file.
 * Throws (before changing anything) on a property name that isn't an
 * identifier.
 */
export function patchServerConfigXml(xml: string, changes: Record<string, string>): string {
  for (const key of Object.keys(changes)) {
    if (!PROPERTY_NAME.test(key)) throw new Error(`Invalid config property name: ${JSON.stringify(key)}`);
  }
  const parts = xml.split(COMMENT_SPLIT);
  const added: string[] = [];
  for (const [key, value] of Object.entries(changes)) {
    const re = new RegExp(`(<property\\s+name="${escapeRe(key)}"\\s+value=")([^"]*)("\\s*/>)`, "g");
    const escaped = xmlEscape(value);
    let found = false;
    // Even indices are the text between comments; odd ones are the comments.
    for (let i = 0; i < parts.length; i += 2) {
      parts[i] = parts[i].replace(re, (_m, open: string, _old: string, close: string) => {
        found = true;
        return `${open}${escaped}${close}`;
      });
    }
    if (!found) {
      added.push(`\t<property name="${key}"\t\t\t\tvalue="${escaped}"/>`);
    }
  }
  const out = parts.join("");
  // Insert new properties before the closing </ServerSettings> tag
  if (added.length === 0) return out;
  const insertBlock = "\n\t<!-- Added by Dashboard -->\n" + added.join("\n") + "\n";
  return out.replace(/[\t ]*<\/ServerSettings>/, (closing) => insertBlock + closing);
}
