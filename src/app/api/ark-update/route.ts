import { NextRequest, NextResponse } from "next/server";
import { getAdapter, getDefaultServerId } from "@/lib/adapters/adapter-registry";
import { ArkAdapter } from "@/lib/adapters/ark-adapter";

/** SteamCMD info and updates for both ARK games (ark-ase and ark-asa). */

function getServerId(request: NextRequest): string {
  return request.nextUrl.searchParams.get("server") || getDefaultServerId();
}

function ark(request: NextRequest): ArkAdapter | null {
  const adapter = getAdapter(getServerId(request));
  return adapter && (adapter.def.type === "ark-ase" || adapter.def.type === "ark-asa") ? (adapter as ArkAdapter) : null;
}

export async function GET(request: NextRequest) {
  const adapter = ark(request);
  if (!adapter) return NextResponse.json({ error: "Not an ARK server" }, { status: 404 });
  return NextResponse.json(await adapter.getUpdateInfo());
}

export async function POST(request: NextRequest) {
  const adapter = ark(request);
  if (!adapter) return NextResponse.json({ error: "Not an ARK server" }, { status: 404 });
  return NextResponse.json(await adapter.updateServer());
}
