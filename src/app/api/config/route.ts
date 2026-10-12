import { NextRequest, NextResponse } from "next/server";
import { getAdapter, getDefaultServerId } from "@/lib/adapters/adapter-registry";
import { recordActivity } from "@/lib/activity";

function getServerId(request: NextRequest): string {
  return request.nextUrl.searchParams.get("server") || getDefaultServerId();
}

export async function GET(request: NextRequest) {
  const adapter = getAdapter(getServerId(request));
  if (!adapter) {
    return NextResponse.json({ error: "Unknown server" }, { status: 404 });
  }

  const config = await adapter.getConfig();
  return NextResponse.json({
    config,
    format: adapter.capabilities.hasServerProperties ? "properties" : "json",
    gameVersion: adapter.getGameVersion?.(),
  });
}

export async function POST(request: NextRequest) {
  const adapter = getAdapter(getServerId(request));
  if (!adapter) {
    return NextResponse.json({ error: "Unknown server" }, { status: 404 });
  }

  const body = await request.json();
  const result = await adapter.saveConfig(body);
  const ok = (result as { success?: boolean }).success !== false;
  recordActivity({
    level: ok ? "info" : "error",
    kind: "config",
    message: ok ? `Saved config for ${adapter.def.name}` : `Config save failed for ${adapter.def.name}`,
    serverId: adapter.def.id,
    serverName: adapter.def.name,
  });
  return NextResponse.json(result);
}
