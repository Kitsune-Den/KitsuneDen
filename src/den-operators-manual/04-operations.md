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

# Chapter 4: Rituals & Routines

*The practical steps for keeping the Den alive and well. Setup, startup, switching, managing: all of it.*

A well-kept workshop runs on habit. Nothing here is complicated, but precision matters. Follow the paths as written and the Den will hum along quietly.

---

## 1. Starting the Dashboard

### First-time setup

From the repo root:

```
npm install
copy .env.example .env
copy servers.example.json servers.json
```

Then:

1. Edit `.env`. Set `KITSUNEDEN_PASSWORD` to the shared password and `KITSUNEDEN_SESSION_SECRET` to 32 or more random characters:
   ```
   node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"
   ```
2. Edit `servers.json` to describe your servers, or trim it down to `{ "servers": [], "dashboard": { "port": 3001 } }` and add servers from the UI later (section 3).

### The quick way (development)

```
npm run dev
```

The dashboard comes up on **port 3001**. Keep the window open to watch its output.

### The steady way (production)

```
npm run build
npm run start
```

Also port 3001. Rebuild after every update to the code.

### Via Task Scheduler (auto-start on boot)

Task Scheduler is the preferred way to start the Den on boot. It avoids the antivirus trouble that plagues `shell:startup` batch files.

| Setting | Value |
|---|---|
| Trigger | At startup, delayed 30 seconds |
| Privileges | Run with highest privileges |
| On failure | Restart the task |
| User account | the account that owns the KitsuneDen folder and game servers |
| Action | `cmd.exe` with arguments `/c npm run start` |
| Start in | the KitsuneDen repo root |

The delay gives Windows time to bring up networking before the dashboard binds its port. Build once (`npm run build`) before handing the task over.

### Verifying

