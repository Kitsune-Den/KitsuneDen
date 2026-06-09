import net from "net";
import type { ServerDefinition, ServerAdapter, ServerStatus } from "./types";

export type Reachable = "running" | "stopped" | "unknown";

const DEFAULT_CACHE_TTL_MS = 5_000;
const DEFAULT_PROBE_TIMEOUT_MS = 1_500;

interface CacheEntry {
  result: Reachable;
  expires: number;
}

// Persist the cache across Next.js HMR reloads so dashboard polling
// (every few seconds) doesn't repeatedly hammer the game server ports.
const globalForReachability = globalThis as unknown as {
  __denReachabilityCache?: Map<string, CacheEntry>;
};
if (!globalForReachability.__denReachabilityCache) {
  globalForReachability.__denReachabilityCache = new Map();
}
const cache = globalForReachability.__denReachabilityCache;

function probeTcpPort(
  host: string,
  port: number,
  timeoutMs: number
): Promise<Reachable> {
  return new Promise((resolve) => {
    const sock = new net.Socket();
    let settled = false;
    const finish = (r: Reachable) => {
      if (settled) return;
      settled = true;
      try {
        sock.destroy();
      } catch {
        // ignore
      }
      resolve(r);
    };
    const timer = setTimeout(() => finish("unknown"), timeoutMs);

    sock.once("connect", () => {
      clearTimeout(timer);
      finish("running");
    });
    sock.once("error", (err: NodeJS.ErrnoException) => {
      clearTimeout(timer);
      // ECONNREFUSED = port is closed; everything else (ETIMEDOUT,
      // EHOSTUNREACH, ENETUNREACH, transient resets) is inconclusive.
      if (err.code === "ECONNREFUSED") finish("stopped");
      else finish("unknown");
    });

    try {
      sock.connect(port, host);
    } catch {
      clearTimeout(timer);
      finish("unknown");
    }
  });
}

export async function probeReachability(
  host: string,
  port: number,
  options: { ttlMs?: number; timeoutMs?: number } = {}
): Promise<Reachable> {
  const ttlMs = options.ttlMs ?? DEFAULT_CACHE_TTL_MS;
  const timeoutMs = options.timeoutMs ?? DEFAULT_PROBE_TIMEOUT_MS;
  const key = `${host}:${port}`;
  const now = Date.now();
  const cached = cache.get(key);
  if (cached && cached.expires > now) return cached.result;

  const result = await probeTcpPort(host, port, timeoutMs);
  cache.set(key, { result, expires: now + ttlMs });
  return result;
}

/**
 * Pick a TCP port we can probe to tell if the server is up.
 *
 * For game types whose gamePort is UDP-only (7D2D, Palworld, Enshrouded), we
 * fall back to whichever side-channel TCP listener the dedicated server exposes
 * (7D2D telnet, Palworld RCON/REST). Enshrouded has no TCP listener at all, so
 * we return null and let the caller fall back to the existing process check.
 */
export function getProbeTarget(
  def: ServerDefinition
): { host: string; port: number } | null {
  // For MC we honor an optional rconHost override so the dashboard can probe
  // a server living on a different LAN/tailnet peer. Other game types haven't
  // grown that field yet — local-only by convention.
  switch (def.type) {
    case "minecraft": {
      const host = def.rconHost || "127.0.0.1";
      return def.gamePort ? { host, port: def.gamePort } : null;
    }
    case "hytale":
      return def.gamePort ? { host: "127.0.0.1", port: def.gamePort } : null;
    case "7d2d":
      return def.telnetPort ? { host: "127.0.0.1", port: def.telnetPort } : null;
    case "palworld":
      if (def.rconPort) return { host: "127.0.0.1", port: def.rconPort };
      if (def.restApiPort) return { host: "127.0.0.1", port: def.restApiPort };
      return null;
    case "enshrouded":
      return null;
    default:
      return null;
  }
}

/**
 * Resolve the dashboard-facing status for a server.
 *
 * Augments the adapter's internal state machine with a network reachability
 * probe so externally-managed servers (nssm, systemd, etc.) report "running"
 * when their port is accepting connections. The adapter's own
 * start/stop/restart logic is left untouched — we only override the *reported*
 * status.
 */
export async function resolveServerStatus(
  adapter: ServerAdapter
): Promise<ServerStatus> {
  const internal = adapter.getStatus();

  // Transitional states come from the state machine itself — don't second-guess.
  if (internal === "starting" || internal === "stopping") return internal;

  const target = getProbeTarget(adapter.def);
  const reach: Reachable | "skipped" = target
    ? await probeReachability(target.host, target.port)
    : "skipped";

  if (reach === "running") return "running";

  // Adapters that already do their own process-listing check use it as a
  // secondary signal — catches the case where the process is running but the
  // probe is inconclusive (or there's no probe target at all).
  const def = adapter.def;
  if (def.type === "hytale" || def.type === "palworld" || def.type === "enshrouded") {
    const stats = await adapter.getStats();
    if (stats.process) return "running";
    return "stopped";
  }

  // For MC and 7D2D: a definitive "stopped" from the probe is authoritative;
  // "unknown" falls back to whatever the internal state machine says (which is
  // usually accurate when KitsuneDen spawned the process itself).
  if (reach === "stopped") return "stopped";
  return internal;
}

export function clearReachabilityCache(): void {
  cache.clear();
}
