import { NextRequest, NextResponse } from "next/server";
import { recordActivity } from "@/lib/activity";
import { setSessionCookie } from "@/lib/auth";
import { changePassword, MIN_PASSWORD_LENGTH, passwordSource, sessionSecretFromEnv } from "@/lib/den-auth-config";

/**
 * The Den password, as managed from Settings. Behind the proxy, so only a
 * signed-in session gets here.
 *
 * GET  → { source: "env" | "file", sessionSecretFromEnv, minPasswordLength }
 * POST { current, next, signOutOthers } → changes it; with signOutOthers the
 *      session secret rotates, ending every other session.
 */
export async function GET() {
  return NextResponse.json({
    source: passwordSource(),
    sessionSecretFromEnv: sessionSecretFromEnv(),
    minPasswordLength: MIN_PASSWORD_LENGTH,
  });
}

export async function POST(request: NextRequest) {
  let body: { current?: unknown; next?: unknown; signOutOthers?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ success: false, message: "Invalid JSON body." }, { status: 400 });
  }

  const signOutOthers = body.signOutOthers !== false;
  const result = changePassword(body.current, body.next, signOutOthers);
  if (!result.ok) {
    return NextResponse.json({ success: false, message: result.error }, { status: result.status });
  }

  const rotated = signOutOthers && !sessionSecretFromEnv();
  recordActivity({
    level: "info",
    kind: "auth",
    message: rotated ? "Den password changed; everyone else was signed out" : "Den password changed",
  });
  // Re-issue our own cookie: after a rotation the old one no longer verifies.
  const response = NextResponse.json({ success: true, signedOutOthers: rotated });
  setSessionCookie(response, request);
  return response;
}