Open [http://localhost:3001](http://localhost:3001). You should land on the login page, then the Den once you sign in. If the page refuses the connection or shows a setup banner, see Chapter 5.

> **PowerShell note:** if PowerShell blocks `npm` with an `UnauthorizedAccess` error, either run `cmd /c "npm run dev"` or allow local scripts with `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`.

---

## 2. Passing the Gate (Login)

- Everyone uses the same password: `KITSUNEDEN_PASSWORD`.
- A session lasts **7 days**. **Log out** with the button next to *Den operator* at the bottom of the sidebar.
- **Changing the password** means editing `.env`, restarting the dashboard, and telling everyone. Existing sessions stay valid until they expire.
- **Ending every session at once** (say, after a password leak): change `KITSUNEDEN_SESSION_SECRET` and restart. Every cookie signed with the old secret stops working.

The session cookie is only marked `Secure` when the request came in over HTTPS (directly, or through a proxy or tunnel that sets `X-Forwarded-Proto: https`). Signing in over plain `http://192.168.x.y:3001` on your LAN works; anything reachable from the internet belongs behind HTTPS anyway.

---

## 3. Adding, Editing, and Removing Servers

The **Servers** page manages `servers.json` for you.

- **Add Server**: pick a game type, name it, browse to its install directory, and fill in its ports and passwords. The id must be unique.
- **Edit**: change any field except `id` and `type`. The adapter is rebuilt immediately.
- **Remove**: stops the server if the dashboard thinks it's running, then removes it from `servers.json`. There is an option to **delete the server's files from disk** as well. That deletion is permanent; read the dialog twice.

The **Browse** button opens a Windows folder picker **on the machine running the dashboard**, not in your browser. If the Den runs as a background service or you're connecting from another computer, type the path instead.

Some fields aren't in the form yet. Edit `servers.json` by hand for:

- Minecraft: `jar`, `launchMode`, `argFiles`, `rconHost`, `lifecycle`
- 7 Days to Die: `controlPanelPort`, `adminFilePath`
- Palworld / Enshrouded: `startScript` (Palworld), `steamAppId`

**Restart the dashboard after editing `servers.json` by hand.** It caches the file at first read.

---

## 4. Starting and Stopping Game Servers

Each server card on the home page has start/stop and restart buttons, and every server's own page has **Start**, **Stop**, and **Restart** in its header. Stop and restart ask for confirmation, since they disconnect players. On a server's page the keys `s`, `x` and `r` do the same (with the same confirmation).

What each button actually does depends on the spirit (see Chapter 2, section 9). In short:

- **Minecraft (local)** and **7 Days to Die** run as child processes of the dashboard. If the dashboard stops, so do they.
- **Hytale, Palworld, and Enshrouded** are launched in their own windows and keep running if the dashboard restarts.
- **Minecraft (remote)** stops over RCON, falling back to `lifecycle.stopCommand` over SSH if RCON fails. Start and Restart need a `lifecycle` block; without one they refuse with a message explaining why.

### Servers you started some other way

A server started by hand, by nssm, or by another launcher still shows as running, thanks to the reachability probe. But the dashboard didn't spawn it, so:

- Local Minecraft: no console stream, no stdin commands, and Stop does nothing. Setting `rconHost` to `127.0.0.1` switches the entry to the remote rules (RCON commands and RCON stop), at the cost of the Start button.
- 7 Days to Die: console commands and Stop go over telnet as usual (Stop sends `shutdown`; whatever launched her may bring her back). Start refuses while her telnet port is open, so the dashboard won't launch a second copy.
- Hytale, Palworld, Enshrouded: the dashboard finds them by process name and manages them normally.

### Starting manually

When you need a server outside the dashboard's control, run its own launcher from its own directory, for example:

```
cd C:\GameServers\fabric-server
start.bat
```

Launch scripts use relative paths, so always `cd` into the server's folder first.

---

## 5. Getting Around

**Servers** (the home page) shows every server in `servers.json` as a card: status, memory, players online, uptime, and quick controls. Toggle between grid and list at the top right. Cards refresh every few seconds while the tab is visible.

Click a card to open that server. Its page has tabs: **Status, Console, Config, Players**, then whichever of **Worlds, Backups, Mods, Mod packs, Airdrops, Update** the game supports, and **Activity**. Each tab has its own URL, so you can bookmark `/instances/<id>/console`. `[` and `]` step between tabs; `h` goes back to all servers; `?` lists every shortcut.

**Opening a server never stops anything.** Servers on different ports can all run at once; you're only choosing which one to look at.

### Saving config

Config edits are staged. Each changed field gets a small orange dot, the header counts the unsaved changes, and a bar at the bottom offers **Save changes** or **Discard**. After a save it tells you whether the server needs a restart and offers **Restart now** if it's running. Leaving the tab, the page, or the browser with unsaved edits asks first.

### Activity

The **Activity** page (and each server's Activity tab) lists what happened: starts, stops, restarts, config saves, roster changes, backups, mod changes, sign-ins. A server that goes down without the dashboard asking is logged as a crash. The log lives in `data\activity.jsonl` and keeps the most recent ~1500 events.

### Settings

**Settings** picks dark, light or system theme and turns on the colour-blind status palette. Both are saved in the browser, so each person (and each device) chooses their own.

---

## 6. Managing Mods

### Mods page (Minecraft, Hytale, 7 Days to Die)

- **Upload** files from the browser. A `.zip` is extracted: a zip with one top-level folder lands as that folder; a zip of loose files lands in a folder named after the zip.
- **Remove** a mod file or folder.
- Mods live in `modsDir` (relative to `dir`, or absolute), default `<dir>\mods\`. Mod Packs and Minecraft backups use the same folder.

### Mod Library and Mod Packs (Minecraft)

- `mods-library\` holds every mod `.jar` you might want. Upload to it from the Mod Packs page, or copy an active mod into it from the Mods page.
- A **pack** is a named list of library mods, stored in `modpacks.json`.
- **Activating** a pack copies its mods from the library into the mods folder (`modsDir`) and marks it active. It does **not** remove mods that are already there. Any mods missing from the library are reported.

For a clean swap: clear `mods\`, then activate the pack.

### Critical rules

- **Fabric mods only on Fabric servers, NeoForge mods only on NeoForge servers.** Mixing them crashes the server or silently skips the mods.
- **Restart after any mod change.** Mods load at boot.

---

## 7. Memory (Minecraft)

Set heap size in the **Memory Allocation** card on the server's **Status** tab (local Minecraft servers only; a remote server's JVM isn't started by the dashboard). It's stored in `dashboard-config.json` in the server's directory:

```json
{ "minMemoryGB": 2, "maxMemoryGB": 4 }
```

The `/api/memory` endpoint reads and writes this file. How it's applied:

- **`jar` mode:** passed as `-Xms` / `-Xmx` on the command line at start.
- **`argfile` mode:** written into `user_jvm_args.txt` at start (which replaces that file's contents).

**Restart the server** after changing memory. The JVM only reads it at startup.

The other games manage their own memory; the dashboard only reports how much their process is using.

---

## 8. Player Management

The **Players** page changes shape for each game.

| Spirit | What you can do | How it's done |
|---|---|---|
| Minecraft (local) | whitelist, op, ban, and undo each; see who's online | edits `whitelist.json`, `ops.json`, `banned-players.json` directly; online list from RCON `list` |
| Minecraft (remote) | the same | RCON commands (`whitelist add/remove`, `op`, `deop`, `ban`, `pardon`) |
| 7 Days to Die | see everyone who has ever joined, with online/offline tags; manage admins, whitelist, blacklist, command permissions | log parsing, telnet `listplayers`, `serveradmin.xml` |
| Hytale | toggle OP for players in `permissions.json` | edits `permissions.json` |
| Palworld | see who's online; kick, ban, promote/demote, save world, broadcast | RCON (REST fallback); promote/demote edits `palworld-admins.json` |
| Enshrouded | see who has connected | log scrape only |

**Minecraft (local) note:** Minecraft reads its roster files at startup. Edits made while the server is running may not take effect until a restart (or an in-game `whitelist reload`), and the server can overwrite them if someone changes the roster in-game. For immediate effect on a running server, send the command from the console instead (`op Steve`, `whitelist add Steve`).

Minecraft players who are online but in no roster file still appear, tagged **Online**, so guests on an open server don't vanish.

---

## 9. Using the Console

The **Console** page is the dashboard's live window into a server.

- **Live output** streamed over Server-Sent Events, starting with the current buffer
- **2000-line buffer** per server; older lines fall away
- **Command input** with history (up/down arrows)

Where commands go:

| Spirit | Commands travel by |
|---|---|
| Minecraft (local) | stdin; only while the server is running |
| Minecraft (remote) | RCON; reply appears in the console. `stop`, `restart`, `shutdown` are refused, so use the Stop / Restart buttons |
| 7 Days to Die | telnet, whether or not the dashboard launched her; errors appear in the console |
| Palworld | RCON, fire-and-forget (no reply is shown) |
| Hytale, Enshrouded | nowhere; they don't accept commands |

The buffer clears when the dashboard restarts. For older history, read the log files on disk.

---

## 10. Backups

| Spirit | How | Where |
|---|---|---|
| Hytale | runs your `backupScript` (`-Daily` flag for daily) | lists `.zip` files in `<dir>\backups\hourly\` and `\daily\` |
| Palworld | zips `Pal\Saved\SaveGames\` + settings (saves the world first if running) | `<dir>\..\backups\palworld\hourly\` or `\daily\` |
| Enshrouded | zips `savegame\` | `<dir>\..\backups\enshrouded\hourly\` or `\daily\` |
| Minecraft | the `/api/backups` route can zip the world, `mods\`, `server.properties`, `modpacks.json`, and `dashboard-config.json` into `<dir>\backups\<type>\` | `<dir>\backups\hourly\` or `\daily\` (local servers only; hidden for remote ones) |
| 7 Days to Die | not supported yet | |

"Hourly" and "daily" are folder names. The dashboard doesn't schedule anything; schedule your own backups (Task Scheduler works) and use the page for on-demand runs and a quick look at what exists.

There is no restore button. Restoring means stopping the server and unzipping by hand.

### Hytale backup script

`backupScript` can be an absolute path or a path relative to the server's `dir`. It's run as `powershell -ExecutionPolicy Bypass -File <script> [-Daily]` with a 60-second timeout, and it should write zips into `backups\hourly\` or `backups\daily\` under `dir` so the page can list them.

### General advice

Back up before:
- major mod changes or pack switches
- game or mod-loader version updates
- any structural change to server configuration

---

## 11. Updates

| Spirit | Source | Notes |
|---|---|---|
| Palworld | SteamCMD, app 2394010 | needs `steamCmdPath`; server must be stopped; 5-minute timeout |
| Enshrouded | SteamCMD, app 2278520 | same requirements |
| Hytale | the Hytale Launcher's downloaded files | open the launcher first so it fetches the update; server must be stopped |

SteamCMD runs `+force_install_dir <dir> +login anonymous +app_update <id> validate +quit`.

---

## 12. Airdrops (Hytale + KitsuneCommand)

If the KitsuneCommand mod is installed (the dashboard looks for `mods\KitsuneCommand_KitsuneCommand\kitsunecommand.db`), an **Airdrops** page appears. It reads and writes the mod's SQLite database directly:

- **Settings**: interval, chest type, item counts, drop radius, announce message, decay timers
- **Loot tables**: tables and their weighted item entries
- **History**: recent drops

Whether the mod picks up changes without a restart depends on the mod.

---

## 13. Daily Operator Checklist

### Morning

- [ ] Open the Den ([localhost:3001](http://localhost:3001)) and confirm it loads
- [ ] Glance at the server grid. Is everyone who should be awake, awake?
- [ ] Skim **Activity** for anything marked as stopped unexpectedly.
- [ ] Skim the console of anything that restarted overnight

### Occasional

- [ ] Check memory on the Dashboard page; make sure no Java process is creeping toward its ceiling
- [ ] Check the Backups page; confirm new zips are appearing
- [ ] Look for lingering processes from old sessions (`tasklist | findstr java`)

### After updating the Den's code

- [ ] `npm install` if `package.json` changed
- [ ] `npm test`
- [ ] `npm run typecheck`
- [ ] `npm run build`, then restart the dashboard
- [ ] Switch through every server and make sure each one answers

---

*A ritual only works if you perform it the same way each time. The Den rewards consistency.*
