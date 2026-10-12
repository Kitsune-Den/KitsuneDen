import { NextRequest, NextResponse } from "next/server";
import { recordActivity } from "@/lib/activity";
import {
  SESSION_SECRET_ERROR,
  checkPassword,
  isAuthConfigured,
  isSessionSecretConfigured,
  setSessionCookie,
} from "@/lib/auth";

/**
 * POST /api/auth/login
 * Body: { password: string }
 *
 * On success: sets the HttpOnly session cookie and returns 200 { ok: true }.
 * On wrong password: 401 { ok: false, error: "..." }.
 * On unconfigured server: 503 — tells the operator to set KITSUNEDEN_PASSWORD
 * and/or KITSUNEDEN_SESSION_SECRET. Both are checked before the password so a
 * half-configured server fails clearly instead of issuing a cookie the proxy
 * can't verify (which looked like "login succeeds, then bounces back").
 *
 * We intentionally don't rate-limit here yet. Behind Cloudflare Access or on
 * a tailnet that's fine; if/when KitsuneDen ever sits on a raw public IP
 * we'll add a per-IP throttle (sqlite-backed, same DB the dashboard uses).
 */
export async function POST(request: NextRequest) {
  if (!isAuthConfigured()) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "The Den has no password yet. Open it in a browser to run first-run setup.",
      },
      { status: 503 }
    );
  }
  if (!isSessionSecretConfigured()) {
    return NextResponse.json({ ok: false, error: SESSION_SECRET_ERROR }, { status: 503 });
  }

  let body: { password?: unknown };
  try {
    body = (await request.json()) as { password?: unknown };
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  const submitted = typeof body.password === "string" ? body.password : "";
  if (!checkPassword(submitted)) {
    // Generic message — don't leak whether the password matched length, etc.
    recordActivity({ level: "warn", kind: "auth", message: "Failed sign-in attempt" });
    return NextResponse.json({ ok: false, error: "Wrong password." }, { status: 401 });
  }

  recordActivity({ level: "info", kind: "auth", message: "Someone signed in" });
  const response = NextResponse.json({ ok: true });
  setSessionCookie(response, request);
  return response;
}
