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

  const config = await adapter.getConfig();
  return NextResponse.json({
    config,
    format: adapter.capabilities.hasServerProperties ? "properties" : "json",
  });
}

export async function POST(request: NextRequest) {
  const adapter = getAdapter(getServerId(request));
  if (!adapter) {
    return NextResponse.json({ error: "Unknown server" }, { status: 404 });
  }

  const body = await request.json();
  const result = await adapter.saveConfig(body);
  return NextResponse.json(result);
}
