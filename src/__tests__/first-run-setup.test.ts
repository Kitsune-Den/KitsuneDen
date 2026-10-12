import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { NextRequest } from "next/server";
import {
  _resetAuthConfigForTests,
  authFilePath,
  getOrCreateSetupCode,
  getSessionSecret,
  isPasswordConfigured,
  passwordSource,
  setupCodePath,
  verifyPassword,
} from "../lib/den-auth-config";
import { verifySession } from "../lib/auth";
import { GET as setupStatus, POST as setup } from "../app/api/setup/route";
import { GET as passwordInfo, POST as changePassword } from "../app/api/account/password/route";
import { POST as login } from "../app/api/auth/login/route";
import { proxy } from "../proxy";

const PASSWORD = "lanterns-are-lit";

let savedPassword: string | undefined;
let savedSecret: string | undefined;

beforeEach(() => {
  savedPassword = process.env.KITSUNEDEN_PASSWORD;
  savedSecret = process.env.KITSUNEDEN_SESSION_SECRET;
  delete process.env.KITSUNEDEN_PASSWORD;
  delete process.env.KITSUNEDEN_SESSION_SECRET;
  fs.rmSync(authFilePath(), { force: true });
  fs.rmSync(setupCodePath(), { force: true });
  _resetAuthConfigForTests();
});

afterEach(() => {
  if (savedPassword === undefined) delete process.env.KITSUNEDEN_PASSWORD;
  else process.env.KITSUNEDEN_PASSWORD = savedPassword;
  if (savedSecret === undefined) delete process.env.KITSUNEDEN_SESSION_SECRET;
  else process.env.KITSUNEDEN_SESSION_SECRET = savedSecret;
  _resetAuthConfigForTests();
});

const json = (url: string, body: unknown, headers: Record<string, string> = {}) =>
  new NextRequest(url, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });

const cookieFrom = (res: Response) => /kitsuneden_session=([^;]+)/.exec(res.headers.get("set-cookie") ?? "")?.[1] ?? null;

async function runSetup(password = PASSWORD) {
  const code = getOrCreateSetupCode()!;
  return setup(json("http://localhost:3001/api/setup", { code, password }));
}

describe("fresh install", () => {
  it("has no password and no session secret", () => {
    expect(isPasswordConfigured()).toBe(false);
    expect(getSessionSecret()).toBeNull();
    // Nothing gets written just by asking.
    expect(fs.existsSync(authFilePath())).toBe(false);
  });

  it("GET /api/setup reports setup is needed and writes the code file", async () => {
    const res = await setupStatus();
    expect(await res.json()).toMatchObject({ needsSetup: true, minPasswordLength: 8 });
    expect(fs.readFileSync(setupCodePath(), "utf8").trim()).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/);
  });

  it("reuses the saved code after a restart", () => {
    const first = getOrCreateSetupCode();
    _resetAuthConfigForTests();
    expect(getOrCreateSetupCode()).toBe(first);
  });
});

describe("POST /api/setup", () => {
  it("rejects a wrong code", async () => {
    getOrCreateSetupCode();
    const res = await setup(json("http://localhost:3001/api/setup", { code: "AAAA-AAAA", password: PASSWORD }));
    expect(res.status).toBe(403);
    expect(isPasswordConfigured()).toBe(false);
  });

  it("replaces the code after too many wrong guesses", async () => {
    const first = getOrCreateSetupCode();
    let res: Response | null = null;
    for (let i = 0; i < 10; i++) {
      res = await setup(json("http://localhost:3001/api/setup", { code: "ZZZZ-ZZZZ", password: PASSWORD }));
    }
    expect(res!.status).toBe(429);
    expect(getOrCreateSetupCode()).not.toBe(first);
  });

  it("rejects a short password even with the right code", async () => {
    const res = await runSetup("short");
    expect(res.status).toBe(400);
    expect(isPasswordConfigured()).toBe(false);
  });

  it("accepts the code in any case and with or without the dash", async () => {
    const code = getOrCreateSetupCode()!.toLowerCase().replace("-", "");
    const res = await setup(json("http://localhost:3001/api/setup", { code, password: PASSWORD }));
    expect(res.status).toBe(200);
  });

  it("saves a hash (never the password), signs the caller in, and retires the code", async () => {
    const res = await runSetup();
    expect(res.status).toBe(200);

    const stored = fs.readFileSync(authFilePath(), "utf8");
    expect(stored).not.toContain(PASSWORD);
    expect(JSON.parse(stored).password.algo).toBe("scrypt");
    expect(fs.existsSync(setupCodePath())).toBe(false);

    expect(passwordSource()).toBe("file");
    expect(verifyPassword(PASSWORD)).toBe(true);
    expect(verifyPassword("not-it")).toBe(false);

    const cookie = cookieFrom(res);
    expect(cookie).not.toBeNull();
    expect(verifySession(cookie).ok).toBe(true);
  });

  it("refuses once the Den has a password", async () => {
    await runSetup();
    const res = await setup(json("http://localhost:3001/api/setup", { code: "AAAA-AAAA", password: "another-password" }));
    expect(res.status).toBe(409);
    expect(verifyPassword(PASSWORD)).toBe(true);
  });

  it("then the normal login works with that password", async () => {
    await runSetup();
    const res = await login(json("http://localhost:3001/api/auth/login", { password: PASSWORD }));
    expect(res.status).toBe(200);
    expect(verifySession(cookieFrom(res)).ok).toBe(true);
  });
});

