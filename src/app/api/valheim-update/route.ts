import { NextRequest, NextResponse } from "next/server";
import { getAdapter, getDefaultServerId } from "@/lib/adapters/adapter-registry";
import { ValheimAdapter } from "@/lib/adapters/valheim-adapter";

function getServerId(request: NextRequest): string {
  return request.nextUrl.searchParams.get("server") || getDefaultServerId();
}

function valheim(request: NextRequest): ValheimAdapter | null {
  const adapter = getAdapter(getServerId(request));
  return adapter && adapter.def.type === "valheim" ? (adapter as ValheimAdapter) : null;
}

export async function GET(request: NextRequest) {
  const adapter = valheim(request);
  if (!adapter) return NextResponse.json({ error: "Not a Valheim server" }, { status: 404 });
  return NextResponse.json(await adapter.getUpdateInfo());
}

export async function POST(request: NextRequest) {
  const adapter = valheim(request);
  if (!adapter) return NextResponse.json({ error: "Not a Valheim server" }, { status: 404 });
  return NextResponse.json(await adapter.updateServer());
}
