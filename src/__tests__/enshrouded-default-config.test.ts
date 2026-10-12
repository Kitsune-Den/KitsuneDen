import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import type { ServerDefinition } from "../lib/adapters/types";

/**
 * The generated enshrouded_server.json used to hardcode the Admin / Friend
 * group passwords as "kitsuneadmin" / "kitsunefriend" — identical on every
 * install and published in this repo. They're now random per config, and
 * shown once in the start() result when the config is first created.
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

import { EnshroudedAdapter, defaultConfig, generateGroupPassword } from "../lib/adapters/enshrouded-adapter";

type Group = { name: string; password: string };

function groups(config: Record<string, unknown>): Group[] {
  return config.userGroups as Group[];
}

let tmpDir: string;
let def: ServerDefinition;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "den-enshrouded-"));
  def = { id: `ens-${path.basename(tmpDir)}`, name: "Ens", type: "enshrouded", dir: tmpDir };
});

afterEach(() => {
  vi.useRealTimers();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("generateGroupPassword", () => {
  it("is long, URL/chat-safe, and different every time", () => {
    const seen = new Set(Array.from({ length: 50 }, () => generateGroupPassword()));
    expect(seen.size).toBe(50);
    for (const pw of seen) expect(pw).toMatch(/^[A-Za-z0-9_-]{16}$/);
  });
});

describe("defaultConfig", () => {
  it("never contains the old hardcoded passwords", () => {
    const raw = JSON.stringify(defaultConfig(def));
    expect(raw).not.toContain("kitsuneadmin");
    expect(raw).not.toContain("kitsunefriend");
  });

  it("gives Admin and Friend distinct random passwords; Guest stays open", () => {
    const [admin, friend, guest] = groups(defaultConfig(def));
    expect(admin.name).toBe("Admin");
    expect(admin.password).not.toBe("");
    expect(friend.password).not.toBe("");
    expect(admin.password).not.toBe(friend.password);
    expect(guest).toMatchObject({ name: "Guest", password: "" });
  });

  it("generates fresh passwords per config", () => {
    expect(groups(defaultConfig(def))[0].password).not.toBe(groups(defaultConfig(def))[0].password);
  });
});

describe("EnshroudedAdapter.ensureConfig", () => {
  it("writes the config and returns the generated passwords once", async () => {
    const adapter = new EnshroudedAdapter(def);
    const created = await adapter.ensureConfig();

    const onDisk = JSON.parse(fs.readFileSync(path.join(tmpDir, "enshrouded_server.json"), "utf8"));
    const diskGroups = groups(onDisk).filter((g) => g.password !== "");
    expect(created).toEqual(diskGroups.map(({ name, password }) => ({ name, password })));
    expect(created?.map((g) => g.name)).toEqual(["Admin", "Friend"]);

    // Second call: config exists, nothing generated, nothing to surface.
    expect(await adapter.ensureConfig()).toBeNull();
  });
});

describe("EnshroudedAdapter.start", () => {
  it("surfaces generated passwords in the start result, not the log buffer", async () => {
    vi.useFakeTimers();
    // The .bat path is checked as-is; the exe path gets backslashed (Windows-only),
    // so the bat is what makes start() reach the launch step on CI (Linux) too.
    fs.writeFileSync(path.join(tmpDir, "start_enshrouded.bat"), "");
    const adapter = new EnshroudedAdapter(def);

    const result = await adapter.start();
    expect(result.success).toBe(true);

    const onDisk = JSON.parse(fs.readFileSync(path.join(tmpDir, "enshrouded_server.json"), "utf8"));
    const [admin, friend] = groups(onDisk);
    expect(result.message).toContain(`Admin: ${admin.password}`);
    expect(result.message).toContain(`Friend: ${friend.password}`);

    const logs = adapter.getLogs().join("\n");
    expect(logs).not.toContain(admin.password);
    expect(logs).not.toContain(friend.password);
  });

  it("does not repeat passwords when the config already exists", async () => {
    vi.useFakeTimers();
    // The .bat path is checked as-is; the exe path gets backslashed (Windows-only),
    // so the bat is what makes start() reach the launch step on CI (Linux) too.
    fs.writeFileSync(path.join(tmpDir, "start_enshrouded.bat"), "");
    const adapter = new EnshroudedAdapter(def);
    await adapter.ensureConfig();

    const result = await adapter.start();
    expect(result).toEqual({ success: true, message: "Server starting..." });
  });
});
