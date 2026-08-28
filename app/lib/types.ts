// Geteilter Layout-Vertrag — muss 1:1 zur Interpreter-Firmware passen.
export type WidgetType = "text" | "value" | "bar" | "dot" | "box" | "line" | "button" | "ring" | "gauge" | "lamp" | "frame" | "pagedots" | "repeat" | "trend" | "battery" | "signal" | "ticker" | "spark" | "histo" | "stats" | "clock" | "toggle" | "slider" | "stepper" | "choice" | "weather" | "icon" | "image" | "qr";
export type Align = "left" | "center" | "right";

/** Was ein Button-Widget bei Touch auslöst. Alles generisch — keine festen Ziele im Code. */
export type Action =
  | { kind: "page"; to: string }                                   // Seite wechseln (id | "next" | "prev")
  | { kind: "http"; method: "GET" | "POST"; url: string; body?: string };

export interface Widget {
  id: string;
  type: WidgetType;
  x: number;
  y: number;
  w: number;
  h: number;
  // text / value
  text?: string;
  value?: number;
  suffix?: string;
  dec?: number;
  font?: number;          // eingebauter TFT-Font (1/2/4/6/7)
  fontFace?: string;      // echte Schrift, z.B. "FreeSans12pt7b" (überschreibt font)
  fontScale?: number;     // ganzzahlige Vergrößerung auf dem Gerät (setTextSize), 1–8
  vlw?: string;           // eigene Schrift auf dem Gerät, z.B. "inter-14" (schlägt fontFace)
  /* --- Ring, Tacho --- */
  thickness?: number;     // Stärke des Bogens in Pixeln
  min?: number;           // Wertebereich, Vorgabe 0
  max?: number;           // Wertebereich, Vorgabe 100
  showValue?: boolean;    // Zahl in der Mitte anzeigen
  /* --- Ampel --- */
  lamps?: number;         // Anzahl der Lampen, Vorgabe 3
  gap?: number;           // Abstand zwischen den Lampen
  vertical?: boolean;     // untereinander statt nebeneinander
  /* --- Rahmen --- */
  title?: string;         // Beschriftung oben links im Rahmen
  /* --- Symbol, Bild, QR --- */
  icon?: string;          // Name aus ICONS
  asset?: string;         // Dateiname auf dem Gerät (ohne Endung)
  payload?: string;       // Inhalt des QR-Codes
  /* --- Wetter --- */
  night?: boolean;        // Nachtvariante (Mond statt Sonne)
  iconStyle?: "meteocons" | "einfach";   // echte Symbole oder gezeichnete Formen
  iconSet?: "fill" | "line";             // Meteocons-Stil
  frames?: number;        // Einzelbilder je Symbol aufs Gerät (1 = Standbild, sonst bewegt)
  /* --- Bedienfelder (Schalter, Regler, Zähler, Auswahl) --- */
  onValue?: string;       // was bei "ein" gesendet wird
  offValue?: string;      // was bei "aus" gesendet wird
  stepSize?: number;      // Schrittweite für den Zähler
  options?: { label: string; value: string }[];   // Auswahlgruppe
  /* --- Verlauf (Kurve, Säulen, Kennzahlen) --- */
  samples?: number;       // wie viele Messwerte behalten werden
  autoScale?: boolean;    // Bereich aus den Messwerten statt min/max
  stat?: "min" | "max" | "avg" | "last";  // welche Kennzahl gezeigt wird
  /* --- Uhr --- */
  format?: string;        // z.B. "HH:mm" oder "dd.MM."
  /* --- Trend, Batterie, Signal, Laufschrift --- */
  refValue?: number;      // Vergleichswert für den Trendpfeil
  bars?: number;          // Balken der Signalstärke
  speed?: number;         // Laufschrift: Pixel je Sekunde
  /* --- Wiederholer --- */
  children?: Widget[];    // Vorlage: Felder mit Koordinaten relativ zum Wiederholer
  step?: number;          // Versatz je Datensatz in Pixeln
  maxItems?: number;      // höchstens so viele Datensätze zeichnen
  align?: Align;
  // farben
  color?: string;
  track?: string;
  // form
  r?: number;              // Eckenradius
  fill?: boolean;          // Fläche füllen (Box)
  borderColor?: string;    // Rahmenfarbe (Box/Taste)
  borderWidth?: number;    // Rahmenstärke, 0 = kein Rahmen
  padX?: number;           // Innenabstand Text (Taste)
  // datenbindung
  bind?: Binding;
  transform?: Transform;
  thresholds?: Threshold[];
  showIf?: { path: string; op: "=" | "!=" | ">" | "<"; value: string; src: string };
  // nur button
  action?: Action;
  bgColor?: string;
  hidden?: boolean;
  locked?: boolean;
}

