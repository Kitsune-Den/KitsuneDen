import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import type { ServerDefinition } from "../lib/adapters/types";

/**
 * Enshrouded listens on one UDP port, its config's `queryPort`. Older Den
 * configs also wrote a `gamePort` key (now ignored by the game) and put
 * queryPort on 15638, so the server listened on a port the Den never showed.
 * Server setup's Game Port is now written into queryPort before every start.
 */

// start() shells out to PowerShell for the process probe and Start-Process.
// Answer every exec with empty stdout: "not running", then "launched".
vi.mock("child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof import("child_process")>();
  return {
    ...actual,
    exec: vi.fn((_cmd: string, _opts: unknown, cb: (err: Error | null, stdout: string) => void) => {
      cb(null, "");
    }),
  };
});

import { EnshroudedAdapter, defaultConfig, syncPort } from "../lib/adapters/enshrouded-adapter";

let tmpDir: string;
let def: ServerDefinition;
const configPath = () => path.join(tmpDir, "enshrouded_server.json");
const readConfig = () => JSON.parse(fs.readFileSync(configPath(), "utf8"));
const writeConfig = (config: Record<string, unknown>) => fs.writeFileSync(configPath(), JSON.stringify(config, null, 2));

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "den-enshrouded-ports-"));
  def = { id: `ens-${path.basename(tmpDir)}`, name: "Ens", type: "enshrouded", dir: tmpDir, gamePort: 15637 };
  // A start script, so start() reaches the launch step on any OS.
  fs.writeFileSync(path.join(tmpDir, "start_enshrouded.bat"), "");
});

afterEach(() => {
  vi.useRealTimers();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("defaultConfig", () => {
  it("writes Server setup's port as queryPort and no gamePort", () => {
    const config = defaultConfig({ ...def, gamePort: 15700 });
    expect(config.queryPort).toBe(15700);
    expect(config).not.toHaveProperty("gamePort");
  });

  it("falls back to 15637", () => {
    expect(defaultConfig({ ...def, gamePort: undefined }).queryPort).toBe(15637);
  });
});

describe("syncPort", () => {
  it("moves an old Den config from 15638 to the Game Port and drops gamePort", () => {
    const { config, changed, movedFrom } = syncPort({ name: "x", gamePort: 15637, queryPort: 15638 }, def);
    expect(changed).toBe(true);
    expect(movedFrom).toBe(15638);
    expect(config).toEqual({ name: "x", queryPort: 15637 });
  });

  it("only drops the stale key when the port already matches", () => {
    const { config, changed, movedFrom } = syncPort({ gamePort: 15636, queryPort: 15637 }, def);
    expect(changed).toBe(true);
    expect(movedFrom).toBeNull();
    expect(config).toEqual({ queryPort: 15637 });
  });

  it("leaves a config that's already right alone", () => {
    const original = { name: "x", queryPort: 15637 };
    const result = syncPort(original, def);
    expect(result).toEqual({ config: original, changed: false, movedFrom: null });
  });

  it("doesn't mutate the config it was given", () => {
    const original = { gamePort: 15637, queryPort: 15638 };
    syncPort(original, def);
    expect(original).toEqual({ gamePort: 15637, queryPort: 15638 });
  });

  it("fills in a missing queryPort without calling it a move", () => {
    const { config, movedFrom } = syncPort({ name: "x" }, def);
    expect(config.queryPort).toBe(15637);
    expect(movedFrom).toBeNull();
  });
});

describe("EnshroudedAdapter.start", () => {
  it("syncs an old config on disk and says the port moved", async () => {
    vi.useFakeTimers();
    writeConfig({ name: "Old", gamePort: 15637, queryPort: 15638, slotCount: 8 });
    const adapter = new EnshroudedAdapter(def);

    const result = await adapter.start();

    expect(result.success).toBe(true);
    expect(result.message).toContain("Moved the server's port from 15638 to 15637");
    expect(readConfig()).toEqual({ name: "Old", queryPort: 15637, slotCount: 8 });
    // The previous file is kept, like any other config save.
    expect(JSON.parse(fs.readFileSync(configPath() + ".bak", "utf8")).queryPort).toBe(15638);
  });

  it("stays quiet when only the unused key goes", async () => {
    vi.useFakeTimers();
    writeConfig({ gamePort: 15636, queryPort: 15637 });
    const adapter = new EnshroudedAdapter(def);

    const result = await adapter.start();

    expect(result).toEqual({ success: true, message: "Server starting..." });
    expect(readConfig()).toEqual({ queryPort: 15637 });
  });

  it("doesn't rewrite a config that's already right", async () => {
    vi.useFakeTimers();
    writeConfig({ queryPort: 15637 });
    const adapter = new EnshroudedAdapter(def);

    await adapter.start();

    expect(fs.existsSync(configPath() + ".bak")).toBe(false);
  });

  it("follows a Game Port changed in Server setup", async () => {
    vi.useFakeTimers();
    writeConfig({ queryPort: 15637 });
    const adapter = new EnshroudedAdapter({ ...def, gamePort: 15700 });

    const result = await adapter.start();

    expect(result.message).toContain("from 15637 to 15700");
    expect(readConfig().queryPort).toBe(15700);
  });
});

describe("EnshroudedAdapter.getServerInfo", () => {
  it("reports Server setup's port, the one start() applies", async () => {
    writeConfig({ queryPort: 15638 });
    const info = await new EnshroudedAdapter(def).getServerInfo();
    expect(info.gamePort).toBe(15637);
    expect(info).not.toHaveProperty("queryPort");
  });
});
