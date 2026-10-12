import crypto from "crypto";
import fs from "fs";
import path from "path";
import { dataDir } from "@/lib/data-dir";

/**
 * Where the Den's password and session secret come from.
 *
 * 1. Environment (KITSUNEDEN_PASSWORD / KITSUNEDEN_SESSION_SECRET) wins when
 *    set, so existing .env installs behave exactly as before.
 * 2. Otherwise data/den-auth.json, written by first-run setup (/setup) and by
 *    the password form in Settings. It holds an scrypt hash of the password,
 *    never the password itself, plus a generated session secret.
 *
 * Both the login route and the proxy read this module, and the proxy runs on
 * the Node.js runtime in Next 16, so they always agree on the secret. A
 * persisted secret is what makes it safe to generate one automatically: the
 * old in-memory random fallback produced cookies the proxy couldn't verify.
 *
 * First-run setup is guarded by a one-time code printed to the server log and
 * written to data/setup-code.txt. The Den listens on the LAN, so without it
 * whoever reached the page first could claim the dashboard.
 */

export const MIN_SESSION_SECRET_LENGTH = 32;
export const MIN_PASSWORD_LENGTH = 8;

const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_KEYLEN = 32;
const MAX_SETUP_ATTEMPTS = 10;

interface PasswordHash {
  algo: "scrypt";
  N: number;
  r: number;
  p: number;
  salt: string;
  hash: string;
}

interface AuthFile {
  v: 1;
  password?: PasswordHash;
  sessionSecret?: string;
  updatedAt?: string;
}

export type PasswordSource = "env" | "file" | null;

// ---- Paths ----

export { dataDir };

export function authFilePath(): string {
  return path.join(dataDir(), "den-auth.json");
}

export function setupCodePath(): string {
  return path.join(dataDir(), "setup-code.txt");
}

// ---- Auth file (cached by mtime, so edits from another request show up at once) ----

let cache: { file: string; mtimeMs: number; data: AuthFile | null } | null = null;

function readAuthFile(): AuthFile | null {
  const file = authFilePath();
  let mtimeMs: number;
  try {
    mtimeMs = fs.statSync(file).mtimeMs;
  } catch {
    cache = { file, mtimeMs: -1, data: null };
    return null;
  }
  if (cache && cache.file === file && cache.mtimeMs === mtimeMs) return cache.data;
  let data: AuthFile | null = null;
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    if (parsed && parsed.v === 1) data = parsed as AuthFile;
  } catch {
    data = null; // unreadable file: treat as absent rather than crash the gate
  }
  cache = { file, mtimeMs, data };
  return data;
}

function writeAuthFile(data: AuthFile) {
  const file = authFilePath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify({ ...data, updatedAt: new Date().toISOString() }, null, 2), {
    encoding: "utf8",
    mode: 0o600,
  });
  fs.renameSync(tmp, file);
  cache = null;
}

/** Test hook: forget cached file contents and the in-memory setup state. */
export function _resetAuthConfigForTests() {
  cache = null;
  setupCode = null;
  setupAttempts = 0;
}

// ---- Password ----

function envPassword(): string | null {
  const p = process.env.KITSUNEDEN_PASSWORD;
  return p && p.length > 0 ? p : null;
}

export function passwordSource(): PasswordSource {
  if (envPassword()) return "env";
  return readAuthFile()?.password ? "file" : null;
}

export function isPasswordConfigured(): boolean {
  return passwordSource() !== null;
}

function hashPassword(password: string): PasswordHash {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, SCRYPT_KEYLEN, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P });
  return { algo: "scrypt", N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P, salt: salt.toString("base64"), hash: hash.toString("base64") };
}

