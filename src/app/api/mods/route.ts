import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { getAdapter, getDefaultServerId } from "@/lib/adapters/adapter-registry";

function getServerId(request: NextRequest): string {
  return request.nextUrl.searchParams.get("server") || getDefaultServerId();
}

function getModsDir(adapter: { def: { dir: string; modsDir?: string } }): string {
  return path.join(adapter.def.dir, adapter.def.modsDir || "mods");
}

async function getDirSize(dirPath: string): Promise<number> {
  let total = 0;
  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dirPath, entry.name);
    if (entry.isFile()) {
      const stat = await fs.stat(full);
      total += stat.size;
    } else if (entry.isDirectory()) {
      total += await getDirSize(full);
    }
  }
  return total;
}

async function parseModInfoXml(
  modDir: string
): Promise<{ displayName?: string; version?: string; author?: string }> {
  try {
    const xmlPath = path.join(modDir, "ModInfo.xml");
    const xml = await fs.readFile(xmlPath, "utf8");
    const getName = xml.match(/<Name\s+value="([^"]*)"/);
    const getVersion = xml.match(/<Version\s+value="([^"]*)"/);
    const getAuthor = xml.match(/<Author\s+value="([^"]*)"/);
    return {
      displayName: getName?.[1] || undefined,
      version: getVersion?.[1] || undefined,
      author: getAuthor?.[1] || undefined,
    };
  } catch {
    return {};
  }
}

export async function GET(request: NextRequest) {
  const adapter = getAdapter(getServerId(request));
  if (!adapter || !adapter.capabilities.hasMods) {
    return NextResponse.json({ error: "Mods not available for this server" }, { status: 404 });
  }

  const modsDir = getModsDir(adapter);
  try {
    const entries = await fs.readdir(modsDir, { withFileTypes: true });
    const files = await Promise.all(
      entries
        .filter((entry) => entry.isFile() || entry.isDirectory())
        .map(async (entry) => {
          const fullPath = path.join(modsDir, entry.name);
          if (entry.isDirectory()) {
            const size = await getDirSize(fullPath);
            const modInfo = await parseModInfoXml(fullPath);
            return {
              name: entry.name,
              sizeBytes: size,
              isDir: true,
              ...modInfo,
            };
          }
          const stat = await fs.stat(fullPath);
          return {
            name: entry.name,
            sizeBytes: stat.size,
            isDir: false,
          };
        })
    );
    return NextResponse.json({ files });
  } catch {
    return NextResponse.json({ files: [] });
  }
}

export async function POST(request: NextRequest) {
  const adapter = getAdapter(getServerId(request));
  if (!adapter || !adapter.capabilities.hasMods) {
    return NextResponse.json({ error: "Mods not available for this server" }, { status: 404 });
  }

  const formData = await request.formData();
  const uploads = formData.getAll("files").filter((f) => f instanceof File) as File[];
  if (uploads.length === 0) {
    return NextResponse.json({ success: false, message: "No files uploaded" }, { status: 400 });
  }

  const modsDir = getModsDir(adapter);
  await fs.mkdir(modsDir, { recursive: true });

  const saved: string[] = [];
  for (const file of uploads) {
    const safeName = path.basename(file.name);
    const buffer = Buffer.from(await file.arrayBuffer());

    if (safeName.endsWith(".zip")) {
      // Extract zip into mods directory
      try {
        const { default: AdmZip } = await import("adm-zip");
        const zip = new AdmZip(buffer);
        const zipEntries = zip.getEntries();

        // Determine if zip has a single root folder or loose files
        const topLevelNames = new Set<string>();
        for (const entry of zipEntries) {
          const parts = entry.entryName.split("/");
          if (parts[0]) topLevelNames.add(parts[0]);
        }

        if (topLevelNames.size === 1) {
          // Single root folder - extract as-is
          zip.extractAllTo(modsDir, true);
          saved.push(Array.from(topLevelNames)[0]);
        } else {
          // Multiple root items - wrap in folder named after zip
          const folderName = safeName.replace(/\.zip$/i, "");
          const extractDir = path.join(modsDir, folderName);
          await fs.mkdir(extractDir, { recursive: true });
          zip.extractAllTo(extractDir, true);
          saved.push(folderName);
        }
      } catch (e) {
        // If zip extraction fails, save as raw file
        await fs.writeFile(path.join(modsDir, safeName), buffer);
        saved.push(safeName);
      }
    } else {
      await fs.writeFile(path.join(modsDir, safeName), buffer);
      saved.push(safeName);
    }
  }

  return NextResponse.json({ success: true, files: saved });
}

export async function DELETE(request: NextRequest) {
  const adapter = getAdapter(getServerId(request));
  if (!adapter || !adapter.capabilities.hasMods) {
    return NextResponse.json({ error: "Mods not available for this server" }, { status: 404 });
  }

  let name = "";
  try {
    const body = (await request.json()) as { name?: string };
    name = body.name || "";
  } catch {
    // ignore
  }

  if (!name) {
    return NextResponse.json({ success: false, message: "Missing file name" }, { status: 400 });
  }

  const modsDir = getModsDir(adapter);
  const safeName = path.basename(name);
  const target = path.join(modsDir, safeName);

  try {
    const stat = await fs.stat(target);
    if (stat.isDirectory()) {
      await fs.rm(target, { recursive: true });
    } else {
      await fs.unlink(target);
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to delete mod";
    return NextResponse.json({ success: false, message: msg }, { status: 500 });
  }
}
