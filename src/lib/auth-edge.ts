import { getSessionSecret, isPasswordConfigured } from "@/lib/den-auth-config";

/**
 * Session verifier for the Next.js proxy (formerly middleware).
 *
 * Mirrors verifySession() in auth.ts using Web Crypto (globalThis.crypto.subtle).
 * Next 16 runs the proxy on Node.js, so the secret and password checks below
 * share den-auth-config.ts with auth.ts; only the HMAC verify stays here.
 * Same wire format: base64url(JSON.stringify({v:1,iat})) + "." + base64url(HMAC-SHA256)
 *
 * Why duplicate the verify logic? Because pulling node:crypto into a proxy is a
 * webpack-bundling foot-gun (edge runtime doesn't ship node: prefixes). Keeping
 * the proxy strictly edge-compatible means we never have to fight the bundler.
 *
 * Keep the constants here in sync with auth.ts.
 */

export const SESSION_COOKIE_NAME = "kitsuneden_session";
export const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;

interface SessionPayload {
  v: 1;
  iat: number;
}

function base64urlDecode(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + pad;
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

/** Edge-safe verify. Returns true iff signature checks out AND payload is
 * within the TTL window. We deliberately return a plain boolean here (no
 * reason taxonomy like auth.ts) — the proxy only needs go/no-go. */
export async function verifySessionEdge(
  cookieValue: string | undefined | null,
  secret: string,
  nowSeconds: number = Math.floor(Date.now() / 1000)
): Promise<boolean> {
  if (!cookieValue) return false;
  const dot = cookieValue.indexOf(".");
  if (dot < 1 || dot === cookieValue.length - 1) return false;

  const payloadB64 = cookieValue.slice(0, dot);
  const sigB64 = cookieValue.slice(dot + 1);

  let providedSig: Uint8Array;
  try {
    providedSig = base64urlDecode(sigB64);
  } catch {
    return false;
  }

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"]
  );
  const ok = await crypto.subtle.verify(
    "HMAC",
    key,
    providedSig as BufferSource,
    new TextEncoder().encode(payloadB64)
  );
  if (!ok) return false;

  let payload: SessionPayload;
  try {
    payload = JSON.parse(new TextDecoder().decode(base64urlDecode(payloadB64))) as SessionPayload;
  } catch {
    return false;
  }
  if (payload.v !== 1) return false;
  if (typeof payload.iat !== "number" || !Number.isFinite(payload.iat)) return false;
  if (nowSeconds - payload.iat > SESSION_TTL_SECONDS) return false;
  // Sessions issued >60s in the future are suspect.
  if (payload.iat - nowSeconds > 60) return false;
  return true;
}

/**
 * The session secret the proxy verifies against: the same one auth.ts signs
 * with (env, else the persisted one), so the two can never disagree.
 * Null only while the Den has no password yet.
 */
export function getSessionSecretEdge(): string | null {
  return getSessionSecret();
}

/** False until a password exists (env or first-run setup). */
export function isAuthConfiguredEdge(): boolean {
  return isPasswordConfigured();
}
