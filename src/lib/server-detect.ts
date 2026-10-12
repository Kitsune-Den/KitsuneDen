import fs from "fs";
import net from "net";
import dgram from "dgram";
import path from "path";
import type { ServerDefinition } from "./adapters/types";
import { RECIPES, portDefault } from "./recipes";
import { parseSettingsJson } from "./vrising-settings";
import { parseServerConfigXml } from "./seven-days-config";
import { parseOptionSettings } from "./adapters/palworld-adapter";
import { validatePathFields } from "./server-def-security";

/**
 * Autofill for the Add Server form.
 *
 * - Ports: every game has a preferred port per field. A port counts as taken
 *   when another Den server is configured to use it, or when something on
 *   this machine is already listening on it. Taken ports get the next free
 *   candidate, stepping the way that game's servers are usually spaced.
 * - Install folder: reads the server's own config (serverconfig.xml,
 *   server.properties, PalWorldSettings.ini, enshrouded_server.json) and the
 *   files around it (jars, start scripts) to fill the rest of the form.
 *
 * The game reads its port from its own config file, so a port found there is
 * the truth: if it clashes, it's reported with a suggestion rather than
 * silently replaced, and the caller can choose to write the new port back.
 *
 * Passwords found in config files are never returned to the browser (secrets
 * are write-only, see server-def-security.ts). Only their presence is, and
 * gameConfigSecrets() fills them in server-side when the server is saved.
 */

export type GameType = "minecraft" | "7d2d" | "hytale" | "palworld" | "enshrouded" | "valheim" | "vrising";
export type PortField = "gamePort" | "rconPort" | "telnetPort" | "restApiPort" | "queryPort";
type Protocol = "tcp" | "udp" | "both";

interface PortSpec {
  field: PortField;
  preferred: number;
  /** Distance between candidates: 7D2D servers sit 10 apart, Enshrouded pairs 2 apart. */
  step: number;
  /** Consecutive ports the game uses from the base (7D2D uses base, +1, +2). */
  span: number;
  protocol: Protocol;
}

/** Games whose install folder can be read. */
const DETECT_GAMES: GameType[] = ["minecraft", "7d2d", "hytale", "palworld", "enshrouded", "valheim", "vrising"];

/**
 * How far apart to look when the usual port is taken, where that isn't just
 * the ports the field spans: 7D2D game ports sit 10 apart. Everything else
 * steps by its span.
 */
const PORT_STEP: Partial<Record<GameType, Partial<Record<PortField, number>>>> = {
  "7d2d": { gamePort: 10 },
};

/**
 * A game's port specs, from its recipe: the preferred port and protocol of
 * each port with its own field, and a span covering the ports it opens at an
 * offset (7D2D's query port, game + 2, makes its game port span 3). One
 * statement of each port fact, shared with the form, adapters and Networking
 * card.
 */
function specsFromRecipe(type: GameType): PortSpec[] {
  const recipe = RECIPES[type];
  return recipe.ports
    .filter((port) => !port.offset)
    .map((port) => {
      const offsets = recipe.ports.filter((q) => q.offset?.from === port.field).map((q) => q.offset!.by);
      const span = 1 + Math.max(0, ...offsets);
      return {
        field: port.field,
        preferred: portDefault(recipe, port.field)!,
        step: PORT_STEP[type]?.[port.field] ?? span,
        span,
        protocol: port.proto === "tcp+udp" ? "both" : port.proto,
      };
    });
}

export const PORT_SPECS = Object.fromEntries(DETECT_GAMES.map((t) => [t, specsFromRecipe(t)])) as Record<
  GameType,
  PortSpec[]
>;

export function isGameType(t: unknown): t is GameType {
  return typeof t === "string" && t in PORT_SPECS;
}

// ---- Ports other Den servers already claim ----

