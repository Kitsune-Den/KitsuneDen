import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import type { ServerDefinition } from "../lib/adapters/types";

/**
 * Rust: kitsuneden-rust.json becomes +convar launch arguments, with the
 * measured port layout (RCON game + 1, query game + 2), a mandatory identity
 * and RCON password, and RCON in TCP mode (+rcon.web 0) for rcon-client.
 */

const proc = vi.hoisted(() => ({
  running: false,
  execs: [] as string[],
  spawns: [] as { exe: string; args: string[]; opts: Record<string, unknown> }[],
  rcon: [] as { command: string; port: number; password: string }[],
  rconFails: false,
  playerlist: "[]",
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
      if (cmd.startsWith("taskkill")) proc.running = false;
      if (cmd.includes("Compress-Archive")) {
        const staging = /-Path '(.+?)[\\/]\*'/.exec(cmd)?.[1];
        proc.staged = staging && fsMod.existsSync(staging) ? list(staging).sort() : [];
      }
      cb(null, cmd.includes("Get-CimInstance") && proc.running ? "5150|2147483648|2026-10-12T10:00:00.0000000+00:00" : "");
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
          proc.rcon.push({ command, port, password });
          if (command === "quit") proc.running = false;
          return command === "playerlist" ? proc.playerlist : "";
        }),
        end: vi.fn(),
      };
    }),
  },
}));

import { RustAdapter } from "../lib/adapters/rust-adapter";
import {
  DEN_FILE,
  defaultSettings,
  identityFor,
  isMapCache,
  launchArgs,
  normalizeSettings,
  parsePlayerlist,
  validateSettings,
} from "../lib/rust-settings";

let tmp: string;
let dir: string;
let n = 0;

const readDen = () => JSON.parse(fs.readFileSync(path.join(dir, DEN_FILE), "utf8"));

function adapter(overrides: Partial<ServerDefinition> = {}) {
  return new RustAdapter({ id: `rust-${n++}`, name: "Hapis Island", type: "rust", dir, ...overrides });
}

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "kd-rust-"));
  dir = path.join(tmp, "server-root");
  fs.mkdirSync(dir);
  fs.writeFileSync(path.join(dir, "RustDedicated.exe"), "");
  proc.running = false;
  proc.execs.length = 0;
  proc.spawns.length = 0;
  proc.rcon.length = 0;
  proc.rconFails = false;
  proc.playerlist = "[]";
  proc.staged = [];
});

afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe("settings", () => {
  it("makes a Rust-safe identity from the server id", () => {
    expect(identityFor("hapis-island")).toBe("hapis-island");
    expect(identityFor("my server!")).toBe("my-server");
    expect(identityFor("!!!")).toBe("kitsuneden");
  });

  it("defaults to a valid world with a fresh seed and RCON password", () => {
    const a = defaultSettings("Hapis", "hapis");
    const b = defaultSettings("Hapis", "hapis");
    expect(validateSettings(a)).toBeNull();
    expect(a).toMatchObject({ hostname: "Hapis", identity: "hapis", level: "Procedural Map", worldsize: 4500, maxplayers: 50 });
    expect(a.rconPassword).toMatch(/^[A-Za-z0-9_-]{16}$/);
    expect(a.seed).not.toBe(b.seed);
  });

  it("takes numbers typed as text and keeps the current value for missing keys", () => {
    const base = defaultSettings("Hapis", "hapis");
    const s = normalizeSettings({ worldsize: "3000", seed: "42", hostname: 7 }, base);
    expect(s).toMatchObject({ worldsize: 3000, seed: 42, hostname: "Hapis", rconPassword: base.rconPassword });
  });

  it("refuses what Rust can't run", () => {
    const s = defaultSettings("Hapis", "hapis");
    expect(validateSettings({ ...s, identity: "has space" })).toMatch(/identity/);
    expect(validateSettings({ ...s, worldsize: 9000 })).toMatch(/World size/);
    expect(validateSettings({ ...s, rconPassword: "" })).toMatch(/turns RCON off/);
  });

  it("builds the launch line: identity, measured port layout, TCP RCON", () => {
    const s = { ...defaultSettings("Hapis Island", "hapis"), seed: 1337, worldsize: 3500, description: "Weekly wipe" };
    const args = launchArgs(s, 28115, "C:\\rust\\logs\\rust-server.log", "pw");
    const value = (flag: string) => args[args.indexOf(flag) + 1];
    expect(args.slice(0, 3)).toEqual(["-batchmode", "-logfile", "C:\\rust\\logs\\rust-server.log"]);
    expect(value("+server.identity")).toBe("hapis");
    expect(value("+server.port")).toBe("28115");
    expect(value("+rcon.port")).toBe("28116");
    expect(value("+server.queryport")).toBe("28117");
    expect(value("+rcon.password")).toBe("pw");
    expect(value("+rcon.web")).toBe("0");
    // One argv entry with its spaces: no quoting, no shell.
    expect(value("+server.hostname")).toBe("Hapis Island");
    expect(value("+server.description")).toBe("Weekly wipe");
    expect(value("+server.seed")).toBe("1337");
    expect(value("+server.worldsize")).toBe("3500");
  });

  it("parses playerlist JSON", () => {
    expect(parsePlayerlist('[{"SteamID":"7656","DisplayName":"Ada"},{"displayName":"Fox"}]')).toEqual(["Ada", "Fox"]);
    expect(parsePlayerlist("not json")).toEqual([]);
  });

  it("knows the map caches", () => {
    expect(isMapCache("proceduralmap.4500.1337.287.map")).toBe(true);
    expect(isMapCache("proceduralmap.4500.1337.287_occlusion_3.dat")).toBe(true);
    expect(isMapCache("proceduralmap.4500.1337.287.sav")).toBe(false);
    expect(isMapCache("player.blueprints.5.db")).toBe(false);
  });
});

