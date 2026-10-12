import { NextRequest, NextResponse } from "next/server";
import { getAdapter, getDefaultServerId } from "@/lib/adapters/adapter-registry";
import { SANDBOX_CODE_KEY } from "@/lib/seven-days-config";
import {
  latestSandboxTable,
  sandboxTableFor,
  sandboxTableIsBehind,
} from "@/lib/seven-days-sandbox-tables";

function getServerId(request: NextRequest): string {
  return request.nextUrl.searchParams.get("server") || getDefaultServerId();
}

/**
 * The Sandbox option table for a 7D2D 3.x server, so the config editor can
 * decode and re-encode its SandboxCode in the browser.
 *
 * The table decides what every letter in a code MEANS and it changes between
 * game versions, so picking the wrong one rewrites settings silently. Order of
 * trust: the version the game printed in its own log, then (only once the
 * config proves it's 3.x by carrying a SandboxCode) the newest table we have,
 * flagged as assumed so the editor can say so.
 */
export async function GET(request: NextRequest) {
  const adapter = getAdapter(getServerId(request));
  if (!adapter || adapter.def.type !== "7d2d") {
    return NextResponse.json({ supported: false });
  }

  const serverVersion = adapter.getGameVersion?.() ?? null;
  const fromLog = sandboxTableFor(serverVersion);
  if (fromLog) {
    return NextResponse.json({
      supported: true,
      versionSource: "log",
      serverVersion,
      // The server is newer than any table we carry, so sandboxTableFor fell
      // back to the nearest older one. The game has shifted value lists under
      // an unchanged code letter before (3.2's item tiers), so say so.
      tableBehind: sandboxTableIsBehind(serverVersion, fromLog),
      table: fromLog,
    });
  }

  const config = await adapter.getConfig();
  if (Object.prototype.hasOwnProperty.call(config, SANDBOX_CODE_KEY)) {
    return NextResponse.json({
      supported: true,
      versionSource: "assumed",
      serverVersion,
      tableBehind: false,
      table: latestSandboxTable,
    });
  }

  // Pre-3.0, or a version we can't pin a table to: don't guess.
  return NextResponse.json({ supported: false, serverVersion });
}
