/**
 * Rust (Facepunch): settings the Den keeps in kitsuneden-rust.json beside the
 * server, passed to RustDedicated.exe as +convar launch arguments each start.
 *
 * Measured by PackRelay on a real Windows server (app 258550):
 *  - Ports: UDP game, TCP RCON at game + 1, UDP query at game + 2 (28115 /
 *    28116 / 28117 when the game port was 28115). The Den writes all three, so
 *    a second server moves the whole block.
 *  - +server.identity is mandatory: without it every server on the machine
 *    saves to the same server/my_server_identity folder.
 *  - +rcon.password is mandatory: with a blank one Rust disables RCON and never
 *    binds the port.
 *  - `quit` saves and exits (2 s); `playerlist` returns JSON.
 *  - A first boot spends most of its time generating the map (~7.5 min at the
 *    default world size, 4500).
 *
 * RCON runs in Rust's TCP (Source RCON) mode, +rcon.web 0, so the Den's
 * rcon-client speaks it with no extra dependency. Rust logs that mode as
 * deprecated on every boot; if Facepunch removes it, this needs WebRCON.
 */

import { randomBytes, randomInt } from "crypto";

export const DEN_FILE = "kitsuneden-rust.json";
/** Rust's log, written with -logfile; the Den follows it. */
export const LOG_FILE = "logs/rust-server.log";
/** Worlds live under server/<identity>. */
export const SERVER_DIR = "server";

export interface RustSettings {
  hostname: string;
  description: string;
  /** The world's folder under server/. Changing it points the server at a new, empty world. */
  identity: string;
  level: string;
  worldsize: number;
  seed: number;
  maxplayers: number;
  /** Kept here unless servers.json sets rconPassword; never sent to the browser. */
  rconPassword: string;
}

/** Keys the Config tab doesn't see. */
export const HIDDEN_KEYS = ["rconPassword"] as const;

/** A folder name Rust is happy with, from the Den's server id. */
export function identityFor(serverId: string): string {
  return serverId.replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "kitsuneden";
}

export function generateRconPassword(): string {
  return randomBytes(12).toString("base64url");
}

export function defaultSettings(serverName: string, serverId: string): RustSettings {
  return {
    hostname: serverName || "Kitsune Den - Rust",
    description: "",
    identity: identityFor(serverId),
    level: "Procedural Map",
    worldsize: 4500,
    seed: randomInt(1, 2147483647),
    maxplayers: 50,
    rconPassword: generateRconPassword(),
  };
}

/** Values over a base (the defaults when reading the file, the current settings when saving). */
export function normalizeSettings(raw: Record<string, unknown>, base: RustSettings): RustSettings {
  const out = { ...base } as unknown as Record<string, unknown>;
  for (const [key, fallback] of Object.entries(base)) {
    const value = raw[key];
    if (typeof value === typeof fallback) out[key] = value;
    // The Config tab can hand numbers back as text.
    else if (typeof fallback === "number" && typeof value === "string" && /^-?\d+$/.test(value.trim())) out[key] = Number(value);
  }
  return out as unknown as RustSettings;
}

export function validateSettings(s: RustSettings): string | null {
  if (!s.hostname.trim()) return "Rust needs a server name.";
  if (!/^[A-Za-z0-9_-]+$/.test(s.identity)) return "The identity can only use letters, numbers, - and _.";
  if (!s.level.trim()) return "Rust needs a level (map).";
  if (!Number.isInteger(s.worldsize) || s.worldsize < 1000 || s.worldsize > 6000) return "World size needs to be between 1000 and 6000.";
  if (!Number.isInteger(s.seed) || s.seed < 0 || s.seed > 2147483647) return "The seed needs to be a whole number from 0 to 2147483647.";
  if (!Number.isInteger(s.maxplayers) || s.maxplayers < 1 || s.maxplayers > 500) return "Max players needs to be between 1 and 500.";
  if (!s.rconPassword) return "Rust needs an RCON password, or it turns RCON off.";
  return null;
}

/**
 * The command line. Values are separate argv entries (no shell), so a name
 * with spaces needs no quoting. +rcon.web 0 keeps RCON on the TCP protocol.
 */
export function launchArgs(s: RustSettings, port: number, logPath: string, rconPassword: string): string[] {
  const args = [
    "-batchmode",
    "-logfile", logPath,
    "+server.identity", s.identity,
    "+server.port", String(port),
    "+rcon.port", String(port + 1),
    "+server.queryport", String(port + 2),
    "+rcon.password", rconPassword,
    "+rcon.web", "0",
    "+server.hostname", s.hostname,
    "+server.level", s.level,
    "+server.worldsize", String(s.worldsize),
    "+server.seed", String(s.seed),
    "+server.maxplayers", String(s.maxplayers),
  ];
  if (s.description) args.push("+server.description", s.description);
  return args;
}

/** Names from `playerlist`, a JSON array of { DisplayName, SteamID, ... }. */
export function parsePlayerlist(reply: string): string[] {
  try {
    const list: unknown = JSON.parse(reply);
    if (!Array.isArray(list)) return [];
    return list
      .map((p) => (p && typeof p === "object" ? ((p as Record<string, unknown>).DisplayName ?? (p as Record<string, unknown>).displayName) : null))
      .filter((name): name is string => typeof name === "string" && !!name);
  } catch {
    return [];
  }
}

/** Regenerated from the seed and world size on boot, and most of a backup's size. */
export function isMapCache(fileName: string): boolean {
  return fileName.endsWith(".map") || /_occlusion_.*\.dat$/.test(fileName);
}
