import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { getAdapter, getDefaultServerId } from "@/lib/adapters/adapter-registry";

function getServerId(request: NextRequest): string {
  return request.nextUrl.searchParams.get("server") || getDefaultServerId();
}

export async function GET(request: NextRequest) {
  const adapter = getAdapter(getServerId(request));
  if (!adapter || adapter.def.type !== "7d2d") {
    return NextResponse.json({ worlds: [] });
  }

  const worldsDir = path.join(adapter.def.dir, "Data", "Worlds");
  try {
    const entries = await fs.readdir(worldsDir, { withFileTypes: true });
    const worlds = entries
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort();
    return NextResponse.json({ worlds });
  } catch {
    return NextResponse.json({ worlds: ["Navezgane"] });
  }
}
