import net from "node:net";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ServerDefinition } from "../lib/adapters/types";
import {
  _resetReachabilityCacheForTests,
  REACHABILITY_CACHE_TTL_MS,
  isPortListening,
  probeServerReachable,
  reachabilityTarget,
} from "../lib/reachability";

/** Start a throwaway TCP listener on a random free port. The test gets back
 * the port + a teardown — use it to assert "yep, that's reachable." */
async function startEphemeralListener(): Promise<{ port: number; close: () => Promise<void> }> {
  const server = net.createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const port = (server.address() as net.AddressInfo).port;
  return {
    port,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

/** An OS-assigned ephemeral port that's almost certainly NOT bound. Picking a
 * high port avoids colliding with whatever the dev machine has running. */
function pickLikelyUnboundPort(): number {
  // Random in 49152-65535 (IANA ephemeral range). Not bulletproof but stable
  // enough for tests; failures here would surface as false-positive "running."
  return 49152 + Math.floor(Math.random() * 16000);
}

describe("isPortListening", () => {
  it("returns true for an open TCP port", async () => {
    const listener = await startEphemeralListener();
    try {
      expect(await isPortListening("127.0.0.1", listener.port, 1000)).toBe(true);
    } finally {
      await listener.close();
    }
  });

  it("returns false for a closed TCP port (connection refused)", async () => {
    expect(await isPortListening("127.0.0.1", pickLikelyUnboundPort(), 500)).toBe(false);
  });

  it("returns false on connect timeout (TEST-NET-1 black hole)", async () => {
    // 192.0.2.0/24 is reserved for documentation/testing and is routed to nowhere
    // on the public internet — a connect attempt will hang past the timeout.
    expect(await isPortListening("192.0.2.1", 25575, 200)).toBe(false);
  });
});

describe("reachabilityTarget", () => {
  const baseMc: ServerDefinition = {
    id: "mc",
    name: "MC",
    type: "minecraft",
    dir: "/srv/mc",
    rconPort: 25575,
    gamePort: 25565,
  };
  const base7d2d: ServerDefinition = {
    id: "7d",
    name: "7D",
    type: "7d2d",
    dir: "/srv/7d",
    telnetPort: 8081,
    gamePort: 26900,
  };
  const basePal: ServerDefinition = {
    id: "pw",
    name: "Pal",
    type: "palworld",
    dir: "/srv/pal",
    gamePort: 8211,
  };

  it("Minecraft → RCON port", () => {
    expect(reachabilityTarget(baseMc)).toEqual({ host: "127.0.0.1", port: 25575 });
  });

  it("Minecraft falls back to gamePort when no RCON configured", () => {
    expect(reachabilityTarget({ ...baseMc, rconPort: undefined })).toEqual({
      host: "127.0.0.1",
      port: 25565,
    });
  });

  it("7D2D → telnet port", () => {
    expect(reachabilityTarget(base7d2d)).toEqual({ host: "127.0.0.1", port: 8081 });
  });

  it("7D2D returns null without telnet — gamePort is UDP, not probeable", () => {
    expect(reachabilityTarget({ ...base7d2d, telnetPort: undefined })).toBeNull();
  });

  it("Palworld prefers restApiPort over rconPort", () => {
    expect(reachabilityTarget({ ...basePal, restApiPort: 8212, rconPort: 25575 })).toEqual({
      host: "127.0.0.1",
      port: 8212,
    });
    expect(reachabilityTarget({ ...basePal, rconPort: 25575 })).toEqual({
      host: "127.0.0.1",
      port: 25575,
    });
  });

  it("Hytale and Enshrouded return null (process-scan path handles them)", () => {
    expect(
      reachabilityTarget({ id: "h", name: "H", type: "hytale", dir: "/srv/h", gamePort: 25565 })
    ).toBeNull();
    expect(
      reachabilityTarget({ id: "e", name: "E", type: "enshrouded", dir: "/srv/e", gamePort: 15637 })
    ).toBeNull();
  });

  it("honors host override", () => {
    expect(reachabilityTarget(baseMc, { host: "10.0.0.42" })).toEqual({
      host: "10.0.0.42",
      port: 25575,
    });
  });
});

describe("probeServerReachable + cache", () => {
  beforeEach(() => _resetReachabilityCacheForTests());
  afterEach(() => _resetReachabilityCacheForTests());

  it("returns true for a running MC-style server (RCON port reachable)", async () => {
    const listener = await startEphemeralListener();
    try {
      const def: ServerDefinition = {
        id: "mc-live",
        name: "MC",
        type: "minecraft",
        dir: "/srv/mc",
        rconPort: listener.port,
      };
      expect(await probeServerReachable(def)).toBe(true);
    } finally {
      await listener.close();
    }
  });

  it("returns false when the configured port is refused", async () => {
    const def: ServerDefinition = {
      id: "mc-dead",
      name: "MC",
      type: "minecraft",
      dir: "/srv/mc",
      rconPort: pickLikelyUnboundPort(),
    };
    expect(await probeServerReachable(def, { timeoutMs: 500 })).toBe(false);
  });

  it("returns null for a type with no probe target (skip — caller falls back)", async () => {
    const def: ServerDefinition = {
      id: "ens",
      name: "Ens",
      type: "enshrouded",
      dir: "/srv/ens",
      gamePort: 15637,
    };
    expect(await probeServerReachable(def)).toBeNull();
  });

  it("dedupes concurrent in-flight probes onto one socket", async () => {
    const listener = await startEphemeralListener();
    try {
      let connectionCount = 0;
      listener.close; // (suppress unused warning if any)
      const sniffer = net.createServer((sock) => {
        connectionCount++;
        sock.end();
      });
      await new Promise<void>((resolve) => sniffer.listen(0, "127.0.0.1", () => resolve()));
      const port = (sniffer.address() as net.AddressInfo).port;
      try {
        const def: ServerDefinition = {
          id: "concurrent",
          name: "C",
          type: "minecraft",
          dir: "/srv/c",
          rconPort: port,
        };
        // Fire 5 probes in parallel; the cache should funnel them to ONE
        // socket, not five.
        const results = await Promise.all([
          probeServerReachable(def),
          probeServerReachable(def),
          probeServerReachable(def),
          probeServerReachable(def),
          probeServerReachable(def),
        ]);
        expect(results).toEqual([true, true, true, true, true]);
        expect(connectionCount).toBe(1);
      } finally {
        await new Promise<void>((resolve) => sniffer.close(() => resolve()));
      }
    } finally {
      await listener.close();
    }
  });

  it("caches resolved results within the TTL — repeat probe = 0 new sockets", async () => {
    let connectionCount = 0;
    const sniffer = net.createServer((sock) => {
      connectionCount++;
      sock.end();
    });
    await new Promise<void>((resolve) => sniffer.listen(0, "127.0.0.1", () => resolve()));
    const port = (sniffer.address() as net.AddressInfo).port;
    try {
      const def: ServerDefinition = {
        id: "cached",
        name: "C",
        type: "minecraft",
        dir: "/srv/c",
        rconPort: port,
      };
      expect(await probeServerReachable(def)).toBe(true);
      expect(connectionCount).toBe(1);

      // Second probe immediately — same result, no new socket.
      expect(await probeServerReachable(def)).toBe(true);
      expect(connectionCount).toBe(1);
    } finally {
      await new Promise<void>((resolve) => sniffer.close(() => resolve()));
    }
  });

  it("exposes a sane TTL constant (used by callers for documentation)", () => {
    expect(REACHABILITY_CACHE_TTL_MS).toBeGreaterThanOrEqual(1000);
    expect(REACHABILITY_CACHE_TTL_MS).toBeLessThanOrEqual(30_000);
  });
});
