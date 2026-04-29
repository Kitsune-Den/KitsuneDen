import { NextRequest, NextResponse } from "next/server";
import { getAllAdapters, addServer, removeServer, updateServer } from "@/lib/adapters/adapter-registry";

export async function GET() {
  const adapters = getAllAdapters();

  const servers = await Promise.all(
    adapters.map(async (a) => {
      // For Hytale, check process status dynamically
      let status = a.getStatus();
      if (a.def.type === "hytale" || a.def.type === "palworld" || a.def.type === "enshrouded") {
        const stats = await a.getStats();
        status = stats.process ? "running" : "stopped";
      }

      return {
        ...a.def,
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

    const result = await updateServer(serverId, updates);

    if (!result.success) {
      return NextResponse.json(result, { status: 404 });
    }

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

    const result = await addServer(server as never);

    if (!result.success) {
      return NextResponse.json(result, { status: 400 });
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
      return NextResponse.json(result, { status: 404 });
    }

    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { success: false, message: `Failed to delete server: ${err}` },
      { status: 500 }
    );
  }
}
