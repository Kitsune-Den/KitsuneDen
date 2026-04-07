import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

// HMR-safe global cache for database connections
const globalForDb = globalThis as unknown as {
  __kitsuneDbCache?: Map<string, Database.Database>;
};
if (!globalForDb.__kitsuneDbCache) {
  globalForDb.__kitsuneDbCache = new Map();
}

/**
 * Default values for all airdrop.* settings.
 * Must match AirdropSettings.java defaults exactly.
 */
export const AIRDROP_DEFAULTS: Record<string, string> = {
  "airdrop.enabled": "true",
  "airdrop.intervalMinutes": "30",
  "airdrop.chestBlockType": "Furniture_Crude_Chest_Small",
  "airdrop.minItems": "3",
  "airdrop.maxItems": "6",
  "airdrop.radiusFromCenter": "200",
  "airdrop.centerX": "0",
  "airdrop.centerZ": "0",
  "airdrop.containerSlots": "9",
  "airdrop.announceMessage": "Supply drop at %x, %y, %z! Race to claim it!",
  "airdrop.untouchedDecayMinutes": "15",
  "airdrop.openedDecayMinutes": "5",
};

/**
 * Human-readable descriptions for each airdrop setting.
 */
export const AIRDROP_DESCRIPTIONS: Record<string, string> = {
  "airdrop.enabled": "Enable or disable automatic airdrops",
  "airdrop.intervalMinutes": "Minutes between automatic drops",
  "airdrop.chestBlockType": "Block type used for the airdrop chest",
  "airdrop.minItems": "Minimum number of items per drop",
  "airdrop.maxItems": "Maximum number of items per drop",
  "airdrop.radiusFromCenter": "Drop radius around random player (blocks)",
  "airdrop.centerX": "Legacy - unused (drops target random players)",
  "airdrop.centerZ": "Legacy - unused (drops target random players)",
  "airdrop.containerSlots": "Number of chest inventory slots",
  "airdrop.announceMessage": "Broadcast message template (%x, %y, %z placeholders)",
  "airdrop.untouchedDecayMinutes": "Minutes before an untouched drop disappears",
  "airdrop.openedDecayMinutes": "Minutes before an opened drop disappears",
};

/**
 * Resolve the KitsuneCommand database path for a server directory.
 * Returns null if the database file does not exist.
 */
export function getKitsuneDbPath(serverDir: string): string | null {
  const dbPath = path.join(
    serverDir,
    "mods",
    "KitsuneCommand_KitsuneCommand",
    "kitsunecommand.db"
  );
  return fs.existsSync(dbPath) ? dbPath : null;
}

/**
 * Get a cached database connection for the given server directory.
 * Opens in WAL mode with foreign keys enabled and a 5-second busy timeout.
 * Returns null if the KitsuneCommand database doesn't exist.
 */
export function getKitsuneDb(serverDir: string): Database.Database | null {
  const dbPath = getKitsuneDbPath(serverDir);
  if (!dbPath) return null;

  const existing = globalForDb.__kitsuneDbCache!.get(dbPath);
  if (existing) {
    try {
      // Verify connection is still valid
      existing.pragma("journal_mode");
      return existing;
    } catch {
      globalForDb.__kitsuneDbCache!.delete(dbPath);
    }
  }

  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.pragma("busy_timeout = 5000");
  globalForDb.__kitsuneDbCache!.set(dbPath, db);
  return db;
}
