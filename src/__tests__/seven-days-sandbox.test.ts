import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  alpha2ToIndex,
  alphaToIndex,
  decodeSandboxCode,
  describeSandboxCode,
  encodeSandboxCode,
  indexToAlpha,
  indexToAlpha2,
  sandboxDefaults,
  sandboxDrift,
  sandboxOption,
  sandboxPresetMatching,
  sandboxSelectionFromCode,
  sandboxSelectionFromPreset,
  sandboxValues,
} from "@/lib/seven-days-sandbox";
import {
  latestSandboxTable,
  parseSevenDaysVersion,
  SANDBOX_TABLES,
  sandboxTableByVersion,
  sandboxTableFor,
  sandboxTableIsBehind,
} from "@/lib/seven-days-sandbox-tables";

const t31 = sandboxTableByVersion("3.1");
const t30 = sandboxTableByVersion("3.0");
const t32 = sandboxTableByVersion("3.2");
const t33 = sandboxTableByVersion("3.3");
if (!t31 || !t30 || !t32 || !t33) throw new Error("sandbox tables missing");

/**
 * Both fixtures are the real game talking: a V 3.1.0 (b14) dedicated server was
 * booted with a PackRelay-generated code and asked what it made of it. They are
 * the reason this module can claim to emulate the generator rather than
 * resemble it - see PackRelay's scripts/extract-sandbox-options.mjs.
 */
const fixture = (name: string) =>
  readFileSync(
    fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url)),
    "utf8",
  );

const GAME_LINE = /^Option (\w+): (\d+)\/(.*?) \(default: (\d+)\/(.*?)\)$/;
function parseGameDump(text: string) {
  const out: {
    name: string;
    index: number;
    label: string;
    defaultIndex: number;
    defaultLabel: string;
  }[] = [];
  for (const line of text.split(/\r?\n/)) {
    const m = line.trim().match(GAME_LINE);
    if (m)
      out.push({
        name: m[1] as string,
        index: Number(m[2]),
        label: m[3] as string,
        defaultIndex: Number(m[4]),
        defaultLabel: m[5] as string,
      });
  }
  return out;
}

/** The code the fixture server was booted with. */
const APPLIED_CODE = "AAAAABMASKBBGBIEBMDBWABZICAGCOHCXFDXIFACEOAFRB";

describe("letter maths", () => {
  it("maps option and value indices the way the game does", () => {
    expect(indexToAlpha(0)).toBe("A");
    expect(indexToAlpha(25)).toBe("Z");
    expect(indexToAlpha2(0)).toBe("AA");
    expect(indexToAlpha2(34)).toBe("BI"); // ZombieMove on 3.1
    expect(indexToAlpha2(675)).toBe("ZZ");
    expect(alphaToIndex("d")).toBe(3); // the game upper-cases first
    expect(alpha2ToIndex("bi")).toBe(34);
  });
  it("round-trips every index in range", () => {
    for (let i = 0; i < 26; i++) expect(alphaToIndex(indexToAlpha(i))).toBe(i);
    for (let i = 0; i < 676; i++)
      expect(alpha2ToIndex(indexToAlpha2(i))).toBe(i);
  });
  it("refuses indices a letter cannot carry", () => {
    expect(() => indexToAlpha(26)).toThrow(RangeError);
    expect(() => indexToAlpha(-1)).toThrow(RangeError);
    expect(() => indexToAlpha2(676)).toThrow(RangeError);
  });
  it("reports non-letters rather than guessing", () => {
    expect(alphaToIndex("1")).toBe(-1);
    expect(alpha2ToIndex("A")).toBe(-1);
    expect(alpha2ToIndex("A1")).toBe(-1);
  });
});

