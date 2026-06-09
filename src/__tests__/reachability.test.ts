import { describe, expect, it, beforeEach, afterEach } from "vitest";
import net from "net";
import {
  probeReachability,
  getProbeTarget,
  resolveServerStatus,
  clearReachabilityCache,
} from "../lib/adapters/reachability";
import type {
  ServerAdapter,
  ServerDefinition,
  ServerStatus,
  ServerStats,
} from "../lib/adapters/types";

function startTcpServer(): Promise<{ server: net.Server; port: number }> {
  return new Promise((resolve, reject) => {
    const server = net.createServer((socket) => {
      socket.on("error", () => {
        // ignore client errors during teardown
      });
    });
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      if (typeof addr === "object" && addr) {
        resolve({ server, port: addr.port });
      } else {
        reject(new Error("Could not determine listen port"));
      }
    });
  });
}

function stopTcpServer(server: net.Server): Promise<void> {
  return new Promise((resolve) => {
    server.close(() => resolve());
  });
}

interface FakeAdapterOptions {
  def: ServerDefinition;
  status: ServerStatus;
  hasProcess?: boolean;
}

function fakeAdapter(opts: FakeAdapterOptions): ServerAdapter {
  return {
    def: opts.def,
    capabilities: {
      hasRcon: false,
      hasMods: false,
      hasModPacks: false,
      hasBackups: false,
      hasWorlds: false,
      hasWarps: false,
      hasServerProperties: false,
      hasJsonConfig: false,
      hasKitsuneCommand: false,
      hasRestApi: false,
      hasSteamUpdate: false,
      hasLauncherUpdate: false,
    },
    getStatus: () => opts.status,
    start: async () => ({ success: true, message: "" }),
    stop: async () => ({ success: true, message: "" }),
    restart: async () => ({ success: true, message: "" }),
    sendCommand: () => ({ success: true, message: "" }),
    getLogs: () => [],
    onLog: () => () => {},
    getStats: async (): Promise<ServerStats> => ({
      process: opts.hasProcess
        ? { pid: 1234, memory: "1 MB", memoryBytes: 1_000_000, upSince: null }
        : null,
      system: {
        platform: "test",
        hostname: "test",
        totalMemory: "0",
        freeMemory: "0",
        totalMemoryBytes: 0,
        freeMemoryBytes: 0,
        cpus: 0,
        cpuModel: "test",
        uptime: 0,
      },
    }),
    getConfig: async () => ({}),
    saveConfig: async () => ({ success: true, message: "" }),
    getPlayers: async () => ({ players: [], whitelist: null, bans: null }),
    getMemoryConfig: () => ({ minMemoryGB: 0, maxMemoryGB: 0 }),
    saveMemoryConfig: () => {},
  };
}

describe("probeReachability", () => {
  beforeEach(() => {
    clearReachabilityCache();
  });

  it("returns 'running' when the port is listening", async () => {
    const { server, port } = await startTcpServer();
    try {
      const result = await probeReachability("127.0.0.1", port, { ttlMs: 0 });
      expect(result).toBe("running");
    } finally {
      await stopTcpServer(server);
    }
  });

  it("returns 'stopped' when the port is not listening (ECONNREFUSED)", async () => {
    // Bind, capture port, then close so the port is definitely free.
    const { server, port } = await startTcpServer();
    await stopTcpServer(server);
    const result = await probeReachability("127.0.0.1", port, { ttlMs: 0 });
    expect(result).toBe("stopped");
  });

  it("returns 'unknown' when the probe times out", async () => {
    // 192.0.2.0/24 is TEST-NET-1 (RFC 5737) — reserved and unreachable,
    // so connect() will hang until our timeout fires.
    const result = await probeReachability("192.0.2.1", 9, {
      ttlMs: 0,
      timeoutMs: 200,
    });
    expect(result).toBe("unknown");
  });

  it("caches the result within the TTL window", async () => {
    const { server, port } = await startTcpServer();
    try {
      const first = await probeReachability("127.0.0.1", port, {
        ttlMs: 5_000,
      });
      expect(first).toBe("running");

      // Stop the server — a fresh probe would now return "stopped",
      // but the cached value should still be "running".
      await stopTcpServer(server);
      const cached = await probeReachability("127.0.0.1", port, {
        ttlMs: 5_000,
      });
      expect(cached).toBe("running");
    } finally {
      // server already stopped above; no-op if listener is closed.
      try {
        await stopTcpServer(server);
      } catch {
        // ignore
      }
    }
  });
});

