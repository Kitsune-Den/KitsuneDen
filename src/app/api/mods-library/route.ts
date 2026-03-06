import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { getAdapter, getDefaultServerId } from "@/lib/adapters/adapter-registry";

function getServerId(request: NextRequest): string {
  return request.nextUrl.searchParams.get("server") || getDefaultServerId();
}

function getLibraryDir(rootDir: string): string {
  return path.join(rootDir, "mods-library");
}

function getModsDir(rootDir: string): string {
  return path.join(rootDir, "mods");
}

export async function GET(request: NextRequest) {
  const adapter = getAdapter(getServerId(request));
  if (!adapter || !adapter.capabilities.hasModPacks) {
    return NextResponse.json({ error: "Mod library not available for this server" }, { status: 404 });
  }

  const libraryDir = getLibraryDir(adapter.def.dir);
  try {
    const entries = await fs.readdir(libraryDir, { withFileTypes: true });
    const files = entries
      .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".jar"))
      .map((entry) => entry.name)
      .sort((a, b) => a.localeCompare(b));
    return NextResponse.json({ files });
  } catch {
    return NextResponse.json({ files: [] });
  }
}

export async function POST(request: NextRequest) {
  const adapter = getAdapter(getServerId(request));
  if (!adapter || !adapter.capabilities.hasModPacks) {
    return NextResponse.json({ error: "Mod library not available for this server" }, { status: 404 });
  }

  const contentType = request.headers.get("content-type") || "";
  const libraryDir = getLibraryDir(adapter.def.dir);
  await fs.mkdir(libraryDir, { recursive: true });

  if (contentType.includes("application/json")) {
    const body = (await request.json()) as { action?: string; name?: string };
    if (body.action !== "add-from-mods" || !body.name) {
      return NextResponse.json({ success: false, message: "Invalid request" }, { status: 400 });
    }
    const safeName = path.basename(body.name);
    const sourcePath = path.join(getModsDir(adapter.def.dir), safeName);
    const targetPath = path.join(libraryDir, safeName);
    try {
      await fs.copyFile(sourcePath, targetPath);
      return NextResponse.json({ success: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Copy failed";
      return NextResponse.json({ success: false, message: msg }, { status: 500 });
    }
  }

  const formData = await request.formData();
  const uploads = formData.getAll("files").filter((f) => f instanceof File) as File[];
  if (uploads.length === 0) {
    return NextResponse.json({ success: false, message: "No files uploaded" }, { status: 400 });
  }

  const saved: string[] = [];
  for (const file of uploads) {
    const safeName = path.basename(file.name);
    const buffer = Buffer.from(await file.arrayBuffer());
    await fs.writeFile(path.join(libraryDir, safeName), buffer);
    saved.push(safeName);
  }

  return NextResponse.json({ success: true, files: saved });
}
