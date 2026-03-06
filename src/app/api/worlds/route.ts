import { NextRequest, NextResponse } from "next/server";
import { getAdapter, getDefaultServerId } from "@/lib/adapters/adapter-registry";

function getServerId(request: NextRequest): string {
  return request.nextUrl.searchParams.get("server") || getDefaultServerId();
}

export async function GET(request: NextRequest) {
  const adapter = getAdapter(getServerId(request));
  if (!adapter || adapter.def.type !== "hytale") {
    return NextResponse.json({ error: "Worlds not available for this server" }, { status: 404 });
  }

  const hytale = adapter as unknown as { getWorlds: () => Promise<unknown>; getWarps: () => Promise<unknown>; getServerInfo: () => Promise<{ defaultWorld: string }> };
  const worlds = await hytale.getWorlds();
  const warps = await hytale.getWarps();
  const info = await hytale.getServerInfo();

  return NextResponse.json({
    worlds,
    warps,
    defaultWorld: info.defaultWorld,
  });
}
