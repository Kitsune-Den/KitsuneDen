import { describe, expect, it } from "vitest";
import path from "path";
import { resolveServerPath, getModsDir } from "../lib/server-paths";

describe("resolveServerPath", () => {
  it("joins relative paths onto the server dir", () => {
    expect(resolveServerPath("/srv/hytale", "scripts/backup.ps1")).toBe(
      path.join("/srv/hytale", "scripts/backup.ps1")
    );
  });

  it("keeps a Windows absolute path untouched (the hytale backupScript bug)", () => {
    // path.join would produce "C:\\GameServers\\Hytale\\D:\\Scripts\\backup.ps1"
    expect(resolveServerPath("C:\\GameServers\\Hytale", "D:\\Scripts\\backup.ps1")).toBe(
      "D:\\Scripts\\backup.ps1"
    );
  });

  it("keeps a posix absolute path untouched", () => {
    expect(resolveServerPath("/srv/hytale", "/opt/backup.sh")).toBe("/opt/backup.sh");
  });
});

describe("getModsDir", () => {
  it("defaults to <dir>/mods", () => {
    expect(getModsDir({ dir: "/srv/mc" })).toBe(path.join("/srv/mc", "mods"));
  });

  it("honors a relative modsDir", () => {
    expect(getModsDir({ dir: "/srv/7d2d", modsDir: "Mods" })).toBe(path.join("/srv/7d2d", "Mods"));
  });

  it("honors an absolute modsDir", () => {
    expect(getModsDir({ dir: "C:\\srv\\mc", modsDir: "E:\\shared-mods" })).toBe("E:\\shared-mods");
  });
});
