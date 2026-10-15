import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import type { ServerDefinition } from "../lib/adapters/types";

/**
 * Valheim: settings in kitsuneden-valheim.json become launch flags, with the
 * rules PackRelay measured (headless flags, password rules, -preset before
 * modifiers, -savedir in the server folder).
 */

// No real processes: exec answers the process probe (nothing running unless
// told otherwise), records commands; spawn records the launch.
const proc = vi.hoisted(() => ({
  running: false,
  execs: [] as string[],
  spawns: [] as { exe: string; args: string[]; opts: Record<string, unknown> }[],
  staged: [] as string[],
}));
vi.mock("child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof import("child_process")>();
  const fsMod = await import("fs");
  const pathMod = await import("path");
  const list = (dir: string, base = dir): string[] =>
    fsMod.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const full = pathMod.join(dir, e.name);
      return e.isDirectory() ? list(full, base) : [pathMod.relative(base, full).split(pathMod.sep).join("/")];
    });
  return {
    ...actual,
    exec: vi.fn((cmd: string, _opts: unknown, cb: (err: Error | null, stdout: string) => void) => {
      proc.execs.push(cmd);
      if (cmd.includes("Compress-Archive")) {
        const staging = /-Path '(.+?)[\\/]\*'/.exec(cmd)?.[1];
        proc.staged = staging && fsMod.existsSync(staging) ? list(staging).sort() : [];
      }
      const probe = cmd.includes("Get-CimInstance");
      cb(null, probe && proc.running ? "4242|104857600|2026-10-12T10:00:00.0000000+00:00" : "");
    }),
    spawn: vi.fn((exe: string, args: string[], opts: Record<string, unknown>) => {
      proc.spawns.push({ exe, args, opts });
      return { on: vi.fn(), unref: vi.fn() };
    }),
  };
});

import { ValheimAdapter, playersFromLog } from "../lib/adapters/valheim-adapter";
import {
  DEN_SAVE_INTERVAL,
  SETTINGS_FILE,
  defaultSettings,
  generatePassword,
  launchArgs,
  normalizeSettings,
  validateSettings,
} from "../lib/valheim-settings";

let tmp: string;
let dir: string;
let n = 0;

function adapter(overrides: Partial<ServerDefinition> = {}) {
  return new ValheimAdapter({ id: `vh-${n++}`, name: "Kitsune Valheim", type: "valheim", dir, gamePort: 2456, ...overrides });
}

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "kd-valheim-"));
  dir = path.join(tmp, "server");
  fs.mkdirSync(dir);
  proc.running = false;
  proc.execs.length = 0;
  proc.spawns.length = 0;
  proc.staged = [];
});

afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe("settings", () => {
  it("generates a 10-character password that reads out loud cleanly", () => {
    const seen = new Set(Array.from({ length: 20 }, generatePassword));
    expect(seen.size).toBe(20);
    for (const pw of seen) expect(pw).toMatch(/^[a-hj-km-np-z2-9]{10}$/);
  });

  it("starts from valid defaults with a 10-minute autosave", () => {
    const s = defaultSettings("Kitsune Valheim");
    expect(validateSettings(s)).toBeNull();
    expect(s).toMatchObject({ name: "Kitsune Valheim", world: "Dedicated", public: true, crossplay: false });
    expect(s.saveinterval).toBe(DEN_SAVE_INTERVAL);
    expect(DEN_SAVE_INTERVAL).toBe(600);
  });

  it("enforces Valheim's password rules", () => {
    const s = { ...defaultSettings("Den"), world: "Midgard" };
    expect(validateSettings({ ...s, password: "abcd" })).toMatch(/at least 5 characters/);
    expect(validateSettings({ ...s, name: "Foxhold server", password: "Foxhold" })).toMatch(/inside the server name/);
    expect(validateSettings({ ...s, world: "Foxhold", password: "Foxhold" })).toMatch(/inside the world name/);
    expect(validateSettings({ ...s, password: "" })).toBeNull();
  });

  it("rejects unknown presets, modifiers and short autosaves", () => {
    const s = defaultSettings("Den");
    expect(validateSettings({ ...s, preset: "nightmare" })).toMatch(/Unknown preset/);
    expect(validateSettings({ ...s, combat: "brutal" })).toMatch(/Unknown combat/);
    expect(validateSettings({ ...s, saveinterval: 30 })).toMatch(/at least 60 seconds/);
  });

  it("fills a hand-edited file's gaps and ignores wrong types", () => {
    const s = normalizeSettings({ world: "Midgard", public: "yes", saveinterval: 300 }, "Den");
    expect(s.world).toBe("Midgard");
    expect(s.public).toBe(true);
    expect(s.saveinterval).toBe(300);
    expect(s.combat).toBe("");
  });
});

