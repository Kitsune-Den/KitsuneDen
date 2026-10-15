import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "fs";
import net from "net";
import os from "os";
import path from "path";
import type { ServerDefinition } from "../lib/adapters/types";

/**
 * 7D2D updates through SteamCMD must stay on the installed branch and keep
 * the operator's serverconfig.xml, which `validate` resets to the stock copy.
 */

// SteamCMD stand-in: records the command and, like `validate`, writes the
// shipped serverconfig.xml over the operator's.
const steam = vi.hoisted(() => ({
  commands: [] as string[],
  dir: "",
  fail: null as Error | null,
}));
vi.mock("child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof import("child_process")>();
  const fsMod = await import("fs");
  const pathMod = await import("path");
  return {
    ...actual,
    exec: vi.fn((cmd: string, _opts: unknown, cb: (err: Error | null, stdout: string) => void) => {
      steam.commands.push(cmd);
      if (steam.dir) fsMod.writeFileSync(pathMod.join(steam.dir, "serverconfig.xml"), "<ServerSettings>stock</ServerSettings>");
      cb(steam.fail, "");
    }),
  };
});

import { SevenDaysAdapter } from "../lib/adapters/seven-days-adapter";
import { clearReachabilityCache } from "../lib/adapters/reachability";
import {
  appUpdateCommand,
  parseAppManifest,
  readInstalledBuild,
  restoreFiles,
  snapshotFiles,
} from "../lib/steamcmd";

let tmp: string;

const manifest = (betaKey?: string, key = "betakey") =>
  `"AppState"\n{\n\t"appid"\t\t"294420"\n\t"buildid"\t\t"20481234"\n\t"UserConfig"\n\t{\n${
    betaKey !== undefined ? `\t\t"${key}"\t\t"${betaKey}"\n` : ""
  }\t}\n}\n`;

async function closedPort(): Promise<number> {
  const s = net.createServer();
  await new Promise<void>((r) => s.listen(0, "127.0.0.1", () => r()));
  const port = (s.address() as net.AddressInfo).port;
  await new Promise<void>((r) => s.close(() => r()));
  return port;
}

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "kd-7d2d-steam-"));
  steam.commands.length = 0;
  steam.dir = "";
  steam.fail = null;
  clearReachabilityCache();
});

afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe("parseAppManifest", () => {
  it("reads the build and branch", () => {
    expect(parseAppManifest(manifest("latest_experimental"))).toEqual({
      buildId: 20481234,
      branch: "latest_experimental",
    });
  });

  it("reads the older BetaKey spelling", () => {
    expect(parseAppManifest(manifest("v2.6", "BetaKey")).branch).toBe("v2.6");
  });

  it("calls a missing or empty betakey public", () => {
    expect(parseAppManifest(manifest()).branch).toBe("public");
    expect(parseAppManifest(manifest("")).branch).toBe("public");
  });

  it("survives a manifest with no buildid", () => {
    expect(parseAppManifest('"AppState"\n{\n}\n')).toEqual({ buildId: null, branch: "public" });
  });
});

describe("readInstalledBuild", () => {
  it("reads steamapps/appmanifest_<id>.acf, or null before the first install", () => {
    expect(readInstalledBuild(tmp, 294420)).toBeNull();
    fs.mkdirSync(path.join(tmp, "steamapps"));
    fs.writeFileSync(path.join(tmp, "steamapps", "appmanifest_294420.acf"), manifest("latest_experimental"));
    expect(readInstalledBuild(tmp, 294420)?.branch).toBe("latest_experimental");
  });
});

describe("appUpdateCommand", () => {
  it("passes -beta for a branch", () => {
    expect(appUpdateCommand("C:\\steamcmd\\steamcmd.exe", "D:\\7d", 294420, "latest_experimental")).toBe(
      '"C:\\steamcmd\\steamcmd.exe" +force_install_dir "D:\\7d" +login anonymous +app_update 294420 -beta latest_experimental validate +quit'
    );
  });

  it("leaves -beta off for public", () => {
    expect(appUpdateCommand("steamcmd", "/7d", 294420, "public")).not.toContain("-beta");
  });
});

