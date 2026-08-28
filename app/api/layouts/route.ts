// Template-Persistenz: JSON-Dateien unter ./layouts (git-freundlich, kein DB-Overhead)
import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";

const DIR = path.join(process.cwd(), "layouts");
const safe = (n: string) => n.replace(/[^\w\-. äöüÄÖÜß]/g, "").trim();

export async function GET(req: NextRequest) {
  await fs.mkdir(DIR, { recursive: true });
  const name = req.nextUrl.searchParams.get("name");
  if (!name) {
    const files = (await fs.readdir(DIR)).filter((f) => f.endsWith(".json"));
    return NextResponse.json({ templates: files.map((f) => f.slice(0, -5)).sort() });
  }
  try {
    const txt = await fs.readFile(path.join(DIR, safe(name) + ".json"), "utf8");
    return new NextResponse(txt, { headers: { "content-type": "application/json" } });
  } catch {
    return NextResponse.json({ error: "nicht gefunden" }, { status: 404 });
  }
}

export async function POST(req: NextRequest) {
  await fs.mkdir(DIR, { recursive: true });
  const { name, layout } = await req.json();
  const n = safe(String(name ?? ""));
  if (!n) return NextResponse.json({ error: "name fehlt" }, { status: 400 });
  await fs.writeFile(path.join(DIR, n + ".json"), JSON.stringify(layout, null, 2));
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const n = safe(String(req.nextUrl.searchParams.get("name") ?? ""));
  if (!n) return NextResponse.json({ error: "name fehlt" }, { status: 400 });
  try { await fs.unlink(path.join(DIR, n + ".json")); } catch { /* weg ist weg */ }
  return NextResponse.json({ ok: true });
}
