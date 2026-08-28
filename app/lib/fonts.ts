// Verwaltung eigener Schriften: TTF/OTF liegen in IndexedDB (zu groß für localStorage),
// fürs Gerät werden daraus .vlw-Dateien in der gewünschten Pixelgröße erzeugt.

import { buildVlw, registerFont, DEFAULT_CHARSET, type VlwResult } from "./vlw";

const DB = "slab-fonts";
const STORE = "dateien";

export type EigeneSchrift = {
  /** Kennung im Layout, z.B. "roboto-mono-400" */
  id: string;
  /** Anzeigename der Familie, z.B. "Roboto Mono" */
  name: string;
  /** Schnitt als Zahl (400 = normal, 700 = fett); fehlt bei hochgeladenen Dateien */
  schnitt?: string;
  /** Dateigröße der Ausgangsschrift */
  bytes: number;
};

/** Schnitt in Klartext */
export const schnittName = (s?: string) => ({
  "100": "Thin", "200": "ExtraLight", "300": "Light", "400": "Normal",
  "500": "Medium", "600": "SemiBold", "700": "Fett", "800": "ExtraBold", "900": "Black",
}[s ?? "400"] ?? `Stärke ${s}`);

function oeffnen(): Promise<IDBDatabase> {
  return new Promise((ok, fehler) => {
    const a = indexedDB.open(DB, 1);
    a.onupgradeneeded = () => { if (!a.result.objectStoreNames.contains(STORE)) a.result.createObjectStore(STORE); };
    a.onsuccess = () => ok(a.result);
    a.onerror = () => fehler(a.error);
  });
}

async function mit<T>(modus: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  const db = await oeffnen();
  return new Promise<T>((ok, fehler) => {
    const t = db.transaction(STORE, modus);
    const r = fn(t.objectStore(STORE));
    r.onsuccess = () => ok(r.result as T);
    r.onerror = () => fehler(r.error);
  });
}

/** Aus einem Dateinamen eine stabile, dateisystemtaugliche Kennung machen. */
export function schriftId(name: string) {
  return name.replace(/\.(ttf|otf|woff2?)$/i, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 24) || "schrift";
}

export async function schriftSpeichern(datei: File): Promise<EigeneSchrift> {
  const puffer = await datei.arrayBuffer();
  const id = schriftId(datei.name);
  await mit("readwrite", (s) => s.put(puffer, id));
  const liste = await schriftenListe();
  const eintrag: EigeneSchrift = { id, name: datei.name.replace(/\.[^.]+$/, ""), bytes: puffer.byteLength };
  const neu = [...liste.filter((f) => f.id !== id), eintrag];
  localStorage.setItem("slab:fonts", JSON.stringify(neu));
  return eintrag;
}

export async function schriftLesen(id: string): Promise<ArrayBuffer | undefined> {
  return mit<ArrayBuffer | undefined>("readonly", (s) => s.get(id));
}

export async function schriftLoeschen(id: string) {
  await mit("readwrite", (s) => s.delete(id));
  localStorage.setItem("slab:fonts", JSON.stringify((await schriftenListe()).filter((f) => f.id !== id)));
}

export async function schriftenListe(): Promise<EigeneSchrift[]> {
  try { return JSON.parse(localStorage.getItem("slab:fonts") ?? "[]"); } catch { return []; }
}

/** Schrift im Browser verfügbar machen, damit die Vorschau sie zeichnen kann. */
const geladen = new Set<string>();
export async function schriftBereitstellen(id: string): Promise<boolean> {
  if (geladen.has(id)) return true;
  const puffer = await schriftLesen(id);
  if (!puffer) return false;
  await registerFont(puffer, "slab-" + id);
  geladen.add(id);
  return true;
}

/** Familienname für CSS/Canvas — so heißt die Schrift nach dem Bereitstellen. */
export const cssName = (id: string) => `slab-${id}`;

/**
 * Erzeugt die .vlw-Datei für eine Schrift in einer bestimmten Pixelhöhe.
 * Der Dateiname auf dem Gerät ist "<id>-<px>" — genau das steht im Layout unter `vlw`.
 */