/** Port fields a server uses, with the defaults its adapter falls back to. */
function claimedPorts(def: ServerDefinition): number[] {
  // A remote Minecraft server's ports live on the other machine.
  if (def.rconHost && !["127.0.0.1", "localhost", "::1"].includes(def.rconHost)) return [];
  if (!isGameType(def.type)) return [];
  const out: number[] = [];
  for (const spec of PORT_SPECS[def.type]) {
    const raw = (def as unknown as Record<string, unknown>)[spec.field];
    const base = typeof raw === "number" && raw > 0 ? raw : spec.preferred;
    for (let i = 0; i < spec.span; i++) out.push(base + i);
  }
  return out;
}

/** port → name of the Den server using it */
export function portOwners(defs: ServerDefinition[]): Map<number, string> {
  const owners = new Map<number, string>();
  for (const def of defs) for (const p of claimedPorts(def)) if (!owners.has(p)) owners.set(p, def.name);
  return owners;
}

// ---- Is something on this machine listening? ----

function tryBindTcp(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.unref();
    srv.once("error", () => resolve(false));
    srv.listen({ port, host: "0.0.0.0", exclusive: true }, () => srv.close(() => resolve(true)));
  });
}

function tryBindUdp(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const sock = dgram.createSocket({ type: "udp4", reuseAddr: false });
    sock.unref();
    sock.once("error", () => {
      try {
        sock.close();
      } catch {}
      resolve(false);
    });
    sock.bind({ port, address: "0.0.0.0", exclusive: true }, () => sock.close(() => resolve(true)));
  });
}

export type FreeCheck = (port: number, protocol: Protocol) => Promise<boolean>;

/** Real check: can we bind it right now? */
export const osPortFree: FreeCheck = async (port, protocol) => {
  if (port < 1 || port > 65535) return false;
  if (protocol !== "udp" && !(await tryBindTcp(port))) return false;
  if (protocol !== "tcp" && !(await tryBindUdp(port))) return false;
  return true;
};

// ---- Allocation ----

export interface PortAdvice {
  value: number;
  /** "config" = read from the game's own config file; "default" = the game's usual port */
  source: "config" | "default" | "entered";
  status: "free" | "adjusted" | "conflict";
  /** Why the wanted port can't be used */
  reason?: string;
  /** Best free port, when value isn't usable */
  suggestion?: number;
}

/**
 * Pick ports for one new server. `wanted` holds ports read from the game's
 * config (source "config") or typed by the user ("entered"); anything else
 * starts from the game's usual port. A wanted port that's taken is kept and
 * flagged with a suggestion; a default that's taken is replaced outright.
 */
export async function advisePorts(
  type: GameType,
  wanted: Partial<Record<PortField, { port: number; source: "config" | "entered" }>>,
  owners: Map<number, string>,
  isFree: FreeCheck = osPortFree
): Promise<Partial<Record<PortField, PortAdvice>>> {
  const allocated = new Set<number>(); // ports already handed out in this call
  const out: Partial<Record<PortField, PortAdvice>> = {};

  const problem = async (base: number, spec: PortSpec): Promise<string | null> => {
    for (let i = 0; i < spec.span; i++) {
      const p = base + i;
      const owner = owners.get(p);
      if (owner) return spec.span > 1 ? `${base}–${base + spec.span - 1} overlaps ${owner} (port ${p})` : `Used by ${owner}`;
      if (allocated.has(p)) return `Also picked for another port of this server`;
      if (!(await isFree(p, spec.protocol))) {
        return spec.span > 1
          ? `Port ${p} (part of ${base}–${base + spec.span - 1}) is already in use on this PC`
          : `Something on this PC is already using it`;
      }
    }
    return null;
  };

  const bestFree = async (spec: PortSpec): Promise<number | undefined> => {
    for (let k = 0, p = spec.preferred; k < 200 && p + spec.span - 1 <= 65535; k++, p += spec.step) {
      if (!(await problem(p, spec))) return p;
    }
    return undefined;
  };

  for (const spec of PORT_SPECS[type]) {
    const w = wanted[spec.field];
    const base = w?.port ?? spec.preferred;
    const why = await problem(base, spec);
    let advice: PortAdvice;
    if (!why) {
      advice = { value: base, source: w?.source ?? "default", status: "free" };
    } else if (w) {
      advice = { value: base, source: w.source, status: "conflict", reason: why, suggestion: await bestFree(spec) };
    } else {
      const next = await bestFree(spec);
      advice = next
        ? { value: next, source: "default", status: "adjusted", reason: `Moved from ${spec.preferred}: ${why.charAt(0).toLowerCase()}${why.slice(1)}` }
        : { value: base, source: "default", status: "conflict", reason: why };
    }
    for (let i = 0; i < spec.span; i++) allocated.add(advice.value + i);
    out[spec.field] = advice;
  }
  return out;
}

