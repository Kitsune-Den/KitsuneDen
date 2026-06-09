/**
 * Shared-password auth for KitsuneDen.
 *
 * Design (v1):
 * - One password lives in env (KITSUNEDEN_PASSWORD). Everyone who's allowed
 *   into the Den knows it.
 * - A successful login sets an HttpOnly cookie containing a signed payload:
 *     base64url(JSON.stringify({ v: 1, iat: <unix-seconds> })) + "." + hmacSha256
 *   We don't need claims-rich JWTs; just "this came from us and isn't expired."
 * - HMAC key is KITSUNEDEN_SESSION_SECRET (any random string ≥ 32 bytes).
 *   If unset we still boot in dev with an in-memory key + loud warning, so a
 *   fresh `npm run dev` works without a six-step setup — but a server restart
 *   invalidates all sessions and we yell about it.
 *
 * Trade-off: shared password = no per-user audit trail. Rotation means
 * telling everyone the new password. Acceptable for "home dashboard for
 * me + Maltaine + friends"; revisit if the access circle widens.
 */

import { createHmac, timingSafeEqual, randomBytes } from "node:crypto";

export const SESSION_COOKIE_NAME = "kitsuneden_session";

/** 7 days. Long enough that you don't re-login mid-week; short enough that a
 * forgotten laptop in a coffee shop isn't open forever. */
export const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;

interface SessionPayload {
  v: 1;
  /** issued-at, unix seconds */
  iat: number;
}

/** Cached at module-load. We deliberately do NOT re-read env on every request
 * — a swap of KITSUNEDEN_SESSION_SECRET requires a restart, which is exactly
 * the behavior we want (rotating the secret should invalidate sessions). */
let cachedSecret: Buffer | null = null;

function getSessionSecret(): Buffer {
  if (cachedSecret) return cachedSecret;

  const fromEnv = process.env.KITSUNEDEN_SESSION_SECRET;
  if (fromEnv && fromEnv.length >= 32) {
    cachedSecret = Buffer.from(fromEnv, "utf8");
    return cachedSecret;
  }

  // No (or too-short) secret. Generate a one-process-lifetime key so the app
  // still runs, but make it impossible to miss in the logs.
  const generated = randomBytes(32);
  cachedSecret = generated;
  console.warn(
    "\n========================================================================\n" +
      "  KITSUNEDEN_SESSION_SECRET is unset or shorter than 32 chars.\n" +
      "  Generated a random key for THIS process only — sessions will be\n" +
      "  invalidated on every restart. Set KITSUNEDEN_SESSION_SECRET in\n" +
      "  .env or your service environment before deploying.\n" +
      "========================================================================\n"
  );
  return cachedSecret;
}

/** Test-only: forget the cached secret. NEVER call this from app code. */
export function _resetSecretCacheForTests(): void {
  cachedSecret = null;
}

function getConfiguredPassword(): string | null {
  const p = process.env.KITSUNEDEN_PASSWORD;
  if (!p || p.length === 0) return null;
  return p;
}

/**
 * Constant-time compare between the user's submitted password and the
 * configured one. Returns false if no password is configured (locks the
 * gate by default — safer than fail-open).
 */
export function checkPassword(submitted: string): boolean {
  const expected = getConfiguredPassword();
  if (expected === null) return false;
  if (typeof submitted !== "string") return false;

  // timingSafeEqual requires equal-length buffers. Hash both sides first
  // so length doesn't leak and we get fixed-length input either way.
  const a = createHmac("sha256", "compare").update(submitted).digest();
  const b = createHmac("sha256", "compare").update(expected).digest();
  return timingSafeEqual(a, b);
}

function base64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64urlDecode(s: string): Buffer {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/") + pad, "base64");
}

/**
 * Create a signed session cookie value with `iat = now` (or the supplied
 * timestamp, used by tests). The returned string is safe to put straight
 * into a Set-Cookie header value.
 */
export function signSession(nowSeconds: number = Math.floor(Date.now() / 1000)): string {
  const payload: SessionPayload = { v: 1, iat: nowSeconds };
  const payloadB64 = base64url(Buffer.from(JSON.stringify(payload), "utf8"));
  const sig = createHmac("sha256", getSessionSecret()).update(payloadB64).digest();
  return `${payloadB64}.${base64url(sig)}`;
}

export type VerifyResult =
  | { ok: true; iat: number }
  | { ok: false; reason: "missing" | "malformed" | "bad-signature" | "expired" | "bad-version" };

/**
 * Verify a session cookie value. Rejects malformed, tampered, expired, and
 * unknown-version sessions. Constant-time signature compare.
 */
export function verifySession(
  cookieValue: string | undefined | null,
  nowSeconds: number = Math.floor(Date.now() / 1000)
): VerifyResult {
  if (!cookieValue) return { ok: false, reason: "missing" };

  const dot = cookieValue.indexOf(".");
  if (dot < 1 || dot === cookieValue.length - 1) return { ok: false, reason: "malformed" };

  const payloadB64 = cookieValue.slice(0, dot);
  const sigB64 = cookieValue.slice(dot + 1);

  const expectedSig = createHmac("sha256", getSessionSecret()).update(payloadB64).digest();
  let actualSig: Buffer;
  try {
    actualSig = base64urlDecode(sigB64);
  } catch {
    return { ok: false, reason: "malformed" };
  }
  if (actualSig.length !== expectedSig.length) return { ok: false, reason: "bad-signature" };
  if (!timingSafeEqual(actualSig, expectedSig)) return { ok: false, reason: "bad-signature" };

  let payload: SessionPayload;
  try {
    payload = JSON.parse(base64urlDecode(payloadB64).toString("utf8")) as SessionPayload;
  } catch {
    return { ok: false, reason: "malformed" };
  }

  if (payload.v !== 1) return { ok: false, reason: "bad-version" };
  if (typeof payload.iat !== "number" || !Number.isFinite(payload.iat)) {
    return { ok: false, reason: "malformed" };
  }

  if (nowSeconds - payload.iat > SESSION_TTL_SECONDS) {
    return { ok: false, reason: "expired" };
  }
  // Reject sessions from "the future" (clock skew of more than a minute is
  // probably tampering or a desynced server, not a legit issuance).
  if (payload.iat - nowSeconds > 60) {
    return { ok: false, reason: "malformed" };
  }

  return { ok: true, iat: payload.iat };
}

/**
 * True when a password is configured — used by the login page / middleware
 * to fail loudly during setup rather than silently locking the dashboard
 * with an unguessable random gate.
 */
export function isAuthConfigured(): boolean {
  return getConfiguredPassword() !== null;
}
