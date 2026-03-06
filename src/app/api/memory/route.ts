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

  return NextResponse.json(adapter.getMemoryConfig());
}

export async function PUT(request: NextRequest) {
  const adapter = getAdapter(getServerId(request));
  if (!adapter) {
    return NextResponse.json({ error: "Unknown server" }, { status: 404 });
  }

  const body = await request.json();
  const { minMemoryGB, maxMemoryGB } = body;

  if (!minMemoryGB || !maxMemoryGB) {
    return NextResponse.json(
      { success: false, message: "Missing memory values" },
      { status: 400 }
    );
  }

  adapter.saveMemoryConfig({ minMemoryGB, maxMemoryGB });
  return NextResponse.json({
    success: true,
    message: "Memory settings saved. Restart server to apply.",
  });
}
