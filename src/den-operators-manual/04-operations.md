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

*The practical steps for keeping the Den alive and well. Startup, shutdown, switching, managing — all of it.*

A well-kept workshop runs on habit. This chapter holds every routine an Operator needs — the daily rituals that keep dashboards bright, servers steady, and spirits calm. Nothing here is complicated, but precision matters. Follow the paths as written and the Den will hum along quietly.

---

## 1. Starting the Dashboard

There are two ways to bring the dashboard to life. Pick the one that fits the moment.

### The Quick Way

Run the unified dashboard:

```
npm run dev
```

This starts the dashboard on **port 3000**. Keep the window open to watch output. If it closes unexpectedly, check the terminal output for errors before restarting.

### Via Task Scheduler (Recommended for Auto-Start)

Task Scheduler is the preferred method for making dashboards start on boot. It avoids the Bitdefender issues that plague `shell:startup` batch files.

| Setting | Value |
|---|---|
| Trigger | At startup |
| Privileges | Run with highest privileges |
| Delay | 30 seconds |
| On failure | Restart the task |
| User account | `DARA-PC\darab` |
| Action | Run `npm run dev` |

The 30-second delay gives Windows time to finish initializing networking and services before the dashboards try to bind their ports.

### Individually

When you need to start the dashboard manually, or when troubleshooting:

```
cd F:\MinecraftServer\dashboard && npm run dev
```

### Verifying

Once started, confirm it's alive:

