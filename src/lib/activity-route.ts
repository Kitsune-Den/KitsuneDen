import { NextRequest } from "next/server";
import { getAdapter, getDefaultServerId } from "@/lib/adapters/adapter-registry";
import { recordActivity, type ActivityKind } from "@/lib/activity";

type Handler = (request: NextRequest) => Promise<Response>;

/**
 * Wraps a mutating route handler so every call lands in the activity log,
 * without threading log calls through each branch of the handler.
 * `describe` turns the request body into a phrase like "Whitelisted Basil";
 * return null to skip logging that request.
 */
export function withActivity(
  kind: ActivityKind,
  describe: (body: Record<string, unknown>) => string | null,
  handler: Handler
): Handler {
  return async (request: NextRequest) => {
    const body = ((await request.clone().json().catch(() => null)) ?? {}) as Record<string, unknown>;
    const response = await handler(request);

    try {
      const what = describe(body);
      if (what) {
        const result = (await response.clone().json().catch(() => ({}))) as { success?: boolean; message?: string; error?: string };
        const ok = response.ok && result.success !== false && !result.error;
        const adapter = getAdapter(request.nextUrl.searchParams.get("server") || getDefaultServerId());
        recordActivity({
          level: ok ? "info" : "error",
          kind,
          message: ok ? what : `${what} failed${result.message || result.error ? `: ${result.message || result.error}` : ""}`,
          serverId: adapter?.def.id,
          serverName: adapter?.def.name,
        });
      }
    } catch {
      // logging must never change the response
    }
    return response;
  };
}

const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

/** Best-effort player label from the many body shapes the players route accepts. */
export function playerLabel(body: Record<string, unknown>): string {
  return str(body.name) || str(body.playerName) || str(body.username) || str(body.steamId) || str(body.userId) || str(body.uuid) || "a player";
}