function matchesHash(submitted: string, stored: PasswordHash): boolean {
  if (stored.algo !== "scrypt") return false;
  const expected = Buffer.from(stored.hash, "base64");
  const actual = crypto.scryptSync(submitted, Buffer.from(stored.salt, "base64"), expected.length, {
    N: stored.N,
    r: stored.r,
    p: stored.p,
  });
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

/** Constant-time check against whichever password is configured. False when none is. */
export function verifyPassword(submitted: unknown): boolean {
  if (typeof submitted !== "string") return false;
  const env = envPassword();
  if (env) {
    // Hash both sides so the compare is fixed-length and length doesn't leak.
    const a = crypto.createHmac("sha256", "compare").update(submitted).digest();
    const b = crypto.createHmac("sha256", "compare").update(env).digest();
    return crypto.timingSafeEqual(a, b);
  }
  const stored = readAuthFile()?.password;
  return stored ? matchesHash(submitted, stored) : false;
}

export function passwordProblem(password: unknown): string | null {
  if (typeof password !== "string" || password.length < MIN_PASSWORD_LENGTH) {
    return `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  if (password.length > 256) return "That's a bit long. Keep it under 256 characters.";
  return null;
}

// ---- Session secret ----

function newSecret(): string {
  return crypto.randomBytes(48).toString("base64url");
}

/**
 * The HMAC key for session cookies: the env value when it's long enough,
 * else the persisted one. Once a password exists a secret is generated and
 * saved on first use, so a half-configured .env no longer locks anyone out.
 * Null only while the Den has no password at all.
 */
export function getSessionSecret(): string | null {
  const env = process.env.KITSUNEDEN_SESSION_SECRET;
  if (env && env.length >= MIN_SESSION_SECRET_LENGTH) return env;
  const file = readAuthFile();
  if (file?.sessionSecret && file.sessionSecret.length >= MIN_SESSION_SECRET_LENGTH) return file.sessionSecret;
  if (!isPasswordConfigured()) return null;
  try {
    const secret = newSecret();
    writeAuthFile({ ...(file ?? { v: 1 }), v: 1, sessionSecret: secret });
    return secret;
  } catch {
    return null;
  }
}

/** True when the env secret is in charge, so rotating the file one would change nothing. */
export function sessionSecretFromEnv(): boolean {
  const env = process.env.KITSUNEDEN_SESSION_SECRET;
  return !!env && env.length >= MIN_SESSION_SECRET_LENGTH;
}

// ---- First-run setup ----

let setupCode: string | null = null;
let setupAttempts = 0;

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O or 1/I

function generateCode(): string {
  const bytes = crypto.randomBytes(8);
  let out = "";
  for (let i = 0; i < 8; i++) out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  return `${out.slice(0, 4)}-${out.slice(4)}`;
}

function normalizeCode(code: string): string {
  return code.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function announce(code: string) {
  const line = "=".repeat(60);
  console.log(
    `\n${line}\n  KitsuneDen first-run setup\n\n  Open the dashboard in a browser and enter this setup code:\n\n      ${code}\n\n  (Also saved to ${setupCodePath()})\n${line}\n`
  );
}

/**
 * The current one-time setup code, creating (and announcing) one if needed.
 * Reuses a code left in setup-code.txt by an earlier run so a restart doesn't
 * invalidate what the operator already copied. Null once setup is done.
 */
export function getOrCreateSetupCode(): string | null {
  if (isPasswordConfigured()) return null;
  if (setupCode) return setupCode;
  try {
    const existing = fs.readFileSync(setupCodePath(), "utf8").trim();
    if (/^[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(existing)) {
      setupCode = existing;
      announce(setupCode);
      return setupCode;
    }
  } catch {
    // no saved code yet
  }
  rotateSetupCode();
  return setupCode;
}

function rotateSetupCode() {
  setupCode = generateCode();
  setupAttempts = 0;
  try {
    fs.mkdirSync(dataDir(), { recursive: true });
    fs.writeFileSync(setupCodePath(), setupCode + "\n", { encoding: "utf8", mode: 0o600 });
  } catch {
    // the log line below still carries it
  }
  announce(setupCode);
}

export type SetupResult = { ok: true } | { ok: false; status: number; error: string };

/**
 * Claim the Den: check the setup code, save the password hash and a session
 * secret. Refused once a password exists. Too many wrong codes replace the
 * code, so it can't be ground down over the network.
 */
export function completeSetup(code: unknown, password: unknown): SetupResult {
  if (isPasswordConfigured()) return { ok: false, status: 409, error: "The Den already has a password." };
  const expected = getOrCreateSetupCode();
  if (!expected) return { ok: false, status: 409, error: "The Den already has a password." };

  const a = crypto.createHmac("sha256", "setup").update(normalizeCode(typeof code === "string" ? code : "")).digest();
  const b = crypto.createHmac("sha256", "setup").update(normalizeCode(expected)).digest();
  if (!crypto.timingSafeEqual(a, b)) {
    setupAttempts++;
    if (setupAttempts >= MAX_SETUP_ATTEMPTS) {
      rotateSetupCode();
      return { ok: false, status: 429, error: "Too many wrong codes. A new code has been printed to the server log." };
    }
    return { ok: false, status: 403, error: "That setup code doesn't match." };
  }

  const problem = passwordProblem(password);
  if (problem) return { ok: false, status: 400, error: problem };

  const existing = readAuthFile();
  writeAuthFile({
    v: 1,
    password: hashPassword(password as string),
    sessionSecret:
      existing?.sessionSecret && existing.sessionSecret.length >= MIN_SESSION_SECRET_LENGTH
        ? existing.sessionSecret
        : newSecret(),
  });
  setupCode = null;
  setupAttempts = 0;
  try {
    fs.rmSync(setupCodePath(), { force: true });
  } catch {}
  return { ok: true };
}

/**
 * Change a file-managed password. With rotateSessions the session secret is
 * replaced too, which signs out every existing session (the caller re-issues
 * a cookie for whoever made the change).
 */
export function changePassword(current: unknown, next: unknown, rotateSessions: boolean): SetupResult {
  if (passwordSource() === "env") {
    return { ok: false, status: 409, error: "The password comes from KITSUNEDEN_PASSWORD. Change it in .env and restart." };
  }
  if (!verifyPassword(current)) return { ok: false, status: 403, error: "Current password is wrong." };
  const problem = passwordProblem(next);
  if (problem) return { ok: false, status: 400, error: problem };
  const existing = readAuthFile() ?? { v: 1 as const };
  writeAuthFile({
    ...existing,
    v: 1,
    password: hashPassword(next as string),
    sessionSecret: rotateSessions || !existing.sessionSecret ? newSecret() : existing.sessionSecret,
  });
  return { ok: true };
}
