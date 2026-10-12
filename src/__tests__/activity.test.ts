import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import {
  recordActivity,
  readActivity,
  observeStatus,
  noteExpectedStop,
  _resetActivityState,
} from "../lib/activity";

let dir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "den-activity-"));
  process.env.KITSUNEDEN_ACTIVITY_FILE = path.join(dir, "nested", "activity.jsonl");
  _resetActivityState();
});

afterEach(() => {
  delete process.env.KITSUNEDEN_ACTIVITY_FILE;
  fs.rmSync(dir, { recursive: true, force: true });
});

describe("activity log", () => {
  it("returns an empty list before anything is recorded", () => {
    expect(readActivity()).toEqual([]);
  });

  it("records events and reads them newest first, creating the folder", () => {
    recordActivity({ level: "info", kind: "server", message: "first", ts: 1 });
    recordActivity({ level: "warn", kind: "crash", message: "second", ts: 2 });
    const events = readActivity();
    expect(events.map((e) => e.message)).toEqual(["second", "first"]);
    expect(events[0].id).toBeTruthy();
  });

  it("filters by server and kind, and honours the limit", () => {
    recordActivity({ level: "info", kind: "server", message: "a", serverId: "mc" });
    recordActivity({ level: "info", kind: "config", message: "b", serverId: "mc" });
    recordActivity({ level: "info", kind: "server", message: "c", serverId: "pal" });
    expect(readActivity({ serverId: "mc" }).map((e) => e.message)).toEqual(["b", "a"]);
    expect(readActivity({ kinds: ["server"] }).map((e) => e.message)).toEqual(["c", "a"]);
    expect(readActivity({ limit: 1 }).map((e) => e.message)).toEqual(["c"]);
  });

  it("skips a torn trailing line instead of failing", () => {
    recordActivity({ level: "info", kind: "server", message: "whole" });
    fs.appendFileSync(process.env.KITSUNEDEN_ACTIVITY_FILE!, '{"id":"x","ts":', "utf-8");
    expect(readActivity().map((e) => e.message)).toEqual(["whole"]);
  });
});

describe("status transitions", () => {
  it("logs nothing on the first observation", () => {
    observeStatus("mc", "Fox Hollow", "running");
    expect(readActivity()).toEqual([]);
  });

  it("logs a server coming online", () => {
    observeStatus("mc", "Fox Hollow", "stopped");
    observeStatus("mc", "Fox Hollow", "running");
    const [ev] = readActivity();
    expect(ev).toMatchObject({ kind: "server", level: "info", message: "Fox Hollow is online", serverId: "mc" });
  });

  it("treats an unrequested stop as a crash", () => {
    observeStatus("mc", "Fox Hollow", "running");
    observeStatus("mc", "Fox Hollow", "stopped");
    const [ev] = readActivity();
    expect(ev).toMatchObject({ kind: "crash", level: "warn", message: "Fox Hollow stopped unexpectedly" });
  });

  it("treats a dashboard-requested stop as a normal stop", () => {
    observeStatus("mc", "Fox Hollow", "running");
    noteExpectedStop("mc");
    observeStatus("mc", "Fox Hollow", "stopped");
    const [ev] = readActivity();
    expect(ev).toMatchObject({ kind: "server", level: "info", message: "Fox Hollow stopped" });
  });

  it("does not repeat an event while the status holds", () => {
    observeStatus("mc", "Fox Hollow", "stopped");
    observeStatus("mc", "Fox Hollow", "running");
    observeStatus("mc", "Fox Hollow", "running");
    expect(readActivity()).toHaveLength(1);
  });
});
