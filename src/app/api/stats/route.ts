import { NextRequest, NextResponse } from "next/server";
import { getAdapter, getDefaultServerId } from "@/lib/adapters/adapter-registry";
import { HytaleAdapter } from "@/lib/adapters/hytale-adapter";
import { SevenDaysAdapter } from "@/lib/adapters/seven-days-adapter";

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
  if (adapter instanceof HytaleAdapter) {
    extra = await adapter.getServerInfo();
  } else if (adapter instanceof SevenDaysAdapter) {
    extra = await adapter.getServerInfo();
  }

  return NextResponse.json({ ...stats, ...extra });
}
