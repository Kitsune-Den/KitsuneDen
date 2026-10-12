import path from "path";
import { NextRequest, NextResponse } from "next/server";
import { recordActivity } from "@/lib/activity";
import { setSessionCookie } from "@/lib/auth";
import { completeSetup, getOrCreateSetupCode, isPasswordConfigured, MIN_PASSWORD_LENGTH, setupCodePath } from "@/lib/den-auth-config";

/**
 * First-run setup. Public (the proxy lets it through), so it only ever works
 * while the Den has no password, and only with the one-time setup code that
 * was printed to the server log.
 *
 * GET  → before setup: { needsSetup: true, codeFile, minPasswordLength }
 *        (creates + logs the code); after: just { needsSetup: false }
 * POST { code, password } → saves the password, signs the caller in
 */
export async function GET() {
  // This route is public. Once the Den has a password there is nothing to
  // help with, so say only that; don't hand out paths on the host.
  if (isPasswordConfigured()) return NextResponse.json({ needsSetup: false });

  getOrCreateSetupCode();
  return NextResponse.json({ needsSetup: true, codeFile: displayPath(setupCodePath()), minPasswordLength: MIN_PASSWORD_LENGTH });
}

/** Relative to the app folder when the file lives under it ("data/setup-code.txt"),
 *  so the setup screen doesn't spell out the host's user profile path. */
function displayPath(file: string): string {
  const rel = path.relative(process.cwd(), file);
  return rel && !rel.startsWith("..") && !path.isAbsolute(rel) ? rel.split(path.sep).join("/") : file;
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
