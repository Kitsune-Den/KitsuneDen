import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { ServerDefinition } from "../lib/adapters/types";
import { advisePorts, detectInstall, gameConfigSecrets, portOwners, type FreeCheck } from "../lib/server-detect";

const allFree: FreeCheck = async () => true;
const busy = (...ports: number[]): FreeCheck => async (p) => !ports.includes(p);

const def = (d: Partial<ServerDefinition>) => ({ id: "x", name: "X", dir: "C:\\x", ...d }) as ServerDefinition;

describe("portOwners", () => {
  it("claims each server's ports, adapter defaults and 7D2D's +1/+2", () => {
    const owners = portOwners([
      def({ name: "Ember Wastes", type: "7d2d", gamePort: 26900 }),
      def({ name: "Fox Hollow", type: "minecraft", gamePort: 25565, rconPort: 25576 }),
    ]);
    expect(owners.get(26900)).toBe("Ember Wastes");
    expect(owners.get(26902)).toBe("Ember Wastes");
    expect(owners.get(8081)).toBe("Ember Wastes"); // default telnet
    expect(owners.get(25576)).toBe("Fox Hollow");
    expect(owners.has(25575)).toBe(false);
  });

  it("ignores remote Minecraft servers, whose ports live on another machine", () => {
    const owners = portOwners([def({ name: "Remote", type: "minecraft", gamePort: 25565, rconHost: "192.168.1.60" })]);
    expect(owners.size).toBe(0);
  });
});

describe("advisePorts", () => {
  it("uses the game's usual ports when they're free", async () => {
    const ports = await advisePorts("7d2d", {}, new Map(), allFree);
    expect(ports.gamePort).toMatchObject({ value: 26900, source: "default", status: "free" });
    expect(ports.telnetPort).toMatchObject({ value: 8081, status: "free" });
  });

  it("moves a default off a port another Den server uses, stepping like the game", async () => {
    const owners = portOwners([def({ name: "Ember Wastes", type: "7d2d", gamePort: 26900 })]);
    const ports = await advisePorts("7d2d", {}, owners, allFree);
    expect(ports.gamePort).toMatchObject({ value: 26910, status: "adjusted" });
    expect(ports.gamePort!.reason).toMatch(/Ember Wastes/);
    expect(ports.telnetPort).toMatchObject({ value: 8082, status: "adjusted" });
  });

  it("needs the whole 7D2D range free, not just the base port", async () => {
    const ports = await advisePorts("7d2d", {}, new Map(), busy(26902));
    expect(ports.gamePort!.value).toBe(26910);
  });

  it("skips ports something on this PC is already listening on", async () => {
    const ports = await advisePorts("minecraft", {}, new Map(), busy(25565, 25566));
    expect(ports.gamePort).toMatchObject({ value: 25567, status: "adjusted" });
  });

  it("keeps a port from the game's config and flags the clash with a suggestion", async () => {
    const owners = portOwners([def({ name: "Fox Hollow", type: "minecraft", gamePort: 25565 })]);
    const ports = await advisePorts("minecraft", { gamePort: { port: 25565, source: "config" } }, owners, allFree);
    expect(ports.gamePort).toMatchObject({ value: 25565, source: "config", status: "conflict", suggestion: 25566 });
    expect(ports.gamePort!.reason).toMatch(/Fox Hollow/);
  });

  it("never hands the same port to two fields of one server", async () => {
    // Palworld's RCON default (25575) is taken, and its REST API default is 8212.
    const owners = portOwners([def({ name: "Fox Hollow", type: "minecraft", gamePort: 25565, rconPort: 25575 })]);
    const ports = await advisePorts("palworld", { gamePort: { port: 8212, source: "entered" } }, owners, allFree);
    expect(ports.rconPort!.value).toBe(25576);
    expect(ports.restApiPort!.value).toBe(8213);
  });

  it("keeps Enshrouded's game and query ports paired", async () => {
    const owners = portOwners([def({ name: "Shroud", type: "enshrouded", gamePort: 15637, queryPort: 15638 })]);
    const ports = await advisePorts("enshrouded", {}, owners, allFree);
    expect(ports.gamePort!.value).toBe(15639);
    expect(ports.queryPort!.value).toBe(15640);
  });
});

