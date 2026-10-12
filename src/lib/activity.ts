import fs from "fs";
import path from "path";
import { dataDir } from "@/lib/data-dir";

/**
 * The Den's activity log: an append-only JSONL file of things that happened
 * (servers starting and stopping, config saves, roster changes, backups).
 * One line per event so a crash mid-write can only ever lose the last line,
 * and the file stays readable with any text editor.
 */

export type ActivityLevel = "info" | "warn" | "error";
export type ActivityKind = "server" | "crash" | "config" | "players" | "backup" | "mods" | "setup" | "auth";

export interface ActivityEvent {
  id: string;
  ts: number;
  level: ActivityLevel;
  kind: ActivityKind;
  message: string;
  serverId?: string;
  serverName?: string;
}

const MAX_LINES = 2000;
const KEEP_LINES = 1500;

function logPath(): string {
  return process.env.KITSUNEDEN_ACTIVITY_FILE || path.join(dataDir(), "activity.jsonl");
}

let appendsSinceTrim = 0;

export function recordActivity(event: Omit<ActivityEvent, "id" | "ts"> & { ts?: number }): ActivityEvent {
  const full: ActivityEvent = {
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    ts: event.ts ?? Date.now(),
    level: event.level,
    kind: event.kind,
    message: event.message,
    ...(event.serverId ? { serverId: event.serverId } : {}),
    ...(event.serverName ? { serverName: event.serverName } : {}),
  };
  try {
    const file = logPath();
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.appendFileSync(file, JSON.stringify(full) + "\n", "utf-8");
    if (++appendsSinceTrim >= 100) {
      appendsSinceTrim = 0;
      trim(file);
    }
  } catch (err) {
    // The log is a convenience; never let it break the action being logged.
    console.warn("[activity] failed to record event:", err);
  }
  return full;
}

function trim(file: string) {
  const lines = fs.readFileSync(file, "utf-8").split("\n").filter(Boolean);
  if (lines.length > MAX_LINES) {
    fs.writeFileSync(file, lines.slice(-KEEP_LINES).join("\n") + "\n", "utf-8");
  }
}

export function readActivity(opts: { limit?: number; serverId?: string; kinds?: ActivityKind[] } = {}): ActivityEvent[] {
  const limit = Math.min(Math.max(opts.limit ?? 100, 1), 500);
  let raw: string;
  try {
    raw = fs.readFileSync(logPath(), "utf-8");
  } catch {
    return [];
  }
  const out: ActivityEvent[] = [];
  const lines = raw.split("\n");
  for (let i = lines.length - 1; i >= 0 && out.length < limit; i--) {
    const line = lines[i].trim();
    if (!line) continue;
    let ev: ActivityEvent;
    try {
      ev = JSON.parse(line);
    } catch {
      continue; // a torn final line from a crash: skip it
    }
    if (opts.serverId && ev.serverId !== opts.serverId) continue;
    if (opts.kinds && !opts.kinds.includes(ev.kind)) continue;
    out.push(ev);
  }
  return out;
}

// ---- Status transitions ----
// The servers list is polled every few seconds; comparing each poll with the
// last one is enough to notice a server coming up, going down, or dying
// without anyone asking it to.

const lastStatus = new Map<string, string>();
const expectedStops = new Map<string, number>();
const EXPECTED_STOP_WINDOW_MS = 3 * 60 * 1000;

/** Call when the dashboard itself asks a server to stop or restart. */
export function noteExpectedStop(serverId: string) {
  expectedStops.set(serverId, Date.now());
}

export function observeStatus(serverId: string, serverName: string, status: string) {
  const prev = lastStatus.get(serverId);
  lastStatus.set(serverId, status);
  if (prev === undefined || prev === status) return;

  if (status === "running" && prev !== "running") {
    recordActivity({ level: "info", kind: "server", message: `${serverName} is online`, serverId, serverName });
    return;
  }
  if (status === "stopped" && (prev === "running" || prev === "stopping")) {
    const asked = expectedStops.get(serverId);
    if (asked && Date.now() - asked < EXPECTED_STOP_WINDOW_MS) {
      expectedStops.delete(serverId);
      recordActivity({ level: "info", kind: "server", message: `${serverName} stopped`, serverId, serverName });
    } else {
      recordActivity({ level: "warn", kind: "crash", message: `${serverName} stopped unexpectedly`, serverId, serverName });
    }
  }
}

/** Test hook: forget remembered statuses. */
export function _resetActivityState() {
  lastStatus.clear();
  expectedStops.clear();
  appendsSinceTrim = 0;
}
