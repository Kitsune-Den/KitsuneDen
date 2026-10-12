import { exec, spawn } from "child_process";
import fs from "fs";
import path from "path";
import os from "os";
import type {
  ServerAdapter,
  ServerDefinition,
  ServerCapabilities,
  ServerStatus,
  ActionResult,
  DashboardConfig,
  ServerStats,
  PlayerData,
  PlayerEntry,
} from "./types";
import { recipeDefault } from "../recipes";
import { copyTree } from "../fs-copy";
import { appUpdateCommand, readInstalledBuild } from "../steamcmd";
import {
  LOG_FILE,
  SAVE_DIR,
  SETTINGS_FILE,
  defaultSettings,
  launchArgs,
  normalizeSettings,
  validateSettings,
  type ValheimSettings,
} from "../valheim-settings";

const MAX_LOG_LINES = 2000;
const EXE_NAME = "valheim_server.exe";
/** World generation took ~95 s in PackRelay's measurement; allow plenty. */
const READY_TIMEOUT_MS = 5 * 60_000;
const STOP_TIMEOUT_MS = 30_000;
const BACKUP_TIMEOUT_MS = 10 * 60_000;
const UPDATE_TIMEOUT_MS = 30 * 60_000;
/** The line Valheim logs once the world is loaded and players can join. */
const READY_LINE = "Game server connected";

// Fallbacks for fields servers.json leaves unset, from the Valheim recipe.
const STEAM_APP_ID = recipeDefault("valheim", "steamAppId");
const DEFAULT_GAME_PORT = recipeDefault("valheim", "gamePort");

const globalForValheim = globalThis as unknown as {
  __valheimStates?: Record<string, ValheimState>;
};
if (!globalForValheim.__valheimStates) globalForValheim.__valheimStates = {};

interface ValheimState {
  status: ServerStatus;
  logs: string[];
  listeners: Set<(line: string) => void>;
  watching: boolean;
  lastLogSize: number;
  ready: boolean;
}

const states = globalForValheim.__valheimStates;

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

function run(cmd: string, timeout: number, maxBuffer = 1024 * 1024): Promise<string> {
  return new Promise((resolve, reject) => {
    exec(cmd, { timeout, maxBuffer }, (err, stdout) => (err ? reject(err) : resolve(String(stdout ?? "").trim())));
  });
}

