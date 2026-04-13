import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import fs from "fs";
import path from "path";
import { addServer, updateServer, removeServer, getAdapter, getAllAdapters } from "../lib/adapters/adapter-registry";

// Use a temp config file for tests
const TEST_CONFIG_PATH = path.join(process.cwd(), "servers.test.json");
const ORIGINAL_CONFIG_PATH = path.join(process.cwd(), "servers.json");

const baseConfig = {
  servers: [
    {
      id: "test-mc",
      name: "Test MC",
      type: "minecraft" as const,
      dir: "C:\\fake\\mc-server",
      gamePort: 25565,
      rconPort: 25575,
      rconPassword: "test",
      loader: "Fabric",
      version: "1.21.4",
      jar: "server.jar",
      launchMode: "jar" as const,
    },
  ],
  dashboard: { port: 3000 },
};

// We need to mock the config path since adapter-registry hardcodes process.cwd()
// Instead, we'll test the functions by writing a real temp config
describe("adapter-registry server management", () => {
  let originalContent: string;

  beforeEach(() => {
    // Save original servers.json
    try {
      originalContent = fs.readFileSync(ORIGINAL_CONFIG_PATH, "utf-8");
    } catch {
      originalContent = "";
    }
    // Write test config
    fs.writeFileSync(ORIGINAL_CONFIG_PATH, JSON.stringify(baseConfig, null, 2));
    // Clear cached config and adapters
    const g = globalThis as unknown as { __denConfig?: unknown; __denAdapters?: unknown };
    g.__denConfig = undefined;
    g.__denAdapters = undefined;
  });

  afterEach(() => {
    // Restore original servers.json
    if (originalContent) {
      fs.writeFileSync(ORIGINAL_CONFIG_PATH, originalContent);
    }
    const g = globalThis as unknown as { __denConfig?: unknown; __denAdapters?: unknown };
    g.__denConfig = undefined;
    g.__denAdapters = undefined;
  });

  describe("addServer", () => {
    it("adds a new server successfully", async () => {
      const result = await addServer({
        id: "test-7d2d",
        name: "Test 7D2D",
        type: "7d2d",
        dir: "C:\\fake\\7d2d-server",
        gamePort: 26900,
      } as any);

      expect(result.success).toBe(true);
      expect(result.message).toContain("Test 7D2D");

      // Verify it's in the config file
      const config = JSON.parse(fs.readFileSync(ORIGINAL_CONFIG_PATH, "utf-8"));
      expect(config.servers).toHaveLength(2);
      expect(config.servers[1].id).toBe("test-7d2d");
    });

    it("rejects duplicate server ID", async () => {
      const result = await addServer({
        id: "test-mc",
        name: "Duplicate",
        type: "minecraft",
        dir: "C:\\fake\\other",
      } as any);

      expect(result.success).toBe(false);
      expect(result.message).toContain("already exists");
    });

    it("rejects missing required fields", async () => {
      const result = await addServer({
        id: "no-name",
        name: "",
        type: "minecraft",
        dir: "C:\\fake\\other",
      } as any);

      expect(result.success).toBe(false);
      expect(result.message).toContain("Missing required fields");
    });

    it("creates an adapter for the new server", async () => {
      await addServer({
        id: "test-new",
        name: "New Server",
        type: "minecraft",
        dir: "C:\\fake\\new",
        gamePort: 25567,
      } as any);

      const adapter = getAdapter("test-new");
      expect(adapter).toBeDefined();
      expect(adapter!.def.name).toBe("New Server");
    });
  });

  describe("updateServer", () => {
    it("updates server fields", async () => {
      const result = await updateServer("test-mc", { name: "Renamed MC" });

      expect(result.success).toBe(true);
      const config = JSON.parse(fs.readFileSync(ORIGINAL_CONFIG_PATH, "utf-8"));
      expect(config.servers[0].name).toBe("Renamed MC");
    });

    it("does not allow changing id or type", async () => {
      await updateServer("test-mc", { id: "hacked", type: "7d2d" } as any);

      const config = JSON.parse(fs.readFileSync(ORIGINAL_CONFIG_PATH, "utf-8"));
      expect(config.servers[0].id).toBe("test-mc");
      expect(config.servers[0].type).toBe("minecraft");
    });

    it("returns error for unknown server", async () => {
      const result = await updateServer("nonexistent", { name: "X" });
      expect(result.success).toBe(false);
      expect(result.message).toContain("not found");
    });

    it("rebuilds adapter after update", async () => {
      await updateServer("test-mc", { name: "Updated Name" });
      const adapter = getAdapter("test-mc");
      expect(adapter!.def.name).toBe("Updated Name");
    });
  });

  describe("removeServer", () => {
    it("removes a server from config", async () => {
      const result = await removeServer("test-mc", false);

      expect(result.success).toBe(true);
      const config = JSON.parse(fs.readFileSync(ORIGINAL_CONFIG_PATH, "utf-8"));
      expect(config.servers).toHaveLength(0);
    });

    it("removes the adapter", async () => {
      // Ensure adapter exists first
      expect(getAdapter("test-mc")).toBeDefined();

      await removeServer("test-mc", false);
      expect(getAdapter("test-mc")).toBeUndefined();
    });

    it("returns error for unknown server", async () => {
      const result = await removeServer("nonexistent", false);
      expect(result.success).toBe(false);
    });
  });

  describe("getAllAdapters", () => {
    it("returns all configured adapters", () => {
      const adapters = getAllAdapters();
      expect(adapters).toHaveLength(1);
      expect(adapters[0].def.id).toBe("test-mc");
    });
  });
});
