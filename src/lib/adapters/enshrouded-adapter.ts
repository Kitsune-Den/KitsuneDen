import { exec } from "child_process";
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

const MAX_LOG_LINES = 2000;
const STOP_TIMEOUT_MS = 30_000;
const PROCESS_NAME = "enshrouded_server.exe";
const STEAM_APP_ID = 2278520;
const DEFAULT_GAME_PORT = 15637;
const DEFAULT_QUERY_PORT = 15638;
const CONFIG_FILENAME = "enshrouded_server.json";
const SAVEGAME_DIRNAME = "savegame";

const globalForEnshrouded = globalThis as unknown as {
  __enshroudedStates?: Record<string, EnshroudedState>;
};
if (!globalForEnshrouded.__enshroudedStates) {
  globalForEnshrouded.__enshroudedStates = {};
}

interface EnshroudedState {
  status: ServerStatus;
  logs: string[];
  listeners: Set<(line: string) => void>;
  watchingLog: boolean;
  lastLogSize: number;
  currentLogPath: string | null;
}

const states = globalForEnshrouded.__enshroudedStates;

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

function execAsync(cmd: string, timeout = 8000): Promise<string> {
  return new Promise((resolve, reject) => {
    exec(cmd, { timeout }, (err, stdout) => {
      if (err) return reject(err);
      resolve(stdout.trim());
    });
  });
}

function defaultConfig(def: ServerDefinition): Record<string, unknown> {
  return {
    name: def.name || "Kitsune Den - Enshrouded",
    saveDirectory: "./savegame",
    logDirectory: "./logs",
    ip: "0.0.0.0",
    queryPort: def.queryPort || DEFAULT_QUERY_PORT,
    slotCount: 16,
    gamePort: def.gamePort || DEFAULT_GAME_PORT,
    voiceChatMode: "Proximity",
    enableTextChat: true,
    enableVoiceChat: true,
    serverPassword: "",
    userGroups: [
      { name: "Admin", password: "kitsuneadmin", canKickBan: true, canAccessInventories: true, canEditBase: true, canExtendBase: true, reservedSlots: 0 },
      { name: "Friend", password: "kitsunefriend", canKickBan: false, canAccessInventories: true, canEditBase: true, canExtendBase: false, reservedSlots: 0 },
      { name: "Guest", password: "", canKickBan: false, canAccessInventories: false, canEditBase: false, canExtendBase: false, reservedSlots: 0 },
    ],
  };
}

