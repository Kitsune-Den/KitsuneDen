import fs from "fs";
import path from "path";
import type { ServersConfig, ServerDefinition, ServerAdapter } from "./types";
import { MinecraftAdapter } from "./minecraft-adapter";
import { HytaleAdapter } from "./hytale-adapter";
import { SevenDaysAdapter } from "./seven-days-adapter";
import { PalworldAdapter } from "./palworld-adapter";

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
    case "palworld":
      return new PalworldAdapter(def);
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

/** Update a server's config fields in servers.json and rebuild its adapter. */
export async function updateServer(
  serverId: string,
  updates: Partial<ServerDefinition>
): Promise<{ success: boolean; message: string }> {
  const config = loadConfig();
  const idx = config.servers.findIndex((s) => s.id === serverId);
  if (idx === -1) return { success: false, message: "Server not found" };

  // Don't allow changing id or type via this endpoint
  const { id: _id, type: _type, ...safeUpdates } = updates;
  config.servers[idx] = { ...config.servers[idx], ...safeUpdates };

  const configPath = path.join(process.cwd(), "servers.json");
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

  // Rebuild the adapter with updated definition
  const map = getAdapterMap();
  map.set(serverId, createAdapter(config.servers[idx]));
  globalForRegistry.__denConfig = undefined;

  return {
    success: true,
    message: `Server "${config.servers[idx].name}" settings updated`,
  };
}

/** Remove a server from servers.json and tear down its adapter. */
export async function removeServer(
  serverId: string,
  deleteFiles: boolean = false
): Promise<{ success: boolean; message: string }> {
  const config = loadConfig();
  const def = config.servers.find((s) => s.id === serverId);
  if (!def) return { success: false, message: "Server not found" };

  // Stop the server if it's running
  const adapter = getAdapterMap().get(serverId);
  if (adapter && adapter.getStatus() === "running") {
    await adapter.stop();
  }

  // Remove from config
  config.servers = config.servers.filter((s) => s.id !== serverId);
  const configPath = path.join(process.cwd(), "servers.json");
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

  // Delete server files from disk if requested
  if (deleteFiles && def.dir) {
    try {
      fs.rmSync(def.dir, { recursive: true, force: true });
    } catch (err) {
      // Config is already updated — report partial success
      return {
        success: true,
        message: `Server removed from dashboard but failed to delete files: ${err}`,
      };
    }
  }

  // Invalidate caches so next request rebuilds from disk
  getAdapterMap().delete(serverId);
  globalForRegistry.__denConfig = undefined;

  return {
    success: true,
    message: deleteFiles
      ? `Server "${def.name}" removed and files deleted`
      : `Server "${def.name}" removed from dashboard`,
  };
}
