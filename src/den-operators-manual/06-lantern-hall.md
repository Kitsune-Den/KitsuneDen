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

# Chapter 6: The Lantern Hall

*Where the Den has been, where it is now, and where it wants to go. A living roadmap.*

Stand at the center of the workshop and look around. The shelves are stocked, the tools are sharp, the lanterns are lit. But a workshop is never finished — there's always another shelf to build, another corner to illuminate. This chapter is the view from that vantage point: honest about what exists, clear about what remains, and warm about the direction ahead.

---

## 1. What the Lantern Hall Was

The Lantern Hall was originally envisioned as a future unified control panel — a single interface where every Den service, every dashboard, every log stream and health check could be viewed and managed together.

In early documentation, it was described as something not yet built, but already part of the Den's identity. It was a name for the direction the Den was heading — a promise of coherence and calm, written down before the code existed to fulfill it.

The name held a purpose even then: it gave the Den a place to grow toward.

---

## 2. What Has Already Been Achieved

The Den has grown significantly since those early notes. Many features originally imagined for the Lantern Hall now exist — unified in a single dashboard, proven in daily use.

### The Minecraft Rig

The Minecraft dashboard has become a full-featured operations center:

- **Unified service controls** — The server switcher manages both Fabric and NeoForge from a single interface, with seamless context switching between instances
- **Real-time monitoring** — Memory bars, sparkline graphs, CPU usage, uptime counters, and process PID tracking via the ServerStats component
- **Live log viewer** — SSE-powered console with colorized output, command input field, command history (arrow up/down), and a 2000-line scrollback buffer
- **Server health status** — Live status dots (green for running, red for stopped, yellow for transitioning) on each server tab, plus a `/api/servers` endpoint for programmatic health checks
- **Mod management** — Upload `.jar` files through the browser, organize mods into a library, create and swap between named mod packs per server
- **Player management** — Whitelist, op, ban, and kick players directly from the dashboard, with live player list display
- **Configuration editing** — Server properties editor with smart dropdowns for fields like gamemode and difficulty, reading from and writing to `server.properties`
- **Connection info** — Auto-detected LAN and public IP addresses with click-to-copy for easy sharing
- **Memory management** — Per-server JVM heap allocation (min and max) controlled through dashboard dropdowns, with automatic handling of `-Xms`/`-Xmx` flags (Fabric) and `user_jvm_args.txt` (NeoForge)
- **Consistent visual identity** — The Kitsune Den theme, defined through 16 CSS custom properties, applied across every component for a unified look and feel

### The Hytale Cart

Hytale operations are now integrated into the unified dashboard:

- **Server control** — Start, stop, and restart the Hytale server through the browser
- **Live logs** — streaming log output in the unified console
- **Automated backups** — hourly and daily backups managed through the UI

The Lantern Hall vision isn't a distant dream — much of it is already here, in one application.

---

## 3. What Remains

The vision is not complete. Here is what the Den still needs, organized by time horizon.

### Near-Term

These are small, concrete improvements that would strengthen what already exists:

- **Add structured logging for Hytale events** — timestamped, leveled log output for easier troubleshooting
- **Set up Task Scheduler for dashboard auto-start** — boot-time startup should be reliable (and Bitdefender-proof)

### Medium-Term

These are architectural improvements that would make both dashboards easier to maintain and extend:

- **Deepen the Hytale feature set** — align world tooling, backups, and config UX with Minecraft's parity
- **Improve mod tooling** — richer mod pack diagnostics and compatibility checks

### Long-Term -- The True Lantern Hall

This is the full vision: a single application that manages the entire Den.

- **Expand the server switcher** — add more games and services as the Den grows
- **Shared component library** — ServerControl, Console, PlayerManager, Stats — built once, used everywhere
- **Cross-server log aggregation** — View all server logs in one unified stream, filterable by source
- **System-wide health dashboard** — All servers and ports in one view showing the health of the entire Den
- **Backup management UI** — View backup history, trigger manual backups, restore from previous snapshots — all through the browser

---

## 4. Guiding Principles

These principles have guided every decision in the Den so far. They will continue to guide what comes next.

- **Calm.** No clutter, no noise. Every element on screen should earn its place.
- **Consistent.** Shared UI patterns, shared naming conventions, shared structure. Moving between dashboards should feel like moving between rooms in the same house.
- **Extensible.** The architecture should welcome new services without requiring rewrites. Adding a new game server should feel like hanging a new lantern, not rebuilding the hall.
- **Honest.** Logs and health checks should be visible and clear. The Den never hides problems — it illuminates them so the Operator can respond.
- **Cozy-Professional.** Warm, readable, intentional — but a real tool for real work. The Den has personality, but it never sacrifices precision for charm.

---

## 5. The Path Forward

The Lantern Hall isn't a single project to build — it's a direction to walk. Each improvement to either dashboard, each shared pattern adopted, each structural alignment brings the Den closer to the vision.

The architecture is ready. The Minecraft dashboard has proven that a Next.js application can manage multiple server instances through a clean API layer and a reactive frontend. The patterns are tested — SSE for logs, REST for control, JSON files for configuration, child processes for server management. The theme is established — 16 CSS custom properties that give every component a consistent, warm identity.

What remains is steady work, one lantern at a time.

Some of that work is small — a structured log here, a dashboard polish there. Some of it is structural — expanding capabilities, improving diagnostics, tightening UX.

But none of it is urgent. The Den works today. Backups run on schedule, servers start and stop reliably. The Lantern Hall is not a fix for something broken — it's the natural next shape of something that already works well.

Walk toward it at whatever pace feels right. The lanterns will be there when you arrive.

---

*The hall is long, and the lanterns are patient. Light them one at a time.*
