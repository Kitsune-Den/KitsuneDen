import { NextResponse } from "next/server";
import { getAllAdapters } from "@/lib/adapters/adapter-registry";

export async function GET() {
  const adapters = getAllAdapters();

  const servers = await Promise.all(
    adapters.map(async (a) => {
      // For Hytale, check process status dynamically
      let status = a.getStatus();
      if (a.def.type === "hytale") {
        const stats = await a.getStats();
        status = stats.process ? "running" : "stopped";
      }

      return {
        id: a.def.id,
        name: a.def.name,
        type: a.def.type,
        status,
        loader: a.def.loader,
        version: a.def.version,
        gamePort: a.def.gamePort,
        capabilities: a.capabilities,
      };
    })
  );

  return NextResponse.json({ servers });
}