export class EnshroudedAdapter implements ServerAdapter {
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
    this.initLogWatcher();
  }

  private getState(): EnshroudedState {
    if (!states[this.def.id]) {
      states[this.def.id] = {
        status: "stopped",
        logs: [],
        listeners: new Set(),
        watchingLog: false,
        lastLogSize: 0,
        currentLogPath: null,
      };
    }
    return states[this.def.id];
  }

  private addLog(line: string) {
    const state = this.getState();
    state.logs.push(line);
    if (state.logs.length > MAX_LOG_LINES) {
      state.logs = state.logs.slice(-MAX_LOG_LINES);
    }
    state.listeners.forEach((cb) => cb(line));
  }

  // ---- Log watcher ----

  private get logsDir(): string {
    return path.join(this.def.dir, "logs");
  }

  private findLatestLog(): string | null {
    try {
      const files = fs.readdirSync(this.logsDir)
        .filter((f) => f.endsWith(".log"))
        .map((f) => ({
          name: f,
          mtime: fs.statSync(path.join(this.logsDir, f)).mtime.getTime(),
        }))
        .sort((a, b) => b.mtime - a.mtime);
      return files.length > 0 ? path.join(this.logsDir, files[0].name) : null;
    } catch {
      return null;
    }
  }

  private initLogWatcher() {
    const state = this.getState();
    if (state.watchingLog) return;

    const logPath = this.findLatestLog();
    if (!logPath) return;

    state.currentLogPath = logPath;

    try {
      state.lastLogSize = fs.statSync(logPath).size;

      const content = fs.readFileSync(logPath, "utf8");
      const initialLines = content.split("\n").slice(-50).filter((l) => l.trim());
      initialLines.forEach((line) => this.addLog(line));

      fs.watchFile(logPath, { interval: 1000 }, (curr) => {
        if (curr.size > state.lastLogSize) {
          const stream = fs.createReadStream(logPath, {
            start: state.lastLogSize,
            encoding: "utf8",
          });
          let newData = "";
          stream.on("data", (chunk) => (newData += chunk));
          stream.on("end", () => {
            const newLines = newData.split("\n").filter((l) => l.trim());
            newLines.forEach((line) => this.addLog(line));
            state.lastLogSize = curr.size;
          });
        } else if (curr.size < state.lastLogSize) {
          state.lastLogSize = curr.size;
        }
      });

      state.watchingLog = true;
    } catch {
      // Logs dir may not exist yet
    }
  }

  // ---- Process management ----

  private async isServerRunning(): Promise<boolean> {
    try {
      const result = await execAsync(
        `powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \\"Name='${PROCESS_NAME}'\\" -ErrorAction SilentlyContinue | Select-Object -First 1 ProcessId | ForEach-Object { $_.ProcessId }"`
      );
      return result.length > 0 && /^\d+$/.test(result);
    } catch {
      return false;
    }
  }

  private async getServerProcess(): Promise<{ pid: string; memoryBytes: number; creationDate: string } | null> {
    try {
      const result = await execAsync(
        `powershell -NoProfile -Command "$p = Get-CimInstance Win32_Process -Filter \\"Name='${PROCESS_NAME}'\\" -ErrorAction SilentlyContinue | Select-Object -First 1; if ($p) { $p.ProcessId.ToString() + '|' + $p.WorkingSetSize.ToString() + '|' + $p.CreationDate.ToString('o') } else { '' }"`
      );
      const parts = result.split("|");
      if (parts.length < 3 || !parts[0]) return null;
      return {
        pid: parts[0],
        memoryBytes: parseInt(parts[1]) || 0,
        creationDate: parts[2],
      };
    } catch {
      return null;
    }
  }

  private async terminateProcess(): Promise<void> {
    await execAsync(
      `powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \\"Name='${PROCESS_NAME}'\\" | Invoke-CimMethod -MethodName Terminate"`
    );
  }

  getStatus(): ServerStatus {
    return this.getState().status;
  }

  async start(): Promise<ActionResult> {
    const running = await this.isServerRunning();
    if (running) {
      return { success: false, message: "Server is already running" };
    }

    await this.ensureConfig();

    const batPath = path.join(this.def.dir, this.def.startScript || "start_enshrouded.bat");
    const workDir = this.def.dir.replace(/\//g, "\\");

    let cmd: string;
    if (fs.existsSync(batPath)) {
      cmd = `powershell -NoProfile -Command "Start-Process cmd.exe -ArgumentList '/c','${batPath.replace(/\//g, "\\")}' -WorkingDirectory '${workDir}'"`;
    } else {
      const exePath = path.join(this.def.dir, PROCESS_NAME).replace(/\//g, "\\");
      if (!fs.existsSync(exePath)) {
        return { success: false, message: `enshrouded_server.exe not found in ${workDir}. Run SteamCMD update first.` };
      }
      cmd = `powershell -NoProfile -Command "Start-Process '${exePath}' -WorkingDirectory '${workDir}'"`;
    }

    try {
      await execAsync(cmd);
      const state = this.getState();
      state.status = "starting";
      this.addLog("[Dashboard] Starting Enshrouded server...");

      setTimeout(() => {
        const s = this.getState();
        s.watchingLog = false;
        this.initLogWatcher();
      }, 5000);

      this.pollUntilRunning();

      return { success: true, message: "Server starting..." };
    } catch (e) {
      return { success: false, message: (e as Error).message };
    }
  }

  private async pollUntilRunning() {
    const state = this.getState();
    for (let i = 0; i < 60; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      if (await this.isServerRunning()) {
        state.status = "running";
        this.addLog("[Dashboard] Enshrouded server is now running.");
        return;
      }
    }
    if (state.status === "starting") {
      state.status = "stopped";
      this.addLog("[Dashboard] Server failed to start within timeout.");
    }
  }

  async stop(): Promise<ActionResult> {
    const state = this.getState();

    // Enshrouded has no RCON; we have to terminate the process. This is what every
    // public Enshrouded server tool does — the game persists state on its own save tick.
    try {
      await this.terminateProcess();
      state.status = "stopped";
      this.addLog("[Dashboard] Enshrouded server terminated.");

      // Wait a moment for the process to actually exit
      for (let i = 0; i < STOP_TIMEOUT_MS / 2000; i++) {
        await new Promise((r) => setTimeout(r, 2000));
        if (!(await this.isServerRunning())) {
          return { success: true, message: "Server stopped" };
        }
      }
      return { success: true, message: "Stop signal sent (process may still be exiting)" };
    } catch (e) {
      return { success: false, message: (e as Error).message };
    }
  }

  async restart(): Promise<ActionResult> {
    const running = await this.isServerRunning();
    if (running) {
      const stopResult = await this.stop();
      if (!stopResult.success) return stopResult;
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }
    return this.start();
  }

  sendCommand(_cmd: string): ActionResult {
    return { success: false, message: "Enshrouded dedicated server does not support runtime commands (no RCON)." };
  }

  // ---- Logs ----

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

  // ---- Stats ----

  async getStats(): Promise<ServerStats> {
    const proc = await this.getServerProcess();
    const state = this.getState();

    if (proc) {
      if (state.status === "stopped" || state.status === "starting") {
        state.status = "running";
      }
    } else {
      if (state.status === "running" || state.status === "starting") {
        state.status = "stopped";
      }
    }

    return {
      process: proc
        ? {
            pid: parseInt(proc.pid),
            memory: formatBytes(proc.memoryBytes),
            memoryBytes: proc.memoryBytes,
            upSince: proc.creationDate,
          }
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

  // ---- Config (enshrouded_server.json) ----

  private get configPath(): string {
    return path.join(this.def.dir, this.def.configFile || CONFIG_FILENAME);
  }

  async getConfig(): Promise<Record<string, unknown>> {
    try {
      const raw = fs.readFileSync(this.configPath, "utf8");
      return JSON.parse(raw);
    } catch {
      return defaultConfig(this.def);
    }
  }

  async saveConfig(config: Record<string, unknown>): Promise<ActionResult> {
    try {
      if (fs.existsSync(this.configPath)) {
        const current = fs.readFileSync(this.configPath, "utf8");
        fs.writeFileSync(this.configPath + ".bak", current);
      }

      fs.mkdirSync(path.dirname(this.configPath), { recursive: true });
      fs.writeFileSync(this.configPath, JSON.stringify(config, null, 2));
      return { success: true, message: "Config saved. Restart the server for changes to take effect." };
    } catch (e) {
      return { success: false, message: (e as Error).message };
    }
  }

  async ensureConfig(): Promise<void> {
    if (fs.existsSync(this.configPath)) return;
    fs.mkdirSync(path.dirname(this.configPath), { recursive: true });
    fs.writeFileSync(this.configPath, JSON.stringify(defaultConfig(this.def), null, 2));
  }

  // ---- Players ----

  async getPlayers(): Promise<PlayerData> {
    // No RCON, no API. Best-effort scrape from recent log lines for connect/disconnect events.
    const players: PlayerEntry[] = [];
    const seen = new Map<string, string>(); // steamId -> name
    const onlineIds = new Set<string>();

    const logs = this.getState().logs;
    for (const line of logs) {
      // Common Enshrouded log patterns:
      //   "Player <name> (id <steamId>) connected"
      //   "Player <name> (id <steamId>) disconnected"
      const connect = line.match(/Player\s+(.+?)\s+\(id\s+(\d+)\)\s+connected/i);
      const disconnect = line.match(/Player\s+(.+?)\s+\(id\s+(\d+)\)\s+disconnected/i);
      if (connect) {
        seen.set(connect[2], connect[1]);
        onlineIds.add(connect[2]);
      } else if (disconnect) {
        seen.set(disconnect[2], disconnect[1]);
        onlineIds.delete(disconnect[2]);
      }
    }

    for (const [steamId, name] of seen) {
      players.push({
        uuid: steamId,
        name,
        groups: onlineIds.has(steamId) ? ["Online"] : ["Seen"],
        isOp: false,
      });
    }

    return { players, whitelist: null, bans: [] };
  }

  // ---- Memory ----

  getMemoryConfig(): DashboardConfig {
    return { minMemoryGB: 0, maxMemoryGB: 8 };
  }

  saveMemoryConfig(_config: DashboardConfig): void {
    // Enshrouded memory is not configurable via dashboard
  }

  // ---- Server info ----

  async getServerInfo(): Promise<Record<string, unknown>> {
    const running = await this.isServerRunning();
    const proc = running ? await this.getServerProcess() : null;
    const config = await this.getConfig();

    return {
      running,
      serverName: config.name || "Enshrouded Server",
      maxPlayers: typeof config.slotCount === "number" ? config.slotCount : 16,
      gamePort: config.gamePort || this.def.gamePort || DEFAULT_GAME_PORT,
      queryPort: config.queryPort || this.def.queryPort || DEFAULT_QUERY_PORT,
      serverVersion: "Unknown",
      steamAppId: this.def.steamAppId || STEAM_APP_ID,
      steamCmdConfigured: !!this.def.steamCmdPath,
      process: proc
        ? {
            pid: proc.pid,
            memory: formatBytes(proc.memoryBytes),
            memoryBytes: proc.memoryBytes,
            upSince: proc.creationDate,
          }
        : null,
    };
  }

  // ---- SteamCMD Update ----

  async updateServer(): Promise<ActionResult> {
    const steamCmd = this.def.steamCmdPath;
    if (!steamCmd) {
      return { success: false, message: "SteamCMD path not configured" };
    }

    const running = await this.isServerRunning();
    if (running) {
      return { success: false, message: "Stop the server before updating" };
    }

    const installDir = this.def.dir.replace(/\//g, "\\");
    const appId = this.def.steamAppId || STEAM_APP_ID;

    this.addLog("[Dashboard] Starting SteamCMD update...");

    try {
      const output = await execAsync(
        `"${steamCmd}" +force_install_dir "${installDir}" +login anonymous +app_update ${appId} validate +quit`,
        600000 // 10 minute timeout — Enshrouded server is multi-GB
      );
      this.addLog(`[Dashboard] Update complete: ${output.slice(-200)}`);
      return { success: true, message: "Update complete" };
    } catch (e) {
      const msg = (e as Error).message;
      this.addLog(`[Dashboard] Update failed: ${msg}`);
      return { success: false, message: msg };
    }
  }

  // ---- Backups ----

  async getBackups(): Promise<{ hourly: unknown[]; daily: unknown[] }> {
    const backups: { hourly: unknown[]; daily: unknown[] } = { hourly: [], daily: [] };

    for (const type of ["hourly", "daily"] as const) {
      const dir = path.join(this.def.dir, "..", "backups", "enshrouded", type);
      try {
        const files = fs.readdirSync(dir).filter((f) => f.endsWith(".zip"));
        backups[type] = files
          .map((f) => {
            const stat = fs.statSync(path.join(dir, f));
            return {
              name: f,
              size: formatBytes(stat.size),
              sizeBytes: stat.size,
              date: stat.mtime,
            };
          })
          .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      } catch {
        // dir may not exist
      }
    }

    return backups;
  }

  async runBackup(type: "hourly" | "daily"): Promise<ActionResult> {
    const saveDir = path.join(this.def.dir, SAVEGAME_DIRNAME);
    if (!fs.existsSync(saveDir)) {
      return { success: false, message: "No save data found" };
    }

    const backupDir = path.join(this.def.dir, "..", "backups", "enshrouded", type);
    fs.mkdirSync(backupDir, { recursive: true });

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const backupName = `enshrouded-${timestamp}.zip`;
    const backupPath = path.join(backupDir, backupName);

    try {
      const escapePs = (value: string) => value.replace(/'/g, "''");
      const paths = [saveDir];
      if (fs.existsSync(this.configPath)) paths.push(this.configPath);

      const pathArray = paths.map((p) => `'${escapePs(p)}'`).join(",");
      const cmd = `powershell -NoProfile -Command "Compress-Archive -Path @(${pathArray}) -DestinationPath '${escapePs(backupPath)}' -Force"`;
      await execAsync(cmd, 120000);

      this.addLog(`[Dashboard] Backup created: ${backupName}`);
      return { success: true, message: `Backup created: ${backupName}` };
    } catch (e) {
      return { success: false, message: (e as Error).message };
    }
  }
}
