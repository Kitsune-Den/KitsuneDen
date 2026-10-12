import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { ServerAdapter, ServerDefinition } from "../lib/adapters/types";
import { checkDeletableDir, sanitizeServerWrite, validatePathFields } from "../lib/server-def-security";
import { DELETE, POST, PUT } from "../app/api/servers/route";

/**
 * PUT/POST /api/servers accept fields that pick what the dashboard host runs
 * (javaPath, startScript, steamCmdPath, ...) and what DELETE ?deleteFiles
 * removes (dir). Several are also pasted into PowerShell / cmd.exe / WQL
 * strings, so a stray quote is command injection. These tests pin the rules.
 */

const STORED: ServerDefinition = {
  id: "hytale",
  name: "Hytale",
  type: "hytale",
  dir: "C:\\GameServers\\O'Brien Hytale", // legacy value the new rules would reject
  startScript: "start.bat",
};

const registry = vi.hoisted(() => ({
  getAllAdapters: vi.fn(),
  updateServer: vi.fn(),
  addServer: vi.fn(),
  removeServer: vi.fn(),
}));

vi.mock("@/lib/adapters/adapter-registry", () => registry);
vi.mock("@/lib/adapters/reachability", () => ({ resolveServerStatus: vi.fn(async () => "stopped") }));

