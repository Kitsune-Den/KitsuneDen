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

*Every system in the Den has a personality: a way it behaves, a way it breaks, a way it wants to be cared for. This chapter introduces each spirit as she truly is.*

---

## 1. The Minecraft Rig

**Nature:** Predictable, structured, and now able to reach across the house.

She is the eldest spirit and the most complete. Locally, she owns her server outright: she spawns the Java process, reads every line it prints, writes commands to its stdin, and knows the moment it says "Done (". Whether the server runs Fabric, NeoForge, or plain vanilla makes little difference to her. Only the launch changes: `jar` mode for a classic `java -jar`, `argfile` mode for NeoForge's `@user_jvm_args.txt @win_args.txt` style.

Her modpack system is her library. `mods-library\` holds the whole collection; `mods\` holds what is active. Activating a pack copies its mods from the library into `mods\`. It adds; it never removes, so clear out `mods\` yourself when you want a clean swap.

She has also learned to tend servers she doesn't own. Give her an `rconHost` and she speaks to a server on another machine over RCON: stopping it, sending commands, managing its roster, and seeing who is online. Give her a `lifecycle` block as well and she can wake that server over SSH. She is careful about it, too. Typed `stop`, `restart`, or `shutdown` commands are refused for remote servers, because a stray word in the console shouldn't leave a world dark with no way to relight it from here.

### Technical Profile

| Trait | Detail |
|---|---|
| Type | `minecraft` |
| Launch | `jar` or `argfile`, using `javaPath` or `java` from PATH |
| Commands | stdin (local), RCON (remote) |
| Online players | RCON `list`, merged with the roster files |
| Roster | `ops.json`, `whitelist.json`, `banned-players.json` (local); RCON commands (remote) |
| Config | `server.properties` |
| Memory | `dashboard-config.json` (default 2 GB min / 4 GB max) |
| Journal | stdout/stderr of the spawned process, 2000 lines in memory |

### Care Tips

- **Never mix Fabric and NeoForge mods.** They are incompatible ecosystems. Keep a separate server directory, and a separate `mods-library\`, for each loader.
- **Enable RCON, even for local servers.** Online players come from RCON `list`. Without it, the Players page shows only the roster files.
- **Keep `dashboard-config.json` honest.** She passes whatever heap size you give her straight to the JVM, even if the machine doesn't have it.
- **Don't hand-tune `user_jvm_args.txt`** in argfile mode. She rewrites it on every start.
- **For remote servers, RCON must be reachable from the dashboard host.** Many servers bind RCON to 127.0.0.1 or sit behind a firewall by default. That is a fix on the server's machine, not in the Den.

---

## 2. The Hytale Cart

**Nature:** Energetic, capable, a little independent.

The Hytale Cart doesn't let the dashboard hold her hand. She is launched through her own start script in her own window, and the dashboard finds her afterward by looking for a `java.exe` whose command line contains `HytaleServer` (or whatever `processFilter` says). She takes no live commands from the console. Stopping her is abrupt: the dashboard terminates that process rather than asking politely.

Her treasures are in `universe\`: worlds, warps, player saves, and NPC memories. The dashboard can show her worlds and warps, toggle the OP group for players in `permissions.json`, and, if the KitsuneCommand mod is installed, manage airdrop settings, loot tables, and drop history straight from the mod's SQLite database.

She updates from the Hytale Launcher. When the launcher has downloaded a newer `HytaleServer.jar` and `Assets.zip`, the Update page copies them into her directory (keeping `.bak` copies of the old ones).

### Technical Profile

| Trait | Detail |
|---|---|
| Type | `hytale` |
| Launch | `startScript` (default `start.bat`) |
| Stop | process terminate |
| Commands | none |
| Config | `config.json` |
| Players | `permissions.json` (OP toggle), names resolved from `universe\players\` |
| Backups | your `backupScript` (PowerShell), listed from `backups\hourly\` and `backups\daily\` |
| Updates | copy from `%APPDATA%\Hytale\install\release\package\game\latest` |
| Journal | the newest `logs\*.log` |

### Care Tips

- **Protect `universe\`.** It is irreplaceable. Make sure the backup script actually runs, and check the Backups page now and then.
- **Save before you stop.** The dashboard's Stop is a hard terminate. Let the server save first if you can.
- **Open the Hytale Launcher before updating.** The Update page copies from the launcher's files; if the launcher hasn't fetched the new version, there's nothing newer to copy.
- **Stop the server before updating.** The update refuses to run while she is awake.

---

## 3. The Seven Days Watch (7 Days to Die)

**Nature:** Vigilant, a little gruff, remembers every face.

The Seven Days Watch speaks through telnet. The dashboard launches `7DaysToDieServer.exe` headless and tells it to write its journal to `logs\7d2d-server.log`, which the console tails every two seconds. Commands typed into the console travel over telnet, and Stop sends a telnet `shutdown` before falling back to a force-kill after 30 seconds.

She remembers. The Players page lists everyone who has authenticated in her log, not just those online now, with their Steam ID and an online or offline tag. Who is online right now comes from a telnet `listplayers`, which runs whether or not the dashboard launched her, so it works for servers run by a service too.

Her admin file (`serveradmin.xml`) is editable from the dashboard: admins and permission levels, the whitelist, the blacklist, and per-command permission levels. Her config editor knows `serverconfig.xml`, including a day/night slider that keeps `DayNightLength` and `DayLightLength` in step.

### Technical Profile

| Trait | Detail |
|---|---|
| Type | `7d2d` |
| Launch | `7DaysToDieServer.exe -configfile=<configFile> -logfile logs\7d2d-server.log -batchmode -nographics -dedicated` |
| Commands | telnet on 127.0.0.1:`telnetPort` (default 8081) |
| Status probe | TCP connect to the telnet port |
| Config | `serverconfig.xml` (or `configFile`) |
| Admin file | `adminFilePath`, else `AdminFileName` from the config, looked for in `dir`, `dir\saves`, and the game's Saves folder (`UserDataFolder\Saves` if set, else `%APPDATA%\7DaysToDie\Saves`) |
| Backups | `saveworld` over telnet if running, then a zip of the world folder, `serveradmin.xml` and the config, in `<dir>\..\backups\7d2d\hourly\` or `daily\` |
| Updates | SteamCMD app 294420 (needs `steamCmdPath`, server stopped), on the installed branch, with `serverconfig.xml` put back afterwards |
| Mods | `modsDir` (default `mods`); uploaded `.zip` files are extracted |
| Memory | managed by the game, not the dashboard |
| Journal | `logs\7d2d-server.log` |

### Care Tips

- **Set `telnetPort` and `telnetPassword`.** Without telnet she can't take commands, can't report who's online, and the status probe has nothing to knock on.
- **She keeps her own guest book.** The dashboard empties `logs\7d2d-server.log` each time it launches her, so players found in the log are saved to `dashboard-known-players.json` in her `dir` first. The list survives restarts. A server started some other way only adds new names if it writes to that same log path.
- **Restart after config changes.** `serverconfig.xml` is read at boot.

---

## 4. The Palworld Ranch

**Nature:** Cheerful, chatty, two ways to reach her.

The Palworld Ranch listens on RCON and, if you enable it, on a REST API. The dashboard prefers RCON and falls back to REST when RCON doesn't answer. Through them she can save the world, broadcast a message, kick or ban a player, and report who is online. Stop is polite at first: an RCON `Shutdown 5`, a wait of up to 30 seconds, and only then a terminate.

The **Promote/Demote** buttons keep a dashboard-side list of trusted players in `palworld-admins.json`. That list colors the Players page; it doesn't grant in-game admin by itself. In-game admin still comes from the server's `AdminPassword`.

She updates through SteamCMD (app id 2394010 unless `steamAppId` says otherwise). The dashboard can also zip her saves on demand.

### Technical Profile

| Trait | Detail |
|---|---|
| Type | `palworld` |
| Launch | `startScript` (default `start_palworld.bat`), else `PalServer-Win64-Shipping-Cmd.exe` |
| Commands | RCON on 127.0.0.1:`rconPort` (default 25575), fire-and-forget |
| REST | 127.0.0.1:`restApiPort` (default 8212), basic auth as `admin` |
| Passwords | `rconPassword` / `restApiPassword`, falling back to `AdminPassword` from `PalWorldSettings.ini` |
| Players | online only (RCON `ShowPlayers`, else REST `/v1/api/players`); bans from `Pal\Saved\SaveGames\banlist.txt` |
| Config | `Pal\Saved\Config\WindowsServer\PalWorldSettings.ini` |
| Backups | zips of `Pal\Saved\SaveGames\` + settings, in `<dir>\..\backups\palworld\hourly\` or `daily\` |
| Journal | the newest log in `Pal\Saved\Logs\` |

### Care Tips

- **Mind the RCON port.** Her default is 25575, the same as Minecraft's. On a shared machine, give one of them a different port.
- **Stop her before updating.** SteamCMD refuses to run while she's awake, and so does the dashboard.
- **The admin password stays on the server.** The Players page never receives `rconPassword`; manage it in `PalWorldSettings.ini` or the Configuration page.

---

## 5. The Enshrouded Hearth

**Nature:** Quiet, self-sufficient, keeps her own counsel.

The Enshrouded Hearth has no RCON and no API. The dashboard can start her, stop her (by terminating `enshrouded_server.exe`; she saves on her own tick), edit her config, back up her `savegame\` folder, and update her through SteamCMD (app id 2278520). It cannot send her commands.

Her player list is a best guess: the dashboard watches her log for connect and disconnect lines and builds an "Online" or "Seen" list from what it has read since it started.

If she has no `enshrouded_server.json` when you press Start, the dashboard writes one with sensible defaults, including three user groups (Admin, Friend, Guest).

### Technical Profile

| Trait | Detail |
|---|---|
| Type | `enshrouded` |
| Launch | `startScript` (default `start_enshrouded.bat`), else `enshrouded_server.exe` |
| Commands | none |
| Status | process list (she has no TCP port to probe) |
| Ports | `gamePort` 15637, UDP: one port for joining and the server browser, written into her config's `queryPort` before each start |
| Config | `enshrouded_server.json` (or `configFile`) |
| Players | best-effort scrape of the in-memory log |
| Backups | zips of `savegame\` in `<dir>\..\backups\enshrouded\hourly\` or `daily\` |
| Journal | the newest `logs\*.log` |

### Care Tips

- **Note the group passwords.** When the dashboard writes a fresh config, the Admin and Friend groups get random passwords, shown once in the start message. Change them in the Configuration page if you'd rather pick your own.
- **Forward UDP, not TCP.** Both her ports are UDP.
- **Expect a thin player list after a dashboard restart.** It only knows what it has read since it woke.

---

## 6. The Unified Lantern

The dashboard is the Den's lantern. One flame, five kinds of spirit, as many servers as `servers.json` lists. It asks each spirit the way she prefers to be asked, and shows only the rooms she actually has.

---

## 7. The Journals (Logs)

Every spirit keeps a journal. The dashboard holds the last **2000 lines per server** in memory and streams them to the Console page as they arrive. Lines from the dashboard itself start with `[Dashboard]`; commands you send are echoed back.

The memory buffer resets when the dashboard restarts. For anything older, go to the files on disk listed in each spirit's profile above. For a remote Minecraft server, the real journal stays on that machine.

---

## 8. The Rituals (Startup)

The spirits wake through rituals, and rituals demand consistency.

- **Keep paths absolute.** A relative path in a scheduled task points nowhere once the working directory changes.
- **Test by hand first.** Run the same command you'll give Task Scheduler, watch for errors, and confirm the login page loads.
- **Check after Windows updates.** Major updates can reset scheduled tasks or tighten security policies.
- **A disrupted ritual confuses a spirit.** If startup fails silently, nobody knows until they try to open the dashboard. "Restart on failure" helps; it is not monitoring.

The settings themselves are in Chapter 4.

---

## 9. The Gateways (Ports)

Each spirit has her doorways, listed in full in Appendix B. Three things to remember:

- The dashboard itself listens on **3001**.
- Minecraft RCON and Palworld RCON both default to **25575**. Two spirits, one door: move one.
- 7 Days to Die, Palworld, and Enshrouded play over **UDP**. Forward them as UDP on the router.

Keep the numbers documented, unique, and sacred.

---

*These are the spirits of the Den. Treat them with understanding, care for them consistently, and they will serve the Operator faithfully.*
