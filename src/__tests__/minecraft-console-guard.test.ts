import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import type { ServerDefinition } from "../lib/adapters/types";

/**
 * The console pane (POST /api/server { action: "command" }) forwards typed
 * commands to the adapter's sendCommand(). For a remote MC server we want
 * two things:
 *
 *   1. RCON-route everything that ISN'T a lifecycle command, so the
 *      console is actually useful — gamerule, say, time set, etc.
 *   2. Refuse stop/restart/shutdown for remote entries. The dashboard can
 *      RCON-stop them, but can't bring them back up — and people will type
 *      "stop" in a console pane the same way they'd type it in vanilla MC's
 *      F3+T menu, expecting a soft "restart cycle." For local servers the
 *      Topbar's Restart already covers that flow; for remote, the operator
 *      has to RDP into the host and the dashboard shouldn't pretend otherwise.
 */

const REMOTE_DEF: ServerDefinition = {
  id: "ragnarok",
  name: "Ragnarok",
  type: "minecraft",
  dir: "/tmp/stub",
  rconHost: "192.168.7.14",
  rconPort: 25575,
  rconPassword: "test-password",
  gamePort: 25570,
};

const LOCAL_DEF: ServerDefinition = {
  id: "local-mc",
  name: "Local MC",
  type: "minecraft",
  dir: "/tmp/local",
  rconPort: 25575,
  rconPassword: "test-password",
  gamePort: 25565,
};

describe("sendCommand on remote MC servers", () => {
  let sentCommands: string[];

  beforeEach(() => {
    sentCommands = [];
    vi.doMock("rcon-client", () => ({
      Rcon: {
        connect: vi.fn(async () => ({
          send: async (cmd: string) => {
            sentCommands.push(cmd);
            return `mock response to: ${cmd}`;
          },
          end: () => {},
        })),
      },
    }));
  });

  afterEach(() => {
    vi.doUnmock("rcon-client");
  });

  it("refuses bare 'stop' and never touches RCON", async () => {
    const { MinecraftAdapter } = await import("../lib/adapters/minecraft-adapter");
    const adapter = new MinecraftAdapter(REMOTE_DEF);
    const result = adapter.sendCommand("stop");
    expect(result.success).toBe(false);
    expect(result.message).toMatch(/lifecycle command/i);
    // Wait a tick to let any erroneous async send complete.
    await new Promise((r) => setTimeout(r, 50));
    expect(sentCommands).toEqual([]);
  });

  it("refuses '/stop' (leading slash, MC convention)", async () => {
    const { MinecraftAdapter } = await import("../lib/adapters/minecraft-adapter");
    const adapter = new MinecraftAdapter(REMOTE_DEF);
    expect(adapter.sendCommand("/stop").success).toBe(false);
  });

  it("refuses 'stop 10' (with countdown arg some plugins accept)", async () => {
    const { MinecraftAdapter } = await import("../lib/adapters/minecraft-adapter");
    const adapter = new MinecraftAdapter(REMOTE_DEF);
    const result = adapter.sendCommand("stop 10");
    expect(result.success).toBe(false);
    expect(result.message).toMatch(/lifecycle command/i);
  });

  it("refuses 'STOP' (case-insensitive)", async () => {
    const { MinecraftAdapter } = await import("../lib/adapters/minecraft-adapter");
    const adapter = new MinecraftAdapter(REMOTE_DEF);
    expect(adapter.sendCommand("STOP").success).toBe(false);
  });

  it("refuses 'restart' and 'shutdown'", async () => {
    const { MinecraftAdapter } = await import("../lib/adapters/minecraft-adapter");
    const adapter = new MinecraftAdapter(REMOTE_DEF);
    expect(adapter.sendCommand("restart").success).toBe(false);
    expect(adapter.sendCommand("shutdown").success).toBe(false);
    expect(adapter.sendCommand("/restart").success).toBe(false);
  });

  it("does NOT refuse '/kill' — vanilla MC kill is an entity command, not a server shutdown", async () => {
    const { MinecraftAdapter } = await import("../lib/adapters/minecraft-adapter");
    const adapter = new MinecraftAdapter(REMOTE_DEF);
    const result = adapter.sendCommand("/kill @e[type=zombie]");
    expect(result.success).toBe(true);
    expect(result.message).toMatch(/RCON/i);
    // Drain the fire-and-forget RCON send so it doesn't leak into the
    // next test's sentCommands assertion.
    await new Promise((r) => setTimeout(r, 50));
  });

  it("forwards non-shutdown commands through RCON", async () => {
    const { MinecraftAdapter } = await import("../lib/adapters/minecraft-adapter");
    const adapter = new MinecraftAdapter(REMOTE_DEF);
    const result = adapter.sendCommand("say Hello from the dashboard");
    expect(result.success).toBe(true);
    expect(result.message).toMatch(/RCON/i);
    await new Promise((r) => setTimeout(r, 50));
    expect(sentCommands).toContain("say Hello from the dashboard");
  });

  it("forwards 'list' through RCON (we use list internally for online players)", async () => {
    const { MinecraftAdapter } = await import("../lib/adapters/minecraft-adapter");
    const adapter = new MinecraftAdapter(REMOTE_DEF);
    expect(adapter.sendCommand("list").success).toBe(true);
    await new Promise((r) => setTimeout(r, 50));
    expect(sentCommands).toContain("list");
  });
});

describe("sendCommand on local MC servers (regression guard)", () => {
  it("does NOT route through RCON when rconHost is unset", async () => {
    const sent: string[] = [];
    vi.doMock("rcon-client", () => ({
      Rcon: {
        connect: vi.fn(async () => ({
          send: async (cmd: string) => {
            sent.push(cmd);
            return "";
          },
          end: () => {},
        })),
      },
    }));
    const { MinecraftAdapter } = await import("../lib/adapters/minecraft-adapter");
    const adapter = new MinecraftAdapter(LOCAL_DEF);
    // No local process => returns "not running", does NOT touch RCON.
    const result = adapter.sendCommand("say hi");
    expect(result.success).toBe(false);
    expect(result.message).toMatch(/not running/i);
    await new Promise((r) => setTimeout(r, 50));
    expect(sent).toEqual([]);
    vi.doUnmock("rcon-client");
  });
});
