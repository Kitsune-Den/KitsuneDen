import { ChildProcess, spawn, exec } from "child_process";
import net from "net";
import fs from "fs";
import path from "path";
import os from "os";
import { probeReachability } from "./reachability";
import {
  parseServerConfigXml,
  patchServerConfigXml,
  sevenDaysVersionFromLog,
} from "../seven-days-config";
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
  AdminData,
  SevenDaysAdminApi,
} from "./types";

const MAX_LOG_LINES = 2000;
const STOP_TIMEOUT_MS = 30_000;

// Persist state across Next.js HMR reloads
const globalFor7d2d = globalThis as unknown as {
  __7d2dStates?: Record<string, SevenDaysState>;
};
if (!globalFor7d2d.__7d2dStates) {
  globalFor7d2d.__7d2dStates = {};
}

interface SevenDaysState {
  process: ChildProcess | null;
  status: ServerStatus;
  logs: string[];
  listeners: Set<(line: string) => void>;
}

const states = globalFor7d2d.__7d2dStates;

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

// ---- Known-player cache ----

/**
 * The dashboard launches 7D2D with `-logfile logs/7d2d-server.log` and
 * truncates that file on every launch, so the log alone only knows about
 * players from the current session. Players seen in the log are merged into
 * this JSON file (in the server dir) so the Players page remembers everyone
 * who has ever joined.
 */
export const KNOWN_PLAYERS_FILE = "dashboard-known-players.json";

export interface KnownPlayer {
  name: string;
  steamId: string;
  eosId: string;
}

/** Pull every successful auth line out of a 7D2D server log. Later lines win. */
export function parseKnownPlayersFromLog(log: string): KnownPlayer[] {
  const byEos = new Map<string, KnownPlayer>();
  const authRe = /\[Auth\] PlayerName authorization successful:.*?PltfmId='(Steam_\d+)',\s*CrossId='(EOS_[^']+)'.*?PlayerName='([^']+)'/g;
  let m;
  while ((m = authRe.exec(log)) !== null) {
    byEos.set(m[2], { steamId: m[1], eosId: m[2], name: m[3] });
  }
  return Array.from(byEos.values());
}

function readKnownPlayersFile(filePath: string): Map<string, KnownPlayer> {
  const map = new Map<string, KnownPlayer>();
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
    if (Array.isArray(parsed)) {
      for (const p of parsed) {
        if (p && typeof p.eosId === "string" && typeof p.name === "string") {
          map.set(p.eosId, { name: p.name, steamId: String(p.steamId || ""), eosId: p.eosId });
        }
      }
    }
  } catch {
    // missing or corrupt — start fresh
  }
  return map;
}

/**
 * Merge players found in `logFile` into the cache at `cacheFile`, rewrite the
 * cache if anything changed, and return the merged roster. A missing log is
 * fine (the cache alone is returned); a write failure is swallowed so a
 * read-only server dir doesn't break the Players page.
 */
export function syncKnownPlayers(logFile: string, cacheFile: string): Map<string, KnownPlayer> {
  const known = readKnownPlayersFile(cacheFile);
  let log = "";
  try {
    log = fs.readFileSync(logFile, "utf8");
  } catch {
    // log may not exist
  }
  let changed = false;
  for (const p of parseKnownPlayersFromLog(log)) {
    const prev = known.get(p.eosId);
    if (!prev || prev.name !== p.name || prev.steamId !== p.steamId) {
      known.set(p.eosId, p);
      changed = true;
    }
  }
  if (changed) {
    try {
      fs.writeFileSync(cacheFile, JSON.stringify(Array.from(known.values()), null, 2), "utf8");
    } catch {
      // ignore — the in-memory merge is still returned
    }
  }
  return known;
}

// ---- serveradmin.xml support ----

