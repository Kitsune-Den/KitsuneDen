/**
 * Folder copies that work on a running game server's files.
 */

import fs from "fs";
import path from "path";

/**
 * Copy a folder tree by reading and writing each file.
 *
 * Deliberately plain reads: Compress-Archive and Copy-Item open files through
 * .NET's File.OpenRead, which shares read only, so they can fail on a file
 * the running game has open for writing. Node's reads share read, write and
 * delete. The Den zips this copy, never the live folder.
 */
export function copyTree(src: string, dest: string, skip?: (fileName: string) => boolean): void {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);
    if (entry.isDirectory()) copyTree(from, to, skip);
    else if (entry.isFile() && !skip?.(entry.name)) fs.writeFileSync(to, fs.readFileSync(from));
  }
}
