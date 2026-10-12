import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { ServerAdapter, ServerDefinition } from "../lib/adapters/types";
import { GET } from "../app/api/7d2d-sandbox/route";

/**
 * The Sandbox table decides what every letter of a SandboxCode means, and it
 * changes between game versions, so the route must pick it from the version
 * the game logged and only fall back to a guess it labels as one.
 */

const registry = vi.hoisted(() => ({
  getAdapter: vi.fn(),
  getDefaultServerId: vi.fn(() => "7d"),
}));
vi.mock("@/lib/adapters/adapter-registry", () => registry);

function fakeAdapter(
  type: ServerDefinition["type"],
  version: string | undefined,
  config: Record<string, string> = {}
): ServerAdapter {
  return {
    def: { id: "7d", name: "7D", type, dir: "C:\\servers\\7d" },
    getGameVersion: () => version,
    getConfig: async () => config,
  } as unknown as ServerAdapter;
}

async function get() {
  const res = await GET(new NextRequest("http://localhost/api/7d2d-sandbox?server=7d"));
  return res.json();
}

describe("GET /api/7d2d-sandbox", () => {
  beforeEach(() => registry.getAdapter.mockReset());

  it("serves the table matching the logged version", async () => {
    registry.getAdapter.mockReturnValue(fakeAdapter("7d2d", "V 3.3.0 (b18)"));
    const data = await get();
    expect(data).toMatchObject({ supported: true, versionSource: "log", tableBehind: false });
    expect(data.table.version).toBe("3.3");
  });

  it("serves the 3.2 table to a 3.2 server, not the newest", async () => {
    registry.getAdapter.mockReturnValue(fakeAdapter("7d2d", "V 3.2.0 (b10)"));
    expect((await get()).table.version).toBe("3.2");
  });

  it("flags a server newer than any table", async () => {
    registry.getAdapter.mockReturnValue(fakeAdapter("7d2d", "V 3.4.0 (b3)"));
    const data = await get();
    expect(data).toMatchObject({ supported: true, versionSource: "log", tableBehind: true });
    expect(data.table.version).toBe("3.3");
  });

  it("assumes the newest table only when the config proves it's 3.x", async () => {
    registry.getAdapter.mockReturnValue(fakeAdapter("7d2d", undefined, { SandboxCode: "A" }));
    const data = await get();
    expect(data).toMatchObject({ supported: true, versionSource: "assumed" });
    expect(data.table.version).toBe("3.3");
  });

  it("offers nothing for a 2.x server", async () => {
    registry.getAdapter.mockReturnValue(fakeAdapter("7d2d", "V 2.6 (b14)", { GameDifficulty: "2" }));
    expect(await get()).toEqual({ supported: false, serverVersion: "V 2.6 (b14)" });
  });

  it("offers nothing for other games", async () => {
    registry.getAdapter.mockReturnValue(fakeAdapter("minecraft", undefined));
    expect(await get()).toEqual({ supported: false });
  });
});
