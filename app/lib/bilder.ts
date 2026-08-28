// Bilder und QR-Codes fürs Gerät vorbereiten.
//
// Das Display kann keine PNGs dekodieren, deshalb rechnet der Builder um:
// Jedes Bild wird zu einem Rohbild in RGB565 (2 Byte je Pixel, wie der Bildschirm
// selbst arbeitet). Vorne stehen Breite und Höhe als 16-Bit-Werte, dann folgen
// die Pixel zeilenweise. Die Firmware muss nur noch zeichnen.

import QRCode from "qrcode";

const DB = "slab-assets";
const STORE = "dateien";

export type Bild = { id: string; name: string; w: number; h: number; bytes: number };

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

/** Aus Bilddaten ein Rohbild in RGB565 machen. */
export function nachRgb565(daten: ImageData): Uint8Array {
  const { width: bw, height: bh, data } = daten;
  const out = new Uint8Array(4 + bw * bh * 2);
  // Kopf: Breite und Höhe, jeweils 16 Bit in der Reihenfolge, die der ESP32 erwartet
  out[0] = bw & 0xff; out[1] = (bw >> 8) & 0xff;
  out[2] = bh & 0xff; out[3] = (bh >> 8) & 0xff;
  let o = 4;
  for (let i = 0; i < bw * bh; i++) {
    const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2], a = data[i * 4 + 3];
    // Durchsichtiges wird schwarz — das Display kennt keine Transparenz
    const f = a / 255;
    const p = (((r * f) & 0xf8) << 8) | (((g * f) & 0xfc) << 3) | ((b * f) >> 3);
    out[o++] = p & 0xff; out[o++] = (p >> 8) & 0xff;
  }
  return out;
}

/**
 * Mehrere Einzelbilder in eine Datei — für bewegte Symbole.
 * Der Kopf bleibt derselbe wie beim Standbild; wie viele Bilder folgen, ergibt
 * sich aus der Dateigröße. Ältere Dateien mit nur einem Bild passen damit weiter.
 */
export function nachRgb565Film(folge: ImageData[]): Uint8Array {
  const teile = folge.map(nachRgb565);
  if (teile.length === 1) return teile[0];
  const out = new Uint8Array(4 + teile.reduce((s, t) => s + t.length - 4, 0));
  out.set(teile[0].subarray(0, 4), 0);
  let o = 4;
  for (const t of teile) { out.set(t.subarray(4), o); o += t.length - 4; }
  return out;
}

/** Bilddatei auf eine Zielgröße bringen und als Rohbild ablegen. */
export async function bildSpeichern(datei: File, zielW: number, zielH: number): Promise<Bild> {
  const bitmap = await createImageBitmap(datei);
  const cv = document.createElement("canvas");
  cv.width = Math.max(1, Math.min(480, Math.round(zielW)));
  cv.height = Math.max(1, Math.min(480, Math.round(zielH)));
  const ctx = cv.getContext("2d", { willReadFrequently: true })!;
  // Seitenverhältnis erhalten, Rest bleibt schwarz
  const s = Math.min(cv.width / bitmap.width, cv.height / bitmap.height);
  const bw = bitmap.width * s, bh = bitmap.height * s;
  ctx.drawImage(bitmap, (cv.width - bw) / 2, (cv.height - bh) / 2, bw, bh);
  const roh = nachRgb565(ctx.getImageData(0, 0, cv.width, cv.height));

  const id = datei.name.replace(/\.[^.]+$/, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 20) || "bild";
  await mit("readwrite", (st) => st.put(roh, id));
  const eintrag: Bild = { id, name: datei.name.replace(/\.[^.]+$/, ""), w: cv.width, h: cv.height, bytes: roh.length };
  const liste = await bilderListe();
  localStorage.setItem("slab:assets", JSON.stringify([...liste.filter((b) => b.id !== id), eintrag]));
  return eintrag;
}

export async function bilderListe(): Promise<Bild[]> {
  try { return JSON.parse(localStorage.getItem("slab:assets") ?? "[]"); } catch { return []; }
}
export async function bildLesen(id: string): Promise<Uint8Array | undefined> {
  return mit<Uint8Array | undefined>("readonly", (s) => s.get(id));
}
export async function bildLoeschen(id: string) {
  await mit("readwrite", (s) => s.delete(id));
  localStorage.setItem("slab:assets", JSON.stringify((await bilderListe()).filter((b) => b.id !== id)));
}

/** Vorschau als Data-URL, damit der Editor das Bild zeigen kann. */
export async function bildVorschau(id: string): Promise<string | null> {
  const roh = await bildLesen(id);
  if (!roh || roh.length < 4) return null;
  const bw = roh[0] | (roh[1] << 8), bh = roh[2] | (roh[3] << 8);
  const cv = document.createElement("canvas");
  cv.width = bw; cv.height = bh;
  const ctx = cv.getContext("2d")!;
  const bild = ctx.createImageData(bw, bh);
  for (let i = 0; i < bw * bh; i++) {
    const p = roh[4 + i * 2] | (roh[5 + i * 2] << 8);
    bild.data[i * 4] = ((p >> 8) & 0xf8) | 0x07;
    bild.data[i * 4 + 1] = ((p >> 3) & 0xfc) | 0x03;
    bild.data[i * 4 + 2] = ((p << 3) & 0xf8) | 0x07;
    bild.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(bild, 0, 0);
  return cv.toDataURL();
}

/** QR-Code als Rohbild erzeugen — schwarz auf weiß, damit Lesegeräte klarkommen. */
export async function qrErzeugen(inhalt: string, groesse: number): Promise<Uint8Array> {
  const seite = Math.max(21, Math.min(320, Math.round(groesse)));
  const cv = document.createElement("canvas");
  await QRCode.toCanvas(cv, inhalt || " ", {
    width: seite, margin: 1,
    color: { dark: "#000000ff", light: "#ffffffff" },
    errorCorrectionLevel: "M",
  });
  const ctx = cv.getContext("2d", { willReadFrequently: true })!;
  return nachRgb565(ctx.getImageData(0, 0, cv.width, cv.height));
}
