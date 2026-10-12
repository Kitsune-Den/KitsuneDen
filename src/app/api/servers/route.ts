import { NextRequest, NextResponse } from "next/server";
import { getAllAdapters, addServer, removeServer, updateServer } from "@/lib/adapters/adapter-registry";
import { resolveServerStatus } from "@/lib/adapters/reachability";
import { recordActivity, observeStatus } from "@/lib/activity";
import { redactServerDefinition, sanitizeServerWrite } from "@/lib/server-def-security";

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

    const sanitized = sanitizeServerWrite(updates);
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
    const { server } = body as { server?: Record<string, unknown> };

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

    const result = await addServer(sanitized.value as never);

    if (!result.success) {
      return NextResponse.json(result, { status: 400 });
    }
    recordActivity({ level: "info", kind: "setup", message: `Added ${name} to the Den`, serverId: id, serverName: name });

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
      return NextResponse.json(result, { status: 404 });
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
