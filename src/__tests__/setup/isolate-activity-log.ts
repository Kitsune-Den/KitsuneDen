import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll } from "vitest";

/**
 * Route handlers record to the activity log. Without this, any test that
 * calls one (servers, players, auth...) appends fake events to the real
 * data/activity.jsonl of whatever checkout the suite runs in. Each test file
 * gets its own throwaway log; tests that care about the log override it.
 */
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "den-test-activity-"));
process.env.KITSUNEDEN_ACTIVITY_FILE = path.join(dir, "activity.jsonl");

afterAll(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});
