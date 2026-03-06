import { NextRequest, NextResponse } from "next/server";
import { getAdapter, getDefaultServerId } from "@/lib/adapters/adapter-registry";
import { SevenDaysAdapter } from "@/lib/adapters/seven-days-adapter";
import fs from "fs";
import path from "path";

function getServerId(request: NextRequest): string {
  return request.nextUrl.searchParams.get("server") || getDefaultServerId();
}

export async function GET(request: NextRequest) {
  const adapter = getAdapter(getServerId(request));
  if (!adapter) {
    return NextResponse.json({ error: "Unknown server" }, { status: 404 });
  }

  const players = await adapter.getPlayers();
  if (adapter.def.type === "7d2d" && adapter instanceof SevenDaysAdapter) {
    const adminData = adapter.getAdminData();
    const adminFilePath = adapter.getAdminFilePath();
    return NextResponse.json({
      ...players,
      adminData,
      adminFilePath: adminFilePath || null,
    });
  }
  if (adapter.def.type === "minecraft") {
    const userCachePath = path.join(adapter.def.dir, "usercache.json");
    let userCache: unknown[] = [];
    try {
      const raw = fs.readFileSync(userCachePath, "utf-8");
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        userCache = parsed;
      }
    } catch {
      // ignore
    }
    return NextResponse.json({ ...players, userCache });
  }
  return NextResponse.json(players);
}

