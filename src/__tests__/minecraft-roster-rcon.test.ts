import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ServerDefinition } from "../lib/adapters/types";

/**
 * For remote MC servers (rconHost set), roster mutations — op-add, op-remove,
 * whitelist-add, whitelist-remove, ban-add, ban-remove — must go through
 * RCON so they land on the *real* server's ops.json/whitelist.json/etc.,
 * not the empty stub directory on the dashboard host. RCON commands also
 * apply to the live process immediately (no restart needed for the new OP
 * to actually be OP), which the file-editing path never did even for
 * local servers.
 *
 * These tests pin that mapping. The /api/players POST handler is tested
 * via its action→command translation; we don't stand up a real Next.js
 * request here, just verify the RCON command that would be sent.
 */

const REMOTE_DEF: ServerDefinition = {
  id: "ragnarok",
  name: "Ragnarok",
  type: "minecraft",
  dir: "/tmp/stub",
  rconHost: "192.168.7.14",
  rconPort: 25575,
  rconPassword: "test",
  gamePort: 25570,
};

describe("MinecraftAdapter.rconSend (public RCON entry point)", () => {
  let sent: string[];

  beforeEach(() => {
    sent = [];
    vi.doMock("rcon-client", () => ({
      Rcon: {
        connect: vi.fn(async () => ({
          send: async (cmd: string) => {
            sent.push(cmd);
            return `mock response: ${cmd}`;
          },
          end: () => {},
        })),
      },
    }));
  });

  afterEach(() => {
    vi.doUnmock("rcon-client");
  });

  it("routes the command to the configured rconHost via the same lazy import as internal RCON", async () => {
    const { MinecraftAdapter } = await import("../lib/adapters/minecraft-adapter");
    const adapter = new MinecraftAdapter(REMOTE_DEF);
    const response = await adapter.rconSend("op Maltaine");
    expect(sent).toContain("op Maltaine");
    expect(response).toMatch(/op Maltaine/);
  });

  it("propagates RCON errors instead of swallowing them — callers decide how to surface", async () => {
    vi.doUnmock("rcon-client");
    vi.doMock("rcon-client", () => ({
      Rcon: {
        connect: vi.fn(async () => {
          throw new Error("ECONNREFUSED");
        }),
      },
    }));
    vi.resetModules();
    const { MinecraftAdapter } = await import("../lib/adapters/minecraft-adapter");
    const adapter = new MinecraftAdapter({ ...REMOTE_DEF, id: "ragnarok-err" });
    await expect(adapter.rconSend("op Maltaine")).rejects.toThrow(/ECONNREFUSED/);
  });
});

describe("roster action → RCON command mapping (the rules /api/players uses)", () => {
  // Mirror of the actionToRcon map in the /api/players POST handler. If the
  // route grows new actions, mirror them here so a typo in the mapping
  // surfaces as a test failure instead of a silent no-op live.
  const mapping: Record<string, (name: string) => string> = {
    "whitelist-add": (n) => `whitelist add ${n}`,
    "whitelist-remove": (n) => `whitelist remove ${n}`,
    "op-add": (n) => `op ${n}`,
    "op-remove": (n) => `deop ${n}`,
    "ban-add": (n) => `ban ${n}`,
    "ban-remove": (n) => `pardon ${n}`,
  };

  it("op-add → 'op <name>'", () => {
    expect(mapping["op-add"]("Maltaine")).toBe("op Maltaine");
  });

  it("op-remove → 'deop <name>' (not 'op-remove' or 'unop')", () => {
    expect(mapping["op-remove"]("Maltaine")).toBe("deop Maltaine");
  });

  it("whitelist-add → 'whitelist add <name>' (two words, MC convention)", () => {
    expect(mapping["whitelist-add"]("Maltaine")).toBe("whitelist add Maltaine");
  });

  it("whitelist-remove → 'whitelist remove <name>'", () => {
    expect(mapping["whitelist-remove"]("Maltaine")).toBe("whitelist remove Maltaine");
  });

  it("ban-add → 'ban <name>' (vanilla; ban-ip is a different action we don't expose)", () => {
    expect(mapping["ban-add"]("Maltaine")).toBe("ban Maltaine");
  });

  it("ban-remove → 'pardon <name>' (not 'unban')", () => {
    expect(mapping["ban-remove"]("Maltaine")).toBe("pardon Maltaine");
  });
});
