import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ServerDefinition } from "../lib/adapters/types";

/**
 * lifecycle.stopCommand is the last-resort fallback when RCON `stop` fails
 * (RCON listener dead, JVM still holding the ports). These tests pin:
 *   - RCON ok            → no SSH call
 *   - RCON fails + stopCommand → SSH dispatch, success reported
 *   - RCON fails, no stopCommand → failure, no SSH call
 * plus the console refusal message and the remote hasBackups capability.
 */

const LIFECYCLE = {
  kind: "ssh" as const,
  host: "192.168.7.14",
  user: "MCAdmin2023",
  identityFile: "C:\\keys\\id",
  startCommand: "Start-Process run.bat",
  stopCommand: "Stop-Process -Name java -Force",
};

const DEF: ServerDefinition = {
  id: "ragnarok-stop",
  name: "Ragnarok",
  type: "minecraft",
  dir: "/tmp/stub",
  rconHost: "192.168.7.14",
  rconPort: 25575,
  rconPassword: "pw",
  gamePort: 25570,
  lifecycle: LIFECYCLE,
};

let execCalls: string[];
let rconFails: boolean;

beforeEach(() => {
  vi.resetModules();
  execCalls = [];
  rconFails = false;
  vi.doMock("../lib/remote-exec", () => ({
    execRemotePowerShell: vi.fn(async (_target: unknown, psCommand: string) => {
      execCalls.push(psCommand);
      return { ok: true, exitCode: 0, stdout: "", stderr: "" };
    }),
  }));
  vi.doMock("rcon-client", () => ({
    Rcon: {
      connect: vi.fn(async () => {
        if (rconFails) throw new Error("connect ECONNREFUSED");
        return { send: async () => "Stopping the server", end: () => {} };
      }),
    },
  }));
});

afterEach(() => {
  vi.doUnmock("../lib/remote-exec");
  vi.doUnmock("rcon-client");
  vi.resetModules();
});

describe("MinecraftAdapter.stop() lifecycle.stopCommand fallback", () => {
  it("uses RCON when it works and never touches SSH", async () => {
    const { MinecraftAdapter } = await import("../lib/adapters/minecraft-adapter");
    const result = await new MinecraftAdapter(DEF).stop();
    expect(result.success).toBe(true);
    expect(execCalls).toEqual([]);
  });

  it("falls back to stopCommand over SSH when RCON fails", async () => {
    rconFails = true;
    const { MinecraftAdapter } = await import("../lib/adapters/minecraft-adapter");
    const result = await new MinecraftAdapter(DEF).stop();
    expect(result.success).toBe(true);
    expect(result.message).toMatch(/RCON stop failed/);
    expect(result.message).toMatch(/SSH/);
    expect(execCalls).toEqual([LIFECYCLE.stopCommand]);
  });

  it("reports failure without SSH when no stopCommand is configured", async () => {
    rconFails = true;
    const { MinecraftAdapter } = await import("../lib/adapters/minecraft-adapter");
    const adapter = new MinecraftAdapter({
      ...DEF,
      lifecycle: { ...LIFECYCLE, stopCommand: undefined },
    });
    const result = await adapter.stop();
    expect(result.success).toBe(false);
    expect(execCalls).toEqual([]);
  });
});

describe("MinecraftAdapter remote console refusal message", () => {
  it("points at the Stop/Restart buttons when a lifecycle block exists", async () => {
    const { MinecraftAdapter } = await import("../lib/adapters/minecraft-adapter");
    const result = new MinecraftAdapter(DEF).sendCommand("restart");
    expect(result.success).toBe(false);
    expect(result.message).toMatch(/Stop \/ Restart buttons/);
    expect(result.message).not.toMatch(/launcher on the host/);
  });

  it("points at the host launcher when there's no lifecycle block", async () => {
    const { MinecraftAdapter } = await import("../lib/adapters/minecraft-adapter");
    const result = new MinecraftAdapter({ ...DEF, lifecycle: undefined }).sendCommand("stop");
    expect(result.success).toBe(false);
    expect(result.message).toMatch(/launcher on the host/);
  });
});

describe("MinecraftAdapter hasBackups capability", () => {
  it("is on for local servers and off for remote ones", async () => {
    const { MinecraftAdapter } = await import("../lib/adapters/minecraft-adapter");
    expect(new MinecraftAdapter({ ...DEF, rconHost: undefined, lifecycle: undefined }).capabilities.hasBackups).toBe(true);
    expect(new MinecraftAdapter(DEF).capabilities.hasBackups).toBe(false);
  });
});
