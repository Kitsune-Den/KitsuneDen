/**
 * SteamCMD helpers for adapters that update a dedicated server in place.
 *
 * Two things an update must not do quietly, both learned by PackRelay:
 *  - switch branch. A server on a beta (7D2D's latest_experimental, say) is
 *    moved to public by a plain `app_update`. The installed branch is in
 *    steamapps/appmanifest_<appId>.acf, and goes back in as `-beta`.
 *  - lose config. `validate` restores every shipped file, including a
 *    serverconfig.xml the operator edited in place (7D2D's lost its port this
 *    way). Snapshot those files first and put them back after.
 */

import fs from "fs";
import path from "path";

export interface InstalledBuild {
  /** Steam's build id, or null in a half-written manifest. */
  buildId: number | null;
  /** The branch passed to -beta; "public" when there's none. */
  branch: string;
}

/** Read buildid and branch from an appmanifest's VDF text. */
export function parseAppManifest(text: string): InstalledBuild {
  const build = /^\s*"buildid"\s+"(\d+)"/im.exec(text);
  // steamcmd has written this key as BetaKey and betakey over the years.
  const beta = /^\s*"betakey"\s+"([^"]*)"/im.exec(text);
  return {
    buildId: build ? Number(build[1]) : null,
    branch: beta?.[1]?.trim() || "public",
  };
}

/** What's installed in installDir, or null before the first SteamCMD install. */
export function readInstalledBuild(installDir: string, appId: number): InstalledBuild | null {
  try {
    const text = fs.readFileSync(path.join(installDir, "steamapps", `appmanifest_${appId}.acf`), "utf8");
    return parseAppManifest(text);
  } catch {
    return null;
  }
}

/** The SteamCMD command line for an anonymous update that stays on `branch`. */
export function appUpdateCommand(steamCmd: string, installDir: string, appId: number, branch: string): string {
  const beta = branch && branch !== "public" ? ` -beta ${branch}` : "";
  return `"${steamCmd}" +force_install_dir "${installDir}" +login anonymous +app_update ${appId}${beta} validate +quit`;
}

/** The current bytes of each file that exists, keyed by its name. */
export function snapshotFiles(dir: string, names: string[]): Map<string, Buffer> {
  const snapshot = new Map<string, Buffer>();
  for (const name of new Set(names)) {
    try {
      snapshot.set(name, fs.readFileSync(path.join(dir, name)));
    } catch {
      /* not there, nothing to keep */
    }
  }
  return snapshot;
}

/** Write back every snapshotted file that changed. Returns the names restored. */
export function restoreFiles(dir: string, snapshot: Map<string, Buffer>): string[] {
  const restored: string[] = [];
  for (const [name, bytes] of snapshot) {
    const file = path.join(dir, name);
    let current: Buffer | null = null;
    try {
      current = fs.readFileSync(file);
    } catch {
      /* deleted: put it back */
    }
    if (current && current.equals(bytes)) continue;
    fs.writeFileSync(file, bytes);
    restored.push(name);
  }
  return restored;
}
