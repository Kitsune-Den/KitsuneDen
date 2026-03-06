import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { getAdapter, getDefaultServerId } from "@/lib/adapters/adapter-registry";

function getServerId(request: NextRequest): string {
  return request.nextUrl.searchParams.get("server") || getDefaultServerId();
}

function getModpackPath(rootDir: string): string {
  return path.join(rootDir, "modpacks.json");
}

function getLibraryDir(rootDir: string): string {
  return path.join(rootDir, "mods-library");
}

type ModPack = {
  id: string;
  name: string;
  description?: string;
  mods: string[];
};

type ModPackFile = {
  activePackId?: string;
  packs: ModPack[];
};

async function readModpacks(rootDir: string): Promise<ModPackFile> {
  try {
    const raw = await fs.readFile(getModpackPath(rootDir), "utf-8");
    const parsed = JSON.parse(raw) as ModPackFile;
    if (!parsed.packs) parsed.packs = [];
    return parsed;
  } catch {
    return { packs: [], activePackId: "" };
  }
}

async function writeModpacks(rootDir: string, data: ModPackFile) {
  const modpackPath = getModpackPath(rootDir);
  try {
    const current = await fs.readFile(modpackPath, "utf-8");
    await fs.writeFile(modpackPath + ".bak", current);
  } catch {
    // ignore
  }
  await fs.writeFile(modpackPath, JSON.stringify(data, null, 2));
}

function slugifyName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "");
}

function ensureUniqueId(base: string, packs: ModPack[]): string {
  if (!packs.some((p) => p.id === base)) return base;
  let idx = 2;
  while (packs.some((p) => p.id === `${base}-${idx}`)) {
    idx += 1;
  }
  return `${base}-${idx}`;
}

export async function GET(request: NextRequest) {
  const adapter = getAdapter(getServerId(request));
  if (!adapter || !adapter.capabilities.hasModPacks) {
    return NextResponse.json({ error: "Mod packs not available for this server" }, { status: 404 });
  }

  const data = await readModpacks(adapter.def.dir);
  let libraryMods: string[] = [];
  try {
    const entries = await fs.readdir(getLibraryDir(adapter.def.dir), { withFileTypes: true });
    libraryMods = entries
      .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".jar"))
      .map((entry) => entry.name)
      .sort((a, b) => a.localeCompare(b));
  } catch {
    libraryMods = [];
  }

  return NextResponse.json({
    packs: data.packs || [],
    activePackId: data.activePackId || "",
    libraryMods,
  });
}

export async function POST(request: NextRequest) {
  const adapter = getAdapter(getServerId(request));
  if (!adapter || !adapter.capabilities.hasModPacks) {
    return NextResponse.json({ error: "Mod packs not available for this server" }, { status: 404 });
  }

  const body = (await request.json()) as Partial<ModPack> & { action?: string };
  if (body.action === "activate") {
    const packId = (body.id || "").trim();
    if (!packId) {
      return NextResponse.json({ success: false, message: "Missing pack id" }, { status: 400 });
    }

    const data = await readModpacks(adapter.def.dir);
    const pack = (data.packs || []).find((p) => p.id === packId);
    if (!pack) {
      return NextResponse.json({ success: false, message: "Pack not found" }, { status: 404 });
    }

    const modsDir = path.join(adapter.def.dir, "mods");
    const libraryDir = getLibraryDir(adapter.def.dir);
    await fs.mkdir(modsDir, { recursive: true });

    const missing: string[] = [];
    for (const modName of pack.mods) {
      const safeName = path.basename(modName);
      const sourcePath = path.join(libraryDir, safeName);
      const targetPath = path.join(modsDir, safeName);
      try {
        await fs.copyFile(sourcePath, targetPath);
      } catch {
        missing.push(safeName);
      }
    }

    await writeModpacks(adapter.def.dir, { ...data, activePackId: packId });
    return NextResponse.json({ success: true, missing });
  }

  const name = (body.name || "").trim();
  if (!name) {
    return NextResponse.json({ success: false, message: "Pack name is required" }, { status: 400 });
  }

  const data = await readModpacks(adapter.def.dir);
  const packs = data.packs || [];
  const safeMods = Array.isArray(body.mods) ? body.mods.map((m) => path.basename(m)) : [];
  let id = (body.id || "").trim();
  if (!id) {
    const base = slugifyName(name) || "modpack";
    id = ensureUniqueId(base, packs);
  }

  const existing = packs.find((p) => p.id === id);
  if (existing) {
    existing.name = name;
    existing.description = body.description || "";
    existing.mods = safeMods;
  } else {
    packs.push({ id, name, description: body.description || "", mods: safeMods });
  }

  await writeModpacks(adapter.def.dir, { ...data, packs });
  return NextResponse.json({ success: true, pack: packs.find((p) => p.id === id) });
}

export async function DELETE(request: NextRequest) {
  const adapter = getAdapter(getServerId(request));
  if (!adapter || !adapter.capabilities.hasModPacks) {
    return NextResponse.json({ error: "Mod packs not available for this server" }, { status: 404 });
  }

  let id = "";
  try {
    const body = (await request.json()) as { id?: string };
    id = body.id || "";
  } catch {
    // ignore
  }

  if (!id) {
    return NextResponse.json({ success: false, message: "Missing pack id" }, { status: 400 });
  }

  const data = await readModpacks(adapter.def.dir);
  const packs = (data.packs || []).filter((p) => p.id !== id);
  const activePackId = data.activePackId === id ? "" : data.activePackId;
  await writeModpacks(adapter.def.dir, { ...data, packs, activePackId });

  return NextResponse.json({ success: true });
}