// ---- Reading an install folder ----

export interface Detection {
  /** Non-secret fields to prefill */
  fields: Record<string, string | number | string[]>;
  /** Ports the game's own config declares */
  configPorts: Partial<Record<PortField, number>>;
  /** Where the config was read from, relative to dir */
  configFile?: string;
  /** Secret fields present in the game's config (values stay server-side) */
  secretsFound: string[];
  /** Short human notes about what was found */
  notes: string[];
  /** True when the suggested name came from the game's config, not the folder name */
  nameFromConfig: boolean;
}

const num = (v: unknown): number | undefined => {
  const n = typeof v === "number" ? v : parseInt(String(v ?? ""), 10);
  return Number.isFinite(n) && n > 0 && n <= 65535 ? n : undefined;
};

const exists = (p: string) => {
  try {
    return fs.existsSync(p);
  } catch {
    return false;
  }
};

function readText(p: string): string | null {
  try {
    return fs.readFileSync(p, "utf8");
  } catch {
    return null;
  }
}

function parseProperties(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq > 0) out[t.slice(0, eq).trim()] = t.slice(eq + 1).trim();
  }
  return out;
}

const STEAMCMD_GUESSES = ["C:\\SteamCMD\\steamcmd.exe", "C:\\steamcmd\\steamcmd.exe", "C:\\Program Files\\SteamCMD\\steamcmd.exe"];

function findSteamCmd(dir: string): string | undefined {
  const near = [path.join(path.dirname(dir), "steamcmd", "steamcmd.exe"), path.join(path.dirname(dir), "SteamCMD", "steamcmd.exe")];
  return [...near, ...STEAMCMD_GUESSES].find(exists);
}

function firstExisting(dir: string, names: string[]): string | undefined {
  return names.find((n) => exists(path.join(dir, n)));
}

/** Newest version folder under a libraries path, by numeric compare. */
function newestSubdir(p: string): string | undefined {
  try {
    const dirs = fs.readdirSync(p, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);
    const key = (s: string) => s.split(/[.\-]/).map((x) => parseInt(x, 10) || 0);
    return dirs.sort((a, b) => {
      const ka = key(a), kb = key(b);
      for (let i = 0; i < Math.max(ka.length, kb.length); i++) if ((ka[i] ?? 0) !== (kb[i] ?? 0)) return (kb[i] ?? 0) - (ka[i] ?? 0);
      return 0;
    })[0];
  } catch {
    return undefined;
  }
}

