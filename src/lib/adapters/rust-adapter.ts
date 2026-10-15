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
  DEN_FILE,
  HIDDEN_KEYS,
  LOG_FILE,
  SERVER_DIR,
  defaultSettings,
  isMapCache,
  launchArgs,
  normalizeSettings,
  parsePlayerlist,
  validateSettings,
  type RustSettings,
} from "../rust-settings";

const MAX_LOG_LINES = 2000;
const EXE_NAME = "RustDedicated.exe";
/** PackRelay measured ~7.5 min of map generation on a first boot at world size 4500. */
const READY_TIMEOUT_MS = 20 * 60_000;
/** `quit` saved and exited in 2 s when PackRelay measured it. */
const QUIT_GRACE_MS = 60_000;
const KILL_WAIT_MS = 30_000;
const SAVE_SETTLE_MS = 3000;
const BACKUP_TIMEOUT_MS = 10 * 60_000;
const UPDATE_TIMEOUT_MS = 60 * 60_000;
/** Logged once the server is up; RCON times out on commands until then. */
const READY_LINE = "Server startup complete";

// Fallbacks for fields servers.json leaves unset, from the Rust recipe.
const STEAM_APP_ID = recipeDefault("rust", "steamAppId");
const DEFAULT_GAME_PORT = recipeDefault("rust", "gamePort");

const globalForRust = globalThis as unknown as { __rustStates?: Record<string, RustState> };
if (!globalForRust.__rustStates) globalForRust.__rustStates = {};

interface RustState {
  status: ServerStatus;
  logs: string[];
  listeners: Set<(line: string) => void>;
  watching: boolean;
}

const states = globalForRust.__rustStates;

export class RustAdapter implements ServerAdapter {
  readonly def: ServerDefinition;
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

  constructor(def: ServerDefinition) {
    this.def = def;
    this.watchLog();
  }

  private getState(): RustState {
    if (!states[this.def.id]) states[this.def.id] = { status: "stopped", logs: [], listeners: new Set(), watching: false };
    return states[this.def.id];
  }

  private addLog(line: string) {
    const state = this.getState();
    state.logs.push(line);
    if (state.logs.length > MAX_LOG_LINES) state.logs = state.logs.slice(-MAX_LOG_LINES);
    if (line.includes(READY_LINE) && state.status === "starting") state.status = "running";
    state.listeners.forEach((cb) => cb(line));
  }

  // ---- Paths and ports ----

  private get exePath(): string {
    return path.join(this.def.dir, EXE_NAME);
  }

  private get denPath(): string {
    return path.join(this.def.dir, DEN_FILE);
  }

  private get logPath(): string {
    return path.join(this.def.dir, LOG_FILE);
  }

  private get port(): number {
    return this.def.gamePort || DEFAULT_GAME_PORT;
  }

  /** RCON sits at game + 1, as in the recipe; the Den passes it as +rcon.port. */
  private get rconPort(): number {
    return this.port + 1;
  }

  private get steamAppId(): number {
    return this.def.steamAppId || STEAM_APP_ID;
  }

  // ---- Settings (kitsuneden-rust.json) ----

