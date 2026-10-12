/**
 * Game recipes: everything the Den knows about running one game's server,
 * in one place. Where it comes from, how it launches, which ports it opens,
 * how it's controlled and stopped, where the world lives, how players join,
 * and what we haven't solved yet.
 *
 * Borrowed from PackRelay's catalogue, with one deliberate change. PackRelay
 * spreads a game across ~8 tables (install, catalogue, notes, defaults,
 * connect info, ports, platform support, port sync), and its own comments
 * record the bugs that came from two halves of one fact drifting apart
 * (7D2D's query port being the famous one). Here a game is ONE object, and
 * anything derived from it (form defaults, firewall hints) is computed from
 * it rather than restated.
 *
 * Facts marked "measured" were observed on a running server, ours or
 * PackRelay's. Unmarked facts come from the game's docs or the adapter code.
 * See docs/recipes.md for the design.
 */

import type { ServerDefinition } from "./adapters/types";

export type GameType = ServerDefinition["type"];

/**
 * How much the Den has actually seen this game work, not how much it offers.
 *  - verified: run through the Den end to end (start, join, stop, backup).
 *  - experimental: the adapter exists but a named gap is still open.
 */
export type RecipeTier = "verified" | "experimental";

/** A ServerDefinition field that holds a port number. */
export type PortField = "gamePort" | "queryPort" | "rconPort" | "telnetPort" | "restApiPort";

export interface RecipePort {
  /** The servers.json field this port lives in. */
  field: PortField;
  purpose: "game" | "query" | "rcon" | "telnet" | "rest";
  proto: "tcp" | "udp" | "tcp+udp";
  /** The game's own default. Omit when it's an offset from another port. */
  default?: number;
  /** Sits at another port + N (7D2D's query port is ServerPort+2). */
  offset?: { from: PortField; by: number };
  /** Players need it forwarded. Control ports (RCON, telnet, REST) are
   *  false: they should never be opened to the internet. */
  public: boolean;
  note?: string;
}

export type RecipeInstall =
  /** SteamCMD dedicated-server app. `denCanInstall` = the adapter runs it. */
  | { kind: "steamcmd"; appId: number; anonymous: boolean; denCanInstall: boolean }
  /** Copied out of the game's own launcher install on this machine. */
  | { kind: "launcher"; source: string }
  /** You bring the files; the Den points at them. */
  | { kind: "manual"; help: string };

export interface GameRecipe {
  type: GameType;
  tier: RecipeTier;
  /** What has been watched working, and where. Shown in the game picker. */
  evidence: string;
  /** Platforms the dedicated server itself ships for. The Den runs on Windows. */
  platforms: { windows: boolean; linux: boolean };
  install: RecipeInstall;
  launch: {
    kind: "exe" | "script" | "java";
    /** The file the Den starts, relative to the install dir. */
    entry: string;
    /** What it falls back to when `entry` isn't there. */
    fallback?: string;
    help?: string;
  };
  ports: RecipePort[];
  control: {
    /** Remote console the Den speaks, if any. */
    console: "rcon" | "telnet" | "none";
    /** How Stop asks the game to save and exit. */
    stop: string;
    /** Where the player list comes from. */
    players: string;
  };
  saves: {
    /** Where the world lives, relative to the install dir unless absolute. */
    path: string;
    /** How the Den backs it up. */
    backup: "zip" | "script" | "none";
    note?: string;
  };
  config: { file: string; format: "xml" | "ini" | "json" | "properties" }[];
  /** One sentence on how a player joins. */
  connect: string;
  /** Steam client app id, for a "join in Steam" link later. */
  steamClientAppId?: number;
  /** Non-port fields the Add Server form pre-fills. Ports come from `ports`. */
  defaults: Partial<Omit<ServerDefinition, PortField | "id" | "name" | "type" | "dir">>;
  /** Known gaps, named. Empty means we know of none, not that there are none. */
  gaps: string[];
}

