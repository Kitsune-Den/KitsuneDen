import { NextRequest, NextResponse } from "next/server";
import { getAdapter, getDefaultServerId } from "@/lib/adapters/adapter-registry";
import { getKitsuneDb, AIRDROP_DEFAULTS } from "@/lib/kitsune-db";

function getServerId(request: NextRequest): string {
  return request.nextUrl.searchParams.get("server") || getDefaultServerId();
}

export async function GET(request: NextRequest) {
  const adapter = getAdapter(getServerId(request));
  if (!adapter || !adapter.capabilities.hasKitsuneCommand) {
    return NextResponse.json({ error: "KitsuneCommand not available" }, { status: 404 });
  }

  const db = getKitsuneDb(adapter.def.dir);
  if (!db) {
    return NextResponse.json({ error: "Database not available" }, { status: 500 });
  }

  try {
    const rows = db
      .prepare("SELECT name, value FROM settings WHERE name LIKE 'airdrop.%'")
      .all() as { name: string; value: string }[];

    // Merge DB values with defaults
    const settings: Record<string, string> = { ...AIRDROP_DEFAULTS };
    for (const row of rows) {
      settings[row.name] = row.value;
    }

    return NextResponse.json({ settings });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  const adapter = getAdapter(getServerId(request));
  if (!adapter || !adapter.capabilities.hasKitsuneCommand) {
    return NextResponse.json({ error: "KitsuneCommand not available" }, { status: 404 });
  }

  const db = getKitsuneDb(adapter.def.dir);
  if (!db) {
    return NextResponse.json({ error: "Database not available" }, { status: 500 });
  }

  try {
    const body = await request.json();
    const { name, value } = body as { name: string; value: string };

    if (!name || !name.startsWith("airdrop.")) {
      return NextResponse.json({ error: "Invalid setting name" }, { status: 400 });
    }

    db.prepare(
      "INSERT INTO settings (name, value) VALUES (?, ?) ON CONFLICT(name) DO UPDATE SET value = excluded.value"
    ).run(name, String(value));

    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
