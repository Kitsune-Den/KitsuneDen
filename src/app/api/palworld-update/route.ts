import { NextRequest, NextResponse } from "next/server";
import { getAdapter, getDefaultServerId } from "@/lib/adapters/adapter-registry";
import { PalworldAdapter } from "@/lib/adapters/palworld-adapter";

function getServerId(request: NextRequest): string {
  return request.nextUrl.searchParams.get("server") || getDefaultServerId();
}

export async function GET(request: NextRequest) {
  const adapter = getAdapter(getServerId(request));
  if (!adapter || adapter.def.type !== "palworld") {
    return NextResponse.json({ error: "Not a Palworld server" }, { status: 404 });
  }

  const palworld = adapter as PalworldAdapter;
  const info = await palworld.getServerInfo();

  return NextResponse.json({
    serverVersion: info.serverVersion,
    steamAppId: adapter.def.steamAppId || 2394010,
    steamCmdConfigured: !!adapter.def.steamCmdPath,
  });
}

export async function POST(request: NextRequest) {
  const adapter = getAdapter(getServerId(request));
  if (!adapter || adapter.def.type !== "palworld") {
    return NextResponse.json({ error: "Not a Palworld server" }, { status: 404 });
  }

  const palworld = adapter as PalworldAdapter;
  const result = await palworld.updateServer();
  return NextResponse.json(result);
}