describe("snapshotFiles / restoreFiles", () => {
  it("puts back changed and deleted files, and leaves unchanged ones alone", () => {
    fs.writeFileSync(path.join(tmp, "a.xml"), "mine-a");
    fs.writeFileSync(path.join(tmp, "b.xml"), "mine-b");
    fs.writeFileSync(path.join(tmp, "c.xml"), "mine-c");
    const kept = snapshotFiles(tmp, ["a.xml", "b.xml", "c.xml", "missing.xml", "a.xml"]);
    expect([...kept.keys()]).toEqual(["a.xml", "b.xml", "c.xml"]);

    fs.writeFileSync(path.join(tmp, "a.xml"), "stock");
    fs.rmSync(path.join(tmp, "b.xml"));
    expect(restoreFiles(tmp, kept)).toEqual(["a.xml", "b.xml"]);
    expect(fs.readFileSync(path.join(tmp, "a.xml"), "utf8")).toBe("mine-a");
    expect(fs.readFileSync(path.join(tmp, "b.xml"), "utf8")).toBe("mine-b");
    expect(fs.existsSync(path.join(tmp, "missing.xml"))).toBe(false);
  });
});

describe("SevenDaysAdapter.updateServer", () => {
  const myConfig = '<ServerSettings><property name="ServerPort" value="26950"/></ServerSettings>';

  function adapter(overrides: Partial<ServerDefinition> = {}, telnetPort = 1) {
    return new SevenDaysAdapter({
      id: `7d-${path.basename(tmp)}`,
      name: "7D2D",
      type: "7d2d",
      dir: tmp,
      steamCmdPath: "C:\\steamcmd\\steamcmd.exe",
      telnetPort,
      telnetPassword: "pw",
      ...overrides,
    });
  }

  beforeEach(() => {
    fs.writeFileSync(path.join(tmp, "serverconfig.xml"), myConfig);
    fs.mkdirSync(path.join(tmp, "steamapps"));
    fs.writeFileSync(path.join(tmp, "steamapps", "appmanifest_294420.acf"), manifest("latest_experimental"));
    steam.dir = tmp;
  });

  it("says it can update", () => {
    expect(adapter().capabilities.hasSteamUpdate).toBe(true);
  });

  it("stays on the installed branch and puts serverconfig.xml back", async () => {
    const result = await adapter({}, await closedPort()).updateServer();

    expect(steam.commands).toHaveLength(1);
    expect(steam.commands[0]).toContain("+app_update 294420 -beta latest_experimental validate");
    expect(fs.readFileSync(path.join(tmp, "serverconfig.xml"), "utf8")).toBe(myConfig);
    expect(result).toEqual({
      success: true,
      message: "Updated on the latest_experimental branch. Put back your serverconfig.xml, which SteamCMD had reset.",
    });
  });

  it("keeps a custom config file too", async () => {
    fs.writeFileSync(path.join(tmp, "serverconfig-kitsune.xml"), "custom");
    const result = await adapter({ configFile: "serverconfig-kitsune.xml" }, await closedPort()).updateServer();
    expect(fs.readFileSync(path.join(tmp, "serverconfig-kitsune.xml"), "utf8")).toBe("custom");
    expect(fs.readFileSync(path.join(tmp, "serverconfig.xml"), "utf8")).toBe(myConfig);
    expect(result.success).toBe(true);
  });

  it("puts the config back even when SteamCMD fails", async () => {
    steam.fail = new Error("Error! App '294420' state is 0x202 after update job.");
    const result = await adapter({}, await closedPort()).updateServer();
    expect(result.success).toBe(false);
    expect(result.message).toContain("Update failed: Error! App '294420' state is 0x202");
    expect(result.message).toContain("Put back your serverconfig.xml");
    expect(fs.readFileSync(path.join(tmp, "serverconfig.xml"), "utf8")).toBe(myConfig);
  });

  it("updates public without -beta", async () => {
    fs.writeFileSync(path.join(tmp, "steamapps", "appmanifest_294420.acf"), manifest());
    const result = await adapter({}, await closedPort()).updateServer();
    expect(steam.commands[0]).not.toContain("-beta");
    expect(result.message).toMatch(/^Updated on the public branch\./);
  });

  it("needs the SteamCMD path", async () => {
    const result = await adapter({ steamCmdPath: undefined }).updateServer();
    expect(result).toEqual({ success: false, message: "Set the SteamCMD path in Server setup first." });
    expect(steam.commands).toEqual([]);
  });

  it("refuses while the server is running", async () => {
    const listening = net.createServer();
    await new Promise<void>((r) => listening.listen(0, "127.0.0.1", () => r()));
    try {
      const port = (listening.address() as net.AddressInfo).port;
      const result = await adapter({}, port).updateServer();
      expect(result).toEqual({ success: false, message: "Stop the server before updating." });
      expect(steam.commands).toEqual([]);
    } finally {
      await new Promise<void>((r) => listening.close(() => r()));
    }
  });

  it("reports the branch and app id for the Update tab", async () => {
    const info = await adapter().getUpdateInfo();
    expect(info).toMatchObject({ steamAppId: 294420, branch: "latest_experimental", steamCmdConfigured: true });
  });
});
