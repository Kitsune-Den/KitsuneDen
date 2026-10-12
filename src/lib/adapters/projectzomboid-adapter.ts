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
  CACHE_DIR,
  DEN_FILE,
  INI_PATH,
  JAVA_EXE,
  LOG_FILE,
  DEN_OWNED_KEYS,
  defaultDenSettings,
  editableIni,
  javaArgs,
  normalizeDenSettings,
  parseIni,
  parsePlayers,
  patchIni,
  syncIni,
  validateDenSettings,
  type ZomboidDenSettings,
} from "../zomboid-settings";

const MAX_LOG_LINES = 2000;
/** PackRelay measured ~62 s to ready; a first boot builds the world and takes longer. */
const READY_TIMEOUT_MS = 10 * 60_000;
/** PackRelay measured a graceful `quit` at 11 s. */
const QUIT_GRACE_MS = 60_000;
const KILL_WAIT_MS = 30_000;
const SAVE_SETTLE_MS = 5000;
const BACKUP_TIMEOUT_MS = 10 * 60_000;
const UPDATE_TIMEOUT_MS = 60 * 60_000;
/** Printed once the server is up and accepting players. */
const READY_LINE = "SERVER STARTED";

// Fallbacks for fields servers.json leaves unset, from the Project Zomboid recipe.
const STEAM_APP_ID = recipeDefault("projectzomboid", "steamAppId");
const DEFAULT_GAME_PORT = recipeDefault("projectzomboid", "gamePort");
const DEFAULT_RCON_PORT = recipeDefault("projectzomboid", "rconPort");

const globalForZomboid = globalThis as unknown as {
  __zomboidStates?: Record<string, ZomboidState>;
};
if (!globalForZomboid.__zomboidStates) globalForZomboid.__zomboidStates = {};

interface ZomboidState {
  status: ServerStatus;
  logs: string[];
  listeners: Set<(line: string) => void>;
  watching: boolean;
}

const states = globalForZomboid.__zomboidStates;

export class ProjectZomboidAdapter implements ServerAdapter {
  readonly def: ServerDefinition;
  readonly capabilities: ServerCapabilities = {
    hasRcon: true,
    hasMods: false,
    hasModPacks: false,
    hasBackups: true,
    hasWorlds: false,
    hasWarps: false,
    // servertest.ini is key=value lines: the Config tab's properties mode.
    hasServerProperties: true,
    hasJsonConfig: false,
    hasKitsuneCommand: false,
    hasRestApi: false,
    hasSteamUpdate: true,
    hasLauncherUpdate: false,
  };

  constructor(def: ServerDefinition) {
    this.def = def;
    this.watchLog();
  }