describe("decodeSandboxCode", () => {
  it("reads the example code the game ships in serverconfig.xml", () => {
    // "Adventurer": the player deals 150% damage and takes 75%.
    const summary = describeSandboxCode("AAAJABJACJADJARFBNC", t31);
    expect(summary).toEqual([
      expect.objectContaining({ name: "RangedDamage", value: "150%" }),
      expect.objectContaining({ name: "MeleeDamage", value: "150%" }),
      expect.objectContaining({ name: "BlockDamage", value: "150%" }),
      expect.objectContaining({ name: "TerrainDamage", value: "150%" }),
      expect.objectContaining({ name: "IncomingDamage", value: "75%" }),
      expect.objectContaining({ name: "AISmellMode", value: "Jog" }),
    ]);
  });

  it("agrees with the running game about every option a code applies", () => {
    const game = parseGameDump(fixture("7d2d-3.1-applied.txt"));
    const decoded = decodeSandboxCode(APPLIED_CODE, t31);
    expect(decoded.ok).toBe(true);
    expect(decoded.unknown).toEqual([]);
    expect(decoded.trailing).toBe("");
    expect(
      decoded.entries.map((e) => ({
        name: e.option.name,
        index: e.valueIndex,
        label: e.value.label,
      })),
    ).toEqual(
      game.map((g) => ({ name: g.name, index: g.index, label: g.label })),
    );
  });

  it("rejects what isn't a code for this table", () => {
    expect(decodeSandboxCode("", t31)).toMatchObject({
      ok: false,
      error: "empty",
    });
    expect(decodeSandboxCode("BAAJ", t31)).toMatchObject({
      ok: false,
      error: "wrong-version",
    });
    expect(decodeSandboxCode("AAA1", t31)).toMatchObject({
      ok: false,
      error: "not-letters",
    });
  });

  it("surfaces triples this version can't place instead of dropping them", () => {
    // ZZ is index 675 - no game version has an option there.
    const d = decodeSandboxCode("AZZA", t31);
    expect(d.ok).toBe(true);
    expect(d.entries).toEqual([]);
    expect(d.unknown).toEqual([
      { optionIndex: 675, valueIndex: 0, raw: "ZZA", reason: "unknown-option" },
    ]);
  });

  it("surfaces a value index the option cannot take", () => {
    // AA is RangedDamage, which has 13 values; "Z" asks for the 26th.
    const d = decodeSandboxCode("AAAZ", t31);
    expect(d.entries).toEqual([]);
    expect(d.unknown[0]).toMatchObject({ reason: "value-out-of-range" });
  });

  it("keeps a ragged tail rather than misreading it", () => {
    const d = decodeSandboxCode(`${APPLIED_CODE}XY`, t31);
    expect(d.entries).toHaveLength(15);
    expect(d.trailing).toBe("XY");
  });

  it("fills unset options with their defaults", () => {
    const selection = sandboxSelectionFromCode(APPLIED_CODE, t31);
    expect(Object.keys(selection)).toHaveLength(t31.options.length);
    expect(selection.ZombieMove).toBe(4); // set by the code
    const untouched = sandboxOption(t31, "TerrainDamage");
    expect(selection.TerrainDamage).toBe(untouched?.defaultIndex);
  });
});

describe("encodeSandboxCode", () => {
  it("reproduces the exact code the game was given", () => {
    const game = parseGameDump(fixture("7d2d-3.1-applied.txt"));
    const selection = sandboxDefaults(t31);
    for (const g of game) selection[g.name] = g.index;
    expect(encodeSandboxCode(selection, t31)).toBe(APPLIED_CODE);
  });

  it("leaves defaults out - a code only carries what changed", () => {
    expect(encodeSandboxCode(sandboxDefaults(t31), t31)).toBe("A");
    const selection = sandboxDefaults(t31);
    selection.ZombieMove = 4;
    expect(encodeSandboxCode(selection, t31)).toBe("ABIE");
  });

  it("round-trips any selection", () => {
    const selection = sandboxDefaults(t31);
    // Every option one step off its default, wrapping within its own values.
    for (const o of t31.options) {
      const count = sandboxValues(t31, o).length;
      selection[o.name] = (o.defaultIndex + 1) % count;
    }
    const code = encodeSandboxCode(selection, t31);
    expect(code).toHaveLength(1 + 3 * t31.options.length);
    expect(sandboxSelectionFromCode(code, t31)).toEqual(selection);
  });

  it("ignores options the table doesn't have", () => {
    const selection = { ...sandboxDefaults(t31), NotAnOption: 3 };
    expect(encodeSandboxCode(selection, t31)).toBe("A");
  });

  it("refuses a value the option cannot take", () => {
    const selection = { ...sandboxDefaults(t31), RangedDamage: 25 };
    expect(() => encodeSandboxCode(selection, t31)).toThrow(RangeError);
  });

  it("carries unplaceable triples through a save", () => {
    // Editing a code from a newer server must not silently strip its settings.
    const decoded = decodeSandboxCode("AZZA", t31);
    const selection = sandboxDefaults(t31);
    selection.ZombieMove = 4;
    expect(
      encodeSandboxCode(selection, t31, { passthrough: decoded.unknown }),
    ).toBe("ABIEZZA");
  });
});

