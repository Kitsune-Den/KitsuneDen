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
  HOST_FILE,
  LOG_FILE,
  SAVE_DATA,
  SETTINGS_DIR,
  TEMPLATE_DIR,
  editableHostSettings,
  mergeHostSettings,
  parseSettingsJson,
  prepareHostSettings,
  seedHostSettings,
  validateHostSettings,
} from "../vrising-settings";

const MAX_LOG_LINES = 2000;
const EXE_NAME = "VRisingServer.exe";
/** PackRelay measured a fresh server ready in 66 s; allow plenty. */
const READY_TIMEOUT_MS = 5 * 60_000;
/** V Rising saves as it shuts down; give it a minute before a kill. */
const SHUTDOWN_GRACE_MS = 60_000;
const KILL_WAIT_MS = 30_000;
const BACKUP_TIMEOUT_MS = 10 * 60_000;
const UPDATE_TIMEOUT_MS = 30 * 60_000;
/** Logged once the world is loaded (PackRelay saw it ~20 lines from the end of a boot). */
const READY_LINE = "Startup Completed";

// Fallbacks for fields servers.json leaves unset, from the V Rising recipe.
const STEAM_APP_ID = recipeDefault("vrising", "steamAppId");
const DEFAULT_GAME_PORT = recipeDefault("vrising", "gamePort");
const DEFAULT_RCON_PORT = recipeDefault("vrising", "rconPort");

const globalForVRising = globalThis as unknown as {
  __vrisingStates?: Record<string, VRisingState>;
};
if (!globalForVRising.__vrisingStates) globalForVRising.__vrisingStates = {};

interface VRisingState {
  status: ServerStatus;
  logs: string[];
  listeners: Set<(line: string) => void>;
  watching: boolean;
  ready: boolean;
}

const states = globalForVRising.__vrisingStates;

type Settings = Record<string, unknown>;

export class VRisingAdapter implements ServerAdapter {
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

