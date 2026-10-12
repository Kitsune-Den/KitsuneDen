import { NextRequest, NextResponse } from "next/server";
import { recordActivity } from "@/lib/activity";
import { setSessionCookie } from "@/lib/auth";
import { completeSetup, getOrCreateSetupCode, isPasswordConfigured, MIN_PASSWORD_LENGTH, setupCodePath } from "@/lib/den-auth-config";

/**
 * First-run setup. Public (the proxy lets it through), so it only ever works
 * while the Den has no password, and only with the one-time setup code that
 * was printed to the server log.
 *
 * GET  → { needsSetup, codeFile, minPasswordLength }  (creates + logs the code)
 * POST { code, password } → saves the password, signs the caller in
 */
export async function GET() {
  const needsSetup = !isPasswordConfigured();
  if (needsSetup) getOrCreateSetupCode();
  return NextResponse.json({ needsSetup, codeFile: setupCodePath(), minPasswordLength: MIN_PASSWORD_LENGTH });
}

export async function POST(request: NextRequest) {
  let body: { code?: unknown; password?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  const result = completeSetup(body.code, body.password);
  if (!result.ok) {
    if (result.status === 403 || result.status === 429) {
      recordActivity({ level: "warn", kind: "auth", message: "Wrong setup code entered" });
    }
    return NextResponse.json({ ok: false, error: result.error }, { status: result.status });
  }

  recordActivity({ level: "info", kind: "setup", message: "The Den was set up and given a password" });
  const response = NextResponse.json({ ok: true });
  setSessionCookie(response, request);
  return response;
}