export const RECIPES: Record<GameType, GameRecipe> = {
  minecraft: {
    type: "minecraft",
    tier: "verified",
    evidence: "Tested in the maintainers' own Den, locally and as a remote server over RCON and SSH.",
    platforms: { windows: true, linux: true },
    install: {
      kind: "manual",
      help: "Drop in the server jar for your loader (Vanilla, Fabric, Paper) or run the NeoForge/Forge installer, then point the Den at the folder.",
    },
    launch: {
      kind: "java",
      entry: "server.jar",
      help: "jar mode runs `java -jar <jar>`; argfile mode (NeoForge/Forge) runs java with the installer's @arg files.",
    },
    ports: [
      { field: "gamePort", purpose: "game", proto: "tcp", default: 25565, public: true },
      {
        field: "rconPort",
        purpose: "rcon",
        proto: "tcp",
        default: 25575,
        public: false,
        note: "Palworld's RCON defaults to 25575 too. Running both? Move one.",
      },
    ],
    control: {
      console: "rcon",
      stop: "RCON `stop`, process kill as the fallback.",
      players: "RCON `list`, plus ops/whitelist/banned-players JSON in the server folder.",
    },
    saves: {
      path: "world",
      backup: "zip",
      note: "Folder name is `level-name` in server.properties. Backups are hidden for remote servers (the zip would be empty).",
    },
    config: [{ file: "server.properties", format: "properties" }],
    connect: "Multiplayer → Add Server → the address (add :port if it isn't 25565).",
    defaults: { launchMode: "jar", jar: "server.jar", loader: "Vanilla" },
    gaps: [
      "The Den can't install or update the jar; PackRelay's Mojang/Paper/Fabric/NeoForge resolvers are the model if we want it.",
      "A remote server can't be started without a `lifecycle` SSH block in servers.json.",
    ],
  },

  "7d2d": {
    type: "7d2d",
    tier: "verified",
    evidence: "Tested in the maintainers' own Den. The config, Sandbox and admin editors are tested against 3.x.",
    platforms: { windows: true, linux: true },
    install: { kind: "steamcmd", appId: 294420, anonymous: true, denCanInstall: false },
    launch: {
      kind: "exe",
      entry: "7DaysToDieServer.exe",
      help: "Started with -configfile=<config> -logfile logs/7d2d-server.log -quit -batchmode -nographics -dedicated.",
    },
    ports: [
      { field: "gamePort", purpose: "game", proto: "tcp+udp", default: 26900, public: true },
      // Measured by PackRelay on 3.2.0: ServerPort 26950 bound 26950 TCP+UDP
      // and 26952 UDP, nothing on +1. Not a field in the Den's form: the game
      // picks it from the game port, so there's nothing to set.
      {
        field: "queryPort",
        purpose: "query",
        proto: "udp",
        offset: { from: "gamePort", by: 2 },
        public: true,
        note: "The game opens this itself, two above the game port. Forward it too, or the server won't show in the in-game browser.",
      },
      { field: "telnetPort", purpose: "telnet", proto: "tcp", default: 8081, public: false },
    ],
    control: {
      console: "telnet",
      stop: "Telnet `shutdown`, process kill as the fallback.",
      players: "Telnet `listplayers`, plus serveradmin.xml for admins, whitelist and bans.",
    },
    saves: {
      path: "%APPDATA%\\7DaysToDie\\Saves",
      backup: "none",
      note: "Unless UserDataFolder is set in serverconfig.xml. PackRelay launches with -UserDataFolder=<instance>/UserData so the world lives with the server and backs up as one folder.",
    },
    config: [
      { file: "serverconfig.xml", format: "xml" },
      { file: "serveradmin.xml", format: "xml" },
    ],
    connect: "Find it in the in-game server browser, or Connect to IP with the address.",
    steamClientAppId: 251570,
    defaults: { configFile: "serverconfig.xml", modsDir: "Mods" },
    gaps: [
      "No backups: the world lives in %APPDATA% by default, outside the server folder.",
      "No SteamCMD update, though the app is anonymous and the other Steam games already have it.",
      "The query port (game+2) isn't modelled, so firewall hints would be a port short.",
    ],
  },

  hytale: {
    type: "hytale",
    tier: "verified",
    evidence: "Tested in the maintainers' own Den, with KitsuneCommand when the mod is installed.",
    platforms: { windows: true, linux: true },
    install: {
      kind: "launcher",
      source: "%APPDATA%\\Hytale\\install\\release\\package\\game\\latest (HytaleServer.jar + Assets.zip)",
    },
    launch: {
      kind: "script",
      entry: "start.bat",
      help: "The script runs `java -jar HytaleServer.jar --assets Assets.zip`. The Den finds the process by its command line (processFilter, default HytaleServer).",
    },
    ports: [
      {
        field: "gamePort",
        purpose: "game",
        proto: "udp",
        default: 5520,
        public: true,
        note: "QUIC over UDP only. A TCP forward does nothing.",
      },
    ],
    control: {
      console: "none",
      stop: "Process terminate. The world saves on its own tick.",
      players: "universe/players/*.json, or KitsuneCommand when installed.",
    },
    saves: {
      path: "universe",
      backup: "script",
      note: "Worlds under universe/worlds, players under universe/players, warps in universe/warps.json. Backups run your backupScript.",
    },
    config: [
      { file: "config.json", format: "json" },
      { file: "universe/worlds/<world>/config.json", format: "json" },
    ],
    connect: "Add the server address in-game. Forward UDP 5520.",
    defaults: { startScript: "start.bat", processFilter: "HytaleServer" },
    gaps: [
      "No remote console, so no live commands without KitsuneCommand.",
      "Readiness can't be probed: QUIC on UDP gives no TCP socket to check.",
      "Stop is a terminate, not a graceful save-and-exit.",
      "Backups need a script; there's no built-in zip yet.",
    ],
  },

  palworld: {
    type: "palworld",
    tier: "verified",
    evidence: "Tested in the maintainers' own Den, with RCON, the REST API and SteamCMD updates.",
    platforms: { windows: true, linux: true },
    install: { kind: "steamcmd", appId: 2394010, anonymous: true, denCanInstall: true },
    launch: {
      kind: "script",
      entry: "start_palworld.bat",
      fallback: "PalServer-Win64-Shipping-Cmd.exe",
      help: "Without the script, the exe runs with -useperfthreads -NoAsyncLoadingThread -UseMultithreadForDS.",
    },
    ports: [
      { field: "gamePort", purpose: "game", proto: "udp", default: 8211, public: true },
      {
        field: "rconPort",
        purpose: "rcon",
        proto: "tcp",
        default: 25575,
        public: false,
        note: "Same default as Minecraft's RCON. The example config uses 25577 for that reason.",
      },
      { field: "restApiPort", purpose: "rest", proto: "tcp", default: 8212, public: false },
    ],
    control: {
      console: "rcon",
      stop: "RCON `Shutdown 5`, process kill as the fallback.",
      players: "REST API /players, with RCON as the fallback.",
    },
    saves: {
      path: "Pal\\Saved\\SaveGames",
      backup: "zip",
      note: "The Den sends RCON `Save` first, then zips into ../backups/palworld.",
    },
    config: [{ file: "Pal\\Saved\\Config\\WindowsServer\\PalWorldSettings.ini", format: "ini" }],
    connect: "Join Multiplayer (Dedicated Servers) → search, or enter the address directly.",
    steamClientAppId: 1623730,
    defaults: { steamAppId: 2394010, startScript: "start_palworld.bat" },
    gaps: [
      "RCON and the REST API are off until RCONEnabled / RESTAPIEnabled and an AdminPassword are set in PalWorldSettings.ini. The Den doesn't check.",
    ],
  },

  enshrouded: {
    type: "enshrouded",
    tier: "experimental",
    evidence: "Runs in the maintainers' own Den. Its single-port setup follows Keen's docs and a PackRelay measurement, and hasn't been run through the Den on a live server yet.",
    platforms: { windows: true, linux: false },
    install: { kind: "steamcmd", appId: 2278520, anonymous: true, denCanInstall: true },
    launch: {
      kind: "script",
      entry: "start_enshrouded.bat",
      fallback: "enshrouded_server.exe",
    },
    // One UDP port for joining and the server browser. Enshrouded's config
    // names it `queryPort`; the separate `gamePort` key is gone. Sources:
    // Keen's "Dedicated Server Configuration" article (updated 2025-02-21),
    // whose example config has only "queryPort": 15637, and PackRelay's
    // measurement of a v0.0.15.0 server: it bound and answered A2S on 15637,
    // with 15636 silent. The Den keeps it in servers.json's gamePort, like
    // every other game, and writes it into the config before each start.
    ports: [
      {
        field: "gamePort",
        purpose: "game",
        proto: "udp",
        default: 15637,
        public: true,
        note: "One port for joining and the server browser. Enshrouded's config calls it queryPort; the Den writes it there before every start.",
      },
    ],
    control: {
      console: "none",
      stop: "Process terminate. The game saves on its own tick.",
      players: "Best guess from connect/disconnect lines in the log.",
    },
    saves: { path: "savegame", backup: "zip", note: "Zipped into ../backups/enshrouded." },
    config: [{ file: "enshrouded_server.json", format: "json" }],
    connect: "Join the server by IP with the address.",
    defaults: { steamAppId: 2278520, startScript: "start_enshrouded.bat", configFile: "enshrouded_server.json" },
    gaps: [
      "The single-port setup hasn't been run through the Den on a live server yet. Once someone has started it, joined on the Game Port and stopped it, this can be marked verified.",
      "No remote console, so no live commands, and player presence is scraped from the log.",
    ],
  },
};

