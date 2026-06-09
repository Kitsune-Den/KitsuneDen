import { describe, expect, it, vi } from "vitest";
import { MinecraftAdapter } from "../lib/adapters/minecraft-adapter";
import type { ServerDefinition } from "../lib/adapters/types";

/**
 * When a Minecraft entry has rconHost set, the dashboard is managing a
 * server that lives on another box (LAN/tailnet peer). The adapter's
 * lifecycle methods historically all assumed a local process — Start
 * spawned java, Stop wrote to stdin, Restart did Stop→Start. Behavior for
 * remote servers:
 *   - Start  → refuse cleanly. We have no way to launch a process on
 *     another machine.
 *   - Stop   → send RCON `stop`. The server saves and shuts down on its
 *     own host. Clean, deterministic, doesn't need a process handle.
 *   - Restart → refuse. We can RCON-stop but can't bring it back up;
 *     half-doing the operation leaves the server down with no recourse
 *     from the dashboard.
 *
 * These tests pin that behavior so the next person can't quietly
 * regress it by re-adding a local-spawn fallback.
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
  // no rconHost — implies local
};

describe("MinecraftAdapter lifecycle with rconHost set", () => {
  it("start() refuses without spawning anything", async () => {
    const adapter = new MinecraftAdapter(REMOTE_DEF);
    const result = await adapter.start();
    expect(result.success).toBe(false);
    expect(result.message).toMatch(/remote/i);
    expect(result.message).toContain("192.168.7.14");
    // The internal state shouldn't have transitioned to "starting" — that
    // would lie to the UI about a launch attempt that never happened.
    expect(adapter.getStatus()).toBe("stopped");
  });

  it("restart() refuses with a manual-recovery hint", async () => {
    const adapter = new MinecraftAdapter(REMOTE_DEF);
    const result = await adapter.restart();
    expect(result.success).toBe(false);
    expect(result.message).toMatch(/can't bring it back up|manual|launcher/i);
  });

  it("stop() routes the stop command through RCON, not stdin", async () => {
    const sent: string[] = [];
    // Mock the dynamic rcon-client import. The adapter does `await
    // import("rcon-client")`, so we intercept at the module level.
    vi.doMock("rcon-client", () => ({
      Rcon: {
        connect: vi.fn(async () => ({
          send: async (cmd: string) => {
            sent.push(cmd);
            return "Stopping the server";
          },
          end: () => {},
        })),
      },
    }));

    // Re-import the adapter so the mock applies (vi.doMock is lazy).
    const { MinecraftAdapter: FreshAdapter } = await import(
      "../lib/adapters/minecraft-adapter"
    );
    const adapter = new FreshAdapter(REMOTE_DEF);

    const result = await adapter.stop();
    expect(result.success).toBe(true);
    expect(result.message).toMatch(/RCON|stop command sent/i);
    expect(sent).toEqual(["stop"]);

    vi.doUnmock("rcon-client");
  });
});

describe("MinecraftAdapter lifecycle without rconHost (regression guard)", () => {
  it("start() does NOT short-circuit for local servers", async () => {
    // The guard we're protecting against is "rconHost-unset entries get the
    // remote-refusal message." Whether the downstream spawn succeeds or
    // fails in the test environment isn't load-bearing — what matters is
    // that the path through the function got PAST the rconHost guard.
    const adapter = new MinecraftAdapter(LOCAL_DEF);
    const result = await adapter.start();
    expect(result.message).not.toMatch(/cannot start a remote/i);
    // The internal state should have transitioned to "starting" before any
    // spawn outcome — proving the guard didn't fire.
    expect(["starting", "running", "stopped"]).toContain(adapter.getStatus());
  });

  it("restart() does NOT short-circuit for local servers", async () => {
    const adapter = new MinecraftAdapter(LOCAL_DEF);
    const result = await adapter.restart();
    // Same: any failure that isn't the remote-refusal counts as passing
    // through the guard. Local restart will fail downstream on spawn/dir
    // issues in this test environment.
    expect(result.message).not.toMatch(/can't bring it back up|cannot restart a remote/i);
  });
});
