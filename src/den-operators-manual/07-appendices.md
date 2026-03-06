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

This chapter is meant to be skimmed, not read. Keep it open in a tab, pin it to the wall, or memorize the parts you reach for most. Everything here is the kind of information you need quickly and don't want to hunt for.

---

## A. Glossary of Den Terms

| Term | Meaning |
|---|---|
| **Spirit** | A service or dashboard with a defined role and personality |
| **Ritual** | A Task Scheduler job or startup script that brings a service to life |
| **Lantern** | A dashboard or UI that illuminates system state |
| **Gateway** | A port used for communication |
| **Journal** | A log file or log stream written by a service |
| **Workshop** | The Den's filesystem and operational environment |
| **Operator** | The human steward of the Den (Dara, or a collaborator) |
| **Mod Pack** | A curated collection of mods that can be activated as a set |
| **Server Switcher** | The UI element for switching between Fabric and NeoForge instances |
| **SSE** | Server-Sent Events, used for real-time console streaming in the Minecraft dashboard |
| **RCON** | Remote Console protocol for sending commands to Minecraft servers |
| **Argfile** | A text file containing JVM arguments, used by NeoForge instead of command-line flags |

---

## B. Port Reference

| Service | Port | Type | Notes |
|---|---|---|---|
| Unified Dashboard | 3000 | HTTP | Next.js dev server |
| Fabric MC Server | 25565 | Game | Default MC port |
| NeoForge MC Server | 25566 | Game | Offset by 1 from Fabric |
| Fabric RCON | 25575 | RCON | Password in `.env.local` |
| NeoForge RCON | 25576 | RCON | Password in `server.properties` |
| Hytale Server | 5520 | Game | Bound to `0.0.0.0` |

---

## C. Directory Reference

The full directory tree, abbreviated for quick reference:

```
F:\MinecraftServer\
  dashboard\              Next.js 16.1.6 dashboard (port 3000)
  server\                 Fabric 1.21.4 server (port 25565)
  server-neoforge\        NeoForge 21.4.156 server (port 25566)
  start_dashboard.bat     Optional dashboard launcher

F:\KitsuneDen\
  dashboard\              Legacy Hytale dashboard (retired)
  HytaleServer.jar        Hytale server (port 5520)
  config.json             Server configuration
  universe\               Worlds, players, warps
  backups\                Automated hourly + daily
  start_kitsune_den.bat   Launches Hytale server
  backup_kitsune_den.ps1  Backup automation
```

---

## D. API Reference (Minecraft Dashboard)

All 11 API routes. Every route accepts `?server=fabric|neoforge` (defaults to `fabric`).

| Endpoint | Methods | Purpose |
|---|---|---|
| `/api/servers` | GET | List all server instances with status |
| `/api/server` | GET, POST | Server status / start, stop, restart, command |
| `/api/console` | GET, POST | Log buffer / SSE live stream |
| `/api/config` | GET, PUT | Read/write `server.properties` |
| `/api/mods` | GET, POST, DELETE | List/upload/remove active mods |
| `/api/modpacks` | GET, POST, PUT, DELETE | Pack CRUD, activation, library management |
| `/api/players` | GET, POST | Player lists / whitelist, op, ban, kick |
| `/api/stats` | GET | System + server memory, CPU, uptime |
| `/api/memory` | GET, PUT | JVM memory config (min/max GB) |
| `/api/network` | GET | Local IPv4 address detection |

**Query parameter:** All routes support `?server=fabric` or `?server=neoforge` to target a specific server instance. If omitted, the route defaults to the Fabric server.

---

## E. Kitsune Den Color Palette

The Den's visual identity is built on 16 CSS custom properties. These tokens are used across every component in both dashboards.

