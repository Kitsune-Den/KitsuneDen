import { ChildProcess, spawn } from "child_process";
import fs from "fs";
import path from "path";
import os from "os";
import { execRemotePowerShell } from "../remote-exec";
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

/**
 * Parse the response from Minecraft's RCON `list` command.
 *
 * Vanilla / NeoForge: "There are 2 of a max of 20 players online: Alice, Bob"
 * Empty: "There are 0 of a max of 20 players online: " (note trailing space)
 * Some mods prefix tags; we accept anything before the first ":" and split on
 * commas. Empty-string entries (from "online: " with no names) are dropped.
 * Exported so tests can pin the regex+split logic without standing up RCON.
 */
export function parseMinecraftListResponse(raw: string): string[] {
  if (!raw) return [];
  const colon = raw.indexOf(":");
  if (colon < 0) return [];
  return raw
    .slice(colon + 1)
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

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

    // Remote MC: route through SSH lifecycle when configured, refuse otherwise.
    if (this.def.lifecycle?.kind === "ssh") {
      const lc = this.def.lifecycle;
      // DO NOT set state.status = "starting" here. The local-spawn path
      // transitions stopped → starting → running based on the child
      // process's "Done (X.Xs)" stdout line; we monitor stdout to flip it.
      // SSH dispatch has no stdout to watch — the server boots out-of-band
      // on the remote host. If we set "starting" here, resolveServerStatus
      // returns it directly (transitional states win over reachability),
      // so the dashboard would be permanently stuck on "starting" even
      // after the server's ports come up. Leaving status as "stopped"
      // lets the reachability probe flip it to "running" within ~5s of
      // the port actually binding, which is the signal we care about.
      this.addLog(`[Dashboard] Starting ${this.def.name} via SSH on ${lc.host} as ${lc.user}...`);
      const result = await execRemotePowerShell(
        { host: lc.host, port: lc.port, user: lc.user, identityFile: lc.identityFile },
        lc.startCommand
      );
      if (result.stdout.trim()) this.addLog(`[ssh stdout] ${result.stdout.trim()}`);
      if (result.stderr.trim()) this.addLog(`[ssh stderr] ${result.stderr.trim()}`);
      if (!result.ok) {
        const msg = `SSH start command failed (exit ${result.exitCode}). See log for details.`;
        this.addLog(`[Dashboard] ${msg}`);
        return { success: false, message: msg };
      }
      this.addLog("[Dashboard] Start command dispatched. Server will be reachable when boot completes (30-180s for modded NeoForge).");
      return { success: true, message: "Start command dispatched via SSH; the reachability probe will flag it running once it binds." };
    }
    if (this.def.rconHost) {
      const msg = `Cannot start a remote MC server (rconHost=${this.def.rconHost}). Configure a lifecycle block in servers.json or start it on the host directly.`;
      this.addLog(`[Dashboard] ${msg}`);
      return { success: false, message: msg };
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
    // Remote servers: send `stop` over RCON. We don't own the process,
    // so there's no stdin to write to or PID to kill. RCON `stop` is the
    // graceful shutdown command Minecraft itself uses.
    if (this.def.rconHost) {
      this.addLog(`[Dashboard] Sending RCON 'stop' to ${this.def.rconHost}...`);
      try {
        await this.sendRconCommand("stop");
        const msg = "Stop command sent via RCON. The server will save and shut down on its host.";
        this.addLog(`[Dashboard] ${msg}`);
        return { success: true, message: msg };
      } catch (e) {
        const msg = `RCON stop failed: ${(e as Error).message}`;
        this.addLog(`[Dashboard] ${msg}`);
        return { success: false, message: msg };
      }
    }

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
    // Remote MC with SSH lifecycle: RCON-stop → wait for the gameport to
    // actually go down → SSH-start. The wait matters because Start-Process
    // run.bat will silently fail to bind ports if the previous JVM is
    // still on them (the bug that bit us during Ragnarok's manual restart).
    if (this.def.lifecycle?.kind === "ssh") {
      this.addLog("[Dashboard] Remote restart: stopping via RCON, then starting via SSH.");
      const stopResult = await this.stop();
      if (!stopResult.success) {
        // If we can't even reach RCON, try the SSH path directly. Maybe
        // the server is already down and we just need to relaunch.
        this.addLog(`[Dashboard] RCON stop failed (${stopResult.message}); proceeding to SSH start anyway.`);
      } else {
        // Give the JVM time to actually exit and release ports. NeoForge
        // takes 10-30s to save chunks and shut down cleanly.
        await new Promise((resolve) => setTimeout(resolve, 15_000));
      }
      return this.start();
    }
    if (this.def.rconHost) {
      const msg = `Cannot restart a remote MC server (rconHost=${this.def.rconHost}) — the dashboard can stop it via RCON but can't bring it back up. Configure a lifecycle block in servers.json or use Stop and start it again on the host.`;
      this.addLog(`[Dashboard] ${msg}`);
      return { success: false, message: msg };
    }

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

  /**
   * RCON `list` over the wire. Quiet failures (RCON disabled, server down, wrong
   * password) all collapse to "no online players known" — getPlayers() still
   * returns the static roster so the UI keeps working when the server is off.
   */
  private async sendRconCommand(command: string): Promise<string> {
    const { Rcon } = await import("rcon-client");
    // Honor rconHost when set, so the dashboard can manage an MC server
    // on a LAN/tailnet peer. Default loopback preserves the all-local shape.
    const rcon = await Rcon.connect({
      host: this.def.rconHost || "127.0.0.1",
      port: this.def.rconPort || 25575,
      password: this.def.rconPassword || "",
    });
    try {
      return await rcon.send(command);
    } finally {
      rcon.end();
    }
  }

  async getPlayers(): Promise<PlayerData> {
    // Minecraft uses whitelist.json / ops.json for the durable roster, plus an
    // RCON `list` for who's online RIGHT NOW (the rosters say nothing about
    // a guest who just joined an open server).
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

    // Online list: ask RCON. Don't let RCON errors poison the roster response —
    // an offline server should still show whitelist/ops so the UI is editable.
    let onlineNames: string[] = [];
    try {
      const response = await this.sendRconCommand("list");
      onlineNames = parseMinecraftListResponse(response);
    } catch {
      onlineNames = [];
    }
    const onlineLower = new Set(onlineNames.map((n) => n.toLowerCase()));

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

    // Stamp "Online" on roster entries currently in the game.
    for (const entry of playerMap.values()) {
      if (entry.name && onlineLower.has(entry.name.toLowerCase())) {
        entry.groups.unshift("Online");
      }
    }

    // Surface guests — players online but not in any roster file. Without UUID
    // (RCON `list` is name-only) we use the name as the map key + entry uuid;
    // the UI's roster-mutation actions resolve the UUID via usercache.json
    // server-side, so name-only is enough for "show me who's on right now."
    const rosterNames = new Set(
      Array.from(playerMap.values())
        .map((p) => p.name?.toLowerCase())
        .filter(Boolean) as string[]
    );
    for (const name of onlineNames) {
      if (!rosterNames.has(name.toLowerCase())) {
        playerMap.set(`online:${name}`, {
          uuid: "",
          name,
          groups: ["Online"],
          isOp: false,
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
