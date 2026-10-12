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

# Chapter 7: Appendices

*Quick-reference tables, glossary, and cheat sheets. The notes pinned above the workbench.*

This chapter is for skimming. Keep it open in a tab and reach for whatever you need.

---

## A. Glossary of Den Terms

| Term | Meaning |
|---|---|
| **Spirit** | A game server (or service) with a defined role and personality |
| **Ritual** | A scheduled task or startup command that brings something to life |
| **Lantern** | A dashboard or UI that illuminates system state; the Den has one now |
| **Gateway** | A port |
| **Journal** | A log file or log stream |
| **Workshop** | The Den's machines, folders, and operational environment |
| **Operator** | The human steward of the Den |
| **The Gate** | The shared-password login in front of every page and API route |
| **Adapter** | The class that teaches the Den how to talk to one kind of game |
| **Capabilities** | Flags on each adapter that decide which pages a server gets |
| **Reachability probe** | The TCP knock that decides whether a server is reported as running |
| **`rconHost`** | The machine a remote Minecraft server lives on |
| **Lifecycle block** | The `lifecycle` settings that let the Den start a remote Minecraft server over SSH |
| **Stub directory** | The local `dir` a remote Minecraft entry points at; it isn't the real server folder |
| **Mod Library** | `mods-library\`, the reservoir of Minecraft mods that packs draw from |
| **Mod Pack** | A named set of library mods that can be activated together |
| **Server grid** | The home page: one card per server, with live status and quick controls |
| **Activity log** | `data\activity.jsonl`, the record of starts, stops, crashes, saves and roster changes |
| **SSE** | Server-Sent Events, the stream that carries console output to the browser |
| **RCON** | Remote Console, used by Minecraft and Palworld |
| **Argfile** | A text file of JVM arguments (`@file`), used by NeoForge's launch style |
| **KitsuneCommand** | A Hytale mod whose SQLite database powers the Airdrops page |

---

## B. Port Reference

| Service | Default | Protocol | Notes |
|---|---|---|---|
| KitsuneDen dashboard | 3001 | HTTP | From `package.json` scripts |
| Minecraft game | 25565 | TCP | Set `gamePort`; second server often 25566 |
| Minecraft RCON | 25575 | TCP | `rconPort`; **same default as Palworld RCON** |
| 7 Days to Die game | 26900 | UDP | `gamePort` (from the example config) |
| 7 Days to Die telnet | 8081 | TCP | `telnetPort`; also the status probe |
| Hytale game | 5520 | UDP | `gamePort`; Hytale's default as the Den has run it |
| Palworld game | 8211 | UDP | `gamePort` |
| Palworld RCON | 25575 | TCP | `rconPort`; also the status probe |
| Palworld REST API | 8212 | TCP | `restApiPort`; probe fallback |
| Enshrouded game | 15637 | UDP | `gamePort`; one port for joining and the server browser, written into the config's `queryPort` |
| Valheim game | 2456 | UDP | `gamePort` |
| Valheim query | 2457 | UDP | always `gamePort` + 1, for the community list |
| SSH (remote lifecycle) | 22 | TCP | `lifecycle.port` |

---

## C. Directory Reference

```
KitsuneDen\
  servers.json             Your servers (gitignored)
  servers.example.json     Template
  .env / .env.example      Auth settings
  src\
    proxy.ts               The Gate
    app\api\               API routes (Appendix D)
    app\login\             Login page
    components\            UI pages and panels
    contexts\              ServerContext (selected server)
    lib\adapters\          One adapter per game + registry + reachability
    lib\auth.ts            Password + session signing
    lib\auth-edge.ts       Session verification for the proxy
    lib\remote-exec.ts     SSH + PowerShell for remote lifecycle
    lib\kitsune-db.ts      KitsuneCommand SQLite access
    den-operators-manual\  This manual
    __tests__\             Vitest suites
