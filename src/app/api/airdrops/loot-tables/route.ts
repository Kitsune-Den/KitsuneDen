import { NextRequest, NextResponse } from "next/server";
import { getAdapter, getDefaultServerId } from "@/lib/adapters/adapter-registry";
import { getKitsuneDb } from "@/lib/kitsune-db";

function getServerId(request: NextRequest): string {
  return request.nextUrl.searchParams.get("server") || getDefaultServerId();
}

interface LootTableRow {
  id: number;
  created_at: string;
  name: string;
  is_enabled: number;
  description: string | null;
}

interface LootEntryRow {
  id: number;
  loot_table_id: number;
  item_name: string;
  min_quantity: number;
  max_quantity: number;
  weight: number;
}

/**
 * GET — Returns all loot tables with nested entries.
 */
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
    const tables = db
      .prepare("SELECT id, created_at, name, is_enabled, description FROM airdrop_loot_tables ORDER BY name")
      .all() as LootTableRow[];

    const entries = db
      .prepare("SELECT id, loot_table_id, item_name, min_quantity, max_quantity, weight FROM airdrop_loot_entries ORDER BY id")
      .all() as LootEntryRow[];

    // Group entries by table ID
    const entryMap = new Map<number, LootEntryRow[]>();
    for (const entry of entries) {
      const list = entryMap.get(entry.loot_table_id) || [];
      list.push(entry);
      entryMap.set(entry.loot_table_id, list);
    }

    const result = tables.map((t) => ({
      id: t.id,
      createdAt: t.created_at,
      name: t.name,
      isEnabled: t.is_enabled === 1,
      description: t.description,
      entries: (entryMap.get(t.id) || []).map((e) => ({
        id: e.id,
        itemName: e.item_name,
        minQuantity: e.min_quantity,
        maxQuantity: e.max_quantity,
        weight: e.weight,
      })),
    }));

    return NextResponse.json({ tables: result });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

/**
 * POST — Create a loot table, or manage entries (via action field).
 */
export async function POST(request: NextRequest) {
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
    const action = body.action as string | undefined;

    // Entry management actions
    if (action === "add-entry") {
      const { lootTableId, itemName, minQuantity, maxQuantity, weight } = body;
      const result = db
        .prepare(
          "INSERT INTO airdrop_loot_entries (loot_table_id, item_name, min_quantity, max_quantity, weight) VALUES (?, ?, ?, ?, ?)"
        )
        .run(lootTableId, itemName, minQuantity ?? 1, maxQuantity ?? 1, weight ?? 10);
      return NextResponse.json({ success: true, id: result.lastInsertRowid });
    }

    if (action === "update-entry") {
      const { id, itemName, minQuantity, maxQuantity, weight } = body;
      db.prepare(
        "UPDATE airdrop_loot_entries SET item_name = ?, min_quantity = ?, max_quantity = ?, weight = ? WHERE id = ?"
      ).run(itemName, minQuantity, maxQuantity, weight, id);
      return NextResponse.json({ success: true });
    }

    if (action === "delete-entry") {
      db.prepare("DELETE FROM airdrop_loot_entries WHERE id = ?").run(body.id);
      return NextResponse.json({ success: true });
    }

    // Default: create a new loot table
    const { name, description } = body;
    if (!name || typeof name !== "string" || !name.trim()) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    const result = db
      .prepare("INSERT INTO airdrop_loot_tables (name, description) VALUES (?, ?)")
      .run(name.trim(), description || null);

    return NextResponse.json({ success: true, id: result.lastInsertRowid });
  } catch (e) {
    const msg = String(e);
    if (msg.includes("UNIQUE constraint")) {
      return NextResponse.json({ error: "A loot table with that name already exists" }, { status: 409 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/**
 * PUT — Update a loot table.
 */
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
    const { id, name, description, isEnabled } = body;

    if (!id) {
      return NextResponse.json({ error: "ID is required" }, { status: 400 });
    }

    // Build dynamic update
    const sets: string[] = [];
    const params: unknown[] = [];

    if (name !== undefined) {
      sets.push("name = ?");
      params.push(name);
    }
    if (description !== undefined) {
      sets.push("description = ?");
      params.push(description);
    }
    if (isEnabled !== undefined) {
      sets.push("is_enabled = ?");
      params.push(isEnabled ? 1 : 0);
    }

    if (sets.length === 0) {
      return NextResponse.json({ error: "No fields to update" }, { status: 400 });
    }

    params.push(id);
    db.prepare(`UPDATE airdrop_loot_tables SET ${sets.join(", ")} WHERE id = ?`).run(...params);

    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

/**
 * DELETE — Delete a loot table (CASCADE deletes entries).
 */
export async function DELETE(request: NextRequest) {
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
    const { id } = body;

    if (!id) {
      return NextResponse.json({ error: "ID is required" }, { status: 400 });
    }

    db.prepare("DELETE FROM airdrop_loot_tables WHERE id = ?").run(id);
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