/** Transform auf einen Rohwert anwenden */
export function applyTransform(raw: unknown, t?: Transform): { num: number; text: string } {
  let n = Number(raw);
  const isNum = Number.isFinite(n);
  if (t) {
    if (isNum) {
      if (t.scale !== undefined) n *= t.scale;
      if (t.offset !== undefined) n += t.offset;
      if (t.min !== undefined && t.max !== undefined && t.max !== t.min) n = ((n - t.min) / (t.max - t.min)) * 100;
    }
    if (t.map?.length) {
      const hit = t.map.find((m) => String(m.when) === String(raw));
      if (hit) return { num: isNum ? n : 0, text: hit.then };
    }
  }
  const dec = t?.round ?? 0;
  const body = isNum ? n.toFixed(dec) : String(raw ?? "");
  return { num: isNum ? n : 0, text: `${t?.prefix ?? ""}${body}${t?.suffix ?? ""}` };
}

/** Farbe nach Schwellwerten (höchster passender gewinnt) */
export function thresholdColor(value: number, ths?: Threshold[], fallback?: string): string | undefined {
  if (!ths?.length) return fallback;
  const sorted = [...ths].sort((a, b) => a.at - b.at);
  let c = fallback;
  for (const t of sorted) if (value >= t.at) c = t.color;
  return c;
}

export interface Binding {
  src: string;   // DataSource.id
  path: string;  // z.B. "accounts[0].meters[1].p"
}

export interface Page {
  id: string;
  widgets: Widget[];
  /** Eigene Verweildauer in Sekunden; fehlt sie, gilt der Wert des Layouts */
  dwell?: number;
  /** Beim automatischen Wechsel überspringen (z.B. Einstellungsseite) */
  skip?: boolean;
}

export type AuthKind = "none" | "bearer" | "basic" | "header" | "query";

export interface Auth {
  kind: AuthKind;
  token?: string;      // bearer
  user?: string;       // basic
  pass?: string;       // basic
  headerName?: string; // header
  headerValue?: string;
  queryName?: string;  // query
  queryValue?: string;
}

export interface DataSource {
  id: string;
  name?: string;
  url: string;
  method?: "GET" | "POST";
  body?: string;
  interval?: number; // ms
  auth?: Auth;
  headers?: { k: string; v: string }[];
}

/** Wertumformung pro Widget — generisch, keine festen Annahmen über die Daten. */
export interface Transform {
  scale?: number;        // Wert * scale
  offset?: number;       // + offset
  min?: number;          // Eingangsbereich -> 0..100 für Balken
  max?: number;
  round?: number;        // Nachkommastellen
  prefix?: string;
  suffix?: string;
  map?: { when: string; then: string }[]; // Wert -> Text/Farbe
}

/** Farbe abhängig vom Wert (Schwellwerte) */
export interface Threshold {
  at: number;     // ab diesem Wert
  color: string;
}

export interface Layout {
  v: 1;
  bg: string;
  /** Automatischer Seitenwechsel: Sekunden je Seite (0/fehlt = aus) */
  rotate?: number;
  /** Nach einer Berührung so lange nicht weiterblättern (Sekunden) */
  rotatePause?: number;
  /** Zeichenfläche in Gerätepixeln. Fehlt sie, gilt das übliche CYD-Maß. */
  w?: number;
  h?: number;
  pages: Page[];
  sources?: DataSource[];
}

/** Vorgabe, wenn ein Layout keine Maße mitbringt (ESP32-2432S028R, quer). */
export const DEFAULT_SIZE = { w: 320, h: 240 } as const;
/** Gängige Displays für die Schnellauswahl. */
export const SIZE_PRESETS = [
  { label: "CYD 2,8\" quer", w: 320, h: 240 },
  { label: "CYD 2,8\" hoch", w: 240, h: 320 },
  { label: "CYD 3,5\" quer", w: 480, h: 320 },
  { label: "CYD 3,5\" hoch", w: 320, h: 480 },
  { label: "Round 1,28\"", w: 240, h: 240 },
  { label: "T-Display S3", w: 320, h: 170 },
] as const;
/** Maße eines Layouts, immer mit Rückfall auf die Vorgabe. */
export function sizeOf(l: { w?: number; h?: number }) {
  return { w: l.w ?? DEFAULT_SIZE.w, h: l.h ?? DEFAULT_SIZE.h };
}

