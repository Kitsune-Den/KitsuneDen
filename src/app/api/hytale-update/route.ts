import { NextRequest, NextResponse } from "next/server";
import { getAdapter, getDefaultServerId } from "@/lib/adapters/adapter-registry";
import { HytaleAdapter } from "@/lib/adapters/hytale-adapter";

function getServerId(request: NextRequest): string {
  return request.nextUrl.searchParams.get("server") || getDefaultServerId();
}

export async function GET(request: NextRequest) {
  const adapter = getAdapter(getServerId(request));
  if (!adapter || adapter.def.type !== "hytale") {
    return NextResponse.json({ error: "Not a Hytale server" }, { status: 404 });
  }

  const hytale = adapter as HytaleAdapter;
  const info = await hytale.getUpdateInfo();

  return NextResponse.json(info);
}

export async function POST(request: NextRequest) {
  const adapter = getAdapter(getServerId(request));
  if (!adapter || adapter.def.type !== "hytale") {
    return NextResponse.json({ error: "Not a Hytale server" }, { status: 404 });
  }

  const hytale = adapter as HytaleAdapter;
  const result = await hytale.updateServer();
  return NextResponse.json(result);
}