/**
 * The same capture against a live V 3.3.0 (b18) server (ada, 2026-10-03): the
 * 3.1 fixture's options plus the three item-tier options 3.2 shifted, set by
 * VALUE (tiers 3, 1, 6). Read with the 3.1 table, the same letters say tiers
 * 4 and 2 and a sixth index the 3.1 list doesn't have.
 */
const APPLIED_CODE_33 =
  "AAAAABMASKBBGBIEBMDBWABZICAGCOHCZDCXFDXIDWBFGGFACEOAFRB";

describe("3.3 against the running game", () => {
  const game = () => parseGameDump(fixture("7d2d-3.3-applied.txt"));

  it("decodes every option the way the game applied it", () => {
    const decoded = decodeSandboxCode(APPLIED_CODE_33, t33);
    expect(decoded.ok).toBe(true);
    expect(decoded.unknown).toEqual([]);
    expect(decoded.trailing).toBe("");
    expect(
      decoded.entries.map((e) => ({
        name: e.option.name,
        index: e.valueIndex,
        label: e.value.label,
      })),
    ).toEqual(
      game().map((g) => ({ name: g.name, index: g.index, label: g.label })),
    );
  });

  it("reproduces the exact code the game was given", () => {
    const selection = sandboxDefaults(t33);
    for (const g of game()) selection[g.name] = g.index;
    expect(encodeSandboxCode(selection, t33)).toBe(APPLIED_CODE_33);
  });

  it("is the code the 3.1 table would have misread", () => {
    const tiers = sandboxDrift(APPLIED_CODE_33, t33, t31).map((d) => ({
      name: d.from?.name,
      game: d.from?.value.value,
      as31: d.to?.value.value ?? null,
    }));
    expect(tiers).toEqual([
      { name: "LootMaxTier", game: 3, as31: 4 },
      { name: "CraftingMaxTier", game: 1, as31: 2 },
      { name: "TraderMaxTier", game: 6, as31: null },
    ]);
  });
});

describe("the extracted tables", () => {
  it.each([
    ["3.1", t31, "7d2d-3.1-defaults.txt"],
    ["3.3", t33, "7d2d-3.3-defaults.txt"],
  ] as const)("matches the running game's defaults for every option (%s)", (_v, t, file) => {
    const game = parseGameDump(fixture(file));
    expect(game).toHaveLength(t.options.length);
    for (const g of game) {
      const o = sandboxOption(t, g.name);
      expect(o, `${g.name} missing from the table`).toBeDefined();
      if (!o) continue;
      expect(o.defaultIndex, `${g.name} default index`).toBe(g.defaultIndex);
      expect(
        sandboxValues(t, o)[o.defaultIndex]?.label,
        `${g.name} default label`,
      ).toBe(g.defaultLabel);
    }
  });

  it("names the categories the way the game's own tabs do", () => {
    // The code calls the first category "General"; every tab in the game reads
    // "Player", because the UI resolves sandboxOptionCategory<Name>.
    for (const table of [t30, t31]) {
      expect(table.categories[0]).toBe("General");
      expect(table.categoryLabels?.General).toBe("Player");
      expect(table.categories.map((c) => table.categoryLabels?.[c])).toEqual([
        "Player",
        "Entities",
        "World",
        "Resources",
        "Crafting",
        "Traders",
        "Tasks",
        "Misc",
      ]);
    }
  });

  it("stays inside what the code format can address", () => {
    for (const table of [t30, t31]) {
      expect(table.codeVersion).toBe("A");
      const indices = table.options.map((o) => o.index);
      expect(new Set(indices).size).toBe(indices.length);
      expect(Math.max(...indices)).toBeLessThan(676);
      for (const set of Object.values(table.valueSets))
        expect(set.values.length).toBeLessThanOrEqual(26);
      for (const o of table.options) {
        const values = sandboxValues(table, o);
        expect(values.length, `${o.name} has no values`).toBeGreaterThan(0);
        expect(o.defaultIndex).toBeLessThan(values.length);
      }
    }
  });
});