  /** The settings over the defaults; written the first time (a new seed and RCON password). */
  private loadSettings(): { settings: RustSettings; created: boolean } {
    const base = defaultSettings(this.def.name, this.def.id);
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

  private rconPassword(): string {
    return this.def.rconPassword || this.loadSettings().settings.rconPassword;
  }

  // ---- RCON (Source protocol: +rcon.web 0) ----

  private async rcon(command: string): Promise<string> {
    const { Rcon } = await import("rcon-client");
    const client = await Rcon.connect({ host: "127.0.0.1", port: this.rconPort, password: this.rconPassword(), timeout: 5000 });
    try {
      return await client.send(command);
    } finally {
      client.end();
    }
  }

  // ---- Log ----

  private watchLog() {
    const state = this.getState();
    if (state.watching) return;
    state.watching = true;
    followLog(this.logPath, (line) => this.addLog(line));
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
      return { success: false, message: `${EXE_NAME} not found in ${this.def.dir}. Install it from the Update tab first.` };
    }

    const { settings, created } = this.loadSettings();
    const rconPassword = this.rconPassword();
    const problem = validateSettings({ ...settings, rconPassword });
    if (problem) return { success: false, message: `${problem} Change it on the Config tab.` };

    fs.mkdirSync(path.dirname(this.logPath), { recursive: true });
    try {
      // Arguments as an array, never a shell string: a hostname with quotes
      // or spaces needs no escaping and can't break out.
      const child = spawn(this.exePath, launchArgs(settings, this.port, this.logPath, rconPassword), {
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

    const state = this.getState();
    state.status = "starting";
    this.addLog(`[Dashboard] Starting Rust (identity ${settings.identity}, port ${this.port}, RCON ${this.rconPort})...`);
    void this.waitUntilReady();

    const note = created ? ` Created ${DEN_FILE} with world seed ${settings.seed}.` : "";
    return { success: true, message: `Server starting... A first start generates the map, which can take several minutes.${note}` };
  }

  private async waitUntilReady() {
    const state = this.getState();
    const deadline = Date.now() + READY_TIMEOUT_MS;
    while (state.status === "starting" && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 2000));
      if (state.status !== "starting") return;
      if (!(await this.findProcess())) {
        state.status = "stopped";
        this.addLog("[Dashboard] Rust exited while starting. The log above should say why.");
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

    let message: string;
    try {
      await this.rcon("quit");
      this.addLog("[Dashboard] Sent quit over RCON.");
      if (await waitForExit(this.exePath, QUIT_GRACE_MS)) {
        message = "Server stopped. Rust saved on the way out.";
      } else {
        await killProcess(proc.pid);
        await waitForExit(this.exePath, KILL_WAIT_MS);
        message = `Rust didn't exit within ${QUIT_GRACE_MS / 1000} s of quit, so it was killed. The world keeps its last save.`;
      }
    } catch (e) {
      this.addLog(`[Dashboard] RCON quit failed (${(e as Error).message}); killing the process.`);
      try {
        await killProcess(proc.pid);
      } catch (err) {
        state.status = "running";
        return { success: false, message: (err as Error).message };
      }
      await waitForExit(this.exePath, KILL_WAIT_MS);
      message = "RCON didn't answer, so Rust was killed. The world keeps its last save.";
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

  // ---- Config (kitsuneden-rust.json) ----

  /** The settings without the RCON password, which never reaches the browser. */
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
      const names = parsePlayerlist(await this.rcon("playerlist"));
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
    // Rust manages its own memory.
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

  /** Install or update in place on the installed branch. Worlds live under server/, outside the depot. */
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
    return path.join(this.def.dir, "..", "backups", "rust");
  }

  async getBackups(): Promise<{ hourly: unknown[]; daily: unknown[] }> {
    return listZipBackups(this.backupRoot);
  }

  /**
   * `server.save` on a running server, then zip a copy of server/<identity>
   * without the map caches (regenerated from the seed; ~93% of the size in
   * PackRelay's measurement), plus kitsuneden-rust.json.
   */
  async runBackup(type: "hourly" | "daily"): Promise<ActionResult> {
    const { settings } = this.loadSettings();
    const worldDir = path.join(this.def.dir, SERVER_DIR, settings.identity);
    if (!fs.existsSync(worldDir)) {
      return { success: false, message: `No ${SERVER_DIR}\\${settings.identity} folder yet. Start the server once to create the world.` };
    }
    const notes: string[] = [];
    if (await this.findProcess()) {
      try {
        await this.rcon("server.save");
        await new Promise((r) => setTimeout(r, SAVE_SETTLE_MS));
      } catch (e) {
        notes.push(`Couldn't ask the server to save first (${(e as Error).message}), so this has the last save.`);
      }
    }
    const name = backupName("rust");
    try {
      await zipCopy(
        [
          { from: worldDir, as: path.join(SERVER_DIR, settings.identity), skip: isMapCache },
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
