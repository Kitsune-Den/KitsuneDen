import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import {
  _resetSecretCacheForTests,
  isSessionSecretConfigured,
  shouldUseSecureCookie,
  signSession,
  verifySession,
} from "../lib/auth";
import { getSessionSecretEdge, verifySessionEdge } from "../lib/auth-edge";
import { POST as login } from "../app/api/auth/login/route";
import { POST as logout } from "../app/api/auth/logout/route";

/**
 * Two setup foot-guns:
 *  1. KITSUNEDEN_PASSWORD set, KITSUNEDEN_SESSION_SECRET unset → auth.ts used
 *     to sign with a random in-process key the edge proxy can never verify,
 *     so login "succeeded" and then bounced straight back to /login.
 *  2. The cookie was Secure whenever NODE_ENV=production, so a production
 *     build reached over http://<LAN-IP> got a cookie the browser discards.
 */

const TEST_SECRET = "test-secret-thats-definitely-at-least-32-bytes-long";
const TEST_PASSWORD = "correct-horse-battery-staple";

let savedSecret: string | undefined;
let savedPassword: string | undefined;

beforeEach(() => {
  savedSecret = process.env.KITSUNEDEN_SESSION_SECRET;
  savedPassword = process.env.KITSUNEDEN_PASSWORD;
  process.env.KITSUNEDEN_SESSION_SECRET = TEST_SECRET;
  process.env.KITSUNEDEN_PASSWORD = TEST_PASSWORD;
  _resetSecretCacheForTests();
});

afterEach(() => {
  if (savedSecret === undefined) delete process.env.KITSUNEDEN_SESSION_SECRET;
  else process.env.KITSUNEDEN_SESSION_SECRET = savedSecret;
  if (savedPassword === undefined) delete process.env.KITSUNEDEN_PASSWORD;
  else process.env.KITSUNEDEN_PASSWORD = savedPassword;
  _resetSecretCacheForTests();
});

function loginRequest(url: string, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify({ password: TEST_PASSWORD }),
  });
}

function sessionSetCookie(res: Response): string {
  const header = res.headers.get("set-cookie") ?? "";
  expect(header).toContain("kitsuneden_session=");
  return header;
}

describe("missing session secret", () => {
  for (const [label, value] of [
    ["unset", undefined],
    ["too short", "only-31-characters-long-oops!!!"],
  ] as const) {
    it(`is reported as unconfigured when ${label}`, () => {
      if (value === undefined) delete process.env.KITSUNEDEN_SESSION_SECRET;
      else process.env.KITSUNEDEN_SESSION_SECRET = value;
      expect(isSessionSecretConfigured()).toBe(false);
      expect(getSessionSecretEdge()).toBeNull();
    });
  }

  it("signSession refuses instead of using a throwaway random key", () => {
    delete process.env.KITSUNEDEN_SESSION_SECRET;
    expect(() => signSession()).toThrow(/KITSUNEDEN_SESSION_SECRET/);
  });

  it("verifySession fails closed", () => {
    const cookie = signSession();
    delete process.env.KITSUNEDEN_SESSION_SECRET;
    _resetSecretCacheForTests();
    expect(verifySession(cookie)).toEqual({ ok: false, reason: "no-secret" });
  });

  it("login returns 503 naming the variable and sets no cookie", async () => {
    delete process.env.KITSUNEDEN_SESSION_SECRET;
    const res = await login(loginRequest("http://192.168.1.20:3001/api/auth/login"));
    expect(res.status).toBe(503);
    expect((await res.json()).error).toMatch(/KITSUNEDEN_SESSION_SECRET/);
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("a cookie from login verifies in the edge proxy with the env secret", async () => {
    const res = await login(loginRequest("http://192.168.1.20:3001/api/auth/login"));
    expect(res.status).toBe(200);
    const value = /kitsuneden_session=([^;]+)/.exec(sessionSetCookie(res))![1];
    expect(await verifySessionEdge(value, getSessionSecretEdge()!)).toBe(true);
  });
});

describe("shouldUseSecureCookie", () => {
  const req = (url: string, headers: Record<string, string> = {}) => new Request(url, { headers });

  it("is false over plain http (LAN IP)", () => {
    expect(shouldUseSecureCookie(req("http://192.168.1.20:3001/api/auth/login"))).toBe(false);
  });

  it("is true over https", () => {
    expect(shouldUseSecureCookie(req("https://den.example.com/api/auth/login"))).toBe(true);
  });

  it("honours X-Forwarded-Proto from a TLS-terminating proxy", () => {
    expect(
      shouldUseSecureCookie(req("http://127.0.0.1:3001/api/auth/login", { "x-forwarded-proto": "https" }))
    ).toBe(true);
    expect(
      shouldUseSecureCookie(req("http://127.0.0.1:3001/x", { "x-forwarded-proto": "HTTPS, http" }))
    ).toBe(true);
    expect(
      shouldUseSecureCookie(req("https://127.0.0.1:3001/x", { "x-forwarded-proto": "http" }))
    ).toBe(false);
  });
});

describe("session cookie Secure flag", () => {
  const savedEnv = process.env.NODE_ENV;
  const env = process.env as Record<string, string | undefined>;
  beforeEach(() => {
    env.NODE_ENV = "production";
  });
  afterEach(() => {
    env.NODE_ENV = savedEnv;
  });

  it("login over http://<LAN-IP> in production sets a non-Secure cookie", async () => {
    const res = await login(loginRequest("http://192.168.1.20:3001/api/auth/login"));
    expect(res.status).toBe(200);
    expect(sessionSetCookie(res).toLowerCase()).not.toContain("secure");
  });

  it("login over https sets a Secure cookie", async () => {
    const res = await login(loginRequest("https://den.example.com/api/auth/login"));
    expect(sessionSetCookie(res).toLowerCase()).toContain("secure");
  });

  it("login behind a TLS tunnel (X-Forwarded-Proto: https) sets a Secure cookie", async () => {
    const res = await login(
      loginRequest("http://127.0.0.1:3001/api/auth/login", { "x-forwarded-proto": "https" })
    );
    expect(sessionSetCookie(res).toLowerCase()).toContain("secure");
  });

  it("logout clears the cookie with matching attributes", async () => {
    const http = await logout(new NextRequest("http://192.168.1.20:3001/api/auth/logout", { method: "POST" }));
    expect(sessionSetCookie(http).toLowerCase()).not.toContain("secure");
    const https = await logout(new NextRequest("https://den.example.com/api/auth/logout", { method: "POST" }));
    expect(sessionSetCookie(https).toLowerCase()).toContain("secure");
  });
});