export async function vlwErzeugen(id: string, px: number, zeichen = DEFAULT_CHARSET): Promise<{ name: string; v: VlwResult } | null> {
  if (!(await schriftBereitstellen(id))) return null;
  return { name: geraeteName(id, px), v: buildVlw(cssName(id), px, zeichen, id) };
}

/** Name, unter dem die Schrift auf dem Gerät liegt (ohne .vlw). */
export const geraeteName = (id: string, px: number) => `${id}-${px}`;

/** Aus einem Gerätenamen wieder Kennung und Größe lesen. */
export function geraeteNameLesen(n?: string): { id: string; px: number } | null {
  const m = n?.match(/^(.+)-(\d+)$/);
  return m ? { id: m[1], px: Number(m[2]) } : null;
}


/* ---------------- Google-Schriften ---------------- */

export type GoogleSchrift = { name: string; kategorie: string; schnitte: string[] };

/** Liste aller Google-Schriften (über den eigenen Server, weil Google dort kein CORS setzt). */
export async function googleListe(): Promise<GoogleSchrift[]> {
  const a = await fetch("/api/googlefonts");
  if (!a.ok) throw new Error("Schriftliste nicht erreichbar");
  const d = await a.json();
  return (d.schriften ?? []) as GoogleSchrift[];
}

/** Eine einzelne Schnittdatei holen und ablegen. */
async function schnittHolen(familie: string, gewicht: string): Promise<EigeneSchrift | null> {
  const cssUrl = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(familie)}:wght@${gewicht}&display=swap`;
  const css = await fetch(cssUrl).then((r) => (r.ok ? r.text() : ""));
  if (!css) return null;

  // Google liefert die Schrift in Blöcken je Alphabet. Der erste ist Kyrillisch —
  // wir brauchen den mit dem Basis-Latein (U+0000-00FF), sonst fehlen alle Buchstaben.
  const bloecke = css.split("@font-face").slice(1);
  const passend = bloecke.find((b) => /unicode-range:[^;]*U\+0000-00FF/i.test(b))
    ?? bloecke.find((b) => !/unicode-range:/i.test(b))
    ?? bloecke[bloecke.length - 1];
  if (!passend) return null;
  const treffer = passend.match(/url\((https:[^)]+)\)/);
  if (!treffer) return null;

  const puffer = await fetch(treffer[1]).then((r) => r.arrayBuffer());
  const id = schriftId(`${familie}-${gewicht}`);
  await mit("readwrite", (st) => st.put(puffer, id));
  return { id, name: familie, schnitt: gewicht, bytes: puffer.byteLength };
}

/**
 * Holt eine ganze Schriftfamilie — alle angebotenen Schnitte auf einmal.
 * Danach lässt sich der Schnitt im Editor frei wählen, ohne erneut zu laden.
 */
export async function googleHolen(familie: string, schnitte: string[]): Promise<EigeneSchrift[]> {
  const gewichte = [...new Set(schnitte.filter((s) => !s.endsWith("i")).map((s) => s.replace(/\D/g, "") || "400"))]
    .sort((a, b) => Number(a) - Number(b));
  const geholt: EigeneSchrift[] = [];
  for (const g of gewichte.length ? gewichte : ["400"]) {
    const e = await schnittHolen(familie, g);
    if (e) { geholt.push(e); await schriftBereitstellen(e.id); }
  }
  if (!geholt.length) throw new Error(`Für „${familie}" ließ sich keine Datei laden`);
  const liste = await schriftenListe();
  const ohneAlte = liste.filter((f) => f.name !== familie);
  localStorage.setItem("slab:fonts", JSON.stringify([...ohneAlte, ...geholt]));
  return geholt;
}

/** Familien aus der abgelegten Schriftliste, mit ihren Schnitten. */
export function familienAus(liste: EigeneSchrift[]) {
  const map = new Map<string, EigeneSchrift[]>();
  for (const f of liste) {
    const k = f.name;
    map.set(k, [...(map.get(k) ?? []), f].sort((a, b) => Number(a.schnitt ?? 400) - Number(b.schnitt ?? 400)));
  }
  return [...map.entries()].map(([name, schnitte]) => ({ name, schnitte }));
}
