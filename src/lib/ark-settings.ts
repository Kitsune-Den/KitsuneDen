/**
 * ARK: Survival Evolved and ARK: Survival Ascended. One core, two games.
 *
 * Measured by PackRelay (ASE on Windows and Linux, ASA on Windows):
 *  - Settings ride ONE "travel URL" argument, the map first. Without a map,
 *    ASE sits on its lobby map forever (answering Steam queries, so it looks
 *    up) and ASA idles binding no port at all.
 *  - ?ServerAdminPassword= goes LAST: ASA's parser swallows everything after
 *    it into the password.
 *  - The command line wins over GameUserSettings.ini (an RCON port set only in
 *    the ini was ignored on both games), and the ini doesn't exist before the
 *    first boot, so the Den passes everything on the command line.
 *  - The admin password is the RCON password. RCON `SaveWorld` then `DoExit`
 *    stops cleanly (ASE 3.2 s, ASA 1.4-2.1 s); `ListPlayers` is the roster
 *    and an answered RCON call is the readiness signal.
 *  - ASE writes NO output (0 bytes of stdout and log over hours). ASA logs to
 *    ShooterGame\Saved\Logs\ShooterGame.log, and writes the admin password into
 *    its "Commandline:" line, so the Den redacts it.
 *  - ASE's query port has to stay in the in-game LAN browser's 27015-27020
 *    scan range. ASA answers no Steam query at all.
 *
 * Not measured by PackRelay, so marked as such where used: ASA's ?Port= and
 * -WinLiveMaxPlayers, and session names with spaces (the Den quotes the whole
 * travel URL as one argument, the usual way ARK servers are launched).
 */

import { randomBytes } from "crypto";

export type ArkVariant = "ase" | "asa";

export interface ArkGame {
  type: "ark-ase" | "ark-asa";
  label: string;
  /** Relative to the install folder. */
  exe: string;
  defaultMap: string;
  /** ASA's own log; ASE writes none. */
  logFile: string | null;
  /** Where the Config tab's "map" help points people. */
  mapExamples: string;
}

export const ARK_GAMES: Record<ArkVariant, ArkGame> = {
  ase: {
    type: "ark-ase",
    label: "ARK: Survival Evolved",
    exe: "ShooterGame/Binaries/Win64/ShooterGameServer.exe",
    defaultMap: "TheIsland",
    logFile: null,
    mapExamples: "TheIsland, TheCenter, ScorchedEarth_P, Ragnarok, Aberration_P, Extinction, Valguero_P, Genesis, CrystalIsles, Gen2, LostIsland, Fjordur",
  },
  asa: {
    type: "ark-asa",
    label: "ARK: Survival Ascended",
    exe: "ShooterGame/Binaries/Win64/ArkAscendedServer.exe",
    defaultMap: "TheIsland_WP",
    logFile: "ShooterGame/Saved/Logs/ShooterGame.log",
    mapExamples: "TheIsland_WP, ScorchedEarth_WP, TheCenter_WP and the other _WP maps",
  },
};

export const DEN_FILE = "kitsuneden-ark.json";
export const SAVED_DIR = "ShooterGame/Saved";

export interface ArkSettings {
  map: string;
  sessionName: string;
  /** Join password; empty for none. */
  serverPassword: string;
  maxPlayers: number;
  /** Admin and RCON password. Never sent to the browser. */
  adminPassword: string;
}

export const HIDDEN_KEYS = ["adminPassword"] as const;

export function generateAdminPassword(): string {
  return randomBytes(12).toString("base64url");
}

export function defaultSettings(variant: ArkVariant, serverName: string): ArkSettings {
  return {
    map: ARK_GAMES[variant].defaultMap,
    sessionName: serverName || "Kitsune Den ARK",
    serverPassword: "",
    maxPlayers: 70,
    adminPassword: generateAdminPassword(),
  };
}

/** Values over a base: the defaults when reading the file, the current settings when saving. */
export function normalizeSettings(raw: Record<string, unknown>, base: ArkSettings): ArkSettings {
  const out = { ...base } as unknown as Record<string, unknown>;
  for (const [key, fallback] of Object.entries(base)) {
    const value = raw[key];
    if (typeof value === typeof fallback) out[key] = value;
    else if (typeof fallback === "number" && typeof value === "string" && /^\d+$/.test(value.trim())) out[key] = Number(value);
  }
  return out as unknown as ArkSettings;
}

/** "?" ends a travel-URL value, and a quote would end the quoted argument. */
const BREAKS_URL = /[?"]/;

export function validateSettings(s: ArkSettings): string | null {
  if (!/^[A-Za-z0-9_]+$/.test(s.map)) return "The map is a name like TheIsland or TheIsland_WP: letters, numbers and _ only.";
  if (!s.sessionName.trim()) return "ARK needs a session name.";
  if (BREAKS_URL.test(s.sessionName)) return 'The session name can\'t contain ? or ".';
  if (BREAKS_URL.test(s.serverPassword) || /\s/.test(s.serverPassword)) return 'The join password can\'t contain spaces, ? or ".';
  if (!s.adminPassword || BREAKS_URL.test(s.adminPassword) || /\s/.test(s.adminPassword)) {
    return "The admin password can't be empty or contain spaces, ? or \".";
  }
  if (!Number.isInteger(s.maxPlayers) || s.maxPlayers < 1 || s.maxPlayers > 255) return "Max players needs to be between 1 and 255.";
  return null;
}

/**
 * The command line: the travel URL as one argument (map first, admin
 * password last), then -server -log. ASA takes its player cap as
 * -WinLiveMaxPlayers; ASE reads ?MaxPlayers= from the URL.
 */
export function launchArgs(
  variant: ArkVariant,
  s: ArkSettings,
  ports: { game: number; query: number; rcon: number },
  adminPassword: string
): string[] {
  const options = [
    s.map,
    "listen",
    `SessionName=${s.sessionName}`,
    `Port=${ports.game}`,
    `QueryPort=${ports.query}`,
    "RCONEnabled=True",
    `RCONPort=${ports.rcon}`,
  ];
  if (variant === "ase") options.push(`MaxPlayers=${s.maxPlayers}`);
  if (s.serverPassword) options.push(`ServerPassword=${s.serverPassword}`);
  // Last, always: ASA reads the rest of the line into the admin password.
  options.push(`ServerAdminPassword=${adminPassword}`);
  const args = [options.join("?"), "-server", "-log"];
  if (variant === "asa") args.push(`-WinLiveMaxPlayers=${s.maxPlayers}`);
  return args;
}

/** Names from `ListPlayers`: "0. Name, 76561198..." per line, or "No Players Connected". */
export function parseListPlayers(reply: string): string[] {
  return reply
    .split(/\r?\n/)
    .map((line) => /^\s*\d+\.\s*(.+?),\s*\d+\s*$/.exec(line)?.[1])
    .filter((name): name is string => !!name);
}

/**
 * Left out of backups: SavedArksLocal (the single-player save) and the ~20
 * timestamped generations ARK keeps, <Map>_dd.mm.yyyy_hh.mm.ss.ark (ASA's are
 * .arkrbf). The live <Map>.ark and its AntiCorruptionBackup stay.
 */
export function isBackupNoise(name: string): boolean {
  return name === "SavedArksLocal" || /_\d\d\.\d\d\.\d{4}_\d\d\.\d\d\.\d\d\.(ark|arkrbf)$/.test(name);
}

/** ASA logs its full command line, admin password and all. */
export function redact(line: string, secrets: string[]): string {
  let out = line;
  for (const secret of secrets) if (secret) out = out.split(secret).join("********");
  return out;
}
