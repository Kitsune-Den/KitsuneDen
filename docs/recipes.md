# Game recipes

A recipe is everything the Den knows about running one game's server: where the files come from, how it launches, which ports it opens, how it's controlled and stopped, where the world lives, how players join, and what we haven't solved yet.

The idea comes from PackRelay's game catalogue. The data lives in [`src/lib/recipes.ts`](../src/lib/recipes.ts), and [`src/__tests__/recipes.test.ts`](../src/__tests__/recipes.test.ts) keeps each recipe in step with its adapter.

## One object per game

PackRelay keeps a game in about eight tables: install, catalogue, notes, starter defaults, connect info, ports, platform support and port sync. Its own code comments describe the bugs that caused. The best-known one is 7D2D's query port, which was modelled in two places and missing from the two that mattered, so the firewall hint was a port short.

The Den does it differently:

- **A game is one object.** Form defaults, firewall hints and the rest are computed from it. `recipeDefaults()` builds the Add Server pre-fill from `defaults` plus the port list, so each port number is written once.
- **Offsets, not literals.** 7D2D's query port is `gamePort + 2`, so it follows you if you move the game port.
- **The recipe can't drift from the adapter.** Tests compare each recipe's claims (console, Steam install, launcher update, backups, Steam app id, Enshrouded's generated port) with what the adapter actually does.
- **Gaps get named.** `tier` says what we've watched work, not what we offer. `gaps` lists the known holes. An empty list means we don't know of any. It doesn't promise there are none.

## Shape

| Field | What it holds |
|---|---|
| `tier` / `evidence` | `verified` or `experimental`, plus what was actually seen working |
| `platforms` | OSes the dedicated server ships for |
| `install` | `steamcmd` (app id, anonymous, whether the Den runs it), `launcher` (copied from the game's launcher), or `manual` |
| `launch` | exe, script or java, the entry file and its fallback |
| `ports` | servers.json field, purpose, protocol, default or offset, whether players need it forwarded |
| `control` | console (rcon/telnet/none), how Stop works, where the player list comes from |
| `saves` | where the world lives and how it's backed up (zip/script/none) |
| `config` | the files the game reads, with their formats |
| `connect` | one sentence on how a player joins |
| `defaults` | non-port fields the Add Server form pre-fills |
| `gaps` | known problems, by name |

## The first five

| Game | Tier | Install | Console | Backups | Ports (public / private) |
|---|---|---|---|---|---|
| Minecraft | verified | manual | RCON | zip (local only) | 25565 tcp / RCON 25575 |
| 7 Days to Die | verified | SteamCMD 294420 (keeps branch and config) | telnet | zip | 26900 tcp+udp, query +2 udp / telnet 8081 |
| Hytale | verified | Hytale launcher | none | script | 5520 udp |
| Palworld | verified | SteamCMD 2394010 | RCON + REST | zip | 8211 udp / RCON 25575, REST 8212 |
| Enshrouded | experimental | SteamCMD 2278520 | none | zip | 15637 udp |
| Valheim | experimental | SteamCMD 896660 | none | zip | 2456 udp, query +1 udp |
| V Rising | experimental | SteamCMD 1829350 | RCON | zip | 9876 udp, query +1 udp / RCON 25575 |
| Project Zomboid | experimental | SteamCMD 380870 | RCON | zip | 16261 udp, +1 udp / RCON 27015 |

## What writing them turned up

Putting each game in one place showed some problems:

1. ~~**Enshrouded's ports may be wrong.**~~ Fixed. Current Enshrouded listens on one UDP port, its config's `queryPort` (Keen's own example config has no `gamePort`, and PackRelay measured it on a live server). The Den used to write `queryPort` 15638 while showing players 15637. Server setup's Game Port is now written into `queryPort` before every start, and the start message says when that moves the port. Enshrouded stays `experimental` until the fix has been run through the Den on a live server.
2. ~~**7D2D has no backups.**~~ Fixed without moving any world. The Den finds the save where the game keeps it (`UserDataFolder\Saves` if set, else `%APPDATA%\7DaysToDie\Saves`, then the world folder holding this server's `GameName`, which also covers random-gen worlds). It sends `saveworld` to a running server, copies the world with plain reads so files the game holds open still copy, and zips the copy with `serveradmin.xml` and the config. Random-gen map files (`GeneratedWorlds`) are left out; that's a named gap in the recipe.
3. ~~**7D2D's query port (game + 2, UDP) isn't modelled.**~~ The recipe models it and the Networking card shows it.
4. ~~**7D2D has no SteamCMD update.**~~ Fixed. It stays on the installed branch (the `betakey` in `steamapps\appmanifest_294420.acf`, passed back as `-beta`) and puts `serverconfig.xml` back afterwards, since `validate` resets it to the stock copy. PackRelay lost a server's port to that. The Update tab is now one `SteamUpdateManager` for Palworld, Enshrouded and 7D2D, and shows the branch.
5. ~~**Palworld and Minecraft both default RCON to 25575.**~~ The Networking card now warns when they clash on one machine.
6. **Hytale's live entry has no `gamePort`**, so the Den doesn't know the server is on UDP 5520.

## Next steps

Each of these can be its own PR:

1. ~~**Add Server form reads recipes.**~~ Done: the form pre-fills from `recipeDefaults()`, lists its games from `RECIPES`, and builds port hints (protocol, default, forward or keep private, notes) from the recipe in both the Add and Edit forms.
2. ~~**Adapters read recipes.**~~ Done: adapter fallbacks (ports, Steam app ids, start scripts, config files, the Minecraft jar, Hytale's process filter) come from `recipeDefault()`, and a test fails if an adapter hardcodes a port or app id again. Process names stay in the adapters: they're for detecting a running server, which recipes don't model.
3. ~~**Networking card.**~~ Done: each server's Status tab lists its ports (protocol, purpose, forward or keep private, where the number came from) and warns when one collides with another server on the same machine. The logic is in `src/lib/networking.ts`.
4. ~~**Recipe card in the picker.**~~ Done: Add Server picks the game from tiles (experimental games are marked), with a card showing the tier and its evidence, install, console, stop, backups, ports to forward, how players join and the known gaps.
5. **Fix the gaps above.** Enshrouded's ports, 7D2D backups and 7D2D updates are done. Hytale's missing `gamePort` is a one-line `servers.json` change.
6. **New games are a recipe plus an adapter.** Valheim is the first: its settings live in `kitsuneden-valheim.json` (Config tab) and become launch flags in the order Valheim needs, following what PackRelay measured. V Rising is the second: its real settings file is kept, the Den only writing the ports and RCON before each start, and RCON `shutdown` gives it a clean stop. Project Zomboid is the third: the bundled Java run directly with the game's own JVM line, `servertest.ini` kept and patched in place, RCON `quit`, `save` and `players`. Valheim, V Rising and Project Zomboid share `src/lib/adapters/exe-server.ts` (finding the process by path, following the log, zip-a-copy backups), and all three are in the Add Server autofill.
