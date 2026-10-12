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

# Chapter 2: Architecture

*Where every file lives, how every system connects, and what each piece does. This is the technical backbone of the Den.*

---

## 1. Directory Layout

KitsuneDen is one repository. The game servers live wherever you installed them; `servers.json` tells the Den where to look.

```
KitsuneDen\
  servers.json               The Den's map: every server and how to reach it (gitignored)
  servers.example.json       Template with Fabric, NeoForge, 7D2D, Palworld, Enshrouded
  .env                       KITSUNEDEN_PASSWORD + KITSUNEDEN_SESSION_SECRET (gitignored)
  .env.example               Template for .env
  next.config.ts             Build settings (see section 2)
  package.json               Scripts: dev / build / start on port 3001, lint, test
  src\
    proxy.ts                 The Gate: session check on every request
    app\
      (panel)\               Every signed-in page, wrapped in the shell (sidebar, toasts, shortcuts)
        page.tsx             Server grid (home)
        instances\[id]\      One server, tabs as URL segments (/instances/<id>/<tab>)
        activity\ manage\ library\ settings\
      login\page.tsx         Login + first-boot setup banner
      globals.css            Theme tokens (dark / light / colour-blind) + shared component classes
      api\                   One folder per route (see Appendix D)
    components\              Tab bodies: Dashboard (status), Console, Config, Players,
                             Mods, Docs, ActivityFeed, plus per-game folders
                             (minecraft\, hytale\, palworld\, enshrouded\)
      instances\            Server cards, controls, card art, live stats hook
      shell\                Page frame, toasts, shortcuts overlay
    contexts\
      ServerContext.tsx      Server list (polled every 5s) + the server in the URL
    lib\
      adapters\
        types.ts             ServerDefinition, ServerAdapter, capabilities
        adapter-registry.ts  Loads servers.json, builds and caches adapters
        reachability.ts      TCP probe that decides the reported status
        minecraft-adapter.ts
        hytale-adapter.ts
        seven-days-adapter.ts
        palworld-adapter.ts
        enshrouded-adapter.ts
      auth.ts                Password check, session signing (Node runtime)
      auth-edge.ts           Session verification for the proxy (Web Crypto)
      remote-exec.ts         Runs PowerShell on a remote Windows host over ssh.exe
      kitsune-db.ts          SQLite access to the KitsuneCommand mod's database (Hytale)
      day-night.ts           7D2D day/night length math for the config slider
    den-operators-manual\    This manual
    __tests__\               Vitest suites
```

If a spirit can't find her files, check her `dir` in `servers.json` first.

---

## 2. The Dashboard

| Property | Value |
|---|---|
| **Framework** | Next.js 16.1.6, App Router |
| **UI** | React 19.2, Tailwind CSS 4, Lucide icons |
| **Language** | TypeScript |
| **Port** | 3001 |
| **Key packages** | `rcon-client`, `better-sqlite3`, `adm-zip`, `react-markdown` + `remark-gfm` |
| **Tests** | Vitest (`npm test`) |
| **Build** | `next build --webpack` |

Two build details worth knowing:

- Type errors fail the build. `npm run typecheck` (`tsc --noEmit`) runs the same check on its own, and CI runs it on every push.
- `better-sqlite3` is listed in `serverExternalPackages`, so Next leaves its native binding alone.

The UI follows PackRelay's panel. The home page is a grid of server cards. Each server has its own page at `/instances/<id>`, and its sections are tabs that live in the URL (`/instances/<id>/console`, `/config`, ...), so they can be bookmarked and shared. `ServerContext` reads the server id from the URL, which is how the older panel components know which server to talk to.

Look and feel come from CSS variables in `globals.css`: plum surfaces from PackRelay, with the Den's lantern orange as the accent. The `den-*` Tailwind colours point at those variables, so everything follows the dark, light and colour-blind themes. The theme is applied by a tiny script in `<head>` before first paint.

---

## 3. The Adapter Pattern

Every game is an adapter class implementing `ServerAdapter` from `types.ts`. The interface covers:

