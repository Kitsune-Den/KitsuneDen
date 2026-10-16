import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import type { ServerDefinition } from "../lib/adapters/types";

/**
 * ARK: Survival Evolved and Survival Ascended share one core: a travel URL
 * with the map first and the admin password last, RCON SaveWorld/DoExit/
 * ListPlayers, and readiness from an answered RCON call.
 */

const proc = vi.hoisted(() => ({
  running: false,
  execs: [] as string[],
  spawns: [] as { exe: string; args: string[]; opts: Record<string, unknown> }[],
  rcon: [] as { command: string; port: number; password: string }[],
  rconFails: false,
  listPlayers: "No Players Connected",
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
      cb(null, cmd.includes("Get-CimInstance") && proc.running ? "8080|10737418240|2026-10-16T10:00:00.0000000+00:00" : "");
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
          if (command === "DoExit") proc.running = false;
          return command === "ListPlayers" ? proc.listPlayers : "";
        }),
        end: vi.fn(),
      };
    }),
  },
}));

import { ArkAdapter } from "../lib/adapters/ark-adapter";
import {
  DEN_FILE,
  defaultSettings,
  isBackupNoise,
  launchArgs,
  normalizeSettings,
  parseListPlayers,
  redact,
  validateSettings,
} from "../lib/ark-settings";

let tmp: string;
let dir: string;
let n = 0;

const exeFor = { ase: "ShooterGameServer.exe", asa: "ArkAscendedServer.exe" } as const;
const readDen = () => JSON.parse(fs.readFileSync(path.join(dir, DEN_FILE), "utf8"));

function adapter(variant: "ase" | "asa", overrides: Partial<ServerDefinition> = {}) {
  return new ArkAdapter(
    { id: `ark-${n++}`, name: "Kitsune Island", type: variant === "ase" ? "ark-ase" : "ark-asa", dir, ...overrides },
    variant
  );
}

function install(variant: "ase" | "asa") {
  const bin = path.join(dir, "ShooterGame", "Binaries", "Win64");
  fs.mkdirSync(bin, { recursive: true });
  fs.writeFileSync(path.join(bin, exeFor[variant]), "");
}

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "kd-ark-"));
  dir = path.join(tmp, "server");
  fs.mkdirSync(dir);
  proc.running = false;
  proc.execs.length = 0;
  proc.spawns.length = 0;
  proc.rcon.length = 0;
  proc.rconFails = false;
  proc.listPlayers = "No Players Connected";
  proc.staged = [];
});

afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe("travel URL", () => {
  const ports = { game: 7787, query: 27017, rcon: 27021 };

  it("puts the map first and the admin password last (ASE, with MaxPlayers in the URL)", () => {
    const s = { ...defaultSettings("ase", "Kitsune Island"), serverPassword: "letmein", maxPlayers: 20 };
    const [url, ...flags] = launchArgs("ase", s, ports, "admin-pw");
    expect(url).toBe(
      "TheIsland?listen?SessionName=Kitsune Island?Port=7787?QueryPort=27017?RCONEnabled=True?RCONPort=27021?MaxPlayers=20?ServerPassword=letmein?ServerAdminPassword=admin-pw"
    );
    expect(flags).toEqual(["-server", "-log"]);
  });

  it("uses TheIsland_WP and -WinLiveMaxPlayers on ASA, password still last", () => {
    const s = { ...defaultSettings("asa", "Kitsune Island"), maxPlayers: 30 };
    const [url, ...flags] = launchArgs("asa", s, ports, "admin-pw");
    expect(url.startsWith("TheIsland_WP?listen?")).toBe(true);
    expect(url.endsWith("?ServerAdminPassword=admin-pw")).toBe(true);
    expect(url).not.toContain("MaxPlayers=");
    expect(flags).toEqual(["-server", "-log", "-WinLiveMaxPlayers=30"]);
  });

  it("refuses values that would break the URL", () => {
    const s = defaultSettings("ase", "Den");
    expect(validateSettings(s)).toBeNull();
    expect(validateSettings({ ...s, sessionName: "What?" })).toMatch(/session name/);
    expect(validateSettings({ ...s, serverPassword: "two words" })).toMatch(/join password/);
    expect(validateSettings({ ...s, adminPassword: "" })).toMatch(/admin password/);
    expect(validateSettings({ ...s, map: "The Island" })).toMatch(/map/);
    expect(validateSettings({ ...s, maxPlayers: 0 })).toMatch(/Max players/);
  });

  it("keeps the current values for missing keys and takes numbers typed as text", () => {
    const base = defaultSettings("asa", "Den");
    expect(normalizeSettings({ maxPlayers: "40" }, base)).toEqual({ ...base, maxPlayers: 40 });
  });
});

