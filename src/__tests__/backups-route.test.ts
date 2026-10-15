import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { ServerAdapter, ServerDefinition } from "../lib/adapters/types";

/**
 * /api/backups hands off to any adapter with getBackups + runBackup, rather
 * than a list of game names that each new game had to be added to.
 */

const registry = vi.hoisted(() => ({
  getAdapter: vi.fn(),
  getDefaultServerId: vi.fn(() => "s"),
}));
vi.mock("@/lib/adapters/adapter-registry", () => registry);
vi.mock("@/lib/activity", () => ({ recordActivity: vi.fn() }));

import { GET, POST } from "../app/api/backups/route";

function fakeAdapter(type: ServerDefinition["type"], withBackups: boolean) {
  const adapter = {
    def: { id: "s", name: "S", type, dir: "C:\\servers\\s" },
    getBackups: vi.fn(async () => ({ hourly: [], daily: [{ name: "x.zip" }] })),
    runBackup: vi.fn(async (t: string) => ({ success: true, message: `ran ${t}` })),
  };
  if (!withBackups) {
    delete (adapter as Partial<typeof adapter>).getBackups;
    delete (adapter as Partial<typeof adapter>).runBackup;
  }
  return adapter as unknown as ServerAdapter & typeof adapter;
}

const url = "http://localhost/api/backups?server=s";

describe("/api/backups", () => {
  beforeEach(() => registry.getAdapter.mockReset());

  it("lists a 7D2D server's backups through its adapter", async () => {
    const adapter = fakeAdapter("7d2d", true);
    registry.getAdapter.mockReturnValue(adapter);
    const res = await GET(new NextRequest(url));
    expect(await res.json()).toEqual({ hourly: [], daily: [{ name: "x.zip" }] });
    expect(adapter.getBackups).toHaveBeenCalledOnce();
  });

  it("runs the requested backup type", async () => {
    const adapter = fakeAdapter("7d2d", true);
    registry.getAdapter.mockReturnValue(adapter);
    const res = await POST(new NextRequest(url, { method: "POST", body: JSON.stringify({ type: "daily" }) }));
    expect(await res.json()).toEqual({ success: true, message: "ran daily" });
    expect(adapter.runBackup).toHaveBeenCalledWith("daily");
  });

  it("treats anything but daily as hourly", async () => {
    const adapter = fakeAdapter("palworld", true);
    registry.getAdapter.mockReturnValue(adapter);
    await POST(new NextRequest(url, { method: "POST", body: JSON.stringify({ type: "weekly" }) }));
    expect(adapter.runBackup).toHaveBeenCalledWith("hourly");
  });

  it("404s a non-Minecraft server without backup methods", async () => {
    registry.getAdapter.mockReturnValue(fakeAdapter("enshrouded", false));
    const res = await GET(new NextRequest(url));
    expect(res.status).toBe(404);
  });
});
