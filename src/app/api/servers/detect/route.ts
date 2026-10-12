import { NextRequest, NextResponse } from "next/server";
import { getAllAdapters } from "@/lib/adapters/adapter-registry";
import { PORT_SPECS, advisePorts, detectInstall, isGameType, portOwners, type PortField } from "@/lib/server-detect";

/**
 * GET /api/servers/detect?type=7d2d[&dir=C:\...][&gamePort=26900...]
 *
 * Autofill for the Add Server form: the game's usual ports checked against
 * other Den servers and against what's listening on this machine, plus
 * whatever the install folder's own config says. Port params are values the
 * user typed, re-checked without being replaced. Secret values never leave
 * the server; `secretsFound` only says which ones the game's config has.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const type = params.get("type");
  if (!isGameType(type)) {
    return NextResponse.json({ error: "Unknown server type" }, { status: 400 });
  }

  const dir = params.get("dir")?.trim() || "";
  const detected = dir ? detectInstall(type, dir) : null;
  const detection = detected?.ok ? detected.detection : null;

  const wanted: Partial<Record<PortField, { port: number; source: "config" | "entered" }>> = {};
  for (const spec of PORT_SPECS[type]) {
    const entered = Number(params.get(spec.field));
    if (Number.isInteger(entered) && entered > 0) wanted[spec.field] = { port: entered, source: "entered" };
    else if (detection?.configPorts[spec.field]) wanted[spec.field] = { port: detection.configPorts[spec.field]!, source: "config" };
  }

  const owners = portOwners(getAllAdapters().map((a) => a.def));
  const ports = await advisePorts(type, wanted, owners);

  return NextResponse.json({
    fields: detection?.fields ?? {},
    ports,
    configFile: detection?.configFile ?? null,
    configPorts: detection?.configPorts ?? {},
    secretsFound: detection?.secretsFound ?? [],
    notes: detection?.notes ?? [],
    nameFromConfig: detection?.nameFromConfig ?? false,
    dirError: detected && !detected.ok ? detected.error : null,
  });
}
