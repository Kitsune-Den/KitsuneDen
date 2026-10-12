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
 */

import type { ServerDefinition } from "./adapters/types";

export const SECRET_FIELDS = [
  "rconPassword",
  "telnetPassword",
  "controlPanelPassword",
  "restApiPassword",
] as const;

export type SecretField = (typeof SECRET_FIELDS)[number];

/** Fields the API refuses to write. Edit servers.json on the host instead. */
export const SERVERS_JSON_ONLY_FIELDS = ["lifecycle"] as const;

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
 */
export function sanitizeServerWrite(input: Record<string, unknown>): SanitizeResult {
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
  return { ok: true, value };
}
