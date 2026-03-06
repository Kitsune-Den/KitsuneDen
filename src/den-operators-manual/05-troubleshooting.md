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

Every workshop has its creaky floorboards. The Den is no different — ports get tangled, processes linger, and occasionally a spirit refuses to wake. This chapter covers the problems you will actually encounter, with clear remedies for each.

Every issue follows the same format: what you see, why it happened, how to fix it, and a brief observation from the Den.

---

## 1. Dashboard Not Loading

**Symptoms:**
- Browser shows a blank page at `localhost:3000`
- "Cannot connect" or "This site can't be reached" error
- `localhost` refuses the connection entirely

**Likely Causes:**
- The dashboard process isn't running
- The process started but crashed during initialization
- Wrong port (you're checking the wrong service)
- Missing `node_modules` — dependencies were never installed or got corrupted

**Remedies:**
1. Check if the process is running: open a terminal and run `tasklist | findstr node`
2. If nothing shows up, the dashboard isn't running. Start it manually:
   - `cd F:\MinecraftServer\dashboard && npm run dev`
3. Watch the terminal output for errors. If you see module-not-found errors, run `npm install` in the dashboard directory
4. If the process is running but the page is blank, try a hard refresh (Ctrl+Shift+R) or check a different browser

> **Den Note:** *A lantern that won't light usually just needs its wick trimmed. Check the simplest explanation first.*

---

## 2. Port Already in Use

**Symptoms:**
- `EADDRINUSE` error in the Node.js console
- `Address already in use` or `FAILED TO BIND TO PORT` in the Java server output
- Dashboard or server exits immediately after starting

**Likely Causes:**
- A leftover Java process from a previous server session is still holding the port
- Another service on the machine claimed the port
- A zombie dashboard process is lingering in the background

**Remedies:**
1. Find what's on the port:
   ```
   netstat -ano | findstr :<port>
   ```
   Replace `<port>` with the number (e.g., 3000, 25565).

2. Identify the process using the PID from the output:
   ```
   powershell -Command "Get-CimInstance Win32_Process -Filter 'ProcessId=<PID>' | Select CommandLine"
   ```

3. If it's safe to kill (a leftover Java or Node process, not a system service):
   ```
   taskkill /PID <PID> /F
   ```

4. Now restart the dashboard or server.

This is the **most common issue in the Den**. Leftover Java processes from previous server runs are the usual culprit. When in doubt, check for zombies before starting anything.

> **Den Note:** *Spirits don't always leave when asked. Sometimes you have to show them the door.*

---

## 3. PowerShell Execution Policy Blocking npm

**Symptoms:**
- `UnauthorizedAccess` error when running `npm run dev` in PowerShell
- The command is recognized but PowerShell refuses to execute the underlying script

**Likely Causes:**
- PowerShell's default execution policy (`Restricted`) blocks all script execution, and `npm run dev` invokes a `.ps1` script internally

**Remedies:**

**Permanent fix** — allow locally-authored scripts to run:
```
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
```

**Quick workaround** — bypass PowerShell entirely:
```
cmd /c "npm run dev"
```

Either approach works. The permanent fix is cleaner if you use PowerShell regularly.

> **Den Note:** *PowerShell means well. It just doesn't know this particular fox is friendly.*

---

## 4. "Unable to Access Jarfile" Error

**Symptoms:**
- Server startup fails immediately with a message like `Error: Unable to access jarfile server.jar`
- No Java process appears in the task list

**Likely Causes:**
- Running `start.bat` or `run.bat` from the wrong directory. The jar paths inside those scripts are relative, so they only work when your working directory is the server's root.

**Remedies:**
1. Make sure you `cd` into the correct server directory first:
   - Fabric: `cd F:\MinecraftServer\server`
   - NeoForge: `cd F:\MinecraftServer\server-neoforge`
2. Then run the startup script from that directory
3. If starting via the dashboard, this isn't an issue — the dashboard sets the working directory automatically

> **Den Note:** *A spirit can't find her jar if you call from another room. Stand in the right doorway.*

---

## 5. Server Won't Start from Dashboard

**Symptoms:**
- Click the Start button in the ServerControl panel — nothing happens
- The process starts but exits immediately (the status dot flickers and goes red)
- Console shows a brief flash of output then goes silent

**Likely Causes:**
- Java is not on the system PATH
- The port the server needs is already in use (see issue #2)
- The EULA hasn't been accepted
- Corrupted server files or missing jar

**Remedies:**
1. **Check the console first** — it will usually tell you exactly what went wrong
2. Verify Java is accessible: open a terminal and run `java -version`. If it's not found, install Java or add it to your PATH
3. Check `eula.txt` in the server directory — it must contain `eula=true`
4. Check that the server's port isn't already occupied (see issue #2)
5. If the jar file is missing or corrupted, re-download it from the mod loader's official source

> **Den Note:** *When a spirit won't wake, read her journal first. The console almost always explains.*

---

## 6. Mods Not Loading or Crashing

**Symptoms:**
- Server crashes on startup after adding new mods
- Server starts but mods appear inactive (items/blocks/features missing)
- Console shows `ClassNotFoundException`, `MixinApplyError`, or loader-specific errors

**Likely Causes:**
- **Wrong loader:** A Fabric mod placed in the NeoForge server (or vice versa)
- **Wrong Minecraft version:** The mod was built for a different MC version than the server runs
- **Mod conflicts:** Two mods that modify the same system in incompatible ways

**Remedies:**
1. Check the mod's page or filename — confirm it's for the correct loader (Fabric or NeoForge) AND the correct Minecraft version
2. Remove recently added mods one at a time to isolate the culprit
3. Read the console error output carefully — it usually names the problematic mod
4. If using a mod pack, try reverting to the previous pack to confirm the issue is mod-related

> **Den Note:** *A fox wearing a cat's collar will still trip. Every mod must match its loader.*

---

## 7. RCON Connection Refused

**Symptoms:**
- Dashboard features that rely on RCON don't respond
- Console shows RCON-related connection errors
- Player commands or server queries fail silently

**Likely Causes:**
- RCON is disabled in `server.properties` (`enable-rcon=false`)
- The RCON port or password in `.env.local` doesn't match what's in `server.properties`
- The server hasn't fully started yet — RCON only becomes available after the "Done!" message

**Remedies:**
1. Open `server.properties` in the server directory and verify:
   ```
   enable-rcon=true
   rcon.port=25575       # (or 25576 for NeoForge)
   rcon.password=<your-password>
   ```
2. Check that `.env.local` in `F:\MinecraftServer\dashboard\` has matching values
3. Wait for the server to fully start — look for the "Done!" line in the console before testing RCON
4. Restart the server if you changed any RCON settings (they're read at startup)

> **Den Note:** *RCON is a patient listener, but she only opens her door once the hearth is warm.*

---

## 8. High Memory Usage

**Symptoms:**
- System feels sluggish, fans running hard
- Java process consuming far more RAM than expected
- Dashboard's ServerStats shows memory near the maximum allocation
- Windows itself starts swapping to disk

**Likely Causes:**
- Memory allocation set too high for the machine's available RAM
- Too many heavy mods loaded simultaneously
- Both Fabric AND NeoForge servers running at the same time (each consumes its own allocation)
- Memory leak in a mod (rare but possible over long uptimes)

**Remedies:**
1. Check if both servers are running: `tasklist | findstr java` — if you see two Java processes, consider stopping the one you don't need
2. Reduce the max memory allocation via the Memory dropdowns in the ServerControl panel
3. Remove heavy mods (world generation mods and shader-adjacent mods tend to be the hungriest)
4. Restart the server — Java doesn't return freed heap memory to the OS, but a fresh start resets the baseline

> **Den Note:** *Two spirits sharing one hearth will both grow cold. Give each the warmth she needs, but not more than the workshop can provide.*

---

## 9. Bitdefender Blocking Startup Scripts

**Symptoms:**
- `.bat` files placed in `shell:startup` don't execute on boot
- Files get quarantined or flagged by Bitdefender
- The dashboards used to auto-start but stopped after a Bitdefender update

**Likely Causes:**
- Bitdefender's behavioral analysis flags batch file execution from startup locations as potentially suspicious. This is a known behavior, not a bug.

**Remedies:**
- **Use Task Scheduler instead of `shell:startup`.** This is the standard approach for the Den. Task Scheduler jobs are not flagged the same way.
- See the Task Scheduler settings in Section 1 of this chapter (or Appendix H) for the recommended configuration

> **Den Note:** *The guardian at the gate is doing her job. Use the side entrance — Task Scheduler — and she won't mind.*

---

## 10. Dashboard Build Fails (TypeScript Errors)

**Symptoms:**
- `npx next build` reports type errors
- The dashboard won't compile or deploy
- Red error output with file paths and line numbers

**Likely Causes:**
- Recent code changes introduced type mismatches or missing imports
- A dependency update changed type signatures
- Stale build cache from a previous version

**Remedies:**
1. Read the build output carefully — TypeScript errors are specific. They tell you the file, the line, and exactly what's wrong
2. Fix the reported issues one at a time (they often cascade, so fixing the first may resolve several others)
3. If the errors seem stale or phantom, clear the build cache and rebuild:
   ```
   cd F:\MinecraftServer\dashboard
   rmdir /s /q .next
   npx next build
   ```
4. If a dependency update caused the issue, check `package.json` for version mismatches

> **Den Note:** *TypeScript is the strictest spirit in the Den, but she's always honest. Read what she says — she's never wrong about what's broken.*

---

## 11. The Calm Reset (Universal Remedy)

When something is broken and you're not sure what, this sequence resolves most minor issues. It takes about two minutes and resets the Den to a known-good state.

1. **Stop the game server** — via the dashboard's Stop button, or kill the Java process directly
2. **Stop the dashboard** — close the terminal window running it
3. **Check for lingering processes:**
   ```
   tasklist | findstr java
   tasklist | findstr node
   ```
4. **Kill any zombies** — use `taskkill /PID <PID> /F` for each leftover process
5. **Restart the dashboard** — run `npm run dev`
6. **Restart the game server** — via the dashboard's Start button
7. **Watch the console for 30 seconds** — confirm the server starts cleanly and no errors appear
8. **Breathe.** The Den is patient with those who tend it calmly.

This is the "turn it off and on again" of the Kitsune Den, but done with intention. Most minor issues — stale connections, zombie processes, confused state — dissolve under a Calm Reset.

> **Den Note:** *Sometimes the kindest thing you can do for a restless spirit is to let her sleep and wake fresh.*

---

*Every problem in the Den has been seen before. The remedies here are tested, the advice is practical, and the workshop always recovers. Stay calm, read the logs, and trust the process.*
