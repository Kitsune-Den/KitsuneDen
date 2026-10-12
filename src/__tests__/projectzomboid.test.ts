import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import type { ServerDefinition } from "../lib/adapters/types";

/**
 * Project Zomboid: the bundled java run directly (not StartServer64.bat),
 * -cachedir and -adminpassword always, ports and RCON written into
 * servertest.ini before every start, RCON quit/save/players.
 */

const proc = vi.hoisted(() => ({
  running: false,
  execs: [] as string[],
  spawns: [] as { exe: string; args: string[]; opts: Record<string, unknown> }[],
  rcon: [] as { command: string; port: number; password: string }[],
  rconFails: false,
  playersReply: "Players connected (0):",
}));

vi.mock("child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof import("child_process")>();
  return {
    ...actual,
    exec: vi.fn((cmd: string, _opts: unknown, cb: (err: Error | null, stdout: string) => void) => {
      proc.execs.push(cmd);
      if (cmd.startsWith("taskkill")) proc.running = false;
      cb(null, cmd.includes("Get-CimInstance") && proc.running ? "4321|1073741824|2026-10-12T10:00:00.0000000+00:00" : "");
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
          return command === "players" ? proc.playersReply : "";
        }),
        end: vi.fn(),
      };
    }),
  },
}));

import { ProjectZomboidAdapter } from "../lib/adapters/projectzomboid-adapter";
import {
  DEN_FILE,
  editableIni,
  javaArgs,
  parseIni,
  parsePlayers,
  patchIni,
  syncIni,
  validateDenSettings,
} from "../lib/zomboid-settings";

let tmp: string;
let dir: string;
let n = 0;

const iniPath = () => path.join(dir, "zomboid-data", "Server", "servertest.ini");
const writeIni = (text: string) => {
  fs.mkdirSync(path.dirname(iniPath()), { recursive: true });
  fs.writeFileSync(iniPath(), text);
};

function adapter(overrides: Partial<ServerDefinition> = {}) {
  return new ProjectZomboidAdapter({ id: `pz-${n++}`, name: "Knox", type: "projectzomboid", dir, ...overrides });
}

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "kd-zomboid-"));
  dir = path.join(tmp, "server");
  fs.mkdirSync(path.join(dir, "jre64", "bin"), { recursive: true });
  fs.writeFileSync(path.join(dir, "jre64", "bin", "java.exe"), "");
  proc.running = false;
  proc.execs.length = 0;
  proc.spawns.length = 0;
  proc.rcon.length = 0;
  proc.rconFails = false;
  proc.playersReply = "Players connected (0):";
});

afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe("servertest.ini", () => {
  it("reads key=value lines, skipping comments; the last repeat wins", () => {
    expect(parseIni("# comment\r\n! also\r\nPVP=true\r\nMaxPlayers=32\r\nPVP=false\r\nnot a pair\r\n")).toEqual({
      PVP: "false",
      MaxPlayers: "32",
    });
  });

  it("patches in place, keeping comments, order and CRLF, and appends new keys", () => {
    const text = "# Players can hurt each other\r\nPVP=true\r\nMaxPlayers=32\r\n";
    expect(patchIni(text, { PVP: "false", RCONPort: "27016" })).toBe(
      "# Players can hurt each other\r\nPVP=false\r\nMaxPlayers=32\r\nRCONPort=27016\r\n"
    );
  });

  it("seeds a new file with just the Den's keys, which PZ fills out itself", () => {
    const { text, rconPassword } = syncIni(null, { port: 16261, rconPort: 27015 });
    expect(parseIni(text)).toEqual({ DefaultPort: "16261", UDPPort: "16262", RCONPort: "27015", RCONPassword: rconPassword });
    expect(rconPassword).toMatch(/^[A-Za-z0-9_-]{16}$/);
  });

  it("keeps an existing RCON password unless servers.json sets one", () => {
    const current = "PublicName=Knox\nRCONPassword=kept\nDefaultPort=1\n";
    expect(syncIni(current, { port: 16271, rconPort: 27020 }).rconPassword).toBe("kept");
    const { text } = syncIni(current, { port: 16271, rconPort: 27020, rconPassword: "from-den" });
    expect(parseIni(text)).toMatchObject({ PublicName: "Knox", DefaultPort: "16271", UDPPort: "16272", RCONPassword: "from-den" });
  });

  it("keeps the Den's keys and the RCON password off the Config tab", () => {
    expect(editableIni({ PublicName: "Knox", DefaultPort: "16261", UDPPort: "16262", RCONPort: "27015", RCONPassword: "x" })).toEqual({
      PublicName: "Knox",
    });
  });
});

describe("launch", () => {
  it("runs the game's own JVM line with the Den's heap, -cachedir and -adminpassword", () => {
    const args = javaArgs({ adminPassword: "abcd23", minMemoryGB: 2, maxMemoryGB: 6 });
    expect(args).toEqual([
      "-Djava.awt.headless=true",
      "-Dzomboid.steam=1",
      "-Dzomboid.znetlog=1",
      "-XX:+UseZGC",
      "-XX:-CreateCoredumpOnCrash",
      "-XX:-OmitStackTraceInFastThrow",
      "-Xms2g",
      "-Xmx6g",
      "-Djava.library.path=natives/",
      "-cp",
      "java/;java/projectzomboid.jar",
      "zombie.network.GameServer",
      "-statistic",
      "0",
      "-cachedir=./zomboid-data",
      "-adminpassword",
      "abcd23",
    ]);
    expect(args.join(" ")).not.toContain("16g");
  });

  it("checks the heap", () => {
    expect(validateDenSettings({ adminPassword: "x", minMemoryGB: 2, maxMemoryGB: 4 })).toBeNull();
    expect(validateDenSettings({ adminPassword: "x", minMemoryGB: 0, maxMemoryGB: 4 })).toMatch(/minMemoryGB/);
    expect(validateDenSettings({ adminPassword: "x", minMemoryGB: 4, maxMemoryGB: 2 })).toMatch(/maxMemoryGB/);
  });

  it("parses the players list", () => {
    expect(parsePlayers("Players connected (2):\n-Alice\n-Kitsune Fox\n")).toEqual(["Alice", "Kitsune Fox"]);
    expect(parsePlayers("Players connected (0):")).toEqual([]);
  });
});

