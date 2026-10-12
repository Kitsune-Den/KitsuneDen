/**
 * V Rising's settings files, and what the Den writes into them.
 *
 * Measured by PackRelay on real servers:
 *  - Launched with -persistentDataPath, settings and saves live under it
 *    (save-data\Settings, save-data\Saves) instead of the shared
 *    AppData\LocalLow\Stunlock Studios profile.
 *  - The game copies VRisingServer_Data\StreamingAssets\Settings into the
 *    live folder itself, but on first boot, one boot too late for RCON. So
 *    the Den seeds the live ServerHostSettings.json before the first start.
 *  - The game writes these files with a UTF-8 BOM, which JSON.parse rejects
 *    (PackRelay lost RCON setup to it). It reads them with or without one.
 *  - Keys it doesn't find take the game's defaults, and JSON types matter:
 *    "Port": "9876" is a parse error, not a port.
 *  - The shipped file is unlisted (ListOnSteam/ListOnEOS false); a seeded one
 *    is listed. An existing file's listing is left alone.
 *  - RCON is off by default; it's what makes a clean stop (`shutdown`, which
 *    saves on the way out) possible, so the Den turns it on every start.
 */

import { randomBytes } from "crypto";

export const SAVE_DATA = "save-data";
export const SETTINGS_DIR = "save-data/Settings";
export const HOST_FILE = "ServerHostSettings.json";
export const GAME_FILE = "ServerGameSettings.json";
export const TEMPLATE_DIR = "VRisingServer_Data/StreamingAssets/Settings";
/** The server's stdout, which is its log. -logFile would empty the console. */
export const LOG_FILE = "logs/VRisingServer.log";

/** Keys the Den writes before every start; not edited on the Config tab. */
export const DEN_OWNED_KEYS = ["Port", "QueryPort", "Rcon"] as const;

/** "" means none: the rules in ServerGameSettings.json apply. */
export const GAME_PRESETS = [
  "",
  "DuoPvP", "DuoPvP_DailySiege", "DuoPvP_NoSiege", "DuoPvP_WeekendSiege",
  "HardcoreDuoPvP", "HardcorePvP", "HardcoreTrioPvP",
  "Level30PvE", "Level30PvP", "Level40PvE", "Level40PvP", "Level50PvE", "Level50PvP",
  "Level60PvE", "Level60PvP", "Level70PvE", "Level70PvP", "Level80PvE", "Level80PvP",
  "Level90PvE", "Level90PvP",
  "SoloPvP",
  "StandardPvE", "StandardPvP", "StandardPvP_DailySiege", "StandardPvP_NoSiege", "StandardPvP_WeekendSiege",
  "TrioPvP", "TrioPvP_DailySiege", "TrioPvP_NoSiege", "TrioPvP_WeekendSiege",
] as const;
export const DIFFICULTY_PRESETS = ["", "Difficulty_Easy", "Difficulty_Normal", "Difficulty_Brutal"] as const;

type Settings = Record<string, unknown>;

/** Parse a settings file the way the game writes it: possibly with a BOM. */
export function parseSettingsJson(text: string): Settings {
  const parsed: unknown = JSON.parse(text.replace(/^﻿/, ""));
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("not a JSON object");
  return parsed as Settings;
}

export function generateRconPassword(): string {
  return randomBytes(12).toString("base64url");
}

export interface HostSettingsInput {
  /** The live file, or null when it's missing or empty. */
  current: Settings | null;
  /** The shipped template, or null when it can't be read. */
  template: Settings | null;
  port: number;
  queryPort: number;
  rconPort: number;
  /** servers.json's rconPassword, when set. */
  rconPassword?: string;
}

/**
 * The host settings to write before a start: the live file (or, the first
 * time, the shipped template made listed), with the ports and RCON the Den
 * owns. Pure, so it can be tested without a disk.
 */
/**
 * A new server's host settings: the shipped template, listed on Steam and
 * EOS (the template isn't). Used wherever there's no live file yet, so a
 * Config tab save before the first start doesn't leave the server unlisted.
 */
export function seedHostSettings(template: Settings | null): Settings {
  return { ...(template ?? {}), ListOnSteam: true, ListOnEOS: true };
}

export function prepareHostSettings(input: HostSettingsInput): { settings: Settings; seeded: boolean } {
  const seeded = input.current === null;
  const base: Settings = seeded ? seedHostSettings(input.template) : { ...input.current };
  const existingRcon = (base.Rcon && typeof base.Rcon === "object" ? base.Rcon : {}) as Settings;
  const password =
    input.rconPassword ||
    (typeof existingRcon.Password === "string" && existingRcon.Password) ||
    generateRconPassword();
  return {
    settings: {
      ...base,
      Port: input.port,
      QueryPort: input.queryPort,
      Rcon: { ...existingRcon, Enabled: true, Port: input.rconPort, Password: password },
    },
    seeded,
  };
}

/** The host settings as the Config tab shows them: without the keys the Den owns. */
export function editableHostSettings(settings: Settings): Settings {
  const out = { ...settings };
  for (const key of DEN_OWNED_KEYS) delete out[key];
  return out;
}

/** A Config tab save laid over the file: every other key, and the Den's, are kept. */
export function mergeHostSettings(current: Settings, incoming: Settings): Settings {
  const edits = editableHostSettings(incoming);
  for (const [key, value] of Object.entries(edits)) {
    // A number that comes back as text stays a number: V Rising reads
    // "AutoSaveInterval": "120" as a parse error, not as 120.
    if (typeof current[key] === "number" && typeof value === "string" && /^-?\d+(\.\d+)?$/.test(value.trim())) {
      edits[key] = Number(value);
    }
  }
  return { ...current, ...edits };
}

/** Why the game would refuse these settings, or null. Only rules that stop a start. */
export function validateHostSettings(s: Settings): string | null {
  if (typeof s.Name === "string" && !s.Name.trim()) return "V Rising needs a server name.";
  if (typeof s.SaveName === "string" && !s.SaveName.trim()) return "V Rising needs a save name.";
  if (typeof s.GameSettingsPreset === "string" && !(GAME_PRESETS as readonly string[]).includes(s.GameSettingsPreset)) {
    return `Unknown game settings preset "${s.GameSettingsPreset}".`;
  }
  if (
    typeof s.GameDifficultyPreset === "string" &&
    !(DIFFICULTY_PRESETS as readonly string[]).includes(s.GameDifficultyPreset)
  ) {
    return `Unknown difficulty preset "${s.GameDifficultyPreset}".`;
  }
  return null;
}
