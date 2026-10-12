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

# Chapter 5: Troubleshooting & Remedies

*When a spirit grows restless, here is how to calm her. Practical fixes for real problems.*

Every workshop has its creaky floorboards. Ports get tangled, processes linger, and occasionally a spirit refuses to wake. Each issue below follows the same shape: what you see, why it happens, how to fix it, and a brief word from the Den.

---

## 1. Dashboard Not Loading

**Symptoms:**
- "This site can't be reached" at `localhost:3001`
- The page loads but every panel is empty or shows errors

**Likely Causes:**
- The dashboard process isn't running, or crashed during startup
- You're on the wrong port (it's **3001**, not 3000)
- `node_modules` is missing or stale
- `servers.json` is missing or isn't valid JSON, so every server-aware API call fails

**Remedies:**
1. Check for a running Node process: `tasklist | findstr node`
2. Start it by hand from the repo root with `npm run dev` and read the terminal output
3. Module-not-found errors: run `npm install`. If `better-sqlite3` complains about its native binding, `npm rebuild better-sqlite3`
4. Make sure `servers.json` exists at the repo root (copy `servers.example.json` if not) and parses as JSON
5. If the page is up but stale, hard-refresh (Ctrl+Shift+R)

> **Den Note:** *A lantern that won't light usually just needs its wick trimmed. Check the simplest explanation first.*

---

## 2. Stuck at the Gate (Login Problems)

**Symptoms:**
- Every page goes to **Welcome to the Den** and you don't have the setup code
- The login page shows a "Can't save the session secret" box
- You sign in, the page reloads, and you're back at the login screen

**Likely Causes:**
- First run: the Den has no password yet. The setup code is in the window or log running the Den, and in `data\setup-code.txt`
- Ten wrong setup codes replaced the code; the new one is in the log and the file
- The `data` folder (or `KITSUNEDEN_DATA_DIR`) isn't writable, so the password or secret can't be saved
- `.env` was edited but the dashboard wasn't restarted
- A proxy in front of the Den sets `X-Forwarded-Proto: https` while the browser is actually on plain HTTP, so the cookie comes back `Secure` and the browser drops it