describe("launchArgs", () => {
  const log = "C:\\den\\valheim\\logs\\valheim-server.log";

  it("passes the headless flags, identity, port and save folder", () => {
    const args = launchArgs({ ...defaultSettings("Den"), password: "hunter22", world: "Midgard" }, 2466, log);
    expect(args.slice(0, 8)).toEqual(["-nographics", "-batchmode", "-name", "Den", "-port", "2466", "-world", "Midgard"]);
    expect(args).toEqual(expect.arrayContaining(["-password", "hunter22", "-public", "1", "-savedir", "valheim-data"]));
    expect(args.join(" ")).toContain(`-logFile ${log}`);
    expect(args).not.toContain("-crossplay");
  });

  it("puts -preset ahead of every modifier and key", () => {
    const args = launchArgs(
      { ...defaultSettings("Den"), preset: "hard", combat: "veryhard", raids: "none", nomap: true },
      2456,
      log
    );
    const preset = args.indexOf("-preset");
    const firstModifier = args.indexOf("-modifier");
    expect(preset).toBeGreaterThan(-1);
    expect(preset).toBeLessThan(firstModifier);
    expect(args.slice(preset)).toEqual([
      "-preset", "hard",
      "-modifier", "combat", "veryhard",
      "-modifier", "raids", "none",
      "-setkey", "nomap",
    ]);
  });

  it("adds -crossplay by presence and drops -password when there isn't one", () => {
    const args = launchArgs({ ...defaultSettings("Den"), crossplay: true, password: "", public: false }, 2456, log);
    expect(args).toContain("-crossplay");
    expect(args).not.toContain("-password");
    expect(args.join(" ")).toContain("-public 0");
  });
});

describe("playersFromLog", () => {
  it("collects characters that spawned, skipping deaths", () => {
    expect(
      playersFromLog([
        "10/12/2026 10:01:00: Got character ZDOID from Ada : 1234567:1",
        "10/12/2026 10:05:00: Got character ZDOID from Ada : 0:0",
        "10/12/2026 10:06:00: Got character ZDOID from Kitsune Fox : -88812:3",
        "10/12/2026 10:07:00: Got character ZDOID from Ada : 1234567:2",
      ])
    ).toEqual(["Ada", "Kitsune Fox"]);
  });
});

