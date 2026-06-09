/**
 * TCP port reachability probe with a short TTL cache.
 *
 * The problem: a server adapter's getStatus() reports the state machine of
 * processes KitsuneDen spawned itself. When a game server runs under nssm or
 * systemd outside KitsuneDen (the prod shape on kitsuneden-host), getStatus()
 * always returns "stopped" even when the server is up and accepting players.
 *
 * Hytale, Palworld, and Enshrouded already work around this: their API routes
 * call getStats() which does a process scan, and a found process upgrades the
 * status to "running." Minecraft and 7D2D don't have that path — the gap this
 * module fills.
 *
 * Strategy: TCP-connect to a port we know the server type exposes when alive
 * (RCON for Minecraft, telnet for 7D2D). A connect that completes within the
 * timeout means the port answered → server is up. Connection refused or
 * timeout means "we couldn't confirm it's up." Cache the result for ~5s so
 * the dashboard's status poll (and rapid page navigations) don't hammer the
 * game server with sockets.
 *
 * Why not UDP-probe the actual gamePort? Minecraft is TCP and would work, but
 * 7D2D/Palworld/Enshrouded gameports are UDP — there's no "connect refused"
 * for UDP, so you can't tell "nothing listening" from "no response yet" in a
 * short window. RCON/telnet ports are TCP across the board and give clean
 * yes/no answers.
 */

import net from "node:net";
import type { ServerDefinition } from "./adapters/types";

export interface ReachabilityOptions {
  /** Per-attempt timeout in milliseconds. Defaults to 1500ms — long enough to
   * survive a slow LAN, short enough that the dashboard doesn't feel laggy. */
  timeoutMs?: number;
  /** Override the host to dial. Defaults to 127.0.0.1 since this module runs
   * on the same box as the game server in our deploy shape. */
  host?: string;
}

const DEFAULT_TIMEOUT_MS = 1500;
const DEFAULT_HOST = "127.0.0.1";

/** TTL for cached probe results, milliseconds. */
export const REACHABILITY_CACHE_TTL_MS = 5_000;

type CacheEntry =
  | { kind: "resolved"; value: boolean; expiresAt: number }
  | { kind: "pending"; promise: Promise<boolean> };

const globalForCache = globalThis as unknown as {
  __reachabilityCache?: Map<string, CacheEntry>;
};
if (!globalForCache.__reachabilityCache) {
  globalForCache.__reachabilityCache = new Map();
}
const cache = globalForCache.__reachabilityCache;

/** Test-only: clear the module-level cache. NEVER call from app code. */
export function _resetReachabilityCacheForTests(): void {
  cache.clear();
}

/**
 * Pure TCP socket probe. Returns true iff the connection completed before
 * the timeout. Connection refused, timeout, and any unexpected error all
 * return false — we err on "not reachable" rather than "reachable."
 */
export function isPortListening(
  host: string,
  port: number,
  timeoutMs: number = DEFAULT_TIMEOUT_MS
): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    const socket = new net.Socket();
    let settled = false;
    const done = (result: boolean) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(result);
    };
    socket.setTimeout(timeoutMs);
    socket.once("connect", () => done(true));
    socket.once("timeout", () => done(false));
    socket.once("error", () => done(false));
    try {
      socket.connect(port, host);
    } catch {
      done(false);
    }
  });
}

/**
 * Decide which TCP port to dial for a given server type. Returns null when
 * the server type has no reliable TCP control-plane port we can use — those
 * server types already get their reachability check upstream via getStats()
 * process scanning (Hytale/Palworld/Enshrouded).
 */
export function reachabilityTarget(
  def: ServerDefinition,
  opts: ReachabilityOptions = {}
): { host: string; port: number } | null {
  const host = opts.host ?? DEFAULT_HOST;
  switch (def.type) {
    case "minecraft":
      // RCON is the dependable TCP probe — it's enabled in every modern
      // dedicated MC deploy and binds well before the world finishes loading.
      // Fall back to gamePort (also TCP for vanilla MC) if RCON wasn't set.
      if (def.rconPort) return { host, port: def.rconPort };
      if (def.gamePort) return { host, port: def.gamePort };
      return null;
    case "7d2d":
      // 7D2D telnet is TCP and binds 0.0.0.0 when a password is configured
      // (the loopback-only fallback when no password is empty would prevent
      // probing anyway — operator-managed servers should have a password).
      if (def.telnetPort) return { host, port: def.telnetPort };
      return null;
    case "palworld":
      // Both restApiPort and rconPort are TCP; pick whichever is configured.
      if (def.restApiPort) return { host, port: def.restApiPort };
      if (def.rconPort) return { host, port: def.rconPort };
      return null;
    case "hytale":
    case "enshrouded":
      // These already work because their adapters scan for the process in
      // getStats(); returning null skips the redundant TCP probe.
      return null;
  }
}

/**
 * Cached reachability probe for a server definition. Returns:
 *  - true  — port answered within the timeout
 *  - false — port refused / timed out
 *  - null  — no probe defined for this server type (caller should fall back
 *            to whatever pre-existing mechanism handles that type)
 *
 * Concurrent calls for the same server id within the TTL share a single
 * in-flight socket; subsequent calls within TTL after resolution return the
 * cached boolean without a new socket.
 */
export function probeServerReachable(
  def: ServerDefinition,
  opts: ReachabilityOptions = {}
): Promise<boolean | null> {
  const target = reachabilityTarget(def, opts);
  if (!target) return Promise.resolve(null);

  // Cache key includes id + the resolved target so a servers.json edit that
  // changes the probe port invalidates the entry naturally.
  const key = `${def.id}|${target.host}:${target.port}`;
  const now = Date.now();
  const existing = cache.get(key);

  if (existing) {
    if (existing.kind === "pending") return existing.promise.then((v) => v);
    if (existing.expiresAt > now) return Promise.resolve(existing.value);
  }

  const promise = isPortListening(target.host, target.port, opts.timeoutMs);
  cache.set(key, { kind: "pending", promise });
  return promise.then((value) => {
    cache.set(key, { kind: "resolved", value, expiresAt: Date.now() + REACHABILITY_CACHE_TTL_MS });
    return value;
  });
}
