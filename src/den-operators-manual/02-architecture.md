```
╔═══════════════════════╗
║     KITSUNE  DEN      ║
║      OPERATOR'S       ║
║        MANUAL         ║
╚═══════════════════════╝
    /\_/\
   ( o.o )
    > ^ <
   /|   |\
  (_|   |_)
```

# Chapter 2: Architecture

*Where every file lives, how every system connects, and what each piece does. This is the technical backbone of the Den.*

---

## 1. Directory Layout

The Den spans two root directories on the F: drive. Here is everything, laid out precisely.

```
F:\
  MinecraftServer\
    dashboard\                    Next.js 16.1.6 + TypeScript + Tailwind
      src\
        app\
          api\
            server\route.ts       Server start/stop/restart/command
            console\route.ts      SSE live log streaming
            config\route.ts       server.properties editor
            mods\route.ts         Mod upload/list/delete
            modpacks\route.ts     Mod pack CRUD + activation
            players\route.ts      Whitelist/op/ban/kick
            stats\route.ts        System + process memory stats
            memory\route.ts       JVM memory config
            network\route.ts      Local IP detection
            servers\route.ts      List all server instances
          globals.css             Kitsune Den theme (16 CSS custom properties)
          layout.tsx              App shell, dark mode, Den fonts
          page.tsx                ServerProvider wrapper
        components\
          DashboardContent.tsx    Main layout with header + server info
          ServerSwitcher.tsx      Fabric/NeoForge tab buttons with status dots
          ServerControl.tsx       Start/Stop/Restart + Memory allocation dropdowns
          Console.tsx             SSE log stream, command input, history (up/down)
          ServerStats.tsx         Memory bars, canvas sparkline, CPU/uptime grid
          ConnectionInfo.tsx      LAN + Public IP with click-to-copy
          ConfigEditor.tsx        Grouped property editor with dropdowns for gamemode/difficulty
          ModManager.tsx          Upload/list/remove mods from active mods/ folder
          ModPacks.tsx            Create/activate/manage mod packs + library uploads
          PlayerManager.tsx       Whitelist/Op/Ban/Kick controls + player lists
        contexts\
          ServerContext.tsx        React context providing serverId to all components
        lib\
          server-process.ts       Multi-server process manager (spawn, stdin, logs, state)
          rcon.ts                 RCON client utility
      .env.local                  RCON config + server paths
    server\                       Fabric 1.21.4 (loader 0.18.4)
      fabric-server-launch.jar
      server.properties           Port 25565, RCON 25575
      dashboard-config.json       Memory: 2G min / 4G max
      modpacks.json               Pack definitions
      mods\                       Active mods (Fabric API, Lithium)
      mods-library\               Full mod collection for packs
      start.bat                   Manual launch script
    server-neoforge\              NeoForge 21.4.156
      run.bat                     Launch script (@argfile style)
      user_jvm_args.txt           JVM args (auto-managed by dashboard)
      server.properties           Port 25566, RCON 25576
      dashboard-config.json       Memory: 2G min / 4G max
      modpacks.json               Pack definitions
      mods\                       Active mods (currently empty)
      mods-library\               Mod collection for packs
      libraries\                  NeoForge runtime libraries

  KitsuneDen\
    dashboard\                    Legacy Hytale dashboard (retired)
    HytaleServer.jar              Hytale game server
    config.json                   Server name, MOTD, game mode
    permissions.json              Player roles and groups
    universe\                     World data, player saves, warps
    backups\                      Automated hourly + daily
    mods\                         Server mods (Hytale_Shop)
    logs\                         Dated server log files
    start_kitsune_den.bat         Server startup (port 5520)
    backup_kitsune_den.ps1        PowerShell backup automation
```

Every path here is absolute. If a spirit can't find her files, check the paths first.

---

## 2. The Dashboard

One dashboard, one shared purpose: give the Operator eyes into the servers.

### Unified Dashboard

| Property | Value |
|---|---|
| **Framework** | Next.js 16.1.6 with App Router |
| **Language** | TypeScript (strict mode) |
| **Styling** | Tailwind CSS 4 with Kitsune Den theme |
| **Port** | 3000 |
| **Icons** | Lucide React |
| **Key Packages** | rcon-client, ws, lucide-react |
| **Startup** | `npm run dev` or Task Scheduler |

The unified dashboard is a proper React application. She uses the App Router pattern, TypeScript throughout, and a custom theme system built on CSS custom properties. Every component is a focused, single-responsibility piece. Every API route handles one concern.

Minecraft and Hytale now share this single interface. The legacy Hytale dashboard has been retired.

---

## 3. Multi-Server Architecture

The Minecraft dashboard's most significant architectural feature is its ability to manage multiple game server instances from a single interface. This is built on three pillars.

### Server Definitions

`server-process.ts` defines a `ServerDef` for each instance. Each definition includes:

- **id** -- unique identifier (`"fabric"` or `"neoforge"`)
- **name** -- display name for the UI
- **loader** -- which mod loader this server runs
- **dir** -- absolute path to the server directory
- **jar** -- the server jar filename
- **launchMode** -- how the process is spawned

### Two Launch Modes

| Mode | Used By | Command Pattern |
|---|---|---|
| `"jar"` | Fabric | `java -jar fabric-server-launch.jar` |
| `"argfile"` | NeoForge | `java @user_jvm_args.txt @win_args.txt` |

Fabric launches traditionally with a jar file. NeoForge uses the argfile pattern, where JVM arguments and classpath entries are read from text files. The dashboard's memory management writes to `user_jvm_args.txt` for NeoForge instead of passing command-line flags.

### Independent Server State

Each server maintains its own:
- **Process handle** -- the spawned child process
- **Status** -- stopped, starting, running, stopping
- **Log buffer** -- 2000 lines of in-memory history
- **Listener set** -- SSE connections subscribed to this server's output

