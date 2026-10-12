/**
 * Valheim's settings, kept by the Den in kitsuneden-valheim.json beside the
 * server and turned into launch flags at every start: Valheim has no config
 * file of its own, only its command line.
 *
 * The flag rules here were measured by PackRelay on real servers:
 *  - -nographics -batchmode -name -port -world -password are what the
 *    vendor's own .bat passes. Without them valheim_server.exe boots like a
 *    windowed client and exits about ten seconds in.
 *  - The join password must be 5+ characters and must not appear inside the
 *    server name or the world name, or the server logs it and exits (which
 *    reads as a crash loop).
 *  - Flags are read left to right and -preset resets every modifier, so
 *    -preset goes before -modifier and -setkey (PackRelay #786).
 *  - -savedir keeps the world in the server folder instead of the shared
 *    AppData\LocalLow\IronGate profile, where servers collide and per-server
 *    backups can't reach.
 */

import { randomInt } from "crypto";

export const SETTINGS_FILE = "kitsuneden-valheim.json";
/** Relative to the server folder; Valheim resolves it against the working dir. */
export const SAVE_DIR = "valheim-data";
/** Under the server folder; the adapter passes it to Unity's -logFile as an absolute path. */
export const LOG_FILE = "logs/valheim-server.log";

/** "" is the game's own default for every choice below. */
export const PRESETS = ["", "casual", "easy", "normal", "hard", "hardcore", "immersive", "hammer"] as const;
export const MODIFIERS = {
  combat: ["", "veryeasy", "easy", "hard", "veryhard"],
  deathpenalty: ["", "casual", "veryeasy", "easy", "hard", "hardcore"],
  resources: ["", "muchless", "less", "more", "muchmore", "most"],
  raids: ["", "none", "muchless", "less", "more", "muchmore"],
  portals: ["", "casual", "hard", "veryhard"],
} as const;
export const SET_KEYS = ["nobuildcost", "playerevents", "passivemobs", "nomap"] as const;

type Modifier = keyof typeof MODIFIERS;
type SetKey = (typeof SET_KEYS)[number];

export type ValheimSettings = {
  name: string;
  world: string;
  password: string;
  /** Listed in the community server browser. */
  public: boolean;
  /** Join through PlayFab's relay with a join code; needed for Xbox/Game Pass players. */
  crossplay: boolean;
  preset: string;
  /** Seconds between autosaves. Also the most a stop can lose: Valheim has no console to be told to save. */
  saveinterval: number;
  /** How many of its own world backups Valheim keeps. */
  backups: number;
} & Record<Modifier, string> &
  Record<SetKey, boolean>;

/**
 * Ten minutes, against the game's thirty. A Den stop is a kill (no console,
 * and Windows gives a detached process no Ctrl+C), so the autosave interval
 * is the most a stop can cost. Raise it if saves hitch on a big world.
 */
export const DEN_SAVE_INTERVAL = 600;

/** Same alphabet as PackRelay: no 0/O, 1/l/i, so it reads out loud cleanly. */
export function generatePassword(): string {
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
  return Array.from({ length: 10 }, () => alphabet[randomInt(alphabet.length)]).join("");
}

export function defaultSettings(serverName: string): ValheimSettings {
  return {
    name: serverName || "Kitsune Den - Valheim",
    world: "Dedicated",
    password: generatePassword(),
    public: true,
    crossplay: false,
    preset: "",
    combat: "",
    deathpenalty: "",
    resources: "",
    raids: "",
    portals: "",
    nobuildcost: false,
    playerevents: false,
    passivemobs: false,
    nomap: false,
    saveinterval: DEN_SAVE_INTERVAL,
    backups: 4,
  };
}

/**
 * Settings over a base: the defaults when reading a hand-edited file, the
 * current settings when saving, so a save missing a key never swaps in a
 * fresh default (a new random password, say).
 */
export function normalizeSettings(
  raw: Record<string, unknown>,
  serverName: string,
  base: ValheimSettings = defaultSettings(serverName)
): ValheimSettings {
  const out = { ...base } as Record<string, unknown>;
  for (const [key, fallback] of Object.entries(base)) {
    const value = raw[key];
    if (typeof value === typeof fallback) out[key] = value;
  }
  return out as ValheimSettings;
}

/** Why Valheim would refuse these settings, or null when it won't. */
export function validateSettings(s: ValheimSettings): string | null {
  if (!s.name.trim()) return "Valheim needs a server name.";
  if (!s.world.trim()) return "Valheim needs a world name.";
  const password = s.password;
  if (password) {
    if (password.length < 5) return "Valheim needs a join password of at least 5 characters.";
    if (s.name.includes(password)) return "Valheim will not start with the join password inside the server name.";
    if (s.world.includes(password)) return "Valheim will not start with the join password inside the world name.";
  }
  if (s.preset && !(PRESETS as readonly string[]).includes(s.preset)) return `Unknown preset "${s.preset}".`;
  for (const [modifier, allowed] of Object.entries(MODIFIERS)) {
    const value = s[modifier as Modifier];
    if (value && !(allowed as readonly string[]).includes(value)) return `Unknown ${modifier} setting "${value}".`;
  }
  if (!Number.isInteger(s.saveinterval) || s.saveinterval < 60) return "Autosave needs to be at least 60 seconds.";
  if (!Number.isInteger(s.backups) || s.backups < 0) return "Backups needs to be 0 or more.";
  return null;
}

/**
 * The command line, in the order Valheim needs: identity and network first,
 * then -preset, then the modifiers and keys it would otherwise reset.
 */
export function launchArgs(s: ValheimSettings, port: number, logPath: string): string[] {
  const args = ["-nographics", "-batchmode", "-name", s.name, "-port", String(port), "-world", s.world];
  if (s.password) args.push("-password", s.password);
  args.push(
    "-public", s.public ? "1" : "0",
    // Relative, resolved against the server folder (the working directory),
    // as PackRelay runs it.
    "-savedir", SAVE_DIR,
    "-logFile", logPath,
    "-saveinterval", String(s.saveinterval),
    "-backups", String(s.backups)
  );
  // Valheim reads -crossplay by presence; there's no "off" spelling.
  if (s.crossplay) args.push("-crossplay");
  if (s.preset) args.push("-preset", s.preset);
  for (const modifier of Object.keys(MODIFIERS) as Modifier[]) {
    if (s[modifier]) args.push("-modifier", modifier, s[modifier]);
  }
  for (const key of SET_KEYS) {
    if (s[key]) args.push("-setkey", key);
  }
  return args;
}