  private getState(): ZomboidState {
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

  private get javaPath(): string {
    return path.join(this.def.dir, JAVA_EXE);
  }

  private get iniPath(): string {
    return path.join(this.def.dir, INI_PATH);
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

  private get rconPort(): number {
    return this.def.rconPort || DEFAULT_RCON_PORT;
  }

  private get steamAppId(): number {
    return this.def.steamAppId || STEAM_APP_ID;
  }

  // ---- Settings ----

  private readIni(): string | null {
    try {
      return fs.readFileSync(this.iniPath, "utf8");
    } catch {
      return null;
    }
  }

  /** kitsuneden-zomboid.json over the defaults; written the first time, with a new admin password. */
  private loadDenSettings(): { settings: ZomboidDenSettings; created: boolean } {
    const base = defaultDenSettings();
    try {
      const raw = JSON.parse(fs.readFileSync(this.denPath, "utf8"));
      return { settings: normalizeDenSettings(raw, base), created: false };
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") return { settings: base, created: false };
      fs.mkdirSync(this.def.dir, { recursive: true });
      fs.writeFileSync(this.denPath, JSON.stringify(base, null, 2));
      return { settings: base, created: true };
    }
  }

  private rconPassword(): string {
    if (this.def.rconPassword) return this.def.rconPassword;
    const ini = this.readIni();
    return ini ? parseIni(ini).RCONPassword ?? "" : "";
  }

  // ---- RCON ----

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
    return findProcessByPath(this.javaPath);
  }

  getStatus(): ServerStatus {
    return this.getState().status;
  }

  async start(): Promise<ActionResult> {
    if (await this.findProcess()) return { success: false, message: "Server is already running" };
    if (!fs.existsSync(this.javaPath)) {
      return { success: false, message: `${JAVA_EXE} not found in ${this.def.dir}. Install the server from the Update tab first.` };
    }

    const { settings, created } = this.loadDenSettings();
    const problem = validateDenSettings(settings);
    if (problem) return { success: false, message: `${problem} Fix it in ${DEN_FILE}.` };

    // Ports and RCON into servertest.ini (a new file holds just these; PZ fills the rest).
    const { text } = syncIni(this.readIni(), { port: this.port, rconPort: this.rconPort, rconPassword: this.def.rconPassword });
    fs.mkdirSync(path.dirname(this.iniPath), { recursive: true });
    fs.writeFileSync(this.iniPath, text);

    fs.mkdirSync(path.dirname(this.logPath), { recursive: true });
    let out: number | null = null;
    try {
      // The server's output is its log; send it to a file the Den follows.
      out = fs.openSync(this.logPath, "w");
      const child = spawn(this.javaPath, javaArgs(settings), {
        cwd: this.def.dir,
        detached: true,
        stdio: ["ignore", out, out],
        windowsHide: true,
      });
      child.on("error", (e) => this.addLog(`[Dashboard] Couldn't start Java: ${e.message}`));
      child.unref();
    } catch (e) {
      return { success: false, message: (e as Error).message };
    } finally {
      if (out !== null) fs.closeSync(out);
    }

    const state = this.getState();
    state.status = "starting";
    this.addLog(`[Dashboard] Starting Project Zomboid (port ${this.port}, RCON ${this.rconPort}, heap ${settings.minMemoryGB}-${settings.maxMemoryGB} GB)...`);
    void this.waitUntilReady();

    const note = created
      ? ` Created ${DEN_FILE}. The in-game admin account is "admin" with password ${settings.adminPassword}; save it now, PZ only sets it when the world is first made.`
      : "";
    return { success: true, message: `Server starting... A first start builds the world and takes a few minutes.${note}` };
  }

  private async waitUntilReady() {
    const state = this.getState();
    const deadline = Date.now() + READY_TIMEOUT_MS;
    while (state.status === "starting" && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 2000));
      if (state.status !== "starting") return;
      if (!(await this.findProcess())) {
        state.status = "stopped";
        this.addLog("[Dashboard] Project Zomboid exited while starting. The log above should say why.");
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
      if (await waitForExit(this.javaPath, QUIT_GRACE_MS)) {
        message = "Server stopped. Project Zomboid saved on the way out.";
      } else {
        await killProcess(proc.pid);
        await waitForExit(this.javaPath, KILL_WAIT_MS);
        message = `Project Zomboid didn't exit within ${QUIT_GRACE_MS / 1000} s of quit, so it was killed. Recent changes may not have been saved.`;
      }
    } catch (e) {
      this.addLog(`[Dashboard] RCON quit failed (${(e as Error).message}); killing the process.`);
      try {
        await killProcess(proc.pid);
      } catch (err) {
        state.status = "running";
        return { success: false, message: (err as Error).message };
      }
      await waitForExit(this.javaPath, KILL_WAIT_MS);
      message = "RCON didn't answer, so Project Zomboid was killed without saving. Recent changes may be lost.";
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

  // ---- Config (servertest.ini) ----

  /** servertest.ini without the ports and RCON the Den writes. Empty until the first start creates it. */
  async getConfig(): Promise<Record<string, unknown>> {
    const ini = this.readIni();
    return ini ? editableIni(parseIni(ini)) : {};
  }

  async saveConfig(config: Record<string, unknown>): Promise<ActionResult> {
    const ini = this.readIni();
    if (ini === null) return { success: false, message: "Start the server once first: Project Zomboid writes servertest.ini on its first boot." };
    const changes: Record<string, string> = {};
    for (const [key, value] of Object.entries(config)) {
      if ((DEN_OWNED_KEYS as readonly string[]).includes(key)) continue;
      if (value === undefined || value === null || typeof value === "object") continue;
      changes[key] = String(value);
    }
    try {
      fs.writeFileSync(this.iniPath + ".bak", ini);
      fs.writeFileSync(this.iniPath, patchIni(ini, changes));
      return { success: true, message: "Config saved. Restart the server for changes to take effect." };
    } catch (e) {
      return { success: false, message: (e as Error).message };
    }
  }

  // ---- Players ----

  async getPlayers(): Promise<PlayerData> {
    if (!(await this.findProcess())) return { players: [], whitelist: null, bans: [] };
    try {
      const names = parsePlayers(await this.rcon("players"));
      return { players: names.map((name) => ({ uuid: name, name, groups: ["Online"], isOp: false })), whitelist: null, bans: [] };
    } catch {
      return { players: [], whitelist: null, bans: [] };
    }
  }

  // ---- Memory ----

  getMemoryConfig(): DashboardConfig {
    const { settings } = this.loadDenSettings();
    return { minMemoryGB: settings.minMemoryGB, maxMemoryGB: settings.maxMemoryGB };
  }

  saveMemoryConfig(config: DashboardConfig): void {
    const { settings } = this.loadDenSettings();
    const next = { ...settings, minMemoryGB: config.minMemoryGB, maxMemoryGB: config.maxMemoryGB };
    if (!validateDenSettings(next)) fs.writeFileSync(this.denPath, JSON.stringify(next, null, 2));
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

  /** Install or update in place on the installed branch. servertest.ini lives under zomboid-data, outside the depot. */
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
    return path.join(this.def.dir, "..", "backups", "projectzomboid");
  }

  async getBackups(): Promise<{ hourly: unknown[]; daily: unknown[] }> {
    return listZipBackups(this.backupRoot);
  }

  /**
   * RCON `save` on a running server, then zip a copy of zomboid-data (world,
   * db, Server\*.ini) and kitsuneden-zomboid.json.
   */
  async runBackup(type: "hourly" | "daily"): Promise<ActionResult> {
    const cacheDir = path.join(this.def.dir, CACHE_DIR);
    if (!fs.existsSync(cacheDir)) {
      return { success: false, message: `No ${CACHE_DIR} folder yet in ${this.def.dir}. Start the server once to create the world.` };
    }
    const notes: string[] = [];
    if (await this.findProcess()) {
      try {
        await this.rcon("save");
        await new Promise((r) => setTimeout(r, SAVE_SETTLE_MS));
      } catch (e) {
        notes.push(`Couldn't ask the server to save first (${(e as Error).message}), so this has what was last saved.`);
      }
    }
    const name = backupName("projectzomboid");
    try {
      await zipCopy(
        [
          { from: cacheDir, as: CACHE_DIR },
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
