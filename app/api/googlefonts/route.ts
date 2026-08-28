// Liefert die Liste der Google-Schriften an den Editor.
// Google setzt auf diesem Endpunkt keinen CORS-Header, deshalb holt der Server sie
// und reicht sie weiter. Die Schriftdateien selbst lädt der Browser später direkt
// von fonts.gstatic.com — die erlauben CORS.

export const revalidate = 86400; // einmal am Tag reicht

type Familie = { family: string; category?: string; fonts?: Record<string, unknown> };

export async function GET() {
  try {
    const antwort = await fetch("https://fonts.google.com/metadata/fonts", {
      headers: { "User-Agent": "Mozilla/5.0" },
      next: { revalidate: 86400 },
    });
    if (!antwort.ok) throw new Error(`HTTP ${antwort.status}`);
    const roh = await antwort.json();
    const liste = (roh.familyMetadataList ?? []) as Familie[];

    // Nur was der Editor braucht: Name, Kategorie und die verfügbaren Schnitte
    const schlank = liste.map((f) => ({
      name: f.family,
      kategorie: f.category ?? "",
      schnitte: Object.keys(f.fonts ?? {}),
    }));

    return Response.json({ schriften: schlank }, {
      headers: { "Cache-Control": "public, max-age=86400" },
    });
  } catch (e) {
    return Response.json({ schriften: [], fehler: (e as Error).message }, { status: 502 });
  }
}
