import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import type { ServerDefinition } from "../lib/adapters/types";

/**
 * V Rising: ServerHostSettings.json under -persistentDataPath, seeded from
 * the shipped template the first time (listed), with ports and RCON written
 * before every start; RCON `shutdown` for a clean stop.
 */

const proc = vi.hoisted(() => ({
  running: false,
  execs: [] as string[],
  spawns: [] as { exe: string; args: string[]; opts: Record<string, unknown> }[],
  rconCommands: [] as { command: string; port: number; password: string }[],
  rconFails: false,
  exitOnShutdown: true,
}));

vi.mock("child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof import("child_process")>();
  return {
    ...actual,
    exec: vi.fn((cmd: string, _opts: unknown, cb: (err: Error | null, stdout: string) => void) => {
      proc.execs.push(cmd);
      if (cmd.startsWith("taskkill")) proc.running = false;
      const probe = cmd.includes("Get-CimInstance");
      cb(null, probe && proc.running ? "777|209715200|2026-10-12T10:00:00.0000000+00:00" : "");
    }),
    spawn: vi.fn((exe: string, args: string[], opts: Record<string, unknown>) => {
      proc.spawns.push({ exe, args, opts });
      return { on: vi.fn(), unref: vi.fn() };
    }),
  };
});

vi.mock("rcon-client", () => ({
  Rcon: {
    connect: vi.fn(async ({ port, password }: { port: number; password: string }) => {
      if (proc.rconFails) throw new Error("connect ECONNREFUSED 127.0.0.1:" + port);
      return {
        send: vi.fn(async (command: string) => {
          proc.rconCommands.push({ command, port, password });
          if (command === "shutdown" && proc.exitOnShutdown) proc.running = false;
          return "";
        }),
        end: vi.fn(),
      };
    }),
  },
}));

import { VRisingAdapter } from "../lib/adapters/vrising-adapter";
import {
  editableHostSettings,
  mergeHostSettings,
  parseSettingsJson,
  prepareHostSettings,
  validateHostSettings,
} from "../lib/vrising-settings";

let tmp: string;
let dir: string;
let n = 0;

const hostPath = () => path.join(dir, "save-data", "Settings", "ServerHostSettings.json");
const readHost = () => parseSettingsJson(fs.readFileSync(hostPath(), "utf8"));
const BOM = "\uFEFF";

/** The shipped template, BOM and all, as the game ships it: unlisted, RCON off. */
function shipTemplate() {
  const file = path.join(dir, "VRisingServer_Data", "StreamingAssets", "Settings", "ServerHostSettings.json");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(
    file,
    BOM +
      JSON.stringify({
        Name: "V Rising Server",
        SaveName: "world1",
        Port: 9876,
        QueryPort: 9877,
        ListOnSteam: false,
        ListOnEOS: false,
        AutoSaveInterval: 120,
        Rcon: { Enabled: false, Port: 25575, Password: "" },
      })
  );
}

function adapter(overrides: Partial<ServerDefinition> = {}) {
  return new VRisingAdapter({ id: `vr-${n++}`, name: "Kitsune Castle", type: "vrising", dir, ...overrides });
}

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "kd-vrising-"));
  dir = path.join(tmp, "server");
  fs.mkdirSync(dir);
  fs.writeFileSync(path.join(dir, "VRisingServer.exe"), "");
  proc.running = false;
  proc.execs.length = 0;
  proc.spawns.length = 0;
  proc.rconCommands.length = 0;
  proc.rconFails = false;
  proc.exitOnShutdown = true;
});

afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe("settings", () => {
  it("parses a file with or without the BOM the game writes", () => {
    expect(parseSettingsJson(BOM + '{"Name":"A"}')).toEqual({ Name: "A" });
    expect(parseSettingsJson('{"Name":"A"}')).toEqual({ Name: "A" });
    expect(() => parseSettingsJson("[1]")).toThrow();
  });

  it("seeds from the template, listed, with the Den's ports and RCON", () => {
    const { settings, seeded } = prepareHostSettings({
      current: null,
      template: { Name: "V Rising Server", ListOnSteam: false, ListOnEOS: false, Rcon: { Enabled: false, Port: 25575, Password: "" } },
      port: 9878,
      queryPort: 9879,
      rconPort: 25580,
      rconPassword: "secret-rcon",
    });
    expect(seeded).toBe(true);
    expect(settings).toMatchObject({
      Name: "V Rising Server",
      ListOnSteam: true,
      ListOnEOS: true,
      Port: 9878,
      QueryPort: 9879,
      Rcon: { Enabled: true, Port: 25580, Password: "secret-rcon" },
    });
  });

  it("leaves an existing file's listing alone and keeps its RCON password", () => {
    const { settings, seeded } = prepareHostSettings({
      current: { ListOnSteam: false, Rcon: { Enabled: false, Port: 1, Password: "kept" } },
      template: null,
      port: 9876,
      queryPort: 9877,
      rconPort: 25575,
    });
    expect(seeded).toBe(false);
    expect(settings.ListOnSteam).toBe(false);
    expect(settings.Rcon).toEqual({ Enabled: true, Port: 25575, Password: "kept" });
  });

  it("generates an RCON password when there's none anywhere", () => {
    const { settings } = prepareHostSettings({ current: {}, template: null, port: 9876, queryPort: 9877, rconPort: 25575 });
    expect((settings.Rcon as { Password: string }).Password).toMatch(/^[A-Za-z0-9_-]{16}$/);
  });

  it("keeps the Den's keys off the Config tab and out of a save", () => {
    const current = { Name: "A", Port: 9876, Rcon: { Password: "secret" }, AutoSaveInterval: 120 };
    expect(editableHostSettings(current)).toEqual({ Name: "A", AutoSaveInterval: 120 });
    expect(mergeHostSettings(current, { Name: "B", Port: 1, Rcon: {} })).toEqual({
      Name: "B",
      Port: 9876,
      Rcon: { Password: "secret" },
      AutoSaveInterval: 120,
    });
  });

  it("keeps numbers numbers", () => {
    expect(mergeHostSettings({ AutoSaveInterval: 120 }, { AutoSaveInterval: "300" }).AutoSaveInterval).toBe(300);
  });

  it("rejects an empty name or save name and unknown presets", () => {
    expect(validateHostSettings({ Name: " " })).toMatch(/server name/);
    expect(validateHostSettings({ SaveName: "" })).toMatch(/save name/);
    expect(validateHostSettings({ GameSettingsPreset: "Nightmare" })).toMatch(/Unknown game settings preset/);
    expect(validateHostSettings({ GameDifficultyPreset: "Difficulty_Brutal", GameSettingsPreset: "Level90PvE" })).toBeNull();
  });
});

describe("VRisingAdapter.start", () => {
  it("has RCON, backups, SteamCMD updates and a JSON config", () => {
    expect(adapter().capabilities).toMatchObject({ hasRcon: true, hasBackups: true, hasSteamUpdate: true, hasJsonConfig: true });
  });

  it("seeds ServerHostSettings.json before the first start and launches with -persistentDataPath", async () => {
    shipTemplate();
    const result = await adapter({ gamePort: 9878, rconPort: 25580, rconPassword: "from-servers-json" }).start();

    expect(result.success).toBe(true);
    expect(result.message).toContain("listed on Steam and EOS, with RCON on");
    expect(fs.readFileSync(hostPath(), "utf8").startsWith(BOM)).toBe(false);
    expect(readHost()).toMatchObject({
      Name: "V Rising Server",
      ListOnSteam: true,
      Port: 9878,
      QueryPort: 9879,
      Rcon: { Enabled: true, Port: 25580, Password: "from-servers-json" },
    });
    const { exe, args, opts } = proc.spawns[0];
    expect(exe).toBe(path.join(dir, "VRisingServer.exe"));
    expect(args).toEqual(["-persistentDataPath", "save-data"]);
    expect(args).not.toContain("-logFile");
    expect(opts).toMatchObject({ cwd: dir, detached: true, windowsHide: true });
  });

  it("re-asserts ports and RCON on a later start, keeping everything else", async () => {
    fs.mkdirSync(path.dirname(hostPath()), { recursive: true });
    fs.writeFileSync(hostPath(), BOM + JSON.stringify({ Name: "Mine", ListOnSteam: false, Port: 1, Rcon: { Enabled: false } }));
    const result = await adapter({ gamePort: 9876 }).start();
    expect(result.message).toBe("Server starting...");
    expect(readHost()).toMatchObject({ Name: "Mine", ListOnSteam: false, Port: 9876, QueryPort: 9877, Rcon: { Enabled: true, Port: 25575 } });
  });

  it("leaves a file it can't parse alone and says so", async () => {
    fs.mkdirSync(path.dirname(hostPath()), { recursive: true });
    fs.writeFileSync(hostPath(), "{ not json");
    const result = await adapter().start();
    expect(result.success).toBe(true);
    expect(result.message).toContain("isn't valid JSON");
    expect(fs.readFileSync(hostPath(), "utf8")).toBe("{ not json");
  });

  it("points at the Update tab when the server isn't installed", async () => {
    fs.rmSync(path.join(dir, "VRisingServer.exe"));
    expect((await adapter().start()).message).toContain("Install it from the Update tab first");
  });
});

