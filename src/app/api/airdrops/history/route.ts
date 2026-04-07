import { NextRequest, NextResponse } from "next/server";
import { getAdapter, getDefaultServerId } from "@/lib/adapters/adapter-registry";
import { getKitsuneDb } from "@/lib/kitsune-db";

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
    const limit = parseInt(request.nextUrl.searchParams.get("limit") || "50", 10);

    const history = db
      .prepare(
        "SELECT id, created_at, loot_table_name, position, item_summary FROM airdrop_history ORDER BY created_at DESC LIMIT ?"
      )
      .all(limit) as {
      id: number;
      created_at: string;
      loot_table_name: string;
      position: string;
      item_summary: string;
    }[];

    return NextResponse.json({ history });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