const escapePs = (value: string) => value.replace(/'/g, "''");

/**
 * Players seen in the log: Valheim prints "Got character ZDOID from <name> :
 * <id>:<n>" when a character spawns (and ": 0:0" when one dies, skipped).
 * It has no console, so there's no live "who's online" list.
 */
export function playersFromLog(lines: string[]): string[] {
  const seen = new Set<string>();
  for (const line of lines) {
    const m = /Got character ZDOID from (.+?) : (-?\d+):\d+/.exec(line);
    if (m && m[2] !== "0") seen.add(m[1].trim());
  }
  return [...seen];
}

export class ValheimAdapter implements ServerAdapter {
  readonly def: ServerDefinition;
  readonly capabilities: ServerCapabilities = {
    hasRcon: false,
    hasMods: false,
    hasModPacks: false,
    hasBackups: true,
    hasWorlds: false,
    hasWarps: false,
    hasServerProperties: false,
    hasJsonConfig: true,
    hasKitsuneCommand: false,
    hasRestApi: false,
    hasSteamUpdate: true,
    hasLauncherUpdate: false,
  };

  constructor(def: ServerDefinition) {
    this.def = def;
    this.watchLog();
  }

  private getState(): ValheimState {
    if (!states[this.def.id]) {
      states[this.def.id] = {
        status: "stopped",
        logs: [],
        listeners: new Set(),
        watching: false,
        lastLogSize: 0,
        ready: false,
      };
    }
    return states[this.def.id];
  }

  private addLog(line: string) {
    const state = this.getState();
    state.logs.push(line);
    if (state.logs.length > MAX_LOG_LINES) state.logs = state.logs.slice(-MAX_LOG_LINES);
    if (line.includes(READY_LINE)) {
      state.ready = true;
      if (state.status === "starting") state.status = "running";
    }
    state.listeners.forEach((cb) => cb(line));
  }

  private get port(): number {
    return this.def.gamePort || DEFAULT_GAME_PORT;
  }

  private get steamAppId(): number {
    return this.def.steamAppId || STEAM_APP_ID;
  }

  private get settingsPath(): string {
    return path.join(this.def.dir, SETTINGS_FILE);
  }

  private get logPath(): string {
    return path.join(this.def.dir, LOG_FILE);
  }

  // ---- Log ----

  /**
   * Follow logs/valheim-server.log (the -logFile the Den passes). Unity
   * truncates it on each start; a shrink resets the read position.
   */
  private watchLog() {
    const state = this.getState();
    if (state.watching) return;
    state.watching = true;
    const file = this.logPath;
    try {
      const content = fs.readFileSync(file, "utf8");
      state.lastLogSize = Buffer.byteLength(content);
      content.split("\n").slice(-50).filter((l) => l.trim()).forEach((l) => this.addLog(l.trimEnd()));
    } catch {
      // No log yet; watchFile still fires once Valheim creates it.
    }
    fs.watchFile(file, { interval: 1000 }, (curr) => {
      if (curr.size < state.lastLogSize) state.lastLogSize = 0;
      if (curr.size <= state.lastLogSize) return;
      const from = state.lastLogSize;
      state.lastLogSize = curr.size;
      let chunk = "";
      fs.createReadStream(file, { start: from, end: curr.size - 1, encoding: "utf8" })
        .on("data", (d) => (chunk += d))
        .on("end", () => chunk.split("\n").filter((l) => l.trim()).forEach((l) => this.addLog(l.trimEnd())))
        .on("error", () => {});
    });
  }

  getLogs(): string[] {
    return this.getState().logs;
  }

  onLog(cb: (line: string) => void): () => void {
    const state = this.getState();
    state.listeners.add(cb);
    return () => {
      state.listeners.delete(cb);
    };
  }

  // ---- Process ----

  /** This server's valheim_server.exe: matched by its path, so two Valheim servers don't mix. */
  private async findProcess(): Promise<{ pid: number; memoryBytes: number; creationDate: string } | null> {
    const exePath = escapePs(path.resolve(this.def.dir, EXE_NAME));
    try {
      const out = await run(
        `powershell -NoProfile -Command "$p = Get-CimInstance Win32_Process -Filter \\"Name='${EXE_NAME}'\\" -ErrorAction SilentlyContinue | Where-Object { $_.ExecutablePath -eq '${exePath}' } | Select-Object -First 1; if ($p) { $p.ProcessId.ToString() + '|' + $p.WorkingSetSize.ToString() + '|' + $p.CreationDate.ToString('o') }"`,
        8000
      );
      const [pid, mem, created] = out.split("|");
      if (!pid || !/^\d+$/.test(pid)) return null;
      return { pid: Number(pid), memoryBytes: Number(mem) || 0, creationDate: created ?? "" };
    } catch {
      return null;
    }
  }

  getStatus(): ServerStatus {
    return this.getState().status;
  }

  async start(): Promise<ActionResult> {
    if (await this.findProcess()) return { success: false, message: "Server is already running" };

    const { settings, created } = this.loadSettings();
    const problem = validateSettings(settings);
    if (problem) return { success: false, message: `${problem} Change it on the Config tab.` };

    const exe = path.join(this.def.dir, EXE_NAME);
    if (!fs.existsSync(exe)) {
      return { success: false, message: `${EXE_NAME} not found in ${this.def.dir}. Install it from the Update tab first.` };
    }

    fs.mkdirSync(path.dirname(this.logPath), { recursive: true });
    const state = this.getState();
    state.ready = false;
    try {
      // Arguments as an array, never a shell string: a server name with
      // quotes or spaces can't break out. Detached so it outlives the Den.
      const child = spawn(exe, launchArgs(settings, this.port, this.logPath), {
        cwd: this.def.dir,
        detached: true,
        stdio: "ignore",
        windowsHide: true,
      });
      child.on("error", (e) => this.addLog(`[Dashboard] Couldn't start ${EXE_NAME}: ${e.message}`));
      child.unref();
    } catch (e) {
      return { success: false, message: (e as Error).message };
    }

    state.status = "starting";
    this.addLog(`[Dashboard] Starting Valheim (world "${settings.world}", port ${this.port})...`);
    void this.waitUntilReady();

    const note = created ? ` Created ${SETTINGS_FILE} with join password ${settings.password} (change it on the Config tab).` : "";
    return { success: true, message: `Server starting... World generation can take a few minutes.${note}` };
  }

  /** Running once the log says the world is up; stopped if the process dies first. */
  private async waitUntilReady() {
    const state = this.getState();
    const deadline = Date.now() + READY_TIMEOUT_MS;
    while (state.status === "starting" && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 2000));
      if (state.status !== "starting") return;
      if (!(await this.findProcess())) {
        state.status = "stopped";
        this.addLog("[Dashboard] Valheim exited while starting. The log above should say why.");
        return;
      }
    }
    if (state.status === "starting") state.status = "running";
  }

  async stop(): Promise<ActionResult> {
    const state = this.getState();
    const proc = await this.findProcess();
    if (!proc) {
      state.status = "stopped";
      return { success: true, message: "Server is not running" };
    }
    state.status = "stopping";
    try {
      await run(`taskkill /PID ${proc.pid} /F`, 10000);
    } catch (e) {
      state.status = "running";
      return { success: false, message: (e as Error).message };
    }
    for (let waited = 0; waited < STOP_TIMEOUT_MS; waited += 1000) {
      if (!(await this.findProcess())) break;
      await new Promise((r) => setTimeout(r, 1000));
    }
    state.status = "stopped";
    state.ready = false;
    const minutes = Math.round(this.loadSettings().settings.saveinterval / 60);
    this.addLog("[Dashboard] Valheim stopped.");
    return {
      success: true,
      message: `Server stopped. Valheim has no console to be told to save, so the world keeps its last autosave (every ${minutes} min).`,
    };
  }

  async restart(): Promise<ActionResult> {
    if (await this.findProcess()) {
      const stopped = await this.stop();
      if (!stopped.success) return stopped;
      await new Promise((r) => setTimeout(r, 3000));
    }
    return this.start();
  }

  sendCommand(_cmd: string): ActionResult {
    return { success: false, message: "The Valheim dedicated server has no console, so it can't take commands." };
  }

  // ---- Stats ----

  async getStats(): Promise<ServerStats> {
    const proc = await this.findProcess();
    const state = this.getState();
    // Started outside the Den, or after a Den restart: it's up. A "starting"
    // server waits for the ready line instead.
    if (proc && state.status === "stopped") state.status = "running";
    if (!proc && (state.status === "running" || state.status === "starting")) state.status = "stopped";

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

  // ---- Config (kitsuneden-valheim.json) ----

  /** The settings on disk over the defaults; writes the file the first time. */
  private loadSettings(): { settings: ValheimSettings; created: boolean } {
    try {
      const raw = JSON.parse(fs.readFileSync(this.settingsPath, "utf8"));
      return { settings: normalizeSettings(raw, this.def.name), created: false };
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") {
        // Unreadable JSON: don't overwrite the operator's file, run on defaults.
        return { settings: normalizeSettings({}, this.def.name), created: false };
      }
      const settings = defaultSettings(this.def.name);
      fs.mkdirSync(this.def.dir, { recursive: true });
      fs.writeFileSync(this.settingsPath, JSON.stringify(settings, null, 2));
      return { settings, created: true };
    }
  }

  async getConfig(): Promise<Record<string, unknown>> {
    return { ...this.loadSettings().settings };
  }

  async saveConfig(config: Record<string, unknown>): Promise<ActionResult> {
    const settings = normalizeSettings(config, this.def.name, this.loadSettings().settings);
    const problem = validateSettings(settings);
    if (problem) return { success: false, message: problem };
    try {
      if (fs.existsSync(this.settingsPath)) fs.copyFileSync(this.settingsPath, this.settingsPath + ".bak");
      fs.writeFileSync(this.settingsPath, JSON.stringify(settings, null, 2));
      return { success: true, message: "Config saved. Restart the server for changes to take effect." };
    } catch (e) {
      return { success: false, message: (e as Error).message };
    }
  }

  // ---- Players ----

  async getPlayers(): Promise<PlayerData> {
    const players: PlayerEntry[] = playersFromLog(this.getLogs()).map((name) => ({
      uuid: name,
      name,
      groups: ["Seen"],
      isOp: false,
    }));
    return { players, whitelist: null, bans: [] };
  }

  // ---- Memory ----

  getMemoryConfig(): DashboardConfig {
    return { minMemoryGB: 0, maxMemoryGB: 8 };
  }

  saveMemoryConfig(_config: DashboardConfig): void {
    // Valheim's memory isn't configurable from the dashboard.
  }

  // ---- SteamCMD update ----

  async getUpdateInfo(): Promise<Record<string, unknown>> {
    return {
      serverVersion: "Unknown",
      steamAppId: this.steamAppId,
      branch: readInstalledBuild(this.def.dir, this.steamAppId)?.branch ?? "public",
      steamCmdConfigured: !!this.def.steamCmdPath,
    };
  }

  /** Update in place, staying on the installed branch. Valheim ships no config to protect. */
  async updateServer(): Promise<ActionResult> {
    const steamCmd = this.def.steamCmdPath;
    if (!steamCmd) return { success: false, message: "Set the SteamCMD path in Server setup first." };
    if (await this.findProcess()) return { success: false, message: "Stop the server before updating." };

    const branch = readInstalledBuild(this.def.dir, this.steamAppId)?.branch ?? "public";
    this.addLog(`[Dashboard] Starting SteamCMD update (branch: ${branch})...`);
    try {
      await run(appUpdateCommand(steamCmd, this.def.dir, this.steamAppId, branch), UPDATE_TIMEOUT_MS, 32 * 1024 * 1024);
    } catch (e) {
      const msg = (e as Error).message;
      this.addLog(`[Dashboard] Update failed: ${msg}`);
      return { success: false, message: `Update failed: ${msg}` };
    }
    this.addLog(`[Dashboard] Update complete (branch: ${branch}).`);
    return { success: true, message: `Updated on the ${branch} branch.` };
  }

  // ---- Backups ----

  private get backupRoot(): string {
    return path.join(this.def.dir, "..", "backups", "valheim");
  }

  async getBackups(): Promise<{ hourly: unknown[]; daily: unknown[] }> {
    const backups: { hourly: unknown[]; daily: unknown[] } = { hourly: [], daily: [] };
    for (const type of ["hourly", "daily"] as const) {
      const dir = path.join(this.backupRoot, type);
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
   * Zip valheim-data (worlds plus the admin, banned and permitted lists) and
   * the settings file, from a copy. There's no way to make Valheim save
   * first, so a running server's backup is its last autosave.
   */
  async runBackup(type: "hourly" | "daily"): Promise<ActionResult> {
    const saveDir = path.join(this.def.dir, SAVE_DIR);
    if (!fs.existsSync(saveDir)) {
      return { success: false, message: `No ${SAVE_DIR} folder yet in ${this.def.dir}. Start the server once to create the world.` };
    }

    const backupDir = path.join(this.backupRoot, type);
    const name = `valheim-${new Date().toISOString().replace(/[:.]/g, "-")}.zip`;
    const backupPath = path.join(backupDir, name);
    const staging = fs.mkdtempSync(path.join(os.tmpdir(), "den-valheim-backup-"));
    try {
      copyTree(saveDir, path.join(staging, SAVE_DIR));
      if (fs.existsSync(this.settingsPath)) fs.copyFileSync(this.settingsPath, path.join(staging, SETTINGS_FILE));
      fs.mkdirSync(backupDir, { recursive: true });
      await run(
        `powershell -NoProfile -Command "Compress-Archive -Path '${escapePs(path.join(staging, "*"))}' -DestinationPath '${escapePs(backupPath)}' -Force"`,
        BACKUP_TIMEOUT_MS
      );
    } catch (e) {
      return { success: false, message: `Backup failed: ${(e as Error).message}` };
    } finally {
      fs.rmSync(staging, { recursive: true, force: true });
    }

    this.addLog(`[Dashboard] Backup created: ${name}`);
    const running = await this.findProcess();
    const note = running ? " It holds the last autosave: Valheim can't be told to save first." : "";
    return { success: true, message: `Backup created: ${name}${note}` };
  }
}
