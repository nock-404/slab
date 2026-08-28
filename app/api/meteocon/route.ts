// Liefert ein Meteocons-Symbol als SVG an den Editor.
// Die Dateien liegen im Paket @bybas/weather-icons; der Browser kommt da nicht ran,
// deshalb liest der Server sie und nimmt dabei die Animationen heraus.

import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";

const WURZEL = path.join(process.cwd(), "node_modules", "@bybas", "weather-icons", "production");

export async function GET(req: NextRequest) {
  const name = (req.nextUrl.searchParams.get("name") ?? "").replace(/[^a-z0-9-]/gi, "");
  const stil = req.nextUrl.searchParams.get("stil") === "line" ? "line" : "fill";
  const ohneAnimation = req.nextUrl.searchParams.get("statisch") === "1";
  if (!name) return NextResponse.json({ error: "name fehlt" }, { status: 400 });

  try {
    let svg = await fs.readFile(path.join(WURZEL, stil, "all", name + ".svg"), "utf8");
    // Im Editor bleibt die Animation drin — der Browser kann sie abspielen.
    // Nur fürs Gerät wird ein Standbild gebraucht.
    if (ohneAnimation) {
      svg = svg
        .replace(/<animate[^>]*\/>/g, "")
        .replace(/<animate[^>]*>[\s\S]*?<\/animate>/g, "")
        .replace(/<animateTransform[^>]*\/>/g, "")
        .replace(/<animateTransform[^>]*>[\s\S]*?<\/animateTransform>/g, "")
        .replace(/<animateMotion[^>]*\/>/g, "");
    }
    // Die Symbole benennen ihre Verläufe alle gleich ("a", "b", …). Liegen mehrere
    // davon auf einer Seite, greift jedes auf die Verläufe des ersten zu — die Sonne
    // würde grau. Deshalb je Symbol eindeutig machen.
    const marke = name.replace(/[^a-z0-9]/gi, "") + "-";
    svg = svg
      .replace(/\bid="([^"]+)"/g, (_, k) => `id="${marke}${k}"`)
      .replace(/url\(#([^)]+)\)/g, (_, k) => `url(#${marke}${k})`)
      .replace(/\b(xlink:href|href)="#([^"]+)"/g, (_, a, k) => `${a}="#${marke}${k}"`);

    return new NextResponse(svg, {
      headers: { "content-type": "image/svg+xml", "cache-control": "no-store" },   // sonst hängt eine alte Fassung fest
    });
  } catch {
    return NextResponse.json({ error: `Symbol „${name}" nicht gefunden` }, { status: 404 });
  }
}