- **Lifecycle**: `getStatus`, `start`, `stop`, `restart`, `sendCommand`
- **Logs**: `getLogs`, `onLog` (a listener the console stream subscribes to)
- **Stats**: `getStats` (process memory, PID, uptime; host CPU and memory)
- **Config**: `getConfig`, `saveConfig`
- **Players**: `getPlayers`
- **Memory**: `getMemoryConfig`, `saveMemoryConfig`

Adapters may add game-specific methods (backups, updates, worlds, admin files). API routes check for them by type before calling.

### The registry

`adapter-registry.ts` reads `servers.json` from the repo root once, builds one adapter per entry, and caches both on `globalThis` so they survive hot reloads in dev. The `/api/servers` routes add, update, and remove entries; each one rewrites `servers.json` and rebuilds the affected adapter.

**If you edit `servers.json` by hand, restart the dashboard.** The cached copy will not notice your changes otherwise.

### Capabilities

Each adapter declares what it can do. A server's page hides the tabs it can't use.

| Capability | MC | Hytale | 7D2D | Palworld | Enshrouded |
|---|---|---|---|---|---|
| `hasRcon` | yes | | | yes | |
| `hasMods` | yes | yes | yes | | |
| `hasModPacks` | yes | | | | |
| `hasBackups` | local only | yes | | yes | yes |
| `hasWorlds` | | yes | | | |
| `hasWarps` | | yes | | | |
| `hasServerProperties` | yes | | yes | | |
| `hasJsonConfig` | | yes | | yes | yes |
| `hasKitsuneCommand` | | if the mod's DB exists | | | |
| `hasRestApi` | | | | yes | |
| `hasSteamUpdate` | | | | yes | yes |
| `hasLauncherUpdate` | | yes | | | |

### Server-aware routes

Most API routes take `?server=<id>`. If it's missing, they fall back to the **first server in `servers.json`**. There is no hardcoded default id.

```
GET  /api/stats?server=fabric
POST /api/server?server=kitsune-den-7d2d     { "action": "restart" }
POST /api/console?server=neoforge            (opens the live log stream)
```

`ServerContext.tsx` holds the selected server id for the whole UI. Switching servers changes the id, and every panel refetches for the new one.

---

## 4. How the Den Knows a Spirit Is Awake

Adapters track their own state (`stopped`, `starting`, `running`, `stopping`), but that state only knows about processes the dashboard launched itself. Servers run by nssm, a service, or a launcher on another box would always look asleep.

So `/api/servers` and `/api/server` ask `reachability.ts` instead. It opens a TCP connection to one port per server:

| Type | Probe target |
|---|---|
| `minecraft` | `rconHost` (or 127.0.0.1) : `gamePort` |
| `hytale` | 127.0.0.1 : `gamePort` |
| `7d2d` | 127.0.0.1 : `telnetPort` (the game port is UDP) |
| `palworld` | 127.0.0.1 : `rconPort`, else `restApiPort` |
| `enshrouded` | none (no TCP listener at all) |

The probe times out after 1.5 seconds and its answer is cached for 5 seconds, so dashboard polling doesn't hammer anyone's ports.

How the answer becomes a status:

1. If the adapter says `starting` or `stopping`, that wins.
2. If the probe connects, the server is `running`.
3. **Hytale, Palworld, Enshrouded:** otherwise, look for the server's process. Found means `running`, missing means `stopped`.
4. **Minecraft, 7D2D:** a refused connection means `stopped`. A timeout or unreachable host is inconclusive, so the adapter's own state stands.

---

## 5. Minecraft Across the House (Remote Servers)

A Minecraft entry can point at a server on another machine. Two optional fields in `servers.json` make that work.

### `rconHost`

The host that owns the RCON port. It defaults to `127.0.0.1`. When set, the dashboard sends RCON there and probes the game port there too. With `rconHost` set:

| Action | What happens |
|---|---|
| Status | Reachability probe against `rconHost:gamePort` |
| Stop | RCON `stop` (the server saves and exits on its own host) |
| Start / Restart | Refused, unless a `lifecycle` block is configured |
| Console commands | Sent over RCON; the reply lands in the console. `stop`, `restart`, and `shutdown` are refused (with or without a leading `/`) so a typo can't strand the server |
| Online players | RCON `list` |
| Whitelist / op / ban | Sent as RCON commands (`whitelist add`, `op`, `deop`, `ban`, `pardon`, ...) so they land on the real server |

