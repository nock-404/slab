// Erzeugt .vlw-Schriften (TFT_eSPI "Smooth Fonts") aus einer beliebigen TTF/OTF.
//
// Format laut TFT_eSPI/Extensions/Smooth_font.cpp — alle Zahlen 32 Bit, BIG ENDIAN:
//   Kopf, 24 Bytes:  gCount | version(11) | fontSize | 0 | ascent | descent
//   je Glyph, 28 B:  unicode | height | width | gxAdvance | dY | dX | 0
//   danach:          die Bitmaps, je Pixel 1 Byte Alpha (0x00 = Hintergrund)
//   Abschluss:       1 B Namenslänge + Name, 1 B PS-Namenslänge + PS-Name, 1 B geglättet(1)
//
// dY = Abstand von der Grundlinie zur Oberkante der Bitmap (positiv = nach oben)
// dX = Abstand von der Schreibposition zur linken Kante (negativ möglich, z.B. kursives "y")

/** Zeichen, die standardmäßig mitgeliefert werden: ASCII 32–126 plus deutsche Umlaute und €. */
export const DEFAULT_CHARSET =
  Array.from({ length: 95 }, (_, i) => String.fromCharCode(32 + i)).join("") + "äöüÄÖÜß€°±—…";

export type Glyph = {
  code: number;
  width: number;
  height: number;
  advance: number;
  dX: number;
  dY: number;
  bitmap: Uint8Array;
};

export type VlwResult = {
  data: Uint8Array;
  glyphs: number;
  ascent: number;
  descent: number;
  size: number;
  /** größte Bitmap-Höhe — praktisch für die Vorschau */
  maxHeight: number;
};

class BE {
  private parts: Uint8Array[] = [];
  private len = 0;
  int32(v: number) {
    const b = new Uint8Array(4);
    b[0] = (v >>> 24) & 0xff; b[1] = (v >>> 16) & 0xff; b[2] = (v >>> 8) & 0xff; b[3] = v & 0xff;
    this.parts.push(b); this.len += 4;
  }
  byte(v: number) { this.parts.push(new Uint8Array([v & 0xff])); this.len += 1; }
  bytes(b: Uint8Array) { this.parts.push(b); this.len += b.length; }
  ascii(s: string) { for (let i = 0; i < s.length; i++) this.byte(s.charCodeAt(i)); }
  finish(): Uint8Array {
    const out = new Uint8Array(this.len);
    let o = 0;
    for (const p of this.parts) { out.set(p, o); o += p.length; }
    return out;
  }
}

/** Die Schrift im Browser verfügbar machen; liefert den Namen, unter dem sie zeichenbar ist. */
export async function registerFont(file: ArrayBuffer, family: string): Promise<string> {
  const face = new FontFace(family, file);
  await face.load();
  (document as unknown as { fonts: FontFaceSet }).fonts.add(face);
  return family;
}

/** Ein Zeichen rastern: Alphawerte plus Lage relativ zur Grundlinie. */
function rasterize(ctx: CanvasRenderingContext2D, ch: string, pad: number, baseline: number): Glyph {
  const m = ctx.measureText(ch);
  const advance = Math.round(m.width);
  const cw = ctx.canvas.width, chh = ctx.canvas.height;
  ctx.clearRect(0, 0, cw, chh);
  ctx.fillStyle = "#fff";
  ctx.fillText(ch, pad, baseline);

  const img = ctx.getImageData(0, 0, cw, chh).data;
  let minX = cw, minY = chh, maxX = -1, maxY = -1;
  for (let y = 0; y < chh; y++) {
    for (let x = 0; x < cw; x++) {
      if (img[(y * cw + x) * 4 + 3] !== 0) {
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
      }
    }
  }
  // Leerzeichen und Co. haben keine Pixel — nur die Schreibweite zählt
  if (maxX < 0) return { code: ch.codePointAt(0)!, width: 0, height: 0, advance, dX: 0, dY: 0, bitmap: new Uint8Array(0) };

  const w = maxX - minX + 1, h = maxY - minY + 1;
  const bitmap = new Uint8Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      bitmap[y * w + x] = img[((minY + y) * cw + (minX + x)) * 4 + 3];

  return {
    code: ch.codePointAt(0)!,
    width: w, height: h, advance,
    dX: minX - pad,
    dY: baseline - minY,   // Grundlinie -> Oberkante, nach oben positiv
    bitmap,
  };
}

