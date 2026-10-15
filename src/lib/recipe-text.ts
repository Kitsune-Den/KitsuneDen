/**
 * Plain-language lines about a recipe, for the game picker. Kept apart from
 * the component so the wording can be tested.
 */

import type { GameRecipe, RecipeTier } from "./recipes";
import { gameMeta } from "./game-meta";

export const TIER_LABEL: Record<RecipeTier, string> = {
  verified: "Verified",
  experimental: "Experimental",
};

export function installText(recipe: GameRecipe): string {
  const { install } = recipe;
  switch (install.kind) {
    case "steamcmd":
      return install.denCanInstall
        ? `SteamCMD app ${install.appId}. The Den installs updates once you set the SteamCMD path.`
        : `SteamCMD app ${install.appId}${install.anonymous ? " (anonymous login)" : ""}. Install it yourself for now: the Den doesn't run SteamCMD for this game yet.`;
    case "launcher":
      return `Copied from the ${gameMeta(recipe.type).label} launcher on this PC. The Update tab refreshes it.`;
    case "manual":
      return install.help;
  }
}

export function consoleText(recipe: GameRecipe): string {
  switch (recipe.control.console) {
    case "rcon":
      return "RCON: live commands from the Console tab.";
    case "telnet":
      return "Telnet: live commands from the Console tab.";
    case "none":
      return "None, so no live commands.";
  }
}

export function backupText(recipe: GameRecipe): string {
  switch (recipe.saves.backup) {
    case "zip":
      return `The Den zips ${recipe.saves.path}.`;
    case "script":
      return "Runs the backup script you set below.";
    case "none":
      return `None yet. The world lives in ${recipe.saves.path}.`;
  }
}
