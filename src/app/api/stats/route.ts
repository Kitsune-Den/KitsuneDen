import { NextRequest, NextResponse } from "next/server";
import { getAdapter, getDefaultServerId } from "@/lib/adapters/adapter-registry";

function getServerId(request: NextRequest): string {
  return request.nextUrl.searchParams.get("server") || getDefaultServerId();
}

export async function GET(request: NextRequest) {
  const adapter = getAdapter(getServerId(request));
  if (!adapter) {
    return NextResponse.json({ error: "Unknown server" }, { status: 404 });
  }

  const stats = await adapter.getStats();

  // Include extra server info for adapters that support it
  let extra: Record<string, unknown> = {};
  if ("getServerInfo" in adapter && typeof adapter.getServerInfo === "function") {
    extra = await adapter.getServerInfo();
  }

  return NextResponse.json({ ...stats, ...extra });
}