describe("ValheimAdapter", () => {
  function installExe() {
    fs.writeFileSync(path.join(dir, "valheim_server.exe"), "");
  }

  it("has backups, SteamCMD updates and a JSON config, but no console", () => {
    const caps = adapter().capabilities;
    expect(caps).toMatchObject({ hasBackups: true, hasSteamUpdate: true, hasJsonConfig: true, hasRcon: false });
  });

  it("writes kitsuneden-valheim.json on first start and launches with it", async () => {
    installExe();
    const result = await adapter({ gamePort: 2466 }).start();

    const settings = JSON.parse(fs.readFileSync(path.join(dir, SETTINGS_FILE), "utf8"));
    expect(result.success).toBe(true);
    expect(result.message).toContain(`join password ${settings.password}`);
    expect(proc.spawns).toHaveLength(1);
    const { exe, args, opts } = proc.spawns[0];
    expect(exe).toBe(path.join(dir, "valheim_server.exe"));
    expect(args).toEqual(launchArgs(settings, 2466, path.join(dir, "logs", "valheim-server.log")));
    expect(opts).toMatchObject({ cwd: dir, detached: true, windowsHide: true });
  });

  it("refuses to start with settings Valheim would reject", async () => {
    installExe();
    fs.writeFileSync(path.join(dir, SETTINGS_FILE), JSON.stringify({ name: "Foxhold", password: "Foxhold" }));
    const result = await adapter().start();
    expect(result.success).toBe(false);
    expect(result.message).toMatch(/inside the server name\. Change it on the Config tab\./);
    expect(proc.spawns).toEqual([]);
  });

  it("points at the Update tab when the server isn't installed", async () => {
    const result = await adapter().start();
    expect(result.success).toBe(false);
    expect(result.message).toContain("Install it from the Update tab first");
  });

  it("won't start a second copy", async () => {
    installExe();
    proc.running = true;
    expect(await adapter().start()).toEqual({ success: false, message: "Server is already running" });
  });

  it("stays 'starting' until the log says the world is up", async () => {
    installExe();
    const a = adapter();
    await a.start();
    expect(a.getStatus()).toBe("starting");
    proc.running = true;
    fs.mkdirSync(path.join(dir, "logs"), { recursive: true });
    fs.writeFileSync(path.join(dir, "logs", "valheim-server.log"), "10/12/2026 10:02:00: Game server connected\n");
    await vi.waitFor(() => expect(a.getStatus()).toBe("running"), { timeout: 5000, interval: 200 });
  }, 10_000);

  it("validates on save and keeps the previous file", async () => {
    const a = adapter();
    const config = await a.getConfig();
    expect(await a.saveConfig({ ...config, password: "abc" })).toEqual({
      success: false,
      message: "Valheim needs a join password of at least 5 characters.",
    });
    const saved = await a.saveConfig({ ...config, world: "Midgard" });
    expect(saved.success).toBe(true);
    expect(JSON.parse(fs.readFileSync(path.join(dir, SETTINGS_FILE), "utf8")).world).toBe("Midgard");
    expect(fs.existsSync(path.join(dir, SETTINGS_FILE + ".bak"))).toBe(true);
  });

  it("keeps the current settings for keys a save leaves out", async () => {
    const a = adapter();
    const { password } = await a.getConfig();
    // A save with only one key (or a wrongly shaped body) must not swap in
    // fresh defaults, least of all a new random join password.
    expect((await a.saveConfig({ preset: "hard" })).success).toBe(true);
    expect(await a.saveConfig({ config: { world: "Ignored" } })).toMatchObject({ success: true });
    const saved = JSON.parse(fs.readFileSync(path.join(dir, SETTINGS_FILE), "utf8"));
    expect(saved).toMatchObject({ password, preset: "hard", world: "Dedicated" });
  });

  it("zips a copy of valheim-data with the settings", async () => {
    const a = adapter();
    await a.getConfig();
    fs.mkdirSync(path.join(dir, "valheim-data", "worlds_local"), { recursive: true });
    fs.writeFileSync(path.join(dir, "valheim-data", "worlds_local", "Dedicated.db"), "world");
    fs.writeFileSync(path.join(dir, "valheim-data", "worlds_local", "Dedicated.fwl"), "meta");
    fs.writeFileSync(path.join(dir, "valheim-data", "adminlist.txt"), "");

    const result = await a.runBackup("daily");

    expect(result.success).toBe(true);
    expect(proc.staged).toEqual([
      SETTINGS_FILE,
      "valheim-data/adminlist.txt",
      "valheim-data/worlds_local/Dedicated.db",
      "valheim-data/worlds_local/Dedicated.fwl",
    ]);
    const zip = proc.execs.find((c) => c.includes("Compress-Archive"))!;
    expect(zip).toContain(path.join(tmp, "backups", "valheim", "daily"));
  });

  it("says when there's no world to back up yet", async () => {
    const result = await adapter().runBackup("hourly");
    expect(result.success).toBe(false);
    expect(result.message).toContain("Start the server once to create the world");
  });

  it("updates on the installed branch with app 896660", async () => {
    fs.mkdirSync(path.join(dir, "steamapps"));
    fs.writeFileSync(
      path.join(dir, "steamapps", "appmanifest_896660.acf"),
      '"AppState"\n{\n\t"buildid"\t\t"1"\n\t"UserConfig"\n\t{\n\t\t"betakey"\t\t"public-test"\n\t}\n}\n'
    );
    const a = adapter({ steamCmdPath: "C:\\steamcmd\\steamcmd.exe" });
    expect(await a.getUpdateInfo()).toMatchObject({ steamAppId: 896660, branch: "public-test", steamCmdConfigured: true });
    const result = await a.updateServer();
    expect(result).toEqual({ success: true, message: "Updated on the public-test branch." });
    expect(proc.execs.some((c) => c.includes("+app_update 896660 -beta public-test validate"))).toBe(true);
  });

  it("explains that a stop can't save first", async () => {
    proc.running = true;
    const a = adapter();
    // The probe says running until taskkill; then nothing.
    const result = await (async () => {
      const pending = a.stop();
      setTimeout(() => (proc.running = false), 50);
      return pending;
    })();
    expect(result.success).toBe(true);
    expect(result.message).toContain("last autosave (every 10 min)");
    expect(proc.execs.some((c) => c.startsWith("taskkill /PID 4242 /F"))).toBe(true);
  });
});
