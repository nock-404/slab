// Prüft ein Layout gegen alles, was auf dem Gerät schiefgehen kann.
import { Layout, Widget, getPath, serialize, sizeOf } from "./types";

export type Issue = {
  level: "fehler" | "warnung";
  msg: string;
  widgetId?: string;
  pageIdx?: number;
};

const MAX_PUSH = 24000; // Grenze im Serial-Empfangspuffer der Firmware

function bboxOf(w: Widget, fontH: (w: Widget) => number) {
  if (w.type === "dot") { const r = w.r ?? 5; return { x: w.x - r, y: w.y - r, w: 2 * r, h: 2 * r }; }
  if (w.type === "text" || w.type === "value") return { x: w.x, y: w.y, w: w.w, h: fontH(w) + 4 };
  if (w.type === "line") return { x: w.x, y: w.y, w: w.w, h: Math.max(1, w.h) };
  return { x: w.x, y: w.y, w: w.w, h: w.h };
}

export function validate(
  layout: Layout,
  data: Record<string, unknown>,
  fontH: (w: Widget) => number,
): Issue[] {
  const out: Issue[] = [];
  const { w: W, h: H } = sizeOf(layout);
  const srcIds = new Set((layout.sources ?? []).map((s) => s.id));
  const pageIds = new Set(layout.pages.map((p) => p.id));

  // --- Größe des Pushs ---
  const size = serialize(layout).length;
  if (size > MAX_PUSH)
    out.push({ level: "fehler", msg: `Layout ist ${size} Bytes — das Gerät nimmt höchstens ${MAX_PUSH}. Felder oder Seiten reduzieren.` });
  else if (size > MAX_PUSH * 0.8)
    out.push({ level: "warnung", msg: `Layout ist ${size} Bytes — nah am Limit von ${MAX_PUSH}.` });

  // --- Quellen ---
  for (const s of layout.sources ?? []) {
    if (!s.url) out.push({ level: "fehler", msg: `Quelle „${s.name || s.id}" hat keine URL.` });
    else if (!/^https?:\/\//.test(s.url)) out.push({ level: "fehler", msg: `Quelle „${s.name || s.id}": URL muss mit http:// oder https:// beginnen.` });
    else if (/^https:\/\//.test(s.url)) out.push({ level: "warnung", msg: `Quelle „${s.name || s.id}" nutzt HTTPS — funktioniert, aber jede Abfrage kostet ein paar Sekunden. Das Gerät fragt deshalb höchstens alle 30 s nach.` });
    if (s.url && /localhost|127\.0\.0\.1/.test(s.url))
      out.push({ level: "fehler", msg: `Quelle „${s.name || s.id}" zeigt auf localhost — das Gerät erreicht dort nichts. Netzwerk-Adresse verwenden.` });
    if (data[s.id] === undefined)
      out.push({ level: "warnung", msg: `Quelle „${s.name || s.id}" liefert (noch) keine Daten.` });
  }

  layout.pages.forEach((page, pi) => {
    if (!page.widgets.length) out.push({ level: "warnung", msg: `Seite ${pi + 1} ist leer.`, pageIdx: pi });

    for (const w of page.widgets) {
      const at = { widgetId: w.id, pageIdx: pi };

      // --- Position ---
      const b = bboxOf(w, fontH);
      if (b.x < 0 || b.y < 0 || b.x + b.w > W || b.y + b.h > H)
        out.push({ level: "fehler", msg: `${w.type} ragt aus dem Display (${Math.round(b.x)},${Math.round(b.y)} bis ${Math.round(b.x + b.w)},${Math.round(b.y + b.h)}).`, ...at });
      if (w.w <= 0 && w.type !== "dot")
        out.push({ level: "fehler", msg: `${w.type} hat keine Breite.`, ...at });

      // --- Bindung ---
      if (w.bind) {
        if (!srcIds.has(w.bind.src))
          out.push({ level: "fehler", msg: `${w.type} ist an die gelöschte Quelle „${w.bind.src}" gebunden.`, ...at });
        else if (!w.bind.path)
          out.push({ level: "fehler", msg: `${w.type} hat eine Quelle, aber keinen Pfad gewählt.`, ...at });
        else if (data[w.bind.src] !== undefined && getPath(data[w.bind.src], w.bind.path) === undefined)
          out.push({ level: "fehler", msg: `${w.type}: Pfad „${w.bind.path}" existiert in den Daten nicht.`, ...at });
        else if (["bar", "value"].includes(w.type) && data[w.bind.src] !== undefined) {
          const v = getPath(data[w.bind.src], w.bind.path);
          if (v !== undefined && !Number.isFinite(Number(v)) && !w.transform?.map?.length)
            out.push({ level: "warnung", msg: `${w.type}: „${w.bind.path}" liefert „${String(v).slice(0, 20)}" — keine Zahl. Umrechnung oder Zuordnung setzen.`, ...at });
        }
      }

      // --- Aktionen ---
      if (w.type === "button") {
        if (!w.action) out.push({ level: "warnung", msg: `Taste „${w.text ?? ""}" hat keine Aktion.`, ...at });
        else if (w.action.kind === "http") {
          if (!w.action.url) out.push({ level: "fehler", msg: `Taste „${w.text ?? ""}": HTTP-Aktion ohne URL.`, ...at });
          else if (/localhost|127\.0\.0\.1/.test(w.action.url))
            out.push({ level: "fehler", msg: `Taste „${w.text ?? ""}": URL zeigt auf localhost — vom Gerät nicht erreichbar.`, ...at });
        } else if (w.action.kind === "page") {
          const to = w.action.to;
          if (!["next", "prev"].includes(to) && !pageIds.has(to))
            out.push({ level: "fehler", msg: `Taste „${w.text ?? ""}" springt auf eine gelöschte Seite.`, ...at });
          if (layout.pages.length < 2 && ["next", "prev"].includes(to))
            out.push({ level: "warnung", msg: `Taste „${w.text ?? ""}" wechselt die Seite, es gibt aber nur eine.`, ...at });
        }
        if (b.w < 30 || b.h < 20)
          out.push({ level: "warnung", msg: `Taste „${w.text ?? ""}" ist klein (${b.w}×${b.h}) — auf dem Touch schwer zu treffen.`, ...at });
      }

      // --- Sichtbarkeitsbedingung ---
      if (w.showIf?.src && !srcIds.has(w.showIf.src))
        out.push({ level: "fehler", msg: `${w.type}: Sichtbarkeitsregel nutzt gelöschte Quelle „${w.showIf.src}".`, ...at });

      // --- Schrift, die es auf dem Gerät nicht mehr gibt ---
      if (w.fontFace && !w.vlw)
        out.push({ level: "warnung", msg: `${w.type} nutzt die alte Schrift „${w.fontFace}" — das Gerät zeigt stattdessen die Pixelschrift. Eigene Schrift wählen.`, ...at });

      // --- Unsichtbares ---
      if (w.color && w.type !== "button" && w.color.toLowerCase() === layout.bg.toLowerCase())
        out.push({ level: "warnung", msg: `${w.type} hat dieselbe Farbe wie der Hintergrund — unsichtbar.`, ...at });
    }
  });

  return out;
}
