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

*A high view of everything that lives in the Den: every spirit, every lantern, every gateway. Start here.*

---

## 1. The Unified Lantern (The Dashboard)

**Location:** wherever you cloned KitsuneDen (the repo root)
**Framework:** Next.js 16.1.6 (App Router), React 19, TypeScript, Tailwind CSS 4
**Port:** 3001 (set in the `dev` and `start` scripts in `package.json`)
**Nature:** Steady, watchful, one flame for every world

The Den used to be a scatter of dashboards, one per game. Now there is one lantern. A single Next.js app reads `servers.json`, wakes an **adapter** for each server listed there, and gives the Operator one window into all of them.

Each adapter knows how its game likes to be spoken to: a child process's stdin for a local Minecraft server, RCON for a remote one, telnet for 7 Days to Die, RCON and a REST API for Palworld, and quiet log-watching for the games that offer nothing else. The dashboard only shows the pages a server can actually use (mods, mod packs, worlds, backups, updates, airdrops), based on that adapter's capabilities.

### What she can do

- **Server grid**: every server in `servers.json` as a card with live status, memory, players and uptime, refreshed every few seconds
- **A page per server**: `/instances/<id>`, with tabs for status, console, config, players and whatever else that game supports
- **Add, edit, and remove servers from the UI**: with a native folder picker for the install directory
- **Live console**: streamed server output, plus command input for games that accept commands
- **Lifecycle controls**: start, stop, and restart from each card and from the server's page (stop and restart ask first)
- **Players**: rosters, online status, and the admin actions each game supports
- **Config editor** with staged saving (changes are marked until you save, then it offers a restart): `server.properties`, `serverconfig.xml`, `config.json`, `PalWorldSettings.ini`, or `enshrouded_server.json`, with friendly widgets where they help (like the 7D2D day/night slider)
- **Mods and mod packs**: uploads, a mod library, and swappable packs for Minecraft
- **Backups, updates, and airdrops**: for the games that support them
- **Connection info**: LAN and public IP with the game port, ready to share
- **Activity log**: starts, stops, crashes, config saves and roster changes, per server and Den-wide
- **Themes and shortcuts**: dark, light or system theme, a colour-blind palette, and single-key shortcuts (press `?`)
- **Docs**: this manual, readable in-app under Library

---

## 2. The Spirits She Tends

Five kinds of spirit live in the Den today. Chapter 3 introduces each one properly; this is the roll call.

| Spirit | `type` | Speaks through | Knows she's awake by |
|---|---|---|---|
| **The Minecraft Rig** (Fabric, NeoForge, vanilla) | `minecraft` | stdin when local, RCON when remote | the "Done (" line, plus a TCP probe of the game port |
| **The Hytale Cart** | `hytale` | nothing (no live commands) | finding her `java.exe` in the process list |
| **The Seven Days Watch** (7 Days to Die) | `7d2d` | telnet | a TCP probe of the telnet port |
| **The Palworld Ranch** | `palworld` | RCON, with the REST API as backup | a TCP probe of RCON or REST, plus the process list |
| **The Enshrouded Hearth** | `enshrouded` | nothing (no RCON, no API) | finding `enshrouded_server.exe` in the process list |

A Minecraft server can also live on another machine in the house. Give her an `rconHost` and the Den will watch, command, and stop her over the network; add a `lifecycle` block and the Den can start and restart her over SSH too. Chapter 2 covers the machinery.

---

## 3. The Gate (Shared-Password Auth)

The Den has a front door now. Every page and every API call passes through `src/proxy.ts`, which checks for a signed session cookie.

- One shared password, set in `KITSUNEDEN_PASSWORD`
- Sessions signed with `KITSUNEDEN_SESSION_SECRET` (32 characters or more) and valid for 7 days
- If either is missing, the login page shows a setup banner and API calls answer `503`

Both live in `.env` at the repo root (copy `.env.example` to start). Chapter 4 has the setup ritual.

---

## 4. The Journals (Logs)

Every spirit keeps a journal. Knowing where to find them is half the work of running the Den.

The dashboard keeps the last **2000 lines** per server in memory and streams them to the Console page. Behind that buffer, each spirit writes somewhere different:

| Spirit | Where the journal comes from |
|---|---|
| Minecraft (local) | stdout/stderr of the Java process the dashboard spawned |
| Minecraft (remote) | dashboard messages and RCON replies only; the real log stays on the remote host |
| Hytale | the newest `logs\*.log` in the server directory |
| 7 Days to Die | `logs\7d2d-server.log`, which the dashboard tells the server to write when it launches her |
| Palworld | the newest log in `Pal\Saved\Logs\` |
| Enshrouded | the newest `logs\*.log` in the server directory |

The in-memory buffer does not survive a dashboard restart. The files on disk do.

---

## 5. The Rituals (Startup)

The Den's spirits wake through rituals: scheduled tasks that bring the dashboard to life after the machine boots.

**The startup commands:**
- `npm run dev`: development mode on port 3001
- `npm run build`, then `npm run start`: production mode on port 3001

Starting the dashboard does not start any game servers. Those wake when you press Start, or through whatever service manager already runs them.

**Why Task Scheduler, not shell:startup:**
Antivirus (Bitdefender, in the Den's case) blocks `.bat` files placed in `shell:startup`. Task Scheduler is the reliable path. Chapter 4 has the settings.

Test your rituals by hand before trusting them to run unattended.

---

## 6. The Gateways (Ports)

Every spirit needs her doorways, and no two may share a number on the same machine.

| Service | Default port | Protocol |
|---|---|---|
| KitsuneDen dashboard | 3001 | HTTP |
| Minecraft game | 25565 (configured as `gamePort`) | TCP |
| Minecraft RCON | 25575 | TCP |
| 7 Days to Die game | 26900 (configured as `gamePort`) | UDP |
| 7 Days to Die telnet | 8081 | TCP |
| Hytale game | configured as `gamePort` | see Appendix B |
| Palworld game | 8211 | UDP |
| Palworld RCON | 25575 | TCP |
| Palworld REST API | 8212 | TCP |
| Enshrouded game (joining and server browser) | 15637 | UDP |

Notice that Minecraft RCON and Palworld RCON both default to **25575**. If both live on one machine, move one of them. A port conflict causes immediate distress: if two spirits claim the same gateway, one of them will not wake.

The full reference, with notes, is Appendix B.

---

## 7. The Lantern Hall

The Lantern Hall was the Den's long-term dream: one interface for every game, every log, every health check.

Most of it now exists. The unified dashboard is the hall; each adapter is another lantern hung inside it. Chapter 6 covers what has been built and what is still waiting for light.

---

*The Spirit Hall is the map. The chapters that follow are the territory.*
