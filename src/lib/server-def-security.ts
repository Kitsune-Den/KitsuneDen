/**
 * What the browser is allowed to see — and change — about a ServerDefinition.
 *
 * GET /api/servers used to spread the whole definition into the response,
 * shipping RCON/telnet/REST passwords and the SSH lifecycle block (key path,
 * remote PowerShell) to every page load. Secrets are now write-only: the
 * client learns *whether* each one is set, never its value, and a blank
 * secret on save means "keep the existing one".
 *
 * The lifecycle block is servers.json-only. Its startCommand/stopCommand are
 * arbitrary PowerShell run over SSH, so letting the shared dashboard password
 * set them would turn "can log in" into "can run code on every remote host".
 *
 * Path fields that decide what the dashboard host runs or deletes (javaPath,
 * startScript, steamCmdPath, dir, ...) are validated on write — see
 * validatePathFields below for the rules and why.
 */

import path from "path";
import type { ServerDefinition } from "./adapters/types";

export const SECRET_FIELDS = [
  "rconPassword",
  "telnetPassword",
  "controlPanelPassword",
  "restApiPassword",
] as const;

export type SecretField = (typeof SECRET_FIELDS)[number];

/** Fields the API refuses to write. Edit servers.json on the host instead. */
export const SERVERS_JSON_ONLY_FIELDS = [
  "lifecycle",
  // Absolute path the 7D2D adapter reads *and writes* serveradmin.xml at —
  // an arbitrary-file-write primitive if API-writable. Not in the edit form.
  "adminFilePath",
] as const;

/** Response-only fields a client might echo back; never persisted. */
const READ_ONLY_FIELDS = ["secretsSet", "status", "capabilities"] as const;

export type PublicServerDefinition = Omit<ServerDefinition, SecretField | "lifecycle"> & {
  /** Which secret fields have a non-empty value in servers.json. */
  secretsSet: SecretField[];
};

export function redactServerDefinition(def: ServerDefinition): PublicServerDefinition {
  const copy: Record<string, unknown> = { ...def };
  const secretsSet: SecretField[] = [];
  for (const key of SECRET_FIELDS) {
    if (typeof def[key] === "string" && def[key] !== "") secretsSet.push(key);
    delete copy[key];
  }
  for (const key of SERVERS_JSON_ONLY_FIELDS) delete copy[key];
  return { ...(copy as Omit<ServerDefinition, SecretField | "lifecycle">), secretsSet };
}

export type SanitizeResult =
  | { ok: true; value: Record<string, unknown> }
  | { ok: false; message: string };

/**
 * Validate a server create/update body from the browser.
 * - Rejects servers.json-only fields outright (400, not a silent drop, so a
 *   script that tries it learns why it didn't work).
 * - Drops blank secrets so an untouched password input keeps the stored value.
 * - Drops response-only fields echoed back from GET.
 * - Validates path fields (validatePathFields). On update, pass the stored
 *   definition as `current`: values identical to what's already in
 *   servers.json are not re-checked, so a legacy value the rules would now
 *   reject (say, a dir with an apostrophe) doesn't block editing other fields.
 */
export function sanitizeServerWrite(
  input: Record<string, unknown>,
  current?: ServerDefinition
): SanitizeResult {
  for (const key of SERVERS_JSON_ONLY_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(input, key)) {
      return {
        ok: false,
        message: `"${key}" can only be configured by editing servers.json on the dashboard host.`,
      };
    }
  }

  const value: Record<string, unknown> = { ...input };
  for (const key of READ_ONLY_FIELDS) delete value[key];
  for (const key of SECRET_FIELDS) {
    if (key in value && (value[key] === "" || value[key] === null || value[key] === undefined)) {
      delete value[key];
    }
  }

  const pathError = validatePathFields(value, current);
  if (pathError) return { ok: false, message: pathError };

  return { ok: true, value };
}

// ---- Path-field validation ----
//
// Threat: anyone with the shared dashboard password can PUT/POST these. Left
// unchecked they let that person pick any executable on the dashboard host
// (javaPath = cmd.exe), run a script from anywhere (startScript = ..\..\x.bat),
// write config files outside the server folder (configFile = ..\..\x), or
// break out of the PowerShell / cmd.exe / WQL strings the adapters build by
// interpolating these values (a `"` or `'` in steamCmdPath, dir, startScript
// or processFilter). This is defense in depth — mods are code, so a dashboard
// user can still run code through the game server itself — but it closes the
// "type a path, get a shell" shortcuts.
//
// Paths are checked with path.win32 on every platform. The dashboard runs on
// Windows, and win32 treats both `\` and `/` as separators, so it's also the
// stricter reading on Linux (where CI runs).

/** Characters that change meaning inside the cmd.exe / PowerShell / WQL
 * strings the adapters build. Legal in Windows filenames, but not worth the
 * injection risk for a server path. */
