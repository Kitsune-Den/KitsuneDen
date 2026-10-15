import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "fs";
import net from "net";
import os from "os";
import path from "path";
import type { ServerDefinition } from "../lib/adapters/types";

/**
 * 7D2D backups zip the world where it already lives (UserDataFolder\Saves or
 * %APPDATA%\7DaysToDie\Saves), after asking a running server to save.
 */

// Compress-Archive is Windows-only: record the command, and what the staging
// folder held at that moment (it's removed right after).
const zips = vi.hoisted(() => ({
  calls: [] as { cmd: string; staged: string[] }[],
  fail: null as Error | null,
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
      const source = /-Path '([^']+)\\\*'|-Path '([^']+)\/\*'/.exec(cmd);
      const staging = source?.[1] ?? source?.[2];
      zips.calls.push({ cmd, staged: staging && fsMod.existsSync(staging) ? list(staging).sort() : [] });
      cb(zips.fail, "");
    }),
  };
});

import { SevenDaysAdapter } from "../lib/adapters/seven-days-adapter";
import { clearReachabilityCache } from "../lib/adapters/reachability";
import { copyTree, findWorldSave, savesDir, DEFAULT_GAME_NAME } from "../lib/seven-days-saves";

let tmp: string;

function write(file: string, content = "x") {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

function serverConfig(props: Record<string, string>) {
  const lines = Object.entries(props).map(([k, v]) => `  <property name="${k}" value="${v}" />`);
  return `<?xml version="1.0"?>\n<ServerSettings>\n${lines.join("\n")}\n</ServerSettings>\n`;
}

/** A port nothing is listening on, so the server reads as stopped. */
async function closedPort(): Promise<number> {
  const s = net.createServer();
  await new Promise<void>((r) => s.listen(0, "127.0.0.1", () => r()));
  const port = (s.address() as net.AddressInfo).port;
  await new Promise<void>((r) => s.close(() => r()));
  return port;
}

/** Stand-in 7D2D telnet console that records commands. */
function startFakeTelnet(): Promise<{ port: number; commands: string[]; close: () => Promise<void> }> {
  const commands: string[] = [];
  const server = net.createServer((sock) => {
    let authed = false;
    sock.write("Please enter password:\r\n");
    sock.on("data", (data) => {
      const line = data.toString().trim();
      if (!authed) {
        authed = true;
        sock.write("Logon successful.\r\n");
        return;
      }
      commands.push(line);
      sock.write(`*** Executing command '${line}' by Telnet ***\r\n`);
      sock.end();
    });
    sock.on("error", () => {});
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      resolve({
        port: (server.address() as net.AddressInfo).port,
        commands,
        close: () => new Promise<void>((r) => server.close(() => r())),
      });
    });
  });
}

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "kd-7d2d-backups-"));
  zips.calls.length = 0;
  zips.fail = null;
  clearReachabilityCache();
});

afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe("savesDir", () => {
  it("uses UserDataFolder\\Saves when serverconfig.xml sets it", () => {
    const userData = path.join(tmp, "userdata");
    expect(savesDir(tmp, { UserDataFolder: userData }, { APPDATA: "C:\\AppData" })).toBe(path.join(userData, "Saves"));
  });

  it("resolves a relative UserDataFolder against the server folder", () => {
    expect(savesDir(tmp, { UserDataFolder: "UserData" }, {})).toBe(path.join(tmp, "UserData", "Saves"));
  });

  it("falls back to %APPDATA%\\7DaysToDie\\Saves", () => {
    expect(savesDir(tmp, {}, { APPDATA: "/appdata" })).toBe(path.join("/appdata", "7DaysToDie", "Saves"));
  });

  it("gives up without UserDataFolder or APPDATA", () => {
    expect(savesDir(tmp, {}, {})).toBeNull();
  });
});

describe("findWorldSave", () => {
  const saves = () => path.join(tmp, "Saves");

  it("finds GameWorld\\GameName", () => {
    write(path.join(saves(), "Navezgane", "Kitsune", "main.ttw"));
    expect(findWorldSave(saves(), { GameWorld: "Navezgane", GameName: "Kitsune" })).toEqual({
      world: "Navezgane",
      gameName: "Kitsune",
      dir: path.join(saves(), "Navezgane", "Kitsune"),
    });
  });

  it("finds a random-gen world by its generated name, newest first", () => {
    const old = path.join(saves(), "Old Rwg Territory", "Kitsune", "main.ttw");
    const current = path.join(saves(), "East Rumoxe Territory", "Kitsune", "main.ttw");
    write(old);
    write(current);
    fs.utimesSync(old, new Date("2026-01-01"), new Date("2026-01-01"));
    fs.utimesSync(current, new Date("2026-10-01"), new Date("2026-10-01"));
    expect(findWorldSave(saves(), { GameWorld: "RWG", GameName: "Kitsune" })?.world).toBe("East Rumoxe Territory");
  });

  it("prefers GameWorld over a newer save of the same game elsewhere", () => {
    const named = path.join(saves(), "Navezgane", "Kitsune", "main.ttw");
    const other = path.join(saves(), "Pregen06k01", "Kitsune", "main.ttw");
    write(named);
    write(other);
    fs.utimesSync(named, new Date("2026-01-01"), new Date("2026-01-01"));
    expect(findWorldSave(saves(), { GameWorld: "Navezgane", GameName: "Kitsune" })?.world).toBe("Navezgane");
  });

  it(`defaults GameName to "${DEFAULT_GAME_NAME}" like the game`, () => {
    write(path.join(saves(), "Navezgane", DEFAULT_GAME_NAME, "main.ttw"));
    expect(findWorldSave(saves(), { GameWorld: "Navezgane" })?.gameName).toBe(DEFAULT_GAME_NAME);
  });

  it("returns null when no world holds this game, or there's no Saves folder", () => {
    write(path.join(saves(), "Navezgane", "Someone Else", "main.ttw"));
    expect(findWorldSave(saves(), { GameWorld: "Navezgane", GameName: "Kitsune" })).toBeNull();
    expect(findWorldSave(path.join(tmp, "missing"), {})).toBeNull();
  });
});

