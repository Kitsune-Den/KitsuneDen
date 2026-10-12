import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { ServerAdapter, ServerDefinition } from "../lib/adapters/types";
import { redactConfigSecrets, restoreConfigSecrets } from "../lib/config-secrets";
import { GET, POST } from "../app/api/config/route";

/**
 * /api/config returned whole game config files, so the Config tab shipped
 * RCON / telnet / admin passwords to the browser on every visit. Those are
 * now write-only: GET blanks them, POST restores any that come back blank.
 */

const MC_PROPS = { motd: "hi", "rcon.port": "25575", "rcon.password": "mc-rcon-secret", "enable-rcon": "true" };
const SEVEN_XML = { ServerName: "7D", ServerPassword: "join-me", TelnetPassword: "telnet-secret", ControlPanelPassword: "" };
const PAL_INI = { ServerName: "Pal", ServerPassword: "pal-join", AdminPassword: "pal-admin-secret", RCONEnabled: "True" };
const ENS_JSON = {
  name: "Ens",
  serverPassword: "ens-join",
  userGroups: [
    { name: "Admin", password: "ens-admin-secret", canKickBan: true, canEditBase: true },
    { name: "Friend", password: "ens-friend", canKickBan: false, canEditBase: true },
    { name: "Guest", password: "", canKickBan: false, canEditBase: false },
  ],
};

describe("redactConfigSecrets", () => {
  it("minecraft: hides rcon.password, keeps everything else", () => {
    const { config, redactedSecrets } = redactConfigSecrets("minecraft", MC_PROPS);
    expect(config).toEqual({ ...MC_PROPS, "rcon.password": "" });
    expect(redactedSecrets).toEqual(["rcon.password"]);
  });

  it("7d2d: hides TelnetPassword; join password stays; blank secrets aren't listed", () => {
    const { config, redactedSecrets } = redactConfigSecrets("7d2d", SEVEN_XML);
    expect(config.TelnetPassword).toBe("");
    expect(config.ServerPassword).toBe("join-me");
    expect(redactedSecrets).toEqual(["TelnetPassword"]);
  });

  it("palworld: hides AdminPassword, not ServerPassword", () => {
    const { config, redactedSecrets } = redactConfigSecrets("palworld", PAL_INI);
    expect(config.AdminPassword).toBe("");
    expect(config.ServerPassword).toBe("pal-join");
    expect(redactedSecrets).toEqual(["AdminPassword"]);
  });

  it("enshrouded: hides passwords of kick/ban groups only", () => {
    const { config, redactedSecrets } = redactConfigSecrets("enshrouded", ENS_JSON);
    const groups = config.userGroups as { name: string; password: string }[];
    expect(groups.map((g) => g.password)).toEqual(["", "ens-friend", ""]);
    expect(config.serverPassword).toBe("ens-join");
    expect(redactedSecrets).toEqual(["userGroups[Admin].password"]);
  });

  it("does not mutate the stored config", () => {
    const stored = structuredClone(ENS_JSON);
    redactConfigSecrets("enshrouded", stored);
    expect(stored).toEqual(ENS_JSON);
  });

  it("hytale: nothing hidden", () => {
    const cfg = { ServerName: "H", Password: "join" };
    expect(redactConfigSecrets("hytale", cfg)).toEqual({ config: cfg, redactedSecrets: [] });
  });
});