const SHELL_UNSAFE = /["'`$%&|<>^;\r\n\0]/;

/** Must stay inside the server's dir — adapters path.join() these onto it. */
const RELATIVE_PATH_FIELDS = ["startScript", "backupScript", "jar", "configFile", "modsDir"] as const;

/** Absolute or bare (found on PATH), but must name the expected program. */
const EXECUTABLE_BASENAMES: Record<string, readonly string[]> = {
  javaPath: ["java", "java.exe", "javaw.exe"],
  steamCmdPath: ["steamcmd", "steamcmd.exe", "steamcmd.sh"],
};

/** Not paths, but interpolated into a WQL LIKE '%...%' filter (Hytale). */
const SHELL_STRING_FIELDS = ["processFilter"] as const;

const isUnset = (v: unknown) => v === "" || v === null || v === undefined;

function sameAsStored(key: string, value: unknown, current?: ServerDefinition): boolean {
  if (!current) return false;
  return JSON.stringify((current as unknown as Record<string, unknown>)[key]) === JSON.stringify(value);
}

function checkShellSafe(field: string, value: string): string | null {
  return SHELL_UNSAFE.test(value)
    ? `"${field}" contains a character that isn't allowed here (quotes, $ % & | < > ^ ; or line breaks).`
    : null;
}

/** Relative path that can't escape its base: no drive, no root, no `..` out. */
function checkContainedRelative(field: string, value: string): string | null {
  const unsafe = checkShellSafe(field, value);
  if (unsafe) return unsafe;
  // win32.isAbsolute misses drive-relative "C:foo", so check for a drive too.
  if (path.win32.isAbsolute(value) || /^[a-zA-Z]:/.test(value)) {
    return `"${field}" must be a path relative to the server's install directory.`;
  }
  const normalized = path.win32.normalize(value);
  if (normalized === ".." || normalized.startsWith("..\\")) {
    return `"${field}" must stay inside the server's install directory.`;
  }
  return null;
}

/** Returns an error message naming the first bad field, or null. */
export function validatePathFields(
  value: Record<string, unknown>,
  current?: ServerDefinition
): string | null {
  const changed = (key: string) =>
    Object.prototype.hasOwnProperty.call(value, key) && !sameAsStored(key, value[key], current);

  if (changed("dir")) {
    const dir = value.dir;
    if (typeof dir !== "string" || dir === "") return `"dir" must be a non-empty path.`;
    const unsafe = checkShellSafe("dir", dir);
    if (unsafe) return unsafe;
    if (!path.win32.isAbsolute(dir)) return `"dir" must be an absolute path.`;
  }

  for (const key of RELATIVE_PATH_FIELDS) {
    if (!changed(key) || isUnset(value[key])) continue; // unset → adapter default
    const v = value[key];
    if (typeof v !== "string") return `"${key}" must be a string.`;
    const err = checkContainedRelative(key, v);
    if (err) return err;
  }

  if (changed("argFiles") && !isUnset(value.argFiles)) {
    const v = value.argFiles;
    if (!Array.isArray(v) || v.some((f) => typeof f !== "string")) {
      return `"argFiles" must be a list of paths.`;
    }
    for (const f of v as string[]) {
      const err = checkContainedRelative("argFiles", f);
      if (err) return err;
    }
  }

  for (const [key, allowed] of Object.entries(EXECUTABLE_BASENAMES)) {
    if (!changed(key) || isUnset(value[key])) continue;
    const v = value[key];
    if (typeof v !== "string") return `"${key}" must be a string.`;
    const unsafe = checkShellSafe(key, v);
    if (unsafe) return unsafe;
    if (!allowed.includes(path.win32.basename(v).toLowerCase())) {
      return `"${key}" must point to ${allowed.join(" / ")}.`;
    }
  }

  for (const key of SHELL_STRING_FIELDS) {
    if (!changed(key) || isUnset(value[key])) continue;
    const v = value[key];
    if (typeof v !== "string") return `"${key}" must be a string.`;
    const unsafe = checkShellSafe(key, v);
    if (unsafe) return unsafe;
  }

  return null;
}

/**
 * Refuse deleteFiles when `dir` is too broad to delete recursively: not
 * absolute, a drive/filesystem root or one folder under it (C:\Games), or the
 * dashboard's own folder or an ancestor of it. Returns an error or null.
 */
export function checkDeletableDir(dir: string, cwd: string = process.cwd()): string | null {
  const refuse = (why: string) =>
    `Refusing to delete files in "${dir}": ${why}. Remove the server without deleting files and clean up by hand.`;

  if (typeof dir !== "string" || !path.win32.isAbsolute(dir)) {
    return refuse("it isn't an absolute path");
  }

  const resolved = path.win32.resolve(dir);
  const { root } = path.win32.parse(resolved);
  const depth = resolved.slice(root.length).split("\\").filter(Boolean).length;
  if (depth < 2) return refuse("it's a drive root or a top-level folder");

  const key = (p: string) => path.win32.resolve(p).replace(/\\+$/, "").toLowerCase();
  const target = key(dir);
  const dashboard = key(cwd);
  if (dashboard === target || dashboard.startsWith(target + "\\")) {
    return refuse("it contains the dashboard itself");
  }
  return null;
}
