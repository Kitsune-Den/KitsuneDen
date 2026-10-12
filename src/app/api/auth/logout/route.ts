import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE_NAME, shouldUseSecureCookie } from "@/lib/auth";

/**
 * POST /api/auth/logout — clear the session cookie.
 * Idempotent; returns 200 whether or not the caller was logged in.
 */
export async function POST(request: NextRequest) {
  const response = NextResponse.json({ ok: true });
  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: shouldUseSecureCookie(request),
    path: "/",
    maxAge: 0,
  });
  return response;
}