// Wert aus verschachteltem JSON per "a.b[0].c" holen
export function getPath(obj: unknown, path: string): unknown {
  if (!path) return undefined;
  const keys = path.replace(/\[(\d+)\]/g, ".$1").split(".").filter(Boolean);
  let cur: unknown = obj;
  for (const k of keys) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[k];
  }
  return cur;
}

// Was aufs Gerät geht (ohne Editor-only Felder wie id) — hier lassen wir id drin,
// die Firmware ignoriert Unbekanntes; das haelt es simpel.
export function serialize(layout: Layout): string {
  return JSON.stringify(layout);
}

export const EMPTY_LAYOUT: Layout = {
  v: 1,
  bg: "#171717",
  pages: [{ id: "p1", widgets: [] }],
};

// Seed: der Canvas startet nie leer (App-Regel). Rein statisches Demo-Layout —
// KEINE URLs, KEINE Bindungen, nichts Nutzerspezifisches. Quellen legt der User in der UI an.
export const SEED_LAYOUT: Layout = {
  v: 1,
  bg: "#171717",
  pages: [
    {
      id: "p1",
      widgets: [
        { id: "s1", type: "dot", x: 12, y: 16, w: 10, h: 10, r: 5, color: "#22c55e" },
        { id: "s2", type: "text", x: 24, y: 9, w: 200, h: 18, text: "Beispiel", color: "#f5f5f5", font: 2, align: "left" },
        { id: "s3", type: "line", x: 0, y: 32, w: 320, h: 1, color: "#333333" },
        { id: "s4", type: "text", x: 12, y: 44, w: 50, h: 18, text: "A", color: "#9a9088", font: 2, align: "left" },
        { id: "s5", type: "bar", x: 58, y: 48, w: 190, h: 10, value: 26, color: "#16a34a", track: "#262626", r: 5 },
        { id: "s6", type: "value", x: 264, y: 44, w: 44, h: 18, value: 26, suffix: "%", dec: 0, color: "#f5f5f5", font: 2, align: "right" },
        { id: "s7", type: "text", x: 12, y: 72, w: 50, h: 18, text: "B", color: "#9a9088", font: 2, align: "left" },
        { id: "s8", type: "bar", x: 58, y: 76, w: 190, h: 10, value: 88, color: "#d6473b", track: "#262626", r: 5 },
        { id: "s9", type: "value", x: 264, y: 72, w: 44, h: 18, value: 88, suffix: "%", dec: 0, color: "#f5f5f5", font: 2, align: "right" },
      ],
    },
  ],
};

// Alle Blatt-Pfade eines JSON-Objekts (für den Pfad-Picker im Editor)
export function leafPaths(obj: unknown, prefix = ""): { path: string; value: unknown }[] {
  if (obj === null || typeof obj !== "object") return prefix ? [{ path: prefix, value: obj }] : [];
  const out: { path: string; value: unknown }[] = [];
  if (Array.isArray(obj)) obj.forEach((v, i) => out.push(...leafPaths(v, `${prefix}[${i}]`)));
  else for (const [k, v] of Object.entries(obj)) out.push(...leafPaths(v, prefix ? `${prefix}.${k}` : k));
  return out;
}

export const DEFAULT_LAYOUT = SEED_LAYOUT;

/** Schriften, die die Firmware wirklich eingebunden hat — eine Quelle für beide Seiten.
 *  Wer hier etwas ergänzt, muss es auch in faceOf() der Firmware eintragen. */
/** Früher fest einkompilierte Schriften. Leer, seit echte Schriften als .vlw
 *  aufs Gerät gehen — es kommt nur noch drauf, was auch benutzt wird. */
export const FONT_FAMILIES: { id: string; label: string; styles: readonly string[] }[] = [];
export const FONT_STYLES: Record<string, string> = {
  "": "Normal", Bold: "Fett",
  Oblique: "Kursiv", BoldOblique: "Fett kursiv",
  Italic: "Kursiv", BoldItalic: "Fett kursiv",   // Serif heißt in der Library anders
};
export const FONT_SIZES = [9, 12, 18, 24] as const;
/** Eingebaute Pixelschriften des Displays (TFT_eSPI-Nummern) */
export const BUILTIN_FONTS = [
  { id: 1, label: "Pixel 8" }, { id: 2, label: "Pixel 16" },
  { id: 4, label: "Pixel 26" }, { id: 6, label: "Ziffern 48" }, { id: 7, label: "7-Segment" },
] as const;
/** Skalierung: das Gerät vervielfacht die Basisschrift ganzzahlig (setTextSize). */
export const FONT_SCALES = [1, 2, 3, 4] as const;

