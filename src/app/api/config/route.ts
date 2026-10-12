import { NextRequest, NextResponse } from "next/server";
import { getAdapter, getDefaultServerId } from "@/lib/adapters/adapter-registry";
import { recordActivity } from "@/lib/activity";
import { redactConfigSecrets, restoreConfigSecrets } from "@/lib/config-secrets";

function getServerId(request: NextRequest): string {
  return request.nextUrl.searchParams.get("server") || getDefaultServerId();
}

export async function GET(request: NextRequest) {
  const adapter = getAdapter(getServerId(request));
  if (!adapter) {
    return NextResponse.json({ error: "Unknown server" }, { status: 404 });
  }

  // Admin credentials (RCON, telnet, admin passwords) are write-only.
  const { config, redactedSecrets } = redactConfigSecrets(adapter.def.type, await adapter.getConfig());
  return NextResponse.json({
    config,
    redactedSecrets,
    format: adapter.capabilities.hasServerProperties ? "properties" : "json",
  });
}

export async function POST(request: NextRequest) {
  const adapter = getAdapter(getServerId(request));
  if (!adapter) {
    return NextResponse.json({ error: "Unknown server" }, { status: 404 });
  }

  const body = await request.json();
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ success: false, message: "Config must be a JSON object" }, { status: 400 });
  }

  // Secrets GET hid come back blank; put the stored values back before saving.
  const restored = restoreConfigSecrets(adapter.def.type, body, await adapter.getConfig());
  if (!restored.ok) {
    return NextResponse.json({ success: false, message: restored.message }, { status: 400 });
  }

  const result = await adapter.saveConfig(restored.config);
  const ok = (result as { success?: boolean }).success !== false;
  recordActivity({
    level: ok ? "info" : "error",
    kind: "config",
    message: ok ? `Saved config for ${adapter.def.name}` : `Config save failed for ${adapter.def.name}`,
    serverId: adapter.def.id,
    serverName: adapter.def.name,
  });
  return NextResponse.json(result);
}
