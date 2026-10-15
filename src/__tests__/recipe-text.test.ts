import { describe, expect, it } from "vitest";
import { RECIPES } from "../lib/recipes";
import { backupText, consoleText, installText } from "../lib/recipe-text";

describe("recipe text", () => {
  it("says when the Den installs a Steam game itself", () => {
    expect(installText(RECIPES.palworld)).toBe(
      "SteamCMD app 2394010. The Den installs updates once you set the SteamCMD path."
    );
  });

  it("says the Den updates 7D2D now", () => {
    expect(installText(RECIPES["7d2d"])).toBe(
      "SteamCMD app 294420. The Den installs updates once you set the SteamCMD path."
    );
  });

  it("says when a Steam game has to be installed by hand", () => {
    // No game is in this state any more; the wording still has to hold up.
    const byHand = {
      ...RECIPES["7d2d"],
      install: { kind: "steamcmd" as const, appId: 294420, anonymous: true, denCanInstall: false },
    };
    expect(installText(byHand)).toMatch(/^SteamCMD app 294420 \(anonymous login\)\. Install it yourself/);
  });

  it("names the launcher a game is copied from", () => {
    expect(installText(RECIPES.hytale)).toBe(
      "Copied from the Hytale launcher on this PC. The Update tab refreshes it."
    );
  });

  it("passes a manual install's own help through", () => {
    expect(installText(RECIPES.minecraft)).toBe(
      RECIPES.minecraft.install.kind === "manual" ? RECIPES.minecraft.install.help : ""
    );
  });

  it("describes each console", () => {
    expect(consoleText(RECIPES.minecraft)).toMatch(/^RCON/);
    expect(consoleText(RECIPES["7d2d"])).toMatch(/^Telnet/);
    expect(consoleText(RECIPES.enshrouded)).toBe("None, so no live commands.");
  });

  it("describes each backup method", () => {
    expect(backupText(RECIPES.palworld)).toBe("The Den zips Pal\\Saved\\SaveGames.");
    expect(backupText(RECIPES.hytale)).toBe("Runs the backup script you set below.");
    expect(backupText(RECIPES["7d2d"])).toBe("The Den zips Saves\\<world>\\<GameName>.");
    // No game is without backups now; "none" still reads properly if one is.
    expect(backupText({ ...RECIPES["7d2d"], saves: { path: "Saves", backup: "none" } })).toBe(
      "None yet. The world lives in Saves."
    );
  });
});
