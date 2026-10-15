import { NextRequest, NextResponse } from "next/server";
import { getAdapter, getDefaultServerId } from "@/lib/adapters/adapter-registry";
import { VRisingAdapter } from "@/lib/adapters/vrising-adapter";

function getServerId(request: NextRequest): string {
  return request.nextUrl.searchParams.get("server") || getDefaultServerId();
}

function vrising(request: NextRequest): VRisingAdapter | null {
  const adapter = getAdapter(getServerId(request));
  return adapter && adapter.def.type === "vrising" ? (adapter as VRisingAdapter) : null;
}

export async function GET(request: NextRequest) {
  const adapter = vrising(request);
  if (!adapter) return NextResponse.json({ error: "Not a V Rising server" }, { status: 404 });
  return NextResponse.json(await adapter.getUpdateInfo());
}

export async function POST(request: NextRequest) {
  const adapter = vrising(request);
  if (!adapter) return NextResponse.json({ error: "Not a V Rising server" }, { status: 404 });
  return NextResponse.json(await adapter.updateServer());
}
