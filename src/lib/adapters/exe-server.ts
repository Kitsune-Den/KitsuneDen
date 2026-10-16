/**
 * Plumbing for adapters that run a game's server .exe directly from its
 * install folder (Valheim, V Rising): finding that exact process, following
 * its log file, host stats, and zip backups made from a copy.
 */

import { exec } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import type { ServerStats } from "./types";
import { copyTree } from "../fs-copy";

export interface ExeProcess {
  pid: number;
  memoryBytes: number;
  creationDate: string;
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

export function run(cmd: string, timeout: number, maxBuffer = 1024 * 1024): Promise<string> {
  return new Promise((resolve, reject) => {
    exec(cmd, { timeout, maxBuffer }, (err, stdout) => (err ? reject(err) : resolve(String(stdout ?? "").trim())));
  });
}

export const escapePs = (value: string) => value.replace(/'/g, "''");

/**
 * The process running this exact executable. Matching on the full path, not
 * the name, keeps two servers of the same game on one machine apart.
 */
export async function findProcessByPath(exePath: string): Promise<ExeProcess | null> {
  const name = escapePs(path.basename(exePath));
  const full = escapePs(path.resolve(exePath));
  try {
    const out = await run(
      `powershell -NoProfile -Command "$p = Get-CimInstance Win32_Process -Filter \\"Name='${name}'\\" -ErrorAction SilentlyContinue | Where-Object { $_.ExecutablePath -eq '${full}' } | Select-Object -First 1; if ($p) { $p.ProcessId.ToString() + '|' + $p.WorkingSetSize.ToString() + '|' + $p.CreationDate.ToString('o') }"`,
      8000
    );
    const [pid, mem, created] = out.split("|");
    if (!pid || !/^\d+$/.test(pid)) return null;
    return { pid: Number(pid), memoryBytes: Number(mem) || 0, creationDate: created ?? "" };
  } catch {
    return null;
  }
}

export async function killProcess(pid: number): Promise<void> {
  await run(`taskkill /PID ${pid} /F`, 10000);
}

/** Poll until the executable's process is gone, up to `timeoutMs`. True if it went. */
export async function waitForExit(exePath: string, timeoutMs: number): Promise<boolean> {
  for (let waited = 0; waited < timeoutMs; waited += 1000) {
    if (!(await findProcessByPath(exePath))) return true;
    await new Promise((r) => setTimeout(r, 1000));
  }
  return !(await findProcessByPath(exePath));
}

export function statsFor(proc: ExeProcess | null): ServerStats {
  return {
    process: proc
      ? { pid: proc.pid, memory: formatBytes(proc.memoryBytes), memoryBytes: proc.memoryBytes, upSince: proc.creationDate }
      : null,
    system: {
      platform: os.platform(),
      hostname: os.hostname(),
      totalMemory: formatBytes(os.totalmem()),
      freeMemory: formatBytes(os.freemem()),
      totalMemoryBytes: os.totalmem(),
      freeMemoryBytes: os.freemem(),
      cpus: os.cpus().length,
      cpuModel: os.cpus()[0]?.model || "Unknown",
      uptime: os.uptime(),
    },
  };
}

/**
 * Follow a log file the game writes, calling `onLine` for each new line.
 * The game may truncate it on start; a shrink resets the read position.
 */
export function followLog(file: string, onLine: (line: string) => void, backlog = 50): void {
  let read = 0;
  try {
    const content = fs.readFileSync(file, "utf8");
    read = Buffer.byteLength(content);
    content.split("\n").slice(-backlog).filter((l) => l.trim()).forEach((l) => onLine(l.trimEnd()));
  } catch {
    // No log yet; watchFile still fires once it's created.
  }
  fs.watchFile(file, { interval: 1000 }, (curr) => {
    if (curr.size < read) read = 0;
    if (curr.size <= read) return;
    const from = read;
    read = curr.size;
    let chunk = "";
    fs.createReadStream(file, { start: from, end: curr.size - 1, encoding: "utf8" })
      .on("data", (d) => (chunk += d))
      .on("end", () => chunk.split("\n").filter((l) => l.trim()).forEach((l) => onLine(l.trimEnd())))
      .on("error", () => {});
  });
}

/** Zip backups in <root>/hourly and <root>/daily, newest first, as the Backups tab lists them. */
export function listZipBackups(root: string): { hourly: unknown[]; daily: unknown[] } {
  const backups: { hourly: unknown[]; daily: unknown[] } = { hourly: [], daily: [] };
  for (const type of ["hourly", "daily"] as const) {
    const dir = path.join(root, type);
    if (!fs.existsSync(dir)) continue;
    backups[type] = fs
      .readdirSync(dir)
      .filter((f) => f.endsWith(".zip"))
      .map((f) => {
        const stat = fs.statSync(path.join(dir, f));
        return { name: f, size: formatBytes(stat.size), sizeBytes: stat.size, date: stat.mtime };
      })
      .sort((a, b) => b.date.getTime() - a.date.getTime());
  }
  return backups;
}

/**
 * Copy folders and files into a staging folder (plain reads, so files the
 * running game holds open still copy), zip the copy to `dest`, and always
 * remove the staging folder. `items` maps a source path to its name in the
 * zip; a folder's `skip` leaves out files and folders by name.
 */
export async function zipCopy(
  items: { from: string; as: string; skip?: (name: string) => boolean }[],
  dest: string,
  timeoutMs: number
): Promise<void> {
  const staging = fs.mkdtempSync(path.join(os.tmpdir(), "den-backup-"));
  try {
    for (const { from, as, skip } of items) {
      if (!fs.existsSync(from)) continue;
      const to = path.join(staging, as);
      if (fs.statSync(from).isDirectory()) copyTree(from, to, skip);
      else {
        fs.mkdirSync(path.dirname(to), { recursive: true });
        fs.copyFileSync(from, to);
      }
    }
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    await run(
      `powershell -NoProfile -Command "Compress-Archive -Path '${escapePs(path.join(staging, "*"))}' -DestinationPath '${escapePs(dest)}' -Force"`,
      timeoutMs
    );
  } finally {
    fs.rmSync(staging, { recursive: true, force: true });
  }
}

/** A timestamped backup file name: `<game>-2026-10-12T13-08-20-386Z.zip`. */
export function backupName(game: string): string {
  return `${game}-${new Date().toISOString().replace(/[:.]/g, "-")}.zip`;
}