/** Alle Höhen, die das Gerät wirklich darstellen kann: Basisschrift × ganzzahlige Vergrößerung. */
export function fontSteps(family: string, style: string): { px: number; face?: string; font?: number; scale: number }[] {
  const out: { px: number; face?: string; font?: number; scale: number }[] = [];
  for (let sc = 1; sc <= 8; sc++) {
    if (family === "__builtin") {
      for (const f of BUILTIN_FONTS) out.push({ px: fontHeightPx({ font: f.id }) * sc, font: f.id, scale: sc });
    } else {
      for (const pt of FONT_SIZES) {
        const face = fontId(family, style, pt);
        out.push({ px: fontHeightPx({ fontFace: face }) * sc, face, scale: sc });
      }
    }
  }
  return out.sort((a, b) => a.px - b.px);
}
/** Zur Wunschhöhe die am besten passende Kombination wählen. */
export function pickFont(family: string, style: string, targetPx: number) {
  const steps = fontSteps(family, style);
  return steps.reduce((best, s) => Math.abs(s.px - targetPx) < Math.abs(best.px - targetPx) ? s : best, steps[0]);
}

/** Welche Schnitte gibt es für diese Familie? */
export function stylesFor(family: string): readonly string[] {
  return FONT_FAMILIES.find((f) => f.id === family)?.styles ?? [""];
}
/** Endgültige Höhe in Gerätepixeln, inkl. Skalierung */
export function fontPx(w: { fontFace?: string; font?: number; fontScale?: number; vlw?: string }): number {
  const eigen = w.vlw?.match(/-(\d+)$/);        // eigene Schriften sind für genau diese Größe gebaut
  if (eigen) return Number(eigen[1]);
  return fontHeightPx(w) * Math.max(1, w.fontScale ?? 1);
}

/** Kennung bauen: FreeSans + Bold + 12 -> "FreeSansBold12pt7b" */
export function fontId(family: string, style: string, size: number) {
  return `${family}${style}${size}pt7b`;
}
/** Kennung zerlegen (für den Inspector) */
export function parseFontId(id?: string): { family: string; style: string; size: number } | null {
  if (!id) return null;
  const m = id.match(/^(FreeSans|FreeSerif|FreeMono)(BoldOblique|BoldItalic|Bold|Oblique|Italic)?(\d+)pt7b$/);
  return m ? { family: m[1], style: m[2] ?? "", size: Number(m[3]) } : null;
}
/** Ungefähre Höhe in Gerätepixeln — für Vorschau und Trefferfläche */
export function fontHeightPx(w: { fontFace?: string; font?: number }): number {
  const f = parseFontId(w.fontFace);
  if (f) return Math.round(f.size * 1.34);          // pt -> px bei 96dpi-Raster
  return ({ 1: 8, 2: 16, 4: 26, 6: 48, 7: 48 } as Record<number, number>)[w.font ?? 2] ?? 16;
}