function parseAdminXml(filePath: string): AdminData {
  const data: AdminData = { users: [], whitelist: [], blacklist: [], commands: [] };
  try {
    const xml = fs.readFileSync(filePath, "utf8");

    // Parse admin users - support both old (<admins>) and new (<users>) tags
    const adminsSection =
      xml.match(/<(?:admins|users)>([\s\S]*?)<\/(?:admins|users)>/)?.[1] || "";
    // Match user entries - handle attribute order variations
    const userRe = /<user\s+([^/]*?)\s*\/>/g;
    let m;
    while ((m = userRe.exec(adminsSection)) !== null) {
      const attrs = m[1];
      // Skip commented out entries
      if (attrs.includes("<!--")) continue;
      const platform = attrs.match(/platform="([^"]*)"/)?.[1] || "";
      const userid = attrs.match(/userid="([^"]*)"/)?.[1] || "";
      const steamID = attrs.match(/steamID="([^"]*)"/)?.[1] || "";
      const name = attrs.match(/name="([^"]*)"/)?.[1] || "";
      const permLevel = attrs.match(/permission_level="(\d+)"/)?.[1] || "1000";
      data.users.push({
        platform: platform || (steamID ? "Steam" : ""),
        userId: userid || steamID,
        name,
        permissionLevel: parseInt(permLevel),
      });
    }

    // Parse whitelist
    const wlSection =
      xml.match(/<whitelist>([\s\S]*?)<\/whitelist>/)?.[1] || "";
    const wlRe = /<user\s+([^/]*?)\s*\/>/g;
    while ((m = wlRe.exec(wlSection)) !== null) {
      const attrs = m[1];
      if (attrs.includes("<!--")) continue;
      const platform = attrs.match(/platform="([^"]*)"/)?.[1] || "";
      const userid = attrs.match(/userid="([^"]*)"/)?.[1] || "";
      const steamID = attrs.match(/steamID="([^"]*)"/)?.[1] || "";
      const name = attrs.match(/name="([^"]*)"/)?.[1] || "";
      data.whitelist.push({
        platform: platform || (steamID ? "Steam" : ""),
        userId: userid || steamID,
        name,
      });
    }

    // Parse blacklist
    const blSection =
      xml.match(/<blacklist>([\s\S]*?)<\/blacklist>/)?.[1] || "";
    const blRe = /<blacklisted\s+([^/]*?)\s*\/>/g;
    while ((m = blRe.exec(blSection)) !== null) {
      const attrs = m[1];
      if (attrs.includes("<!--")) continue;
      const platform = attrs.match(/platform="([^"]*)"/)?.[1] || "";
      const userid = attrs.match(/userid="([^"]*)"/)?.[1] || "";
      const steamID = attrs.match(/steamID="([^"]*)"/)?.[1] || "";
      const name = attrs.match(/name="([^"]*)"/)?.[1] || "";
      const unbanDate = attrs.match(/unbandate="([^"]*)"/)?.[1] || "";
      const reason = attrs.match(/reason="([^"]*)"/)?.[1] || "";
      data.blacklist.push({
        platform: platform || (steamID ? "Steam" : ""),
        userId: userid || steamID,
        name,
        unbanDate,
        reason,
      });
    }

    // Parse commands/permissions - support both <commands> and <permissions> tags
    const cmdSection =
      xml.match(/<(?:commands|permissions)>([\s\S]*?)<\/(?:commands|permissions)>/)?.[1] || "";
    const cmdRe = /<permission\s+cmd="([^"]+)"\s+permission_level="(\d+)"\s*\/>/g;
    while ((m = cmdRe.exec(cmdSection)) !== null) {
      data.commands.push({
        cmd: m[1],
        permissionLevel: parseInt(m[2]) || 0,
      });
    }
  } catch {
    // file may not exist
  }
  return data;
}