  private getState(): VRisingState {
    if (!states[this.def.id]) {
      states[this.def.id] = { status: "stopped", logs: [], listeners: new Set(), watching: false, ready: false };
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

  // ---- Paths and ports ----

  private get exePath(): string {
    return path.join(this.def.dir, EXE_NAME);
  }

  private get hostPath(): string {
    return path.join(this.def.dir, SETTINGS_DIR, HOST_FILE);
  }

  private get templatePath(): string {
    return path.join(this.def.dir, TEMPLATE_DIR, HOST_FILE);
  }

  private get logPath(): string {
    return path.join(this.def.dir, LOG_FILE);
  }

  private get port(): number {
    return this.def.gamePort || DEFAULT_GAME_PORT;
  }

  /** One above the game port: the Den's choice, written into the file, so two servers pair up cleanly. */
  private get queryPort(): number {
    return this.port + 1;
  }

  private get rconPort(): number {
    return this.def.rconPort || DEFAULT_RCON_PORT;
  }

  private get steamAppId(): number {
    return this.def.steamAppId || STEAM_APP_ID;
  }

  // ---- Settings files ----

  /** The live host settings: an object, null when missing or empty, or "unreadable". */
  private readHostSettings(): Settings | null | "unreadable" {
    let text: string;
    try {
      text = fs.readFileSync(this.hostPath, "utf8");
    } catch {
      return null;
    }
    if (!text.replace(/^﻿/, "").trim()) return null;
    try {
      return parseSettingsJson(text);
    } catch {
      return "unreadable";
    }
  }

  private readTemplate(): Settings | null {
    try {
      return parseSettingsJson(fs.readFileSync(this.templatePath, "utf8"));
    } catch {
      return null;
    }
  }

  private writeHostSettings(settings: Settings, keepBackup: boolean) {
    fs.mkdirSync(path.dirname(this.hostPath), { recursive: true });
    if (keepBackup && fs.existsSync(this.hostPath)) fs.copyFileSync(this.hostPath, this.hostPath + ".bak");
    fs.writeFileSync(this.hostPath, JSON.stringify(settings, null, 2));
  }

  /**
   * Before a start: write the ports and RCON into ServerHostSettings.json,
   * seeding it from the shipped template (listed) the first time. A file
   * that won't parse is left as it is; the server then runs without the
   * Den's RCON, and Stop falls back to a kill.
   */
  private syncHostSettings(): { note: string | null } {
    const current = this.readHostSettings();
    if (current === "unreadable") {
      this.addLog(`[Dashboard] ${HOST_FILE} isn't valid JSON, so the Den left it alone. Ports and RCON weren't written.`);
      return { note: `${HOST_FILE} isn't valid JSON, so the Den couldn't set the ports or turn on RCON. Fix the file and restart.` };
    }
    const { settings, seeded } = prepareHostSettings({
      current,
      template: current === null ? this.readTemplate() : null,
      port: this.port,
      queryPort: this.queryPort,
      rconPort: this.rconPort,
      rconPassword: this.def.rconPassword,
    });
    this.writeHostSettings(settings, false);
    return { note: seeded ? `Created ${HOST_FILE}, listed on Steam and EOS, with RCON on.` : null };
  }

  private rconPassword(): string {
    if (this.def.rconPassword) return this.def.rconPassword;
    const current = this.readHostSettings();
    const rcon = current && current !== "unreadable" ? (current.Rcon as Settings | undefined) : undefined;
    return typeof rcon?.Password === "string" ? rcon.Password : "";
  }

  private autosaveSeconds(): number {
    const current = this.readHostSettings();
    const value = current && current !== "unreadable" ? current.AutoSaveInterval : undefined;
    return typeof value === "number" ? value : 120;
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

  /** Follow logs/VRisingServer.log: the server's stdout, which the Den sends there. */
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

    const { note } = this.syncHostSettings();
    fs.mkdirSync(path.dirname(this.logPath), { recursive: true });
    const state = this.getState();
    state.ready = false;

    let out: number | null = null;
    try {
      // stdout is V Rising's log; send it to a file the Den follows, so it
      // survives a Den restart. Arguments as an array, never a shell string.
      out = fs.openSync(this.logPath, "w");
      const child = spawn(this.exePath, ["-persistentDataPath", SAVE_DATA], {
        cwd: this.def.dir,
        detached: true,
        stdio: ["ignore", out, out],
        windowsHide: true,
      });
      child.on("error", (e) => this.addLog(`[Dashboard] Couldn't start ${EXE_NAME}: ${e.message}`));
      child.unref();
    } catch (e) {
      return { success: false, message: (e as Error).message };
    } finally {
      if (out !== null) fs.closeSync(out);
    }

    state.status = "starting";
    this.addLog(`[Dashboard] Starting V Rising (port ${this.port}, RCON ${this.rconPort})...`);
    void this.waitUntilReady();
    return { success: true, message: ["Server starting...", note].filter(Boolean).join(" ") };
  }

  /** Running once the log says startup completed; stopped if the process dies first. */
  private async waitUntilReady() {
    const state = this.getState();
    const deadline = Date.now() + READY_TIMEOUT_MS;
    while (state.status === "starting" && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 2000));
      if (state.status !== "starting") return;
      if (!(await this.findProcess())) {
        state.status = "stopped";
        this.addLog("[Dashboard] V Rising exited while starting. The log above should say why.");
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
      await this.rcon("shutdown");
      this.addLog("[Dashboard] Sent shutdown over RCON.");
      if (await waitForExit(this.exePath, SHUTDOWN_GRACE_MS)) {
        message = "Server stopped. V Rising saved on the way out.";
      } else {
        await killProcess(proc.pid);
        await waitForExit(this.exePath, KILL_WAIT_MS);
        message = `V Rising didn't exit within ${SHUTDOWN_GRACE_MS / 1000} s of shutdown, so it was killed. The world keeps its last autosave.`;
      }
    } catch (e) {
      this.addLog(`[Dashboard] RCON shutdown failed (${(e as Error).message}); killing the process.`);
      try {
        await killProcess(proc.pid);
      } catch (err) {
        state.status = "running";
        return { success: false, message: (err as Error).message };
      }
      await waitForExit(this.exePath, KILL_WAIT_MS);
      message = `RCON didn't answer, so V Rising was killed. The world keeps its last autosave (every ${this.autosaveSeconds()} s).`;
    }
    state.status = "stopped";
    state.ready = false;
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

  // ---- Config (ServerHostSettings.json) ----

  /** The host settings without the ports and RCON the Den writes (and the RCON password stays off the browser). */
  async getConfig(): Promise<Record<string, unknown>> {
    const current = this.readHostSettings();
    if (current === "unreadable") return {};
    // No live file yet: show what the first start will write (listed).
    return editableHostSettings(current ?? seedHostSettings(this.readTemplate()));
  }

  async saveConfig(config: Record<string, unknown>): Promise<ActionResult> {
    const current = this.readHostSettings();
    if (current === "unreadable") {
      return { success: false, message: `${HOST_FILE} isn't valid JSON. Fix it by hand in ${SETTINGS_DIR} first.` };
    }
    const merged = mergeHostSettings(current ?? seedHostSettings(this.readTemplate()), config);
    const problem = validateHostSettings(merged);
    if (problem) return { success: false, message: problem };
    try {
      this.writeHostSettings(merged, true);
      return { success: true, message: "Config saved. Restart the server for changes to take effect." };
    } catch (e) {
      return { success: false, message: (e as Error).message };
    }
  }

  // ---- Players ----

  async getPlayers(): Promise<PlayerData> {
    // No confirmed RCON player list yet (PackRelay hasn't pinned down
    // `listusers`), and the Steam query only answers when listed.
    return { players: [], whitelist: null, bans: [] };
  }

  // ---- Memory ----

  getMemoryConfig(): DashboardConfig {
    return { minMemoryGB: 0, maxMemoryGB: 8 };
  }

  saveMemoryConfig(_config: DashboardConfig): void {
    // V Rising's memory isn't configurable from the dashboard.
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

  /**
   * Install or update in place on the installed branch. The live settings
   * are under save-data, outside the depot, so `validate` leaves them be.
   */
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
    return path.join(this.def.dir, "..", "backups", "vrising");
  }

  async getBackups(): Promise<{ hourly: unknown[]; daily: unknown[] }> {
    return listZipBackups(this.backupRoot);
  }

  /**
   * Zip a copy of save-data (saves and settings). V Rising has no save
   * command, so a running server's backup is its last autosave (every two
   * minutes by default).
   */
  async runBackup(type: "hourly" | "daily"): Promise<ActionResult> {
    const saveData = path.join(this.def.dir, SAVE_DATA);
    if (!fs.existsSync(saveData)) {
      return { success: false, message: `No ${SAVE_DATA} folder yet in ${this.def.dir}. Start the server once to create the world.` };
    }
    const name = backupName("vrising");
    try {
      await zipCopy([{ from: saveData, as: SAVE_DATA }], path.join(this.backupRoot, type, name), BACKUP_TIMEOUT_MS);
    } catch (e) {
      return { success: false, message: `Backup failed: ${(e as Error).message}` };
    }
    this.addLog(`[Dashboard] Backup created: ${name}`);
    const note = (await this.findProcess()) ? " It holds the last autosave: V Rising can't be told to save first." : "";
    return { success: true, message: `Backup created: ${name}${note}` };
  }
}
