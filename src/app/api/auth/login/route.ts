import { NextRequest, NextResponse } from "next/server";
import {
  SESSION_COOKIE_NAME,
  SESSION_TTL_SECONDS,
  checkPassword,
  isAuthConfigured,
  signSession,
} from "@/lib/auth";

/**
 * POST /api/auth/login
 * Body: { password: string }
 *
 * On success: sets the HttpOnly session cookie and returns 200 { ok: true }.
 * On wrong password: 401 { ok: false, error: "..." }.
 * On unconfigured server: 503 — tells the operator to set KITSUNEDEN_PASSWORD.
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
          "Server has no KITSUNEDEN_PASSWORD configured. Set it in the environment and restart.",
      },
      { status: 503 }
    );
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
    return NextResponse.json({ ok: false, error: "Wrong password." }, { status: 401 });
  }

  const cookieValue = signSession();
  const response = NextResponse.json({ ok: true });
  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: cookieValue,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
  return response;
}