describe("proxy", () => {
  const get = (path: string, cookie?: string) =>
    proxy(new NextRequest(`http://localhost:3001${path}`, cookie ? { headers: { cookie: `kitsuneden_session=${cookie}` } } : {}));

  it("sends pages to /setup and refuses APIs before setup", async () => {
    const page = await get("/instances/x");
    expect(page.status).toBe(307);
    expect(page.headers.get("location")).toBe("http://localhost:3001/setup");

    const api = await get("/api/servers");
    expect(api.status).toBe(503);
    expect(await api.json()).toMatchObject({ setup: true });

    expect((await get("/setup")).headers.get("x-middleware-next")).toBe("1");
    expect((await get("/api/setup")).headers.get("x-middleware-next")).toBe("1");
  });

  it("closes /setup and gates everything once a password exists", async () => {
    const res = await runSetup();
    const setupPage = await get("/setup");
    expect(setupPage.headers.get("location")).toBe("http://localhost:3001/login");

    expect((await get("/api/servers")).status).toBe(401);
    expect((await get("/api/servers", cookieFrom(res)!)).headers.get("x-middleware-next")).toBe("1");
  });
});

describe("changing the password", () => {
  it("needs the current password", async () => {
    await runSetup();
    const res = await changePassword(json("http://localhost:3001/api/account/password", { current: "wrong-one", next: "brand-new-pass" }));
    expect(res.status).toBe(403);
    expect(verifyPassword(PASSWORD)).toBe(true);
  });

  it("signs everyone else out by default, but keeps the caller in", async () => {
    const old = cookieFrom(await runSetup())!;
    const res = await changePassword(
      json("http://localhost:3001/api/account/password", { current: PASSWORD, next: "brand-new-pass" })
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ success: true, signedOutOthers: true });
    expect(verifyPassword("brand-new-pass")).toBe(true);
    expect(verifyPassword(PASSWORD)).toBe(false);
    expect(verifySession(old).ok).toBe(false);
    expect(verifySession(cookieFrom(res)).ok).toBe(true);
  });

  it("can leave existing sessions alone", async () => {
    const old = cookieFrom(await runSetup())!;
    const res = await changePassword(
      json("http://localhost:3001/api/account/password", { current: PASSWORD, next: "brand-new-pass", signOutOthers: false })
    );
    expect(await res.json()).toMatchObject({ success: true, signedOutOthers: false });
    expect(verifySession(old).ok).toBe(true);
  });

  it("is refused when the password comes from .env", async () => {
    process.env.KITSUNEDEN_PASSWORD = "from-the-env-file";
    const info = await (await passwordInfo()).json();
    expect(info.source).toBe("env");
    const res = await changePassword(
      json("http://localhost:3001/api/account/password", { current: "from-the-env-file", next: "brand-new-pass" })
    );
    expect(res.status).toBe(409);
  });
});

describe("environment still wins", () => {
  it("prefers KITSUNEDEN_PASSWORD over a saved password", async () => {
    await runSetup();
    process.env.KITSUNEDEN_PASSWORD = "from-the-env-file";
    expect(passwordSource()).toBe("env");
    expect(verifyPassword("from-the-env-file")).toBe(true);
    expect(verifyPassword(PASSWORD)).toBe(false);
  });

  it("prefers KITSUNEDEN_SESSION_SECRET over the saved secret", async () => {
    await runSetup();
    const env = "an-env-session-secret-that-is-long-enough!!";
    process.env.KITSUNEDEN_SESSION_SECRET = env;
    expect(getSessionSecret()).toBe(env);
  });
});

describe("GET /api/setup is public, so it says as little as possible", () => {
  it("returns only needsSetup once a password exists", async () => {
    await runSetup();
    expect(await (await setupStatus()).json()).toEqual({ needsSetup: false });
  });

  it("returns only needsSetup when the password comes from .env", async () => {
    process.env.KITSUNEDEN_PASSWORD = "from-the-env-file";
    expect(await (await setupStatus()).json()).toEqual({ needsSetup: false });
    expect(fs.existsSync(setupCodePath())).toBe(false);
  });

  it("shows the code file relative to the app folder when it lives there", async () => {
    const saved = process.env.KITSUNEDEN_DATA_DIR;
    process.env.KITSUNEDEN_DATA_DIR = path.join(process.cwd(), "data-test-setup-path");
    try {
      const body = await (await setupStatus()).json();
      expect(body.codeFile).toBe("data-test-setup-path/setup-code.txt");
    } finally {
      fs.rmSync(process.env.KITSUNEDEN_DATA_DIR, { recursive: true, force: true });
      process.env.KITSUNEDEN_DATA_DIR = saved;
      _resetAuthConfigForTests();
    }
  });
});
