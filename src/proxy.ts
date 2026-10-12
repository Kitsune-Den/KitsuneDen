import { NextRequest, NextResponse } from "next/server";
import {
  SESSION_COOKIE_NAME,
  getSessionSecretEdge,
  isAuthConfiguredEdge,
  verifySessionEdge,
} from "@/lib/auth-edge";

/**
 * Auth gate. Runs on every request via the proxy convention (Next 16 renamed
 * middleware → proxy). Edge-runtime safe — uses Web Crypto via auth-edge.ts
 * rather than node:crypto, so webpack doesn't choke on a `node:` scheme.
 *
 * Public paths (never gated):
 *   - /login
 *   - /setup, /api/setup  (first-run setup, itself guarded by a one-time code)
 *   - /api/auth/*  (login + logout must be reachable without a session)
 *   - /favicon.ico
 *   - /_next/* static + image (excluded via matcher below)
 *
 * No password yet (fresh install): pages go to /setup, APIs get a 503 with
 * `setup: true`. Once a password exists, /setup bounces to /login.
 *
 * Response shape: HTML navs get 302 → /login?next=<path>. API routes get a
 * 401 JSON so stale fetch()s don't surprise-redirect to HTML.
 */
export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  const configured = isAuthConfiguredEdge();
  const isSetupPath = pathname === "/setup" || pathname === "/api/setup";

  if (isSetupPath) {
    if (configured && pathname === "/setup") return NextResponse.redirect(new URL("/login", request.url));
    return NextResponse.next();
  }

  if (!configured) {
    if (pathname.startsWith("/api/auth/") || pathname === "/favicon.ico") return NextResponse.next();
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        { error: "The Den isn't set up yet. Open it in a browser to choose a password.", setup: true },
        { status: 503 }
      );
    }
    return NextResponse.redirect(new URL("/setup", request.url));
  }

  if (
    pathname === "/login" ||
    pathname.startsWith("/api/auth/") ||
    pathname === "/favicon.ico"
  ) {
    return NextResponse.next();
  }

  const secret = getSessionSecretEdge();
  if (!secret) {
    // A password exists but no secret could be read or saved (unwritable
    // data folder). Rare; say so rather than loop through the login page.
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        { error: "Couldn't load or save the session secret. Check that the data folder is writable." },
        { status: 503 }
      );
    }
    return NextResponse.redirect(new URL("/login?setup=1", request.url));
  }

  const cookie = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const ok = await verifySessionEdge(cookie, secret);
  if (ok) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const loginUrl = new URL("/login", request.url);
  if (pathname !== "/" && pathname !== "/login") {
    loginUrl.searchParams.set("next", pathname + search);
  }
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|_next/data).*)"],
};