describe("VRisingAdapter.stop", () => {
  beforeEach(() => {
    fs.mkdirSync(path.dirname(hostPath()), { recursive: true });
    fs.writeFileSync(hostPath(), JSON.stringify({ AutoSaveInterval: 90, Rcon: { Enabled: true, Port: 25575, Password: "in-file" } }));
    proc.running = true;
  });

  it("sends shutdown over RCON with the file's password, and V Rising saves on the way out", async () => {
    const result = await adapter().stop();
    expect(proc.rconCommands).toEqual([{ command: "shutdown", port: 25575, password: "in-file" }]);
    expect(result).toEqual({ success: true, message: "Server stopped. V Rising saved on the way out." });
    expect(proc.execs.some((c) => c.startsWith("taskkill"))).toBe(false);
  });

  it("kills it and names the autosave when RCON doesn't answer", async () => {
    proc.rconFails = true;
    const result = await adapter().stop();
    expect(proc.execs.some((c) => c.startsWith("taskkill /PID 777 /F"))).toBe(true);
    expect(result.message).toBe("RCON didn't answer, so V Rising was killed. The world keeps its last autosave (every 90 s).");
  });
});

describe("VRisingAdapter config", () => {
  it("shows the host settings without ports or the RCON password, and saves over the file", async () => {
    fs.mkdirSync(path.dirname(hostPath()), { recursive: true });
    fs.writeFileSync(
      hostPath(),
      BOM + JSON.stringify({ Name: "Mine", Port: 9876, QueryPort: 9877, AutoSaveInterval: 120, Rcon: { Password: "secret" } })
    );
    const a = adapter();
    const config = await a.getConfig();
    expect(config).toEqual({ Name: "Mine", AutoSaveInterval: 120 });
    expect(JSON.stringify(config)).not.toContain("secret");

    expect(await a.saveConfig({ ...config, Name: "" })).toEqual({ success: false, message: "V Rising needs a server name." });
    expect((await a.saveConfig({ ...config, Name: "Renamed", AutoSaveInterval: "60" })).success).toBe(true);
    expect(readHost()).toEqual({ Name: "Renamed", Port: 9876, QueryPort: 9877, AutoSaveInterval: 60, Rcon: { Password: "secret" } });
    expect(fs.existsSync(hostPath() + ".bak")).toBe(true);
  });

  it("a save before the first start still lists the server", async () => {
    shipTemplate();
    const a = adapter();
    const config = await a.getConfig();
    expect(config).toMatchObject({ Name: "V Rising Server", ListOnSteam: true, ListOnEOS: true });
    expect((await a.saveConfig({ ...config, Name: "Early Edit" })).success).toBe(true);
    expect(readHost()).toMatchObject({ Name: "Early Edit", ListOnSteam: true, ListOnEOS: true });
    // An explicit choice in that first save still wins.
    expect((await a.saveConfig({ ...config, ListOnSteam: false })).success).toBe(true);
    expect(readHost().ListOnSteam).toBe(false);
  });

  it("refuses to save over a file it can't parse", async () => {
    fs.mkdirSync(path.dirname(hostPath()), { recursive: true });
    fs.writeFileSync(hostPath(), "{ broken");
    expect((await adapter().saveConfig({ Name: "X" })).success).toBe(false);
    expect(fs.readFileSync(hostPath(), "utf8")).toBe("{ broken");
  });
});

describe("VRisingAdapter backups and updates", () => {
  it("zips save-data", async () => {
    fs.mkdirSync(path.join(dir, "save-data", "Saves", "world1"), { recursive: true });
    fs.writeFileSync(path.join(dir, "save-data", "Saves", "world1", "AutoSave_1.save.gz"), "w");
    const result = await adapter().runBackup("hourly");
    expect(result.success).toBe(true);
    const zip = proc.execs.find((c) => c.includes("Compress-Archive"))!;
    expect(zip).toContain(path.join(tmp, "backups", "vrising", "hourly"));
  });

  it("updates app 1829350 on the installed branch", async () => {
    const a = adapter({ steamCmdPath: "C:\\steamcmd\\steamcmd.exe" });
    expect(await a.updateServer()).toEqual({ success: true, message: "Updated on the public branch." });
    expect(proc.execs.some((c) => c.includes("+app_update 1829350 validate"))).toBe(true);
  });
});