function detectMinecraft(dir: string, d: Detection) {
  const propsText = readText(path.join(dir, "server.properties"));
  if (propsText) {
    const p = parseProperties(propsText);
    d.configFile = "server.properties";
    const game = num(p["server-port"]);
    if (game) d.configPorts.gamePort = game;
    const rcon = num(p["rcon.port"]);
    if (rcon) d.configPorts.rconPort = rcon;
    if (p["rcon.password"]) d.secretsFound.push("rconPassword");
    if (p["enable-rcon"] !== "true") d.notes.push("RCON is off in server.properties (enable-rcon). Turn it on so the Den can send console commands.");
  } else {
    d.notes.push("No server.properties yet. Minecraft creates it on first start, using port 25565.");
  }

  // Loader and how to launch it
  const neo = path.join(dir, "libraries", "net", "neoforged", "neoforge");
  const forge = path.join(dir, "libraries", "net", "minecraftforge", "forge");
  const argfileFrom = (root: string, loader: "NeoForge" | "Forge") => {
    const ver = newestSubdir(root);
    if (!ver) return false;
    const rel = path.posix.join("libraries", ...path.relative(dir, root).split(path.sep).slice(1), ver, "win_args.txt");
    if (!exists(path.join(dir, rel))) return false;
    d.fields.loader = loader;
    d.fields.launchMode = "argfile";
    d.fields.argFiles = [...(exists(path.join(dir, "user_jvm_args.txt")) ? ["user_jvm_args.txt"] : []), rel];
    // NeoForge 21.1.x → Minecraft 1.21.1; Forge "1.20.1-47.2.0" → 1.20.1
    if (loader === "NeoForge") {
      const [maj, min] = ver.split(".");
      if (maj && min) d.fields.version = `1.${maj}${min === "0" ? "" : `.${min}`}`;
    } else {
      d.fields.version = ver.split("-")[0];
    }
    d.notes.push(`${loader} ${ver}, launched with its argument files.`);
    return true;
  };
  if (!argfileFrom(neo, "NeoForge") && !argfileFrom(forge, "Forge")) {
    let jars: string[] = [];
    try {
      jars = fs.readdirSync(dir).filter((f) => f.toLowerCase().endsWith(".jar"));
    } catch {}
    const pick =
      jars.find((j) => j === "fabric-server-launch.jar") ||
      jars.find((j) => /^paper.*\.jar$/i.test(j)) ||
      jars.find((j) => /^purpur.*\.jar$/i.test(j)) ||
      jars.find((j) => j === "server.jar") ||
      jars.find((j) => /^minecraft_server.*\.jar$/i.test(j)) ||
      jars[0];
    if (pick) {
      d.fields.jar = pick;
      d.fields.launchMode = "jar";
      d.fields.loader = /fabric/i.test(pick) ? "Fabric" : /paper/i.test(pick) ? "Paper" : /purpur/i.test(pick) ? "Purpur" : "Vanilla";
      d.notes.push(`Launches ${pick}.`);
    } else {
      d.notes.push("No server jar found in this folder.");
    }
  }
  // Vanilla/Fabric unpack to versions/<mc-version>/ on first run
  if (!d.fields.version) {
    const v = newestSubdir(path.join(dir, "versions"));
    if (v && /^\d+\.\d+/.test(v)) d.fields.version = v;
  }
  d.fields.name = path.basename(dir);
}

function detect7d2d(dir: string, d: Detection) {
  const configFile = firstExisting(dir, ["serverconfig.xml"]);
  if (configFile) {
    const c = parseServerConfigXml(readText(path.join(dir, configFile)) ?? "");
    d.configFile = configFile;
    d.fields.configFile = configFile;
    const game = num(c.ServerPort);
    if (game) d.configPorts.gamePort = game;
    const telnet = num(c.TelnetPort);
    if (telnet) d.configPorts.telnetPort = telnet;
    if (c.TelnetPassword) d.secretsFound.push("telnetPassword");
    if (c.TelnetEnabled && c.TelnetEnabled.toLowerCase() !== "true") {
      d.notes.push("Telnet is off in serverconfig.xml (TelnetEnabled). The Den needs it for console commands and stopping cleanly.");
    }
    if (c.ServerName && c.ServerName !== "My Game Host") {
      d.fields.name = c.ServerName;
      d.nameFromConfig = true;
    }
  } else {
    d.notes.push("No serverconfig.xml in this folder. Is it the 7 Days to Die dedicated server folder?");
  }
  if (exists(path.join(dir, "Mods"))) d.fields.modsDir = "Mods";
  if (!d.fields.name) d.fields.name = path.basename(dir);
}

