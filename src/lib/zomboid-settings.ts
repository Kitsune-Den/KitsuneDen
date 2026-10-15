/**
 * Project Zomboid: launch arguments, servertest.ini, and what the Den writes.
 *
 * Measured by PackRelay on a real Windows server (app 380870):
 *  - Launch the bundled jre64\bin\java.exe directly with the game's own JVM
 *    flags and classpath, not StartServer64.bat: the .bat forwards only two
 *    arguments (so -cachedir and -adminpassword can't both get through),
 *    hardcodes a 16 GB heap that stops smaller machines booting, and ends in
 *    PAUSE.
 *  - -cachedir=./zomboid-data keeps the world, db, logs and Server\*.ini in
 *    the server folder instead of the shared %USERPROFILE%\Zomboid.
 *  - -adminpassword is mandatory: without it a new server blocks forever on
 *    an interactive "Enter new administrator password" prompt. It's only read
 *    when the world's admin account is first created, so it has to be right
 *    from the first start.
 *  - RCON is on when RCONPassword is set (PZ ships it blank). Pre-writing just
 *    the port keys and RCON password before the first boot is safe: PZ kept
 *    them and filled in the other keys itself.
 */

import { randomBytes, randomInt } from "crypto";

export const CACHE_DIR = "zomboid-data";
/** PZ's default server name is "servertest"; the Den doesn't pass -servername. */
export const INI_PATH = "zomboid-data/Server/servertest.ini";
export const DEN_FILE = "kitsuneden-zomboid.json";
/** The server's output, which the Den sends here and follows. */
export const LOG_FILE = "logs/zomboid-server.log";
export const JAVA_EXE = "jre64/bin/java.exe";

/** Written by the Den before every start; not edited on the Config tab. */
export const DEN_OWNED_KEYS = ["DefaultPort", "UDPPort", "RCONPort", "RCONPassword"] as const;

// ---- servertest.ini ----

/** key=value lines; # and ! start comments; the last of a repeated key wins. */
export function parseIni(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#") || t.startsWith("!")) continue;
    const eq = t.indexOf("=");
    if (eq > 0) out[t.slice(0, eq).trim()] = t.slice(eq + 1).trim();
  }
  return out;
}

/** Set keys in place (comments, order and line endings kept); append any that aren't there. */
export function patchIni(text: string, changes: Record<string, string>): string {
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const lines = text.length ? text.split(/\r?\n/) : [];
  const pending = new Map(Object.entries(changes));
  const out = lines.map((line) => {
    const t = line.trim();
    if (!t || t.startsWith("#") || t.startsWith("!")) return line;
    const eq = t.indexOf("=");
    if (eq <= 0) return line;
    const key = t.slice(0, eq).trim();
    if (!pending.has(key)) return line;
    const value = pending.get(key)!;
    pending.delete(key);
    return `${key}=${value}`;
  });
  while (out.length && out[out.length - 1] === "") out.pop();
  for (const [key, value] of pending) out.push(`${key}=${value}`);
  return out.join(eol) + eol;
}

export function generateRconPassword(): string {
  return randomBytes(12).toString("base64url");
}

/**
 * servertest.ini before a start: the Den's ports and RCON written over the
 * file (or into a new one holding just these keys, which PZ fills out on its
 * first boot). The second UDP port follows the game port, as the recipe says.
 */
export function syncIni(
  current: string | null,
  opts: { port: number; rconPort: number; rconPassword?: string }
): { text: string; rconPassword: string } {
  const existing = current ? parseIni(current) : {};
  const rconPassword = opts.rconPassword || existing.RCONPassword || generateRconPassword();
  const changes = {
    DefaultPort: String(opts.port),
    UDPPort: String(opts.port + 1),
    RCONPort: String(opts.rconPort),
    RCONPassword: rconPassword,
  };
  return { text: patchIni(current ?? "", changes), rconPassword };
}

/** The ini as the Config tab shows it: without the keys the Den owns (and the RCON password). */
export function editableIni(values: Record<string, string>): Record<string, string> {
  const out = { ...values };
  for (const key of DEN_OWNED_KEYS) delete out[key];
  return out;
}

// ---- kitsuneden-zomboid.json ----

export interface ZomboidDenSettings {
  /** The in-game "admin" account's password. Only read when the world is first created. */
  adminPassword: string;
  minMemoryGB: number;
  maxMemoryGB: number;
}

/** PackRelay's alphabet: no 0/O, 1/l/i, so it reads out loud cleanly. */
export function generateAdminPassword(): string {
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
  return Array.from({ length: 10 }, () => alphabet[randomInt(alphabet.length)]).join("");
}

/** 2 to 4 GB, against the .bat's fixed 16: enough for a small server, and it boots on a small host. */
export function defaultDenSettings(): ZomboidDenSettings {
  return { adminPassword: generateAdminPassword(), minMemoryGB: 2, maxMemoryGB: 4 };
}

export function normalizeDenSettings(raw: Record<string, unknown>, base: ZomboidDenSettings): ZomboidDenSettings {
  return {
    adminPassword: typeof raw.adminPassword === "string" && raw.adminPassword ? raw.adminPassword : base.adminPassword,
    minMemoryGB: typeof raw.minMemoryGB === "number" ? raw.minMemoryGB : base.minMemoryGB,
    maxMemoryGB: typeof raw.maxMemoryGB === "number" ? raw.maxMemoryGB : base.maxMemoryGB,
  };
}

export function validateDenSettings(s: ZomboidDenSettings): string | null {
  if (!Number.isInteger(s.minMemoryGB) || s.minMemoryGB < 1) return "minMemoryGB needs to be a whole number of GB, 1 or more.";
  if (!Number.isInteger(s.maxMemoryGB) || s.maxMemoryGB < s.minMemoryGB) return "maxMemoryGB needs to be at least minMemoryGB.";
  return null;
}

/**
 * The java command line, as the game's own launcher builds it (from build
 * 380870's ProjectZomboid64.json), with the Den's heap, cache dir and admin
 * password. The classpath separator is ";" on Windows; passed as one argv
 * element, since java is spawned without a shell.
 */
export function javaArgs(s: ZomboidDenSettings): string[] {
  return [
    "-Djava.awt.headless=true",
    "-Dzomboid.steam=1",
    "-Dzomboid.znetlog=1",
    "-XX:+UseZGC",
    "-XX:-CreateCoredumpOnCrash",
    "-XX:-OmitStackTraceInFastThrow",
    `-Xms${s.minMemoryGB}g`,
    `-Xmx${s.maxMemoryGB}g`,
    "-Djava.library.path=natives/",
    "-cp",
    "java/;java/projectzomboid.jar",
    "zombie.network.GameServer",
    "-statistic",
    "0",
    `-cachedir=./${CACHE_DIR}`,
    "-adminpassword",
    s.adminPassword,
  ];
}

/** Names from RCON `players`: "Players connected (2):\n-Alice\n-Bob". */
export function parsePlayers(reply: string): string[] {
  return reply
    .split(/\r?\n/)
    .map((line) => /^\s*-\s*(.+?)\s*$/.exec(line)?.[1])
    .filter((name): name is string => !!name);
}