/**
 * Baut die .vlw-Datei.
 * @param family  Name, unter dem die Schrift per registerFont geladen wurde
 * @param sizePx  gewünschte Höhe in Pixeln
 * @param chars   Zeichenvorrat
 * @param name    Name, der in der Datei hinterlegt wird
 */
export function buildVlw(family: string, sizePx: number, chars = DEFAULT_CHARSET, name?: string): VlwResult {
  const uniq = Array.from(new Set(Array.from(chars))).sort((a, b) => a.codePointAt(0)! - b.codePointAt(0)!);

  const pad = Math.ceil(sizePx * 0.6) + 4;           // Platz für Überhänge (kursiv, Unterlängen)
  const cv = document.createElement("canvas");
  cv.width = Math.ceil(sizePx * 3) + pad * 2;
  cv.height = Math.ceil(sizePx * 3) + pad * 2;
  const ctx = cv.getContext("2d", { willReadFrequently: true })!;
  ctx.font = `${sizePx}px "${family}"`;
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";

  const baseline = Math.ceil(sizePx * 1.6);

  const glyphs = uniq.map((ch) => rasterize(ctx, ch, pad, baseline));

  // Ascent/Descent müssen JEDES Zeichen einschließen: TFT_eSPI setzt die Oberkante auf
  // (cursorY + ascent - dY). Wäre ascent kleiner als das größte dY, würde oben abgeschnitten.
  // "d" und "p" sind nur die Untergrenze aus der Formatbeschreibung.
  const md = ctx.measureText("d"), mp = ctx.measureText("p");
  const ascent = Math.max(
    1, Math.round(md.actualBoundingBoxAscent),
    ...glyphs.map((g) => g.dY),
  );
  const descent = Math.max(
    0, Math.round(mp.actualBoundingBoxDescent),
    ...glyphs.map((g) => g.height - g.dY),
  );

  const w = new BE();
  w.int32(glyphs.length);
  w.int32(11);            // Formatversion
  w.int32(sizePx);
  w.int32(0);             // mboxY, ungenutzt
  w.int32(ascent);
  w.int32(descent);
  for (const g of glyphs) {
    w.int32(g.code); w.int32(g.height); w.int32(g.width);
    w.int32(g.advance); w.int32(g.dY); w.int32(g.dX); w.int32(0);
  }
  for (const g of glyphs) w.bytes(g.bitmap);

  const fname = (name ?? family).slice(0, 255);
  w.byte(fname.length); w.ascii(fname);
  w.byte(fname.length); w.ascii(fname);
  w.byte(1);              // geglättet

  return {
    data: w.finish(),
    glyphs: glyphs.length,
    ascent, descent, size: sizePx,
    maxHeight: glyphs.reduce((m, g) => Math.max(m, g.height), 0),
  };
}

/** Liest eine .vlw genauso ein wie TFT_eSPI — zum Gegenprüfen des Writers. */
export function readVlw(buf: Uint8Array) {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let o = 0;
  const i32 = () => { const v = dv.getInt32(o, false); o += 4; return v; };  // false = big endian
  const gCount = i32(), version = i32(), size = i32(), mbox = i32(), ascent = i32(), descent = i32();
  const glyphs: Omit<Glyph, "bitmap">[] = [];
  for (let i = 0; i < gCount; i++) {
    const code = i32(), height = i32(), width = i32(), advance = i32(), dY = i32(), dX = i32();
    i32(); // Füllwert
    glyphs.push({ code, height, width, advance, dY, dX });
  }
  const bitmapStart = o;
  const bitmapBytes = glyphs.reduce((s, g) => s + g.width * g.height, 0);
  o += bitmapBytes;
  const nameLen = buf[o]; o += 1;
  const name = new TextDecoder().decode(buf.slice(o, o + nameLen)); o += nameLen;
  const psLen = buf[o]; o += 1; o += psLen;
  const smooth = buf[o];
  return { gCount, version, size, mbox, ascent, descent, glyphs, bitmapStart, bitmapBytes, name, smooth, bytesUsed: o + 1, total: buf.length };
}
