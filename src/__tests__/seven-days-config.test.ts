import { describe, expect, it } from "vitest";
import {
  isSandboxEra,
  parseServerConfigXml,
  patchServerConfigXml,
  SANDBOX_GOVERNED_KEYS,
  sevenDaysMajorVersion,
  sevenDaysVersionFromLog,
} from "@/lib/seven-days-config";

// Trimmed from the stock 3.3 (v3.30 b18) serverconfig.xml
const STOCK_33 = `<?xml version="1.0"?>
<ServerSettings>
	<property name="ServerName"						value="My Game Host"/>			<!-- Whatever you want the name of the server to be. -->
	<property name="Region"							value="NorthAmericaEast"/>	<!-- The region this server is in. -->
	<property name="Language"						value="English"/>			<!-- Primary language for players on this server. -->
	<!-- <property name="UserDataFolder"			value="absolute_path"/> -->	<!-- Use this to override where the server stores all user data. -->
	<property name="PlayerSafeZoneLevel"			value="5"/>
	<property name="SandboxCode"					value="AAAJABJACJADJARFBNC"/>	<!-- Currently set to the default difficulty of Adventurer. -->
</ServerSettings>
`;

describe("parseServerConfigXml", () => {
  it("reads the stock 3.3 config", () => {
    expect(parseServerConfigXml(STOCK_33)).toEqual({
      ServerName: "My Game Host",
      Region: "NorthAmericaEast",
      Language: "English",
      PlayerSafeZoneLevel: "5",
      SandboxCode: "AAAJABJACJADJARFBNC",
    });
  });

  it("skips commented-out properties", () => {
    expect(parseServerConfigXml(STOCK_33)).not.toHaveProperty("UserDataFolder");
  });

  it("unescapes XML entities", () => {
    const xml = `<ServerSettings><property name="ServerDescription" value="Fox &amp; Friends &quot;PvE&quot;"/></ServerSettings>`;
    expect(parseServerConfigXml(xml).ServerDescription).toBe('Fox & Friends "PvE"');
  });
});

describe("patchServerConfigXml", () => {
  it("replaces in place and keeps comments", () => {
    const out = patchServerConfigXml(STOCK_33, { SandboxCode: "ABCDEF" });
    expect(out).toContain(`value="ABCDEF"/>\t<!-- Currently set to the default difficulty of Adventurer. -->`);
    expect(parseServerConfigXml(out).SandboxCode).toBe("ABCDEF");
  });

  it("adds a live property rather than editing a commented-out one", () => {
    const out = patchServerConfigXml(STOCK_33, { UserDataFolder: "D:\\7d2d-data" });
    expect(out).toContain(`<!-- <property name="UserDataFolder"\t\t\tvalue="absolute_path"/> -->`);
    expect(parseServerConfigXml(out).UserDataFolder).toBe("D:\\7d2d-data");
  });

  it("escapes values so quotes can't break the file", () => {
    const out = patchServerConfigXml(STOCK_33, { ServerName: 'Fox & "Friends" <3' });
    expect(out).toContain(`value="Fox &amp; &quot;Friends&quot; &lt;3"`);
    expect(parseServerConfigXml(out).ServerName).toBe('Fox & "Friends" <3');
  });

  it("round-trips values containing $ replacement patterns literally", () => {
    const out = patchServerConfigXml(STOCK_33, { ServerName: "$1 Server", Language: "$&" });
    const parsed = parseServerConfigXml(out);
    expect(parsed.ServerName).toBe("$1 Server");
    expect(parsed.Language).toBe("$&");
  });

  it("does not duplicate properties on repeated writes", () => {
    let out = patchServerConfigXml(STOCK_33, { GameName: "One" });
    out = patchServerConfigXml(out, { GameName: "Two" });
    expect(out.match(/name="GameName"/g)).toHaveLength(1);
    expect(parseServerConfigXml(out).GameName).toBe("Two");
  });
});

describe("3.x detection", () => {
  it("treats a SandboxCode in the config as 3.x", () => {
    expect(isSandboxEra({ SandboxCode: "" })).toBe(true);
  });

  it("falls back to the logged version for a 2.x-shaped config", () => {
    expect(isSandboxEra({ GameDifficulty: "2" }, "V 3.3.0 (b18)")).toBe(true);
    expect(isSandboxEra({ GameDifficulty: "2" }, "V 2.6 (b14)")).toBe(false);
    expect(isSandboxEra({ GameDifficulty: "2" })).toBe(false);
  });

  it("parses majors from the forms 7D2D uses", () => {
    expect(sevenDaysMajorVersion("V 3.3.0 (b18)")).toBe(3);
    expect(sevenDaysMajorVersion("v2.6")).toBe(2);
    expect(sevenDaysMajorVersion("latest")).toBeNull();
  });

  it("reads the newest version line from a log", () => {
    const log = [
      "2026-10-01T10:00:00 0.000 INF Version: V 3.2.0 (b12) Compatibility Version: V 3.2",
      "2026-10-11T10:00:00 0.000 INF Version: V 3.3.0 (b18) Compatibility Version: V 3.3",
    ].join("\n");
    expect(sevenDaysVersionFromLog(log)).toBe("V 3.3.0 (b18)");
    expect(sevenDaysVersionFromLog("no version here")).toBeNull();
  });

  it("governs the settings the stock 3.3 config no longer ships", () => {
    for (const key of ["GameDifficulty", "DayNightLength", "BlockDamagePlayer", "LootAbundance", "LootTimer"]) {
      expect(SANDBOX_GOVERNED_KEYS.has(key)).toBe(true);
    }
    for (const key of ["LandClaimSize", "MaxSpawnedZombies", "PlayerSafeZoneLevel", "BedrollDeadZoneSize"]) {
      expect(SANDBOX_GOVERNED_KEYS.has(key)).toBe(false);
    }
  });
});
