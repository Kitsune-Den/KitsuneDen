import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "fs";
import net from "net";
import os from "os";
import path from "path";
import {
  SevenDaysAdapter,
  KNOWN_PLAYERS_FILE,
  parseKnownPlayersFromLog,
  syncKnownPlayers,
} from "../lib/adapters/seven-days-adapter";
import { clearReachabilityCache } from "../lib/adapters/reachability";
import type { ServerDefinition } from "../lib/adapters/types";

const AUTH_LINE = (steam: string, eos: string, name: string) =>
  `2026-04-13T15:42:30 476.0 INF [Auth] PlayerName authorization successful: EntityID=171, PltfmId='${steam}', CrossId='${eos}', OwnerID='${steam}', PlayerName='${name}', ClientNumber='1'`;

describe("7D2D known-player cache", () => {
  let tmpDir: string;
  let logFile: string;
  let cacheFile: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "kd-7d2d-known-"));
    logFile = path.join(tmpDir, "7d2d-server.log");
    cacheFile = path.join(tmpDir, KNOWN_PLAYERS_FILE);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("parses auth lines, last name per EOS id wins", () => {
    const log = [
      AUTH_LINE("Steam_1", "EOS_aaa", "OldName"),
      "noise",
      AUTH_LINE("Steam_2", "EOS_bbb", "Bob"),
      AUTH_LINE("Steam_1", "EOS_aaa", "NewName"),
    ].join("\n");
    const players = parseKnownPlayersFromLog(log);
    expect(players).toHaveLength(2);
    expect(players.find((p) => p.eosId === "EOS_aaa")?.name).toBe("NewName");
  });

  it("remembers players after the log is truncated (dashboard relaunch)", () => {
    fs.writeFileSync(logFile, AUTH_LINE("Steam_1", "EOS_aaa", "Alice"));
    expect(syncKnownPlayers(logFile, cacheFile).size).toBe(1);

    // Dashboard launch truncates the log; a new player joins this session.
    fs.writeFileSync(logFile, AUTH_LINE("Steam_2", "EOS_bbb", "Bob"));
    const known = syncKnownPlayers(logFile, cacheFile);
    expect(Array.from(known.values()).map((p) => p.name).sort()).toEqual(["Alice", "Bob"]);

    // And the cache alone survives a missing log.
    fs.rmSync(logFile);
    expect(syncKnownPlayers(logFile, cacheFile).size).toBe(2);
  });

  it("doesn't rewrite the cache when nothing changed", () => {
    fs.writeFileSync(logFile, AUTH_LINE("Steam_1", "EOS_aaa", "Alice"));
    syncKnownPlayers(logFile, cacheFile);
    // Backdate the cache; a rewrite would bump mtime back to "now".
    fs.utimesSync(cacheFile, new Date(0), new Date(0));
    syncKnownPlayers(logFile, cacheFile);
    expect(fs.statSync(cacheFile).mtimeMs).toBe(0);
  });

  it("tolerates a corrupt cache file", () => {
    fs.writeFileSync(cacheFile, "{not json");
    fs.writeFileSync(logFile, AUTH_LINE("Steam_1", "EOS_aaa", "Alice"));
    expect(syncKnownPlayers(logFile, cacheFile).size).toBe(1);
  });
});

/**
 * Minimal stand-in for the 7D2D telnet console: password prompt, logon
 * banner, then records each command and answers it.
 */
function startFakeTelnet(): Promise<{ port: number; commands: string[]; close: () => Promise<void> }> {
  const commands: string[] = [];
  const server = net.createServer((sock) => {
    let authed = false;
    sock.write("Please enter password:\r\n");
    sock.on("data", (data) => {
      const line = data.toString().trim();
      if (!authed) {
        authed = true;
        sock.write("Logon successful.\r\n");
        return;
      }
      commands.push(line);
      sock.write(`*** Executing command '${line}' by Telnet ***\r\n`);
      sock.end();
    });
    sock.on("error", () => {});
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const port = (server.address() as net.AddressInfo).port;
      resolve({
        port,
        commands,
        close: () => new Promise<void>((r) => server.close(() => r())),
      });
    });
  });
}

/** A port nothing is listening on. */
async function closedPort(): Promise<number> {
  const s = net.createServer();
  await new Promise<void>((r) => s.listen(0, "127.0.0.1", () => r()));
  const port = (s.address() as net.AddressInfo).port;
  await new Promise<void>((r) => s.close(() => r()));
  return port;
}

function def(id: string, telnetPort: number): ServerDefinition {
  return {
    id,
    name: "7D2D",
    type: "7d2d",
    dir: path.join(os.tmpdir(), "kd-7d2d-nonexistent"),
    telnetPort,
    telnetPassword: "pw",
  };
}

describe("7D2D server not launched by the dashboard", () => {
  beforeEach(() => clearReachabilityCache());

  it("stop() sends shutdown over telnet instead of refusing", async () => {
    const telnet = await startFakeTelnet();
    try {
      const adapter = new SevenDaysAdapter(def("ext-stop", telnet.port));
      expect(adapter.getStatus()).toBe("stopped");
      const result = await adapter.stop();
      expect(result.success).toBe(true);
      expect(result.message).toMatch(/telnet/i);
      expect(telnet.commands).toEqual(["shutdown"]);
    } finally {
      await telnet.close();
    }
  });

  it("stop() still reports not running when telnet is closed", async () => {
    const adapter = new SevenDaysAdapter(def("ext-stop-closed", await closedPort()));
    const result = await adapter.stop();
    expect(result.success).toBe(false);
    expect(result.message).toMatch(/not running/i);
  });

  it("sendCommand() goes to telnet even though internal state is 'stopped'", async () => {
    const telnet = await startFakeTelnet();
    try {
      const adapter = new SevenDaysAdapter(def("ext-cmd", telnet.port));
      const result = adapter.sendCommand("listplayers");
      expect(result.success).toBe(true);
      // Fire-and-forget: wait for the fake server to see it.
      for (let i = 0; i < 50 && telnet.commands.length === 0; i++) {
        await new Promise((r) => setTimeout(r, 20));
      }
      expect(telnet.commands).toEqual(["listplayers"]);
    } finally {
      await telnet.close();
    }
  });

  it("start() refuses to launch a second copy while telnet is up", async () => {
    const telnet = await startFakeTelnet();
    try {
      const adapter = new SevenDaysAdapter(def("ext-start", telnet.port));
      const result = await adapter.start();
      expect(result.success).toBe(false);
      expect(result.message).toMatch(/outside the dashboard/i);
      expect(adapter.getStatus()).toBe("stopped");
    } finally {
      await telnet.close();
    }
  });
});
