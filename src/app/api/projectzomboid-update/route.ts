import { NextRequest, NextResponse } from "next/server";
import { getAdapter, getDefaultServerId } from "@/lib/adapters/adapter-registry";
import { ProjectZomboidAdapter } from "@/lib/adapters/projectzomboid-adapter";

function getServerId(request: NextRequest): string {
  return request.nextUrl.searchParams.get("server") || getDefaultServerId();
}

function zomboid(request: NextRequest): ProjectZomboidAdapter | null {
  const adapter = getAdapter(getServerId(request));
  return adapter && adapter.def.type === "projectzomboid" ? (adapter as ProjectZomboidAdapter) : null;
}

export async function GET(request: NextRequest) {
  const adapter = zomboid(request);
  if (!adapter) return NextResponse.json({ error: "Not a Project Zomboid server" }, { status: 404 });
  return NextResponse.json(await adapter.getUpdateInfo());
}

export async function POST(request: NextRequest) {
  const adapter = zomboid(request);
  if (!adapter) return NextResponse.json({ error: "Not a Project Zomboid server" }, { status: 404 });
  return NextResponse.json(await adapter.updateServer());
}
