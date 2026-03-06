import fs from "fs";
import path from "path";
import type { ServersConfig, ServerDefinition, ServerAdapter } from "./types";
import { MinecraftAdapter } from "./minecraft-adapter";
import { HytaleAdapter } from "./hytale-adapter";
import { SevenDaysAdapter } from "./seven-days-adapter";

// Persist across Next.js HMR reloads
const globalForRegistry = globalThis as unknown as {
  __denAdapters?: Map<string, ServerAdapter>;
  __denConfig?: ServersConfig;
};

function loadConfig(): ServersConfig {
  if (globalForRegistry.__denConfig) return globalForRegistry.__denConfig;

  const configPath = path.join(process.cwd(), "servers.json");
  const raw = fs.readFileSync(configPath, "utf-8");
  const config: ServersConfig = JSON.parse(raw);
  globalForRegistry.__denConfig = config;
  return config;
}

function createAdapter(def: ServerDefinition): ServerAdapter {
  switch (def.type) {
    case "minecraft":
      return new MinecraftAdapter(def);
    case "hytale":
      return new HytaleAdapter(def);
    case "7d2d":
      return new SevenDaysAdapter(def);
    default:
      throw new Error(`Unknown server type: ${def.type}`);
  }
}

function getAdapterMap(): Map<string, ServerAdapter> {
  if (!globalForRegistry.__denAdapters) {
    globalForRegistry.__denAdapters = new Map();
    const config = loadConfig();
    for (const def of config.servers) {
      globalForRegistry.__denAdapters.set(def.id, createAdapter(def));
    }
  }
  return globalForRegistry.__denAdapters;
}

export function getAdapter(serverId: string): ServerAdapter | undefined {
  return getAdapterMap().get(serverId);
}

export function getAllAdapters(): ServerAdapter[] {
  return Array.from(getAdapterMap().values());
}

export function getDefaultServerId(): string {
  const config = loadConfig();
  return config.servers[0]?.id || "";
}

export function getConfig(): ServersConfig {
  return loadConfig();
}
