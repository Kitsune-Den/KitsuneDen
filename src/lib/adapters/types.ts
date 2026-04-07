import { ChildProcess } from "child_process";

// ---- Server Definition (read from servers.json) ----

export interface ServerDefinition {
  id: string;
  name: string;
  type: "minecraft" | "hytale" | "7d2d" | "palworld";
  dir: string;

  // Minecraft-specific
  loader?: string;
  version?: string;
  jar?: string;
  launchMode?: "jar" | "argfile";
  argFiles?: string[];
  javaPath?: string;
  rconPort?: number;
  rconPassword?: string;
  gamePort?: number;

  // Hytale-specific
  startScript?: string;
  backupScript?: string;
  processFilter?: string;

  // 7D2D-specific
  configFile?: string;
  telnetPort?: number;
  telnetPassword?: string;
  controlPanelPort?: number;
  controlPanelPassword?: string;
  adminFilePath?: string;

  // Palworld-specific
  steamCmdPath?: string;
  steamAppId?: number;
  restApiPort?: number;
  restApiPassword?: string;

  // Shared optional
  modsDir?: string;
}

export interface ServersConfig {
  servers: ServerDefinition[];
  dashboard: {
    port: number;
  };
}

// ---- Capabilities ----

export interface ServerCapabilities {
  hasRcon: boolean;
  hasMods: boolean;
  hasModPacks: boolean;
  hasBackups: boolean;
  hasWorlds: boolean;
  hasWarps: boolean;
  hasServerProperties: boolean;
  hasJsonConfig: boolean;
  hasKitsuneCommand: boolean;
  hasRestApi: boolean;
  hasSteamUpdate: boolean;
  hasLauncherUpdate: boolean;
}

// ---- Runtime types ----

export type ServerStatus = "stopped" | "starting" | "running" | "stopping";

export interface ActionResult {
  success: boolean;
  message: string;
}

export interface DashboardConfig {
  minMemoryGB: number;
  maxMemoryGB: number;
}

export interface ServerStats {
  process: {
    pid: number | null;
    memory: string;
    memoryBytes: number;
    upSince: string | null;
  } | null;
  system: {
    platform: string;
    hostname: string;
    totalMemory: string;
    freeMemory: string;
    totalMemoryBytes: number;
    freeMemoryBytes: number;
    cpus: number;
    cpuModel: string;
    uptime: number;
  };
}

export interface PlayerEntry {
  uuid: string;
  name: string | null;
  groups: string[];
  isOp: boolean;
}

export interface PlayerData {
  players: PlayerEntry[];
  whitelist: unknown;
  bans: unknown;
}

// ---- Server State (internal) ----

export interface ServerState {
  process: ChildProcess | null;
  status: ServerStatus;
  logs: string[];
  listeners: Set<(line: string) => void>;
}

// ---- Adapter Interface ----

export interface ServerAdapter {
  readonly def: ServerDefinition;
  readonly capabilities: ServerCapabilities;

  // Lifecycle
  getStatus(): ServerStatus;
  start(): Promise<ActionResult>;
  stop(): Promise<ActionResult>;
  restart(): Promise<ActionResult>;
  sendCommand(cmd: string): ActionResult;

  // Logs
  getLogs(): string[];
  onLog(cb: (line: string) => void): () => void;

  // Stats
  getStats(): Promise<ServerStats>;

  // Config
  getConfig(): Promise<Record<string, unknown>>;
  saveConfig(config: Record<string, unknown>): Promise<ActionResult>;

  // Players
  getPlayers(): Promise<PlayerData>;

  // Memory
  getMemoryConfig(): DashboardConfig;
  saveMemoryConfig(config: DashboardConfig): void;
}
