import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { getAdapter, removeServer } from "../lib/adapters/adapter-registry";

/**
 * removeServer(id, deleteFiles=true) runs fs.rmSync(def.dir, { recursive })
 * on the dashboard host. A dir of C:\ or C:\Games (or the dashboard's own
 * folder) must be refused BEFORE anything happens: no rmSync, server not
 * stopped, still listed in servers.json.
 *
 * The registry reads servers.json from process.cwd(), so cwd is pointed at a
 * temp "dashboard" folder. That keeps this file from racing
 * adapter-registry.test.ts over the real servers.json when files run in parallel.
 */

let dashboardDir: string;
let configPath: string;
let rmSpy: ReturnType<typeof vi.spyOn>;

function resetRegistry() {
  const g = globalThis as unknown as { __denConfig?: unknown; __denAdapters?: unknown };
  g.__denConfig = undefined;
  g.__denAdapters = undefined;
}

function writeConfig(dir: string) {
  const config = {
    servers: [{ id: "victim", name: "Victim", type: "minecraft", dir, gamePort: 25565, rconPort: 25575 }],
    dashboard: { port: 3000 },
  };
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  resetRegistry();
}

beforeEach(() => {
  dashboardDir = fs.mkdtempSync(path.join(os.tmpdir(), "den-dashboard-"));
  configPath = path.join(dashboardDir, "servers.json");
  vi.spyOn(process, "cwd").mockReturnValue(dashboardDir);
  rmSpy = vi.spyOn(fs, "rmSync");
});

afterEach(() => {
  vi.restoreAllMocks();
  fs.rmSync(dashboardDir, { recursive: true, force: true });
  resetRegistry();
});

describe("removeServer with deleteFiles", () => {
  const unsafeDirs: [string, () => string][] = [
    ["a drive root", () => "C:\\"],
    ["a top-level folder", () => "C:\\Games"],
    ["the dashboard folder", () => dashboardDir],
    ["an ancestor of the dashboard folder", () => path.dirname(dashboardDir)],
  ];

  for (const [label, dirOf] of unsafeDirs) {
    it(`refuses ${label} and leaves everything in place`, async () => {
      writeConfig(dirOf());
      const before = fs.readFileSync(configPath, "utf-8");

      const result = await removeServer("victim", true);

      expect(result).toMatchObject({ success: false, reason: "unsafe-delete" });
      expect(result.message).toMatch(/Refusing to delete/);
      expect(rmSpy).not.toHaveBeenCalled();
      expect(fs.readFileSync(configPath, "utf-8")).toBe(before);
      expect(getAdapter("victim")).toBeDefined();
    });
  }

  it("still deletes a real server folder", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "den-server-"));
    fs.writeFileSync(path.join(dir, "server.jar"), "");
    writeConfig(dir);

    const result = await removeServer("victim", true);

    expect(result.success).toBe(true);
    expect(rmSpy).toHaveBeenCalledWith(dir, { recursive: true, force: true });
    expect(fs.existsSync(dir)).toBe(false);
    expect(getAdapter("victim")).toBeUndefined();
  });

  it("removing without deleteFiles ignores the dir check", async () => {
    writeConfig("C:\\");
    const result = await removeServer("victim", false);
    expect(result.success).toBe(true);
    expect(rmSpy).not.toHaveBeenCalled();
  });
});