The remote server must have RCON enabled, listening on an interface the dashboard can reach (not only 127.0.0.1), and allowed through its firewall.

The entry still needs a `dir`. On the dashboard host it can be a stub folder; roster files, `server.properties`, and `usercache.json` are read from there, so the Configuration page and the roster lists will reflect the stub, not the remote server. Both pages say so with a warning, the Players page offers both directions for each roster action (OP / De-OP, Whitelist / Un-WL, Ban / Pardon) instead of a toggle, and the memory card and Backups page are hidden.

### `lifecycle` (SSH start and restart)

Add a `lifecycle` block and the dashboard can wake a remote server too:

```json
"lifecycle": {
  "kind": "ssh",
  "host": "192.168.1.50",
  "port": 22,
  "user": "mcadmin",
  "identityFile": "C:\\keys\\kitsuneden_ed25519",
  "startCommand": "Start-Process -FilePath 'C:\\Servers\\Ragnarok\\run.bat' -WorkingDirectory 'C:\\Servers\\Ragnarok'"
}
```

| Field | Meaning |
|---|---|
| `kind` | Must be `"ssh"` (the only transport so far) |
| `host`, `user` | SSH target |
| `port` | Optional, defaults to 22 |
| `identityFile` | Absolute path, on the dashboard host, to the private key |
| `startCommand` | PowerShell to run on the remote host to bring the server up |
| `stopCommand` | Optional. Run over SSH as the fallback when RCON `stop` fails (RCON unreachable, JVM still up) |

How it runs (`remote-exec.ts`):

- Shells out to the local `ssh` client with `BatchMode=yes` (key auth only, never a password prompt) and `StrictHostKeyChecking=accept-new`.
- Sends the command as `powershell -NoProfile -EncodedCommand <base64>`. The base64 is of UTF-16LE text, which sidesteps cmd.exe quoting on the remote side.
- Gives up after 30 seconds. stdout and stderr are copied into the console.

**Start** dispatches the command and leaves the status alone; the reachability probe flips it to `running` once the port binds (modded NeoForge can take 30 to 180 seconds). **Restart** sends RCON `stop`, waits 15 seconds for the JVM to let go of its ports, then runs the start command. If the RCON stop fails, it tries the start anyway.

**Treat `servers.json` like a sudoers file.** `startCommand` is arbitrary PowerShell that runs with the SSH user's rights on the remote machine. Anyone who can write that file can run commands there. The dashboard refuses `lifecycle` in `POST`/`PUT /api/servers` (a `400`), and `GET /api/servers` leaves it out along with every password, reporting only which secrets are set.

---

## 6. The Gate (Auth)

`src/proxy.ts` runs on every request except `/login`, `/api/auth/*`, `/favicon.ico`, and Next's static assets.

| Situation | HTML pages | API routes |
|---|---|---|
| `KITSUNEDEN_PASSWORD` unset | redirect to `/login?setup=1` | `503` |
| `KITSUNEDEN_SESSION_SECRET` missing or under 32 chars | redirect to `/login?setup=1` | `503` |
| No valid session | redirect to `/login?next=<path>` | `401` |
| Valid session | through | through |

The session cookie is `kitsuneden_session`: a small payload (`{ v: 1, iat }`) plus an HMAC-SHA256 signature, valid for 7 days. It is `HttpOnly`, `SameSite=Lax`, and `Secure` only when the request arrived over HTTPS (directly, or via a proxy that sets `X-Forwarded-Proto: https`). `auth.ts` signs it at login (Node crypto); `auth-edge.ts` verifies it in the proxy (Web Crypto). Keep their constants in sync.

The password check is constant-time. There is no rate limit on `/api/auth/login` yet, so keep the Den behind a tailnet, Cloudflare Access, or your LAN rather than on a bare public IP.

---

## 7. The Den Theme

The Den's look lives in `src/app/globals.css`, as Tailwind 4 `@theme` tokens named `--color-den-*`. Components use them as utility classes (`bg-den-surface`, `text-den-amber`, `border-den-border`, and so on).

