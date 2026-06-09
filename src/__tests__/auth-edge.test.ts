import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { _resetSecretCacheForTests, signSession } from "../lib/auth";
import { SESSION_TTL_SECONDS, verifySessionEdge } from "../lib/auth-edge";

/**
 * Wire-compat tests: the proxy verifies with Web Crypto, the API routes sign
 * with node:crypto. These have to agree on the byte layout, or login appears
 * to succeed but every subsequent request fails. Worth a few explicit tests.
 */

const TEST_SECRET = "test-secret-thats-definitely-at-least-32-bytes-long";

describe("auth-edge ↔ auth wire compatibility", () => {
  let savedSecret: string | undefined;

  beforeEach(() => {
    savedSecret = process.env.KITSUNEDEN_SESSION_SECRET;
    process.env.KITSUNEDEN_SESSION_SECRET = TEST_SECRET;
    _resetSecretCacheForTests();
  });

  afterEach(() => {
    if (savedSecret === undefined) delete process.env.KITSUNEDEN_SESSION_SECRET;
    else process.env.KITSUNEDEN_SESSION_SECRET = savedSecret;
    _resetSecretCacheForTests();
  });

  it("a session signed with node:crypto verifies with Web Crypto", async () => {
    const cookie = signSession(1_700_000_000);
    const ok = await verifySessionEdge(cookie, TEST_SECRET, 1_700_000_060);
    expect(ok).toBe(true);
  });

  it("edge verifier rejects a tampered payload", async () => {
    const cookie = signSession(1_700_000_000);
    const [, sig] = cookie.split(".");
    const tampered = `${Buffer.from('{"v":1,"iat":1}').toString("base64url")}.${sig}`;
    expect(await verifySessionEdge(tampered, TEST_SECRET)).toBe(false);
  });

  it("edge verifier rejects a session signed with a different secret", async () => {
    const cookie = signSession(1_700_000_000);
    const otherSecret = "different-but-still-32-bytes-long-yes!!";
    expect(await verifySessionEdge(cookie, otherSecret, 1_700_000_060)).toBe(false);
  });

  it("edge verifier rejects an expired session", async () => {
    const cookie = signSession(1_700_000_000);
    expect(
      await verifySessionEdge(cookie, TEST_SECRET, 1_700_000_000 + SESSION_TTL_SECONDS + 1)
    ).toBe(false);
  });

  it("edge verifier accepts the right-at-the-TTL-boundary case", async () => {
    const cookie = signSession(1_700_000_000);
    expect(
      await verifySessionEdge(cookie, TEST_SECRET, 1_700_000_000 + SESSION_TTL_SECONDS)
    ).toBe(true);
  });

  it("edge verifier rejects missing/malformed cookies", async () => {
    expect(await verifySessionEdge(null, TEST_SECRET)).toBe(false);
    expect(await verifySessionEdge("", TEST_SECRET)).toBe(false);
    expect(await verifySessionEdge("nodothere", TEST_SECRET)).toBe(false);
    expect(await verifySessionEdge(".onlysig", TEST_SECRET)).toBe(false);
    expect(await verifySessionEdge("onlypayload.", TEST_SECRET)).toBe(false);
  });
});