| Token | Hex | Purpose |
|---|---|---|
| `den-bg` | `#1a1410` | Page background |
| `den-surface` | `#231e17` | Card backgrounds |
| `den-surface-hover` | `#2d261d` | Hover states |
| `den-border` | `#3d3428` | Standard borders |
| `den-border-light` | `#4d422f` | Subtle separators |
| `den-text` | `#f0e6d6` | Primary text |
| `den-text-muted` | `#a89880` | Secondary text |
| `den-text-dim` | `#6b5d4d` | Disabled text |
| `den-amber` | `#d4a04a` | Primary accent |
| `den-amber-glow` | `#e8b44e` | Hover emphasis |
| `den-gold` | `#c49030` | Deep gold highlights |
| `den-red` | `#c44d3a` | Errors, stop states |
| `den-green` | `#5a9a52` | Online, success |
| `den-green-glow` | `#6db563` | Active indicators |
| `den-lantern` | `#e8944e` | Warm orange accent |
| `den-forest` | `#4a7a48` | Deep green, sparse use |

The palette is warm, low-contrast, and easy on the eyes during long sessions. Dark backgrounds with amber and gold accents — like a workshop lit by lantern light.

---

## F. Configuration Files Reference

| File | Location | Purpose |
|---|---|---|
| `.env.local` | `F:\MinecraftServer\dashboard\` | Dashboard RCON config, server paths |
| `server.properties` | Each server's root directory | MC server settings, ports, RCON |
| `dashboard-config.json` | Each server's root directory | JVM memory allocation |
| `modpacks.json` | Each server's root directory | Mod pack definitions + active pack |
| `config.json` | `F:\KitsuneDen\` | Hytale server name, MOTD, game mode |
| `permissions.json` | `F:\KitsuneDen\` | Hytale player roles and groups |
| `user_jvm_args.txt` | `F:\MinecraftServer\server-neoforge\` | NeoForge JVM args (auto-managed) |

---

## G. Common Commands

### Dashboard Startup

```
cd F:\MinecraftServer\dashboard && npm run dev
```

### Build Check

```
cd F:\MinecraftServer\dashboard && npx next build
```

### Manual Server Launch

```
cd F:\MinecraftServer\server && start.bat
cd F:\MinecraftServer\server-neoforge && run.bat
cd F:\KitsuneDen && start_kitsune_den.bat
```

### Process Hunting

```
netstat -ano | findstr :25565
netstat -ano | findstr :25566
netstat -ano | findstr :3000
tasklist | findstr java
tasklist | findstr node
```

### PowerShell Execution Policy Fix

```
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
```

---

## H. Task Scheduler Settings

The recommended configuration for auto-starting dashboards on boot:

| Setting | Value |
|---|---|
| Trigger | At startup |
| Privileges | Run with highest privileges |
| Delay | 30 seconds |
| On failure | Restart the task |
| User account | `DARA-PC\darab` |
| Action | Run `npm run dev` |

Task Scheduler is preferred over `shell:startup` because Bitdefender's behavioral analysis can block `.bat` files executed from startup locations. Task Scheduler jobs are not flagged the same way.

---

## I. Troubleshooting Quick Reference

For the full story behind each issue, see Chapter 5. This table is for when you already know the problem and just need the first step.

| Problem | First Check |
|---|---|
| Dashboard won't load | Is the process running? Check terminal. |
| Server won't start | Check console errors. Is the port free? |
| Port conflict | `netstat -ano \| findstr :<port>` |
| PowerShell blocks npm | Use `cmd /c "npm run dev"` |
| Mods not loading | Correct loader? Correct MC version? |
| RCON not working | `enable-rcon=true`? Server fully started? |
| High memory | Both servers running? Lower max memory. |
| Build fails | `npx next build` -- read the error output |

---

## J. Credits & Stewardship

This manual was written and maintained by:

- **Dara** -- Keeper of Lanterns, Operator of the Den
- **Sage** -- Collaborator and co-builder
- **Claude** -- Collaborator and co-builder

The Kitsune Den is a living workshop. Treat it with care, curiosity, and calm hands.

---

*You now hold the complete Den Operator's Manual. May your dashboards stay bright, your logs stay honest, and your rituals run true.*
