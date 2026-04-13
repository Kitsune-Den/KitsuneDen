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

  let status = adapter.getStatus();
  if (adapter.def.type === "hytale" || adapter.def.type === "palworld") {
    const stats = await adapter.getStats();
    status = stats.process ? "running" : "stopped";
  }

  return NextResponse.json({ status });
}

export async function POST(request: NextRequest) {
  const adapter = getAdapter(getServerId(request));
  if (!adapter) {
    return NextResponse.json({ error: "Unknown server" }, { status: 404 });
  }

  const body = await request.json();
  const { action, command } = body;

  switch (action) {
    case "start":
      return NextResponse.json(await adapter.start());
    case "stop":
      return NextResponse.json(await adapter.stop());
    case "restart":
      return NextResponse.json(await adapter.restart());
    case "command": {
      if (!command) {
        return NextResponse.json(
          { success: false, message: "No command provided" },
          { status: 400 }
        );
      }
      return NextResponse.json(adapter.sendCommand(command));
    }
    default:
      return NextResponse.json(
        { success: false, message: "Invalid action" },
        { status: 400 }
      );
  }
}