function detectPalworld(dir: string, d: Detection) {
  const rel = path.join("Pal", "Saved", "Config", "WindowsServer", "PalWorldSettings.ini");
  const text = readText(path.join(dir, rel));
  if (text) {
    const s = parseOptionSettings(text);
    d.configFile = rel.split(path.sep).join("/");
    const pub = num(s.PublicPort);
    if (pub) d.configPorts.gamePort = pub;
    const rcon = num(s.RCONPort);
    if (rcon) d.configPorts.rconPort = rcon;
    const rest = num(s.RESTAPIPort);
    if (rest) d.configPorts.restApiPort = rest;
    if (s.AdminPassword) d.secretsFound.push("rconPassword", "restApiPassword");
    if (s.ServerName && s.ServerName !== "Default Palworld Server") {
      d.fields.name = s.ServerName;
      d.nameFromConfig = true;
    }
  } else if (exists(path.join(dir, "PalServer.exe"))) {
    d.notes.push("No PalWorldSettings.ini yet. The Den writes one with these ports the first time it starts the server.");
  } else {
    d.notes.push("No PalServer.exe in this folder. Is it the Palworld dedicated server folder?");
  }
  const steam = findSteamCmd(dir);
  if (steam) d.fields.steamCmdPath = steam;
  if (!d.fields.name) d.fields.name = path.basename(dir);
}

function detectEnshrouded(dir: string, d: Detection) {
  const text = readText(path.join(dir, "enshrouded_server.json"));
  if (text) {
    try {
      const c = JSON.parse(text) as Record<string, unknown>;
      d.configFile = "enshrouded_server.json";
      d.fields.configFile = "enshrouded_server.json";
      // Enshrouded's one port is its config's queryPort (the Den's Game
      // Port); a gamePort key is left over from older configs and unused.
      const port = num(c.queryPort);
      if (port) d.configPorts.gamePort = port;
      if (typeof c.name === "string" && c.name && c.name !== "Enshrouded Server") {
        d.fields.name = c.name;
        d.nameFromConfig = true;
      }
    } catch {
      d.notes.push("enshrouded_server.json isn't valid JSON, so it was skipped.");
    }
  } else if (exists(path.join(dir, "enshrouded_server.exe"))) {
    d.notes.push("No enshrouded_server.json yet. The Den writes one with these ports the first time it starts the server.");
  } else {
    d.notes.push("No enshrouded_server.exe in this folder. Is it the Enshrouded dedicated server folder?");
  }
  const script = firstExisting(dir, ["start_enshrouded.bat"]);
  if (script) d.fields.startScript = script;
  const steam = findSteamCmd(dir);
  if (steam) d.fields.steamCmdPath = steam;
  if (!d.fields.name) d.fields.name = path.basename(dir);
}

function detectHytale(dir: string, d: Detection) {
  const script = firstExisting(dir, ["start.bat", "run.bat", "start-server.bat"]);
  if (script) d.fields.startScript = script;
  else d.notes.push("No start.bat found. Point Start Script at whatever launches the server.");
  d.fields.processFilter = "HytaleServer";
  d.fields.name = path.basename(dir);
}

/**
 * Valheim has no config of its own (settings are launch flags the Den keeps
 * in kitsuneden-valheim.json), so there are no config ports to read.
 */
function detectValheim(dir: string, d: Detection) {
  if (!exists(path.join(dir, "valheim_server.exe"))) {
    d.notes.push("No valheim_server.exe here yet. Once the SteamCMD path is set, the Update tab can install it.");
  }
  const settings = readText(path.join(dir, "kitsuneden-valheim.json"));
  if (settings) {
    try {
      const c = JSON.parse(settings) as Record<string, unknown>;
      if (typeof c.name === "string" && c.name.trim()) {
        d.fields.name = c.name;
        d.nameFromConfig = true;
      }
    } catch {
      d.notes.push("kitsuneden-valheim.json isn't valid JSON, so it was skipped.");
    }
  }
  const steam = findSteamCmd(dir);
  if (steam) d.fields.steamCmdPath = steam;
  if (!d.fields.name) d.fields.name = path.basename(dir);
}

/**
 * V Rising keeps ServerHostSettings.json under save-data (written with a
 * BOM). Its ports are read so an existing server keeps them, but no
 * configFile is reported: the Den writes Server setup's ports into that file
 * before every start, so there's nothing for the form to keep in step.
 */
