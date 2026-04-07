import { ChildProcess, spawn } from "child_process";
import fs from "fs";
import path from "path";
import os from "os";
import type {
  ServerAdapter,
  ServerDefinition,
  ServerCapabilities,
  ServerStatus,
  ServerState,
  ActionResult,
  DashboardConfig,
  ServerStats,
  PlayerData,
  PlayerEntry,
} from "./types";

const MAX_LOG_LINES = 2000;

// Persist state across HMR
const globalForMc = globalThis as unknown as {
  __mcStates?: Record<string, ServerState>;
};
if (!globalForMc.__mcStates) {
  globalForMc.__mcStates = {};
}
const states = globalForMc.__mcStates;

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

export class MinecraftAdapter implements ServerAdapter {
  readonly def: ServerDefinition;
  readonly capabilities: ServerCapabilities = {
    hasRcon: true,
    hasMods: true,
    hasModPacks: true,
    hasBackups: false,
    hasWorlds: false,
    hasWarps: false,
    hasServerProperties: true,
    hasJsonConfig: false,
    hasKitsuneCommand: false,
    hasRestApi: false,
    hasSteamUpdate: false,
    hasLauncherUpdate: false,
  };

  constructor(def: ServerDefinition) {
    this.def = def;
  }

  private getState(): ServerState {
    if (!states[this.def.id]) {
      states[this.def.id] = {
        process: null,
        status: "stopped",
        logs: [],
        listeners: new Set(),
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

  private configPath(): string {
    return path.join(this.def.dir, "dashboard-config.json");
  }

  getStatus(): ServerStatus {
    return this.getState().status;
  }

  async start(): Promise<ActionResult> {
    const state = this.getState();
    if (state.process && state.status !== "stopped") {
      return { success: false, message: `Server is already ${state.status}` };
    }

    state.status = "starting";
    state.logs = [];

    const config = this.getMemoryConfig();
    const javaCmd = this.def.javaPath || "java";
    this.addLog(`[Dashboard] Starting ${this.def.name} server (${config.minMemoryGB}G min / ${config.maxMemoryGB}G max)...`);
    this.addLog(`[Dashboard] Java: ${javaCmd}`);
    this.addLog(`[Dashboard] Dir: ${this.def.dir}`);

    let proc: ChildProcess;

    try {
      if (this.def.launchMode === "argfile" && this.def.argFiles) {
        // NeoForge-style: java @user_jvm_args.txt @win_args.txt nogui
        const userArgsPath = path.join(this.def.dir, "user_jvm_args.txt");
        const userArgsContent = [
          "# Auto-managed by Kitsune Den dashboard",
          `-Xmx${config.maxMemoryGB}G`,
          `-Xms${config.minMemoryGB}G`,
          "-XX:+UseG1GC",
          "-XX:+ParallelRefProcEnabled",
          "-XX:MaxGCPauseMillis=200",
          "-XX:+UnlockExperimentalVMOptions",
          "-XX:+DisableExplicitGC",
          "-XX:+AlwaysPreTouch",
        ].join("\n");
        fs.writeFileSync(userArgsPath, userArgsContent, "utf-8");

        const javaArgs = this.def.argFiles.map((f) => `@${f}`);
        javaArgs.push("nogui");
        this.addLog(`[Dashboard] Args: ${javaArgs.join(" ")}`);

        proc = spawn(javaCmd, javaArgs, {
          cwd: this.def.dir,
          stdio: ["pipe", "pipe", "pipe"],
        });
      } else {
        // Fabric-style: java -jar server.jar nogui
        const javaArgs = [
          `-Xmx${config.maxMemoryGB}G`,
          `-Xms${config.minMemoryGB}G`,
          "-XX:+UseG1GC",
          "-XX:+ParallelRefProcEnabled",
          "-XX:MaxGCPauseMillis=200",
          "-XX:+UnlockExperimentalVMOptions",
          "-XX:+DisableExplicitGC",
          "-XX:+AlwaysPreTouch",
          "-XX:G1NewSizePercent=30",
          "-XX:G1MaxNewSizePercent=40",
          "-XX:G1HeapRegionSize=8M",
          "-XX:G1ReservePercent=20",
          "-XX:G1HeapWastePercent=5",
          "-XX:G1MixedGCCountTarget=4",
          "-XX:InitiatingHeapOccupancyPercent=15",
          "-XX:G1MixedGCLiveThresholdPercent=90",
          "-XX:G1RSetUpdatingPauseTimePercent=5",
          "-XX:SurvivorRatio=32",
          "-XX:+PerfDisableSharedMem",
          "-XX:MaxTenuringThreshold=1",
          "-jar",
          this.def.jar || "server.jar",
          "nogui",
        ];

        proc = spawn(javaCmd, javaArgs, {
          cwd: this.def.dir,
          stdio: ["pipe", "pipe", "pipe"],
        });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.addLog(`[Dashboard] SPAWN ERROR: ${msg}`);
      state.status = "stopped";
      return { success: false, message: `Spawn failed: ${msg}` };
    }

    state.process = proc;

    proc.stdout?.on("data", (data: Buffer) => {
      const lines = data.toString().split("\n").filter(Boolean);
      lines.forEach((line) => {
        this.addLog(line);
        if (line.includes("Done (") && line.includes("! For help,")) {
          state.status = "running";
        }
      });
    });

    proc.stderr?.on("data", (data: Buffer) => {
      const lines = data.toString().split("\n").filter(Boolean);
      lines.forEach((line) => this.addLog(`[STDERR] ${line}`));
    });

    proc.on("close", (code) => {
      this.addLog(`[Dashboard] Server process exited with code ${code}`);
      state.status = "stopped";
      state.process = null;
    });

    proc.on("error", (err) => {
      this.addLog(`[Dashboard] Failed to start server: ${err.message}`);
      state.status = "stopped";
      state.process = null;
    });

    return { success: true, message: "Server starting..." };
  }

  async stop(): Promise<ActionResult> {
    const state = this.getState();
    if (!state.process || state.status === "stopped") {
      return { success: false, message: "Server is not running" };
    }

    state.status = "stopping";
    this.addLog("[Dashboard] Stopping server...");

    state.process.stdin?.write("stop\n");

    const killTimer = setTimeout(() => {
      if (state.process) {
        this.addLog("[Dashboard] Force killing server (timeout)...");
        state.process.kill("SIGKILL");
      }
    }, 30000);

    state.process.on("close", () => {
      clearTimeout(killTimer);
    });

    return { success: true, message: "Server stopping..." };
  }

  async restart(): Promise<ActionResult> {
    const state = this.getState();
    if (state.status === "running") {
      const stopResult = await this.stop();
      if (stopResult.success) {
        await new Promise((resolve) => setTimeout(resolve, 5000));
        return this.start();
      }
      return stopResult;
    }
    return this.start();
  }

  sendCommand(cmd: string): ActionResult {
    const state = this.getState();
    if (!state.process || state.status !== "running") {
      return { success: false, message: "Server is not running" };
    }
    state.process.stdin?.write(`${cmd}\n`);
    this.addLog(`[Console] > ${cmd}`);
    return { success: true, message: "Command sent" };
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
    const state = this.getState();
    const pid = state.process?.pid ?? null;
    let memBytes = 0;

    if (pid) {
      try {
        const proc = await import("child_process");
        const result = await new Promise<string>((resolve) => {
          proc.exec(
            `powershell -NoProfile -Command "(Get-Process -Id ${pid} -ErrorAction SilentlyContinue).WorkingSet64"`,
            { timeout: 5000 },
            (err, stdout) => resolve(err ? "0" : stdout.trim())
          );
        });
        memBytes = parseInt(result) || 0;
      } catch {
        // ignore
      }
    }

    return {
      process: pid
        ? {
            pid,
            memory: formatBytes(memBytes),
            memoryBytes: memBytes,
            upSince: null,
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
    const propsPath = path.join(this.def.dir, "server.properties");
    try {
      const content = fs.readFileSync(propsPath, "utf-8");
      const props: Record<string, unknown> = {};
      for (const line of content.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const eqIndex = trimmed.indexOf("=");
        if (eqIndex === -1) continue;
        const key = trimmed.substring(0, eqIndex);
        const value = trimmed.substring(eqIndex + 1);
        props[key] = value;
      }
      return props;
    } catch {
      return {};
    }
  }

  async saveConfig(config: Record<string, unknown>): Promise<ActionResult> {
    const propsPath = path.join(this.def.dir, "server.properties");
    try {
      // Backup
      const current = fs.readFileSync(propsPath, "utf-8");
      fs.writeFileSync(propsPath + ".bak", current);

      // Reconstruct preserving comments
      const lines = current.split("\n");
      const newLines = lines.map((line) => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) return line;
        const eqIndex = trimmed.indexOf("=");
        if (eqIndex === -1) return line;
        const key = trimmed.substring(0, eqIndex);
        if (key in config) {
          return `${key}=${config[key]}`;
        }
        return line;
      });
      fs.writeFileSync(propsPath, newLines.join("\n"));
      return { success: true, message: "Config saved" };
    } catch (e) {
      return { success: false, message: (e as Error).message };
    }
  }

  async getPlayers(): Promise<PlayerData> {
    // Minecraft uses whitelist.json / ops.json
    const opsPath = path.join(this.def.dir, "ops.json");
    const wlPath = path.join(this.def.dir, "whitelist.json");
    const bannedPath = path.join(this.def.dir, "banned-players.json");

    const readJson = (p: string) => {
      try {
        return JSON.parse(fs.readFileSync(p, "utf-8"));
      } catch {
        return [];
      }
    };

    const ops = readJson(opsPath);
    const whitelist = readJson(wlPath);
    const banned = readJson(bannedPath);

    // Merge into unified player list
    const playerMap = new Map<string, PlayerEntry>();

    for (const p of whitelist) {
      playerMap.set(p.uuid, {
        uuid: p.uuid,
        name: p.name,
        groups: ["Whitelisted"],
        isOp: false,
      });
    }

    for (const p of ops) {
      const existing = playerMap.get(p.uuid);
      if (existing) {
        existing.isOp = true;
        existing.groups.push("OP");
      } else {
        playerMap.set(p.uuid, {
          uuid: p.uuid,
          name: p.name,
          groups: ["OP"],
          isOp: true,
        });
      }
    }

    return {
      players: Array.from(playerMap.values()),
      whitelist,
      bans: banned,
    };
  }

  getMemoryConfig(): DashboardConfig {
    try {
      const content = fs.readFileSync(this.configPath(), "utf-8");
      return JSON.parse(content);
    } catch {
      return { minMemoryGB: 2, maxMemoryGB: 4 };
    }
  }

  saveMemoryConfig(config: DashboardConfig): void {
    fs.writeFileSync(this.configPath(), JSON.stringify(config, null, 2), "utf-8");
  }
}
