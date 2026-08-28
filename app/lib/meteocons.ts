// Wettersymbole von Meteocons (basmilius, MIT) — statt selbstgemalter Striche.
//
// Die SVGs bringen SMIL-Animationen mit. Fürs Display brauchen wir ein Standbild,
// deshalb werden die Animationsteile vor dem Zeichnen entfernt.

/** Ordnet einen WMO-Wettercode (Open-Meteo) einem Meteocons-Namen zu. */
export function meteoconFuer(code: number, nacht = false): string {
  const t = nacht ? "night" : "day";
  if (code === 0) return `clear-${t}`;
  if (code === 1) return `clear-${t}`;
  if (code === 2) return `partly-cloudy-${t}`;
  if (code === 3) return "overcast";
  if (code === 45) return `fog-${t}`;
  if (code === 48) return "fog";
  if (code >= 51 && code <= 55) return "drizzle";
  if (code === 56 || code === 57) return "sleet";
  if (code >= 61 && code <= 65) return "rain";
  if (code === 66 || code === 67) return "sleet";
  if (code >= 71 && code <= 75) return "snow";
  if (code === 77) return "snowflake";
  if (code >= 80 && code <= 82) return `partly-cloudy-${t}-rain`;
  if (code === 85 || code === 86) return `partly-cloudy-${t}-snow`;
  if (code === 95) return `thunderstorms-${t}`;
  if (code === 96 || code === 99) return `thunderstorms-${t}-rain`;
  return "cloudy";
}

/** Alle Symbole, die für die Wetterzustände gebraucht werden — Tag und Nacht. */
export const METEOCON_CODES = [0, 2, 3, 45, 51, 61, 71, 80, 95] as const;

/** Klartext für die Oberfläche. */
export const WETTER_TEXT: Record<number, string> = {
  0: "klar", 1: "überwiegend klar", 2: "teils bewölkt", 3: "bedeckt",
  45: "Nebel", 48: "Reifnebel", 51: "leichter Niesel", 53: "Niesel", 55: "starker Niesel",
  61: "leichter Regen", 63: "Regen", 65: "starker Regen",
  71: "leichter Schnee", 73: "Schnee", 75: "starker Schnee", 77: "Schneegriesel",
  80: "leichte Schauer", 81: "Schauer", 82: "heftige Schauer",
  85: "Schneeschauer", 86: "starke Schneeschauer",
  95: "Gewitter", 96: "Gewitter mit Hagel", 99: "schweres Gewitter",
};

/** SVG-Quelle eines Symbols holen und die Animationen herausnehmen. */
export async function meteoconSvg(name: string, stil: "fill" | "line" = "fill", statisch = false): Promise<string> {
  // no-store, weil frühere Antworten einen Tag lang gültig waren und noch die
  // Fassung ohne Animation enthalten können
  const antwort = await fetch(
    `/api/meteocon?name=${encodeURIComponent(name)}&stil=${stil}${statisch ? "&statisch=1" : ""}`,
    { cache: "no-store" },
  );
  if (!antwort.ok) throw new Error(`Symbol „${name}" nicht gefunden`);
  return antwort.text();
}

/**
 * Ein SVG zum Zeitpunkt t einfrieren.
 *
 * Die Animationen der Meteocons sind SMIL. Ein serialisiertes SVG behält davon
 * nur die Anweisungen, nicht den Stand — deshalb wird das Bild kurz in die Seite
 * gehängt, die Uhr angehalten und der erreichte Wert jedes bewegten Attributs
 * fest eingetragen. Danach steht ein Einzelbild da, das sich zeichnen lässt.
 *
 * Bewegungen, die länger als `maxDauer` brauchen, fallen vorher weg: sie passen
 * nicht in den kurzen Zyklus und würden am Ende sichtbar zurückspringen.
 */
