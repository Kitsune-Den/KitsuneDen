import path from "path";
import type { ServerDefinition } from "./adapters/types";

/**
 * Resolve a path field from servers.json against the server's install dir.
 * Absolute paths are returned untouched; relative ones are joined onto `dir`.
 *
 * Plain `path.join(dir, p)` mangles absolute values ("C:\\srv" + "D:\\b.ps1"
 * becomes "C:\\srv\\D:\\b.ps1"), which is why this helper exists. Both the
 * win32 and posix notions of "absolute" are honored so a Windows-style path
 * in servers.json still resolves correctly when tests run on Linux CI.
 */
export function resolveServerPath(dir: string, p: string): string {
  if (path.isAbsolute(p) || path.win32.isAbsolute(p)) return p;
  return path.join(dir, p);
}

/** The server's mods folder: `modsDir` from servers.json, defaulting to "mods". */
export function getModsDir(def: Pick<ServerDefinition, "dir" | "modsDir">): string {
  return resolveServerPath(def.dir, def.modsDir || "mods");
}