// Vorlagen fuer die Palette
export function makeWidget(type: WidgetType): Widget {
  const id = "w" + Math.random().toString(36).slice(2, 8);
  const base = { id, type, x: 12, y: 12, w: 120, h: 16 } as Widget;
  switch (type) {
    case "text":
      return { ...base, text: "Text", color: "#f5f5f5", font: 2, align: "left" };
    case "value":
      return { ...base, w: 50, value: 42, suffix: "%", dec: 0, color: "#f5f5f5", font: 2, align: "right" };
    case "bar":
      return { ...base, w: 160, h: 10, value: 55, color: "#16a34a", track: "#262626", r: 5 };
    case "dot":
      return { ...base, w: 10, h: 10, r: 5, color: "#22c55e" };
    case "box":
      return { ...base, w: 100, h: 30, color: "#1c1815", fill: true, r: 6 };
    case "line":
      return { ...base, w: 200, h: 1, color: "#333333" };
    case "ring":
      return { ...base, w: 60, h: 60, r: 30, thickness: 8, value: 65, min: 0, max: 100,
               color: "#22c55e", track: "#262626", showValue: true, font: 2 };
    case "gauge":
      return { ...base, w: 80, h: 48, r: 38, thickness: 8, value: 40, min: 0, max: 100,
               color: "#22c55e", track: "#262626", showValue: true, font: 2 };
    case "lamp":
      return { ...base, w: 40, h: 12, r: 5, gap: 6, lamps: 3, value: 0,
               color: "#22c55e", track: "#262626" };
    case "repeat":
      return { ...base, w: 300, h: 40, step: 40, maxItems: 5, children: [] };
    case "icon":
      return { ...base, w: 24, h: 24, icon: "haus", color: "#f5f5f5" };
    case "image":
      return { ...base, w: 64, h: 64, asset: "" };
    case "qr":
      return { ...base, w: 64, h: 64, payload: "https://" };
    case "weather":
      return { ...base, w: 48, h: 48, value: 0, color: "#f5f5f5", track: "#9a9088",
               iconStyle: "meteocons", iconSet: "fill" };
    case "toggle":
      return { ...base, w: 46, h: 22, r: 11, value: 0, onValue: "1", offValue: "0",
               color: "#22c55e", track: "#3a3a3a", bgColor: "#f5f5f5" };
    case "slider":
      return { ...base, w: 140, h: 20, r: 6, value: 50, min: 0, max: 100,
               color: "#22c55e", track: "#262626" };
    case "stepper":
      return { ...base, w: 100, h: 26, r: 4, value: 20, min: 0, max: 100, stepSize: 1,
               color: "#f5f5f5", bgColor: "#262626", borderColor: "#3a3a3a", borderWidth: 1, font: 2 };
    case "choice":
      return { ...base, w: 160, h: 24, r: 4, color: "#f5f5f5", bgColor: "#262626",
               borderColor: "#3a3a3a", borderWidth: 1, font: 2,
               options: [{ label: "A", value: "a" }, { label: "B", value: "b" }, { label: "C", value: "c" }] };
    case "spark":
      return { ...base, w: 120, h: 34, samples: 40, autoScale: true, color: "#22c55e", track: "#262626" };
    case "histo":
      return { ...base, w: 120, h: 34, samples: 24, autoScale: true, color: "#22c55e", track: "#262626" };
    case "stats":
      return { ...base, w: 60, h: 16, samples: 40, stat: "avg", dec: 0, suffix: "", color: "#f5f5f5", font: 2, align: "left" };
    case "clock":
      return { ...base, w: 70, h: 20, format: "HH:mm", color: "#f5f5f5", font: 4, align: "left" };
    case "trend":
      return { ...base, w: 20, h: 20, value: 60, refValue: 50, color: "#22c55e", track: "#ef4444" };
    case "battery":
      return { ...base, w: 34, h: 16, value: 75, min: 0, max: 100, color: "#22c55e", track: "#3a3a3a" };
    case "signal":
      return { ...base, w: 24, h: 16, value: 70, min: 0, max: 100, bars: 4, color: "#22c55e", track: "#3a3a3a" };
    case "ticker":
      return { ...base, w: 200, h: 18, text: "Laufender Text …", color: "#f5f5f5", font: 2, speed: 20 };
    case "pagedots":
      return { ...base, w: 60, h: 8, r: 3, gap: 6, color: "#f5f5f5", track: "#3a3a3a" };
    case "frame":
      return { ...base, w: 140, h: 60, r: 4, borderWidth: 1, color: "#f5f5f5",
               borderColor: "#333333", title: "Titel", font: 2 };
    case "button":
      return { ...base, w: 90, h: 28, text: "Taste", color: "#f5f5f5", bgColor: "#262626", font: 2, align: "center", r: 4, action: { kind: "page", to: "next" } };
  }
}


/** WMO-Wettercode auf eine Symbolart abbilden (Open-Meteo liefert diese Codes). */
export type WetterArt = "klar" | "teils" | "wolkig" | "nebel" | "regen" | "schnee" | "gewitter";
export function wetterArt(code: number): WetterArt {
  if (code === 0) return "klar";
  if (code <= 2) return "teils";
  if (code === 3) return "wolkig";
  if (code === 45 || code === 48) return "nebel";
  if (code >= 51 && code <= 67) return "regen";
  if (code >= 71 && code <= 77) return "schnee";
  if (code >= 80 && code <= 82) return "regen";
  if (code === 85 || code === 86) return "schnee";
  if (code >= 95) return "gewitter";
  return "wolkig";
}


/** Symbole, die die Firmware selbst zeichnen kann — kein Dateizugriff nötig. */
export const ICONS = [
  "haus", "wlan", "temperatur", "tropfen", "wind", "blitz", "akku", "uhr",
  "warnung", "haken", "kreuz", "pfeil-oben", "pfeil-unten", "person", "server", "glocke",
] as const;
