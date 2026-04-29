import { NextRequest, NextResponse } from "next/server";
import { getAdapter, getDefaultServerId } from "@/lib/adapters/adapter-registry";
import { EnshroudedAdapter } from "@/lib/adapters/enshrouded-adapter";

function getServerId(request: NextRequest): string {
  return request.nextUrl.searchParams.get("server") || getDefaultServerId();
}

export async function GET(request: NextRequest) {
  const adapter = getAdapter(getServerId(request));
  if (!adapter || adapter.def.type !== "enshrouded") {
    return NextResponse.json({ error: "Not an Enshrouded server" }, { status: 404 });
  }

  const enshrouded = adapter as EnshroudedAdapter;
  const info = await enshrouded.getServerInfo();

  return NextResponse.json({
    serverVersion: info.serverVersion,
    steamAppId: adapter.def.steamAppId || 2278520,
    steamCmdConfigured: !!adapter.def.steamCmdPath,
  });
}

export async function POST(request: NextRequest) {
  const adapter = getAdapter(getServerId(request));
  if (!adapter || adapter.def.type !== "enshrouded") {
    return NextResponse.json({ error: "Not an Enshrouded server" }, { status: 404 });
  }

  const enshrouded = adapter as EnshroudedAdapter;
  const result = await enshrouded.updateServer();
  return NextResponse.json(result);
}