```

Game servers live wherever you installed them. Each entry's `dir` points the way.

---

## D. API Reference

Every route except `/api/auth/*` needs a valid session. Server-aware routes take `?server=<id>` and default to the first server in `servers.json`.

| Endpoint | Methods | Purpose |
|---|---|---|
| `/api/auth/login` | POST | `{ password }` → sets the session cookie |
| `/api/auth/logout` | POST | Clears the session cookie |
| `/api/servers` | GET, POST, PUT, DELETE | List with status + capabilities / add / update / remove (optionally deleting files) |
| `/api/server` | GET, POST | Resolved status / `{ action: start, stop, restart, command }` |
| `/api/console` | GET, POST | Current log buffer / SSE live stream |
| `/api/config` | GET, POST | Read / save the game's config file |
| `/api/players` | GET, POST | Player data / per-game player actions |
| `/api/stats` | GET | Process + host stats, plus game-specific server info |
| `/api/memory` | GET, PUT | Minecraft `dashboard-config.json` (min/max GB) |
| `/api/network` | GET | LAN IPv4 + public IP (via api.ipify.org) |
| `/api/mods` | GET, POST, DELETE | List / upload (zips extracted) / remove mods |
| `/api/mods-library` | GET, POST | Minecraft library list / upload or copy from `mods\` |
| `/api/modpacks` | GET, POST, DELETE | Packs + library / create, update, or `action: activate` / delete |
| `/api/backups` | GET, POST | List / run a backup (`{ type: hourly or daily }`) |
| `/api/worlds` | GET | Hytale worlds, warps, default world |
| `/api/7d2d-worlds` | GET | 7D2D world folders from `Data\Worlds\` |
| `/api/hytale-update` | GET, POST | Launcher update check / copy files |
| `/api/palworld-update` | GET, POST | Version info / SteamCMD update |
| `/api/enshrouded-update` | GET, POST | Version info / SteamCMD update |
| `/api/7d2d-update` | GET, POST | Version, branch and app id / SteamCMD update on the installed branch |
| `/api/valheim-update` | GET, POST | Branch and app id / SteamCMD install or update on the installed branch |
| `/api/airdrops/settings` | GET, PUT | KitsuneCommand airdrop settings |
| `/api/airdrops/loot-tables` | GET, POST, PUT, DELETE | Loot tables and entries |
| `/api/airdrops/history` | GET | Recent drops (`?limit=`, default 50) |
| `/api/browse-folder` | GET | Opens a folder picker on the dashboard host |
| `/api/docs` | GET | `?file=` README or a manual chapter |
| `/api/activity` | GET | Recent events, newest first (`?server=`, `?kind=server,crash,config,players,backup,mods,setup,auth`, `?limit=` up to 500) |

---

## E. The Den Theme

Theme tokens live in `src/app/globals.css` as Tailwind `@theme` variables named `--color-den-*` and are used as classes like `bg-den-surface` or `text-den-amber`.

| Family | Tokens | Used for |
|---|---|---|
| Layers | `den-bg`, `den-base`, `den-surface`, `den-card`, `den-card-hover`, `den-elevated` | page, panels, cards, raised elements |
| Borders | `den-border`, `den-border-light` | separation |
| Text | `den-text`, `den-text-muted`, `den-text-dim` | primary, secondary, tertiary |
| Accents | `den-amber`, `den-cyan`, `den-green`, `den-red`, `den-purple`, `den-lantern` (most with `-dim` or `-glow` variants) | status, actions, highlights |

Deep night blues underneath, warm and bright accents on top. Check `globals.css` for current values before copying any color elsewhere.

---

## F. Configuration Reference

### `servers.json`, every server

| Field | Required | Description |
|---|---|---|
| `id` | yes | Unique id; used in `?server=` |
| `name` | yes | Display name |
| `type` | yes | `minecraft`, `hytale`, `7d2d`, `palworld`, or `enshrouded` |
| `dir` | yes | Server's root folder |
| `gamePort` | varies | Port players connect to; also the probe port for Minecraft and Hytale |

### Minecraft (`minecraft`)

| Field | Default | Description |
|---|---|---|
| `loader`, `version` | | Shown in the UI |
| `launchMode` | `jar` behavior | `"jar"` or `"argfile"` |
| `jar` | `server.jar` | Jar filename (jar mode) |
| `argFiles` | | Arg files, relative to `dir` (argfile mode) |
| `javaPath` | `java` | Full path to `java.exe` |
| `rconPort` | 25575 | RCON port |
| `rconPassword` | empty | RCON password |
| `rconHost` | 127.0.0.1 | Host for RCON and the status probe; setting it makes the entry remote |
| `lifecycle` | | SSH start/restart block (Chapter 2, section 5): `kind`, `host`, `port`, `user`, `identityFile`, `startCommand`, `stopCommand` |

### Hytale (`hytale`)

| Field | Default | Description |
|---|---|---|
| `startScript` | `start.bat` | Launch script in `dir` |
| `backupScript` | | PowerShell backup script, absolute or relative to `dir` |
| `processFilter` | `HytaleServer` | Text to find in the Java command line |

### 7 Days to Die (`7d2d`)

| Field | Default | Description |
|---|---|---|
| `configFile` | `serverconfig.xml` | Server config filename |
| `telnetPort` | 8081 | Telnet port |
| `telnetPassword` | empty | Telnet password |
| `modsDir` | `mods` | Mods folder, relative to `dir` or absolute |
| `adminFilePath` | auto | Full path to `serveradmin.xml` |
| `steamCmdPath` | | `steamcmd.exe` for updates |
| `steamAppId` | 294420 | Steam app id |
| `controlPanelPort` | | Shown in server info |
| `controlPanelPassword` | | Accepted but not used |

### Palworld (`palworld`)

| Field | Default | Description |
|---|---|---|
| `startScript` | `start_palworld.bat` | Launch script; falls back to the exe |
| `rconPort` | 25575 | RCON port |
| `rconPassword` | ini `AdminPassword` | RCON password |
| `restApiPort` | 8212 | REST API port |
| `restApiPassword` | ini `AdminPassword` | REST password (user `admin`) |
| `steamCmdPath` | | `steamcmd.exe` for updates |
| `steamAppId` | 2394010 | Steam app id |

### Enshrouded (`enshrouded`)

| Field | Default | Description |
|---|---|---|
| `startScript` | `start_enshrouded.bat` | Launch script; falls back to the exe |
| `configFile` | `enshrouded_server.json` | Config filename |
| `gamePort` | 15637 | The one UDP port, written into `enshrouded_server.json` as `queryPort` before every start |
| `steamCmdPath` | | `steamcmd.exe` for updates |
| `steamAppId` | 2278520 | Steam app id |

### Valheim (`valheim`)

| Field | Default | Description |
|---|---|---|
| `gamePort` | 2456 | UDP game port; the query port is the next one up |
| `steamCmdPath` | | `steamcmd.exe` for installs and updates |
| `steamAppId` | 896660 | Steam app id |

Game settings live in `kitsuneden-valheim.json` in the server folder (Config tab), not in `servers.json`.

### Top level

| Field | Description |
|---|---|
| `dashboard.port` | Ignored if present (older configs had it). The port comes from `package.json` (3001) |

### Environment (`.env`)

| Variable | Description |
|---|---|
| `KITSUNEDEN_PASSWORD` | The shared password. Required |
| `KITSUNEDEN_SESSION_SECRET` | HMAC key for session cookies, 32+ characters. Required. Changing it signs everyone out |

### Files in each server's directory

| File | Spirit | Purpose |
|---|---|---|
| `server.properties` | Minecraft | Game settings, ports, RCON |
| `dashboard-config.json` | Minecraft | JVM min/max memory |
| `modpacks.json` | Minecraft | Pack definitions + active pack |
| `user_jvm_args.txt` | Minecraft (argfile) | Rewritten by the dashboard on each start |
| `serverconfig.xml` | 7 Days to Die | Game settings |
| `serveradmin.xml` | 7 Days to Die | Admins, whitelist, blacklist, command permissions |
| `config.json`, `permissions.json` | Hytale | Server settings; player groups |
| `PalWorldSettings.ini` | Palworld | Under `Pal\Saved\Config\WindowsServer\` |
| `palworld-admins.json` | Palworld | The dashboard's own admin list |
| `enshrouded_server.json` | Enshrouded | Server settings and user groups |

---

## G. Common Commands

### Dashboard

```
npm run dev          development, port 3001
npm run build        production build
npm run start        production server, port 3001
npm test             Vitest suites
npm run typecheck    tsc --noEmit (also run in CI)
```

### Manual server launch

```
cd <server dir>
start.bat            (or run.bat, start_palworld.bat, ...)
```

### Process hunting

```
netstat -ano | findstr :3001
netstat -ano | findstr :25565
netstat -ano | findstr :25575
tasklist | findstr java
tasklist | findstr node
```

### SSH lifecycle check

```
ssh -i <identityFile> -o BatchMode=yes <user>@<host> "powershell -NoProfile -Command Get-Date"
```

### PowerShell execution policy

```
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
```

---

## H. Task Scheduler Settings

| Setting | Value |
|---|---|
| Trigger | At startup, delayed 30 seconds |
| Privileges | Run with highest privileges |
| On failure | Restart the task |
| User account | The account that owns the KitsuneDen folder and game servers |
| Action | `cmd.exe /c npm run start` |
| Start in | The KitsuneDen repo root |

Run `npm run build` once before relying on the task. Task Scheduler is preferred over `shell:startup` because antivirus behavioral analysis (Bitdefender, in the Den's case) can block `.bat` files launched from startup locations.

---

## I. Troubleshooting Quick Reference

For the full story behind each issue, see Chapter 5.

| Problem | First check |
|---|---|
| Dashboard won't load | Is Node running? Right port (3001)? Does `servers.json` exist? |
| Setup banner / 503 | Both `.env` variables set? Secret 32+ chars? Dashboard restarted? |
| Login loops | Production mode over plain HTTP? Use HTTPS or localhost |
| Server won't start | Read the console. Port free? `javaPath` right? |
| Port conflict | `netstat -ano \| findstr :<port>`; MC and Palworld RCON share 25575 |
| Status says stopped | Is the probe port set and correct? |
| Remote MC silent | RCON reachable from this machine? Firewall? |
| SSH start fails | Does the `ssh -o BatchMode=yes` test work as the dashboard's account? |
| PowerShell blocks npm | `cmd /c "npm run dev"` |
| Mods not loading | Right loader? Right version? Leftovers in `mods\`? |
| RCON not working | Enabled in the game config? Password matches `servers.json`? |
| High memory | How many servers are awake? Lower `maxMemoryGB` |
| Type errors | `npx tsc --noEmit` (the build won't tell you) |

---

## J. Credits & Stewardship

This manual was written and is maintained by:

- **Dara**: Keeper of Lanterns, Operator of the Den
- **Sage**: Collaborator and co-builder
- **Claude**: Collaborator and co-builder

The Kitsune Den is a living workshop. Treat it with care, curiosity, and calm hands.

---

*You now hold the complete Den Operator's Manual. May your dashboards stay bright, your logs stay honest, and your rituals run true.*