describe("the built-in presets", () => {
  it("carries the game's own difficulties and Official set", () => {
    const presets = t31.presets ?? [];
    expect(presets.length).toBeGreaterThan(0);
    const difficulty = presets.filter((p) => p.group === "Difficulty");
    expect(difficulty.map((p) => p.label)).toEqual([
      "Scavenger",
      "Adventurer",
      "Nomad",
      "Warrior",
      "Survivalist",
      "Insane",
    ]);
    // Exactly one is the game's own starting point.
    expect(presets.filter((p) => p.isDefault)).toHaveLength(1);
    expect(presets.find((p) => p.isDefault)?.label).toBe("Adventurer");
  });

  it("every preset code is readable against this version's table", () => {
    // These codes were written by the game's designers, not by us - they are an
    // independent check that the extracted table lines up with the real thing.
    // Every table, not just one: each version's presets ship with that version.
    // 3.0 came from a bare reference assembly with no bundle beside it, so it
    // has none; every table since was extracted from a full install.
    for (const t of SANDBOX_TABLES) {
      if (t.version !== "3.0")
        expect(t.presets?.length, `${t.version} has presets`).toBeGreaterThan(
          0,
        );
      for (const preset of t.presets ?? []) {
        if (preset.code === "") continue; // Nomad IS the defaults
        const at = `${t.version} ${preset.name}`;
        const decoded = decodeSandboxCode(preset.code, t);
        expect(decoded.ok, `${at} decodes`).toBe(true);
        expect(decoded.unknown, `${at} has no stray triples`).toEqual([]);
        expect(decoded.trailing, `${at} has no ragged tail`).toBe("");
        expect(decoded.entries.length).toBeGreaterThan(0);
      }
    }
  });

  it("recognises the settings it just applied", () => {
    for (const preset of t31.presets ?? []) {
      const selection = sandboxSelectionFromPreset(preset, t31);
      const matched = sandboxPresetMatching(selection, t31);
      expect(matched, `${preset.name} is recognised`).not.toBeNull();
      if (!matched) continue;
      // Not necessarily the SAME preset - two could carry the same ruleset -
      // but whatever it names must mean exactly these settings.
      expect(sandboxSelectionFromPreset(matched, t31)).toEqual(selection);
    }
  });

  it("matches by what a preset MEANS, not by its code text", () => {
    const scavenger = (t31.presets ?? []).find((p) => p.name === "Scavenger");
    expect(scavenger).toBeDefined();
    if (!scavenger) return;
    const selection = sandboxSelectionFromPreset(scavenger, t31);
    // Our encoder writes the same settings in the game's category order, which
    // is not the order this preset's code happens to use.
    const ours = encodeSandboxCode(selection, t31);
    expect(
      sandboxPresetMatching(sandboxSelectionFromCode(ours, t31), t31)?.name,
    ).toBe("Scavenger");
  });

  it("calls anything else nothing at all - the game's Custom", () => {
    const selection = sandboxDefaults(t31);
    selection.BloodMoonFrequency = 0;
    selection.ZombieMove = 4;
    expect(sandboxPresetMatching(selection, t31)).toBeNull();
  });

  it("treats the empty-code preset as the plain defaults", () => {
    const nomad = (t31.presets ?? []).find((p) => p.name === "Nomad");
    expect(nomad?.code).toBe("");
    if (!nomad) return;
    expect(sandboxSelectionFromPreset(nomad, t31)).toEqual(
      sandboxDefaults(t31),
    );
  });
});

