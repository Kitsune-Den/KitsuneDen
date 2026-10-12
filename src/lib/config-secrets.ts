/**
 * Admin credentials inside game config files are write-only through
 * /api/config.
 *
 * The Config tab loads the whole server.properties / serverconfig.xml /
 * PalWorldSettings.ini / enshrouded_server.json, so before this every visit
 * shipped the RCON, telnet and admin passwords to the browser. Anyone with the
 * shared dashboard password could then take them and use them *outside* the
 * dashboard (direct RCON/telnet, in-game admin).
 *
 * GET blanks those values and lists which ones it hid. POST puts the stored
 * value back for any hidden secret that comes back blank, so saving the form
 * without touching it changes nothing. Typing a new value replaces the old one.
 * Clearing a secret has to be done in the file on the host.
 *
 * Join passwords (ServerPassword, serverPassword, Hytale Password, non-admin
 * Enshrouded groups) stay visible: their whole purpose is to be handed to
 * players.
 */

import type { ServerDefinition } from "./adapters/types";

type ServerType = ServerDefinition["type"];

/** Top-level keys holding admin-grade credentials, per game. */
const FLAT_SECRET_KEYS: Record<ServerType, readonly string[]> = {
  minecraft: ["rcon.password", "management-server-secret"],
  "7d2d": ["TelnetPassword", "ControlPanelPassword"],
  palworld: ["AdminPassword"],
  hytale: [],
  enshrouded: [],
  // Only a join password, which is meant to be handed to players.
  valheim: [],
  // The RCON password is inside Rcon, which getConfig never returns.
  vrising: [],
  // RCONPassword is a Den-owned key that getConfig never returns.
  projectzomboid: [],
};

interface EnshroudedGroup {
  name?: unknown;
  password?: unknown;
  canKickBan?: unknown;
  [k: string]: unknown;
}

const isBlank = (v: unknown) => v === undefined || v === null || v === "";

/** Enshrouded groups that can kick/ban are admin credentials. */
function isAdminGroup(g: EnshroudedGroup): boolean {
  return g.canKickBan === true;
}

function groupLabel(name: unknown): string {
  return `userGroups[${String(name)}].password`;
}

function groupsOf(config: Record<string, unknown>): EnshroudedGroup[] | null {
  const groups = config.userGroups;
  if (!Array.isArray(groups)) return null;
  return groups.filter((g): g is EnshroudedGroup => !!g && typeof g === "object");
}

export interface RedactedConfig {
  config: Record<string, unknown>;
  /** Labels of the secrets that were hidden (had a non-empty value). */
  redactedSecrets: string[];
}

export function redactConfigSecrets(type: ServerType, config: Record<string, unknown>): RedactedConfig {
  const out: Record<string, unknown> = { ...config };
  const redactedSecrets: string[] = [];

  for (const key of FLAT_SECRET_KEYS[type] ?? []) {
    if (Object.prototype.hasOwnProperty.call(out, key) && !isBlank(out[key])) {
      out[key] = "";
      redactedSecrets.push(key);
    }
  }

  if (type === "enshrouded" && Array.isArray(config.userGroups)) {
    out.userGroups = (config.userGroups as unknown[]).map((g) => {
      if (!g || typeof g !== "object") return g;
      const group = g as EnshroudedGroup;
      if (!isAdminGroup(group) || isBlank(group.password)) return group;
      redactedSecrets.push(groupLabel(group.name));
      return { ...group, password: "" };
    });
  }

  return { config: out, redactedSecrets };
}

export type RestoreResult =
  | { ok: true; config: Record<string, unknown> }
  | { ok: false; message: string };

/**
 * Merge a config submitted from the editor with the stored one: hidden
 * secrets that come back blank (or missing) get their stored value back.
 */
export function restoreConfigSecrets(
  type: ServerType,
  submitted: Record<string, unknown>,
  stored: Record<string, unknown>
): RestoreResult {
  const out: Record<string, unknown> = { ...submitted };

  // Missing counts as blank too: Palworld rewrites the whole INI from the
  // submitted object, so dropping the key would delete the setting.
  for (const key of FLAT_SECRET_KEYS[type] ?? []) {
    if (!isBlank(stored[key]) && isBlank(out[key])) out[key] = stored[key];
  }

  if (type === "enshrouded") {
    const submittedGroups = groupsOf(submitted);
    if (submittedGroups) {
      const storedByName = new Map((groupsOf(stored) ?? []).map((g) => [g.name, g]));
      const merged: EnshroudedGroup[] = [];
      for (const group of submittedGroups) {
        const before = storedByName.get(group.name);
        let next = group;
        if (isBlank(group.password) && before && isAdminGroup(before) && !isBlank(before.password)) {
          next = { ...group, password: before.password };
        }
        // Groups are matched by name, so renaming an admin group in the
        // editor (or adding one) arrives with a blank password we can't fill
        // in. Saving that would make the group open to anyone. Refuse unless
        // it was already blank on disk under that name.
        const alreadyOpen = before && isAdminGroup(before) && isBlank(before.password);
        if (isAdminGroup(next) && isBlank(next.password) && !alreadyOpen) {
          return {
            ok: false,
            message: `Group "${String(next.name)}" can kick/ban but has no password. Set one before saving (renamed groups lose their hidden password).`,
          };
        }
        merged.push(next);
      }
      out.userGroups = merged;
    }
  }

  return { ok: true, config: out };
}
