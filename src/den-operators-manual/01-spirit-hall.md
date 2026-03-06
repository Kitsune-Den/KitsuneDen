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

# Chapter 1: The Spirit Hall

*A high view of everything that lives in the Den -- every spirit, every lantern, every gateway. Start here.*

---

## 1. The Minecraft Rig

**Location:** `F:\MinecraftServer\dashboard`
**Framework:** Next.js 16.1.6, TypeScript, Tailwind CSS
**Port:** 3000
**Nature:** Stable, structured, now multi-server capable

She is the eldest spirit in the Den, and the most refined. The Minecraft Rig has grown from managing a single server into a multi-instance commander, overseeing two game servers through a clean server switcher UI.

### The Two Servers She Commands

| Server | Loader | Game Port | RCON Port | Status |
|---|---|---|---|---|
| **Fabric 1.21.4** | Fabric Loader 0.18.4 | 25565 | 25575 | Mature, modded vanilla experience |
| **NeoForge 21.4.156** | NeoForge | 25566 | 25576 | Heavy modpack rig, awaiting its first pack |

Fabric is the proven road -- Fabric API, Lithium, the mods the crew knows. NeoForge is the new road, installed and configured but still quiet, waiting for the guys to settle on a modpack.

### What She Can Do

- **Live SSE Console** -- real-time server output streamed to the browser, with command input and history (up/down arrows)
- **Mod Pack System** -- create, activate, and manage curated sets of mods with a library upload system
- **Memory Management** -- JVM allocation controls with min/max dropdowns per server
- **Player Management** -- whitelist, op, ban, and kick controls with live player lists
- **Server Stats** -- memory usage bars, canvas sparkline graphs, CPU and uptime grid
- **Config Editor** -- grouped server.properties editor with dropdowns for gamemode and difficulty
- **Connection Info** -- LAN and public IP display with click-to-clipboard
- **Server Switcher** -- tab buttons with live status dots for switching between Fabric and NeoForge

### Startup

She launches via Task Scheduler or `npm run dev` in the dashboard root. She is the reference implementation -- the most mature spirit in the Den.

---

## 2. The Hytale Cart

**Location:** `F:\KitsuneDen`
**Framework:** Managed inside the unified dashboard (Next.js)
**Port:** 3000 (shared UI)
**Nature:** Capable, energetic, integrated into the Rig's lantern

The Hytale Cart is younger and rougher, but she works. She manages `HytaleServer.jar` on port 5520, with her server config living at `F:\KitsuneDen\config.json` -- server name "Kitsune Den", Adventure mode, 20 player slots.

### What She Can Do

- **Live Logs** -- server output visible in the unified dashboard
- **Server Control** -- start, stop, and manage the Hytale server process
- **Backup System** -- hourly and daily backups
- **World and Config Views** -- world listing, config editing, and mod visibility

### The Universe

Her `universe\` folder holds the treasure: 2 worlds, 3 players, and 5 warps. This is the living data of the Hytale server.

### Startup

Managed through the unified dashboard on port 3000.

---

## 3. The Dashboard (Unified Lantern)

The unified dashboard is the Den's lantern -- it illuminates both worlds for the Operator.

They share a common purpose:
- Clear UI that shows you what matters
- Reliable startup that doesn't need babysitting
- Health checks so you know when something is wrong
- Live logs so you can watch the world breathe
- Consistent structure so switching between them feels natural

The Minecraft Rig is the gold standard. The Hytale Cart now shares the same lantern.

---

## 4. The Journals (Logs)

Every spirit keeps a journal. Knowing where to find them is half the work of running the Den.

**Minecraft:**
- In-dashboard live console via SSE -- the primary way to watch the servers
- Server log files on disk for each server instance

**Hytale:**
- `F:\KitsuneDen\logs\` -- dated log files written by the server
- Live log streaming in the unified dashboard

---

## 5. The Rituals (Task Scheduler / Startup)

The Den's spirits wake through rituals -- scheduled tasks that bring the dashboard to life.

**The Startup Command:**
`npm run dev` launches the unified dashboard on port 3000.

**Why Task Scheduler, Not shell:startup:**
Bitdefender blocks `.bat` files placed in `shell:startup`. Task Scheduler is the reliable path.

**Task Scheduler Settings:**
- **Trigger:** Run at startup
- **Privileges:** Highest
- **Delay:** 30 seconds (let Windows settle)
- **Failure:** Restart on failure
- **User account:** `DARA-PC\darab`

Test your rituals manually before trusting them to run unattended.

---

## 6. The Gateways (Ports)

Six ports, six doorways. Each one serves a specific purpose, and no two may share the same number.

| Service | Port | Type |
|---|---|---|
| Unified Dashboard | 3000 | HTTP |
| Fabric MC Server | 25565 | Game |
| NeoForge MC Server | 25566 | Game |
| Fabric RCON | 25575 | RCON |
| NeoForge RCON | 25576 | RCON |
| Hytale Server | 5520 | Game |

A port conflict causes immediate distress -- if two spirits try to claim the same gateway, neither will function correctly. Keep these numbers sacred.

---

## 7. The Lantern Hall (Future Unified Panel)

The Lantern Hall is the Den's long-term vision: a single interface managing Minecraft, Hytale, and whatever future services join the Den.

It now exists as the unified dashboard. The server switcher is the first step, and the pattern is proven.

The vision: one panel, all servers, all dashboards, all spirits visible at a glance. When the time comes, the architecture is ready to grow.

---

*The Spirit Hall is the map. The chapters that follow are the territory.*
