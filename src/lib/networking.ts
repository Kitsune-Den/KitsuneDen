/**
 * Which ports each server actually uses, and where two of them collide.
 *
 * A port's number is what servers.json sets, else what the game's recipe says
 * the adapter falls back to. Offset ports (7D2D's query port, game + 2) are
 * always derived: the game opens them relative to its game port whatever the
 * Den's config says.
 *
 * Two ports clash when they share a machine, a number and a protocol. TCP 25575
 * and UDP 25575 can both be bound, so they don't clash; "tcp+udp" overlaps both.
 */

import { recipeFor, type GameRecipe, type PortField, type RecipePort } from "./recipes";

/** The slice of a server the networking view needs. Fits both the stored
 *  definition and the browser's ServerInfo. */
export interface NetServer {
  id: string;
  name: string;
  type: string;
  rconHost?: string;
  gamePort?: number;
  queryPort?: number;
  rconPort?: number;
  telnetPort?: number;
  restApiPort?: number;
}

export interface ServerPort {
  serverId: string;
  serverName: string;
  field: PortField;
  purpose: RecipePort["purpose"];
  proto: RecipePort["proto"];
  port: number;
  public: boolean;
  /** "set" in servers.json, the recipe's "default", or an "offset" from another port. */
  source: "set" | "default" | "offset";
  /** For an offset port: "game + 2". */
  offsetLabel?: string;
  note?: string;
}

export interface PortClash {
  port: ServerPort;
  /** Every other port on the same machine it collides with. */
  with: ServerPort[];
}

export const PURPOSE_LABEL: Record<RecipePort["purpose"], string> = {
  game: "Game",
  query: "Steam query",
  rcon: "RCON",
  telnet: "Telnet",
  rest: "REST API",
};

export const PROTO_LABEL: Record<RecipePort["proto"], string> = {
  tcp: "TCP",
  udp: "UDP",
  "tcp+udp": "TCP + UDP",
};

const LOCAL_HOSTS = new Set(["", "127.0.0.1", "localhost", "::1"]);

/** The machine a server runs on. Every server without an rconHost is local. */
export function hostKey(server: Pick<NetServer, "rconHost">): string {
  const host = (server.rconHost ?? "").trim().toLowerCase();
  return LOCAL_HOSTS.has(host) ? "local" : host;
}

function resolvePort(
  recipe: GameRecipe,
  server: NetServer,
  field: PortField
): Pick<ServerPort, "port" | "source" | "offsetLabel"> | undefined {
  const spec = recipe.ports.find((p) => p.field === field);
  if (!spec) return undefined;
  if (spec.offset) {
    const base = resolvePort(recipe, server, spec.offset.from);
    if (!base) return undefined;
    const from = recipe.ports.find((p) => p.field === spec.offset!.from);
    const name = from ? PURPOSE_LABEL[from.purpose].toLowerCase() : spec.offset.from;
    return { port: base.port + spec.offset.by, source: "offset", offsetLabel: `${name} + ${spec.offset.by}` };
  }
  const set = server[field];
  if (typeof set === "number" && set > 0) return { port: set, source: "set" };
  if (spec.default !== undefined) return { port: spec.default, source: "default" };
  return undefined;
}

/** Every port a server uses, in its recipe's order. Empty for a game with no recipe. */
export function serverPorts(server: NetServer): ServerPort[] {
  const recipe = recipeFor(server.type);
  if (!recipe) return [];
  const out: ServerPort[] = [];
  for (const spec of recipe.ports) {
    const resolved = resolvePort(recipe, server, spec.field);
    if (!resolved) continue;
    out.push({
      serverId: server.id,
      serverName: server.name,
      field: spec.field,
      purpose: spec.purpose,
      proto: spec.proto,
      public: spec.public,
      note: spec.note,
      ...resolved,
    });
  }
  return out;
}

function protocolsOverlap(a: RecipePort["proto"], b: RecipePort["proto"]): boolean {
  return a === b || a === "tcp+udp" || b === "tcp+udp";
}

/**
 * The given server's ports that collide with another port on the same
 * machine, its own included (a game port typed into the RCON field too).
 */
export function portClashes(serverId: string, servers: NetServer[]): PortClash[] {
  const self = servers.find((s) => s.id === serverId);
  if (!self) return [];
  const host = hostKey(self);
  const neighbours = servers.filter((s) => hostKey(s) === host).flatMap(serverPorts);
  const clashes: PortClash[] = [];
  for (const port of serverPorts(self)) {
    const hits = neighbours.filter(
      (other) =>
        !(other.serverId === port.serverId && other.field === port.field) &&
        other.port === port.port &&
        protocolsOverlap(other.proto, port.proto)
    );
    if (hits.length) clashes.push({ port, with: hits });
  }
  return clashes;
}