- Open [http://localhost:3000](http://localhost:3000)

You should see the Den-themed interface load within a few seconds. If the page stays blank or refuses the connection, see Chapter 5 (Troubleshooting).

> **PowerShell Note:** If PowerShell blocks `npm run dev` with an `UnauthorizedAccess` error, you have two options:
> - Use `cmd /c "npm run dev"` to bypass PowerShell's execution policy entirely
> - Set the execution policy permanently: `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`

---

## 2. Starting Game Servers

### Via the Dashboard (Recommended)

Click the **Start** button in the **ServerControl** panel. The dashboard spawns the Java process as a managed child process and streams its output directly to the console component.

This is the recommended approach because the dashboard can:
- Stop the server cleanly
- Send commands to the server via stdin
- Stream live output to your browser
- Track the process PID and memory usage

### Manually

When you need to run a server outside the dashboard's control:

**Fabric:**
```
cd F:\MinecraftServer\server && start.bat
```

**NeoForge:**
```
cd F:\MinecraftServer\server-neoforge && run.bat
```

**Hytale:**
```
cd F:\KitsuneDen && start_kitsune_den.bat
```
Hytale binds to `0.0.0.0:5520` — open to all network interfaces by default.

> **Important distinction:** Game servers started via the dashboard are **managed child processes** — the dashboard can stop them, send commands, and stream their output. Servers started manually are **independent processes** — the dashboard won't know about them and can't control them.

---

## 3. Switching Between Servers (Minecraft Dashboard)

The **server switcher** lives at the top-right of the dashboard header. It's the primary way to move between server instances.

**How it works:**

- Two tab buttons: **Fabric** and **NeoForge**
- Each tab has a **live status dot**:
  - Green = running
  - Red = stopped
  - Yellow = starting or stopping
- Clicking a tab **changes the active server for ALL components** — console, stats, config, mods, players, everything

**What happens on switch:**

The transition resets component state to reflect the newly selected server:
- Console logs clear and reconnect to the new server's stream
- Stats reset and begin polling the new server's metrics
- Config reloads from the new server's `server.properties`
- Mod lists refresh from the new server's `mods\` directory
- Player lists reload

**Both servers can run simultaneously** on different ports (Fabric on 25565, NeoForge on 25566). The switcher only changes which one the dashboard is *displaying* — it doesn't stop either server.

---

## 4. Managing Mods

### Active Mods

The `mods\` folder in each server directory holds the currently active mods. You can manage them two ways:

- **Via the Mod Manager component** in the dashboard — upload `.jar` files through the browser
- **Manually** — drop `.jar` files directly into the `mods\` folder on disk

### Mod Library

The `mods-library\` folder in each server directory stores **all available mods** — a reservoir of `.jar` files that aren't necessarily active. Mod Packs pull from this library when activated.

### Mod Packs

Mod Packs let you create **named collections of mods** and swap between them:

1. Create a pack and assign mods from the library
2. Activating a pack **merges into the `mods\` folder** and copies the pack's mods from `mods-library\`
3. Switch between packs freely — nothing in the library is ever deleted

This is useful for maintaining different mod configurations (a creative building set, a survival adventure set, a lightweight testing set) without losing anything.

### Critical Rules

- **Fabric mods only work on the Fabric server.** NeoForge mods only work on the NeoForge server. Never mix them — the server will crash or the mods will silently fail to load.
- **Restart required.** After any mod change — adding, removing, or switching packs — you must restart the game server for changes to take effect.

---

## 5. Memory Management

### Setting Memory

In the **ServerControl** panel, use the **Min Memory** and **Max Memory** dropdowns to allocate JVM heap memory. The range is **1 GB to 32 GB**.

Changes are saved to `dashboard-config.json` in the active server's directory.

### How Memory is Applied

The mechanism differs between server types:

- **Fabric:** Memory flags are passed directly on the command line as `-Xms` (minimum) and `-Xmx` (maximum) when the dashboard spawns the Java process
- **NeoForge:** Memory values are written to `user_jvm_args.txt` in the server directory. The dashboard manages this file automatically — you don't need to edit it by hand.

### After Changing Memory

Restart the game server. Memory allocation is set at JVM startup and cannot be changed while the server is running.

---

## 6. Player Management

The **PlayerManager** component requires a running server to function. It communicates with the game server via stdin commands (not RCON).

### Actions

Enter a player name and use the action buttons:

| Action | What it does |
|---|---|
| **Whitelist** | Adds the player to the server whitelist |
| **Op** | Grants operator (admin) privileges |
| **Ban** | Bans the player from the server |
| **Kick** | Removes the player from the current session |

### Player Lists

The component displays the current whitelisted players, operators, and banned players. Lists can be modified directly from the dashboard.

---

## 7. Using the Console

The **Console** component is the dashboard's live window into the game server's soul.

### Features

- **Live output** via SSE (Server-Sent Events) streaming
- **2000-line buffer** — older lines are trimmed as new ones arrive
- **Auto-scrolling** — follows new output automatically. Scroll up to pause; scroll back to the bottom to resume.
- **Command input** — type commands in the input field and press Enter or click Send
- **Command history** — use arrow up/down to navigate through previously entered commands

### Color Coding

| Color | Meaning |
|---|---|
| Amber | Dashboard system messages |
| Gold | Your typed commands (echoed back) |
| Red | Errors and stderr output |
| Orange | Warnings |

The console is read-only for output — you can't select and delete lines. If the buffer feels noisy, restarting the server gives you a clean slate.

---

## 8. Backups

### Hytale (Automated)

Hytale backups are handled by PowerShell scripts in `F:\KitsuneDen\`:

**`backup_kitsune_den.ps1`** backs up:
- `universe/` (worlds, players, warps)
- `config.json`
- `permissions.json`
- `whitelist.json`
- `bans.json`

**Retention policy:**

| Schedule | Location | Retention |
|---|---|---|
| Hourly | `F:\KitsuneDen\backups\hourly\` | 1 day |
| Daily | `F:\KitsuneDen\backups\daily\` | 7 days |

**Setting up the schedule:** Run `setup_backup_schedule.ps1` to create the necessary Task Scheduler tasks.

### Minecraft (Dashboard)

Minecraft backups can be triggered from the dashboard and are stored in each server's `backups\` folder. The backup includes:

- World folder
- `mods\`
- `server.properties`
- `modpacks.json`
- `dashboard-config.json`

### General Advice

Back up before:
- Major mod changes or pack switches
- Minecraft or mod loader version updates
- Any structural changes to server configuration

---

## 9. Daily Operator Checklist

### Morning

- [ ] Open the dashboard and confirm it loaded ([localhost:3000](http://localhost:3000))
- [ ] Glance at the console for any error messages or warnings from overnight

### Occasional

- [ ] Check memory usage in ServerStats — make sure Java isn't creeping toward the ceiling
- [ ] Review backup status for Hytale — confirm hourly and daily backups are running
- [ ] Check for lingering Java processes from previous sessions (`tasklist | findstr java`)

### After Updates

- [ ] Verify dashboards still start cleanly
- [ ] Run `npx next build` in `F:\MinecraftServer\dashboard\` to check for TypeScript errors
- [ ] Test the server switcher — make sure both Fabric and NeoForge respond

---

*A ritual only works if you perform it the same way each time. The Den rewards consistency.*
