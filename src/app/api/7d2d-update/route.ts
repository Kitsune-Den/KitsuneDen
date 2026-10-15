import { NextRequest, NextResponse } from "next/server";
import { getAdapter, getDefaultServerId } from "@/lib/adapters/adapter-registry";
import { SevenDaysAdapter } from "@/lib/adapters/seven-days-adapter";

function getServerId(request: NextRequest): string {
  return request.nextUrl.searchParams.get("server") || getDefaultServerId();
}

function sevenDays(request: NextRequest): SevenDaysAdapter | null {
  const adapter = getAdapter(getServerId(request));
  return adapter && adapter.def.type === "7d2d" ? (adapter as SevenDaysAdapter) : null;
}

export async function GET(request: NextRequest) {
  const adapter = sevenDays(request);
  if (!adapter) return NextResponse.json({ error: "Not a 7 Days to Die server" }, { status: 404 });
  return NextResponse.json(await adapter.getUpdateInfo());
}

export async function POST(request: NextRequest) {
  const adapter = sevenDays(request);
  if (!adapter) return NextResponse.json({ error: "Not a 7 Days to Die server" }, { status: 404 });
  return NextResponse.json(await adapter.updateServer());
}