describe("copyTree", () => {
  it("copies nested folders and file contents", () => {
    write(path.join(tmp, "src", "main.ttw"), "world");
    write(path.join(tmp, "src", "Region", "r.0.0.7rg"), "region");
    copyTree(path.join(tmp, "src"), path.join(tmp, "dest"));
    expect(fs.readFileSync(path.join(tmp, "dest", "main.ttw"), "utf8")).toBe("world");
    expect(fs.readFileSync(path.join(tmp, "dest", "Region", "r.0.0.7rg"), "utf8")).toBe("region");
  });
});

describe("SevenDaysAdapter backups", () => {
  let serverDir: string;
  let userData: string;

  function adapter(telnetPort: number, props: Record<string, string> = {}) {
    write(
      path.join(serverDir, "serverconfig.xml"),
      serverConfig({ UserDataFolder: userData, GameWorld: "Navezgane", GameName: "Kitsune", ...props })
    );
    const def: ServerDefinition = {
      id: `7d-${path.basename(tmp)}`,
      name: "7D2D",
      type: "7d2d",
      dir: serverDir,
      telnetPort,
      telnetPassword: "pw",
    };
    return new SevenDaysAdapter(def);
  }

  beforeEach(() => {
    serverDir = path.join(tmp, "server");
    userData = path.join(tmp, "userdata");
    write(path.join(userData, "Saves", "Navezgane", "Kitsune", "main.ttw"), "world");
    write(path.join(userData, "Saves", "Navezgane", "Kitsune", "Region", "r.0.0.7rg"), "region");
    write(path.join(userData, "Saves", "serveradmin.xml"), "<adminTools/>");
  });

  it("says it has backups", async () => {
    expect(adapter(await closedPort()).capabilities.hasBackups).toBe(true);
  });

  it("zips a copy of the world, serveradmin.xml and serverconfig.xml", async () => {
    const result = await adapter(await closedPort()).runBackup("daily");

    expect(result.success).toBe(true);
    expect(result.message).toMatch(/^Backup created: 7d2d-.*\.zip$/);
    expect(zips.calls).toHaveLength(1);
    expect(zips.calls[0].staged).toEqual([
      "Navezgane/Kitsune/Region/r.0.0.7rg",
      "Navezgane/Kitsune/main.ttw",
      "serveradmin.xml",
      "serverconfig.xml",
    ]);
    expect(zips.calls[0].cmd).toContain("Compress-Archive");
    expect(zips.calls[0].cmd).toContain(path.join(tmp, "backups", "7d2d", "daily"));
  });

  it("never zips the live folder, and cleans up its copy", async () => {
    await adapter(await closedPort()).runBackup("hourly");
    expect(zips.calls[0].cmd).not.toContain(path.join(userData, "Saves"));
    const staging = /-Path '(.+?)[\\/]\*'/.exec(zips.calls[0].cmd)?.[1];
    expect(staging && fs.existsSync(staging)).toBe(false);
  });

  it("doesn't ask a stopped server to save", async () => {
    const telnet = await startFakeTelnet();
    const port = telnet.port;
    await telnet.close();
    await adapter(port).runBackup("hourly");
    expect(telnet.commands).toEqual([]);
  });

  it("sends saveworld to a running server first", async () => {
    const telnet = await startFakeTelnet();
    try {
      const result = await adapter(telnet.port).runBackup("hourly");
      expect(result.success).toBe(true);
      expect(telnet.commands).toEqual(["saveworld"]);
    } finally {
      await telnet.close();
    }
  }, 15_000);

  it("explains when it can't find the save", async () => {
    const result = await adapter(await closedPort(), { GameName: "Missing" }).runBackup("hourly");
    expect(result.success).toBe(false);
    expect(result.message).toContain('No save for game "Missing"');
    expect(result.message).toContain(path.join(userData, "Saves"));
    expect(zips.calls).toHaveLength(0);
  });

  it("reports a failed zip and still cleans up", async () => {
    zips.fail = new Error("disk full");
    const result = await adapter(await closedPort()).runBackup("hourly");
    expect(result).toEqual({ success: false, message: "Backup failed: disk full" });
    const staging = /-Path '(.+?)[\\/]\*'/.exec(zips.calls[0].cmd)?.[1];
    expect(staging && fs.existsSync(staging)).toBe(false);
  });

  it("lists backups newest first, per type", async () => {
    const daily = path.join(tmp, "backups", "7d2d", "daily");
    write(path.join(daily, "7d2d-a.zip"));
    write(path.join(daily, "7d2d-b.zip"));
    write(path.join(daily, "notes.txt"));
    fs.utimesSync(path.join(daily, "7d2d-a.zip"), new Date("2026-01-01"), new Date("2026-01-01"));
    const backups = await adapter(await closedPort()).getBackups();
    expect(backups.hourly).toEqual([]);
    expect((backups.daily as { name: string }[]).map((b) => b.name)).toEqual(["7d2d-b.zip", "7d2d-a.zip"]);
  });

  it("finds serveradmin.xml under UserDataFolder\\Saves", async () => {
    expect(adapter(await closedPort()).getAdminFilePath()).toBe(path.join(userData, "Saves", "serveradmin.xml"));
  });
});
