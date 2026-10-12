import { NextRequest, NextResponse } from "next/server";
import { readActivity, type ActivityKind } from "@/lib/activity";

const KINDS: ActivityKind[] = ["server", "crash", "config", "players", "backup", "mods", "setup", "auth"];

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const limit = Number(params.get("limit")) || 100;
  const serverId = params.get("server") || undefined;
  const kinds = (params.get("kind") || "")
    .split(",")
    .map((k) => k.trim())
    .filter((k): k is ActivityKind => (KINDS as string[]).includes(k));

  return NextResponse.json({
    events: readActivity({ limit, serverId, kinds: kinds.length ? kinds : undefined }),
  });
}