function einfrieren(quelle: string, t: number, maxDauer: number): string {
  const halter = document.createElement("div");
  halter.setAttribute("style", "position:absolute;left:-99999px;top:0;opacity:0;pointer-events:none");
  halter.innerHTML = quelle;
  document.body.appendChild(halter);
  try {
    const svg = halter.querySelector("svg") as SVGSVGElement | null;
    if (!svg) return quelle;

    const bewegungen = [...svg.querySelectorAll("animate,animateTransform,animateMotion")];
    for (const a of bewegungen) {
      if (dauerVon(a.getAttribute("dur")) > maxDauer) a.remove();
    }
    svg.pauseAnimations();
    svg.setCurrentTime(t);

    // Erreichte Werte festschreiben. Welche Attribute vorkommen, steht in den
    // Dateien selbst: transform, gradientTransform, opacity, stroke-dashoffset, r, cx.
    for (const el of svg.querySelectorAll<SVGElement>("*")) {
      const g = el as SVGGraphicsElement & Record<string, any>;
      const m = matrixVon(g.transform?.animVal);
      if (m) el.setAttribute("transform", `matrix(${m.a} ${m.b} ${m.c} ${m.d} ${m.e} ${m.f})`);
      const gm = matrixVon(g.gradientTransform?.animVal);
      if (gm) el.setAttribute("gradientTransform", `matrix(${gm.a} ${gm.b} ${gm.c} ${gm.d} ${gm.e} ${gm.f})`);
      for (const attr of ["r", "cx", "cy", "x", "y", "width", "height"] as const) {
        const v = g[attr]?.animVal;
        if (v && typeof v.value === "number" && el.hasAttribute(attr)) el.setAttribute(attr, String(v.value));
      }
      const stil = getComputedStyle(el);
      if (stil.opacity !== "1") el.style.opacity = stil.opacity;
      if (stil.strokeDashoffset && stil.strokeDashoffset !== "0px") el.style.strokeDashoffset = stil.strokeDashoffset;
    }
    for (const a of [...svg.querySelectorAll("animate,animateTransform,animateMotion")]) a.remove();
    return new XMLSerializer().serializeToString(svg);
  } finally {
    halter.remove();
  }
}

/**
 * Die Matrix einer Transformationsliste ausrechnen.
 * `consolidate()` wäre der kurze Weg, ist auf animierten Listen aber gesperrt.
 */
function matrixVon(liste: SVGTransformList | undefined): DOMMatrix | null {
  if (!liste?.numberOfItems) return null;
  let m = liste.getItem(0).matrix;
  for (let i = 1; i < liste.numberOfItems; i++) m = m.multiply(liste.getItem(i).matrix);
  return m;
}

/** Dauer aus einem SMIL-Wert lesen ("0.7s", "45s", "800ms"). */
function dauerVon(s: string | null): number {
  if (!s) return 0;
  const z = parseFloat(s);
  if (!Number.isFinite(z)) return 0;
  return /ms$/i.test(s) ? z / 1000 : z;
}

/**
 * Bis hierhin gilt eine Bewegung als schnell.
 *
 * Trifft eine schnelle auf eine langsame — beim Gewitter blitzt es alle zwei
 * Sekunden, während die Sonne 45 Sekunden für eine Umdrehung braucht — dann
 * bestimmt die schnelle den Takt und die langsame wird angehalten. Sonst
 * schlösse der Zyklus nicht und die Sonne spränge sichtbar zurück.
 */
const SCHNELL_BIS = 4;

/** Alle Bewegungsdauern eines Symbols. */
function dauernVon(svg: string): number[] {
  return [...svg.matchAll(/\bdur="([^"]+)"/g)].map((m) => dauerVon(m[1])).filter((d) => d > 0);
}

/** Wie stark sich zwei Bilder unterscheiden — gezählt in abweichenden Pixeln. */
function abweichung(a: ImageData, b: ImageData): number {
  let n = 0;
  for (let i = 0; i < a.data.length; i += 4) {
    if (Math.abs(a.data[i] - b.data[i]) > 6 || Math.abs(a.data[i + 2] - b.data[i + 2]) > 6) n++;
  }
  return n;
}

/**
 * Wann ein Symbol zum ersten Mal wieder so aussieht wie am Anfang.
 *
 * Die Laufzeit einer Bewegung sagt das nicht: Die Sonne dreht sich in 45
 * Sekunden einmal herum, sieht wegen ihrer acht Strahlen aber schon nach einem
 * Achtel davon wieder gleich aus. Über diesen kurzen Abschnitt reichen wenige
 * Einzelbilder, über die vollen 45 Sekunden würde es ruckeln. Statt das zu
 * raten, wird es nachgesehen — Bild für Bild verglichen.
 */
