import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import type {
  ServerAdapter,
  ServerDefinition,
  ServerCapabilities,
  ServerStatus,
  ActionResult,
  DashboardConfig,
  ServerStats,
  PlayerData,
} from "./types";
import { recipeDefault } from "../recipes";
import { appUpdateCommand, readInstalledBuild } from "../steamcmd";
import {
  backupName,
  findProcessByPath,
  followLog,
  killProcess,
  listZipBackups,
  run,
  statsFor,
  waitForExit,
  zipCopy,
  type ExeProcess,
} from "./exe-server";
import {
  ARK_GAMES,
  DEN_FILE,
  HIDDEN_KEYS,
  SAVED_DIR,
  defaultSettings,
  isBackupNoise,
  launchArgs,
  normalizeSettings,
  parseListPlayers,
  redact,
  validateSettings,
  type ArkSettings,
  type ArkVariant,
} from "../ark-settings";

const MAX_LOG_LINES = 2000;
/** PackRelay measured 40 s to 2.5 min on an SSD, and 35 min for a first start from a USB hard drive. */
const READY_TIMEOUT_MS = 45 * 60_000;
const READY_POLL_MS = 10_000;
/** SaveWorld + DoExit took 1.4-3.2 s when PackRelay measured it. */
const EXIT_GRACE_MS = 60_000;
const KILL_WAIT_MS = 30_000;
const SAVE_SETTLE_MS = 3000;
const BACKUP_TIMEOUT_MS = 20 * 60_000;
/** ASE is 22.9 GB (40 min on a slow disk), ASA 11.6 GB. */
const UPDATE_TIMEOUT_MS = 120 * 60_000;

const globalForArk = globalThis as unknown as { __arkStates?: Record<string, ArkState> };
if (!globalForArk.__arkStates) globalForArk.__arkStates = {};

interface ArkState {
  status: ServerStatus;
  logs: string[];
  listeners: Set<(line: string) => void>;
  watching: boolean;
}

const states = globalForArk.__arkStates;