export function recipeFor(type: string | undefined): GameRecipe | undefined {
  return type ? RECIPES[type as GameType] : undefined;
}

/** A port's default number, resolving offsets against the other defaults. */
export function portDefault(recipe: GameRecipe, field: PortField): number | undefined {
  const p = recipe.ports.find((x) => x.field === field);
  if (!p) return undefined;
  if (p.default !== undefined) return p.default;
  if (p.offset) {
    const base = portDefault(recipe, p.offset.from);
    return base === undefined ? undefined : base + p.offset.by;
  }
  return undefined;
}

/**
 * The default an adapter falls back to when servers.json leaves a field unset.
 * Adapters call this once, at import, so a recipe that loses a default an
 * adapter needs fails the test suite instead of a live start.
 */
export function recipeDefault<K extends keyof ServerDefinition>(
  type: GameType,
  field: K
): NonNullable<ServerDefinition[K]> {
  const value = recipeDefaults(type)[field];
  if (value === undefined || value === null) {
    throw new Error(`The ${type} recipe has no default for ${String(field)}`);
  }
  return value as NonNullable<ServerDefinition[K]>;
}

/** What the Add Server form pre-fills: the recipe's defaults plus its port
 *  defaults. Computed, so the port numbers are stated exactly once. */
export function recipeDefaults(type: string | undefined): Partial<ServerDefinition> {
  const recipe = recipeFor(type);
  if (!recipe) return {};
  const out: Partial<ServerDefinition> = { ...recipe.defaults };
  for (const p of recipe.ports) {
    const n = portDefault(recipe, p.field);
    if (n !== undefined) out[p.field] = n;
  }
  return out;
}