async function wiederholungNach(quelle: string, voll: number, px: number, hintergrund: string): Promise<number> {
  const anfang = await aufFlaeche(einfrieren(quelle, 0, Infinity), px, hintergrund);
  const grenze = Math.max(8, Math.round(px * px * 0.01));   // ein Prozent der Fläche darf abweichen
  for (let teiler = 12; teiler >= 2; teiler--) {
    const t = voll / teiler;
    if (t < 0.4) continue;                                   // darunter wird es hektisch
    const jetzt = await aufFlaeche(einfrieren(quelle, t, Infinity), px, hintergrund);
    if (abweichung(jetzt, anfang) <= grenze) return t;
  }
  return voll;
}

/** Ein fertig eingefrorenes SVG auf eine Zeichenfläche bringen. */
async function aufFlaeche(svg: string, px: number, hintergrund: string): Promise<ImageData> {
  const bild = new Image();
  const url = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  await new Promise<void>((ok, fehler) => {
    bild.onload = () => ok();
    bild.onerror = () => fehler(new Error("Symbol ließ sich nicht zeichnen"));
    bild.src = url;
  });
  const cv = document.createElement("canvas");
  cv.width = px; cv.height = px;
  const ctx = cv.getContext("2d", { willReadFrequently: true })!;
  ctx.fillStyle = hintergrund;
  ctx.fillRect(0, 0, px, px);
  ctx.drawImage(bild, 0, 0, px, px);
  return ctx.getImageData(0, 0, px, px);
}

/**
 * Symbol als Folge von Einzelbildern — so bewegt es sich auch auf dem Display.
 * Rührt sich nichts, kommt genau ein Bild zurück.
 */
export async function meteoconAlsFilm(
  name: string, px: number, hintergrund: string, stil: "fill" | "line" = "fill", bilder = 6,
): Promise<ImageData[]> {
  const quelle = await meteoconSvg(name, stil);        // mit Animation, die brauchen wir hier
  const dauern = dauernVon(quelle);
  if (!dauern.length || bilder < 2) return [await meteoconAlsBild(name, px, hintergrund, stil)];

  // Gibt es eine schnelle Bewegung, gibt sie den Takt vor und die langsamen
  // werden angehalten. Bewegt sich alles nur langsam, wird nachgemessen, nach
  // welchem Abschnitt das Symbol wieder gleich aussieht.
  const schnelle = dauern.filter((d) => d <= SCHNELL_BIS);
  const dauer = schnelle.length
    ? Math.min(...schnelle)
    : await wiederholungNach(quelle, Math.min(...dauern), px, hintergrund);
  const maxDauer = schnelle.length ? SCHNELL_BIS : Infinity;

  const folge: ImageData[] = [];
  for (let i = 0; i < bilder; i++) {
    folge.push(await aufFlaeche(einfrieren(quelle, (dauer * i) / bilder, maxDauer), px, hintergrund));
  }
  return folge;
}

/**
 * Symbol in der gewünschten Größe zeichnen und als Rohbild fürs Display liefern.
 * Der Hintergrund wird mitgezeichnet, weil das Display keine Transparenz kennt.
 */
export async function meteoconAlsBild(
  name: string, px: number, hintergrund: string, stil: "fill" | "line" = "fill",
): Promise<ImageData> {
  const svg = await meteoconSvg(name, stil, true);   // fürs Gerät ohne Animation
  const bild = new Image();
  const url = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  await new Promise<void>((ok, fehler) => {
    bild.onload = () => ok();
    bild.onerror = () => fehler(new Error(`Symbol „${name}" ließ sich nicht zeichnen`));
    bild.src = url;
  });
  const cv = document.createElement("canvas");
  cv.width = px; cv.height = px;
  const ctx = cv.getContext("2d", { willReadFrequently: true })!;
  ctx.fillStyle = hintergrund;
  ctx.fillRect(0, 0, px, px);
  ctx.drawImage(bild, 0, 0, px, px);
  return ctx.getImageData(0, 0, px, px);
}

/** Name der Datei auf dem Gerät. */
export const symbolDateiname = (name: string, px: number) => `wi-${name}-${px}`;