describe("getProbeTarget", () => {
  it("picks gamePort for minecraft", () => {
    const def: ServerDefinition = {
      id: "mc",
      name: "MC",
      type: "minecraft",
      dir: "/",
      gamePort: 25565,
    };
    expect(getProbeTarget(def)).toEqual({ host: "127.0.0.1", port: 25565 });
  });

  it("picks telnetPort for 7d2d (gamePort is UDP)", () => {
    const def: ServerDefinition = {
      id: "7d2d",
      name: "7D2D",
      type: "7d2d",
      dir: "/",
      gamePort: 26900,
      telnetPort: 8081,
    };
    expect(getProbeTarget(def)).toEqual({ host: "127.0.0.1", port: 8081 });
  });

  it("picks rconPort for palworld when available", () => {
    const def: ServerDefinition = {
      id: "pal",
      name: "Pal",
      type: "palworld",
      dir: "/",
      gamePort: 8211,
      rconPort: 25575,
      restApiPort: 8212,
    };
    expect(getProbeTarget(def)).toEqual({ host: "127.0.0.1", port: 25575 });
  });

  it("falls back to restApiPort for palworld without RCON", () => {
    const def: ServerDefinition = {
      id: "pal",
      name: "Pal",
      type: "palworld",
      dir: "/",
      restApiPort: 8212,
    };
    expect(getProbeTarget(def)).toEqual({ host: "127.0.0.1", port: 8212 });
  });

  it("returns null for enshrouded (UDP-only)", () => {
    const def: ServerDefinition = {
      id: "ens",
      name: "Ens",
      type: "enshrouded",
      dir: "/",
      gamePort: 15637,
      queryPort: 15638,
    };
    expect(getProbeTarget(def)).toBeNull();
  });

  it("returns null when the relevant port is unset", () => {
    const def: ServerDefinition = {
      id: "mc",
      name: "MC",
      type: "minecraft",
      dir: "/",
    };
    expect(getProbeTarget(def)).toBeNull();
  });

  it("honors rconHost for minecraft so probes hit the remote server", () => {
    // When the MC server lives on a LAN/tailnet peer (e.g. Ragnarok at
    // 192.168.7.14 while the dashboard runs on .77), the probe must dial
    // the configured host, not 127.0.0.1.
    const def: ServerDefinition = {
      id: "ragnarok",
      name: "Ragnarok",
      type: "minecraft",
      dir: "/",
      rconHost: "192.168.7.14",
      gamePort: 25570,
    };
    expect(getProbeTarget(def)).toEqual({ host: "192.168.7.14", port: 25570 });
  });

  it("falls back to 127.0.0.1 for minecraft when rconHost is unset", () => {
    const def: ServerDefinition = {
      id: "local-mc",
      name: "Local MC",
      type: "minecraft",
      dir: "/",
      gamePort: 25565,
    };
    expect(getProbeTarget(def)).toEqual({ host: "127.0.0.1", port: 25565 });
  });
});

describe("resolveServerStatus", () => {
  beforeEach(() => {
    clearReachabilityCache();
  });

  it("reports 'running' for an nssm-managed MC server (internal=stopped, port up)", async () => {
    const { server, port } = await startTcpServer();
    try {
      const adapter = fakeAdapter({
        def: {
          id: "mc-nssm",
          name: "MC NSSM",
          type: "minecraft",
          dir: "/",
          gamePort: port,
        },
        status: "stopped",
      });
      clearReachabilityCache();
      const status = await resolveServerStatus(adapter);
      expect(status).toBe("running");
    } finally {
      await stopTcpServer(server);
    }
  });

  it("reports 'running' for an nssm-managed 7D2D server via telnet probe", async () => {
    const { server, port } = await startTcpServer();
    try {
      const adapter = fakeAdapter({
        def: {
          id: "7d2d-nssm",
          name: "7D2D NSSM",
          type: "7d2d",
          dir: "/",
          gamePort: 26900,
          telnetPort: port,
        },
        status: "stopped",
      });
      clearReachabilityCache();
      const status = await resolveServerStatus(adapter);
      expect(status).toBe("running");
    } finally {
      await stopTcpServer(server);
    }
  });

  it("preserves 'starting' from the state machine even if port is up", async () => {
    const { server, port } = await startTcpServer();
    try {
      const adapter = fakeAdapter({
        def: {
          id: "mc",
          name: "MC",
          type: "minecraft",
          dir: "/",
          gamePort: port,
        },
        status: "starting",
      });
      clearReachabilityCache();
      const status = await resolveServerStatus(adapter);
      expect(status).toBe("starting");
    } finally {
      await stopTcpServer(server);
    }
  });

  it("reports 'stopped' when the probe is conclusive (port refused)", async () => {
    const { server, port } = await startTcpServer();
    await stopTcpServer(server);
    const adapter = fakeAdapter({
      def: {
        id: "mc",
        name: "MC",
        type: "minecraft",
        dir: "/",
        gamePort: port,
      },
      status: "stopped",
    });
    clearReachabilityCache();
    const status = await resolveServerStatus(adapter);
    expect(status).toBe("stopped");
  });

  it("falls back to process check for hytale/palworld/enshrouded when no probe match", async () => {
    const adapter = fakeAdapter({
      def: {
        id: "ens",
        name: "Ens",
        type: "enshrouded",
        dir: "/",
        gamePort: 15637,
        queryPort: 15638,
      },
      status: "stopped",
      hasProcess: true,
    });
    clearReachabilityCache();
    const status = await resolveServerStatus(adapter);
    expect(status).toBe("running");
  });
});
