import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ServerDefinition } from "../lib/adapters/types";

/**
 * Lifecycle path: when a remote MC entry has `lifecycle: { kind: "ssh", ... }`,
 * start() and restart() execute the configured PowerShell command on the
 * remote host instead of refusing. These tests pin that behavior with a
 * mocked execRemotePowerShell so they don't actually shell out to ssh.
 */

const LIFECYCLE_DEF: ServerDefinition = {
  id: "ragnarok",
  name: "Ragnarok",
  type: "minecraft",
  dir: "/tmp/stub",
  rconHost: "192.168.7.14",
  rconPort: 25575,
  rconPassword: "test-password",
  gamePort: 25570,
  lifecycle: {
    kind: "ssh",
    host: "192.168.7.14",
    user: "MCAdmin2023",
    identityFile: "C:\\Servers\\KitsuneDen\\.ssh\\id_kitsuneden_lifecycle",
    startCommand:
      "Start-Process cmd.exe -ArgumentList '/c','run.bat' -WorkingDirectory 'C:\\Installs\\Ragnarok'",
  },
};

const RCON_ONLY_DEF: ServerDefinition = {
  ...LIFECYCLE_DEF,
  id: "rcon-only",
  lifecycle: undefined,
};

describe("MinecraftAdapter start/restart with lifecycle SSH", () => {
  let execCalls: Array<{ target: unknown; psCommand: string }>;

  beforeEach(() => {
    execCalls = [];
    vi.doMock("../lib/remote-exec", () => ({
      execRemotePowerShell: vi.fn(async (target: unknown, psCommand: string) => {
        execCalls.push({ target, psCommand });
        return { ok: true, exitCode: 0, stdout: "", stderr: "" };
      }),
    }));
    // Mock RCON for the restart path (which calls stop() → RCON).
    vi.doMock("rcon-client", () => ({
      Rcon: {
        connect: vi.fn(async () => ({
          send: async () => "Stopping the server",
          end: () => {},
        })),
      },
    }));
  });

  afterEach(() => {
    vi.doUnmock("../lib/remote-exec");
    vi.doUnmock("rcon-client");
  });

  it("start() dispatches the configured PowerShell command via SSH", async () => {
    const { MinecraftAdapter } = await import("../lib/adapters/minecraft-adapter");
    const adapter = new MinecraftAdapter(LIFECYCLE_DEF);

    const result = await adapter.start();
    expect(result.success).toBe(true);
    expect(result.message).toMatch(/dispatched/i);
    expect(execCalls).toHaveLength(1);
    expect(execCalls[0].psCommand).toContain("Start-Process");
    expect(execCalls[0].psCommand).toContain("run.bat");
    expect(execCalls[0].target).toMatchObject({
      host: "192.168.7.14",
      user: "MCAdmin2023",
    });
  });

});

describe("MinecraftAdapter start() with lifecycle SSH — non-zero exit", () => {
  beforeEach(() => {
    // resetModules clears vitest's module cache so the doMock below applies
    // to a fresh minecraft-adapter import. Without this, the previous
    // describe's success-case mock leaks into this one because the adapter
    // module was already evaluated and captured execRemotePowerShell.
    vi.resetModules();
    vi.doMock("../lib/remote-exec", () => ({
      execRemotePowerShell: vi.fn(async () => ({
        ok: false,
        exitCode: 1,
        stdout: "",
        stderr: "Permission denied (publickey).",
      })),
    }));
  });

  afterEach(() => {
    vi.doUnmock("../lib/remote-exec");
    vi.resetModules();
  });

  it("returns failure with the SSH error in the message", async () => {
    const { MinecraftAdapter } = await import("../lib/adapters/minecraft-adapter");
    // Fresh state map per resetModules, so use a unique id to avoid
    // hitting any leftover state from the success-case describe.
    const adapter = new MinecraftAdapter({ ...LIFECYCLE_DEF, id: "ragnarok-fail" });

    const result = await adapter.start();
    expect(result.success).toBe(false);
    expect(result.message).toMatch(/SSH start command failed/i);
  });
});

// NOTE: restart() chains stop() → 15s wait → start(). We don't unit-test
// the full chain because fake-timers + dynamic-mocked modules across the
// stop+start boundary becomes brittle. The pieces are covered: stop() in
// minecraft-remote-lifecycle.test.ts, start()'s SSH dispatch above. The
// 15s wait is exercised in live testing on den.kitsuneden.net.

describe("MinecraftAdapter with rconHost but no lifecycle (regression)", () => {
  it("start() still refuses without lifecycle (no silent fallback)", async () => {
    const { MinecraftAdapter } = await import("../lib/adapters/minecraft-adapter");
    const adapter = new MinecraftAdapter(RCON_ONLY_DEF);
    const result = await adapter.start();
    expect(result.success).toBe(false);
    expect(result.message).toMatch(/lifecycle block|configure a lifecycle/i);
  });

  it("restart() still refuses without lifecycle", async () => {
    const { MinecraftAdapter } = await import("../lib/adapters/minecraft-adapter");
    const adapter = new MinecraftAdapter(RCON_ONLY_DEF);
    const result = await adapter.restart();
    expect(result.success).toBe(false);
  });
});
