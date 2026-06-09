/**
 * Edge-compatible session verifier for the Next.js proxy (formerly middleware).
 *
 * Mirrors verifySession() in auth.ts but uses Web Crypto (globalThis.crypto.subtle)
 * instead of node:crypto, so it works in the edge runtime that proxy.ts runs on.
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
 * Read the session secret in an edge-safe way. Same fallback policy as
 * auth.ts (warn and use a process-lifetime key) — but since the edge runtime
 * may not share process memory with the Node runtime, we don't try to
 * generate-and-share here; we just return an empty marker the proxy treats
 * as "no auth configured." That's what isAuthConfiguredEdge below is for.
 */
export function getSessionSecretEdge(): string | null {
  const s = process.env.KITSUNEDEN_SESSION_SECRET;
  if (!s || s.length < 32) return null;
  return s;
}

export function isAuthConfiguredEdge(): boolean {
  return (process.env.KITSUNEDEN_PASSWORD?.length ?? 0) > 0;
}