export class ArkAdapter implements ServerAdapter {
  readonly def: ServerDefinition;
  readonly variant: ArkVariant;
  readonly capabilities: ServerCapabilities = {
    hasRcon: true,
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

  constructor(def: ServerDefinition, variant: ArkVariant) {
    this.def = def;
    this.variant = variant;
    this.watchLog();
  }

  private get game() {
    return ARK_GAMES[this.variant];
  }

  private getState(): ArkState {
    if (!states[this.def.id]) states[this.def.id] = { status: "stopped", logs: [], listeners: new Set(), watching: false };
    return states[this.def.id];
  }

  private addLog(line: string) {
    const state = this.getState();
    const safe = redact(line, [this.adminPassword()]);
    state.logs.push(safe);
    if (state.logs.length > MAX_LOG_LINES) state.logs = state.logs.slice(-MAX_LOG_LINES);
    state.listeners.forEach((cb) => cb(safe));
  }

  // ---- Paths and ports ----

  private get exePath(): string {
    return path.join(this.def.dir, this.game.exe);
  }

  private get denPath(): string {
    return path.join(this.def.dir, DEN_FILE);
  }

  private get ports() {
    return {
      game: this.def.gamePort || recipeDefault(this.game.type, "gamePort"),
      query: this.def.queryPort || recipeDefault(this.game.type, "queryPort"),
      rcon: this.def.rconPort || recipeDefault(this.game.type, "rconPort"),
    };
  }

  private get steamAppId(): number {
    return this.def.steamAppId || recipeDefault(this.game.type, "steamAppId");
  }

  // ---- Settings (kitsuneden-ark.json) ----

  /** The settings over the defaults; written the first time, with a new admin password. */
  private loadSettings(): { settings: ArkSettings; created: boolean } {
    const base = defaultSettings(this.variant, this.def.name);
    try {
      const raw = JSON.parse(fs.readFileSync(this.denPath, "utf8"));
      return { settings: normalizeSettings(raw, base), created: false };
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") return { settings: base, created: false };
      fs.mkdirSync(this.def.dir, { recursive: true });
      fs.writeFileSync(this.denPath, JSON.stringify(base, null, 2));
      return { settings: base, created: true };
    }
  }

  /** The admin (and RCON) password: servers.json's rconPassword when set, else the settings file's. */
  private adminPassword(): string {
    if (this.def.rconPassword) return this.def.rconPassword;
    try {
      const raw = JSON.parse(fs.readFileSync(this.denPath, "utf8"));
      return typeof raw.adminPassword === "string" ? raw.adminPassword : "";
    } catch {
      return "";
    }
  }

  // ---- RCON ----

  private async rcon(command: string, timeout = 5000): Promise<string> {
    const { Rcon } = await import("rcon-client");
    const client = await Rcon.connect({ host: "127.0.0.1", port: this.ports.rcon, password: this.adminPassword(), timeout });
    try {
      return await client.send(command);
    } finally {
      client.end();
    }
  }

  // ---- Log ----

  /** ASA's ShooterGame.log; ASE writes none. */
  private watchLog() {
    const state = this.getState();
    if (state.watching || !this.game.logFile) return;
    state.watching = true;
    followLog(path.join(this.def.dir, this.game.logFile), (line) => this.addLog(line));
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

  // ---- Lifecycle ----

  private findProcess(): Promise<ExeProcess | null> {
    return findProcessByPath(this.exePath);
  }

  getStatus(): ServerStatus {
    return this.getState().status;
  }

  async start(): Promise<ActionResult> {
    if (await this.findProcess()) return { success: false, message: "Server is already running" };
    if (!fs.existsSync(this.exePath)) {
      return { success: false, message: `${this.game.exe} not found in ${this.def.dir}. Install it from the Update tab first.` };
    }

    const { settings, created } = this.loadSettings();
    const adminPassword = this.adminPassword();
    const problem = validateSettings({ ...settings, adminPassword });
    if (problem) return { success: false, message: `${problem} Change it on the Config tab.` };

    try {
      // The travel URL is one argv entry: Node quotes it whole, so a session
      // name with spaces stays one argument, and there's no shell to escape.
      const child = spawn(this.exePath, launchArgs(this.variant, settings, this.ports, adminPassword), {
        cwd: this.def.dir,
        detached: true,
        stdio: "ignore",
        windowsHide: true,
      });
      child.on("error", (e) => this.addLog(`[Dashboard] Couldn't start ${path.basename(this.game.exe)}: ${e.message}`));
      child.unref();
    } catch (e) {
      return { success: false, message: (e as Error).message };
    }

    const state = this.getState();
    state.status = "starting";
    const { game, query, rcon } = this.ports;
    this.addLog(`[Dashboard] Starting ${this.game.label} (map ${settings.map}, port ${game}, query ${query}, RCON ${rcon})...`);
    if (!this.game.logFile) {
      this.addLog("[Dashboard] ARK: Survival Evolved writes no log, so this stays quiet while it loads. The Den checks RCON to know when it's up.");
    }
    void this.waitUntilReady();

    const note = created ? ` Created ${DEN_FILE} with a new admin password (it's also the RCON password; set your own as RCON Password in Server setup).` : "";
    return { success: true, message: `Server starting... ARK takes a few minutes to load, longer from a hard drive.${note}` };
  }

  /** Running once RCON answers (ARK answers Steam queries before it's playable); stopped if it exits. */
  private async waitUntilReady() {
    const state = this.getState();
    const deadline = Date.now() + READY_TIMEOUT_MS;
    while (state.status === "starting" && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, READY_POLL_MS));
      if (state.status !== "starting") return;
      if (!(await this.findProcess())) {
        state.status = "stopped";
        this.addLog("[Dashboard] ARK exited while starting. Look for a .crashstack file in ShooterGame\\Saved\\Logs.");
        return;
      }
      try {
        await this.rcon("ListPlayers", 3000);
        if (state.status === "starting") {
          state.status = "running";
          this.addLog("[Dashboard] RCON answered: the server is up.");
        }
        return;
      } catch {
        // Not up yet.
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

    let message: string;
    try {
      await this.rcon("SaveWorld");
      await this.rcon("DoExit");
      this.addLog("[Dashboard] Sent SaveWorld and DoExit over RCON.");
      if (await waitForExit(this.exePath, EXIT_GRACE_MS)) {
        message = "Server stopped. The world was saved first.";
      } else {
        await killProcess(proc.pid);
        await waitForExit(this.exePath, KILL_WAIT_MS);
        message = `ARK saved but didn't exit within ${EXIT_GRACE_MS / 1000} s, so it was killed.`;
      }
    } catch (e) {
      this.addLog(`[Dashboard] RCON didn't answer (${(e as Error).message}); killing the process.`);
      try {
        await killProcess(proc.pid);
      } catch (err) {
        state.status = "running";
        return { success: false, message: (err as Error).message };
      }
      await waitForExit(this.exePath, KILL_WAIT_MS);
      message = "RCON didn't answer, so ARK was killed without saving. The world keeps its last autosave.";
    }
    state.status = "stopped";
    this.addLog(`[Dashboard] ${message}`);
    return { success: true, message };
  }

  async restart(): Promise<ActionResult> {
    if (await this.findProcess()) {
      const stopped = await this.stop();
      if (!stopped.success) return stopped;
      await new Promise((r) => setTimeout(r, 3000));
    }
    return this.start();
  }

  sendCommand(cmd: string): ActionResult {
    this.addLog(`> ${cmd}`);
    this.rcon(cmd)
      .then((reply) => reply.split("\n").filter((l) => l.trim()).forEach((l) => this.addLog(l)))
      .catch((e) => this.addLog(`[Dashboard] RCON: ${(e as Error).message}`));
    return { success: true, message: "Command sent" };
  }

  // ---- Stats ----

  async getStats(): Promise<ServerStats> {
    const proc = await this.findProcess();
    const state = this.getState();
    if (proc && state.status === "stopped") state.status = "running";
    if (!proc && (state.status === "running" || state.status === "starting")) state.status = "stopped";
    return statsFor(proc);
  }

  // ---- Config (kitsuneden-ark.json) ----

  /** The settings without the admin password, which never reaches the browser. */
  async getConfig(): Promise<Record<string, unknown>> {
    const out: Record<string, unknown> = { ...this.loadSettings().settings };
    for (const key of HIDDEN_KEYS) delete out[key];
    return out;
  }

  async saveConfig(config: Record<string, unknown>): Promise<ActionResult> {
    const current = this.loadSettings().settings;
    const incoming = { ...config };
    for (const key of HIDDEN_KEYS) delete incoming[key];
    const next = normalizeSettings(incoming, current);
    const problem = validateSettings(next);
    if (problem) return { success: false, message: problem };
    try {
      if (fs.existsSync(this.denPath)) fs.copyFileSync(this.denPath, this.denPath + ".bak");
      fs.writeFileSync(this.denPath, JSON.stringify(next, null, 2));
      return { success: true, message: "Config saved. Restart the server for changes to take effect." };
    } catch (e) {
      return { success: false, message: (e as Error).message };
    }
  }

  // ---- Players ----

  async getPlayers(): Promise<PlayerData> {
    if (!(await this.findProcess())) return { players: [], whitelist: null, bans: [] };
    try {
      const names = parseListPlayers(await this.rcon("ListPlayers"));
      return { players: names.map((name) => ({ uuid: name, name, groups: ["Online"], isOp: false })), whitelist: null, bans: [] };
    } catch {
      return { players: [], whitelist: null, bans: [] };
    }
  }

  // ---- Memory ----

  getMemoryConfig(): DashboardConfig {
    return { minMemoryGB: 0, maxMemoryGB: 16 };
  }

  saveMemoryConfig(_config: DashboardConfig): void {
    // ARK manages its own memory.
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

  /** Install or update in place on the installed branch. Saves and config live under ShooterGame\Saved, outside the depot. */
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
    return path.join(this.def.dir, "..", "backups", this.game.type);
  }

  async getBackups(): Promise<{ hourly: unknown[]; daily: unknown[] }> {
    return listZipBackups(this.backupRoot);
  }

  /**
   * `SaveWorld` on a running server, then zip a copy of ShooterGame\Saved
   * (worlds, config, clusters) without the single-player save and the
   * timestamped generations, plus kitsuneden-ark.json.
   */
  async runBackup(type: "hourly" | "daily"): Promise<ActionResult> {
    const saved = path.join(this.def.dir, SAVED_DIR);
    if (!fs.existsSync(saved)) {
      return { success: false, message: `No ShooterGame\\Saved folder yet in ${this.def.dir}. Start the server once to create the world.` };
    }
    const notes: string[] = [];
    if (await this.findProcess()) {
      try {
        await this.rcon("SaveWorld");
        await new Promise((r) => setTimeout(r, SAVE_SETTLE_MS));
      } catch (e) {
        notes.push(`Couldn't ask the server to save first (${(e as Error).message}), so this has the last autosave.`);
      }
    }
    const name = backupName(this.game.type);
    try {
      await zipCopy(
        [
          { from: saved, as: SAVED_DIR, skip: isBackupNoise },
          { from: this.denPath, as: DEN_FILE },
        ],
        path.join(this.backupRoot, type, name),
        BACKUP_TIMEOUT_MS
      );
    } catch (e) {
      return { success: false, message: `Backup failed: ${(e as Error).message}` };
    }
    this.addLog(`[Dashboard] Backup created: ${name}`);
    return { success: true, message: [`Backup created: ${name}`, ...notes].join(" ") };
  }
}
