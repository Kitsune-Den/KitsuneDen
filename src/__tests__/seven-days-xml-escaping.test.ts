import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import type { AdminData } from "../lib/adapters/types";
import {
  decodeXmlEntities,
  escapeXmlAttr,
  parseAdminXml,
  parseXmlConfig,
  writeAdminXml,
  writeXmlConfig,
} from "../lib/adapters/seven-days-adapter";

/**
 * serverconfig.xml / serveradmin.xml are edited with regexes. Values used to
 * be written unescaped, so a `"` in a config value or player name closed the
 * attribute and could add properties or admin entries; `$&` in a value was
 * expanded by String.replace; and commented-out example entries were parsed
 * as real ones.
 */

let dir: string;
const file = (name: string) => path.join(dir, name);

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "den-7d2d-xml-"));
});
afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

const TRICKY = [
  `x"/><property name="TelnetPassword" value="pwned`,
  `Tom & Jerry's <Server>`,
  "line one\nline two\ttabbed\r\n",
  "costs $& and $1 and $' and $$",
  "AC/DC",
  "&amp; already-looks-escaped &#65;",
  "emoji 🦊 and ünïcödé",
];

describe("escapeXmlAttr / decodeXmlEntities", () => {
  for (const value of TRICKY) {
    it(`round-trips ${JSON.stringify(value)}`, () => {
      const escaped = escapeXmlAttr(value);
      expect(escaped).not.toMatch(/["<>\n\r\t]/);
      expect(decodeXmlEntities(escaped)).toBe(value);
    });
  }

  it("decodes numeric references and leaves junk alone", () => {
    expect(decodeXmlEntities("&#65;&#x42;&lt;")).toBe("AB<");
    expect(decodeXmlEntities("&#9999999999; &bogus; & alone")).toBe("&#9999999999; &bogus; & alone");
  });
});

const CONFIG = `<?xml version="1.0"?>
<ServerSettings>
  <property name="ServerName" value="Den &amp; Friends"/>
  <property name="ServerPassword" value=""/>
  <property name="TelnetPassword" value="real-telnet"/>
  <!-- <property name="UserDataFolder" value="C:\\example"/> -->
</ServerSettings>
`;

describe("serverconfig.xml", () => {
  beforeEach(() => fs.writeFileSync(file("serverconfig.xml"), CONFIG));

  it("decodes entities when reading and ignores commented-out properties", () => {
    expect(parseXmlConfig(file("serverconfig.xml"))).toEqual({
      ServerName: "Den & Friends",
      ServerPassword: "",
      TelnetPassword: "real-telnet",
    });
  });

  it("a quote in a value can't inject another property", () => {
    const evil = `x"/><property name="TelnetPassword" value="pwned`;
    writeXmlConfig(file("serverconfig.xml"), { ServerName: evil });

    const xml = fs.readFileSync(file("serverconfig.xml"), "utf8");
    expect(xml.match(/<property /g)?.length).toBe(4); // 3 real + the commented example
    expect(parseXmlConfig(file("serverconfig.xml"))).toMatchObject({
      ServerName: evil,
      TelnetPassword: "real-telnet",
    });
  });

  it("every tricky value round-trips, including $& patterns", () => {
    for (const value of TRICKY) {
      writeXmlConfig(file("serverconfig.xml"), { ServerName: value, NewProp: value });
      const parsed = parseXmlConfig(file("serverconfig.xml"));
      expect(parsed.ServerName).toBe(value);
      expect(parsed.NewProp).toBe(value);
    }
  });

  it("saving unchanged values doesn't double-escape", () => {
    const before = fs.readFileSync(file("serverconfig.xml"), "utf8");
    writeXmlConfig(file("serverconfig.xml"), parseXmlConfig(file("serverconfig.xml")));
    expect(fs.readFileSync(file("serverconfig.xml"), "utf8")).toBe(before);
  });

  it("a property that only exists commented-out is added for real", () => {
    writeXmlConfig(file("serverconfig.xml"), { UserDataFolder: "D:\\data" });
    const xml = fs.readFileSync(file("serverconfig.xml"), "utf8");
    expect(xml).toContain(`<!-- <property name="UserDataFolder" value="C:\\example"/> -->`);
    expect(parseXmlConfig(file("serverconfig.xml")).UserDataFolder).toBe("D:\\data");
  });

  it("refuses property names that aren't identifiers and writes nothing", () => {
    const before = fs.readFileSync(file("serverconfig.xml"), "utf8");
    for (const key of [`a" value="x`, "(a+)+$", "Server Name", ""]) {
      expect(() => writeXmlConfig(file("serverconfig.xml"), { ServerName: "ok", [key]: "v" })).toThrow(
        /Invalid config property name/
      );
    }
    expect(fs.readFileSync(file("serverconfig.xml"), "utf8")).toBe(before);
  });
});

const STOCK_ADMIN = `<?xml version="1.0" encoding="UTF-8"?>
<adminTools>
  <users>
    <!-- <user platform="Steam" userid="76561198021925107" name="Hint on who this user is" permission_level="0" /> -->
    <user platform="Steam" userid="111" name="Owner" permission_level="0" />
  </users>
  <whitelist>
    <!-- <user platform="Steam" userid="76561198021925107" name="Example" /> -->
  </whitelist>
  <blacklist>
  </blacklist>
  <commands>
    <permission cmd="dm" permission_level="0" />
  </commands>
</adminTools>
`;

describe("serveradmin.xml", () => {
  beforeEach(() => fs.writeFileSync(file("serveradmin.xml"), STOCK_ADMIN));

  it("commented-out example entries are not admins (and aren't written back as real ones)", () => {
    const data = parseAdminXml(file("serveradmin.xml"));
    expect(data.users).toEqual([{ platform: "Steam", userId: "111", name: "Owner", permissionLevel: 0 }]);
    expect(data.whitelist).toEqual([]);

    writeAdminXml(file("serveradmin.xml"), data);
    expect(fs.readFileSync(file("serveradmin.xml"), "utf8")).not.toContain("76561198021925107");
  });

  it("a player name can't smuggle in attributes or entries", () => {
    const data = parseAdminXml(file("serveradmin.xml"));
    const evilName = `x" permission_level="0" /><user platform="Steam" userid="666" name="y`;
    data.whitelist.push({ platform: "Steam", userId: "222", name: evilName });
    data.blacklist.push({ platform: "Steam", userId: "333", name: "Griefer", unbanDate: "", reason: `spam "a/b" <c>\nagain` });
    writeAdminXml(file("serveradmin.xml"), data);

    const back = parseAdminXml(file("serveradmin.xml"));
    expect(back.users.map((u) => u.userId)).toEqual(["111"]);
    expect(back.whitelist).toEqual([{ platform: "Steam", userId: "222", name: evilName }]);
    expect(back.blacklist[0].reason).toBe(`spam "a/b" <c>\nagain`);
  });

  it("names containing / survive a round trip", () => {
    const data = parseAdminXml(file("serveradmin.xml"));
    data.users.push({ platform: "Steam", userId: "444", name: "AC/DC", permissionLevel: 10 });
    writeAdminXml(file("serveradmin.xml"), data);
    expect(parseAdminXml(file("serveradmin.xml")).users.find((u) => u.userId === "444")?.name).toBe("AC/DC");
  });

  it("permission levels from the request body are coerced or dropped to a safe default", () => {
    const data: AdminData = {
      users: [
        { platform: "Steam", userId: "1", name: "a", permissionLevel: "5" as unknown as number },
        { platform: "Steam", userId: "2", name: "b", permissionLevel: `0" x="` as unknown as number },
        { platform: "Steam", userId: "3", name: "c", permissionLevel: 99999 },
      ],
      whitelist: [],
      blacklist: [],
      commands: [{ cmd: `kick" permission_level="0`, permissionLevel: -1 }],
    };
    writeAdminXml(file("serveradmin.xml"), data);
    const back = parseAdminXml(file("serveradmin.xml"));
    expect(back.users.map((u) => u.permissionLevel)).toEqual([5, 1000, 1000]);
    expect(back.commands).toEqual([{ cmd: `kick" permission_level="0`, permissionLevel: 0 }]);
  });
});
