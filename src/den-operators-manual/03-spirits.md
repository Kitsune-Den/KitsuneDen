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

# Chapter 3: The Spirits

*Every system in the Den has a personality -- a way it behaves, a way it breaks, a way it wants to be cared for. This chapter introduces each spirit as she truly is.*

---

## 1. The Minecraft Rig

**Nature:** Predictable, structured, now commanding.

She has grown. What was once a single-server dashboard is now a multi-instance commander, managing two game servers and switching between them with quiet confidence. The server switcher with its live status dots is her watching both roads at once -- green for running, dim for stopped, and she always knows which is which.

The Minecraft Rig is the most mature spirit in the Den. Built on Next.js 16.1.6 with TypeScript and strict mode, she enforces order on herself. Ten components, eleven API routes, SSE streaming, and a full multi-server architecture -- she carries all of it without complaint.

Her modpack system is her library. Curated, organized, swappable. She keeps a `mods-library\` for the full collection and a `mods\` folder for what is currently active. When the Operator switches packs, she merges the selected set into the active folder. Everything has its place.

The memory sparkline graph is her heartbeat monitor -- a tiny canvas element drawing a rolling history of JVM heap usage. You can glance at it and know instantly whether a server is breathing easy or straining under load.

She speaks through her console. SSE-streamed log output, colorized and live, with a command input that remembers your history. She logs everything, and she makes it easy to read.

### Technical Profile

| Trait | Detail |
|---|---|
| Framework | Next.js 16.1.6, App Router, TypeScript (strict) |
| Styling | Tailwind CSS 4, 16 custom CSS properties |
| Components | 10 (DashboardContent, ServerSwitcher, ServerControl, Console, ServerStats, ConnectionInfo, ConfigEditor, ModManager, ModPacks, PlayerManager) |
| API Routes | 11 (server, console, config, mods, modpacks, players, stats, memory, network, servers) |
| Context | ServerContext.tsx (serverId + setServerId) |
| Libraries | server-process.ts (multi-server process manager), rcon.ts (RCON client) |
| Streaming | SSE for console output |
| Port | 3000 |

### Care Tips

- **Never mix Fabric and NeoForge mods.** They are incompatible ecosystems. The Rig manages them in separate directories, but the Operator must respect the boundary.
- **Keep `dashboard-config.json` values reasonable.** Don't allocate more memory than the machine has. The Rig will faithfully pass whatever values you set to the JVM, even if they are too high.
- **She logs everything to the console.** If something goes wrong, the console is the first place to look. Her 2000-line buffer keeps a generous history.
- **Test server switches.** After making changes to one server, switch to the other and back to confirm the UI resets cleanly.

---

## 2. The Hytale Cart

**Nature:** Energetic, capable, slightly chaotic.

The Hytale Cart is the younger spirit. She doesn't have the Rig's refined architecture or her TypeScript discipline, but she works -- and she works reliably. Live log streaming, server start/stop, basic file management. She gets the job done.

Her backup system is her safety net, and it is one of her best features. PowerShell scripts run on schedule: hourly backups with 1-day retention, daily backups with 7-day retention. Like a fox who buries food in multiple hiding spots, she makes sure there is always something to fall back on.

She now lives inside the unified dashboard. The old monolithic `server.js` is retired, and the Cart shares the Rig's patterns.

Her `universe\` folder is her treasure. Two worlds, five warps, three players, and NPC memories. This is the living data of the Hytale server, the thing that matters most when backups run and when disaster strikes.

### Technical Profile

| Trait | Detail |
|---|---|
| Framework | Unified Next.js dashboard |
| Frontend | React + Tailwind |
| Real-time | Live log streaming |
| Port | 3000 |
| Server Managed | HytaleServer.jar on port 5520 |
| Config | F:\KitsuneDen\config.json ("Kitsune Den", Adventure, 20 players) |
| Backups | PowerShell: hourly (1-day retention), daily (7-day retention) |

### Care Tips

- **Add logging.** The Cart's own operational logging is minimal. More structured logging would make debugging easier.
- **Introduce modularity gradually.** Don't rewrite everything at once. Extract routes into separate files, then WebSocket handling, then process management. One piece at a time.
- **Keep her aligned with the Rig's infrastructure.** The long-term goal is consistency in one dashboard. The Rig's patterns (separate route handlers, typed contexts, theme system) are the target.
- **Protect the `universe\` folder.** This is irreplaceable data. The backup scripts exist for a reason -- make sure they run.

---

## 3. The NeoForge Spirit

**Nature:** Young, quiet, waiting.

She is the newest arrival in the Den. Installed, configured, and connected to the dashboard, but she has not yet spoken her first word. Her `mods\` folder is empty. Her `modpacks.json` contains only a bare "Default" pack with nothing in it. She is a stage set for a performance that hasn't begun.

The NeoForge Spirit lives at `F:\MinecraftServer\server-neoforge\`, and she launches differently than her Fabric sister. Where Fabric uses `java -jar fabric-server-launch.jar`, NeoForge uses the argfile pattern: `java @user_jvm_args.txt @win_args.txt`. The dashboard knows this -- it writes JVM arguments to `user_jvm_args.txt` instead of passing them on the command line.

She sits on port 25566 with her own RCON at 25576, cleanly separated from Fabric's 25565/25575. The Rig's server switcher shows her status alongside Fabric, and all the same controls work: start, stop, restart, memory allocation, mod management, config editing.

She'll come alive when the crew settles on a modpack. The candidates are still being discussed -- possibly "Create Lets Create" or something similar. Whatever is chosen will define her personality. For now, she waits.

### Technical Profile

| Trait | Detail |
|---|---|
| Loader | NeoForge 21.4.156 |
| Launch Mode | argfile (`java @user_jvm_args.txt @win_args.txt`) |
| Game Port | 25566 |
| RCON Port | 25576 |
| Memory | 2G min / 4G max (dashboard-config.json) |
| Mods | Empty (awaiting pack selection) |
| Location | F:\MinecraftServer\server-neoforge\ |

### Care Tips

- **Match the server version to the chosen pack.** NeoForge modpacks are version-sensitive. Whatever pack the crew picks, confirm the NeoForge version matches.
- **Fabric mods do not work here.** This is a hard boundary. Fabric API, Lithium, and other Fabric mods are incompatible with NeoForge. The Rig keeps the mod directories separate for this reason.
- **Check `user_jvm_args.txt` after memory changes.** The dashboard writes this file when the Operator adjusts memory allocation. If something looks wrong with JVM settings, this file is the source of truth.
- **She shares `libraries\` with NeoForge's runtime.** Don't delete files from `libraries\` -- they are managed by the NeoForge installer.

---

## 4. The Unified Lantern

The unified dashboard is the Den's lantern. It serves the same purpose -- to illuminate both worlds for the Operator -- with one steady flame.

---

## 5. The Journals (Logs)

Every spirit keeps a journal, and knowing how to read them is essential to understanding what happened, what is happening, and what went wrong.

### Minecraft Logs

The Minecraft Rig maintains a **2000-line in-memory buffer** for each server instance. Log lines are SSE-streamed to the dashboard in real-time, where they are displayed in the Console component with color coding:

- **Amber** for dashboard system messages
- **Red** for errors and warnings
- **Gold** for commands sent by the Operator

The buffer is per-server -- Fabric and NeoForge each have their own 2000-line history. When you switch servers in the dashboard, you see that server's logs, not a mixed stream.

Server log files also exist on disk in each server's directory, but the in-dashboard console is the primary interface.

### Hytale Logs

The Hytale Cart writes dated log files to `F:\KitsuneDen\logs\`. These are persistent -- they survive restarts and can be reviewed after the fact.

Live log output is also streamed to the dashboard, giving the Operator a real-time view.

---

## 6. The Rituals (Task Scheduler)

The spirits wake through rituals, and rituals demand consistency.

- **Keep paths absolute.** A relative path in a scheduled task is a path that points nowhere after a working directory changes.
- **Test manually first.** Run `npm run dev` by hand before trusting it to Task Scheduler. Watch for errors. Confirm the dashboard starts.
- **Check after Windows updates.** Major updates can reset scheduled tasks or change security policies. Verify the ritual still runs after every update.
- **A disrupted ritual confuses a spirit.** If the startup script fails silently, the dashboards won't be running, and the Operator won't know until they try to open one. Task Scheduler's "restart on failure" setting helps, but it isn't a substitute for monitoring.

The startup flow: Windows boots, Task Scheduler waits 30 seconds, then runs `npm run dev` as `DARA-PC\darab` with highest privileges. One dashboard comes to life. The Den is awake.

---

## 7. The Gateways (Ports)

Six ports, each a doorway into or out of the Den.

| Port | Spirit | Purpose |
|---|---|---|
| 3000 | Unified Dashboard | The Operator's window into the Den |
| 25565 | Fabric Server | Where players connect to the modded vanilla world |
| 25566 | NeoForge Server | Where players will connect to the heavy modpack world |
| 25575 | Fabric RCON | Remote console for Fabric server commands |
| 25576 | NeoForge RCON | Remote console for NeoForge server commands |
| 5520 | Hytale Server | Where players connect to the Hytale world |

Port conflicts cause immediate distress. If two processes try to bind the same port, one will fail -- sometimes silently, sometimes with a clear error. If a spirit won't start, check whether her gateway is already occupied.

These six numbers are the Den's addresses. Keep them documented, keep them unique, and keep them sacred.

---

*These are the spirits of the Den. Treat them with understanding, care for them consistently, and they will serve the Operator faithfully.*
