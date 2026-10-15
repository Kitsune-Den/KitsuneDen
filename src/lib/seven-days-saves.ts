/**
 * Where a 7 Days to Die server keeps its world, so the Den can back it up
 * without moving it.
 *
 * The game's rules (3.x serverconfig.xml): everything user-side lives under
 * UserDataFolder when that property is set, else under %APPDATA%\7DaysToDie.
 * Saves sit in <that>\Saves, one folder per world, then one per game:
 *
 *   Saves\<world>\<GameName>\   main.ttw, Region\, Player\, players.xml ...
 *   Saves\serveradmin.xml       (AdminFileName is relative to Saves)
 *
 * The world folder is NOT always GameWorld: a random-gen world is saved under
 * its generated name ("East Rumoxe Territory"), while GameWorld says "RWG".
 */

import fs from "fs";
import path from "path";

/** The GameName 7D2D uses when serverconfig.xml doesn't set one. */
export const DEFAULT_GAME_NAME = "My Game";

/** The Saves folder for a server, or null when there's nowhere to look. */
export function savesDir(
  serverDir: string,
  config: Record<string, string>,
  env: Record<string, string | undefined> = process.env
): string | null {
  const userData = config.UserDataFolder?.trim();
  if (userData) return path.join(path.resolve(serverDir, userData), "Saves");
  return env.APPDATA ? path.join(env.APPDATA, "7DaysToDie", "Saves") : null;
}

export interface WorldSave {
  /** The world folder's name: GameWorld, or a random-gen world's generated name. */
  world: string;
  gameName: string;
  /** Saves\<world>\<GameName> */
  dir: string;
}

function isDir(p: string): boolean {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

/** When the game last wrote this save: main.ttw if it's there, else the folder. */
function lastWritten(dir: string): number {
  for (const p of [path.join(dir, "main.ttw"), dir]) {
    try {
      return fs.statSync(p).mtimeMs;
    } catch {
      /* try the next */
    }
  }
  return 0;
}

/**
 * The save folder for this server's game. Every world folder holding a
 * <GameName> folder is a candidate; GameWorld wins when it's one of them,
 * otherwise the most recently written (the random-gen case).
 */
export function findWorldSave(saves: string, config: Record<string, string>): WorldSave | null {
  const gameName = config.GameName?.trim() || DEFAULT_GAME_NAME;
  let worlds: string[];
  try {
    worlds = fs
      .readdirSync(saves, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name);
  } catch {
    return null;
  }

  const candidates = worlds
    .map((world) => ({ world, gameName, dir: path.join(saves, world, gameName) }))
    .filter((c) => isDir(c.dir));
  if (candidates.length === 0) return null;

  const named = candidates.find((c) => c.world === config.GameWorld);
  if (named) return named;
  return candidates.sort((a, b) => lastWritten(b.dir) - lastWritten(a.dir))[0];
}

/**
 * Copy a folder tree by reading and writing each file.
 *
 * Deliberately plain reads: Compress-Archive and Copy-Item open files through
 * .NET's File.OpenRead, which shares read only, so they can fail on a file
 * the running game has open for writing. Node's reads share read, write and
 * delete. The Den zips this copy, never the live folder.
 */
export function copyTree(src: string, dest: string): void {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);
    if (entry.isDirectory()) copyTree(from, to);
    else if (entry.isFile()) fs.writeFileSync(to, fs.readFileSync(from));
  }
}
