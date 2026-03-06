import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const DOCS_MAP: Record<string, string> = {
  readme: path.join(process.cwd(), "README.md"),
  "manual/00-preface": path.join(process.cwd(), "src", "den-operators-manual", "00-preface.md"),
  "manual/01-spirit-hall": path.join(process.cwd(), "src", "den-operators-manual", "01-spirit-hall.md"),
  "manual/02-architecture": path.join(process.cwd(), "src", "den-operators-manual", "02-architecture.md"),
  "manual/03-spirits": path.join(process.cwd(), "src", "den-operators-manual", "03-spirits.md"),
  "manual/04-operations": path.join(process.cwd(), "src", "den-operators-manual", "04-operations.md"),
  "manual/05-troubleshooting": path.join(process.cwd(), "src", "den-operators-manual", "05-troubleshooting.md"),
  "manual/06-lantern-hall": path.join(process.cwd(), "src", "den-operators-manual", "06-lantern-hall.md"),
  "manual/07-appendices": path.join(process.cwd(), "src", "den-operators-manual", "07-appendices.md"),
};

export async function GET(request: NextRequest) {
  const key = request.nextUrl.searchParams.get("file") || "readme";
  const filePath = DOCS_MAP[key];
  if (!filePath) {
    return NextResponse.json({ error: "Unknown document" }, { status: 404 });
  }

  try {
    const content = fs.readFileSync(filePath, "utf-8");
    return NextResponse.json({ content });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to read doc";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
