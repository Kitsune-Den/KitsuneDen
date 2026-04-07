import { NextRequest, NextResponse } from "next/server";
import { getAdapter, getDefaultServerId } from "@/lib/adapters/adapter-registry";
import fs from "fs";
import path from "path";
import { exec } from "child_process";

function getServerId(request: NextRequest): string {
  return request.nextUrl.searchParams.get("server") || getDefaultServerId();
}

export async function GET(request: NextRequest) {
  const adapter = getAdapter(getServerId(request));
  if (!adapter) {
    return NextResponse.json({ error: "Unknown server" }, { status: 404 });
  }

  if (adapter.def.type === "hytale" || adapter.def.type === "palworld") {
    const backups = await (adapter as unknown as { getBackups: () => Promise<unknown> }).getBackups();
    return NextResponse.json(backups);
  }

  if (adapter.def.type !== "minecraft") {
    return NextResponse.json({ error: "Backups not available for this server" }, { status: 404 });
  }

  const backupsDir = path.join(adapter.def.dir, "backups");
  const listBackups = (type: "hourly" | "daily") => {
    const dir = path.join(backupsDir, type);
    try {
      const files = fs.readdirSync(dir).filter((f) => f.endsWith(".zip"));
      return files
        .map((f) => {
          const stat = fs.statSync(path.join(dir, f));
          return {
            name: f,
            size: `${(stat.size / 1024 / 1024).toFixed(1)} MB`,
            sizeBytes: stat.size,
            date: stat.mtime,
          };
        })
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    } catch {
      return [];
    }
  };

  return NextResponse.json({
    hourly: listBackups("hourly"),
    daily: listBackups("daily"),
  });
}

export async function POST(request: NextRequest) {
  const adapter = getAdapter(getServerId(request));
  if (!adapter) {
    return NextResponse.json({ error: "Unknown server" }, { status: 404 });
  }

  const body = await request.json();
  const type = body.type === "daily" ? "daily" : "hourly";

  if (adapter.def.type === "hytale" || adapter.def.type === "palworld") {
    const result = await (adapter as unknown as { runBackup: (type: string) => Promise<unknown> }).runBackup(type);
    return NextResponse.json(result);
  }

  if (adapter.def.type !== "minecraft") {
    return NextResponse.json({ error: "Backups not available for this server" }, { status: 404 });
  }

  const propsPath = path.join(adapter.def.dir, "server.properties");
  let levelName = "world";
  try {
    const content = fs.readFileSync(propsPath, "utf-8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIndex = trimmed.indexOf("=");
      if (eqIndex === -1) continue;
      const key = trimmed.substring(0, eqIndex);
      const value = trimmed.substring(eqIndex + 1);
      if (key === "level-name" && value) {
        levelName = value.trim();
      }
    }
  } catch {
    // ignore
  }

  const worldDir = path.join(adapter.def.dir, levelName);
  const modsDir = path.join(adapter.def.dir, "mods");
  const backupsDir = path.join(adapter.def.dir, "backups", type);
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupName = `minecraft-${adapter.def.id}-${timestamp}.zip`;
  const backupPath = path.join(backupsDir, backupName);

  const includePaths = [
    worldDir,
    modsDir,
    path.join(adapter.def.dir, "server.properties"),
    path.join(adapter.def.dir, "modpacks.json"),
    path.join(adapter.def.dir, "dashboard-config.json"),
  ].filter((p) => fs.existsSync(p));

  if (includePaths.length === 0) {
    return NextResponse.json({ success: false, message: "Nothing to back up." }, { status: 400 });
  }

  try {
    fs.mkdirSync(backupsDir, { recursive: true });
    const escapePs = (value: string) => value.replace(/'/g, "''");
    const pathArray = includePaths.map((p) => `'${escapePs(p)}'`).join(",");
    const cmd = `powershell -NoProfile -Command "Compress-Archive -Path @(${pathArray}) -DestinationPath '${escapePs(backupPath)}' -Force"`;
    await new Promise<void>((resolve, reject) => {
      exec(cmd, { timeout: 60000 }, (err) => (err ? reject(err) : resolve()));
    });
    return NextResponse.json({ success: true, message: "Backup completed." });
  } catch (e) {
    return NextResponse.json(
      { success: false, message: e instanceof Error ? e.message : "Backup failed." },
      { status: 500 }
    );
  }
}
