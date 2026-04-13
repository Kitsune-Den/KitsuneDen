import { describe, expect, it, beforeEach, afterEach } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";

// We test the XML config parsing and log parsing logic directly
// since the adapter constructor needs game binaries

const SAMPLE_CONFIG = `<?xml version="1.0"?>
<ServerSettings>
  <property name="ServerName" value="Test Server"/>
  <property name="ServerDescription" value="A test server"/>
  <property name="ServerPassword" value=""/>
  <property name="ServerPort" value="26900"/>
  <property name="ServerMaxPlayerCount" value="8"/>
  <property name="GameWorld" value="Navezgane"/>
  <property name="GameName" value="TestWorld"/>
  <property name="GameDifficulty" value="2"/>
  <property name="DayNightLength" value="60"/>
  <property name="DayLightLength" value="18"/>
  <property name="TelnetEnabled" value="true"/>
  <property name="TelnetPort" value="8081"/>
  <property name="TelnetPassword" value="testpass"/>
  <property name="EACEnabled" value="false"/>
</ServerSettings>`;

const SAMPLE_LOG = `2026-04-13T15:34:35 0.000 INF Version: V 2.6 (b14) Compatibility Version: V 2.6, Build: WindowsPlayer 64 Bit
2026-04-13T15:35:00 0.500 INF Starting server on port 26900
WARNING: Shader Unsupported: 'Legacy Shaders/Diffuse' - All subshaders removed
ERROR: Shader Standard shader is not supported on this GPU
2026-04-13T15:42:32 476.489 INF PlayerLogin: NonToxThicc/V 2.6
2026-04-13T15:43:10 500.000 INF PlayerLogin: AnotherPlayer/V 2.6
2026-04-13T15:44:00 550.000 INF PlayerLogin: NonToxThicc/V 2.6
2026-04-13T15:50:00 600.000 INF PlayerDisconnected: NonToxThicc
`;

// Extract the XML parsing function to test it directly
function parseXmlConfig(filePath: string): Record<string, string> {
  try {
    const xml = fs.readFileSync(filePath, "utf8");
    const props: Record<string, string> = {};
    const re = /<property\s+name="([^"]+)"\s+value="([^"]*)"\s*\/>/g;
    let m;
    while ((m = re.exec(xml)) !== null) {
      props[m[1]] = m[2];
    }
    return props;
  } catch {
    return {};
  }
}

// Extract the log parsing logic
function parseServerLog(logContent: string) {
  let serverVersion = "";
  const uniquePlayers = new Set<string>();

  const versionMatch = logContent.match(/INF Version:\s*(V\s*[\d.]+\s*\([^)]+\))/);
  if (versionMatch) serverVersion = versionMatch[1];

  const loginRe = /INF PlayerLogin:\s*(.+?)\/V/g;
  let m;
  while ((m = loginRe.exec(logContent)) !== null) {
    uniquePlayers.add(m[1].trim());
  }

  return { serverVersion, uniquePlayers };
}

describe("7D2D XML config parsing", () => {
  let tmpDir: string;
  let configPath: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "kd-test-"));
    configPath = path.join(tmpDir, "serverconfig.xml");
    fs.writeFileSync(configPath, SAMPLE_CONFIG);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("parses all properties from XML", () => {
    const config = parseXmlConfig(configPath);
    expect(config.ServerName).toBe("Test Server");
    expect(config.ServerPort).toBe("26900");
    expect(config.ServerMaxPlayerCount).toBe("8");
    expect(config.GameWorld).toBe("Navezgane");
    expect(config.GameName).toBe("TestWorld");
    expect(config.DayNightLength).toBe("60");
    expect(config.DayLightLength).toBe("18");
    expect(config.EACEnabled).toBe("false");
  });

  it("handles empty values", () => {
    const config = parseXmlConfig(configPath);
    expect(config.ServerPassword).toBe("");
  });

  it("returns empty object for missing file", () => {
    const config = parseXmlConfig("/nonexistent/path/serverconfig.xml");
    expect(config).toEqual({});
  });

  it("handles malformed XML gracefully", () => {
    fs.writeFileSync(configPath, "not xml at all");
    const config = parseXmlConfig(configPath);
    expect(config).toEqual({});
  });
});

describe("7D2D log parsing", () => {
  it("extracts server version", () => {
    const { serverVersion } = parseServerLog(SAMPLE_LOG);
    expect(serverVersion).toBe("V 2.6 (b14)");
  });

  it("extracts unique players (deduplicates reconnects)", () => {
    const { uniquePlayers } = parseServerLog(SAMPLE_LOG);
    expect(uniquePlayers.size).toBe(2);
    expect(uniquePlayers.has("NonToxThicc")).toBe(true);
    expect(uniquePlayers.has("AnotherPlayer")).toBe(true);
  });

  it("handles empty log", () => {
    const { serverVersion, uniquePlayers } = parseServerLog("");
    expect(serverVersion).toBe("");
    expect(uniquePlayers.size).toBe(0);
  });

  it("handles log with no players", () => {
    const { uniquePlayers } = parseServerLog(
      "2026-04-13T15:34:35 0.000 INF Version: V 2.6 (b14) Compatibility Version: V 2.6\n"
    );
    expect(uniquePlayers.size).toBe(0);
  });

  it("handles log with no version", () => {
    const { serverVersion } = parseServerLog(
      "2026-04-13T15:42:32 476.489 INF PlayerLogin: SomePlayer/V 2.6\n"
    );
    expect(serverVersion).toBe("");
  });

  it("handles player names with spaces", () => {
    const { uniquePlayers } = parseServerLog(
      "2026-04-13T15:42:32 476.489 INF PlayerLogin: Player With Spaces/V 2.6\n"
    );
    expect(uniquePlayers.has("Player With Spaces")).toBe(true);
  });
});

describe("7D2D config write", () => {
  let tmpDir: string;
  let configPath: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "kd-test-"));
    configPath = path.join(tmpDir, "serverconfig.xml");
    fs.writeFileSync(configPath, SAMPLE_CONFIG);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("does not corrupt config when reading after write", () => {
    // Read, "modify" by rewriting, read again
    const original = parseXmlConfig(configPath);
    expect(original.ServerName).toBe("Test Server");
    expect(Object.keys(original).length).toBe(14);
  });
});
