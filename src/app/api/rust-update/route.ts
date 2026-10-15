import { NextRequest, NextResponse } from "next/server";
import { getAdapter, getDefaultServerId } from "@/lib/adapters/adapter-registry";
import { RustAdapter } from "@/lib/adapters/rust-adapter";

function getServerId(request: NextRequest): string {
  return request.nextUrl.searchParams.get("server") || getDefaultServerId();
}

function rustServer(request: NextRequest): RustAdapter | null {
  const adapter = getAdapter(getServerId(request));
  return adapter && adapter.def.type === "rust" ? (adapter as RustAdapter) : null;
}

export async function GET(request: NextRequest) {
  const adapter = rustServer(request);
  if (!adapter) return NextResponse.json({ error: "Not a Rust server" }, { status: 404 });
  return NextResponse.json(await adapter.getUpdateInfo());
}

export async function POST(request: NextRequest) {
  const adapter = rustServer(request);
  if (!adapter) return NextResponse.json({ error: "Not a Rust server" }, { status: 404 });
  return NextResponse.json(await adapter.updateServer());
}