describe("ProjectZomboidAdapter", () => {
  it("has RCON, backups, SteamCMD updates and a properties-style config", () => {
    expect(adapter().capabilities).toMatchObject({ hasRcon: true, hasBackups: true, hasSteamUpdate: true, hasServerProperties: true });
  });

  it("first start: admin password made and shown once, ini seeded, bundled java launched", async () => {
    const result = await adapter({ gamePort: 16271, rconPort: 27020 }).start();

    const den = JSON.parse(fs.readFileSync(path.join(dir, DEN_FILE), "utf8"));
    expect(den).toMatchObject({ minMemoryGB: 2, maxMemoryGB: 4 });
    expect(den.adminPassword).toMatch(/^[a-hj-km-np-z2-9]{10}$/);
    expect(result.success).toBe(true);
    expect(result.message).toContain(`"admin" with password ${den.adminPassword}`);

    expect(parseIni(fs.readFileSync(iniPath(), "utf8"))).toMatchObject({ DefaultPort: "16271", UDPPort: "16272", RCONPort: "27020" });
    const { exe, args, opts } = proc.spawns[0];
    expect(exe).toBe(path.join(dir, "jre64", "bin", "java.exe"));
    expect(args).toEqual(javaArgs(den));
    expect(opts).toMatchObject({ cwd: dir, detached: true, windowsHide: true });
  });

  it("a later start keeps the admin password and doesn't repeat it", async () => {
    await adapter().start();
    const first = JSON.parse(fs.readFileSync(path.join(dir, DEN_FILE), "utf8")).adminPassword;
    proc.spawns.length = 0;
    const result = await adapter().start();
    expect(result.message).not.toContain("admin");
    expect(proc.spawns[0].args.slice(-2)).toEqual(["-adminpassword", first]);
  });

  it("points at the Update tab when the server isn't installed", async () => {
    fs.rmSync(path.join(dir, "jre64"), { recursive: true });
    expect((await adapter().start()).message).toContain("Install the server from the Update tab first");
  });

  it("stops with RCON quit, using the ini's password", async () => {
    writeIni("RCONPort=27015\nRCONPassword=in-ini\n");
    proc.running = true;
    const result = await adapter().stop();
    expect(proc.rcon).toEqual([{ command: "quit", port: 27015, password: "in-ini" }]);
    expect(result).toEqual({ success: true, message: "Server stopped. Project Zomboid saved on the way out." });
  });

  it("kills it, and says so, when RCON doesn't answer", async () => {
    proc.running = true;
    proc.rconFails = true;
    const result = await adapter().stop();
    expect(proc.execs.some((c) => c.startsWith("taskkill /PID 4321 /F"))).toBe(true);
    expect(result.message).toContain("killed without saving");
  });

  it("lists players over RCON", async () => {
    proc.running = true;
    proc.playersReply = "Players connected (1):\n-Alice";
    const { players } = await adapter().getPlayers();
    expect(players.map((p) => p.name)).toEqual(["Alice"]);
  });

  it("edits servertest.ini without touching the Den's keys", async () => {
    writeIni("# Kept\r\nPublicName=Knox\r\nPVP=true\r\nDefaultPort=16261\r\nRCONPassword=secret\r\n");
    const a = adapter();
    expect(await a.getConfig()).toEqual({ PublicName: "Knox", PVP: "true" });
    expect((await a.saveConfig({ PublicName: "Knox Country", PVP: "false", DefaultPort: "1", RCONPassword: "" })).success).toBe(true);
    expect(fs.readFileSync(iniPath(), "utf8")).toBe(
      "# Kept\r\nPublicName=Knox Country\r\nPVP=false\r\nDefaultPort=16261\r\nRCONPassword=secret\r\n"
    );
    expect(fs.existsSync(iniPath() + ".bak")).toBe(true);
  });

  it("explains the empty Config tab before the first start", async () => {
    expect(await adapter().getConfig()).toEqual({});
    expect((await adapter().saveConfig({ PVP: "false" })).message).toContain("Start the server once first");
  });

  it("saves over RCON before zipping zomboid-data", async () => {
    writeIni("RCONPassword=pw\n");
    fs.mkdirSync(path.join(dir, "zomboid-data", "Saves", "Multiplayer", "servertest"), { recursive: true });
    proc.running = true;
    const result = await adapter().runBackup("daily");
    expect(proc.rcon.map((r) => r.command)).toEqual(["save"]);
    expect(result.success).toBe(true);
    expect(proc.execs.find((c) => c.includes("Compress-Archive"))).toContain(path.join(tmp, "backups", "projectzomboid", "daily"));
  }, 15_000);

  it("updates app 380870 on the installed branch", async () => {
    const result = await adapter({ steamCmdPath: "C:\\steamcmd\\steamcmd.exe" }).updateServer();
    expect(result).toEqual({ success: true, message: "Updated on the public branch." });
    expect(proc.execs.some((c) => c.includes("+app_update 380870 validate"))).toBe(true);
  });
});