**Remedies:**
1. For the setup code, open `data\setup-code.txt` or scroll the Den's log for the **KitsuneDen first-run setup** banner
2. Make sure the account running the Den can write to `data\`. If `.env` sets `KITSUNEDEN_SESSION_SECRET`, it must be 32+ characters
3. Restart the dashboard after any change to `.env`
4. If you're in production mode and the sign-in loops, reach the Den over HTTPS, or from `localhost` on the host itself. `npm run dev` doesn't set the `Secure` flag, which makes it a quick way to confirm this is the cause

> **Den Note:** *The gate isn't being difficult. It just won't open for a key it can't remember.*

---

## 3. Port Already in Use

**Symptoms:**
- `EADDRINUSE` in the dashboard's output
- `Address already in use` or `FAILED TO BIND TO PORT` in a game server's output
- A server exits immediately after starting

**Likely Causes:**
- A leftover Java process from a previous session is still holding the port
- Two spirits are configured with the same port. The classic: **Minecraft RCON and Palworld RCON both default to 25575**
- A zombie dashboard process is lingering

**Remedies:**
1. Find what's on the port:
   ```
   netstat -ano | findstr :<port>
   ```
2. Identify it from the PID:
   ```
   powershell -Command "Get-CimInstance Win32_Process -Filter 'ProcessId=<PID>' | Select CommandLine"
   ```
3. If it's safely a leftover Java or Node process (not a system service):
   ```
   taskkill /PID <PID> /F
   ```
4. If two servers genuinely want the same port, change one of them in its own config and in `servers.json`
5. Start the server again

This is the most common issue in the Den. When in doubt, look for zombies before starting anything.

> **Den Note:** *Spirits don't always leave when asked. Sometimes you have to show them the door.*

---

## 4. PowerShell Execution Policy Blocking npm

**Symptoms:**
- `UnauthorizedAccess` when running `npm run dev` in PowerShell

**Likely Causes:**
- PowerShell's default policy blocks scripts, and `npm` on Windows is a `.ps1` shim

**Remedies:**

**Permanent fix**: allow locally authored scripts:
```
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
```

**Quick workaround**: skip PowerShell:
```
cmd /c "npm run dev"
```

> **Den Note:** *PowerShell means well. It just doesn't know this particular fox is friendly.*

---

## 5. "Unable to Access Jarfile"

**Symptoms:**
- A manual launch fails at once with `Error: Unable to access jarfile ...`

**Likely Causes:**
- Running `start.bat` or `run.bat` from the wrong directory. The paths inside are relative

**Remedies:**
1. `cd` into the server's own directory first, then run the script
2. From the dashboard, check that `jar` in `servers.json` names a file that really exists in `dir` (it defaults to `server.jar`)

> **Den Note:** *A spirit can't find her jar if you call from another room. Stand in the right doorway.*

---

## 6. Server Won't Start from the Dashboard

**Symptoms:**
- You press Start and nothing seems to happen
- The status flickers to starting and falls back to stopped
- The console shows a short burst of output, then silence

**Likely Causes and Remedies (read the console first, it usually says which):**

| Message or symptom | Fix |
|---|---|
| `spawn java ENOENT` | Java isn't on PATH. Install it, or set `javaPath` to the full path of `java.exe` |
| EULA complaint | Set `eula=true` in `eula.txt` in the server directory |
| `7DaysToDieServer.exe not found` | `dir` points at the wrong folder |
| `enshrouded_server.exe not found` | Run the Update page (SteamCMD) first, or fix `dir` |
| `Cannot start a remote MC server (rconHost=...)` | Expected. Add a `lifecycle` block, or start it on its own machine |
| "Server is already running" | The dashboard already sees a process for her. Check for a zombie (issue 3) |
| Port bind errors | See issue 3 |

> **Den Note:** *When a spirit won't wake, read her journal first. The console almost always explains.*

---

## 7. Status Looks Wrong

**Symptoms:**
- A server is clearly up (players are on) but the dashboard says stopped
- A server is stuck on "starting"

**Likely Causes:**
- The reachability probe has nothing to knock on. Status comes from a TCP connection to one port (Chapter 2, section 4):
  - Minecraft: `gamePort` on `rconHost` or 127.0.0.1
  - 7 Days to Die: `telnetPort`
  - Palworld: `rconPort`, else `restApiPort`
  - Hytale: `gamePort`, else the process list
  - Enshrouded: the process list only
- The port is set wrong in `servers.json`, or the service listens on a different interface
- Palworld and Enshrouded wait up to two minutes after Start for their process to appear before giving up

**Remedies:**
1. Make sure the probe port is set in `servers.json` and matches what the server actually listens on
2. For 7 Days to Die, enable telnet in `serverconfig.xml` and set `telnetPort`
3. For Hytale, make sure `processFilter` matches something in the server's Java command line
4. Probe results are cached for 5 seconds. Give it a moment after a change

> **Den Note:** *If you can't hear a spirit, check that you're knocking on the right door.*

---

## 8. Remote Minecraft Won't Answer

**Symptoms:**
- Players and online lists are empty for a remote server
- `RCON stop failed` or `[RCON Error]` lines in the console
- Start over SSH reports `SSH start command failed (exit ...)`

**Likely Causes:**
- RCON isn't enabled on the remote server, is bound only to 127.0.0.1 there, or a firewall blocks it
- `rconPort` or `rconPassword` in `servers.json` doesn't match the remote `server.properties`
- SSH problems: `ssh.exe` missing from PATH, no key-based login (the dashboard uses `BatchMode=yes`, so it never prompts for a password), or the key file isn't readable by the account the dashboard runs as

**Remedies:**
1. On the remote host, check `server.properties`: `enable-rcon=true`, the right `rcon.port` and `rcon.password`, and nothing restricting RCON to localhost
2. Allow the RCON port through the remote host's firewall for the dashboard's address
3. Test SSH by hand **as the same account the dashboard runs as**:
   ```
   ssh -i <identityFile> -o BatchMode=yes <user>@<host> "powershell -NoProfile -Command Get-Date"
   ```
   If that fails, the dashboard will too. If the Den runs as a service under LocalSystem, the key file must be readable by SYSTEM
4. Read the `[ssh stdout]` and `[ssh stderr]` lines in the console. They are the remote side's own words

> **Den Note:** *Calling across the house only works if someone on the other side is listening, and the door between you is unlocked.*

---

## 9. Mods Not Loading or Crashing

**Symptoms:**
- Server crashes on startup after adding mods
- Server starts but the mods seem absent
- `ClassNotFoundException`, `MixinApplyError`, or loader-specific errors in the console

**Likely Causes:**
- **Wrong loader:** a Fabric mod on a NeoForge server, or the reverse
- **Wrong game version:** built for a different Minecraft version
- **Conflicts:** two mods changing the same system incompatibly
- **Leftovers:** activating a pack adds mods but never removes old ones

**Remedies:**
1. Confirm each mod's loader and version against the server's
2. Remove recent additions one at a time to find the culprit
3. Read the console error; it usually names the mod
4. Clear `mods\` and reactivate the pack to rule out leftovers

> **Den Note:** *A fox wearing a cat's collar will still trip. Every mod must match its loader.*

---

## 10. RCON Connection Refused

**Symptoms:**
- No online players on Minecraft or Palworld
- Palworld kick, ban, save, and broadcast fail
- Remote Minecraft commands fail

**Likely Causes:**
- RCON is disabled in the game's own config
- `rconPort` or `rconPassword` in `servers.json` doesn't match the game's config
- The server hasn't finished starting. Minecraft opens RCON only after its "Done!" line

**Remedies:**
1. Minecraft: in `server.properties`, set `enable-rcon=true`, `rcon.port`, and `rcon.password`
2. Palworld: in `PalWorldSettings.ini`, set `RCONEnabled=True` and `RCONPort`. With no `rconPassword` in `servers.json`, the dashboard uses the ini's `AdminPassword`
3. Make the values in `servers.json` match, then restart the dashboard if you edited the file by hand
4. Restart the game server after changing RCON settings; they're read at boot

> **Den Note:** *RCON is a patient listener, but she only opens her door once the hearth is warm.*

---

## 11. Players Page Empty or Incomplete

**Symptoms:**
- No players listed, or online players missing

**Likely Causes and Remedies:**

| Spirit | Cause | Remedy |
|---|---|---|
| Minecraft | RCON unavailable, so only roster files show | Fix RCON (issue 10) |
| Minecraft (remote) | Roster lists come from the stub `dir` on the dashboard host | Expected; online players and roster actions still go over RCON |
| 7 Days to Die | A server launched elsewhere logs to another path, so new players never reach `dashboard-known-players.json` | Launch through the dashboard, or point her `-logfile` at `logs\7d2d-server.log` |
| 7 Days to Die | No online tags | Set `telnetPort` / `telnetPassword` |
| Palworld | Lists only who is online right now | Expected |
| Enshrouded | List is built from log lines read since the dashboard started | Expected after a dashboard restart |

> **Den Note:** *Some spirits keep a guest book. Others only remember the faces in the room.*

---

## 12. High Memory Usage

**Symptoms:**
- The machine feels sluggish; fans running hard
- The Dashboard page shows a process near its allocation, or the host nearly out of memory

**Likely Causes:**
- Minecraft heap set too high for the machine
- Several servers awake at once, each with its own appetite
- Heavy mods (world generation is usually the hungriest)
- A slow leak in a mod over long uptimes

**Remedies:**
1. `tasklist | findstr java`. Stop any server nobody is using
2. Lower Max in the Memory Allocation card on the server's Status tab (or `maxMemoryGB` in `dashboard-config.json`), then restart it
3. Trim heavy mods
4. Restart the server. Java rarely hands freed heap back to the OS, so a fresh start resets the baseline

> **Den Note:** *Two spirits sharing one hearth will both grow cold. Give each the warmth she needs, but not more than the workshop can provide.*

---

## 13. Antivirus Blocking Startup Scripts

**Symptoms:**
- `.bat` files in `shell:startup` don't run on boot, or get quarantined
- The Den used to auto-start and stopped after an antivirus update

**Likely Causes:**
- Bitdefender (and others) flag batch files launched from startup locations. Known behavior, not a bug

**Remedies:**
- **Use Task Scheduler instead of `shell:startup`.** Settings are in Chapter 4, section 1, and Appendix H

> **Den Note:** *The guardian at the gate is doing her job. Use the side entrance, Task Scheduler, and she won't mind.*

---

## 14. Build or Type Errors

**Symptoms:**
- `npm run build` fails

**Likely Causes:**
- A type error (the build type-checks; `npm run typecheck` shows the same errors faster)
- A dependency update changed type signatures
- A stale `.next` cache

**Remedies:**
1. Run `npm run typecheck`; fix errors from the top, since they cascade
2. If build errors look stale or phantom, clear the cache and rebuild from the repo root:
   ```
   rmdir /s /q .next
   npm run build
   ```
3. Run `npm test` as well; the Vitest suites cover adapters, auth, and reachability

> **Den Note:** *TypeScript is the strictest spirit in the Den, and she's always honest. She just isn't consulted at build time, so go ask her.*

---

## 15. The Calm Reset (Universal Remedy)

When something is broken and you're not sure what, this sequence clears most minor trouble in about two minutes.

1. **Stop the game server** with the Stop button, or end its process
2. **Stop the dashboard** (close its terminal, or stop the scheduled task)
3. **Check for lingering processes:**
   ```
   tasklist | findstr java
   tasklist | findstr node
   ```
4. **Send zombies home**: `taskkill /PID <PID> /F` for each leftover
5. **Restart the dashboard**: `npm run dev`, or `npm run start` after a build
6. **Restart the game server** from its card or its page header
7. **Watch the console for 30 seconds** and confirm a clean start
8. **Breathe.** The Den is patient with those who tend it calmly.

This is the "turn it off and on again" of the Kitsune Den, done with intention. Stale connections, zombie processes, and confused state usually dissolve under a Calm Reset.

> **Den Note:** *Sometimes the kindest thing you can do for a restless spirit is to let her sleep and wake fresh.*

---

*Every problem in the Den has been seen before. Stay calm, read the logs, and trust the process.*