The palette is a deep night blue with warm accents: layered background and surface tones, three text strengths (`den-text`, `den-text-muted`, `den-text-dim`), and accent families for amber, cyan, green, red, purple, and lantern orange. `globals.css` is the source of truth; read it there rather than copying hex values into other docs.

It is always night in the workshop. There is no light theme.

---

## 8. Configuration Files

### Den-level

- **`servers.json`**: every server, its type, directory, ports, and credentials. Field reference in Appendix F. The `dashboard.port` key is not read by anything; the port comes from `package.json`.
- **`.env`**: `KITSUNEDEN_PASSWORD` and `KITSUNEDEN_SESSION_SECRET`. Next.js loads it automatically.

### Per game

| Game | Files the Den reads or writes (relative to `dir`) |
|---|---|
| Minecraft | `server.properties`, `ops.json`, `whitelist.json`, `banned-players.json`, `usercache.json`, `dashboard-config.json`, `modpacks.json`, `mods\`, `mods-library\`, `user_jvm_args.txt` (argfile mode) |
| 7 Days to Die | `serverconfig.xml` (or `configFile`), `serveradmin.xml`, `logs\7d2d-server.log`, the mods folder (`modsDir`, default `mods`), `Data\Worlds\` |
| Hytale | `config.json`, `permissions.json`, `whitelist.json`, `bans.json`, `universe\`, `logs\`, `backups\hourly\` + `backups\daily\` |
| Palworld | `Pal\Saved\Config\WindowsServer\PalWorldSettings.ini`, `Pal\Saved\SaveGames\`, `palworld-admins.json` |
| Enshrouded | `enshrouded_server.json` (or `configFile`), `savegame\`, `logs\` |

Every config save writes a `.bak` of the previous file first.

**`dashboard-config.json`** (Minecraft only) holds JVM heap size:

- `minMemoryGB`: default 2
- `maxMemoryGB`: default 4

**`modpacks.json`** (Minecraft only) holds pack definitions (id, name, description, mod filenames) and the active pack id.

---

## 9. Process Management

| Spirit | Start | Stop |
|---|---|---|
| Minecraft (local) | spawns `java` (or `javaPath`) as a child process in `dir` | writes `stop` to stdin; force-kills after 30s |
| Minecraft (remote) | SSH `startCommand`, if `lifecycle` is set | RCON `stop`; SSH `stopCommand` if RCON fails and one is set |
| Hytale | runs `startScript` (default `start.bat`) in a new window | **terminates** the `java.exe` whose command line contains `processFilter` (default `HytaleServer`) |
| 7 Days to Die | spawns `7DaysToDieServer.exe` with `-configfile`, `-logfile logs\7d2d-server.log`, `-batchmode -nographics -dedicated` | telnet `shutdown`; force-kills after 30s. If the dashboard didn't launch her, it only sends the telnet `shutdown` |
| Palworld | runs `startScript` (default `start_palworld.bat`), else `PalServer-Win64-Shipping-Cmd.exe` directly | RCON `Shutdown 5`, waits up to 30s, then terminates the process |
| Enshrouded | writes a default config if none exists, then runs `startScript` (default `start_enshrouded.bat`), else `enshrouded_server.exe` | terminates the process |

Minecraft has two launch modes:

| `launchMode` | Command | Memory flags |
|---|---|---|
| `"jar"` | `java <G1 tuning flags> -jar <jar> nogui` (jar defaults to `server.jar`) | `-Xms` / `-Xmx` on the command line |
| `"argfile"` | `java @<argFiles...> nogui` | written into `user_jvm_args.txt` |

In argfile mode the dashboard **rewrites `user_jvm_args.txt` on every start**. Anything you add to that file by hand will be replaced.

---

## 10. Health Checks

- `GET /api/servers`: every server definition plus its resolved `status` and `capabilities`. One call tells you whether the Den is alive and how each spirit is doing.
- `GET /api/server?server=<id>`: status for one server.
- `GET /api/stats?server=<id>`: process and host stats, plus game-specific server info where the adapter provides it.

All three need a valid session cookie.

---

## 11. The Gateways

The full port table, with defaults and notes, is Appendix B. The one rule: no two services on the same machine may share a port. If a spirit won't start, check the gateways first.

---

*Architecture is the skeleton. The spirits that live within it are described in the next chapter.*