describe("RustAdapter", () => {
  it("has RCON, backups, SteamCMD updates and a JSON config", () => {
    expect(adapter().capabilities).toMatchObject({ hasRcon: true, hasBackups: true, hasSteamUpdate: true, hasJsonConfig: true });
  });

  it("first start writes kitsuneden-rust.json and launches with it", async () => {
    const a = adapter({ id: "hapis", gamePort: 28115 });
    const result = await a.start();
    const den = readDen();
    expect(result.success).toBe(true);
    expect(result.message).toContain(`world seed ${den.seed}`);
    expect(den.identity).toBe("hapis");
    const { exe, args, opts } = proc.spawns[0];
    expect(exe).toBe(path.join(dir, "RustDedicated.exe"));
    expect(args).toEqual(launchArgs(normalizeSettings(den, den), 28115, path.join(dir, "logs", "rust-server.log"), den.rconPassword));
    expect(opts).toMatchObject({ cwd: dir, detached: true, windowsHide: true });
  });

  it("uses servers.json's RCON password when it's set", async () => {
    await adapter({ rconPassword: "from-den" }).start();
    const args = proc.spawns[0].args;
    expect(args[args.indexOf("+rcon.password") + 1]).toBe("from-den");
  });

  it("points at the Update tab when the server isn't installed", async () => {
    fs.rmSync(path.join(dir, "RustDedicated.exe"));
    expect((await adapter().start()).message).toContain("Install it from the Update tab first");
  });

  it("stops with RCON quit on game port + 1", async () => {
    const a = adapter({ gamePort: 28115 });
    await a.getConfig(); // writes the settings file
    proc.running = true;
    const result = await a.stop();
    expect(proc.rcon).toEqual([{ command: "quit", port: 28116, password: readDen().rconPassword }]);
    expect(result).toEqual({ success: true, message: "Server stopped. Rust saved on the way out." });
  });

  it("kills it when RCON doesn't answer", async () => {
    proc.running = true;
    proc.rconFails = true;
    const result = await adapter().stop();
    expect(proc.execs.some((c) => c.startsWith("taskkill /PID 5150 /F"))).toBe(true);
    expect(result.message).toContain("RCON didn't answer");
  });

  it("lists players with playerlist", async () => {
    proc.running = true;
    proc.playerlist = '[{"DisplayName":"Ada"}]';
    expect((await adapter().getPlayers()).players.map((p) => p.name)).toEqual(["Ada"]);
  });

  it("keeps the RCON password off the Config tab and out of saves", async () => {
    const a = adapter();
    const config = await a.getConfig();
    expect(config).not.toHaveProperty("rconPassword");
    const password = readDen().rconPassword;
    expect((await a.saveConfig({ ...config, hostname: "Renamed", worldsize: "3000", rconPassword: "hijack" })).success).toBe(true);
    expect(readDen()).toMatchObject({ hostname: "Renamed", worldsize: 3000, rconPassword: password });
    expect(await a.saveConfig({ ...config, worldsize: 12000 })).toEqual({ success: false, message: "World size needs to be between 1000 and 6000." });
  });

  it("saves, then zips the world without the map caches", async () => {
    const a = adapter({ id: "hapis" });
    await a.getConfig();
    const world = path.join(dir, "server", "hapis");
    fs.mkdirSync(path.join(world, "cfg"), { recursive: true });
    for (const f of ["proceduralmap.4500.1.287.sav", "proceduralmap.4500.1.287.map", "proceduralmap.4500.1.287_occlusion_3.dat", "player.blueprints.5.db", "cfg/server.cfg"]) {
      fs.writeFileSync(path.join(world, f), "x");
    }
    proc.running = true;
    const result = await a.runBackup("daily");
    expect(result.success).toBe(true);
    expect(proc.rcon.map((r) => r.command)).toEqual(["server.save"]);
    expect(proc.staged).toEqual([
      DEN_FILE,
      "server/hapis/cfg/server.cfg",
      "server/hapis/player.blueprints.5.db",
      "server/hapis/proceduralmap.4500.1.287.sav",
    ]);
  }, 15_000);

  it("updates app 258550 on the installed branch", async () => {
    const result = await adapter({ steamCmdPath: "C:\\steamcmd\\steamcmd.exe" }).updateServer();
    expect(result).toEqual({ success: true, message: "Updated on the public branch." });
    expect(proc.execs.some((c) => c.includes("+app_update 258550 validate"))).toBe(true);
  });
});
