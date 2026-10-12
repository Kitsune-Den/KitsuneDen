import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll } from "vitest";

/**
 * Route handlers write runtime files: the activity log, and (since first-run
 * setup) the password hash, session secret and setup code. Without this, a
 * test run would append fake events to, or even create a password in, the
 * real data/ folder of whatever checkout runs the suite. Each test file gets
 * its own throwaway data folder; tests that care point it elsewhere.
 */
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "den-test-data-"));
process.env.KITSUNEDEN_DATA_DIR = dir;
process.env.KITSUNEDEN_ACTIVITY_FILE = path.join(dir, "activity.jsonl");

afterAll(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});
