import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  _resetSecretCacheForTests,
  SESSION_TTL_SECONDS,
  checkPassword,
  isAuthConfigured,
  signSession,
  verifySession,
} from "../lib/auth";

const TEST_SECRET = "test-secret-thats-definitely-at-least-32-bytes-long";
const TEST_PASSWORD = "correct-horse-battery-staple";

describe("auth", () => {
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

  describe("checkPassword", () => {
    it("accepts the configured password", () => {
      expect(checkPassword(TEST_PASSWORD)).toBe(true);
    });

    it("rejects a wrong password", () => {
      expect(checkPassword("definitely-wrong")).toBe(false);
    });

    it("rejects empty string", () => {
      expect(checkPassword("")).toBe(false);
    });

    it("rejects a near-miss (case + trailing space)", () => {
      expect(checkPassword(TEST_PASSWORD + " ")).toBe(false);
      expect(checkPassword(TEST_PASSWORD.toUpperCase())).toBe(false);
    });

    it("locks the gate when no password is configured (fail-closed)", () => {
      delete process.env.KITSUNEDEN_PASSWORD;
      expect(checkPassword(TEST_PASSWORD)).toBe(false);
      expect(checkPassword("anything")).toBe(false);
      expect(isAuthConfigured()).toBe(false);
    });
  });

  describe("signSession / verifySession round-trip", () => {
    it("a freshly signed session verifies", () => {
      const cookie = signSession();
      const result = verifySession(cookie);
      expect(result.ok).toBe(true);
    });

    it("includes the iat in the verified result", () => {
      const now = 1_700_000_000;
      const cookie = signSession(now);
      const result = verifySession(cookie, now + 60);
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.iat).toBe(now);
    });
  });

  describe("verifySession rejection paths", () => {
    it("rejects missing/empty cookie", () => {
      expect(verifySession(null)).toEqual({ ok: false, reason: "missing" });
      expect(verifySession(undefined)).toEqual({ ok: false, reason: "missing" });
      expect(verifySession("")).toEqual({ ok: false, reason: "missing" });
    });

    it("rejects cookies without a dot separator", () => {
      expect(verifySession("nodotshere").ok).toBe(false);
    });

    it("rejects cookies with tampered payload (signature mismatch)", () => {
      const cookie = signSession();
      const [, sig] = cookie.split(".");
      // Swap in a different (still valid-looking) payload but keep the old sig.
      const tampered = `${Buffer.from('{"v":1,"iat":1}').toString("base64url")}.${sig}`;
      const result = verifySession(tampered);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toBe("bad-signature");
    });

    it("rejects cookies signed with a different secret", () => {
      const cookie = signSession();
      // Swap the secret out and try again.
      process.env.KITSUNEDEN_SESSION_SECRET = "different-but-also-32-chars-long-yep!";
      _resetSecretCacheForTests();
      const result = verifySession(cookie);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toBe("bad-signature");
    });

    it("rejects sessions older than SESSION_TTL_SECONDS", () => {
      const issuedAt = 1_700_000_000;
      const cookie = signSession(issuedAt);
      const justExpired = issuedAt + SESSION_TTL_SECONDS + 1;
      const result = verifySession(cookie, justExpired);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toBe("expired");
    });

    it("accepts a session right at the TTL boundary", () => {
      const issuedAt = 1_700_000_000;
      const cookie = signSession(issuedAt);
      const atBoundary = issuedAt + SESSION_TTL_SECONDS;
      expect(verifySession(cookie, atBoundary).ok).toBe(true);
    });

    it("rejects sessions issued more than 60s in the future (clock-skew sanity)", () => {
      const issuedAt = 1_700_000_000;
      const cookie = signSession(issuedAt);
      const result = verifySession(cookie, issuedAt - 120);
      expect(result.ok).toBe(false);
    });
  });
});
