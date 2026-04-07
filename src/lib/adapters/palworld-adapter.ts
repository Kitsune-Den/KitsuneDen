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
const PROCESS_NAME = "PalServer-Win64-Shipping-Cmd.exe";

// Persist state across Next.js HMR reloads
const globalForPalworld = globalThis as unknown as {
  __palworldStates?: Record<string, PalworldState>;
};
if (!globalForPalworld.__palworldStates) {
  globalForPalworld.__palworldStates = {};
}

interface PalworldState {
  status: ServerStatus;
  logs: string[];
  listeners: Set<(line: string) => void>;
  watchingLog: boolean;
  lastLogSize: number;
  currentLogPath: string | null;
}

const states = globalForPalworld.__palworldStates;

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

// ---- PalWorldSettings.ini parser ----

function parseOptionSettings(content: string): Record<string, string> {
  const result: Record<string, string> = {};
  // Find the OptionSettings line: OptionSettings=(Key=Value,Key=Value,...)
  const match = content.match(/OptionSettings=\(([^)]*)\)/);
  if (!match) return result;

  const inner = match[1];
  // Parse key=value pairs — values may contain quoted strings with commas
  let current = "";
  let inQuote = false;
  const pairs: string[] = [];

  for (const ch of inner) {
    if (ch === '"') {
      inQuote = !inQuote;
      current += ch;
    } else if (ch === "," && !inQuote) {
      pairs.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  if (current.trim()) pairs.push(current.trim());

  for (const pair of pairs) {
    const eqIdx = pair.indexOf("=");
    if (eqIdx === -1) continue;
    const key = pair.substring(0, eqIdx);
    let value = pair.substring(eqIdx + 1);
    // Strip surrounding quotes
    if (value.startsWith('"') && value.endsWith('"')) {
      value = value.slice(1, -1);
    }
    result[key] = value;
  }

  return result;
}

function serializeOptionSettings(settings: Record<string, string>): string {
  const pairs = Object.entries(settings).map(([key, value]) => {
    // Quote string values that contain special characters or are known string fields
    if (typeof value === "string" && /[,() ]/.test(value)) {
      return `${key}="${value}"`;
    }
    return `${key}=${value}`;
  });
  return `[/Script/Pal.PalGameWorldSettings]\nOptionSettings=(${pairs.join(",")})`;
}

export class PalworldAdapter implements ServerAdapter {
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
    hasRestApi: true,
    hasSteamUpdate: true,
    hasLauncherUpdate: false,
  };

  constructor(def: ServerDefinition) {
    this.def = def;
    this.initLogWatcher();
  }

  private getState(): PalworldState {
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
    return path.join(this.def.dir, "Pal", "Saved", "Logs");
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

      // Read last 50 lines initially
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
          // Log file was truncated/rotated — re-read from start
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

    // Look for start script or launch the exe directly
    const batPath = path.join(this.def.dir, this.def.startScript || "start_palworld.bat");
    const workDir = this.def.dir.replace(/\//g, "\\");

    let cmd: string;
    if (fs.existsSync(batPath)) {
      cmd = `powershell -NoProfile -Command "Start-Process cmd.exe -ArgumentList '/c','${batPath.replace(/\//g, "\\")}' -WorkingDirectory '${workDir}'"`;
    } else {
      // Launch the exe directly
      const exePath = path.join(this.def.dir, PROCESS_NAME).replace(/\//g, "\\");
      cmd = `powershell -NoProfile -Command "Start-Process '${exePath}' -ArgumentList '-useperfthreads','-NoAsyncLoadingThread','-UseMultithreadForDS','-EpicApp=PalServer' -WorkingDirectory '${workDir}'"`;
    }

    try {
      await execAsync(cmd);
      const state = this.getState();
      state.status = "starting";
      this.addLog("[Dashboard] Starting Palworld server...");

      // Re-init log watcher for new log file after a brief delay
      setTimeout(() => {
        const s = this.getState();
        s.watchingLog = false;
        this.initLogWatcher();
      }, 5000);

      // Poll for running status
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
        this.addLog("[Dashboard] Palworld server is now running.");
        return;
      }
    }
    // If we never detected it running after 2 minutes, mark as stopped
    if (state.status === "starting") {
      state.status = "stopped";
      this.addLog("[Dashboard] Server failed to start within timeout.");
    }
  }

  async stop(): Promise<ActionResult> {
    const state = this.getState();

    // Try graceful RCON shutdown first
    try {
      await this.sendRconCommand("Shutdown 5 Server_shutting_down");
      state.status = "stopping";
      this.addLog("[Dashboard] Sent shutdown command, waiting for graceful stop...");

      // Wait for process to exit
      for (let i = 0; i < STOP_TIMEOUT_MS / 2000; i++) {
        await new Promise((r) => setTimeout(r, 2000));
        if (!(await this.isServerRunning())) {
          state.status = "stopped";
          return { success: true, message: "Server stopped gracefully" };
        }
      }
    } catch {
      // RCON not available, fall through to force kill
    }

    // Force kill
    try {
      await this.terminateProcess();
      state.status = "stopped";
      this.addLog("[Dashboard] Palworld server terminated.");
      return { success: true, message: "Server stopped" };
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

  sendCommand(cmd: string): ActionResult {
    // Fire-and-forget RCON command
    this.sendRconCommand(cmd).catch(() => {});
    return { success: true, message: `Sent: ${cmd}` };
  }

  // ---- RCON ----

  private async sendRconCommand(command: string): Promise<string> {
    const { Rcon } = await import("rcon-client");
    const rcon = await Rcon.connect({
      host: "127.0.0.1",
      port: this.def.rconPort || 25575,
      password: this.def.rconPassword || this.getAdminPassword(),
    });
    try {
      const response = await rcon.send(command);
      return response;
    } finally {
      rcon.end();
    }
  }

  private getAdminPassword(): string {
    // Read from PalWorldSettings.ini
    const settings = this.readSettings();
    return settings["AdminPassword"] || "";
  }

  // ---- REST API ----

  private get restApiBase(): string {
    const port = this.def.restApiPort || 8212;
    return `http://127.0.0.1:${port}`;
  }

  private get restApiAuth(): string {
    const password = this.def.restApiPassword || this.getAdminPassword();
    return Buffer.from(`admin:${password}`).toString("base64");
  }

  async restApiGet(endpoint: string): Promise<unknown> {
    const response = await fetch(`${this.restApiBase}${endpoint}`, {
      headers: { Authorization: `Basic ${this.restApiAuth}` },
    });
    if (!response.ok) throw new Error(`REST API error: ${response.status}`);
    return response.json();
  }

  async restApiPost(endpoint: string, body?: unknown): Promise<unknown> {
    const response = await fetch(`${this.restApiBase}${endpoint}`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${this.restApiAuth}`,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!response.ok) throw new Error(`REST API error: ${response.status}`);
    const text = await response.text();
    return text ? JSON.parse(text) : {};
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

    // Update status based on process detection
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

  // ---- Config (PalWorldSettings.ini) ----

  private get settingsPath(): string {
    return path.join(this.def.dir, "Pal", "Saved", "Config", "WindowsServer", "PalWorldSettings.ini");
  }

  private get defaultSettingsPath(): string {
    return path.join(this.def.dir, "DefaultPalWorldSettings.ini");
  }

  private readSettings(): Record<string, string> {
    try {
      const content = fs.readFileSync(this.settingsPath, "utf8");
      return parseOptionSettings(content);
    } catch {
      return {};
    }
  }

  async getConfig(): Promise<Record<string, unknown>> {
    const settings = this.readSettings();
    // Return as a structured object for the config editor
    return settings as Record<string, unknown>;
  }

  async saveConfig(config: Record<string, unknown>): Promise<ActionResult> {
    try {
      // Backup current settings
      if (fs.existsSync(this.settingsPath)) {
        const current = fs.readFileSync(this.settingsPath, "utf8");
        fs.writeFileSync(this.settingsPath + ".bak", current);
      }

      // Convert back to INI format
      const settings: Record<string, string> = {};
      for (const [key, value] of Object.entries(config)) {
        settings[key] = String(value);
      }

      const content = serializeOptionSettings(settings);

      // Ensure directory exists
      const dir = path.dirname(this.settingsPath);
      fs.mkdirSync(dir, { recursive: true });

      fs.writeFileSync(this.settingsPath, content);
      return { success: true, message: "Config saved. Restart the server for changes to take effect." };
    } catch (e) {
      return { success: false, message: (e as Error).message };
    }
  }

  // ---- Admin Whitelist ----

  private get adminsPath(): string {
    return path.join(this.def.dir, "palworld-admins.json");
  }

  getAdmins(): string[] {
    try {
      const raw = fs.readFileSync(this.adminsPath, "utf8");
      const data = JSON.parse(raw);
      return Array.isArray(data.admins) ? data.admins : [];
    } catch {
      return [];
    }
  }

  addAdmin(steamId: string): ActionResult {
    const admins = this.getAdmins();
    if (admins.includes(steamId)) {
      return { success: false, message: "Already an admin" };
    }
    admins.push(steamId);
    fs.writeFileSync(this.adminsPath, JSON.stringify({ admins }, null, 2));
    return { success: true, message: "Admin added" };
  }

  removeAdmin(steamId: string): ActionResult {
    const admins = this.getAdmins().filter((id) => id !== steamId);
    fs.writeFileSync(this.adminsPath, JSON.stringify({ admins }, null, 2));
    return { success: true, message: "Admin removed" };
  }

  // ---- Players ----

  async getPlayers(): Promise<PlayerData> {
    const players: PlayerEntry[] = [];
    const admins = this.getAdmins();

    // Try RCON ShowPlayers
    try {
      const response = await this.sendRconCommand("ShowPlayers");
      // Response format: name,playeruid,steamid\n...
      const lines = response.split("\n").filter((l) => l.trim() && !l.startsWith("name,"));
      for (const line of lines) {
        const parts = line.split(",");
        if (parts.length >= 3) {
          const steamId = parts[2].trim();
          const isAdmin = admins.includes(steamId);
          players.push({
            uuid: steamId,
            name: parts[0].trim(),
            groups: isAdmin ? ["Online", "Admin"] : ["Online"],
            isOp: isAdmin,
          });
        }
      }
    } catch {
      // RCON not available — try REST API
      try {
        const data = await this.restApiGet("/v1/api/players") as { players?: Array<{ name: string; playerId: string; userId: string }> };
        if (data?.players) {
          for (const p of data.players) {
            const steamId = p.userId || p.playerId;
            const isAdmin = admins.includes(steamId);
            players.push({
              uuid: steamId,
              name: p.name,
              groups: isAdmin ? ["Online", "Admin"] : ["Online"],
              isOp: isAdmin,
            });
          }
        }
      } catch {
        // Neither RCON nor REST API available
      }
    }

    // Read ban list
    let bans: string[] = [];
    const banListPath = path.join(this.def.dir, "Pal", "Saved", "SaveGames", "banlist.txt");
    try {
      const content = fs.readFileSync(banListPath, "utf8");
      bans = content.split("\n").filter((l) => l.trim());
    } catch {
      // No ban list
    }

    return { players, whitelist: null, bans };
  }

  // ---- Memory ----

  getMemoryConfig(): DashboardConfig {
    // Palworld doesn't use JVM, but we can track process memory
    return { minMemoryGB: 0, maxMemoryGB: 16 };
  }

  saveMemoryConfig(_config: DashboardConfig): void {
    // Palworld memory is not configurable via dashboard
  }

  // ---- Palworld-specific methods ----

  async saveWorld(): Promise<ActionResult> {
    try {
      await this.sendRconCommand("Save");
      return { success: true, message: "World saved" };
    } catch {
      try {
        await this.restApiPost("/v1/api/save");
        return { success: true, message: "World saved via REST API" };
      } catch (e) {
        return { success: false, message: (e as Error).message };
      }
    }
  }

  async broadcast(message: string): Promise<ActionResult> {
    try {
      await this.sendRconCommand(`Broadcast ${message}`);
      return { success: true, message: "Broadcast sent" };
    } catch (e) {
      return { success: false, message: (e as Error).message };
    }
  }

  async kickPlayer(steamId: string): Promise<ActionResult> {
    try {
      await this.sendRconCommand(`KickPlayer ${steamId}`);
      return { success: true, message: `Kicked player ${steamId}` };
    } catch (e) {
      return { success: false, message: (e as Error).message };
    }
  }

  async banPlayer(steamId: string): Promise<ActionResult> {
    try {
      await this.sendRconCommand(`BanPlayer ${steamId}`);
      return { success: true, message: `Banned player ${steamId}` };
    } catch (e) {
      return { success: false, message: (e as Error).message };
    }
  }

  async getServerInfo(): Promise<Record<string, unknown>> {
    const running = await this.isServerRunning();
    const proc = running ? await this.getServerProcess() : null;
    const settings = this.readSettings();

    let serverVersion = "Unknown";
    try {
      const info = await this.sendRconCommand("Info");
      const vMatch = info.match(/\[v([\d.]+)\]/);
      if (vMatch) serverVersion = vMatch[1];
    } catch {
      // Try to get version from REST API
      try {
        const data = await this.restApiGet("/v1/api/info") as { version?: string };
        if (data?.version) serverVersion = data.version;
      } catch {
        // Can't determine version
      }
    }

    return {
      running,
      serverName: settings["ServerName"] || "Palworld Server",
      description: settings["ServerDescription"] || "",
      maxPlayers: parseInt(settings["ServerPlayerMaxNum"] || "32"),
      gamePort: this.def.gamePort || 8211,
      rconPort: this.def.rconPort || 25575,
      serverVersion,
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
    const appId = this.def.steamAppId || 2394010;

    this.addLog("[Dashboard] Starting SteamCMD update...");

    try {
      const output = await execAsync(
        `"${steamCmd}" +force_install_dir "${installDir}" +login anonymous +app_update ${appId} validate +quit`,
        300000 // 5 minute timeout
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
      // Store backups alongside the server at the project level
      const dir = path.join(this.def.dir, "..", "backups", "palworld", type);
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
    // Save the world first if server is running
    if (await this.isServerRunning()) {
      try {
        await this.sendRconCommand("Save");
        await new Promise((r) => setTimeout(r, 3000)); // Wait for save to complete
      } catch {
        // Continue with backup even if save command fails
      }
    }

    const saveGamesDir = path.join(this.def.dir, "Pal", "Saved", "SaveGames");
    if (!fs.existsSync(saveGamesDir)) {
      return { success: false, message: "No save data found" };
    }

    const backupDir = path.join(this.def.dir, "..", "backups", "palworld", type);
    fs.mkdirSync(backupDir, { recursive: true });

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const backupName = `palworld-${timestamp}.zip`;
    const backupPath = path.join(backupDir, backupName);

    try {
      const escapePs = (value: string) => value.replace(/'/g, "''");
      const settingsBackup = this.settingsPath;
      const paths = [saveGamesDir];
      if (fs.existsSync(settingsBackup)) paths.push(settingsBackup);

      const pathArray = paths.map((p) => `'${escapePs(p)}'`).join(",");
      const cmd = `powershell -NoProfile -Command "Compress-Archive -Path @(${pathArray}) -DestinationPath '${escapePs(backupPath)}' -Force"`;
      await execAsync(cmd, 120000);

      this.addLog(`[Dashboard] Backup created: ${backupName}`);
      return { success: true, message: `Backup created: ${backupName}` };
    } catch (e) {
      return { success: false, message: (e as Error).message };
    }
  }

  // ---- Initial config setup helper ----

  async ensureConfig(): Promise<void> {
    if (fs.existsSync(this.settingsPath)) return;

    // Copy from DefaultPalWorldSettings.ini
    if (fs.existsSync(this.defaultSettingsPath)) {
      const content = fs.readFileSync(this.defaultSettingsPath, "utf8");
      const settings = parseOptionSettings(content);

      // Set sensible defaults
      settings["ServerName"] = '"Kitsune Den - Palworld"';
      settings["RCONEnabled"] = "True";
      settings["RCONPort"] = String(this.def.rconPort || 25575);
      settings["RESTAPIEnabled"] = "True";
      settings["RESTAPIPort"] = String(this.def.restApiPort || 8212);
      settings["PublicPort"] = String(this.def.gamePort || 8211);

      const dir = path.dirname(this.settingsPath);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(this.settingsPath, serializeOptionSettings(settings));
    }
  }
}
