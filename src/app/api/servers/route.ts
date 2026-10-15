import { NextRequest, NextResponse } from "next/server";
import { getAllAdapters, getAdapter, addServer, removeServer, updateServer } from "@/lib/adapters/adapter-registry";
import { resolveServerStatus } from "@/lib/adapters/reachability";
import { recordActivity, observeStatus } from "@/lib/activity";
import { redactServerDefinition, sanitizeServerWrite } from "@/lib/server-def-security";
import { CONFIG_PORT_KEYS, gameConfigSecrets, isGameType, type PortField } from "@/lib/server-detect";

export async function GET() {
  const adapters = getAllAdapters();

  const servers = await Promise.all(
    adapters.map(async (a) => {
      const status = await resolveServerStatus(a);
      observeStatus(a.def.id, a.def.name, status);
      return {
        ...redactServerDefinition(a.def),
        status,
        capabilities: a.capabilities,
      };
    })
  );

  return NextResponse.json({ servers });
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { serverId, updates } = body as {
      serverId?: string;
      updates?: Record<string, unknown>;
    };

    if (!serverId) {
      return NextResponse.json(
        { success: false, message: "Missing serverId" },
        { status: 400 }
      );
    }
    if (!updates || Object.keys(updates).length === 0) {
      return NextResponse.json(
        { success: false, message: "No updates provided" },
        { status: 400 }
      );
    }

    // Pass the stored definition so unchanged legacy values aren't re-validated.
    const current = getAllAdapters().find((a) => a.def.id === serverId)?.def;
    const sanitized = sanitizeServerWrite(updates, current);
    if (!sanitized.ok) {
      return NextResponse.json({ success: false, message: sanitized.message }, { status: 400 });
    }

    const result = await updateServer(serverId, sanitized.value);

    if (!result.success) {
      return NextResponse.json(result, { status: 404 });
    }
    recordActivity({ level: "info", kind: "setup", message: `Updated server settings for ${serverId}`, serverId });

    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { success: false, message: `Failed to update server: ${err}` },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { server, syncPortsToGame } = body as { server?: Record<string, unknown>; syncPortsToGame?: boolean };

    if (!server) {
      return NextResponse.json(
        { success: false, message: "Missing server definition" },
        { status: 400 }
      );
    }

    const { id, name, type, dir } = server as { id?: string; name?: string; type?: string; dir?: string };
    if (!id || !name || !type || !dir) {
      return NextResponse.json(
        { success: false, message: "Missing required fields: id, name, type, dir" },
        { status: 400 }
      );
    }

    const sanitized = sanitizeServerWrite(server);
    if (!sanitized.ok) {
      return NextResponse.json({ success: false, message: sanitized.message }, { status: 400 });
    }

    // Passwords left blank in the form come from the game's own config
    // (the browser only ever learned that they exist, not their values).
    for (const [key, value] of Object.entries(gameConfigSecrets(type, dir))) {
      if (!sanitized.value[key]) sanitized.value[key] = value;
    }

    const result = await addServer(sanitized.value as never);

    if (!result.success) {
      return NextResponse.json(result, { status: 400 });
    }
    recordActivity({ level: "info", kind: "setup", message: `Added ${name} to the Den`, serverId: id, serverName: name });

    if (syncPortsToGame) {
      const synced = await writePortsToGameConfig(id, type, sanitized.value);
      if (synced) {
        recordActivity({ level: "info", kind: "config", message: `Set ${synced} in ${name}'s config`, serverId: id, serverName: name });
        return NextResponse.json({ ...result, message: `${result.message}. Updated ${synced} in its config.` });
      }
    }

    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { success: false, message: `Failed to add server: ${err}` },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    const { serverId, deleteFiles } = body as {
      serverId?: string;
      deleteFiles?: boolean;
    };

    if (!serverId) {
      return NextResponse.json(
        { success: false, message: "Missing serverId" },
        { status: 400 }
      );
    }

    const result = await removeServer(serverId, deleteFiles ?? false);

    if (!result.success) {
      const status = result.reason === "unsafe-delete" ? 400 : 404;
      return NextResponse.json({ success: false, message: result.message }, { status });
    }
    recordActivity({
      level: "warn",
      kind: "setup",
      message: deleteFiles ? `Deleted ${serverId} and its files` : `Removed ${serverId} from the Den (files kept)`,
      serverId,
    });

    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { success: false, message: `Failed to delete server: ${err}` },
      { status: 500 }
    );
  }
}

/**
 * Make the game's own config agree with the ports the Den was given, so a
 * port moved to avoid a clash is the port the game actually binds. Only
 * touches keys whose value differs, through the adapter's normal config
 * read/save (which keeps a .bak). Returns a summary, or null if nothing
 * changed (or the game has no config file yet).
 */
async function writePortsToGameConfig(id: string, type: string, def: Record<string, unknown>): Promise<string | null> {
  if (!isGameType(type)) return null;
  const keys = CONFIG_PORT_KEYS[type];
  const adapter = getAdapter(id);
  if (!keys || !adapter) return null;
  try {
    const current = await adapter.getConfig();
    if (!current || Object.keys(current).length === 0) return null;
    const changes: Record<string, string | number> = {};
    for (const [field, key] of Object.entries(keys) as [PortField, string][]) {
      const port = def[field];
      if (typeof port !== "number" || !(key in current)) continue;
      // A JSON config's number stays a number; text formats get text.
      if (String(current[key]) !== String(port)) changes[key] = typeof current[key] === "number" ? port : String(port);
    }
    if (Object.keys(changes).length === 0) return null;
    const saved = await adapter.saveConfig({ ...current, ...changes });
    if (!saved.success) return null;
    return Object.entries(changes).map(([k, v]) => `${k}=${v}`).join(", ");
  } catch {
    return null;
  }
}
