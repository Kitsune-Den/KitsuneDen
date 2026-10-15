import fs from "fs";
import os from "os";
import path from "path";
import { describe, expect, it } from "vitest";
import type { ServerAdapter, ServerDefinition } from "../lib/adapters/types";
import { MinecraftAdapter } from "../lib/adapters/minecraft-adapter";
import { SevenDaysAdapter } from "../lib/adapters/seven-days-adapter";
import { HytaleAdapter } from "../lib/adapters/hytale-adapter";
import { PalworldAdapter } from "../lib/adapters/palworld-adapter";
import { EnshroudedAdapter, defaultConfig } from "../lib/adapters/enshrouded-adapter";
import { RECIPES, portDefault, recipeDefault, recipeDefaults, recipeFor, type GameType } from "../lib/recipes";

/**
 * A recipe states what an adapter does. These tests keep the two honest:
 * if an adapter gains or loses a capability, the recipe has to change with it.
 */

// A folder that doesn't exist, so constructors find nothing on disk.
const dir = path.join(os.tmpdir(), "kitsuneden-recipes-nonexistent");

function adapterFor(type: GameType): ServerAdapter {
  const def = { id: `t-${type}`, name: type, type, dir, ...recipeDefaults(type) } as ServerDefinition;
  switch (type) {
    case "minecraft":
      return new MinecraftAdapter(def);
    case "7d2d":
      return new SevenDaysAdapter(def);
    case "hytale":
      return new HytaleAdapter(def);
    case "palworld":
      return new PalworldAdapter(def);
    case "enshrouded":
      return new EnshroudedAdapter(def);
  }
}

const types = Object.keys(RECIPES) as GameType[];

describe("game recipes", () => {
  it.each(types)("%s is keyed by its own type", (type) => {
    expect(RECIPES[type].type).toBe(type);
    expect(recipeFor(type)).toBe(RECIPES[type]);
  });

  it.each(types)("%s states each port field once", (type) => {
    const fields = RECIPES[type].ports.map((p) => p.field);
    expect(new Set(fields).size).toBe(fields.length);
  });

  it.each(types)("%s resolves a number for every port", (type) => {
    for (const p of RECIPES[type].ports) {
      expect(portDefault(RECIPES[type], p.field), p.field).toBeTypeOf("number");
    }
  });

  it.each(types)("%s console matches the adapter's RCON flag", (type) => {
    expect(adapterFor(type).capabilities.hasRcon).toBe(RECIPES[type].control.console === "rcon");
  });

  it.each(types)("%s install matches the adapter's update flags", (type) => {
    const { install } = RECIPES[type];
    const caps = adapterFor(type).capabilities;
    expect(caps.hasSteamUpdate).toBe(install.kind === "steamcmd" && install.denCanInstall);
    expect(caps.hasLauncherUpdate).toBe(install.kind === "launcher");
  });

  it.each(types)("%s backup method matches the adapter's backup flag", (type) => {
    expect(adapterFor(type).capabilities.hasBackups).toBe(RECIPES[type].saves.backup !== "none");
  });

  it.each(types)("%s pre-fills the same Steam app id it installs", (type) => {
    const { install, defaults } = RECIPES[type];
    if (defaults.steamAppId !== undefined) {
      expect(install.kind).toBe("steamcmd");
      if (install.kind === "steamcmd") expect(defaults.steamAppId).toBe(install.appId);
    }
  });

  it("7D2D's query port follows the game port at +2", () => {
    expect(recipeDefaults("7d2d").queryPort).toBe(26902);
  });

  it("Enshrouded's generated config uses the recipe's ports", () => {
    const def = { id: "e", name: "e", type: "enshrouded", dir } as ServerDefinition;
    const config = defaultConfig(def);
    expect(config.gamePort).toBe(portDefault(RECIPES.enshrouded, "gamePort"));
    expect(config.queryPort).toBe(portDefault(RECIPES.enshrouded, "queryPort"));
  });

  it("an unknown type has no recipe and no defaults", () => {
    expect(recipeFor("valheim")).toBeUndefined();
    expect(recipeDefaults("valheim")).toEqual({});
  });

  it("recipeDefault returns a recipe's value and refuses a missing one", () => {
    expect(recipeDefault("7d2d", "telnetPort")).toBe(8081);
    expect(recipeDefault("7d2d", "queryPort")).toBe(26902);
    expect(() => recipeDefault("7d2d", "rconPort")).toThrow(/7d2d recipe has no default for rconPort/);
  });

  // Adapters take their fallbacks from the recipe. A bare number after `||`
  // (a port, a Steam app id) means one has been restated by hand again.
  it("adapters don't hardcode port or app id fallbacks", () => {
    const adaptersDir = path.join(__dirname, "..", "lib", "adapters");
    for (const file of fs.readdirSync(adaptersDir).filter((f) => f.endsWith("-adapter.ts"))) {
      const source = fs.readFileSync(path.join(adaptersDir, file), "utf-8");
      expect(source.match(/def\.\w+ \|\| \d{4,}/g), file).toBeNull();
    }
  });
});