function detectVRising(dir: string, d: Detection) {
  if (!exists(path.join(dir, "VRisingServer.exe"))) {
    d.notes.push("No VRisingServer.exe here yet. Once the SteamCMD path is set, the Update tab can install it.");
  }
  const text = readText(path.join(dir, "save-data", "Settings", "ServerHostSettings.json"));
  if (text) {
    try {
      const c = parseSettingsJson(text);
      const port = num(c.Port);
      if (port) d.configPorts.gamePort = port;
      const rcon = c.Rcon && typeof c.Rcon === "object" ? (c.Rcon as Record<string, unknown>) : null;
      const rconPort = num(rcon?.Port);
      if (rconPort) d.configPorts.rconPort = rconPort;
      if (typeof rcon?.Password === "string" && rcon.Password) d.secretsFound.push("rconPassword");
      if (typeof c.Name === "string" && c.Name.trim() && c.Name !== "V Rising Server") {
        d.fields.name = c.Name;
        d.nameFromConfig = true;
      }
      d.notes.push("Ports read from ServerHostSettings.json. The Den writes Server setup's ports there before every start.");
    } catch {
      d.notes.push("ServerHostSettings.json isn't valid JSON, so it was skipped.");
    }
  }
  const steam = findSteamCmd(dir);
  if (steam) d.fields.steamCmdPath = steam;
  if (!d.fields.name) d.fields.name = path.basename(dir);
}

export type DetectResult = { ok: true; detection: Detection } | { ok: false; error: string };

/** Read what's already in an install folder. Never returns secret values. */
export function detectInstall(type: GameType, dir: string): DetectResult {
  const pathError = validatePathFields({ dir });
  if (pathError) return { ok: false, error: pathError };
  let stat: fs.Stats;
  try {
    stat = fs.statSync(dir);
  } catch {
    return { ok: false, error: "That folder doesn't exist." };
  }
  if (!stat.isDirectory()) return { ok: false, error: "That's a file, not a folder." };

  const d: Detection = { fields: {}, configPorts: {}, secretsFound: [], notes: [], nameFromConfig: false };
  if (type === "minecraft") detectMinecraft(dir, d);
  else if (type === "7d2d") detect7d2d(dir, d);
  else if (type === "palworld") detectPalworld(dir, d);
  else if (type === "enshrouded") detectEnshrouded(dir, d);
  else if (type === "valheim") detectValheim(dir, d);
  else if (type === "vrising") detectVRising(dir, d);
  else detectHytale(dir, d);
  return { ok: true, detection: d };
}

// ---- Server-side only: secrets and port write-back ----

/** Secret values from the game's own config, for filling blanks on save. */
export function gameConfigSecrets(type: string, dir: string): Record<string, string> {
  if (!isGameType(type) || validatePathFields({ dir })) return {};
  if (type === "minecraft") {
    const t = readText(path.join(dir, "server.properties"));
    const pw = t ? parseProperties(t)["rcon.password"] : undefined;
    return pw ? { rconPassword: pw } : {};
  }
  if (type === "7d2d") {
    const t = readText(path.join(dir, "serverconfig.xml"));
    const pw = t ? parseServerConfigXml(t).TelnetPassword : undefined;
    return pw ? { telnetPassword: pw } : {};
  }
  if (type === "palworld") {
    const t = readText(path.join(dir, "Pal", "Saved", "Config", "WindowsServer", "PalWorldSettings.ini"));
    const pw = t ? parseOptionSettings(t).AdminPassword : undefined;
    return pw ? { rconPassword: pw, restApiPassword: pw } : {};
  }
  return {};
}

/** Which key in each game's config holds each Den port field. */
export const CONFIG_PORT_KEYS: Partial<Record<GameType, Partial<Record<PortField, string>>>> = {
  minecraft: { gamePort: "server-port", rconPort: "rcon.port" },
  "7d2d": { gamePort: "ServerPort", telnetPort: "TelnetPort" },
  palworld: { gamePort: "PublicPort", rconPort: "RCONPort", restApiPort: "RESTAPIPort" },
  enshrouded: { gamePort: "queryPort" },
};
