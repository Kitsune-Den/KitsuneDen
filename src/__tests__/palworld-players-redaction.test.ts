import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { ServerAdapter, ServerDefinition } from "../lib/adapters/types";
import { GET } from "../app/api/players/route";

/**
 * GET /api/players for Palworld used to return `adminPassword:
 * def.rconPassword`, so every Players page load shipped the RCON / in-game
 * admin password to the browser. It's write-only now (the Config tab can set
 * AdminPassword but no longer shows it).
 */

const ADMIN_PASSWORD = "palworld-admin-secret";

const PAL_DEF: ServerDefinition = {
  id: "pal",
  name: "Pal",
  type: "palworld",
  dir: "C:\servers\pal",
  rconPort: 25575,
  rconPassword: ADMIN_PASSWORD,
  restApiPassword: ADMIN_PASSWORD,
};

const palAdapter = {
  def: PAL_DEF,
  getPlayers: vi.fn(async () => ({ players: [], whitelist: [], bans: [] })),
  getAdmins: vi.fn(() => ["76561198000000000"]),
} as unknown as ServerAdapter;

vi.mock("@/lib/adapters/adapter-registry", () => ({
  getAdapter: vi.fn((id: string) => (id === "pal" ? palAdapter : undefined)),
  getDefaultServerId: vi.fn(() => "pal"),
}));

describe("GET /api/players (palworld)", () => {
  it("returns the admin list but never the admin/RCON password", async () => {
    const res = await GET(new NextRequest("http://localhost/api/players?server=pal"));
    const raw = await res.text();
    const body = JSON.parse(raw);

    expect(body.admins).toEqual(["76561198000000000"]);
    expect(body).not.toHaveProperty("adminPassword");
    expect(raw).not.toContain(ADMIN_PASSWORD);
  });
});