function jsonRequest(method: string, body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/servers", {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const ok = (v: Record<string, unknown>) => expect(validatePathFields(v)).toBeNull();
const bad = (v: Record<string, unknown>, field: string) =>
  expect(validatePathFields(v)).toMatch(new RegExp(`"${field}"`));

describe("validatePathFields", () => {
  describe("dir", () => {
    it("accepts absolute Windows paths, including the example config's", () => {
      ok({ dir: "C:\\GameServers\\fabric-server" });
      ok({ dir: "D:/Games/Palworld Server (test)" });
      ok({ dir: "\\\\nas\\games\\mc" });
    });

    it("rejects relative, empty and drive-relative paths", () => {
      bad({ dir: "servers\\mc" }, "dir");
      bad({ dir: "" }, "dir");
      bad({ dir: "C:games" }, "dir");
      bad({ dir: 42 }, "dir");
    });

    it("rejects characters that break out of the adapters' shell strings", () => {
      for (const ch of [`"`, `'`, "`", "$", "%", "&", "|", "<", ">", "^", ";", "\n"]) {
        bad({ dir: `C:\\Games\\x${ch}calc` }, "dir");
      }
    });
  });

  describe("paths that must stay inside dir", () => {
    for (const field of ["startScript", "backupScript", "jar", "configFile", "modsDir"]) {
      it(`${field}: accepts relative paths inside the install dir`, () => {
        ok({ [field]: "start.bat" });
        ok({ [field]: "scripts/backup.ps1" });
        ok({ [field]: "a\\..\\b.bat" }); // normalizes to b.bat
        ok({ [field]: "" }); // unset → adapter default
      });

      it(`${field}: rejects absolute, drive, UNC and escaping paths`, () => {
        bad({ [field]: "C:\\Windows\\System32\\evil.bat" }, field);
        bad({ [field]: "C:evil.bat" }, field);
        bad({ [field]: "\\\\attacker\\share\\x.bat" }, field);
        bad({ [field]: "/etc/passwd" }, field);
        bad({ [field]: "..\\..\\Users\\Public\\x.bat" }, field);
        bad({ [field]: "../outside.bat" }, field);
        bad({ [field]: "scripts/../../outside.bat" }, field);
        bad({ [field]: ".." }, field);
      });

      it(`${field}: rejects shell metacharacters`, () => {
        bad({ [field]: `start.bat' & calc & '` }, field);
      });
    }

    it("argFiles: checks every entry", () => {
      ok({ argFiles: ["user_jvm_args.txt", "libraries/net/neoforged/neoforge/21.1.172/win_args.txt"] });
      bad({ argFiles: ["user_jvm_args.txt", "C:\\evil\\args.txt"] }, "argFiles");
      bad({ argFiles: ["../../evil.txt"] }, "argFiles");
      bad({ argFiles: "user_jvm_args.txt" }, "argFiles");
      bad({ argFiles: [1] }, "argFiles");
    });
  });

  describe("executables", () => {
    it("javaPath: accepts java / java.exe / javaw.exe, absolute or bare", () => {
      ok({ javaPath: "C:\\Program Files\\Eclipse Adoptium\\jdk-21\\bin\\java.exe" });
      ok({ javaPath: "C:/Program Files/Java/bin/JAVAW.EXE" });
      ok({ javaPath: "java" });
      ok({ javaPath: "" });
    });

    it("javaPath: rejects any other program", () => {
      bad({ javaPath: "C:\\Windows\\System32\\cmd.exe" }, "javaPath");
      bad({ javaPath: "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" }, "javaPath");
      bad({ javaPath: "C:\\tools\\java.exe.bat" }, "javaPath");
      bad({ javaPath: "C:\\x\\java.exe\\..\\cmd.exe" }, "javaPath");
    });

    it("steamCmdPath: accepts steamcmd only, and no quote break-outs", () => {
      ok({ steamCmdPath: "C:\\SteamCMD\\steamcmd.exe" });
      bad({ steamCmdPath: "C:\\Windows\\System32\\cmd.exe" }, "steamCmdPath");
      // basename is steamcmd.exe, but the quote would escape the cmd.exe string
      bad({ steamCmdPath: `C:\\x" & calc & "\\steamcmd.exe` }, "steamCmdPath");
    });
  });

  it("processFilter: rejects quotes that break the WQL filter", () => {
    ok({ processFilter: "HytaleServer" });
    bad({ processFilter: `x%' OR Name LIKE '%` }, "processFilter");
  });

  it("only checks fields that are present", () => {
    ok({ name: "Renamed" });
  });

  it("skips values identical to the stored definition (legacy values)", () => {
    expect(validatePathFields({ dir: STORED.dir, name: "X" }, STORED)).toBeNull();
    expect(validatePathFields({ dir: "C:\\Games\\new'one" }, STORED)).toMatch(/"dir"/);
  });
});

describe("sanitizeServerWrite", () => {
  it("rejects adminFilePath (servers.json-only: the 7D2D adapter writes to it)", () => {
    const r = sanitizeServerWrite({ adminFilePath: "C:\\Windows\\win.ini" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toMatch(/servers\.json/);
  });

  it("returns the path validation error", () => {
    const r = sanitizeServerWrite({ javaPath: "cmd.exe" });
    expect(r).toEqual({ ok: false, message: expect.stringMatching(/"javaPath"/) });
  });
});

describe("checkDeletableDir", () => {
  const cwd = "C:\\KitsuneDen";

  it("allows a real server folder", () => {
    expect(checkDeletableDir("C:\\GameServers\\fabric-server", cwd)).toBeNull();
    expect(checkDeletableDir("D:\\a\\b\\c", cwd)).toBeNull();
  });

  it("refuses drive roots and top-level folders", () => {
    for (const dir of ["C:\\", "C:/", "D:", "C:\\Games", "C:\\Games\\", "C:\\Games\\mc\\.."]) {
      expect(checkDeletableDir(dir, cwd), dir).toMatch(/Refusing/);
    }
  });

  it("refuses relative paths", () => {
    expect(checkDeletableDir("servers\\mc", cwd)).toMatch(/absolute/);
  });

  it("refuses the dashboard folder and its ancestors (case-insensitive)", () => {
    const dashboard = "C:\\Users\\den\\KitsuneDen";
    expect(checkDeletableDir("C:\\Users\\den\\KitsuneDen", dashboard)).toMatch(/dashboard/);
    expect(checkDeletableDir("c:\\users\\DEN", dashboard)).toMatch(/dashboard/);
    expect(checkDeletableDir("C:\\Users\\den\\KitsuneDen-old", dashboard)).toBeNull();
  });
});

describe("/api/servers route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    registry.getAllAdapters.mockReturnValue([{ def: STORED, capabilities: {} } as unknown as ServerAdapter]);
    registry.updateServer.mockResolvedValue({ success: true, message: "ok" });
    registry.addServer.mockResolvedValue({ success: true, message: "ok" });
  });

  it("PUT refuses javaPath = cmd.exe and writes nothing", async () => {
    const res = await PUT(
      jsonRequest("PUT", { serverId: "hytale", updates: { javaPath: "C:\\Windows\\System32\\cmd.exe" } })
    );
    expect(res.status).toBe(400);
    expect((await res.json()).message).toMatch(/"javaPath"/);
    expect(registry.updateServer).not.toHaveBeenCalled();
  });

  it("PUT refuses a startScript outside the install dir", async () => {
    const res = await PUT(
      jsonRequest("PUT", { serverId: "hytale", updates: { startScript: "..\\..\\Users\\Public\\x.bat" } })
    );
    expect(res.status).toBe(400);
    expect(registry.updateServer).not.toHaveBeenCalled();
  });

  it("PUT from the edit form still saves when an unchanged legacy dir fails the new rules", async () => {
    const res = await PUT(
      jsonRequest("PUT", {
        serverId: "hytale",
        updates: { name: "Renamed", dir: STORED.dir, startScript: "start.bat", backupScript: "" },
      })
    );
    expect(res.status).toBe(200);
    expect(registry.updateServer).toHaveBeenCalled();
  });

  it("POST refuses a relative dir", async () => {
    const res = await POST(
      jsonRequest("POST", { server: { id: "x", name: "X", type: "minecraft", dir: "servers\\x" } })
    );
    expect(res.status).toBe(400);
    expect(registry.addServer).not.toHaveBeenCalled();
  });

  it("POST accepts the example NeoForge definition", async () => {
    const res = await POST(
      jsonRequest("POST", {
        server: {
          id: "neoforge",
          name: "NeoForge",
          type: "minecraft",
          dir: "C:\\GameServers\\neoforge-server",
          jar: "",
          launchMode: "argfile",
          argFiles: ["user_jvm_args.txt", "libraries/net/neoforged/neoforge/21.1.172/win_args.txt"],
          javaPath: "C:\\Program Files\\Eclipse Adoptium\\jdk-21\\bin\\java.exe",
        },
      })
    );
    expect(res.status).toBe(200);
    expect(registry.addServer).toHaveBeenCalled();
  });

  it("DELETE maps a refused file deletion to 400, not 404", async () => {
    registry.removeServer.mockResolvedValue({
      success: false,
      message: "Refusing to delete files in ...",
      reason: "unsafe-delete",
    });
    const res = await DELETE(jsonRequest("DELETE", { serverId: "hytale", deleteFiles: true }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ success: false, message: "Refusing to delete files in ..." });
  });

  it("DELETE still 404s an unknown server", async () => {
    registry.removeServer.mockResolvedValue({ success: false, message: "Server not found", reason: "not-found" });
    const res = await DELETE(jsonRequest("DELETE", { serverId: "nope" }));
    expect(res.status).toBe(404);
  });
});
