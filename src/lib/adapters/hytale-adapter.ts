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

// Persist state across HMR
const globalForHytale = globalThis as unknown as {
  __hytaleStates?: Record<string, HytaleState>;
};
if (!globalForHytale.__hytaleStates) {
  globalForHytale.__hytaleStates = {};
}

interface HytaleState {
  logs: string[];
  listeners: Set<(line: string) => void>;
  watchingLog: boolean;
  lastLogSize: number;
}

const states = globalForHytale.__hytaleStates;

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

function readJsonFile(filePath: string): Record<string, unknown> | null {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function execAsync(cmd: string, timeout = 8000): Promise<string> {
  return new Promise((resolve, reject) => {
    exec(cmd, { timeout }, (err, stdout) => {
      if (err) return reject(err);
      resolve(stdout.trim());
    });
  });
}

export class HytaleAdapter implements ServerAdapter {
  readonly def: ServerDefinition;
  readonly capabilities: ServerCapabilities = {
    hasRcon: false,
    hasMods: true,
    hasModPacks: false,
    hasBackups: true,
    hasWorlds: true,
    hasWarps: true,
    hasServerProperties: false,
    hasJsonConfig: true,
  };

  constructor(def: ServerDefinition) {
    this.def = def;
    this.initLogWatcher();
  }

  private getState(): HytaleState {
    if (!states[this.def.id]) {
      states[this.def.id] = {
        logs: [],
        listeners: new Set(),
        watchingLog: false,
        lastLogSize: 0,
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

  private initLogWatcher() {
    const state = this.getState();
    if (state.watchingLog) return;

    const logsDir = path.join(this.def.dir, "logs");
    try {
      const logs = fs.readdirSync(logsDir)
        .filter((f) => f.endsWith(".log"))
        .sort()
        .reverse();
      if (logs.length === 0) return;

      const logPath = path.join(logsDir, logs[0]);
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
        }
      });

      state.watchingLog = true;
    } catch {
      // Logs dir may not exist yet
    }
  }

  private get processFilter(): string {
    return this.def.processFilter || "HytaleServer";
  }

  private async isServerRunning(): Promise<boolean> {
    try {
      const result = await execAsync(
        `powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \\"Name='java.exe' AND CommandLine LIKE '%${this.processFilter}%'\\" -ErrorAction SilentlyContinue | Select-Object -First 1 ProcessId | ForEach-Object { $_.ProcessId }"`
      );
      return result.length > 0 && /^\d+$/.test(result);
    } catch {
      return false;
    }
  }

  private async getServerProcess(): Promise<{ pid: string; memoryBytes: number; creationDate: string } | null> {
    try {
      const result = await execAsync(
        `powershell -NoProfile -Command "$p = Get-CimInstance Win32_Process -Filter \\"Name='java.exe' AND CommandLine LIKE '%${this.processFilter}%'\\" -ErrorAction SilentlyContinue | Select-Object -First 1; if ($p) { $p.ProcessId.ToString() + '|' + $p.WorkingSetSize.ToString() + '|' + $p.CreationDate.ToString('o') } else { '' }"`
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

  getStatus(): ServerStatus {
    // For Hytale, status is determined by polling the process
    // We return a cached status that gets updated by getStats calls
    return "stopped"; // Will be overridden by real-time check in API routes
  }

  async start(): Promise<ActionResult> {
    const running = await this.isServerRunning();
    if (running) {
      return { success: false, message: "Server is already running" };
    }

    const batPath = path.join(this.def.dir, this.def.startScript || "start.bat").replace(/\//g, "\\");
    const workDir = this.def.dir.replace(/\//g, "\\");
    const cmd = `powershell -NoProfile -Command "Start-Process cmd.exe -ArgumentList '/c','${batPath}' -WorkingDirectory '${workDir}'"`;

    try {
      await execAsync(cmd);
      this.addLog("[Dashboard] Starting Hytale server...");
      return { success: true, message: "Server starting..." };
    } catch (e) {
      return { success: false, message: (e as Error).message };
    }
  }

  async stop(): Promise<ActionResult> {
    try {
      await execAsync(
        `powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \\"Name='java.exe' AND CommandLine LIKE '%${this.processFilter}%'\\" | Invoke-CimMethod -MethodName Terminate"`
      );
      this.addLog("[Dashboard] Stopping Hytale server...");
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

  sendCommand(_cmd: string): ActionResult {
    // Hytale doesn't support stdin commands via this method
    return { success: false, message: "Hytale server does not support direct commands" };
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

  async getStats(): Promise<ServerStats> {
    const proc = await this.getServerProcess();

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

  async getConfig(): Promise<Record<string, unknown>> {
    const config = readJsonFile(path.join(this.def.dir, "config.json"));
    return (config as Record<string, unknown>) || {};
  }

  async saveConfig(config: Record<string, unknown>): Promise<ActionResult> {
    const configPath = path.join(this.def.dir, "config.json");
    try {
      const current = fs.readFileSync(configPath, "utf8");
      fs.writeFileSync(configPath + ".bak", current);
      fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
      return { success: true, message: "Config saved" };
    } catch (e) {
      return { success: false, message: (e as Error).message };
    }
  }

  async getPlayers(): Promise<PlayerData> {
    const permsPath = path.join(this.def.dir, "permissions.json");
    const wlPath = path.join(this.def.dir, "whitelist.json");
    const bansPath = path.join(this.def.dir, "bans.json");

    const perms = readJsonFile(permsPath) as Record<string, unknown> | null;
    const whitelist = readJsonFile(wlPath);
    const bans = readJsonFile(bansPath);

    const players: PlayerEntry[] = [];

    if (perms && perms.users) {
      const users = perms.users as Record<string, { groups?: string[]; name?: string }>;
      for (const [uuid, data] of Object.entries(users)) {
        const groups = data.groups || [];
        // Try to resolve player name from save file
        let name = data.name || null;
        if (!name) {
          name = this.resolvePlayerName(uuid);
        }
        players.push({
          uuid,
          name,
          groups,
          isOp: groups.includes("OP"),
        });
      }
    }

    return { players, whitelist, bans };
  }

  private resolvePlayerName(uuid: string): string | null {
    const playerFile = path.join(this.def.dir, "universe", "players", uuid + ".json");
    try {
      const data = readJsonFile(playerFile) as Record<string, unknown> | null;
      if (!data) return null;
      const components = data.Components as Record<string, unknown> | undefined;
      if (components?.DisplayName) {
        const dn = components.DisplayName as Record<string, unknown>;
        const innerDn = dn.DisplayName as Record<string, unknown> | undefined;
        if (innerDn?.RawText) return innerDn.RawText as string;
      }
      if (components?.Nameplate) {
        const np = components.Nameplate as Record<string, unknown>;
        if (np.Text) return np.Text as string;
      }
    } catch {
      // ignore
    }
    return null;
  }

  getMemoryConfig(): DashboardConfig {
    return { minMemoryGB: 4, maxMemoryGB: 4 };
  }

  saveMemoryConfig(_config: DashboardConfig): void {
    // Hytale memory is configured in the .bat script, not dynamically
  }

  // ---- Hytale-specific methods ----

  async getWorlds(): Promise<{ name: string; config: Record<string, unknown> }[]> {
    const worldsDir = path.join(this.def.dir, "universe", "worlds");
    try {
      const dirs = fs.readdirSync(worldsDir).filter((f) =>
        fs.statSync(path.join(worldsDir, f)).isDirectory()
      );
      return dirs.map((name) => {
        const config = readJsonFile(path.join(worldsDir, name, "config.json"));
        return { name, config: (config as Record<string, unknown>) || {} };
      });
    } catch {
      return [];
    }
  }

  async getWarps(): Promise<unknown[]> {
    const warpsData = readJsonFile(path.join(this.def.dir, "universe", "warps.json"));
    if (warpsData && Array.isArray((warpsData as Record<string, unknown>).Warps)) {
      return (warpsData as Record<string, unknown>).Warps as unknown[];
    }
    return [];
  }

  async getBackups(): Promise<{ hourly: unknown[]; daily: unknown[] }> {
    const backups: { hourly: unknown[]; daily: unknown[] } = { hourly: [], daily: [] };

    for (const type of ["hourly", "daily"] as const) {
      const dir = path.join(this.def.dir, "backups", type);
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
    if (!this.def.backupScript) {
      return { success: false, message: "No backup script configured" };
    }

    const flag = type === "daily" ? "-Daily" : "";
    const scriptPath = path.join(this.def.dir, this.def.backupScript);

    try {
      const output = await execAsync(
        `powershell -ExecutionPolicy Bypass -File "${scriptPath}" ${flag}`,
        60000
      );
      return { success: true, message: output };
    } catch (e) {
      return { success: false, message: (e as Error).message };
    }
  }

  async getServerInfo(): Promise<Record<string, unknown>> {
    const running = await this.isServerRunning();
    const proc = running ? await this.getServerProcess() : null;
    const config = readJsonFile(path.join(this.def.dir, "config.json")) as Record<string, unknown> | null;

    let playerCount = 0;
    const perms = readJsonFile(path.join(this.def.dir, "permissions.json")) as Record<string, unknown> | null;
    if (perms && perms.users) {
      playerCount = Object.keys(perms.users as object).length;
    }

    let worlds: string[] = [];
    const worldsDir = path.join(this.def.dir, "universe", "worlds");
    try {
      worlds = fs.readdirSync(worldsDir).filter((f) =>
        fs.statSync(path.join(worldsDir, f)).isDirectory()
      );
    } catch {
      // ignore
    }

    let serverVersion = "Unknown";
    try {
      const logsDir = path.join(this.def.dir, "logs");
      const logs = fs.readdirSync(logsDir).filter((f) => f.endsWith(".log")).sort().reverse();
      if (logs.length > 0) {
        const logContent = fs.readFileSync(path.join(logsDir, logs[0]), "utf8");
        const versionMatch = logContent.match(/Version:\s*([\w.\-]+)/);
        if (versionMatch) serverVersion = versionMatch[1];
      }
    } catch {
      // ignore
    }

    let mods: string[] = [];
    const modsDir = path.join(this.def.dir, "mods");
    try {
      mods = fs.readdirSync(modsDir).filter((f) =>
        fs.statSync(path.join(modsDir, f)).isDirectory()
      );
    } catch {
      // ignore
    }

    let npcCount = 0;
    const memories = readJsonFile(path.join(this.def.dir, "universe", "memories.json")) as Record<string, unknown> | null;
    if (memories && Array.isArray(memories.Memories)) npcCount = memories.Memories.length;

    return {
      running,
      serverName: config?.ServerName || "Unknown",
      motd: config?.MOTD || "",
      maxPlayers: config?.MaxPlayers || 0,
      registeredPlayers: playerCount,
      worlds,
      defaultWorld: (config?.Defaults as Record<string, unknown>)?.World || "default",
      gameMode: (config?.Defaults as Record<string, unknown>)?.GameMode || "Unknown",
      viewRadius: config?.MaxViewRadius || 0,
      serverVersion,
      mods,
      npcCount,
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
}
