# Game recipes

A recipe is everything the Den knows about running one game's server: where the files come from, how it launches, which ports it opens, how it's controlled and stopped, where the world lives, how players join, and what we haven't solved yet.

The idea comes from PackRelay's game catalogue. The data lives in [`src/lib/recipes.ts`](../src/lib/recipes.ts), and [`src/__tests__/recipes.test.ts`](../src/__tests__/recipes.test.ts) keeps each recipe in step with its adapter.

## One object per game

PackRelay keeps a game in about eight tables: install, catalogue, notes, starter defaults, connect info, ports, platform support and port sync. Its own code comments describe the bugs that caused. The best-known one is 7D2D's query port, which was modelled in two places and missing from the two that mattered, so the firewall hint was a port short.

The Den does it differently:

- **A game is one object.** Form defaults, firewall hints and the rest are computed from it. `recipeDefaults()` builds the Add Server pre-fill from `defaults` plus the port list, so each port number is written once.
- **Offsets, not literals.** 7D2D's query port is `gamePort + 2`, so it follows you if you move the game port.
- **The recipe can't drift from the adapter.** Tests compare each recipe's claims (console, Steam install, launcher update, backups, Steam app id, Enshrouded's generated ports) with what the adapter actually does.
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
| 7 Days to Die | verified | SteamCMD 294420 (Den doesn't run it) | telnet | none | 26900 tcp+udp, query +2 udp / telnet 8081 |
| Hytale | verified | Hytale launcher | none | script | 5520 udp |
| Palworld | verified | SteamCMD 2394010 | RCON + REST | zip | 8211 udp / RCON 25575, REST 8212 |
| Enshrouded | experimental | SteamCMD 2278520 | none | zip | 15637 + 15638 udp (disputed) |

## What writing them turned up

Putting each game in one place showed some problems:

1. **Enshrouded's ports may be wrong.** The Den writes `gamePort` 15637 and `queryPort` 15638. PackRelay measured a single socket on 15637. If PackRelay is right, 15638 is never bound. This is why Enshrouded is `experimental`. Check a current build before changing anything.
2. **7D2D has no backups.** The world sits in `%APPDATA%\7DaysToDie\Saves`, outside the server folder. PackRelay launches with `-UserDataFolder=<instance>/UserData` so the world can be backed up with the server. Switching an existing server over would move its world, so it needs a migration, not a quiet flag change.
3. **7D2D's query port (game + 2, UDP) isn't modelled.** Anyone forwarding only 26900 won't show up in the server browser.
4. **7D2D has no SteamCMD update**, even though the app installs anonymously and Palworld and Enshrouded already have one.
5. **Palworld and Minecraft both default RCON to 25575.** The example config gets around it with 25577, but nothing warns you if they clash.
6. **Hytale's live entry has no `gamePort`**, so the Den doesn't know the server is on UDP 5520.

## Next steps

Each of these can be its own PR:

1. ~~**Add Server form reads recipes.**~~ Done: the form pre-fills from `recipeDefaults()`, lists its games from `RECIPES`, and builds port hints (protocol, default, forward or keep private, notes) from the recipe in both the Add and Edit forms.
2. ~~**Adapters read recipes.**~~ Done: adapter fallbacks (ports, Steam app ids, start scripts, config files, the Minecraft jar, Hytale's process filter) come from `recipeDefault()`, and a test fails if an adapter hardcodes a port or app id again. Process names stay in the adapters: they're for detecting a running server, which recipes don't model.
3. **Networking card.** List each server's public ports with protocol from `ports`, and flag clashes between servers, such as the shared RCON default.
4. **Recipe card in the picker.** When adding a server, show the tier, install method, connect sentence and gaps, the way PackRelay's Templates grid does.
5. **Fix the gaps above,** starting with the Enshrouded port check and 7D2D backups.
6. **New games are a recipe plus an adapter.** Valheim, V Rising and Project Zomboid are the obvious next ones, and PackRelay has already measured their ports and quirks.