describe("helpers", () => {
  it("parses ListPlayers", () => {
    expect(parseListPlayers("0. Ada, 76561198000000001\n1. Kitsune Fox, 76561198000000002\n")).toEqual(["Ada", "Kitsune Fox"]);
    expect(parseListPlayers("No Players Connected")).toEqual([]);
  });

  it("knows the backup noise: single-player saves and timestamped generations", () => {
    expect(isBackupNoise("SavedArksLocal")).toBe(true);
    expect(isBackupNoise("TheIsland_16.10.2026_10.15.00.ark")).toBe(true);
    expect(isBackupNoise("TheIsland_WP_16.10.2026_10.15.00.arkrbf")).toBe(true);
    expect(isBackupNoise("TheIsland.ark")).toBe(false);
    expect(isBackupNoise("TheIsland_AntiCorruptionBackup.bak")).toBe(false);
  });

  it("redacts secrets from log lines", () => {
    expect(redact("Commandline:  TheIsland_WP?listen?ServerAdminPassword=s3cret", ["s3cret"])).toBe(
      "Commandline:  TheIsland_WP?listen?ServerAdminPassword=********"
    );
  });
});

describe.each(["ase", "asa"] as const)("ArkAdapter (%s)", (variant) => {
  it("first start writes kitsuneden-ark.json and launches the right exe", async () => {
    install(variant);
    const result = await adapter(variant, { gamePort: 7787, queryPort: 27017, rconPort: 27021 }).start();
    const den = readDen();
    expect(result.success).toBe(true);
    expect(result.message).toContain("new admin password");
    expect(den.map).toBe(variant === "ase" ? "TheIsland" : "TheIsland_WP");
    const { exe, args, opts } = proc.spawns[0];
    expect(exe).toBe(path.join(dir, "ShooterGame", "Binaries", "Win64", exeFor[variant]));
    expect(args).toEqual(launchArgs(variant, normalizeSettings(den, den), { game: 7787, query: 27017, rcon: 27021 }, den.adminPassword));
    expect(opts).toMatchObject({ cwd: dir, detached: true, windowsHide: true });
  });

  it("uses servers.json's rconPassword as the admin password when set", async () => {
    install(variant);
    await adapter(variant, { rconPassword: "from-den" }).start();
    expect(proc.spawns[0].args[0].endsWith("?ServerAdminPassword=from-den")).toBe(true);
  });

  it("stops with SaveWorld then DoExit", async () => {
    install(variant);
    const a = adapter(variant);
    await a.getConfig();
    proc.running = true;
    const result = await a.stop();
    expect(proc.rcon.map((r) => r.command)).toEqual(["SaveWorld", "DoExit"]);
    expect(proc.rcon[0]).toMatchObject({ port: 27020, password: readDen().adminPassword });
    expect(result).toEqual({ success: true, message: "Server stopped. The world was saved first." });
  });

  it("kills it when RCON doesn't answer", async () => {
    proc.running = true;
    proc.rconFails = true;
    const result = await adapter(variant).stop();
    expect(proc.execs.some((c) => c.startsWith("taskkill /PID 8080 /F"))).toBe(true);
    expect(result.message).toContain("killed without saving");
  });

  it("lists players", async () => {
    proc.running = true;
    proc.listPlayers = "0. Ada, 76561198000000001";
    expect((await adapter(variant).getPlayers()).players.map((p) => p.name)).toEqual(["Ada"]);
  });

  it("keeps the admin password off the Config tab and out of saves", async () => {
    const a = adapter(variant);
    const config = await a.getConfig();
    expect(config).not.toHaveProperty("adminPassword");
    const password = readDen().adminPassword;
    expect((await a.saveConfig({ ...config, sessionName: "Renamed", maxPlayers: "12", adminPassword: "hijack" })).success).toBe(true);
    expect(readDen()).toMatchObject({ sessionName: "Renamed", maxPlayers: 12, adminPassword: password });
    expect((await a.saveConfig({ ...config, sessionName: "Bad?" })).success).toBe(false);
  });

  it("saves, then zips ShooterGame\\Saved without the noise", async () => {
    const a = adapter(variant);
    await a.getConfig();
    const saved = path.join(dir, "ShooterGame", "Saved");
    const arks = variant === "asa" ? path.join(saved, "SavedArks", "TheIsland_WP") : path.join(saved, "SavedArks");
    const world = variant === "asa" ? "TheIsland_WP" : "TheIsland";
    fs.mkdirSync(arks, { recursive: true });
    fs.mkdirSync(path.join(saved, "SavedArksLocal"), { recursive: true });
    fs.writeFileSync(path.join(saved, "SavedArksLocal", "sp.ark"), "x");
    fs.writeFileSync(path.join(arks, `${world}.ark`), "x");
    fs.writeFileSync(path.join(arks, `${world}_16.10.2026_10.15.00.${variant === "asa" ? "arkrbf" : "ark"}`), "x");
    proc.running = true;
    const result = await a.runBackup("daily");
    expect(result.success).toBe(true);
    expect(proc.rcon.map((r) => r.command)).toEqual(["SaveWorld"]);
    const worldPath = variant === "asa" ? `ShooterGame/Saved/SavedArks/TheIsland_WP/${world}.ark` : `ShooterGame/Saved/SavedArks/${world}.ark`;
    expect(proc.staged).toEqual([worldPath, DEN_FILE].sort());
  }, 15_000);
});
