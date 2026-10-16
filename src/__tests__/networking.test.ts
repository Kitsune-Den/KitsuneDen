import { describe, expect, it } from "vitest";
import { hostKey, portClashes, serverPorts, type NetServer } from "../lib/networking";

const mc: NetServer = { id: "mc", name: "Fabric", type: "minecraft", gamePort: 25565 };
const pal: NetServer = { id: "pal", name: "Palworld", type: "palworld", gamePort: 8211, rconPort: 25575 };
const sdtd: NetServer = { id: "7d", name: "7 Days", type: "7d2d", gamePort: 26900 };

const brief = (ports: ReturnType<typeof serverPorts>) =>
  ports.map((p) => `${p.purpose} ${p.proto} ${p.port} ${p.source}`);

describe("serverPorts", () => {
  it("uses servers.json values and fills the rest from the recipe", () => {
    expect(brief(serverPorts(mc))).toEqual(["game tcp 25565 set", "rcon tcp 25575 default"]);
  });

  it("derives 7D2D's query port from the game port, not a stored value", () => {
    const moved = { ...sdtd, gamePort: 26950, queryPort: 1234 };
    expect(brief(serverPorts(moved))).toEqual([
      "game tcp+udp 26950 set",
      "query udp 26952 offset",
      "telnet tcp 8081 default",
    ]);
    expect(serverPorts(moved)[1].offsetLabel).toBe("game + 2");
  });

  it("knows which ports to forward", () => {
    expect(serverPorts(pal).map((p) => `${p.purpose}:${p.public}`)).toEqual([
      "game:true",
      "rcon:false",
      "rest:false",
    ]);
  });

  it("has nothing for a game without a recipe", () => {
    expect(serverPorts({ id: "c", name: "Conan", type: "conanexiles" })).toEqual([]);
  });

  it("derives Valheim's query port as the game port + 1", () => {
    expect(brief(serverPorts({ id: "v", name: "Valheim", type: "valheim", gamePort: 2466 }))).toEqual([
      "game udp 2466 set",
      "query udp 2467 offset",
    ]);
  });
});

describe("hostKey", () => {
  it("treats unset and loopback hosts as this machine", () => {
    for (const rconHost of [undefined, "", "127.0.0.1", "localhost", " LocalHost ", "::1"]) {
      expect(hostKey({ rconHost })).toBe("local");
    }
    expect(hostKey({ rconHost: "192.168.1.60" })).toBe("192.168.1.60");
  });
});

describe("portClashes", () => {
  it("flags Minecraft and Palworld sharing the RCON default", () => {
    const clashes = portClashes("mc", [mc, pal, sdtd]);
    expect(clashes).toHaveLength(1);
    expect(clashes[0].port.purpose).toBe("rcon");
    expect(clashes[0].with.map((p) => `${p.serverName} ${p.purpose}`)).toEqual(["Palworld rcon"]);
  });

  it("reports the clash from both sides", () => {
    expect(portClashes("pal", [mc, pal]).map((c) => c.with[0].serverId)).toEqual(["mc"]);
  });

  it("is quiet once one of them moves", () => {
    expect(portClashes("mc", [mc, { ...pal, rconPort: 25577 }])).toEqual([]);
  });

  it("ignores servers on another machine", () => {
    expect(portClashes("mc", [{ ...mc, rconHost: "192.168.1.60" }, pal])).toEqual([]);
  });

  it("lets TCP and UDP share a number", () => {
    // Palworld's game port is UDP; a TCP port on 8211 can bind beside it.
    const tcpOn8211: NetServer = { ...mc, gamePort: 8211 };
    expect(portClashes("pal", [tcpOn8211, { ...pal, rconPort: 25577 }])).toEqual([]);
  });

  it("treats TCP + UDP as overlapping either", () => {
    // 7D2D's game port is TCP and UDP, so Palworld's UDP game port on 26900 collides.
    const palOn26900: NetServer = { ...pal, gamePort: 26900, rconPort: 25577 };
    expect(portClashes("7d", [sdtd, palOn26900]).map((c) => c.port.purpose)).toEqual(["game"]);
  });

  it("catches a derived port landing on a neighbour", () => {
    // 7D2D at 26900 opens UDP 26902; a second 7D2D whose game port is 26902 collides with it.
    const second: NetServer = { ...sdtd, id: "7d-b", name: "7 Days B", gamePort: 26902, telnetPort: 8082 };
    const clashes = portClashes("7d", [sdtd, second]);
    expect(clashes.map((c) => `${c.port.purpose} ${c.port.port}`)).toEqual(["query 26902"]);
  });

  it("catches a server clashing with itself", () => {
    const self: NetServer = { ...pal, rconPort: 25577, restApiPort: 25577 };
    expect(portClashes("pal", [self]).map((c) => c.port.purpose)).toEqual(["rcon", "rest"]);
  });

  it("returns nothing for an unknown server", () => {
    expect(portClashes("nope", [mc, pal])).toEqual([]);
  });
});