describe("restoreConfigSecrets", () => {
  it("puts back a hidden secret that comes back blank", () => {
    const r = restoreConfigSecrets("minecraft", { ...MC_PROPS, "rcon.password": "", motd: "new" }, MC_PROPS);
    expect(r).toEqual({ ok: true, config: { ...MC_PROPS, motd: "new" } });
  });

  it("puts back a hidden secret that is missing (Palworld rewrites the whole INI)", () => {
    const withoutAdmin: Record<string, unknown> = { ...PAL_INI };
    delete withoutAdmin.AdminPassword;
    const r = restoreConfigSecrets("palworld", withoutAdmin, PAL_INI);
    expect(r.ok && r.config.AdminPassword).toBe("pal-admin-secret");
  });

  it("a newly typed secret replaces the stored one", () => {
    const r = restoreConfigSecrets("7d2d", { ...SEVEN_XML, TelnetPassword: "rotated" }, SEVEN_XML);
    expect(r.ok && r.config.TelnetPassword).toBe("rotated");
  });

  it("enshrouded: restores the admin group's password by name", () => {
    const redacted = redactConfigSecrets("enshrouded", ENS_JSON).config;
    const r = restoreConfigSecrets("enshrouded", redacted, ENS_JSON);
    expect(r).toEqual({ ok: true, config: ENS_JSON });
  });

  it("enshrouded: a new admin-group password is kept", () => {
    const submitted = structuredClone(ENS_JSON);
    submitted.userGroups[0].password = "new-admin";
    const r = restoreConfigSecrets("enshrouded", submitted, ENS_JSON);
    expect(r.ok && (r.config.userGroups as { password: string }[])[0].password).toBe("new-admin");
  });

  it("enshrouded: refuses a renamed admin group left without a password", () => {
    const submitted = redactConfigSecrets("enshrouded", ENS_JSON).config as typeof ENS_JSON;
    submitted.userGroups[0] = { ...submitted.userGroups[0], name: "Mods" };
    const r = restoreConfigSecrets("enshrouded", submitted, ENS_JSON);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toMatch(/"Mods".*no password/);
  });

  it("enshrouded: refuses granting kick/ban to a passwordless group", () => {
    const submitted = structuredClone(ENS_JSON);
    submitted.userGroups[2] = { ...submitted.userGroups[2], canKickBan: true };
    expect(restoreConfigSecrets("enshrouded", submitted, ENS_JSON).ok).toBe(false);
  });

  it("enshrouded: an admin group that was already open on disk can still be saved", () => {
    const legacy = structuredClone(ENS_JSON);
    legacy.userGroups[0].password = "";
    expect(restoreConfigSecrets("enshrouded", legacy, legacy)).toEqual({ ok: true, config: legacy });
  });
});

// ---- Route ----

const stored: Record<string, Record<string, unknown>> = {};
const saveConfig = vi.fn(async () => ({ success: true, message: "Config saved" }));

function adapterFor(type: ServerDefinition["type"]): ServerAdapter {
  return {
    def: { id: type, name: type, type, dir: "C:\\x\\y" },
    capabilities: { hasServerProperties: type === "minecraft" },
    getConfig: vi.fn(async () => structuredClone(stored[type])),
    saveConfig,
  } as unknown as ServerAdapter;
}

vi.mock("@/lib/adapters/adapter-registry", () => ({
  getAdapter: vi.fn((id: string) => (stored[id] ? adapterFor(id as ServerDefinition["type"]) : undefined)),
  getDefaultServerId: vi.fn(() => "minecraft"),
}));
vi.mock("@/lib/activity", () => ({ recordActivity: vi.fn() }));

const req = (server: string, body?: unknown) =>
  new NextRequest(`http://localhost/api/config?server=${server}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

describe("/api/config route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stored.minecraft = { ...MC_PROPS };
    stored["7d2d"] = { ...SEVEN_XML };
    stored.palworld = { ...PAL_INI };
    stored.enshrouded = structuredClone(ENS_JSON);
  });

  for (const [type, secret] of [
    ["minecraft", "mc-rcon-secret"],
    ["7d2d", "telnet-secret"],
    ["palworld", "pal-admin-secret"],
    ["enshrouded", "ens-admin-secret"],
  ] as const) {
    it(`GET ${type} never contains the admin secret`, async () => {
      const res = await GET(req(type));
      const raw = await res.text();
      expect(raw).not.toContain(secret);
      expect(JSON.parse(raw).redactedSecrets.length).toBe(1);
    });
  }

  it("GET → POST round trip without edits saves the original secrets", async () => {
    for (const type of ["minecraft", "7d2d", "palworld", "enshrouded"] as const) {
      const { config } = await (await GET(req(type))).json();
      await POST(req(type, config));
      expect(saveConfig).toHaveBeenLastCalledWith(stored[type]);
    }
  });

  it("POST with a new secret saves it", async () => {
    const { config } = await (await GET(req("palworld"))).json();
    await POST(req("palworld", { ...config, AdminPassword: "rotated" }));
    expect(saveConfig).toHaveBeenCalledWith({ ...PAL_INI, AdminPassword: "rotated" });
  });

  it("POST refuses a renamed passwordless admin group and saves nothing", async () => {
    const { config } = await (await GET(req("enshrouded"))).json();
    config.userGroups[0].name = "Mods";
    const res = await POST(req("enshrouded", config));
    expect(res.status).toBe(400);
    expect(saveConfig).not.toHaveBeenCalled();
  });

  it("POST refuses a non-object body", async () => {
    const res = await POST(req("minecraft", ["nope"]));
    expect(res.status).toBe(400);
    expect(saveConfig).not.toHaveBeenCalled();
  });
});