### Query Parameter Routing

All API routes accept a `?server=fabric|neoforge` query parameter. If omitted, it defaults to `"fabric"`. This means every API call is server-aware:

- `GET /api/stats?server=neoforge` -- NeoForge memory and system stats
- `POST /api/server?server=fabric` -- start/stop the Fabric server
- `GET /api/console?server=neoforge` -- SSE stream for NeoForge logs

### React Context

`ServerContext.tsx` provides `serverId` and `setServerId` to all components via React context. When the user clicks a different tab in `ServerSwitcher.tsx`, the `serverId` changes, and every component re-fetches its data and resets its local state. The switch is clean -- no stale data from the previous server bleeds through.

---

## 4. Kitsune Den Theme System

The Den's visual identity is defined by 16 CSS custom properties in `globals.css`. Every component in the Minecraft dashboard draws from this palette. It is warm, dark, and amber-toned -- like firelight in a cozy workshop.

### The Full Palette

| Property | Value | Purpose |
|---|---|---|
| `--den-bg` | `#1a1410` | Page background, the darkest layer |
| `--den-surface` | `#231e17` | Card and panel backgrounds |
| `--den-surface-hover` | `#2d261d` | Hover state for interactive surfaces |
| `--den-border` | `#3d3428` | Standard borders between elements |
| `--den-border-light` | `#4d422f` | Lighter borders for subtle separation |
| `--den-text` | `#f0e6d6` | Primary text, warm off-white |
| `--den-text-muted` | `#a89880` | Secondary text, labels, hints |
| `--den-text-dim` | `#6b5d4d` | Tertiary text, disabled states |
| `--den-amber` | `#d4a04a` | Primary accent, the Den's signature color |
| `--den-amber-glow` | `#e8b44e` | Brighter amber for hover and emphasis |
| `--den-gold` | `#c49030` | Deeper gold for borders and highlights |
| `--den-red` | `#c44d3a` | Errors, stop buttons, warnings |
| `--den-green` | `#5a9a52` | Online status, success states |
| `--den-green-glow` | `#6db563` | Brighter green for active indicators |
| `--den-lantern` | `#e8944e` | Warm orange for special highlights |
| `--den-forest` | `#4a7a48` | Deep green, used sparingly |

### Additional Theme Features

- **Custom scrollbar** -- styled to match the Den palette with `den-surface` track and `den-border` thumb
- **den-card class** -- a reusable card style with `den-surface` background, `den-border` border, and rounded corners
- **Dark mode only** -- the Den does not have a light theme. It is always night in the workshop.

---

## 5. Configuration Files

Each server instance has its own set of configuration files. They follow a consistent pattern, but their contents are server-specific.

### Per-Server Configuration

**`server.properties`** -- Standard Minecraft server configuration. Contains port assignments, RCON credentials, gamemode, difficulty, world settings, and all other vanilla server properties. The dashboard's ConfigEditor reads and writes this file directly.

- Fabric: port 25565, RCON on 25575
- NeoForge: port 25566, RCON on 25576

**`dashboard-config.json`** -- JVM memory allocation managed by the dashboard. Contains two fields:

- `minMemoryGB` -- minimum heap size (default: 2)
- `maxMemoryGB` -- maximum heap size (default: 4)

The dashboard reads these values to populate the memory dropdowns and writes them back when the Operator changes allocation.

**`modpacks.json`** -- Mod pack definitions for the pack management system. Contains:

- Pack definitions (id, name, description, mod list)
- Active pack ID (which pack is currently deployed)
- Mod file references pointing to the `mods-library\` directory

**`.env.local`** -- Dashboard-level configuration stored at the dashboard root. Contains RCON credentials (passwords, ports) and server directory paths. This file is not per-server; it configures the dashboard's connection to all servers.

### Hytale Configuration

- `F:\KitsuneDen\config.json` -- Server name ("Kitsune Den"), MOTD, game mode (Adventure), max players (20)
- `F:\KitsuneDen\permissions.json` -- Player roles and group definitions

---

## 6. Process Management

### The Startup Script

`npm run dev` starts the unified dashboard on port 3000.

The dashboard starts. The game servers themselves are started through the dashboard -- the command only launches the control panel.

### Task Scheduler Configuration

| Setting | Value |
|---|---|
| **Trigger** | At startup |
| **Privileges** | Highest (run as administrator) |
| **Delay** | 30 seconds |
| **On failure** | Restart |
| **User account** | `DARA-PC\darab` |

### Why Not shell:startup?

Bitdefender intercepts and blocks `.bat` files placed in the Windows `shell:startup` folder. Task Scheduler bypasses this restriction entirely. Always use Task Scheduler for the Den's startup rituals.

---

## 7. Health Checks

### Unified Dashboard

`GET /api/servers` returns the status of all configured server instances. The response includes each server's id, name, loader type, and current status (stopped, starting, running, stopping). This is the single endpoint to check whether the Den is alive and what state each server is in.

---

## 8. The Gateways (Port Reference)

All ports used by the Den, collected in one place for quick reference.

| Service | Port | Type | Protocol |
|---|---|---|---|
| Unified Dashboard | 3000 | HTTP | TCP |
| Fabric MC Server | 25565 | Game | TCP |
| NeoForge MC Server | 25566 | Game | TCP |
| Fabric RCON | 25575 | RCON | TCP |
| NeoForge RCON | 25576 | RCON | TCP |
| Hytale Server | 5520 | Game | TCP |

No two services may share a port. A conflict here means one or both services will fail to bind, and the Operator will see errors about addresses already in use. If a spirit won't start, check the gateways first.

---

*Architecture is the skeleton. The spirits that live within it are described in the next chapter.*
