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
    // Updates stay on the installed branch (steamapps/appmanifest betakey) and
    // put serverconfig.xml back afterwards: `validate` restores the shipped
    // copy, and PackRelay lost a server's port to exactly that (2026-10-03).
    install: { kind: "steamcmd", appId: 294420, anonymous: true, denCanInstall: true },
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
      path: "Saves\\<world>\\<GameName>",
      backup: "zip",
      note: "Saves is UserDataFolder\\Saves when serverconfig.xml sets UserDataFolder, else %APPDATA%\\7DaysToDie\\Saves. The world stays where it is: a backup runs `saveworld` over telnet, then zips a copy with serveradmin.xml and the server config into ../backups/7d2d.",
    },
    config: [
      { file: "serverconfig.xml", format: "xml" },
      { file: "serveradmin.xml", format: "xml" },
    ],
    connect: "Find it in the in-game server browser, or Connect to IP with the address.",
    steamClientAppId: 251570,
    defaults: { configFile: "serverconfig.xml", modsDir: "Mods", steamAppId: 294420 },
    gaps: [
      "Backups leave out random-gen map files (GeneratedWorlds, often hundreds of MB). The game rebuilds them from the seed, but only reliably on the same game version.",
      "An update puts back only serverconfig.xml (and a custom configFile). Any other shipped file edited in place, like the XMLs under Data\\Config, is reset to stock by SteamCMD; keep those changes in a mod under Mods instead.",
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

  // Launch flags, ports, password rules and save layout as PackRelay
  // measured them on real servers (verified there on Windows and Linux).
  // See src/lib/valheim-settings.ts for the details behind each flag.
  valheim: {
    type: "valheim",
    tier: "experimental",
    evidence: "New in the Den and not yet run through it. Its launch flags, ports and password rules follow PackRelay, which has run Valheim on Windows and Linux.",
    platforms: { windows: true, linux: true },
    install: { kind: "steamcmd", appId: 896660, anonymous: true, denCanInstall: true },
    launch: {
      kind: "exe",
      entry: "valheim_server.exe",
      help: "Started directly with -nographics -batchmode and the settings from kitsuneden-valheim.json (name, port, world, password, public, crossplay, autosave, preset and modifiers), -preset ahead of the modifiers it would otherwise reset.",
    },
    // Query is always game + 1: measured with gamePort 2466, A2S answered on
    // 2467 and nothing on 2466 or 2457.
    ports: [
      { field: "gamePort", purpose: "game", proto: "udp", default: 2456, public: true },
      {
        field: "queryPort",
        purpose: "query",
        proto: "udp",
        offset: { from: "gamePort", by: 1 },
        public: true,
        note: "Always one above the game port. Forward both, or the server won't show in the community list.",
      },
    ],
    control: {
      console: "none",
      stop: "Process kill. Valheim has no console and Windows gives it no Ctrl+C, so the world keeps its last autosave.",
      players: "Characters seen spawning in the log; there's no live online list.",
    },
    saves: {
      path: "valheim-data",
      backup: "zip",
      note: "-savedir keeps worlds in the server folder (valheim-data\\worlds_local), not the shared AppData\\LocalLow\\IronGate profile. Backups zip a copy of it with kitsuneden-valheim.json into ../backups/valheim.",
    },
    config: [{ file: "kitsuneden-valheim.json", format: "json" }],
    connect: "Join Game → Join IP with the address and port, or find it in the community list when it's public. Crossplay servers are joined with the code in the log.",
    steamClientAppId: 892970,
    defaults: { steamAppId: 896660 },
    gaps: [
      "Not yet run through the Den. Once someone has installed it, started it, joined and stopped it, mark it verified.",
      "Stop is a kill, so anything since the last autosave is lost. The Den sets autosave to every 10 minutes (the game's default is 30); lower it on the Config tab to lose less.",
      "Backups of a running server hold its last autosave, since there's no way to make it save first.",
      "No live player list: only characters seen in the log. Valheim's query port could give one later.",
    ],
  },

  // Launch, settings files, BOM handling and RCON setup as PackRelay
  // measured them (verified there). See src/lib/vrising-settings.ts.
  vrising: {
    type: "vrising",
    tier: "experimental",
    evidence: "New in the Den and not yet run through it. Its launch, settings files and RCON setup follow PackRelay, which has run V Rising on Windows.",
    platforms: { windows: true, linux: false },
    install: { kind: "steamcmd", appId: 1829350, anonymous: true, denCanInstall: true },
    launch: {
      kind: "exe",
      entry: "VRisingServer.exe",
      help: "Started with -persistentDataPath save-data, so settings and saves live in the server folder. Its output is the log (logs\\VRisingServer.log); -logFile would leave the console empty.",
    },
    // All three are written into ServerHostSettings.json before every start.
    ports: [
      { field: "gamePort", purpose: "game", proto: "udp", default: 9876, public: true },
      {
        field: "queryPort",
        purpose: "query",
        proto: "udp",
        offset: { from: "gamePort", by: 1 },
        public: true,
        note: "The Den writes it as one above the game port, so servers pair up (9876/9877, 9878/9879). Forward both.",
      },
      {
        field: "rconPort",
        purpose: "rcon",
        proto: "tcp",
        default: 25575,
        public: false,
        note: "Same default as Minecraft's and Palworld's RCON. Running more than one? Move it in Server setup.",
      },
    ],
    control: {
      console: "rcon",
      stop: "RCON `shutdown`, and V Rising saves as it exits. A kill if it's still up a minute later.",
      players: "Not listed yet: the RCON player list isn't confirmed, and the Steam query only answers when listed.",
    },
    saves: {
      path: "save-data",
      backup: "zip",
      note: "Saves and Settings both live under save-data. Backups zip a copy of it into ../backups/vrising. There's no save command, so a running server's backup is its last autosave (every 2 minutes by default).",
    },
    config: [
      { file: "save-data\\Settings\\ServerHostSettings.json", format: "json" },
      { file: "save-data\\Settings\\ServerGameSettings.json", format: "json" },
    ],
    connect: "Find it in the server list (a new server is listed on Steam and EOS), or Direct Connect with the address and game port.",
    steamClientAppId: 1604030,
    defaults: { steamAppId: 1829350 },
    gaps: [
      "Not yet run through the Den. Once someone has installed it, started it, joined and stopped it, mark it verified.",
      "The Config tab edits ServerHostSettings.json only. The game rules (ServerGameSettings.json, about 165 settings) are edited by hand in save-data\\Settings for now, and a preset on the Config tab overrides them.",
      "No player list yet.",
      "No mod support (BepInEx).",
    ],
  },

  // Launch, servertest.ini and RCON setup as PackRelay measured them on a
  // real Windows server. See src/lib/zomboid-settings.ts.
  projectzomboid: {
    type: "projectzomboid",
    tier: "experimental",
    evidence: "New in the Den and not yet run through it. Its launch, settings and RCON setup follow PackRelay, which has run Project Zomboid on Windows (ready in about a minute, a clean quit in 11 s).",
    platforms: { windows: true, linux: true },
    install: { kind: "steamcmd", appId: 380870, anonymous: true, denCanInstall: true },
    launch: {
      kind: "java",
      entry: "jre64\\bin\\java.exe",
      help: "The game's bundled Java, run directly with its own JVM flags plus -cachedir=./zomboid-data and -adminpassword. Not StartServer64.bat, which passes on only two arguments, fixes the heap at 16 GB and ends in PAUSE.",
    },
    // DefaultPort, UDPPort, RCONPort and RCONPassword are written into
    // servertest.ini before every start. PackRelay saw UDP 16261 + 16262.
    ports: [
      { field: "gamePort", purpose: "game", proto: "udp", default: 16261, public: true },
      {
        field: "queryPort",
        purpose: "game",
        proto: "udp",
        offset: { from: "gamePort", by: 1 },
        public: true,
        note: "Project Zomboid's second UDP port (UDPPort), written as one above the game port. Forward both.",
      },
      {
        field: "rconPort",
        purpose: "rcon",
        proto: "tcp",
        default: 27015,
        public: false,
        note: "Project Zomboid's default, which the Steam client also uses on a machine someone plays on. Writing the port and a password into servertest.ini is what turns RCON on.",
      },
    ],
    control: {
      console: "rcon",
      stop: "RCON `quit`, and it saves on the way out (11 s when PackRelay measured it). A kill if it's still up a minute later.",
      players: "RCON `players`.",
    },
    saves: {
      path: "zomboid-data",
      backup: "zip",
      note: "-cachedir keeps the world, database, logs and Server\\servertest.ini in zomboid-data, not the shared %USERPROFILE%\\Zomboid. Backups send RCON `save` first, then zip a copy with kitsuneden-zomboid.json into ../backups/projectzomboid.",
    },
    config: [
      { file: "zomboid-data\\Server\\servertest.ini", format: "properties" },
      { file: "kitsuneden-zomboid.json", format: "json" },
    ],
    connect: "Join Server → enter the address and game port, or find it in the public list when Public is on.",
    steamClientAppId: 108600,
    defaults: { steamAppId: 380870 },
    gaps: [
      "Not yet run through the Den. Once someone has installed it, started it, joined and stopped it, mark it verified.",
      "The admin password and Java heap (2 to 4 GB) live in kitsuneden-zomboid.json, edited by hand. The admin password only takes effect when the world is first created.",
      "The Config tab edits servertest.ini, which Project Zomboid writes on its first start. World rules (SandboxVars.lua) and Workshop mods are edited by hand.",
      "A backup of a running server copies its open database. PackRelay captured one cleanly, but restoring one hasn't been tested.",
    ],
  },

  // Launch, ports, identity and RCON as PackRelay measured them on a real
  // Windows server. See src/lib/rust-settings.ts.
  rust: {
    type: "rust",
    tier: "experimental",
    evidence: "New in the Den and not yet run through it. Its launch, ports and RCON follow PackRelay, which has run Rust on Windows (first boot ~7.5 min of map generation, a clean quit in 2 s).",
    platforms: { windows: true, linux: true },
    install: { kind: "steamcmd", appId: 258550, anonymous: true, denCanInstall: true },
    launch: {
      kind: "exe",
      entry: "RustDedicated.exe",
      help: "Started with -batchmode -logfile and the settings from kitsuneden-rust.json as +convar arguments: identity, ports, RCON (+rcon.web 0, the TCP protocol), hostname, map, world size, seed and slots.",
    },
    // Measured layout: UDP game, TCP RCON one above, UDP query two above. The
    // Den passes all three, derived from the game port, so servers never
    // interleave.
    ports: [
      { field: "gamePort", purpose: "game", proto: "udp", default: 28015, public: true },
      {
        field: "rconPort",
        purpose: "rcon",
        proto: "tcp",
        offset: { from: "gamePort", by: 1 },
        public: false,
        note: "One above the game port. Rust's RCON listens on every interface, so keep it closed to the internet.",
      },
      {
        field: "queryPort",
        purpose: "query",
        proto: "udp",
        offset: { from: "gamePort", by: 2 },
        public: true,
        note: "Two above the game port, for the server browser. Forward it with the game port.",
      },
    ],
    control: {
      console: "rcon",
      stop: "RCON `quit`, and Rust saves on the way out (2 s when PackRelay measured it). A kill if it's still up a minute later.",
      players: "RCON `playerlist`.",
    },
    saves: {
      path: "server\\<identity>",
      backup: "zip",
      note: "Backups send `server.save` first, then zip a copy of server\\<identity> without the .map and occlusion caches (regenerated from the seed; most of the size), with kitsuneden-rust.json, into ../backups/rust.",
    },
    config: [
      { file: "kitsuneden-rust.json", format: "json" },
      { file: "server\\<identity>\\cfg\\server.cfg", format: "properties" },
    ],
    connect: "Press F1 in the main menu and run: client.connect <address>:<game port>. Or find it in the server browser.",
    steamClientAppId: 252490,
    defaults: { steamAppId: 258550 },
    gaps: [
      "Not yet run through the Den. Once someone has installed it, started it, joined and stopped it, mark it verified.",
      "RCON runs in Rust's TCP mode (+rcon.web 0) so the Den needs no websocket library. Rust logs that mode as deprecated on every boot; if Facepunch removes it, the Den will need WebRCON.",
      "The Rust+ companion port (app.port, 28082 by default) isn't managed. A second Rust server on the same machine needs its own, set in its server.cfg.",
      "Other convars (server.cfg), wipes and Oxide/uMod plugins are handled by hand. Changing the identity points the server at a new, empty world.",
    ],
  },

  // ARK: Survival Evolved, as PackRelay measured it on Windows and Linux.
  // Shared ARK mechanics are in src/lib/ark-settings.ts.
  "ark-ase": {
    type: "ark-ase",
    tier: "experimental",
    evidence: "New in the Den and not yet run through it. Its launch, ports and RCON follow PackRelay, which has run ARK: Survival Evolved on Windows and Linux (a clean SaveWorld + DoExit in 3.2 s).",
    platforms: { windows: true, linux: true },
    install: { kind: "steamcmd", appId: 376030, anonymous: true, denCanInstall: true },
    launch: {
      kind: "exe",
      entry: "ShooterGame\\Binaries\\Win64\\ShooterGameServer.exe",
      help: "Started with one travel-URL argument (map first, then session name, ports, RCON, max players, admin password last) plus -server -log, built from kitsuneden-ark.json. Without a map ARK sits on its lobby map forever.",
    },
    ports: [
      {
        field: "gamePort",
        purpose: "game",
        proto: "udp",
        default: 7777,
        public: true,
        note: "ARK also opens the next port up (7778) for its raw socket. Forward both.",
      },
      {
        field: "queryPort",
        purpose: "query",
        proto: "udp",
        default: 27016,
        public: true,
        note: "Players find the server by this port. Keep it between 27015 and 27020, or the in-game LAN browser won't see it.",
      },
      { field: "rconPort", purpose: "rcon", proto: "tcp", default: 27020, public: false },
    ],
    control: {
      console: "rcon",
      stop: "RCON `SaveWorld` then `DoExit` (3.2 s when PackRelay measured it). A kill if it's still up a minute later.",
      players: "RCON `ListPlayers`.",
    },
    saves: {
      path: "ShooterGame\\Saved",
      backup: "zip",
      note: "Worlds are ShooterGame\\Saved\\SavedArks\\<map>.ark. Backups send `SaveWorld` first, then zip a copy of ShooterGame\\Saved without the single-player save and the ~20 timestamped generations ARK keeps, with kitsuneden-ark.json, into ../backups/ark-ase.",
    },
    config: [
      { file: "kitsuneden-ark.json", format: "json" },
      { file: "ShooterGame\\Saved\\Config\\WindowsServer\\GameUserSettings.ini", format: "properties" },
      { file: "ShooterGame\\Saved\\Config\\WindowsServer\\Game.ini", format: "properties" },
    ],
    connect: "Join ARK → find it by name in the server list, or the LAN tab on the same network. Forward the game port, the one above it, and the query port.",
    steamClientAppId: 346110,
    defaults: { steamAppId: 376030 },
    gaps: [
      "Not yet run through the Den. Once someone has installed it, started it, joined and stopped it, mark it verified.",
      "ARK: Survival Evolved writes no log at all, so the Console stays quiet while it loads; readiness comes from RCON.",
      "Rates and other settings (GameUserSettings.ini, Game.ini), mods and clusters are edited by hand. Put the server on an SSD: PackRelay saw a 35-minute first start and crashes from a USB hard drive.",
    ],
  },

  // ARK: Survival Ascended, as PackRelay measured it on Windows. Where a
  // fact was only measured on ASE, the note says so.
  "ark-asa": {
    type: "ark-asa",
    tier: "experimental",
    evidence: "New in the Den and not yet run through it. Its launch and RCON follow PackRelay, which has run ARK: Survival Ascended on Windows (ready in 86 s on first boot, a clean SaveWorld + DoExit in about 2 s).",
    platforms: { windows: true, linux: false },
    install: { kind: "steamcmd", appId: 2430930, anonymous: true, denCanInstall: true },
    launch: {
      kind: "exe",
      entry: "ShooterGame\\Binaries\\Win64\\ArkAscendedServer.exe",
      help: "Started with one travel-URL argument (map first, admin password last: ASA reads everything after ?ServerAdminPassword= into the password) plus -server -log -WinLiveMaxPlayers, built from kitsuneden-ark.json. Without a map it idles and binds no port.",
    },
    ports: [
      {
        field: "gamePort",
        purpose: "game",
        proto: "udp",
        default: 7777,
        public: true,
        note: "Forward this and the next port up (7778). Passing the game port in the travel URL is measured on ARK: Survival Evolved, not yet on Ascended.",
      },
      {
        field: "queryPort",
        purpose: "query",
        proto: "udp",
        default: 27016,
        public: false,
        note: "Ascended answers no Steam query (it has its own server list), so there's no need to forward it. The Den still sets it so two servers don't collide.",
      },
      { field: "rconPort", purpose: "rcon", proto: "tcp", default: 27020, public: false },
    ],
    control: {
      console: "rcon",
      stop: "RCON `SaveWorld` then `DoExit` (1.4 to 2.1 s when PackRelay measured it). A kill if it's still up a minute later.",
      players: "RCON `ListPlayers`.",
    },
    saves: {
      path: "ShooterGame\\Saved",
      backup: "zip",
      note: "Worlds are ShooterGame\\Saved\\SavedArks\\<map>\\<map>.ark. Backups send `SaveWorld` first, then zip a copy of ShooterGame\\Saved without the single-player save and the timestamped .ark/.arkrbf rollbacks (about 184 MB after 35 minutes), with kitsuneden-ark.json, into ../backups/ark-asa.",
    },
    config: [
      { file: "kitsuneden-ark.json", format: "json" },
      { file: "ShooterGame\\Saved\\Config\\WindowsServer\\GameUserSettings.ini", format: "properties" },
      { file: "ShooterGame\\Saved\\Config\\WindowsServer\\Game.ini", format: "properties" },
    ],
    connect: "Join Game → search the session name in the unofficial server list. Forward the game port and the one above it.",
    steamClientAppId: 2399830,
    defaults: { steamAppId: 2430930 },
    gaps: [
      "Not yet run through the Den. Once someone has installed it, started it, joined and stopped it, mark it verified.",
      "The travel URL's ?Port= and -WinLiveMaxPlayers aren't measured on Ascended yet; if a server binds 7777 regardless or caps players differently, that's where to look.",
      "Ascended writes the admin password into its log; the Den redacts it from the Console, but ShooterGame.log on disk still has it.",
      "Rates and other settings (GameUserSettings.ini, Game.ini), mods and clusters are edited by hand. It needs about 10 GB of RAM and an SSD.",
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
