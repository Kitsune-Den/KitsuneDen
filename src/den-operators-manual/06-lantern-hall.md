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

Stand at the center of the workshop and look around. The shelves are stocked, the tools are sharp, the lanterns are lit. A workshop is never finished, though; there's always another shelf to build. This chapter is the view from the middle of the room: honest about what exists, clear about what remains.

---

## 1. What the Lantern Hall Was

The Lantern Hall began as a name for a future: one control panel where every Den service, every log stream, and every health check could be seen and managed together.

Back then it was written down before the code existed, a promise of coherence and calm. The name gave the Den somewhere to grow toward.

---

## 2. What Has Already Been Achieved

Much of that promise is kept. The separate Minecraft and Hytale dashboards became one app, and the one app learned new games.

### One hall, many lanterns

- **Adapter architecture**: every game is one class behind one interface. Minecraft, Hytale, 7 Days to Die, Palworld, and Enshrouded all live in the same hall
- **Capability-driven UI**: each server shows only the pages it can use
- **Servers from the UI**: add, edit, and remove servers without hand-editing JSON, with a folder picker for install paths
- **Honest status**: a TCP reachability probe means servers run by services or other machines report their real state
- **A front door**: the shared-password gate, with signed 7-day sessions
- **The manual, in-app**: these chapters are readable from the dashboard's Docs menu

### Reaching across the house

- **Remote Minecraft** through `rconHost`: status, console commands, stop, online players, and roster changes, all over RCON
- **SSH lifecycle**: start and restart remote Minecraft servers through the machine's own OpenSSH client
- **Safety rails**: typed `stop` / `restart` / `shutdown` are refused for remote servers, so a typo can't strand a world

### Per-spirit care

- **Minecraft**: live console, mod library and packs, JVM memory per server, online players via RCON
- **7 Days to Die**: telnet console, a player history from the log, `serveradmin.xml` editing, a day/night slider
- **Hytale**: worlds and warps, OP toggles, backup listing, launcher-based updates, KitsuneCommand airdrop management
- **Palworld**: RCON and REST, kick/ban/broadcast/save, SteamCMD updates, save backups
- **Enshrouded**: config, SteamCMD updates, save backups, and a best-effort player list from her logs

### Care for the workshop itself

- Vitest suites for the adapters, auth, reachability, remote exec, and the Minecraft guards
- GitHub Actions running tests and a build on every pull request

---

## 3. What Remains

The vision is not complete. Here is what the Den still wants, by time horizon.

### Near-Term

Small, concrete things that would strengthen what exists:

- **Quiet the buttons that can't help.** Remote Minecraft servers without a `lifecycle` block still show Start and Restart; they refuse politely, but the capabilities could hide them instead
- **Put the missing fields in the form.** `rconHost`, `lifecycle`, `launchMode`, and `argFiles` still need hand-editing in `servers.json`
- **Rate-limit the login.** Fine on a tailnet; necessary before the Den ever faces the open internet

### Medium-Term

Architectural improvements:

- **Remote hosts for more spirits.** Only Minecraft has `rconHost`; the others assume they share a machine with the dashboard
- **Graceful stops everywhere.** Hytale and Enshrouded are stopped by terminating their process
- **Backups for 7 Days to Die**, and scheduling built into the dashboard rather than left to Task Scheduler
- **Richer mod tooling**: pack swaps that clear old mods, compatibility checks, clearer diagnostics

### Long-Term: The True Lantern Hall

- **Cross-server log aggregation**: every journal in one stream, filterable by spirit
- **A whole-Den health view**: every server and port at a glance, without switching
- **Restore from backup**: browse snapshots and restore them from the browser
- **Per-user accounts**: the gate was built so a real user system can slot in without changing the cookie shape

---

## 4. Guiding Principles

These have guided every decision in the Den so far. They'll guide what comes next.

- **Calm.** No clutter, no noise. Every element on screen should earn its place.
- **Consistent.** Shared patterns, shared naming, shared structure. Moving between spirits should feel like moving between rooms in the same house.
- **Extensible.** A new game is one adapter class. Adding a server should feel like hanging a new lantern, not rebuilding the hall.
- **Honest.** Logs and status should be visible and true. The Den never hides problems; it lights them up so the Operator can respond.
- **Careful.** Anything that can't be undone (deleting files, stopping a server you can't restart) should be hard to do by accident.
- **Cozy-Professional.** Warm, readable, intentional, and still a real tool for real work. Personality never costs precision.

---

## 5. The Path Forward

The Lantern Hall isn't a single project to finish. It's a direction to walk.

The architecture is ready for it. One interface describes every game; one registry wakes every server; one probe tells the truth about who is awake. SSE for logs, REST for control, JSON files for configuration, and child processes, RCON, telnet, or SSH for reaching the spirits themselves. The patterns are tested and the theme is settled.

What remains is steady work, one lantern at a time. Some of it is small: a missing form field, a hidden button. Some of it is structural: remote hosts for every spirit, a real restore flow.

None of it is urgent. The Den works today. Servers start and stop, players come and go, backups land where they should. The Lantern Hall is not a fix for something broken. It's the next shape of something that already works.

Walk toward it at whatever pace feels right. The lanterns will be there when you arrive.

---

*The hall is long, and the lanterns are patient. Light them one at a time.*