export async function POST(request: NextRequest) {
  const adapter = getAdapter(getServerId(request));
  if (!adapter) {
    return NextResponse.json({ error: "Unknown server" }, { status: 404 });
  }

  const body = await request.json();
  const { action: playerAction, uuid, op, name } = body;

  // 7D2D admin operations
  if (adapter.def.type === "7d2d" && adapter instanceof SevenDaysAdapter) {
    const adminData = adapter.getAdminData();

    switch (playerAction) {
      case "admin-add": {
        const { platform, userId, permissionLevel } = body;
        if (!userId) {
          return NextResponse.json({ success: false, message: "User ID is required" }, { status: 400 });
        }
        if (!adminData.users.some((u) => u.userId === userId)) {
          adminData.users.push({
            platform: platform || "Steam",
            userId,
            name: name || "",
            permissionLevel: permissionLevel ?? 0,
          });
        } else {
          // Update existing
          const existing = adminData.users.find((u) => u.userId === userId);
          if (existing) {
            existing.name = name || existing.name;
            existing.permissionLevel = permissionLevel ?? existing.permissionLevel;
          }
        }
        const result = adapter.saveAdminData(adminData);
        return NextResponse.json(result);
      }
      case "admin-remove": {
        const { userId } = body;
        adminData.users = adminData.users.filter((u) => u.userId !== userId);
        const result = adapter.saveAdminData(adminData);
        return NextResponse.json(result);
      }
      case "whitelist-add": {
        const { platform, userId } = body;
        if (!userId) {
          return NextResponse.json({ success: false, message: "User ID is required" }, { status: 400 });
        }
        if (!adminData.whitelist.some((w) => w.userId === userId)) {
          adminData.whitelist.push({
            platform: platform || "Steam",
            userId,
            name: name || "",
          });
        }
        const result = adapter.saveAdminData(adminData);
        return NextResponse.json(result);
      }
      case "whitelist-remove": {
        const { userId } = body;
        adminData.whitelist = adminData.whitelist.filter((w) => w.userId !== userId);
        const result = adapter.saveAdminData(adminData);
        return NextResponse.json(result);
      }
      case "blacklist-add": {
        const { platform, userId, reason } = body;
        if (!userId) {
          return NextResponse.json({ success: false, message: "User ID is required" }, { status: 400 });
        }
        if (!adminData.blacklist.some((b) => b.userId === userId)) {
          adminData.blacklist.push({
            platform: platform || "Steam",
            userId,
            name: name || "",
            unbanDate: "",
            reason: reason || "Banned via Dashboard",
          });
        }
        const result = adapter.saveAdminData(adminData);
        return NextResponse.json(result);
      }
      case "blacklist-remove": {
        const { userId } = body;
        adminData.blacklist = adminData.blacklist.filter((b) => b.userId !== userId);
        const result = adapter.saveAdminData(adminData);
        return NextResponse.json(result);
      }
      case "command-update": {
        const { cmd, permissionLevel } = body;
        if (!cmd) {
          return NextResponse.json({ success: false, message: "Command name is required" }, { status: 400 });
        }
        const existing = adminData.commands.find((c) => c.cmd === cmd);
        if (existing) {
          existing.permissionLevel = permissionLevel ?? existing.permissionLevel;
        } else {
          adminData.commands.push({ cmd, permissionLevel: permissionLevel ?? 0 });
        }
        const result = adapter.saveAdminData(adminData);
        return NextResponse.json(result);
      }
      case "command-remove": {
        const { cmd } = body;
        adminData.commands = adminData.commands.filter((c) => c.cmd !== cmd);
        const result = adapter.saveAdminData(adminData);
        return NextResponse.json(result);
      }
      default:
        return NextResponse.json({ success: false, message: "Unknown 7D2D action" }, { status: 400 });
    }
  }

  // Hytale OP toggle
  if (adapter.def.type === "hytale" && playerAction === "toggle-op") {
    const permsPath = path.join(adapter.def.dir, "permissions.json");
    try {
      const raw = fs.readFileSync(permsPath, "utf-8");
      const perms = JSON.parse(raw);

      fs.writeFileSync(permsPath + ".bak", raw);

      if (!perms.users) perms.users = {};
      if (!perms.users[uuid]) perms.users[uuid] = { groups: ["Adventure"] };

      const groups: string[] = perms.users[uuid].groups || [];

      if (op) {
        if (!groups.includes("OP")) groups.push("OP");
      } else {
        const idx = groups.indexOf("OP");
        if (idx !== -1) groups.splice(idx, 1);
      }

      perms.users[uuid].groups = groups;
      if (!perms.groups) perms.groups = {};
      if (!perms.groups.OP) perms.groups.OP = ["*"];

      fs.writeFileSync(permsPath, JSON.stringify(perms, null, 2));
      return NextResponse.json({ success: true, groups });
    } catch (e) {
      return NextResponse.json({ success: false, error: (e as Error).message }, { status: 500 });
    }
  }

  if (adapter.def.type === "minecraft") {
    const serverDir = adapter.def.dir;
    const opsPath = path.join(serverDir, "ops.json");
    const wlPath = path.join(serverDir, "whitelist.json");
    const bannedPath = path.join(serverDir, "banned-players.json");
    const userCachePath = path.join(serverDir, "usercache.json");

    const readJsonArray = (filePath: string) => {
      try {
        const raw = fs.readFileSync(filePath, "utf-8");
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    };

    const writeJsonArray = (filePath: string, data: unknown[]) => {
      try {
        if (fs.existsSync(filePath)) {
          fs.writeFileSync(filePath + ".bak", fs.readFileSync(filePath, "utf-8"));
        }
      } catch {
        // ignore backup errors
      }
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    };

    const resolveUuid = (playerName: string, extra: { uuid?: string; name?: string }[]) => {
      const cache = readJsonArray(userCachePath) as { name?: string; uuid?: string }[];
      const fromCache = cache.find((p) => p.name?.toLowerCase() === playerName.toLowerCase());
      if (fromCache?.uuid) return fromCache.uuid;
      const fromExtra = extra.find((p) => p.name?.toLowerCase() === playerName.toLowerCase());
      return fromExtra?.uuid || "";
    };

    const resolveName = (playerUuid: string, extra: { uuid?: string; name?: string }[]) => {
      const cache = readJsonArray(userCachePath) as { name?: string; uuid?: string }[];
      const fromCache = cache.find((p) => p.uuid?.toLowerCase() === playerUuid.toLowerCase());
      if (fromCache?.name) return fromCache.name;
      const fromExtra = extra.find((p) => p.uuid?.toLowerCase() === playerUuid.toLowerCase());
      return fromExtra?.name || "";
    };

    const ops = readJsonArray(opsPath) as { uuid?: string; name?: string; level?: number; bypassesPlayerLimit?: boolean }[];
    const whitelist = readJsonArray(wlPath) as { uuid?: string; name?: string }[];
    const bans = readJsonArray(bannedPath) as { uuid?: string; name?: string; created?: string; source?: string; expires?: string; reason?: string }[];

    const resolvedUuid =
      uuid ||
      (name ? resolveUuid(name, [...ops, ...whitelist, ...bans]) : "");
    const resolvedName =
      name ||
      (resolvedUuid ? resolveName(resolvedUuid, [...ops, ...whitelist, ...bans]) : "");

    switch (playerAction) {
      case "whitelist-add": {
        if (!resolvedUuid) {
          return NextResponse.json({ success: false, message: "Missing UUID. Add the player once or provide UUID." }, { status: 400 });
        }
        if (!whitelist.some((p) => p.uuid === resolvedUuid)) {
          whitelist.push({ uuid: resolvedUuid, name: resolvedName || "Unknown" });
          writeJsonArray(wlPath, whitelist);
        }
        return NextResponse.json({ success: true });
      }
      case "whitelist-remove": {
        if (!resolvedUuid && !resolvedName) {
          return NextResponse.json({ success: false, message: "Missing player identifier" }, { status: 400 });
        }
        const filtered = whitelist.filter(
          (p) =>
            (resolvedUuid ? p.uuid !== resolvedUuid : true) &&
            (resolvedName ? p.name?.toLowerCase() !== resolvedName.toLowerCase() : true)
        );
        writeJsonArray(wlPath, filtered);
        return NextResponse.json({ success: true });
      }
      case "op-add": {
        if (!resolvedUuid) {
          return NextResponse.json({ success: false, message: "Missing UUID. Add the player once or provide UUID." }, { status: 400 });
        }
        if (!ops.some((p) => p.uuid === resolvedUuid)) {
          ops.push({
            uuid: resolvedUuid,
            name: resolvedName || "Unknown",
            level: 4,
            bypassesPlayerLimit: false,
          });
          writeJsonArray(opsPath, ops);
        }
        return NextResponse.json({ success: true });
      }
      case "op-remove": {
        if (!resolvedUuid && !resolvedName) {
          return NextResponse.json({ success: false, message: "Missing player identifier" }, { status: 400 });
        }
        const filtered = ops.filter(
          (p) =>
            (resolvedUuid ? p.uuid !== resolvedUuid : true) &&
            (resolvedName ? p.name?.toLowerCase() !== resolvedName.toLowerCase() : true)
        );
        writeJsonArray(opsPath, filtered);
        return NextResponse.json({ success: true });
      }
      case "ban-add": {
        if (!resolvedUuid) {
          return NextResponse.json({ success: false, message: "Missing UUID. Add the player once or provide UUID." }, { status: 400 });
        }
        if (!bans.some((p) => p.uuid === resolvedUuid)) {
          bans.push({
            uuid: resolvedUuid,
            name: resolvedName || "Unknown",
            created: new Date().toISOString(),
            source: "Dashboard",
            expires: "forever",
            reason: "Banned by an operator.",
          });
          writeJsonArray(bannedPath, bans);
        }
        return NextResponse.json({ success: true });
      }
      case "ban-remove": {
        if (!resolvedUuid && !resolvedName) {
          return NextResponse.json({ success: false, message: "Missing player identifier" }, { status: 400 });
        }
        const filtered = bans.filter(
          (p) =>
            (resolvedUuid ? p.uuid !== resolvedUuid : true) &&
            (resolvedName ? p.name?.toLowerCase() !== resolvedName.toLowerCase() : true)
        );
        writeJsonArray(bannedPath, filtered);
        return NextResponse.json({ success: true });
      }
      default:
        return NextResponse.json({ success: false, message: "Unknown action" }, { status: 400 });
    }
  }

  return NextResponse.json({ success: false, message: "Unknown action" }, { status: 400 });
}