function writeAdminXml(filePath: string, data: AdminData): void {
  // Read existing file to detect format (old vs new)
  let useNewFormat = true;
  try {
    const existing = fs.readFileSync(filePath, "utf8");
    useNewFormat = existing.includes("<users>") || existing.includes("platform=");
  } catch {
    // new file, use new format
  }

  const userTag = useNewFormat ? "users" : "admins";
  const cmdTag = useNewFormat ? "commands" : "permissions";

  const userLines = data.users.map((u) => {
    if (useNewFormat) {
      return `    <user platform="${u.platform}" userid="${u.userId}" name="${u.name}" permission_level="${u.permissionLevel}" />`;
    }
    return `    <user steamID="${u.userId}" name="${u.name}" permission_level="${u.permissionLevel}" />`;
  });

  const wlLines = data.whitelist.map((w) => {
    if (useNewFormat) {
      return `    <user platform="${w.platform}" userid="${w.userId}" name="${w.name}" />`;
    }
    return `    <user steamID="${w.userId}" name="${w.name}" />`;
  });

  const blLines = data.blacklist.map((b) => {
    if (useNewFormat) {
      return `    <blacklisted platform="${b.platform}" userid="${b.userId}" name="${b.name}" unbandate="${b.unbanDate}" reason="${b.reason}" />`;
    }
    return `    <blacklisted steamID="${b.userId}" name="${b.name}" unbandate="${b.unbanDate}" reason="${b.reason}" />`;
  });

  const cmdLines = data.commands.map(
    (c) => `    <permission cmd="${c.cmd}" permission_level="${c.permissionLevel}" />`
  );

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<adminTools>
  <${userTag}>
${userLines.join("\n")}
  </${userTag}>
  <whitelist>
${wlLines.join("\n")}
  </whitelist>
  <blacklist>
${blLines.join("\n")}
  </blacklist>
  <${cmdTag}>
${cmdLines.join("\n")}
  </${cmdTag}>
</adminTools>
`;

  // Backup existing file
  try {
    if (fs.existsSync(filePath)) {
      fs.copyFileSync(filePath, filePath + ".bak");
    }
  } catch {
    // ignore backup errors
  }

  fs.writeFileSync(filePath, xml, "utf8");
}

function parseXmlConfig(filePath: string): Record<string, string> {
  try {
    return parseServerConfigXml(fs.readFileSync(filePath, "utf8"));
  } catch {
    return {};
  }
}

function writeXmlConfig(
  filePath: string,
  changes: Record<string, string>
): void {
  const xml = fs.readFileSync(filePath, "utf8");
  fs.writeFileSync(filePath, patchServerConfigXml(xml, changes), "utf8");
}

/** Send a single telnet command and return the response */
function telnetCommand(
  host: string,
  port: number,
  password: string,
  command: string,
  timeout = 5000
): Promise<string> {
  return new Promise((resolve, reject) => {
    const sock = new net.Socket();
    let buf = "";
    let authed = false;
    const timer = setTimeout(() => {
      sock.destroy();
      resolve(buf);
    }, timeout);

    sock.connect(port, host, () => {
      // 7D2D telnet sends a password prompt on connect
    });

    sock.on("data", (data) => {
      buf += data.toString();

      if (!authed && buf.includes("enter password")) {
        sock.write(password + "\r\n");
        authed = true;
        buf = "";
        return;
      }

      if (authed && !command) {
        // Just auth check
        clearTimeout(timer);
        sock.destroy();
        resolve(buf);
        return;
      }

      if (authed && buf.includes("Logon successful")) {
        buf = "";
        sock.write(command + "\r\n");
        return;
      }

      // Wait for full response (ends with a prompt or newline after data)
      if (authed && command && buf.includes("\r\n") && buf.length > command.length + 10) {
        clearTimeout(timer);
        sock.destroy();
        resolve(buf);
      }
    });

    sock.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });

    sock.on("close", () => {
      clearTimeout(timer);
      resolve(buf);
    });
  });
}

export class SevenDaysAdapter implements ServerAdapter, SevenDaysAdminApi {
  readonly def: ServerDefinition;
  readonly capabilities: ServerCapabilities = {
    hasRcon: false,
    hasMods: true,
    hasModPacks: false,
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

  private get configPath(): string {
    return path.join(this.def.dir, this.def.configFile || "serverconfig.xml");
  }

  private get telnetPort(): number {
    return this.def.telnetPort || 8081;
  }

  private get telnetPassword(): string {
    return this.def.telnetPassword || "";
  }

  private get logFilePath(): string {
    return path.join(this.def.dir, "logs", "7d2d-server.log");
  }

  /** Merge the current log into the persistent known-player cache. */
  private syncKnownPlayers(): Map<string, KnownPlayer> {
    return syncKnownPlayers(this.logFilePath, path.join(this.def.dir, KNOWN_PLAYERS_FILE));
  }

  /**
   * True when the dashboard has no process of its own but the telnet port is
   * accepting connections — i.e. the server was launched by nssm, a
   * scheduled task, or by hand.
   */
  private async isRunningExternally(): Promise<boolean> {
    const state = this.getState();
    if (state.process || state.status !== "stopped") return false;
    const reach = await probeReachability("127.0.0.1", this.telnetPort, { ttlMs: 0 });
    return reach === "running";
  }

  constructor(def: ServerDefinition) {
    this.def = def;
  }

  private getState(): SevenDaysState {
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

  getStatus(): ServerStatus {
    return this.getState().status;
  }

  private logWatcher: ReturnType<typeof setInterval> | null = null;
  private logOffset = 0;

  private startLogWatcher() {
    const logFile = this.logFilePath;
    const state = this.getState();
    this.logOffset = 0;

    // Save the previous session's players before the truncate below wipes them.
    this.syncKnownPlayers();

    // Truncate the log file if it exists so we start fresh
    try {
      fs.writeFileSync(logFile, "");
    } catch {
      // ignore - file may not exist yet
    }

    this.logWatcher = setInterval(() => {
      try {
        const stat = fs.statSync(logFile);
        if (stat.size <= this.logOffset) return;

        const fd = fs.openSync(logFile, "r");
        const buf = Buffer.alloc(stat.size - this.logOffset);
        fs.readSync(fd, buf, 0, buf.length, this.logOffset);
        fs.closeSync(fd);
        this.logOffset = stat.size;

        const text = buf.toString("utf8");
        const lines = text.split("\n").filter((l) => l.trim());
        for (const line of lines) {
          // Skip noisy shader warnings
          if (line.startsWith("WARNING: Shader") || line.startsWith("ERROR: Shader")) continue;
          this.addLog(line);

          // Detect server ready
          if (
            line.includes("GameServer.Init successful") ||
            line.includes("StartGame done")
          ) {
            state.status = "running";
            this.addLog("[Dashboard] Server is now running!");
          }
        }
      } catch {
        // log file may not exist yet
      }
    }, 2000);
  }

  private stopLogWatcher() {
    if (this.logWatcher) {
      clearInterval(this.logWatcher);
      this.logWatcher = null;
    }
  }

  async start(): Promise<ActionResult> {
    const state = this.getState();
    if (state.status === "running" || state.status === "starting") {
      return { success: false, message: "Server is already running" };
    }
    if (await this.isRunningExternally()) {
      return {
        success: false,
        message: `Server is already running outside the dashboard (telnet port ${this.telnetPort} is open). Stop it first, or manage it from whatever launched it.`,
      };
    }

    state.status = "starting";
    this.addLog("[Dashboard] Starting 7 Days to Die server...");

    const exe = path.join(this.def.dir, "7DaysToDieServer.exe");
    if (!fs.existsSync(exe)) {
      state.status = "stopped";
      return {
        success: false,
        message: "7DaysToDieServer.exe not found in " + this.def.dir,
      };
    }

    const configFile = this.def.configFile || "serverconfig.xml";
    const logDir = path.join(this.def.dir, "logs");
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }

    const child = spawn(
      exe,
      [
        `-configfile=${configFile}`,
        "-logfile",
        path.join("logs", "7d2d-server.log"),
        "-quit",
        "-batchmode",
        "-nographics",
        "-dedicated",
      ],
      {
        cwd: this.def.dir,
        env: {
          ...process.env,
          SteamAppId: "251570",
          SteamGameId: "251570",
        },
        windowsHide: false,
        stdio: ["ignore", "pipe", "pipe"],
      }
    );

    state.process = child;

    // Capture stdout/stderr for diagnostic output
    child.stdout?.on("data", (data: Buffer) => {
      const lines = data.toString().split("\n").filter((l: string) => l.trim());
      lines.forEach((line: string) => this.addLog(line));
    });
    child.stderr?.on("data", (data: Buffer) => {
      const lines = data.toString().split("\n").filter((l: string) => l.trim());
      lines.forEach((line: string) => this.addLog(`[stderr] ${line}`));
    });

    // Start tailing the log file for real output
    this.startLogWatcher();

    child.on("exit", (code) => {
      this.stopLogWatcher();
      state.process = null;
      state.status = "stopped";
      this.addLog(`[Dashboard] Server process exited (code ${code})`);
    });

    child.on("error", (err) => {
      this.stopLogWatcher();
      state.process = null;
      state.status = "stopped";
      this.addLog(`[Dashboard] Server process error: ${err.message}`);
    });

    return { success: true, message: "Server starting..." };
  }

  async stop(): Promise<ActionResult> {
    const state = this.getState();
    if (state.status === "stopped" && !state.process) {
      // No process of ours, but the server may still be up — launched by
      // nssm, a scheduled task, or by hand. The status endpoint reports it
      // "running" via the telnet probe, so honor Stop the same way: send
      // `shutdown` over telnet. telnetCommand rejects on ECONNREFUSED, which
      // is the "really not running" case.
      try {
        await telnetCommand("127.0.0.1", this.telnetPort, this.telnetPassword, "shutdown");
      } catch {
        return { success: false, message: "Server is not running" };
      }
      const msg =
        "Sent shutdown via telnet. This server wasn't launched by the dashboard, so it will exit on its own (and may be relaunched by whatever manages it).";
      this.addLog(`[Dashboard] ${msg}`);
      return { success: true, message: msg };
    }

    state.status = "stopping";
    this.addLog("[Dashboard] Stopping server...");

    // Try graceful shutdown via telnet first
    try {
      await telnetCommand("127.0.0.1", this.telnetPort, this.telnetPassword, "shutdown");
      this.addLog("[Dashboard] Sent shutdown command via telnet");
    } catch {
      this.addLog("[Dashboard] Telnet shutdown failed, using process kill");
    }

    // Wait for process to exit, or force kill after timeout
    const child = state.process;
    if (child && child.exitCode === null) {
      await new Promise<void>((resolve) => {
        const timer = setTimeout(() => {
          if (child.exitCode === null) {
            this.addLog("[Dashboard] Force-killing server process");
            child.kill("SIGKILL");
          }
          resolve();
        }, STOP_TIMEOUT_MS);

        child.once("exit", () => {
          clearTimeout(timer);
          resolve();
        });
      });
    }

    this.stopLogWatcher();
    state.process = null;
    state.status = "stopped";
    return { success: true, message: "Server stopped" };
  }

  async restart(): Promise<ActionResult> {
    if (this.getState().status !== "stopped") {
      const stopResult = await this.stop();
      if (!stopResult.success) return stopResult;
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }
    return this.start();
  }

  sendCommand(cmd: string): ActionResult {
    // Deliberately NOT gated on the internal state machine: a server started
    // outside the dashboard (nssm, scheduled task) reads as "stopped" here
    // while telnet is perfectly reachable. If the server really is down the
    // telnet connect fails and the error lands in the console log below.
    this.addLog(`> ${cmd}`);

    // Fire and forget telnet command
    telnetCommand("127.0.0.1", this.telnetPort, this.telnetPassword, cmd)
      .then((response) => {
        const lines = response
          .split("\n")
          .filter((l) => l.trim() && !l.includes("enter password") && !l.includes("Logon successful"));
        lines.forEach((line) => this.addLog(line.trim()));
      })
      .catch((err) => {
        this.addLog(`[Telnet error] ${err.message}`);
      });

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
    const child = state.process;

    let proc: ServerStats["process"] = null;
    if (child && child.pid && child.exitCode === null) {
      // Get memory usage via PowerShell
      try {
        const result = await new Promise<string>((resolve, reject) => {
          exec(
            `powershell -NoProfile -Command "(Get-Process -Id ${child.pid}).WorkingSet64"`,
            { timeout: 5000 },
            (err: Error | null, stdout: string) => {
              if (err) reject(err);
              else resolve(stdout.trim());
            }
          );
        });
        const memBytes = parseInt(result) || 0;
        proc = {
          pid: child.pid,
          memory: formatBytes(memBytes),
          memoryBytes: memBytes,
          upSince: null,
        };
      } catch {
        proc = {
          pid: child.pid,
          memory: "Unknown",
          memoryBytes: 0,
          upSince: null,
        };
      }
    }

    return {
      process: proc,
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
    return parseXmlConfig(this.configPath);
  }

  /** The version the game printed on its last boot ("V 3.3.0 (b18)"), so the
   *  config editor can tell a 3.x server apart even when its serverconfig.xml
   *  predates the SandboxCode. Undefined until the server has logged once. */
  getGameVersion(): string | undefined {
    try {
      return sevenDaysVersionFromLog(fs.readFileSync(this.logFilePath, "utf8")) ?? undefined;
    } catch {
      return undefined;
    }
  }

  async saveConfig(config: Record<string, unknown>): Promise<ActionResult> {
    try {
      // Backup first
      const backup = this.configPath + ".bak";
      fs.copyFileSync(this.configPath, backup);

      const changes: Record<string, string> = {};
      for (const [k, v] of Object.entries(config)) {
        changes[k] = String(v);
      }
      writeXmlConfig(this.configPath, changes);
      return { success: true, message: "Config saved (restart required)" };
    } catch (e) {
      return { success: false, message: (e as Error).message };
    }
  }

  async getPlayers(): Promise<PlayerData> {
    // Known players = persistent cache merged with the current session's log.
    // The log alone is truncated on every dashboard launch.
    const knownPlayers = this.syncKnownPlayers();

    // Check which players are currently online via telnet. We DON'T gate on
    // getState().status — that's the internal-spawn state machine, which
    // always reports "stopped" for nssm/systemd-managed servers and would
    // silently skip the probe (matches the bug PR #10 fixed for the status
    // endpoint, surfaced for getPlayers too). The try/catch below absorbs
    // "telnet refused" cleanly when the server is actually off.
    const onlineIds = new Set<string>();
    try {
      const response = await telnetCommand(
        "127.0.0.1",
        this.telnetPort,
        this.telnetPassword,
        "listplayers"
      );
      const lines = response.split("\n");
      for (const line of lines) {
        const match = line.match(
          /\d+\.\s+id=(\d+),\s+(.+?),\s+pos=/
        );
        if (match) {
          // Mark as online — use entity ID to find the player
          const playerName = match[2].trim();
          for (const [eosId, info] of knownPlayers) {
            if (info.name === playerName) {
              onlineIds.add(eosId);
              break;
            }
          }
        }
      }
    } catch {
      // Telnet may not be available
    }

    // Get admin data to check op status
    const adminData = this.getAdminData();
    const adminIds = new Set(adminData.users.map(u => u.userId));

    // Build player list from known players
    const players: PlayerEntry[] = Array.from(knownPlayers.values()).map(info => ({
      uuid: info.eosId,
      name: info.name,
      groups: [
        onlineIds.has(info.eosId) ? "online" : "offline",
        info.steamId,
      ],
      isOp: adminIds.has(info.steamId) || adminIds.has(info.eosId),
    }));

    // Sort: online first, then alphabetically
    players.sort((a, b) => {
      const aOnline = a.groups.includes("online") ? 0 : 1;
      const bOnline = b.groups.includes("online") ? 0 : 1;
      if (aOnline !== bOnline) return aOnline - bOnline;
      return (a.name || "").localeCompare(b.name || "");
    });

    return { players, whitelist: null, bans: null };
  }

  getMemoryConfig(): DashboardConfig {
    return { minMemoryGB: 4, maxMemoryGB: 8 };
  }

  saveMemoryConfig(_config: DashboardConfig): void {
    // 7D2D memory is managed by the engine, not configurable
  }

  // ---- 7D2D-specific methods ----

  getAdminFilePath(): string | null {
    // Check explicit config first
    if (this.def.adminFilePath) {
      return fs.existsSync(this.def.adminFilePath) ? this.def.adminFilePath : null;
    }
    // Read AdminFileName from server config (default: serveradmin.xml)
    const config = parseXmlConfig(this.configPath);
    const fileName = config.AdminFileName || "serveradmin.xml";
    // Check common locations
    const candidates = [
      path.join(this.def.dir, fileName),
      path.join(this.def.dir, "saves", fileName),
    ];
    // Also check %APPDATA%/7DaysToDie/Saves/
    const appData = process.env.APPDATA;
    if (appData) {
      candidates.push(path.join(appData, "7DaysToDie", "Saves", fileName));
    }
    for (const p of candidates) {
      if (fs.existsSync(p)) return p;
    }
    // Return the first candidate path even if it doesn't exist yet (for creation)
    return candidates[0];
  }

  getAdminData(): AdminData {
    const filePath = this.getAdminFilePath();
    if (!filePath) return { users: [], whitelist: [], blacklist: [], commands: [] };
    return parseAdminXml(filePath);
  }

  saveAdminData(data: AdminData): ActionResult {
    const filePath = this.getAdminFilePath();
    if (!filePath) return { success: false, message: "Admin file path not found" };
    try {
      writeAdminXml(filePath, data);
      return { success: true, message: "Admin config saved" };
    } catch (e) {
      return { success: false, message: (e as Error).message };
    }
  }

  async getServerInfo(): Promise<Record<string, unknown>> {
    const config = parseXmlConfig(this.configPath);
    const state = this.getState();

    // Parse version and registered players from log file
    let serverVersion = "";
    const uniquePlayers = new Set<string>();
    try {
      const log = fs.readFileSync(this.logFilePath, "utf8");
      serverVersion = sevenDaysVersionFromLog(log) ?? "";
      const loginRe = /INF PlayerLogin:\s*(.+?)\/V/g;
      let m;
      while ((m = loginRe.exec(log)) !== null) {
        uniquePlayers.add(m[1].trim());
      }
    } catch {
      // log may not exist
    }

    const worldName = config.GameName || config.GameWorld || "Unknown";

    return {
      running: state.status === "running",
      serverName: config.ServerName || "Unknown",
      motd: config.ServerLoginConfirmationText || config.ServerDescription || "",
      serverVersion: serverVersion || undefined,
      gameWorld: config.GameWorld || "Unknown",
      defaultWorld: worldName,
      worlds: [worldName],
      gameDifficulty: config.GameDifficulty || "Unknown",
      gameMode: config.GameMode === "GameModeSurvival" ? "Survival" : config.GameMode || "Unknown",
      maxPlayers: parseInt(config.ServerMaxPlayerCount || "8"),
      registeredPlayers: Math.max(this.syncKnownPlayers().size, uniquePlayers.size) || undefined,
      dayNightLength: parseInt(config.DayNightLength || "60"),
      gamePort: config.ServerPort || this.def.gamePort,
      telnetPort: this.telnetPort,
      controlPanelPort: this.def.controlPanelPort,
    };
  }
}