describe("detectInstall", () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "den-detect-"));
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  const write = (rel: string, text = "") => {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    fs.writeFileSync(path.join(dir, rel), text);
  };

  it("rejects relative or missing folders", () => {
    expect(detectInstall("minecraft", "relative\\path")).toMatchObject({ ok: false });
    expect(detectInstall("minecraft", path.join(dir, "nope"))).toMatchObject({ ok: false, error: /doesn't exist/ });
  });

  it("reads a 7D2D serverconfig.xml without returning the telnet password", () => {
    write(
      "serverconfig.xml",
      `<ServerSettings>
  <property name="ServerName" value="Ember Wastes"/>
  <property name="ServerPort" value="26910"/>
  <property name="TelnetPort" value="8082"/>
  <property name="TelnetPassword" value="hunter2"/>
</ServerSettings>`
    );
    fs.mkdirSync(path.join(dir, "Mods"));
    const r = detectInstall("7d2d", dir);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.detection.fields).toMatchObject({ name: "Ember Wastes", configFile: "serverconfig.xml", modsDir: "Mods" });
    expect(r.detection.configPorts).toEqual({ gamePort: 26910, telnetPort: 8082 });
    expect(r.detection.secretsFound).toEqual(["telnetPassword"]);
    expect(JSON.stringify(r.detection)).not.toContain("hunter2");
    expect(gameConfigSecrets("7d2d", dir)).toEqual({ telnetPassword: "hunter2" });
  });

  it("recognises a Fabric server and its server.properties", () => {
    write("fabric-server-launch.jar");
    write("server.properties", "server-port=25566\nenable-rcon=true\nrcon.port=25576\nrcon.password=s3cret\n");
    fs.mkdirSync(path.join(dir, "versions", "1.21.4"), { recursive: true });
    const r = detectInstall("minecraft", dir);
    if (!r.ok) throw new Error(r.error);
    expect(r.detection.fields).toMatchObject({ jar: "fabric-server-launch.jar", launchMode: "jar", loader: "Fabric", version: "1.21.4" });
    expect(r.detection.configPorts).toEqual({ gamePort: 25566, rconPort: 25576 });
    expect(r.detection.secretsFound).toEqual(["rconPassword"]);
    expect(r.detection.notes.join(" ")).not.toMatch(/RCON is off/);
  });

  it("recognises NeoForge's argument files and its Minecraft version", () => {
    write("user_jvm_args.txt");
    write("libraries/net/neoforged/neoforge/21.1.172/win_args.txt");
    write("libraries/net/neoforged/neoforge/21.1.80/win_args.txt");
    const r = detectInstall("minecraft", dir);
    if (!r.ok) throw new Error(r.error);
    expect(r.detection.fields).toMatchObject({
      loader: "NeoForge",
      launchMode: "argfile",
      version: "1.21.1",
      argFiles: ["user_jvm_args.txt", "libraries/net/neoforged/neoforge/21.1.172/win_args.txt"],
    });
    expect(r.detection.notes.join(" ")).toMatch(/No server.properties yet/);
  });

  it("reads Palworld's ini, mapping AdminPassword to both RCON and the REST API", () => {
    write(
      "Pal/Saved/Config/WindowsServer/PalWorldSettings.ini",
      `[/Script/Pal.PalGameWorldSettings]\nOptionSettings=(ServerName="Pal Meadow",AdminPassword="pals",PublicPort=8221,RCONEnabled=True,RCONPort=25577,RESTAPIEnabled=True,RESTAPIPort=8222)\n`
    );
    const r = detectInstall("palworld", dir);
    if (!r.ok) throw new Error(r.error);
    expect(r.detection.fields.name).toBe("Pal Meadow");
    expect(r.detection.configPorts).toEqual({ gamePort: 8221, rconPort: 25577, restApiPort: 8222 });
    expect(r.detection.secretsFound).toEqual(["rconPassword", "restApiPassword"]);
    expect(gameConfigSecrets("palworld", dir)).toEqual({ rconPassword: "pals", restApiPassword: "pals" });
  });

  it("reads Enshrouded's JSON config and start script", () => {
    write("enshrouded_server.json", JSON.stringify({ name: "Shroud", gamePort: 15639, queryPort: 15640 }));
    write("start_enshrouded.bat");
    const r = detectInstall("enshrouded", dir);
    if (!r.ok) throw new Error(r.error);
    expect(r.detection.fields).toMatchObject({ name: "Shroud", startScript: "start_enshrouded.bat", configFile: "enshrouded_server.json" });
    expect(r.detection.configPorts).toEqual({ gamePort: 15639, queryPort: 15640 });
  });

  it("falls back to the folder name and says what's missing", () => {
    const r = detectInstall("7d2d", dir);
    if (!r.ok) throw new Error(r.error);
    expect(r.detection.fields.name).toBe(path.basename(dir));
    expect(r.detection.notes.join(" ")).toMatch(/No serverconfig.xml/);
  });
});

describe("where the suggested name came from", () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "den-detect-name-"));
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  it("says the config when the game names itself", () => {
    fs.writeFileSync(path.join(dir, "serverconfig.xml"), '<ServerSettings><property name="ServerName" value="Ember Two"/></ServerSettings>');
    const r = detectInstall("7d2d", dir);
    if (!r.ok) throw new Error(r.error);
    expect(r.detection).toMatchObject({ nameFromConfig: true, fields: { name: "Ember Two" } });
  });

  it("says the folder when the config keeps the stock name", () => {
    fs.writeFileSync(path.join(dir, "serverconfig.xml"), '<ServerSettings><property name="ServerName" value="My Game Host"/></ServerSettings>');
    const r = detectInstall("7d2d", dir);
    if (!r.ok) throw new Error(r.error);
    expect(r.detection).toMatchObject({ nameFromConfig: false, fields: { name: path.basename(dir) } });
  });
});
