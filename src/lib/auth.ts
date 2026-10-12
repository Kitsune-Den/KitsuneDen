/**
 * Shared-password auth for KitsuneDen.
 *
 * Design (v1):
 * - One shared password. Everyone who's allowed into the Den knows it. It
 *   comes from KITSUNEDEN_PASSWORD, or from first-run setup (an scrypt hash in
 *   data/den-auth.json). den-auth-config.ts owns where it lives.
 * - A successful login sets an HttpOnly cookie containing a signed payload:
 *     base64url(JSON.stringify({ v: 1, iat: <unix-seconds> })) + "." + hmacSha256
 *   We don't need claims-rich JWTs; just "this came from us and isn't expired."
 * - HMAC key is KITSUNEDEN_SESSION_SECRET when set (≥ 32 chars), otherwise a
 *   secret generated once and persisted next to the password hash. The proxy
 *   reads the same source, so a cookie signed here always verifies there.
 *
 * Trade-off: shared password = no per-user audit trail. Rotation means
 * telling everyone the new password. Acceptable for "home dashboard for
 * me + Maltaine + friends"; revisit if the access circle widens.
 */

import { createHmac, timingSafeEqual } from "node:crypto";
import {
  MIN_SESSION_SECRET_LENGTH,
  _resetAuthConfigForTests,
  getSessionSecret as getConfiguredSecret,
  isPasswordConfigured,
  verifyPassword,
} from "@/lib/den-auth-config";

export const SESSION_COOKIE_NAME = "kitsuneden_session";

/** 7 days. Long enough that you don't re-login mid-week; short enough that a
 * forgotten laptop in a coffee shop isn't open forever. */
export const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;

export { MIN_SESSION_SECRET_LENGTH };

interface SessionPayload {
  v: 1;
  /** issued-at, unix seconds */
  iat: number;
}

export const SESSION_SECRET_ERROR =
  "The Den has no session secret yet. Finish first-run setup, or set KITSUNEDEN_SESSION_SECRET (32+ characters).";

/** Throws when no secret is available, which only happens before any
 * password exists; the login route checks isSessionSecretConfigured() first. */
function getSessionSecret(): Buffer {
  const secret = getConfiguredSecret();
  if (!secret) throw new Error(SESSION_SECRET_ERROR);
  return Buffer.from(secret, "utf8");
}

export function isSessionSecretConfigured(): boolean {
  return getConfiguredSecret() !== null;
}

/** Test-only: forget cached auth config. NEVER call this from app code. */
export function _resetSecretCacheForTests(): void {
  _resetAuthConfigForTests();
}

/**
 * Constant-time check of a submitted password against the configured one.
 * Returns false if no password is configured (locks the gate by default —
 * safer than fail-open).
 */
export function checkPassword(submitted: string): boolean {
  return verifyPassword(submitted);
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
 * into a Set-Cookie header value. Throws if KITSUNEDEN_SESSION_SECRET is
 * not configured.
 */
export function signSession(nowSeconds: number = Math.floor(Date.now() / 1000)): string {
  const payload: SessionPayload = { v: 1, iat: nowSeconds };
  const payloadB64 = base64url(Buffer.from(JSON.stringify(payload), "utf8"));
  const sig = createHmac("sha256", getSessionSecret()).update(payloadB64).digest();
  return `${payloadB64}.${base64url(sig)}`;
}

export type VerifyResult =
  | { ok: true; iat: number }
  | { ok: false; reason: "missing" | "malformed" | "bad-signature" | "expired" | "bad-version" | "no-secret" };

/**
 * Verify a session cookie value. Rejects malformed, tampered, expired, and
 * unknown-version sessions. Constant-time signature compare. Fails closed
 * (reason "no-secret") when the session secret isn't configured.
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

  if (!isSessionSecretConfigured()) return { ok: false, reason: "no-secret" };
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
  return isPasswordConfigured();
}

/**
 * Whether to mark the session cookie Secure. Browsers drop Secure cookies
 * set over plain http, so keying this off NODE_ENV broke login for anyone
 * reaching a production build at http://<LAN-IP>:3001. Use the scheme the
 * browser actually used: X-Forwarded-Proto when a reverse proxy / tunnel
 * terminates TLS in front of us, otherwise the request URL.
 *
 * A spoofed X-Forwarded-Proto can only make the cookie *more* restrictive
 * (Secure over http = the browser refuses it), so trusting it is safe here.
 */
export function shouldUseSecureCookie(request: Request): boolean {
  const forwarded = request.headers.get("x-forwarded-proto");
  if (forwarded) {
    return forwarded.split(",")[0].trim().toLowerCase() === "https";
  }
  try {
    return new URL(request.url).protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Sign a fresh session and attach it to `response`. Shared by login, first-run
 * setup and password changes so the cookie attributes can't drift apart.
 */
export function setSessionCookie(response: { cookies: { set: (c: {
  name: string; value: string; httpOnly: boolean; sameSite: "lax"; secure: boolean; path: string; maxAge: number;
}) => unknown } }, request: Request): void {
  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: signSession(),
    httpOnly: true,
    sameSite: "lax",
    secure: shouldUseSecureCookie(request),
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}