describe("sandboxDrift", () => {
  it("finds nothing for options both versions treat alike", () => {
    // The example code touches only damage options, unchanged since 3.0.
    expect(sandboxDrift("AAAJABJACJADJARFBNC", t30, t31)).toEqual([]);
  });

  it("catches a value list that gained an entry at the front", () => {
    // 3.1 prepended -1 ("Off") to the biome enemy-density values, so every
    // letter for that option means one step less there - with no change to the
    // code's version letter to warn anyone.
    const density = sandboxOption(t30, "BiomeEnemyDensity");
    expect(density).toBeDefined();
    const selection = sandboxDefaults(t30);
    if (density) selection[density.name] = 2;
    const drift = sandboxDrift(encodeSandboxCode(selection, t30), t30, t31);
    expect(drift).toHaveLength(1);
    // Same letter, one step down the list: density 2 on 3.0, density 1 on 3.1.
    expect(drift[0]?.from?.value.value).toBe(2);
    expect(drift[0]?.to?.value.value).toBe(1);
  });

  it("catches 3.2 prepending Default to the item tiers", () => {
    // 3.2 put -1 ("Default") in front of ItemTierOptions, again under code
    // version 'A'. Before the 3.2/3.3 tables existed, a 3.3 server fell back to
    // the 3.1 table and read every Max Loot/Crafting/Trader Quality letter one
    // tier off (ada's native 3.3 server, 2026-10-03).
    const selection = sandboxDefaults(t31);
    selection.LootMaxTier = 3; // tier 4 on 3.1
    const code = encodeSandboxCode(selection, t31);
    for (const t of [t32, t33]) {
      const drift = sandboxDrift(code, t31, t);
      expect(drift).toHaveLength(1);
      expect(drift[0]?.from?.value.value).toBe(4);
      expect(drift[0]?.to?.value.value).toBe(3);
    }
    // 3.2 -> 3.3 changed nothing a code can see.
    expect(sandboxDrift(encodeSandboxCode(selection, t32), t32, t33)).toEqual(
      [],
    );
  });

  it("reports an option the other version doesn't have", () => {
    const selection = sandboxDefaults(t31);
    selection.StackSizeMultiplier = 5; // 3.1 only
    const drift = sandboxDrift(encodeSandboxCode(selection, t31), t31, t30);
    expect(drift).toHaveLength(1);
    expect(drift[0]?.to).toBeNull();
  });
});

describe("sandboxTableFor", () => {
  it("reads a version out of every string 7D2D hands us", () => {
    expect(parseSevenDaysVersion("v3.0")).toEqual({ major: 3, minor: 0 });
    expect(parseSevenDaysVersion("V 3.1.0 (b14)")).toEqual({
      major: 3,
      minor: 1,
    });
    expect(parseSevenDaysVersion("3.1")).toEqual({ major: 3, minor: 1 });
    expect(parseSevenDaysVersion("v3")).toEqual({ major: 3, minor: 0 });
    expect(parseSevenDaysVersion("")).toBeNull();
    expect(parseSevenDaysVersion("latest_experimental")).toBeNull();
  });

  it("picks the matching table", () => {
    expect(sandboxTableFor("v3.0")?.version).toBe("3.0");
    expect(sandboxTableFor("V 3.1.0 (b14)")?.version).toBe("3.1");
    expect(sandboxTableFor("V 3.2.0 (b10)")?.version).toBe("3.2");
    expect(sandboxTableFor("V 3.3.0 (b18)")?.version).toBe("3.3");
  });

  it("falls back to the newest table that isn't ahead of the server", () => {
    // The lesser risk, not a safe one (see the item-tier drift above): better
    // than writing options a server might not have, and the editor says so.
    const t = sandboxTableFor("V 3.4.0 (b1)");
    expect(t?.version).toBe("3.3");
    expect(t && sandboxTableIsBehind("V 3.4.0 (b1)", t)).toBe(true);
    expect(t && sandboxTableIsBehind("V 3.3.0 (b18)", t)).toBe(false);
    expect(t && sandboxTableIsBehind("latest_experimental", t)).toBe(false);
  });

  it("has no table for a version without a Sandbox, or none we can name", () => {
    expect(sandboxTableFor("v2.6")).toBeNull();
    expect(sandboxTableFor("")).toBeNull();
    expect(sandboxTableFor(null)).toBeNull();
    expect(latestSandboxTable.version).toBe("3.3");
  });
});
