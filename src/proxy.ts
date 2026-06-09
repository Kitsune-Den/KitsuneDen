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
 *   - /api/auth/*  (login + logout must be reachable without a session)
 *   - /favicon.ico
 *   - /_next/* static + image (excluded via matcher below)
 *
 * Auth-not-configured behavior: rather than locking everyone out forever,
 * we redirect HTML to /login?setup=1 (which renders setup instructions) and
 * 503 for API calls. This makes "first boot" debuggable.
 *
 * Response shape: HTML navs get 302 → /login?next=<path>. API routes get a
 * 401 JSON so stale fetch()s don't surprise-redirect to HTML.
 */
export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  if (
    pathname === "/login" ||
    pathname.startsWith("/api/auth/") ||
    pathname === "/favicon.ico"
  ) {
    return NextResponse.next();
  }

  if (!isAuthConfiguredEdge()) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        { error: "Auth not configured. Set KITSUNEDEN_PASSWORD in the environment." },
        { status: 503 }
      );
    }
    return NextResponse.redirect(new URL("/login?setup=1", request.url));
  }

  const secret = getSessionSecretEdge();
  if (!secret) {
    // Configured password but no usable secret — same setup-incomplete fork.
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        { error: "KITSUNEDEN_SESSION_SECRET missing or too short (need ≥32 chars)." },
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
