"use client";
import "overlayscrollbars/overlayscrollbars.css";
import { OverlayScrollbarsComponent, type OverlayScrollbarsComponentRef } from "overlayscrollbars-react";
import { DockviewReact, type IDockviewPanelProps } from "dockview-react";
import type { IDockviewHeaderActionsProps } from "dockview";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuShortcut, ContextMenuTrigger } from "@/components/ui/context-menu";
import { Switch } from "@/components/ui/switch";
import { Menubar, MenubarMenu, MenubarTrigger, MenubarContent, MenubarItem, MenubarSeparator, MenubarShortcut, MenubarSub, MenubarSubTrigger, MenubarSubContent, MenubarCheckboxItem } from "@/components/ui/menubar";
import type { DockviewApi, DockviewReadyEvent } from "dockview";
import { createContext, useContext, useSyncExternalStore } from "react";
import { useRef, useState, useCallback, useEffect, useMemo } from "react";
import { toast } from "sonner";
import { ShieldCheck, Type, Hash, BarChart3, Circle, Square, Minus, Usb, Trash2, Undo2, Redo2, Plus, Link2, Link2Off, Database, Copy, Pencil, FilePlus2, MousePointerClick, Layers, Eye, EyeOff, Lock, LockOpen, ChevronUp, ChevronDown, Zap, AlignStartVertical, AlignCenterVertical, AlignEndVertical, AlignStartHorizontal, AlignCenterHorizontal, AlignEndHorizontal, Code2, Download, Upload, Keyboard, ZoomIn, ZoomOut, PanelsTopLeft, Check, ChevronsDownUp, ChevronRight, MoveHorizontal, MoveVertical, CircleDashed, Gauge, Lightbulb, SquareDashed, MoreHorizontal, TrendingUp, BatteryMedium, SignalHigh, Megaphone, Activity, BarChart2, Sigma, Clock, ToggleLeft, SlidersHorizontal, PlusSquare, Rows3, CloudSun, Shapes, Image, QrCode } from "lucide-react";
import { meteoconFuer, meteoconAlsFilm, symbolDateiname, WETTER_TEXT } from "./lib/meteocons";
import { nachRgb565Film } from "./lib/bilder";
import { bildSpeichern, bilderListe, bildLoeschen, bildVorschau, bildLesen, qrErzeugen, type Bild } from "./lib/bilder";
import { schriftenListe, schriftSpeichern, schriftLoeschen, schriftBereitstellen, cssName, geraeteName, vlwErzeugen, googleListe, googleHolen, familienAus, schnittName, type EigeneSchrift, type GoogleSchrift } from "./lib/fonts";
import { Layout, Widget, WidgetType, DataSource, Action, makeWidget, serialize, DEFAULT_LAYOUT, sizeOf, SIZE_PRESETS, wetterArt, ICONS, getPath, leafPaths, applyTransform, thresholdColor, FONT_FAMILIES, FONT_STYLES, stylesFor, fontId, parseFontId, fontPx, pickFont, fontSteps } from "./lib/types";
import { DeviceLink } from "./lib/serial";
import { validate, type Issue } from "./lib/validate";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription, DialogClose } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/textarea";

const SCALE = 2;
const MINW = 4;
const PALETTE: { t: WidgetType; icon: React.ElementType; label: string }[] = [
  { t: "text", icon: Type, label: "Text" }, { t: "value", icon: Hash, label: "Wert" },
  { t: "bar", icon: BarChart3, label: "Balken" }, { t: "dot", icon: Circle, label: "Status" },
  { t: "box", icon: Square, label: "Box" }, { t: "line", icon: Minus, label: "Linie" },
  { t: "button", icon: MousePointerClick, label: "Taste" },
  { t: "ring", icon: CircleDashed, label: "Ring" }, { t: "gauge", icon: Gauge, label: "Tacho" },
  { t: "lamp", icon: Lightbulb, label: "Ampel" }, { t: "frame", icon: SquareDashed, label: "Rahmen" },
  { t: "pagedots", icon: MoreHorizontal, label: "Seitenpunkte" },
  { t: "trend", icon: TrendingUp, label: "Trend" }, { t: "battery", icon: BatteryMedium, label: "Batterie" },
  { t: "signal", icon: SignalHigh, label: "Signal" }, { t: "ticker", icon: Megaphone, label: "Laufschrift" },
  { t: "spark", icon: Activity, label: "Kurve" }, { t: "histo", icon: BarChart2, label: "Säulen" },
  { t: "stats", icon: Sigma, label: "Kennzahl" }, { t: "clock", icon: Clock, label: "Uhr" },
  { t: "toggle", icon: ToggleLeft, label: "Schalter" }, { t: "slider", icon: SlidersHorizontal, label: "Regler" },
  { t: "stepper", icon: PlusSquare, label: "Zähler" }, { t: "choice", icon: Rows3, label: "Auswahl" },
  { t: "weather", icon: CloudSun, label: "Wetter" }, { t: "icon", icon: Shapes, label: "Symbol" },
  { t: "image", icon: Image, label: "Bild" }, { t: "qr", icon: QrCode, label: "QR-Code" },
];
const cssFamily = (face?: string, vlw?: string) =>
  vlw ? `"${cssName(vlw.replace(/-\d+$/, ""))}", system-ui, sans-serif` :
  face?.startsWith("FreeSerif") ? "Georgia, serif" : face?.startsWith("FreeMono") ? "ui-monospace, monospace" : "system-ui, sans-serif";
const cssWeight = (face?: string) => (face?.includes("Bold") ? 700 : 400);
const cssStyle = (face?: string) => (face?.includes("Oblique") ? "italic" : "normal");
/** Fertige Kombinationen aus Feldern — werden als Gruppe eingefügt, relativ zum Einfügepunkt. */
const VORLAGEN: { name: string; beschreibung: string; bauen: () => Widget[] }[] = [
  {
    name: "Konto-Zeile",
    beschreibung: "Punkt, Name, zwei Balken mit Werten",
    bauen: () => {
      const w = (t: WidgetType, ex: Partial<Widget>): Widget => ({ ...makeWidget(t), ...ex });
      return [
        w("dot", { x: 4, y: 6, r: 4, color: "#22c55e" }),
        w("text", { x: 16, y: 0, w: 120, text: "Konto", font: 4 }),
        w("value", { x: 250, y: 0, w: 60, value: 0, suffix: "%", align: "right", font: 2 }),
        w("text", { x: 4, y: 22, w: 24, text: "5h", font: 2, color: "#9a9088" }),
        w("bar", { x: 32, y: 24, w: 200, h: 8, value: 30 }),
        w("value", { x: 240, y: 22, w: 70, value: 30, suffix: "%", align: "right", font: 2 }),
        w("text", { x: 4, y: 38, w: 24, text: "Wo", font: 2, color: "#9a9088" }),
        w("bar", { x: 32, y: 40, w: 200, h: 8, value: 60 }),
        w("value", { x: 240, y: 38, w: 70, value: 60, suffix: "%", align: "right", font: 2 }),
      ];
    },
  },
  {
    name: "Kopfzeile",
    beschreibung: "Titel, Statuspunkt, Uhr",
    bauen: () => {
      const w = (t: WidgetType, ex: Partial<Widget>): Widget => ({ ...makeWidget(t), ...ex });
      return [
        w("dot", { x: 6, y: 8, r: 4, color: "#22c55e" }),
        w("text", { x: 18, y: 2, w: 180, text: "Übersicht", font: 4 }),
        w("clock", { x: 250, y: 2, w: 66, format: "HH:mm", align: "right", font: 4 }),
        w("line", { x: 0, y: 20, w: 320, h: 1, color: "#333333" }),
      ];
    },
  },
  {
    name: "Kennzahl groß",
    beschreibung: "Große Zahl mit Einheit und Beschriftung",
    bauen: () => {
      const w = (t: WidgetType, ex: Partial<Widget>): Widget => ({ ...makeWidget(t), ...ex });
      return [
        w("value", { x: 0, y: 0, w: 110, value: 42, suffix: "", font: 6, align: "left" }),
        w("text", { x: 0, y: 44, w: 110, text: "Beschriftung", font: 2, color: "#9a9088" }),
      ];
    },
  },
  {
    name: "Schalter mit Rückmeldung",
    beschreibung: "Schalter, Beschriftung, Statuspunkt",
    bauen: () => {
      const w = (t: WidgetType, ex: Partial<Widget>): Widget => ({ ...makeWidget(t), ...ex });
      return [
        w("text", { x: 0, y: 4, w: 110, text: "Licht", font: 2 }),
        w("toggle", { x: 118, y: 0, w: 46, h: 22 }),
        w("dot", { x: 176, y: 11, r: 4, color: "#22c55e" }),
      ];
    },
  },
  {
    name: "Fußzeile",
    beschreibung: "Trennlinie, zwei Tasten, Seitenpunkte",
    bauen: () => {
      const w = (t: WidgetType, ex: Partial<Widget>): Widget => ({ ...makeWidget(t), ...ex });
      return [
        w("line", { x: 0, y: 0, w: 320, h: 1, color: "#333333" }),
        w("button", { x: 8, y: 8, w: 90, h: 30, text: "Zurück", action: { kind: "page", to: "prev" } }),
        w("button", { x: 222, y: 8, w: 90, h: 30, text: "Weiter", action: { kind: "page", to: "next" } }),
        w("pagedots", { x: 140, y: 18, r: 3, gap: 6 }),
      ];
    },
  },
];

const BINDABLE: WidgetType[] = ["text", "value", "bar", "dot", "ring", "gauge", "lamp", "trend", "battery", "signal", "repeat", "ticker", "spark", "histo", "stats", "toggle", "slider", "stepper", "choice", "weather"];

function bbox(w: Widget) {
  if (w.type === "dot") { const r = w.r ?? 5; return { x: w.x - r, y: w.y - r, w: 2 * r, h: 2 * r }; }
  if (w.type === "text" || w.type === "value") return { x: w.x, y: w.y, w: w.w, h: fontPx(w) + 4 };
  if (w.type === "line") return { x: w.x, y: w.y, w: w.w, h: Math.max(2, w.h) };
  if (w.type === "ring") { const r = w.r ?? 30; return { x: w.x, y: w.y, w: 2 * r, h: 2 * r }; }
  if (w.type === "gauge") { const r = w.r ?? 38, d = w.thickness ?? 8;
    return { x: w.x, y: w.y, w: 2 * r, h: r + d / 2 + (w.showValue !== false ? fontPx(w) + 4 : 0) }; }
  if (w.type === "repeat") { const n = Math.max(1, w.maxItems ?? 5);
    return { x: w.x, y: w.y, w: w.w, h: Math.max(w.h, n * (w.step ?? 40)) }; }
  if (w.type === "pagedots") { const r = w.r ?? 3, gap = w.gap ?? 6, n = Math.max(1, w.lamps ?? 3);
    return { x: w.x, y: w.y, w: n * 2 * r + (n - 1) * gap, h: 2 * r }; }
  if (w.type === "lamp") {
    const r = w.r ?? 5, gap = w.gap ?? 6, n = Math.max(1, Math.min(8, w.lamps ?? 3));
    const lang = n * 2 * r + (n - 1) * gap;
    return w.vertical ? { x: w.x, y: w.y, w: 2 * r, h: lang } : { x: w.x, y: w.y, w: lang, h: 2 * r };
  }
  return { x: w.x, y: w.y, w: w.w, h: w.h };
}
function fromBox(w: Widget, b: { x: number; y: number; w: number; h: number }): Partial<Widget> {
  if (w.type === "dot") { const r = Math.max(2, Math.round(Math.min(b.w, b.h) / 2)); return { x: Math.round(b.x + b.w / 2), y: Math.round(b.y + b.h / 2), r }; }
  if (w.type === "text" || w.type === "value" || w.type === "line") return { x: Math.round(b.x), y: Math.round(b.y), w: Math.max(MINW, Math.round(b.w)) };
  if (w.type === "ring" || w.type === "gauge")
    return { x: Math.round(b.x), y: Math.round(b.y), r: Math.max(8, Math.round(b.w / 2)) };
  if (w.type === "lamp") {
    const n = Math.max(1, Math.min(8, w.lamps ?? 3)), gap = w.gap ?? 6;
    const laenge = w.vertical ? b.h : b.w;
    return { x: Math.round(b.x), y: Math.round(b.y), r: Math.max(2, Math.round((laenge - (n - 1) * gap) / (2 * n))) };
  }
  return { x: Math.round(b.x), y: Math.round(b.y), w: Math.max(MINW, Math.round(b.w)), h: Math.max(MINW, Math.round(b.h)) };
}

function WidgetView({ w, selected, onDown, bg, seiten, seiteAktiv, datensaetze = 0, aufloesenFuer = (k: Widget) => k, bildDaten = {}, qrVorschau, symbole = {} }: {
  w: Widget; selected: boolean; onDown?: (e: React.PointerEvent) => void; bg: string; seiten: number; seiteAktiv: number;
  datensaetze?: number; aufloesenFuer?: (k: Widget, i: number) => Widget;
  bildDaten?: Record<string, string>; qrVorschau?: string; symbole?: Record<string, string>;
}) {
  const ring = selected ? "0 0 0 1.5px #ffdc58" : "none";
  const hook = { "data-widget": w.id, onPointerDown: onDown } as const;
  const base: React.CSSProperties = { position: "absolute", boxSizing: "border-box", boxShadow: ring, opacity: w.hidden ? 0.25 : 1, cursor: "grab" };
  if (w.type === "button")
    return (
      <div {...hook} style={{ ...base, left: w.x, top: w.y, width: w.w, height: w.h, borderRadius: w.r ?? 4, background: w.bgColor, border: (w.borderWidth ?? 1) > 0 ? `${w.borderWidth ?? 1}px solid ${w.borderColor ?? w.color}` : "none", display: "flex", alignItems: "center", justifyContent: "center", color: w.color, fontSize: fontPx(w), fontFamily: cssFamily(w.fontFace, w.vlw), fontWeight: cssWeight(w.fontFace), fontStyle: cssStyle(w.fontFace), lineHeight: 1, whiteSpace: "nowrap" }}>
        {w.text ?? ""}
      </div>
    );
  if (w.type === "dot") { const r = w.r ?? 5; return <div {...hook} style={{ ...base, left: w.x - r, top: w.y - r, width: 2 * r, height: 2 * r, borderRadius: "50%", background: w.color }} />; }
  if (w.type === "box") return <div {...hook} style={{ ...base, left: w.x, top: w.y, width: w.w, height: w.h, borderRadius: w.r ?? 0, background: w.fill !== false ? w.color : "transparent", border: (w.fill === false || (w.borderWidth ?? 0) > 0) ? `${w.borderWidth || 1}px solid ${w.borderColor ?? w.color}` : "none" }} />;
  if (w.type === "line") return <div {...hook} style={{ ...base, left: w.x, top: w.y, width: w.w, height: Math.max(1, w.h > w.w ? w.h : 1), background: w.color }} />;
  if (w.type === "ring" || w.type === "gauge") {
    const halb = w.type === "gauge";
    const r = w.r ?? (halb ? 38 : 30);
    const dicke = w.thickness ?? 8;
    const lo = w.min ?? 0, hi = w.max ?? 100;
    const a = hi === lo ? 0 : Math.max(0, Math.min(1, ((w.value ?? 0) - lo) / (hi - lo)));
    const gr = r - dicke / 2;                    // Mittellinie des Bogens
    const zeile = w.showValue !== false ? fontPx(w) + 4 : 0;
    const hoehe = halb ? r + dicke / 2 + zeile : 2 * r;
    const track = w.track ?? "#262626";
    const farbe = w.color ?? "#22c55e";
    const umfang = 2 * Math.PI * gr;
    // Vollkreis über Strichmuster: ein einzelner Bogenpfad über 360° zerreißt.
    const bogenHalb = (bis: number, c: string) => {
      const e = Math.PI + Math.PI * bis;          // 180°..360°
      return `<path d="M ${r - gr} ${r} A ${gr} ${gr} 0 0 1 ${r + gr * Math.cos(e)} ${r + gr * Math.sin(e)}" fill="none" stroke="${c}" stroke-width="${dicke}" stroke-linecap="round"/>`;
    };
    const zeiger = () => {
      const wk = (a * 180 - 90) * Math.PI / 180;
      const len = gr - dicke - 4;
      return `<line x1="${r}" y1="${r}" x2="${r + Math.sin(wk) * len}" y2="${r - Math.cos(wk) * len}" stroke="${farbe}" stroke-width="3" stroke-linecap="round"/>`;
    };
    const inhalt = halb
      ? bogenHalb(1, track) + (a > 0.001 ? bogenHalb(a, farbe) : "") + zeiger()
      : `<circle cx="${r}" cy="${r}" r="${gr}" fill="none" stroke="${track}" stroke-width="${dicke}"/>`
        + `<circle cx="${r}" cy="${r}" r="${gr}" fill="none" stroke="${farbe}" stroke-width="${dicke}" stroke-linecap="round"`
        + ` stroke-dasharray="${umfang * a} ${umfang}" transform="rotate(-90 ${r} ${r})"/>`;
    return (
      <div {...hook} style={{ ...base, left: w.x, top: w.y, width: 2 * r, height: hoehe }}>
        <svg width={2 * r} height={hoehe} viewBox={`0 0 ${2 * r} ${hoehe}`} dangerouslySetInnerHTML={{ __html: inhalt }} />
        {w.showValue !== false && (
          <div style={{ position: "absolute", left: 0, width: 2 * r, top: halb ? r + dicke / 2 : 0,
            height: halb ? zeile : 2 * r, display: "flex", alignItems: "center", justifyContent: "center",
            color: w.color, fontSize: fontPx(w), fontFamily: cssFamily(w.fontFace, w.vlw), lineHeight: 1, pointerEvents: "none" }}>
            {(w.value ?? 0).toFixed(w.dec ?? 0)}{w.suffix ?? ""}
          </div>
        )}
      </div>
    );
  }
  if (w.type === "lamp") {
    const r = w.r ?? 5, gap = w.gap ?? 6, n = Math.max(1, Math.min(8, w.lamps ?? 3));
    const lo = w.min ?? 0, hi = w.max ?? 100;
    const a = hi === lo ? 0 : Math.max(0, Math.min(1, ((w.value ?? 0) - lo) / (hi - lo)));
    const aktiv = Math.min(n - 1, Math.floor(a * n));
    const senk = !!w.vertical;
    return (
      <div {...hook} style={{ ...base, left: w.x, top: w.y, display: "flex", gap,
        flexDirection: senk ? "column" : "row", alignItems: "center" }}>
        {Array.from({ length: n }, (_, i) => (
          <div key={i} style={{ width: 2 * r, height: 2 * r, borderRadius: "50%",
            background: i === aktiv ? (w.color ?? "#22c55e") : (w.track ?? "#262626") }} />
        ))}
      </div>
    );
  }
  if (w.type === "icon") {
    const s2 = Math.max(8, Math.min(w.w, w.h));
    const c = w.color ?? "#f5f5f5";
    const m = s2 / 2, r = s2 / 2, d = Math.max(1, s2 / 8);
    const formen: Record<string, string> = {
      haus: `<polygon points="${m},0 0,${m} ${s2},${m}" fill="${c}"/><rect x="${m - r / 2}" y="${m}" width="${r}" height="${r}" fill="${c}"/>`,
      wlan: [1, 2, 3].map((k) => `<path d="M ${m - (r * k) / 3} ${s2 - d} A ${(r * k) / 3} ${(r * k) / 3} 0 0 1 ${m + (r * k) / 3} ${s2 - d}" fill="none" stroke="${c}" stroke-width="${d}"/>`).join("") + `<circle cx="${m}" cy="${s2 - d}" r="${d}" fill="${c}"/>`,
      temperatur: `<rect x="${m - d}" y="0" width="${2 * d}" height="${s2 - 2 * d}" rx="${d}" fill="${c}"/><circle cx="${m}" cy="${s2 - 2 * d}" r="${2 * d}" fill="${c}"/>`,
      tropfen: `<polygon points="${m},0 ${m - r / 2},${m} ${m + r / 2},${m}" fill="${c}"/><circle cx="${m}" cy="${m + r / 3}" r="${(r * 2) / 3}" fill="${c}"/>`,
      wind: [0, 1, 2].map((k) => `<rect x="0" y="${m - r / 2 + (k * r) / 2}" width="${s2 - (k * s2) / 4}" height="${d}" fill="${c}"/>`).join(""),
      blitz: `<polygon points="${m + r / 3},0 ${m - r / 2},${m + d} ${m},${m + d}" fill="${c}"/><polygon points="${m - r / 3},${s2} ${m + r / 2},${m - d} ${m},${m - d}" fill="${c}"/>`,
      akku: `<rect x="0" y="${m - r / 2}" width="${s2 - 2 * d}" height="${r}" fill="none" stroke="${c}"/><rect x="${s2 - 2 * d}" y="${m - r / 4}" width="${2 * d}" height="${r / 2}" fill="${c}"/><rect x="${d}" y="${m - r / 2 + d}" width="${((s2 - 4 * d) * 2) / 3}" height="${r - 2 * d}" fill="${c}"/>`,
      uhr: `<circle cx="${m}" cy="${m}" r="${r - 1}" fill="none" stroke="${c}"/><line x1="${m}" y1="${m}" x2="${m}" y2="${m - r / 2}" stroke="${c}" stroke-width="${d}"/><line x1="${m}" y1="${m}" x2="${m + r / 3}" y2="${m}" stroke="${c}" stroke-width="${d}"/>`,
      warnung: `<polygon points="${m},0 0,${s2} ${s2},${s2}" fill="${c}"/><rect x="${m - d / 2}" y="${m - r / 4}" width="${d}" height="${r / 2}" fill="${bg}"/><rect x="${m - d / 2}" y="${m + r / 2}" width="${d}" height="${d}" fill="${bg}"/>`,
      haken: `<polyline points="${d},${m} ${m - d},${s2 - 2 * d} ${s2 - d},${d}" fill="none" stroke="${c}" stroke-width="${d * 1.5}" stroke-linecap="round"/>`,
      kreuz: `<line x1="${d}" y1="${d}" x2="${s2 - d}" y2="${s2 - d}" stroke="${c}" stroke-width="${d * 1.5}" stroke-linecap="round"/><line x1="${s2 - d}" y1="${d}" x2="${d}" y2="${s2 - d}" stroke="${c}" stroke-width="${d * 1.5}" stroke-linecap="round"/>`,
      "pfeil-oben": `<polygon points="${m},0 ${m - r / 2},${m} ${m + r / 2},${m}" fill="${c}"/><rect x="${m - d}" y="${m}" width="${2 * d}" height="${r}" fill="${c}"/>`,
      "pfeil-unten": `<polygon points="${m},${s2} ${m - r / 2},${m} ${m + r / 2},${m}" fill="${c}"/><rect x="${m - d}" y="0" width="${2 * d}" height="${r}" fill="${c}"/>`,
      person: `<circle cx="${m}" cy="${r / 2}" r="${r / 3}" fill="${c}"/><rect x="${m - r / 2}" y="${m + d}" width="${r}" height="${r - d}" rx="${d}" fill="${c}"/>`,
      server: [0, 1, 2].map((k) => `<rect x="0" y="${(k * s2) / 3}" width="${s2}" height="${s2 / 3 - 1}" fill="none" stroke="${c}"/><rect x="${d}" y="${(k * s2) / 3 + s2 / 9}" width="${d}" height="${d}" fill="${c}"/>`).join(""),
      glocke: `<rect x="${m - r / 2}" y="${d}" width="${r}" height="${s2 - 3 * d}" rx="${r / 2}" fill="${c}"/><rect x="0" y="${s2 - 3 * d}" width="${s2}" height="${d}" fill="${c}"/><circle cx="${m}" cy="${s2 - d}" r="${d}" fill="${c}"/>`,
    };
    return (
      <div {...hook} style={{ ...base, left: w.x, top: w.y, width: s2, height: s2 }}>
        <svg width={s2} height={s2} viewBox={`0 0 ${s2} ${s2}`}
          dangerouslySetInnerHTML={{ __html: formen[w.icon ?? "haus"] ?? formen.haus }} />
      </div>
    );
  }
  if (w.type === "image" || w.type === "qr") {
    const quelle = w.type === "qr" ? qrVorschau : (w.asset ? bildDaten[w.asset] : undefined);
    return (
      <div {...hook} style={{ ...base, left: w.x, top: w.y, width: w.w, height: w.h,
        border: quelle ? "none" : "1px dashed #555", display: "flex", alignItems: "center", justifyContent: "center" }}>
        {quelle
          ? <img src={quelle} alt="" width={w.w} height={w.h} style={{ display: "block", imageRendering: "pixelated" }} />
          : <span style={{ fontSize: 9, color: "#888" }}>{w.type === "qr" ? "QR" : "kein Bild"}</span>}
      </div>
    );
  }
  if (w.type === "weather") {
    const s2 = Math.max(12, Math.min(w.w, w.h));
    const code = Math.round(w.value ?? 0);
    if (w.iconStyle !== "einfach") {
      const name = meteoconFuer(code, !!w.night);
      const quelle = symbole[`${name}|${w.iconSet ?? "fill"}`];
      return (
        <div {...hook} title="im Editor animiert, auf dem Gerät als Einzelbilder"
          style={{ ...base, left: w.x, top: w.y, width: s2, height: s2 }}>
          {quelle
            ? <div style={{ width: s2, height: s2, lineHeight: 0 }}
                dangerouslySetInnerHTML={{ __html: quelle.replace("<svg", `<svg width="${s2}" height="${s2}"`) }} />
            : <div style={{ width: s2, height: s2, border: "1px dashed #555" }} />}
        </div>
      );
    }
    const art = wetterArt(code);
    const vorn = w.color ?? "#f5f5f5", zweit = w.track ?? "#9a9088";
    const m = s2 / 2;
    const sonne = w.night
      ? `<circle cx="${m}" cy="${m}" r="${s2 / 3}" fill="${vorn}"/><circle cx="${m + s2 / 6}" cy="${m - s2 / 9}" r="${s2 / 3}" fill="${bg}"/>`
      : `<circle cx="${m}" cy="${m}" r="${s2 / 4.5}" fill="${vorn}"/>` +
        Array.from({ length: 8 }, (_, k2) => {
          const a = (k2 * Math.PI) / 4, r1 = s2 / 3, r2 = s2 / 2.2;
          return `<line x1="${m + Math.cos(a) * r1}" y1="${m + Math.sin(a) * r1}" x2="${m + Math.cos(a) * r2}" y2="${m + Math.sin(a) * r2}" stroke="${vorn}" stroke-width="2" stroke-linecap="round"/>`;
        }).join("");
    const wolke = (mx: number, my: number, b: number, c: string) => {
      const r = b / 4;
      return `<circle cx="${mx - b / 4}" cy="${my}" r="${r}" fill="${c}"/><circle cx="${mx + b / 4}" cy="${my}" r="${r}" fill="${c}"/>`
        + `<circle cx="${mx}" cy="${my - r / 2}" r="${r * 1.33}" fill="${c}"/>`
        + `<rect x="${mx - b / 4 - r}" y="${my}" width="${b / 2 + 2 * r}" height="${r}" fill="${c}"/>`;
    };
    const inhalt = art === "klar" ? sonne
      : art === "wolkig" ? wolke(m, m, s2 * 0.75, vorn)
      : wolke(m, m - s2 / 6, s2 * 0.75, vorn);
    return (
      <div {...hook} style={{ ...base, left: w.x, top: w.y, width: s2, height: s2 }}>
        <svg width={s2} height={s2} viewBox={`0 0 ${s2} ${s2}`} dangerouslySetInnerHTML={{ __html: inhalt }} />
      </div>
    );
  }
  if (w.type === "toggle") {
    const ein = (w.value ?? 0) > 0.5;
    const kr = Math.max(2, w.h / 2 - 3);
    return (
      <div {...hook} style={{ ...base, left: w.x, top: w.y, width: w.w, height: w.h, borderRadius: w.r ?? w.h / 2,
        background: ein ? (w.color ?? "#22c55e") : (w.track ?? "#3a3a3a") }}>
        <div style={{ position: "absolute", top: w.h / 2 - kr, left: (ein ? w.w - w.h / 2 : w.h / 2) - kr,
          width: 2 * kr, height: 2 * kr, borderRadius: "50%", background: w.bgColor ?? "#f5f5f5" }} />
      </div>
    );
  }
  if (w.type === "slider") {
    const lo = w.min ?? 0, hi = w.max ?? 100;
    const a = hi === lo ? 0 : Math.max(0, Math.min(1, ((w.value ?? 0) - lo) / (hi - lo)));
    const sh = Math.max(3, Math.round(w.h / 3));
    const gr = Math.max(3, w.h / 2 - 1);
    return (
      <div {...hook} style={{ ...base, left: w.x, top: w.y, width: w.w, height: w.h }}>
        <div style={{ position: "absolute", top: (w.h - sh) / 2, left: 0, width: w.w, height: sh,
          borderRadius: sh / 2, background: w.track ?? "#262626" }} />
        <div style={{ position: "absolute", top: (w.h - sh) / 2, left: 0, width: w.w * a, height: sh,
          borderRadius: sh / 2, background: w.color ?? "#22c55e" }} />
        <div style={{ position: "absolute", top: w.h / 2 - gr, left: w.w * a - gr, width: 2 * gr, height: 2 * gr,
          borderRadius: "50%", background: w.color ?? "#22c55e" }} />
      </div>
    );
  }
  if (w.type === "stepper") {
    // Höchstens ein Drittel der Breite je Taste — sonst treffen sie sich in der Mitte
    const seite = Math.min(w.h, Math.floor(w.w / 3));
    return (
      <div {...hook} style={{ ...base, left: w.x, top: w.y, width: w.w, height: w.h, borderRadius: w.r ?? 4,
        background: w.bgColor ?? "#262626", border: `${w.borderWidth ?? 1}px solid ${w.borderColor ?? "#3a3a3a"}`,
        display: "flex", alignItems: "center", color: w.color, fontSize: fontPx(w),
        fontFamily: cssFamily(w.fontFace, w.vlw), lineHeight: 1 }}>
        <div style={{ width: seite, textAlign: "center", borderRight: `1px solid ${w.borderColor ?? "#3a3a3a"}` }}>−</div>
        <div style={{ flex: 1, textAlign: "center" }}>{(w.value ?? 0).toFixed(w.dec ?? 0)}{w.suffix ?? ""}</div>
        <div style={{ width: seite, textAlign: "center", borderLeft: `1px solid ${w.borderColor ?? "#3a3a3a"}` }}>+</div>
      </div>
    );
  }
  if (w.type === "choice") {
    const opts = w.options ?? [];
    const aktiv = w.text ?? "";
    return (
      <div {...hook} style={{ ...base, left: w.x, top: w.y, width: w.w, height: w.h, display: "flex" }}>
        {opts.map((o, k) => {
          const an = o.value === aktiv;
          return (
            <div key={k} style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
              borderRadius: w.r ?? 4, background: an ? (w.color ?? "#f5f5f5") : (w.bgColor ?? "#262626"),
              color: an ? (w.bgColor ?? "#262626") : (w.color ?? "#f5f5f5"),
              border: `${w.borderWidth ?? 1}px solid ${w.borderColor ?? "#3a3a3a"}`,
              fontSize: fontPx(w), fontFamily: cssFamily(w.fontFace, w.vlw), lineHeight: 1 }}>{o.label}</div>
          );
        })}
      </div>
    );
  }
  if (w.type === "spark" || w.type === "histo") {
    // Im Editor gibt es keinen Verlauf — eine ruhige Beispielkurve zeigt die Form
    const n = Math.max(4, Math.min(w.samples ?? 40, 48));
    const werte = Array.from({ length: n }, (_, k) =>
      0.5 + 0.32 * Math.sin(k / 3.1) + 0.12 * Math.sin(k / 1.3));
    const yv = (a: number) => w.h - 1 - a * (w.h - 2);
    const farbe = w.color ?? "#22c55e";
    const inhalt = w.type === "histo"
      ? werte.map((a, k) => {
          const bw = Math.max(1, w.w / n);
          return `<rect x="${k * bw}" y="${yv(a)}" width="${Math.max(1, bw - 1)}" height="${w.h - yv(a)}" fill="${farbe}"/>`;
        }).join("")
      : `<polyline fill="none" stroke="${farbe}" stroke-width="1.5" points="${werte
          .map((a, k) => `${(k * (w.w - 1)) / (n - 1)},${yv(a)}`).join(" ")}"/>`;
    return (
      <div {...hook} style={{ ...base, left: w.x, top: w.y, width: w.w, height: w.h }}>
        <svg width={w.w} height={w.h} viewBox={`0 0 ${w.w} ${w.h}`}
          dangerouslySetInnerHTML={{ __html: `<line x1="0" y1="${w.h - 1}" x2="${w.w}" y2="${w.h - 1}" stroke="${w.track ?? "#262626"}"/>` + inhalt }} />
      </div>
    );
  }
  if (w.type === "stats") {
    const namen: Record<string, string> = { min: "Min", max: "Max", avg: "Ø", last: "Jetzt" };
    const justify2 = w.align === "right" ? "flex-end" : w.align === "center" ? "center" : "flex-start";
    return (
      <div {...hook} style={{ ...base, left: w.x, top: w.y, width: w.w, height: fontPx(w) + 4,
        display: "flex", alignItems: "center", justifyContent: justify2, color: w.color, fontSize: fontPx(w),
        fontFamily: cssFamily(w.fontFace, w.vlw), lineHeight: 1, whiteSpace: "nowrap" }}>
        {(w.value ?? 0).toFixed(w.dec ?? 0)}{w.suffix ?? ""}
        <span style={{ opacity: 0.45, marginLeft: 4, fontSize: "0.75em" }}>{namen[w.stat ?? "avg"]}</span>
      </div>
    );
  }
  if (w.type === "clock") {
    const jetzt = new Date();
    const zz = (n: number) => String(n).padStart(2, "0");
    const txt = (w.format ?? "HH:mm")
      .replace("HH", zz(jetzt.getHours())).replace("mm", zz(jetzt.getMinutes()))
      .replace("ss", zz(jetzt.getSeconds())).replace("dd", zz(jetzt.getDate()))
      .replace("MM", zz(jetzt.getMonth() + 1)).replace("yyyy", String(jetzt.getFullYear()));
    const justify3 = w.align === "right" ? "flex-end" : w.align === "center" ? "center" : "flex-start";
    return (
      <div {...hook} style={{ ...base, left: w.x, top: w.y, width: w.w, height: fontPx(w) + 4,
        display: "flex", alignItems: "center", justifyContent: justify3, color: w.color, fontSize: fontPx(w),
        fontFamily: cssFamily(w.fontFace, w.vlw), lineHeight: 1, whiteSpace: "nowrap" }}>{txt}</div>
    );
  }
  if (w.type === "trend") {
    const s2 = Math.max(6, Math.min(w.w, w.h));
    const val = w.value ?? 0, ref = w.refValue ?? 0;
    const rauf = val > ref, gleich = Math.abs(val - ref) < 0.001;
    const farbe = gleich ? "#9a9088" : rauf ? (w.color ?? "#22c55e") : (w.track ?? "#ef4444");
    return (
      <div {...hook} style={{ ...base, left: w.x, top: w.y, width: s2, height: s2 }}>
        <svg width={s2} height={s2} viewBox={`0 0 ${s2} ${s2}`}>
          {gleich
            ? <rect x={1} y={s2 / 2 - 1.5} width={s2 - 2} height={3} fill={farbe} />
            : <polygon fill={farbe} points={rauf
                ? `${s2 / 2},1 1,${s2 - 1} ${s2 - 1},${s2 - 1}`
                : `${s2 / 2},${s2 - 1} 1,1 ${s2 - 1},1`} />}
        </svg>
      </div>
    );
  }
  if (w.type === "battery") {
    const lo = w.min ?? 0, hi = w.max ?? 100;
    const f = hi === lo ? 0 : Math.max(0, Math.min(1, ((w.value ?? 0) - lo) / (hi - lo)));
    const kopf = Math.max(2, Math.round(w.h / 3));
    const bw = w.w - kopf - 1;
    return (
      <div {...hook} style={{ ...base, left: w.x, top: w.y, width: w.w, height: w.h }}>
        <div style={{ position: "absolute", left: 0, top: 0, width: bw, height: w.h, border: `1px solid ${w.track ?? "#3a3a3a"}` }}>
          <div style={{ position: "absolute", left: 1, top: 1, width: Math.max(0, (bw - 4) * f), height: w.h - 4, background: w.color ?? "#22c55e" }} />
        </div>
        <div style={{ position: "absolute", left: bw + 1, top: Math.round(w.h / 3), width: kopf, height: w.h - 2 * Math.round(w.h / 3), background: w.track ?? "#3a3a3a" }} />
      </div>
    );
  }
  if (w.type === "signal") {
    const n = Math.max(1, Math.min(8, w.bars ?? 4));
    const lo = w.min ?? 0, hi = w.max ?? 100;
    const aktiv = Math.round((hi === lo ? 0 : Math.max(0, Math.min(1, ((w.value ?? 0) - lo) / (hi - lo)))) * n);
    const bw = Math.max(1, (w.w - (n - 1) * 2) / n);
    return (
      <div {...hook} style={{ ...base, left: w.x, top: w.y, width: w.w, height: w.h, display: "flex", alignItems: "flex-end", gap: 2 }}>
        {Array.from({ length: n }, (_, i2) => (
          <div key={i2} style={{ width: bw, height: (w.h * (i2 + 1)) / n,
            background: i2 < aktiv ? (w.color ?? "#22c55e") : (w.track ?? "#3a3a3a") }} />
        ))}
      </div>
    );
  }
  if (w.type === "ticker") {
    return (
      <div {...hook} style={{ ...base, left: w.x, top: w.y, width: w.w, height: fontPx(w) + 4, overflow: "hidden",
        display: "flex", alignItems: "center", color: w.color, fontSize: fontPx(w),
        fontFamily: cssFamily(w.fontFace, w.vlw), lineHeight: 1, whiteSpace: "nowrap" }}>
        {w.text ?? ""}
      </div>
    );
  }
  if (w.type === "repeat") {
    const schritt = w.step ?? 40;
    const kinder = w.children ?? [];
    const n = Math.max(1, Math.min(w.maxItems ?? 5, datensaetze || 1));
    return (
      <div {...hook} style={{ ...base, left: w.x, top: w.y, width: w.w, height: Math.max(w.h, n * schritt) }}>
        {Array.from({ length: n }, (_, i) => (
          <div key={i} style={{ position: "absolute", left: 0, top: i * schritt, width: w.w, height: schritt }}>
            {kinder.map((k) => (
              <WidgetView key={k.id + "-" + i} w={aufloesenFuer(k, i)} selected={false}
                bg={bg} seiten={seiten} seiteAktiv={seiteAktiv} />
            ))}
          </div>
        ))}
        {!kinder.length && (
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center",
            border: "1px dashed #555", color: "#888", fontSize: 10 }}>Vorlage leer</div>
        )}
      </div>
    );
  }
  if (w.type === "pagedots") {
    const r = w.r ?? 3, gap = w.gap ?? 6;
    const n = Math.max(1, seiten);
    return (
      <div {...hook} style={{ ...base, left: w.x, top: w.y, display: "flex", gap, alignItems: "center" }}>
        {Array.from({ length: n }, (_, i) => (
          <div key={i} style={{ width: 2 * r, height: 2 * r, borderRadius: "50%",
            background: i === seiteAktiv ? (w.color ?? "#f5f5f5") : (w.track ?? "#3a3a3a") }} />
        ))}
      </div>
    );
  }
  if (w.type === "frame") {
    return (
      <div {...hook} style={{ ...base, left: w.x, top: w.y, width: w.w, height: w.h,
        border: `${w.borderWidth ?? 1}px solid ${w.borderColor ?? "#333333"}`, borderRadius: w.r ?? 4 }}>
        {w.title && (
          <span style={{ position: "absolute", left: 8, top: -fontPx(w) / 2, padding: "0 3px",
            background: bg, color: w.color, fontSize: fontPx(w),
            fontFamily: cssFamily(w.fontFace, w.vlw), lineHeight: 1, whiteSpace: "nowrap" }}>{w.title}</span>
        )}
      </div>
    );
  }
  if (w.type === "bar") { const v = Math.max(0, Math.min(100, w.value ?? 0)); return <div {...hook} style={{ ...base, left: w.x, top: w.y, width: w.w, height: w.h, borderRadius: w.r ?? w.h / 2, background: w.track }}><div style={{ width: `${v}%`, height: "100%", borderRadius: w.r ?? w.h / 2, background: w.color }} /></div>; }
  const txt = w.type === "value" ? `${(w.value ?? 0).toFixed(w.dec ?? 0)}${w.suffix ?? ""}` : w.text ?? "";
  const justify = w.align === "right" ? "flex-end" : w.align === "center" ? "center" : "flex-start";
  return <div {...hook} style={{ ...base, left: w.x, top: w.y, width: w.w, height: fontPx(w) + 4, display: "flex", alignItems: "center", justifyContent: justify, color: w.color, fontSize: fontPx(w), fontFamily: cssFamily(w.fontFace, w.vlw), fontWeight: cssWeight(w.fontFace), fontStyle: cssStyle(w.fontFace), lineHeight: 1, whiteSpace: "nowrap" }}>{txt}</div>;
}

/* ---- Snapping: Kanten/Mitten anderer Felder + Display-Ränder/-Mitte ---- */
const SNAP = 4; // Gerätepixel Fangradius
type Box = { x: number; y: number; w: number; h: number };
type Guide = { axis: "x" | "y"; at: number };

function snapBox(b: Box, others: Box[], W: number, H: number): { box: Box; guides: Guide[] } {
  const guides: Guide[] = [];
  const xTargets = [0, W / 2, W, ...others.flatMap((o) => [o.x, o.x + o.w / 2, o.x + o.w])];
  const yTargets = [0, H / 2, H, ...others.flatMap((o) => [o.y, o.y + o.h / 2, o.y + o.h])];
  const xEdges: [number, number][] = [[b.x, 0], [b.x + b.w / 2, b.w / 2], [b.x + b.w, b.w]];
  const yEdges: [number, number][] = [[b.y, 0], [b.y + b.h / 2, b.h / 2], [b.y + b.h, b.h]];
  let nx = b.x, ny = b.y, bestX = SNAP + 1, bestY = SNAP + 1;
  for (const [edge, off] of xEdges) for (const t of xTargets) {
    const d = Math.abs(edge - t);
    if (d <= SNAP && d < bestX) { bestX = d; nx = t - off; }
  }
  for (const [edge, off] of yEdges) for (const t of yTargets) {
    const d = Math.abs(edge - t);
    if (d <= SNAP && d < bestY) { bestY = d; ny = t - off; }
  }
  if (bestX <= SNAP) { const snapped = [nx, nx + b.w / 2, nx + b.w].find((e) => xTargets.some((t) => Math.abs(e - t) < 0.5)); if (snapped !== undefined) guides.push({ axis: "x", at: snapped }); }
  if (bestY <= SNAP) { const snapped = [ny, ny + b.h / 2, ny + b.h].find((e) => yTargets.some((t) => Math.abs(e - t) < 0.5)); if (snapped !== undefined) guides.push({ axis: "y", at: snapped }); }
  return { box: { ...b, x: nx, y: ny }, guides };
}

const HANDLES: { k: string; dir: { n?: 1; s?: 1; e?: 1; w?: 1 }; cx: number; cy: number; cursor: string }[] = [
  { k: "nw", dir: { n: 1, w: 1 }, cx: 0, cy: 0, cursor: "nwse-resize" }, { k: "n", dir: { n: 1 }, cx: 0.5, cy: 0, cursor: "ns-resize" }, { k: "ne", dir: { n: 1, e: 1 }, cx: 1, cy: 0, cursor: "nesw-resize" },
  { k: "w", dir: { w: 1 }, cx: 0, cy: 0.5, cursor: "ew-resize" }, { k: "e", dir: { e: 1 }, cx: 1, cy: 0.5, cursor: "ew-resize" },
  { k: "sw", dir: { s: 1, w: 1 }, cx: 0, cy: 1, cursor: "nesw-resize" }, { k: "s", dir: { s: 1 }, cx: 0.5, cy: 1, cursor: "ns-resize" }, { k: "se", dir: { s: 1, e: 1 }, cx: 1, cy: 1, cursor: "nwse-resize" },
];

/** Die Panel-Inhalte bleiben in der Hauptkomponente; dockview blendet hier nur den passenden ein. */
type Slots = Record<string, React.ReactNode>;
const SlotCtx = createContext<Slots>({});
/** Bereiche mit abweichendem Innenabstand — alle anderen bekommen den Standard. */
const DOCK_PAD: Record<string, string> = { display: "p-0" };
function Slot({ params }: IDockviewPanelProps<{ slot: string }>) {
  const slots = useContext(SlotCtx);
  // Ein Rahmen für alle Bereiche: Scrollbalken, Höhe und Innenabstand an EINER Stelle.
  return (
    <OverlayScrollbarsComponent defer className="h-full w-full bg-card" options={{ overflow: { x: "hidden" } }}>
      <div className={`min-h-full flex flex-col gap-4 ${DOCK_PAD[params.slot] ?? "p-4"}`}>
        {slots[params.slot]}
      </div>
    </OverlayScrollbarsComponent>
  );
}
const DOCK_COMPONENTS = { slot: Slot };

/** Zustand je Bereich (Höhe gebunden, eingeklappt) — eine Stelle für beide Schalter. */
type PanelFlag = "fit" | "zu";
const PANEL_KEY = "slab:panels";
const panelState = {
  daten: null as Record<string, Partial<Record<PanelFlag, boolean>>> | null,
  hoerer: new Set<() => void>(),
  alle() {
    if (!this.daten) {
      try { this.daten = JSON.parse(localStorage.getItem(PANEL_KEY) ?? "{}"); }
      catch { this.daten = {}; }
    }
    return this.daten!;
  },
  an(id: string, flag: PanelFlag) { return !!this.alle()[id]?.[flag]; },
  um(id: string, flag: PanelFlag) {
    const d = this.alle();
    d[id] = { ...d[id], [flag]: !d[id]?.[flag] };
    try { localStorage.setItem(PANEL_KEY, JSON.stringify(d)); } catch { /* voll */ }
    this.hoerer.forEach((h) => h());
  },
  lauschen(h: () => void) { this.hoerer.add(h); return () => { this.hoerer.delete(h); }; },
};
function usePanelFlag(id: string, flag: PanelFlag) {
  return useSyncExternalStore((h) => panelState.lauschen(h), () => panelState.an(id, flag), () => false);
}

/** Echte Inhaltshöhe messen — min-h-full würde sonst immer die Containerhöhe liefern. */
function inhaltsHoehe(el: HTMLElement) {
  const vorher = el.style.minHeight;
  el.style.minHeight = "0";
  const h = el.scrollHeight;
  el.style.minHeight = vorher;
  return h;
}
/** Liegt der Bereich neben seinen Nachbarn (dann seitlich einklappen) oder darüber/darunter? */
function liegtNebeneinander(el: HTMLElement) {
  const v = el.closest<HTMLElement>(".dv-view");
  return !!v?.style.width;   // dockview setzt width/left waagerecht, height/top senkrecht
}

/** Schalter in der Bereichsleiste: Höhe an Inhalt binden, Bereich einklappen. */
function PanelActions(props: IDockviewHeaderActionsProps) {
  // Panel-ID, nicht Gruppen-ID: die vergibt dockview beim Laden neu.
  const id = props.activePanel?.id ?? props.panels[0]?.id ?? props.group.id;
  const fit = usePanelFlag(id, "fit");
  const zu = usePanelFlag(id, "zu");

  const messen = useCallback(() => {
    const el = props.group.element;
    const inhalt = el.querySelector<HTMLElement>(".dv-content-container .min-h-full");
    const leiste = el.querySelector<HTMLElement>(".dv-tabs-and-actions-container");
    if (!inhalt) return 0;
    return inhaltsHoehe(inhalt) + (leiste?.offsetHeight ?? 0) + 4;
  }, [props.group]);

  // --- Einklappen: Richtung ergibt sich aus der Lage der Nachbarn ---
  useEffect(() => {
    const el = props.group.element;
    const leiste = el.querySelector<HTMLElement>(".dv-tabs-and-actions-container");
    const seitlich = liegtNebeneinander(el);
    el.classList.toggle("slab-zu", zu);
    el.classList.toggle("slab-zu-seitlich", zu && seitlich);
    if (!zu) return;
    if (seitlich) {
      props.api.setConstraints({ minimumWidth: 36, maximumWidth: 36 });
      props.api.setSize({ width: 36 });
    }
    else {
      const h = (leiste?.offsetHeight ?? 35) + 2;
      props.api.setConstraints({ minimumHeight: h, maximumHeight: h });
      props.api.setSize({ height: h });
    }
    return () => {
      el.classList.remove("slab-zu", "slab-zu-seitlich");
      props.api.setConstraints({ minimumWidth: 60, maximumWidth: Number.MAX_SAFE_INTEGER,
                                 minimumHeight: 60, maximumHeight: Number.MAX_SAFE_INTEGER });
    };
  }, [zu, props.api, props.group]);

  // --- Höhe an den Inhalt binden (nur sinnvoll, solange nicht eingeklappt) ---
  useEffect(() => {
    if (!fit || zu) {
      if (!zu) props.api.setConstraints({ minimumHeight: 60, maximumHeight: Number.MAX_SAFE_INTEGER });
      return;
    }
    const hoehe = () => messen() || 100;
    props.api.setConstraints({ minimumHeight: hoehe, maximumHeight: hoehe });
    props.api.setSize({ height: hoehe() });
    const inhalt = props.group.element.querySelector<HTMLElement>(".dv-content-container .min-h-full");
    if (!inhalt) return;
    let geplant = 0;
    const mo = new MutationObserver(() => {
      if (geplant) return;
      geplant = requestAnimationFrame(() => { geplant = 0; props.api.setSize({ height: hoehe() }); });
    });
    mo.observe(inhalt, { childList: true, subtree: true });
    return () => { mo.disconnect(); if (geplant) cancelAnimationFrame(geplant); };
  }, [fit, zu, messen, props.api, props.group]);

  return (
    <div className="flex items-center h-full">
      <button type="button" onClick={() => panelState.um(id, "fit")} aria-pressed={fit}
        title={fit ? "Höhe folgt dem Inhalt (aktiv)" : "Höhe an den Inhalt binden"}
        className={`px-1.5 h-full cursor-pointer ${fit ? "text-primary" : "text-muted-foreground hover:text-foreground"}`}>
        <ChevronsDownUp className="size-3.5" />
      </button>
      <button type="button" onClick={() => panelState.um(id, "zu")} aria-pressed={zu}
        title={zu ? "Bereich ausklappen" : "Bereich einklappen"}
        className={`px-1.5 h-full cursor-pointer ${zu ? "text-primary" : "text-muted-foreground hover:text-foreground"}`}>
        {zu ? <ChevronRight className="size-3.5" /> : <ChevronDown className="size-3.5" />}
      </button>
    </div>
  );
}

const DOCK_KEY = "slab:dock";
const DOCK_TITEL: Record<string, string> = { felder: "Felder", vorlagen: "Vorlagen", ebenen: "Ebenen", quellen: "Quellen", display: "Display", eigenschaften: "Eigenschaften", geraet: "Gerät" };
/** Standardaufteilung: Ebenen links, Display in der Mitte, Eigenschaften rechts. */
function defaultDock(api: DockviewApi) {
  const basis = (id: string) => ({ id, component: "slot", title: DOCK_TITEL[id], params: { slot: id } });
  const mitte = api.addPanel(basis("display"));
  const felder = api.addPanel({ ...basis("felder"), position: { referencePanel: mitte, direction: "left" }, initialWidth: 250, initialHeight: 200 });
  const ebenen = api.addPanel({ ...basis("ebenen"), position: { referencePanel: felder, direction: "below" }, initialHeight: 460 });
  api.addPanel({ ...basis("quellen"), position: { referencePanel: ebenen, direction: "below" }, initialHeight: 240 });
  api.addPanel({ ...basis("vorlagen"), position: { referencePanel: felder, direction: "within" }, inactive: true });
  const rechts = api.addPanel({ ...basis("eigenschaften"), position: { referencePanel: mitte, direction: "right" }, initialWidth: 320 });
  api.addPanel({ ...basis("geraet"), position: { referencePanel: rechts, direction: "below" }, initialHeight: 300 });
}

/** Log-Ansicht, die bei neuen Zeilen automatisch ans Ende springt. */
function LogView({ text, className, size = "text-[10px]" }: { text: string; className?: string; size?: string }) {
  const ref = useRef<OverlayScrollbarsComponentRef>(null);
  useEffect(() => {
    const vp = ref.current?.osInstance()?.elements().viewport;
    if (vp) vp.scrollTo({ top: vp.scrollHeight });
  }, [text]);
  return (
    <OverlayScrollbarsComponent defer ref={ref} className={className}>
      <pre className={`${size} font-mono whitespace-pre-wrap p-2`}>{text}</pre>
    </OverlayScrollbarsComponent>
  );
}

export default function Editor() {
  const [layout, setLayout] = useState<Layout>(DEFAULT_LAYOUT);
  const [selIds, setSelIds] = useState<string[]>([]);
  const selRef = useRef<string[]>([]); selRef.current = selIds;
  const sel = selIds.length ? selIds[selIds.length - 1] : null;   // Referenz für die Anzeige
  const setSel = (id: string | null) => setSelIds(id ? [id] : []);
  const toggleSel = (id: string, additive: boolean) =>
    setSelIds((cur) => (additive ? (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]) : [id]));
  const [connected, setConnected] = useState(false);
  const [data, setData] = useState<Record<string, unknown>>({});
  const [srcErr, setSrcErr] = useState<Record<string, string>>({});
  const [pathQuery, setPathQuery] = useState("");
  const [guides, setGuides] = useState<Guide[]>([]);
  /** Aufgezogener Auswahlrahmen (Gerätepixel), solange die Maustaste gedrückt ist. */
  const [rahmen, setRahmen] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const rahmenStart = useRef<{ x: number; y: number; additiv: boolean; vorher: string[] } | null>(null);
  const rahmenRef = useRef<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const [srcEdit, setSrcEdit] = useState<string | null>(null);
  const [wifiOpen, setWifiOpen] = useState(false);
  const [wifiSsid, setWifiSsid] = useState("");
  const [wifiPass, setWifiPass] = useState("");
  const [eigeneSchriften, setEigeneSchriften] = useState<EigeneSchrift[]>([]);
  const schriftRef = useRef<HTMLInputElement>(null);
  useEffect(() => { schriftenListe().then((l) => { setEigeneSchriften(l); l.forEach((f) => schriftBereitstellen(f.id)); }); }, []);
  const schriftHochladen = async (datei?: File) => {
    if (!datei) return;
    try {
      const e = await schriftSpeichern(datei);
      await schriftBereitstellen(e.id);
      setEigeneSchriften(await schriftenListe());
      toast.success(`Schrift „${e.name}" hinzugefügt`);
    } catch (err) { toast.error("Schrift konnte nicht gelesen werden: " + (err as Error).message); }
  };
  /* --- Google-Schriften: Auswahl mit Suche --- */
  const [googleOffen, setGoogleOffen] = useState(false);
  const [googleAlle, setGoogleAlle] = useState<GoogleSchrift[]>([]);
  const [googleSuche, setGoogleSuche] = useState("");
  const [googleLaedt, setGoogleLaedt] = useState<string | null>(null);
  const googleOeffnen = async () => {
    setGoogleOffen(true);
    if (googleAlle.length) return;
    try { setGoogleAlle(await googleListe()); }
    catch (e) { toast.error("Schriftliste nicht erreichbar: " + (e as Error).message); }
  };
  const googleTreffer = useMemo(() => {
    const q = googleSuche.trim().toLowerCase();
    return (q ? googleAlle.filter((f) => f.name.toLowerCase().includes(q)) : googleAlle).slice(0, 80);
  }, [googleAlle, googleSuche]);
  // Die angezeigten Namen in ihrer eigenen Schrift zeigen — sonst ist die Auswahl ein Blindflug.
  useEffect(() => {
    if (!googleOffen || !googleTreffer.length) return;
    const id = "slab-google-vorschau";
    const fam = googleTreffer.slice(0, 40).map((f) => `family=${encodeURIComponent(f.name)}`).join("&");
    let el = document.getElementById(id) as HTMLLinkElement | null;
    if (!el) { el = document.createElement("link"); el.id = id; el.rel = "stylesheet"; document.head.appendChild(el); }
    el.href = `https://fonts.googleapis.com/css2?${fam}&display=swap`;
  }, [googleOffen, googleTreffer]);

  /** Ganze Familie entfernen — samt aller Schnitte und Verweise in den Feldern. */
  const schriftEntfernen = (familie: string) => {
    const betroffen = familienAus(eigeneSchriften).find((x) => x.name === familie);
    if (!betroffen) return;
    const ids = new Set(betroffen.schnitte.map((g) => g.id));
    const inBenutzung = layoutRef.current.pages.reduce((n, p) =>
      n + p.widgets.filter((w) => w.vlw && ids.has(w.vlw.replace(/-\d+$/, ""))).length, 0);
    nachfragen(`„${familie}" entfernen?`, inBenutzung
      ? `${inBenutzung} Feld${inBenutzung === 1 ? "" : "er"} nutzt diese Schrift und fällt auf die Pixelschrift zurück.`
      : "Die Schrift wird aus dem Vorrat gelöscht.",
      async () => {
        for (const g of betroffen.schnitte) await schriftLoeschen(g.id);
        setEigeneSchriften(await schriftenListe());
        commit({ ...layoutRef.current, pages: layoutRef.current.pages.map((p) => ({
          ...p, widgets: p.widgets.map((w) => (w.vlw && ids.has(w.vlw.replace(/-\d+$/, "")) ? { ...w, vlw: undefined } : w)),
        })) });
        toast.success(`„${familie}" entfernt`);
      });
  };

  const googleWaehlen = async (f: GoogleSchrift) => {
    setGoogleLaedt(f.name);
    try {
      const geholt = await googleHolen(f.name, f.schnitte);
      setEigeneSchriften(await schriftenListe());
      // normalen Schnitt bevorzugen, sonst den ersten
      const start = geholt.find((g) => g.schnitt === "400") ?? geholt[0];
      if (selected) updateAlle({ vlw: geraeteName(start.id, fontPx(selected)), fontFace: undefined, fontScale: undefined });
      toast.success(`„${f.name}" mit ${geholt.length} Schnitt${geholt.length === 1 ? "" : "en"} geladen`);
      setGoogleOffen(false);
    } catch (err) { toast.error((err as Error).message); }
    finally { setGoogleLaedt(null); }
  };

  const [pubOffen, setPubOffen] = useState(false);
  const [pubSchritte, setPubSchritte] = useState<string[]>([]);
  const [pubPct, setPubPct] = useState(0);
  const pubLog = (z: string) => { setPubSchritte((l) => [...l, z]); setDevLog((l) => [...l, z]); };   // eine Zeile, zwei Ansichten
  /* --- Bilder --- */
  const [bilder, setBilder] = useState<Bild[]>([]);
  const [vorschauen, setVorschauen] = useState<Record<string, string>>({});
  const bildRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    bilderListe().then(async (l) => {
      setBilder(l);
      const v: Record<string, string> = {};
      for (const b of l) { const d = await bildVorschau(b.id); if (d) v[b.id] = d; }
      setVorschauen(v);
    });
  }, []);
  const bildHochladen = async (datei?: File) => {
    if (!datei) return;
    try {
      const b = await bildSpeichern(datei, selected?.w ?? 64, selected?.h ?? 64);
      setBilder(await bilderListe());
      const d = await bildVorschau(b.id); if (d) setVorschauen((v) => ({ ...v, [b.id]: d }));
      if (selected?.type === "image") updateAlle({ asset: b.id, w: b.w, h: b.h });
      toast.success(`Bild „${b.name}" (${b.w}×${b.h}, ${(b.bytes / 1024).toFixed(1)} KB)`);
    } catch (e) { toast.error("Bild nicht lesbar: " + (e as Error).message); }
  };
  const bildEntfernen = (id: string) => {
    const genutzt = layoutRef.current.pages.reduce((n, p) => n + p.widgets.filter((w) => w.asset === id).length, 0);
    nachfragen("Bild entfernen?", genutzt ? `${genutzt} Feld${genutzt === 1 ? "" : "er"} zeigt dieses Bild.` : "Wird aus dem Vorrat gelöscht.",
      async () => {
        await bildLoeschen(id);
        setBilder(await bilderListe());
        commit({ ...layoutRef.current, pages: layoutRef.current.pages.map((p) => ({
          ...p, widgets: p.widgets.map((w) => (w.asset === id ? { ...w, asset: undefined } : w)) })) });
      });
  };

  const [flashOpen, setFlashOpen] = useState(false);
  const dock = useRef<DockviewApi | null>(null);
  const [offenePanels, setOffenePanels] = useState<string[]>(Object.keys(DOCK_TITEL));
  const onDockReady = (e: DockviewReadyEvent) => {
    dock.current = e.api;
    const gespeichert = localStorage.getItem(DOCK_KEY);
    let geladen = false;
    if (gespeichert) { try { e.api.fromJSON(JSON.parse(gespeichert)); geladen = e.api.panels.length > 0; } catch { /* kaputt -> Standard */ } }
    if (!geladen) defaultDock(e.api);
    else {
      // Kommen später Bereiche dazu, fehlen sie im gespeicherten Zustand — nachtragen statt verlieren.
      for (const id of Object.keys(DOCK_TITEL))
        if (!e.api.getPanel(id))
          e.api.addPanel({ id, component: "slot", title: DOCK_TITEL[id], params: { slot: id } });
    }
    setOffenePanels(e.api.panels.map((pn) => pn.id));
    e.api.onDidLayoutChange(() => {
      setOffenePanels(e.api.panels.map((pn) => pn.id));
      try { localStorage.setItem(DOCK_KEY, JSON.stringify(e.api.toJSON())); } catch { /* voll */ }
    });
  };
  /** Bereich ein- oder ausblenden — geschlossene Bereiche sind so nie verloren. */
  const togglePanel = (id: string) => {
    const api = dock.current; if (!api) return;
    const da = api.getPanel(id);
    if (da) da.api.close();
    else api.addPanel({ id, component: "slot", title: DOCK_TITEL[id], params: { slot: id } });
  };
  /** Bereich als eigenes Fenster abkoppeln. */
  const schwebend = (id: string) => {
    const api = dock.current; if (!api) return;
    const da = api.getPanel(id) ?? api.addPanel({ id, component: "slot", title: DOCK_TITEL[id], params: { slot: id } });
    api.addFloatingGroup(da, { width: 380, height: 460, position: { top: 90, left: 90 } });
  };
  useEffect(() => {
    if (sessionStorage.getItem("slab:flashNachNeuladen")) {
      sessionStorage.removeItem("slab:flashNachNeuladen");
      setFlashLog(""); setFlashDone(false); setFlashOpen(true);
    }
  }, []);
  /** Abgekoppelten Bereich wieder ins Raster holen. */
  const andocken = (id: string) => {
    const api = dock.current; if (!api) return;
    const da = api.getPanel(id);
    const ziel = api.getPanel("display") ?? api.panels.find((p) => p.id !== id);
    if (!da) { api.addPanel({ id, component: "slot", title: DOCK_TITEL[id], params: { slot: id } }); return; }
    if (!ziel || ziel.id === id) return;
    da.api.moveTo({ group: ziel.group, position: "right" });
  };
  const resetDock = () => {
    localStorage.removeItem(DOCK_KEY);
    const api = dock.current; if (!api) return;
    api.clear(); defaultDock(api);
    toast.success("Ansicht zurückgesetzt");
  };
  const [flashing, setFlashing] = useState(false);
  const [flashDone, setFlashDone] = useState(false);
  const [flashPct, setFlashPct] = useState(0);
  const [flashLog, setFlashLog] = useState("");
  const [helpOpen, setHelpOpen] = useState(false);
  const [checkOpen, setCheckOpen] = useState(false);
  const [devLog, setDevLog] = useState<string[]>([]);
  const [logOpen, setLogOpen] = useState(false);
  const [jsonOpen, setJsonOpen] = useState(false);
  const [jsonDraft, setJsonDraft] = useState("");
  const [zoom, setZoom] = useState(2);
  const link = useRef(new DeviceLink());
  const layoutRef = useRef(layout); layoutRef.current = layout;
  const past = useRef<Layout[]>([]); const future = useRef<Layout[]>([]);
  const [, setHist] = useState(0);
  const action = useRef<{ kind: "drag" | "resize"; id: string; dir?: typeof HANDLES[number]["dir"]; sx: number; sy: number; startBox: { x: number; y: number; w: number; h: number }; mit?: { id: string; box: { x: number; y: number; w: number; h: number } }[]; snap: Layout; moved: boolean } | null>(null);

  const [pageIdx, setPageIdx] = useState(0);
  const pageIdxRef = useRef(0); pageIdxRef.current = Math.min(pageIdx, layout.pages.length - 1);
  const page = layout.pages[pageIdxRef.current] ?? layout.pages[0];
  const widgets = page.widgets;
  /* --- QR-Vorschauen: je Feld ein Bild, neu erzeugt wenn Inhalt oder Größe wechselt --- */
  const [qrBilder, setQrBilder] = useState<Record<string, string>>({});
  const qrFelder = useMemo(
    () => widgets.filter((w) => w.type === "qr").map((w) => ({ id: w.id, payload: w.payload ?? "", seite: Math.min(w.w, w.h) })),
    [widgets],
  );
  useEffect(() => {
    let abgebrochen = false;
    (async () => {
      const neu: Record<string, string> = {};
      for (const q of qrFelder) {
        try {
          const cv = document.createElement("canvas");
          const QR = (await import("qrcode")).default;
          await QR.toCanvas(cv, q.payload || " ", { width: Math.max(21, q.seite), margin: 1,
            color: { dark: "#000000ff", light: "#ffffffff" }, errorCorrectionLevel: "M" });
          neu[q.id] = cv.toDataURL();
        } catch { /* ungültiger Inhalt — Platzhalter bleibt */ }
      }
      if (!abgebrochen) setQrBilder(neu);
    })();
    return () => { abgebrochen = true; };
  }, [JSON.stringify(qrFelder)]); // eslint-disable-line react-hooks/exhaustive-deps

  /* --- Wettersymbole: inline eingebettet, damit die Animation läuft --- */
  const [symbolQuellen, setSymbolQuellen] = useState<Record<string, string>>({});
  const gebrauchteSymbole = useMemo(() => {
    const namen = new Set<string>();
    for (const wd of widgets) {
      if (wd.type !== "weather" || wd.iconStyle === "einfach") continue;
      // Der Code steckt in den Daten, nicht im Feld — deshalb hier auflösen
      const code = wd.bind ? Number(getPath(data[wd.bind.src], wd.bind.path) ?? 0) : (wd.value ?? 0);
      namen.add(`${meteoconFuer(Math.round(code || 0), !!wd.night)}|${wd.iconSet ?? "fill"}`);
    }
    return [...namen];
  }, [widgets, data]);
  useEffect(() => {
    let weg = false;
    (async () => {
      for (const eintrag of gebrauchteSymbole) {
        if (symbolQuellen[eintrag]) continue;
        const [name, stil] = eintrag.split("|");
        try {
          const svg = await fetch(`/api/meteocon?name=${name}&stil=${stil}`, { cache: "no-store" }).then((r) => (r.ok ? r.text() : ""));
          if (svg && !weg) setSymbolQuellen((v) => ({ ...v, [eintrag]: svg }));
        } catch { /* Symbol fehlt — Platzhalter bleibt */ }
      }
    })();
    return () => { weg = true; };
  }, [gebrauchteSymbole]); // eslint-disable-line react-hooks/exhaustive-deps

  const selected = widgets.find((w) => w.id === sel) ?? null;
  /** Änderung aus dem Inspector: gilt für alles, was ausgewählt ist. */
  const updateAlle = (patch: Partial<Widget>) => updateMany(patch, selIds);
  const sources = layout.sources ?? [];

  const commit = (next: Layout, record = true) => { if (record) { past.current.push(layoutRef.current); if (past.current.length > 120) past.current.shift(); future.current = []; setHist((h) => h + 1); } setLayout(next); };
  const mutate = (fn: (ws: Widget[]) => Widget[], record = true) => {
    const i = pageIdxRef.current;
    commit({ ...layoutRef.current, pages: layoutRef.current.pages.map((p, k) => (k === i ? { ...p, widgets: fn(p.widgets) } : p)) }, record);
  };
  const update = useCallback((id: string, patch: Partial<Widget>, record = true) => mutate((ws) => ws.map((w) => (w.id === id ? { ...w, ...patch } : w)), record), []); // eslint-disable-line react-hooks/exhaustive-deps
  /** Mehrere Felder gemeinsam ändern: gleiche Werte für alle, oder je Feld ein eigener Patch. */
  const updateMany = useCallback((patch: Partial<Widget> | ((w: Widget) => Partial<Widget>), ids: string[], record = true) =>
    mutate((ws) => ws.map((w) => (ids.includes(w.id) ? { ...w, ...(typeof patch === "function" ? patch(w) : patch) } : w)), record), []); // eslint-disable-line react-hooks/exhaustive-deps
  /** Vorlage einfügen: alle Felder auf einmal, unterhalb des Vorhandenen. */
  const vorlageEinfuegen = (name: string) => {
    const v = VORLAGEN.find((x) => x.name === name);
    if (!v) return;
    const felder = v.bauen();
    const hoehe = Math.max(...felder.map((f) => bbox(f).y + bbox(f).h));
    const unten = widgets.length ? Math.max(...widgets.map((x) => bbox(x).y + bbox(x).h)) + 6 : 8;
    // Passt sie unten nicht mehr aufs Display, oben anfangen statt aus dem Bild schieben
    const startY = unten + hoehe <= H ? unten : 8;
    const versetzt = felder.map((f) => ({ ...f, y: f.y + startY }));
    if (startY !== unten) toast.info("Kein Platz unten — Vorlage oben eingefügt, bitte verschieben");
    mutate((ws) => [...ws, ...versetzt]);
    setSelIds(versetzt.map((f) => f.id));
    toast.success(`„${name}" eingefügt — ${versetzt.length} Felder`);
  };

  const add = (t: WidgetType) => {
    const w = makeWidget(t);
    // versetzt ablegen, damit neue Felder nicht aufeinander stapeln
    const n = widgets.length;
    w.x = 12 + (n % 6) * 8; w.y = 12 + (n % 8) * 14;
    mutate((ws) => [...ws, w]); setSel(w.id);
  };
  const del = (id: string) => { mutate((ws) => ws.filter((w) => w.id !== id)); setSel(null); };
  /** Generische Rückfrage vor allem, was sich nicht mit einem Blick rückgängig machen lässt. */
  const [frage, setFrage] = useState<{ titel: string; text: string; tun: () => void } | null>(null);
  const nachfragen = (titel: string, text: string, tun: () => void) => setFrage({ titel, text, tun });

  /**
   * Aus der Auswahl eine Wiederhol-Vorlage machen.
   * Der gemeinsame Array-Pfad wird aus den Bindungen abgeleitet: binden alle Felder auf
   * "accounts[0].…", wird daraus die Quelle "accounts" und die Kinder binden relativ.
   */
  const zuWiederholer = () => {
    const felder = selIds.map((id) => widgets.find((w) => w.id === id)).filter((w): w is Widget => !!w);
    if (!felder.length) return;

    const boxen = felder.map(bbox);
    const x0 = Math.min(...boxen.map((b) => b.x)), y0 = Math.min(...boxen.map((b) => b.y));
    const y1 = Math.max(...boxen.map((b) => b.y + b.h));
    const x1 = Math.max(...boxen.map((b) => b.x + b.w));

    const mitBindung = felder.filter((w) => w.bind?.path);
    const pfade = mitBindung.map((w) => w.bind!.path);
    let arrayPfad = "", praefix = "";
    const m = pfade[0]?.match(/^(.*?)\[\d+\]\.?/);
    if (m && pfade.every((pf) => pf.startsWith(m[0]))) { praefix = m[0]; arrayPfad = m[1]; }

    if (!arrayPfad) {
      toast.error("Kein gemeinsamer Datensatz erkennbar — die Felder müssen an dieselbe Liste gebunden sein (z.B. accounts[0]…)");
      return;
    }

    const kinder: Widget[] = felder.map((w) => ({
      ...w,
      x: w.x - x0,
      y: w.y - y0,
      bind: w.bind ? { ...w.bind, path: w.bind.path.slice(praefix.length) } : undefined,
    }));

    const neu: Widget = {
      id: "w" + Math.random().toString(36).slice(2, 8),
      type: "repeat",
      x: x0, y: y0, w: x1 - x0, h: y1 - y0,
      step: Math.max(1, Math.round(y1 - y0)),
      maxItems: 10,
      bind: { src: mitBindung[0].bind!.src, path: arrayPfad },
      children: kinder,
    };

    const ids = new Set(selIds);
    mutate((ws) => [...ws.filter((w) => !ids.has(w.id)), neu]);
    setSelIds([neu.id]);
    toast.success(`Wiederholer aus ${felder.length} Feldern — Liste „${arrayPfad}"`);
  };

  /** Wiederholer wieder in einzelne Felder zerlegen. */
  const wiederholerAufloesen = (id: string) => {
    const w = widgets.find((x) => x.id === id);
    if (w?.type !== "repeat" || !w.children?.length) return;
    const praefix = w.bind ? `${w.bind.path}[0].` : "";
    const zurueck: Widget[] = w.children.map((k) => ({
      ...k,
      id: "w" + Math.random().toString(36).slice(2, 8),
      x: k.x + w.x, y: k.y + w.y,
      bind: k.bind ? { ...k.bind, path: praefix + k.bind.path } : undefined,
    }));
    mutate((ws) => [...ws.filter((x) => x.id !== id), ...zurueck]);
    setSelIds(zurueck.map((z) => z.id));
    toast.success(`In ${zurueck.length} Felder zerlegt`);
  };

  /** Einträge des Feld-Kontextmenüs — einmal definiert, an Zeichenfläche und Ebenenliste genutzt. */
  const feldMenue = (id: string) => {
    const w = layoutRef.current.pages[pageIdxRef.current]?.widgets.find((x) => x.id === id);
    return (
      <>
        <ContextMenuItem onClick={() => duplicate(id)}>Duplizieren<ContextMenuShortcut>⌘D</ContextMenuShortcut></ContextMenuItem>
        <ContextMenuItem onClick={() => { setSelIds([id]); copySel(); }}>Kopieren<ContextMenuShortcut>⌘C</ContextMenuShortcut></ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onClick={() => moveLayer(id, 1)}>Nach vorn</ContextMenuItem>
        <ContextMenuItem onClick={() => moveLayer(id, -1)}>Nach hinten</ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onClick={() => update(id, { locked: !w?.locked })}>{w?.locked ? "Entsperren" : "Sperren"}</ContextMenuItem>
        <ContextMenuItem onClick={() => update(id, { hidden: !w?.hidden })}>{w?.hidden ? "Einblenden" : "Ausblenden"}</ContextMenuItem>
        <ContextMenuSeparator />
        {w?.type === "repeat"
          ? <ContextMenuItem onClick={() => wiederholerAufloesen(id)}>Wiederholer auflösen</ContextMenuItem>
          : <ContextMenuItem disabled={!selIds.length} onClick={zuWiederholer}>Zu Wiederholer machen…</ContextMenuItem>}
        <ContextMenuSeparator />
        <ContextMenuItem variant="destructive" onClick={() => del(id)}>Löschen<ContextMenuShortcut>⌫</ContextMenuShortcut></ContextMenuItem>
      </>
    );
  };
  /** Einträge des Seiten-Kontextmenüs. */
  const seitenMenue = (i: number) => (
    <>
      <ContextMenuItem onClick={() => { setPageIdx(i); dupPage(); }}>Seite duplizieren</ContextMenuItem>
      <ContextMenuItem onClick={addPage}>Seite hinzufügen</ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem variant="destructive" onClick={() => { setPageIdx(i); delPage(); }}>Seite löschen</ContextMenuItem>
    </>
  );
  const duplicate = (id: string) => { const w = widgets.find((x) => x.id === id); if (!w) return; const n = { ...w, id: "w" + Math.random().toString(36).slice(2, 8), x: w.x + 6, y: w.y + 6 }; mutate((ws) => [...ws, n]); setSel(n.id); };
  const undo = () => { const p = past.current.pop(); if (!p) return; future.current.push(layoutRef.current); setLayout(p); setHist((h) => h + 1); };
  const redo = () => { const f = future.current.pop(); if (!f) return; past.current.push(layoutRef.current); setLayout(f); setHist((h) => h + 1); };

  /* ---- Import / Export ---- */
  const exportTpl = () => {
    const blob = new Blob([JSON.stringify(layoutRef.current, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = `${tplRef.current}.json`; a.click();
    URL.revokeObjectURL(a.href);
  };
  const importRef = useRef<HTMLInputElement>(null);
  const importTpl = async (file: File) => {
    try {
      const l = JSON.parse(await file.text()) as Layout;
      if (!l.pages?.length) throw new Error("keine Seiten enthalten");
      const name = file.name.replace(/\.json$/i, "") || "import";
      await saveTpl(name, l); await refreshList(); await loadTpl(name);
      toast.success(`„${name}" importiert`);
    } catch (e) { toast.error("Import fehlgeschlagen: " + (e as Error).message); }
  };

  /* ---- Seiten ---- */
  const addPage = () => { const id = "p" + Math.random().toString(36).slice(2, 6); commit({ ...layoutRef.current, pages: [...layoutRef.current.pages, { id, widgets: [] }] }); setPageIdx(layoutRef.current.pages.length); setSel(null); };
  const delPage = () => {
    if (layoutRef.current.pages.length <= 1) { toast.error("Mindestens eine Seite muss bleiben"); return; }
    const i = pageIdxRef.current;
    const anzahl = layoutRef.current.pages[i]?.widgets.length ?? 0;
    nachfragen("Seite löschen?", `Seite ${i + 1}${anzahl ? ` mit ${anzahl} Feld${anzahl === 1 ? "" : "ern"}` : " (leer)"} wird entfernt.`, () => {
      commit({ ...layoutRef.current, pages: layoutRef.current.pages.filter((_, k) => k !== i) });
      setPageIdx(Math.max(0, i - 1)); setSel(null);
    });
  };
  const dupPage = () => {
    const i = pageIdxRef.current; const src = layoutRef.current.pages[i];
    const copy = { id: "p" + Math.random().toString(36).slice(2, 6), widgets: src.widgets.map((w) => ({ ...w, id: "w" + Math.random().toString(36).slice(2, 8) })) };
    commit({ ...layoutRef.current, pages: [...layoutRef.current.pages.slice(0, i + 1), copy, ...layoutRef.current.pages.slice(i + 1)] });
    setPageIdx(i + 1); setSel(null);
  };

  /* ---- Ausrichten & Verteilen (Mehrfachauswahl) ---- */
  const alignSel = (mode: "l" | "hc" | "r" | "t" | "vc" | "b" | "dh" | "dv") => {
    if (!selIds.length) return;
    if (selIds.length < 2 && (mode === "dh" || mode === "dv")) return;   // Verteilen braucht mindestens drei
    const boxes = selIds.map((id) => ({ id, b: bbox(widgets.find((w) => w.id === id)!) }));
    // Ein einzelnes Feld richtet sich an der Zeichenfläche aus, mehrere zueinander.
    const einzeln = selIds.length < 2;
    const minX = einzeln ? 0 : Math.min(...boxes.map((o) => o.b.x));
    const maxX = einzeln ? W : Math.max(...boxes.map((o) => o.b.x + o.b.w));
    const minY = einzeln ? 0 : Math.min(...boxes.map((o) => o.b.y));
    const maxY = einzeln ? H : Math.max(...boxes.map((o) => o.b.y + o.b.h));
    const patches = new Map<string, Partial<Widget>>();
    if (mode === "dh" || mode === "dv") {
      const horiz = mode === "dh";
      const sorted = [...boxes].sort((a, b) => (horiz ? a.b.x - b.b.x : a.b.y - b.b.y));
      const total = horiz ? maxX - minX : maxY - minY;
      const sum = sorted.reduce((s, o) => s + (horiz ? o.b.w : o.b.h), 0);
      const gap = (total - sum) / (sorted.length - 1);
      let cur = horiz ? minX : minY;
      for (const o of sorted) {
        const w = widgets.find((x) => x.id === o.id)!;
        patches.set(o.id, fromBox(w, horiz ? { ...o.b, x: cur } : { ...o.b, y: cur }));
        cur += (horiz ? o.b.w : o.b.h) + gap;
      }
    } else {
      for (const o of boxes) {
        const w = widgets.find((x) => x.id === o.id)!;
        const nb = { ...o.b };
        if (mode === "l") nb.x = minX; else if (mode === "r") nb.x = maxX - o.b.w; else if (mode === "hc") nb.x = (minX + maxX) / 2 - o.b.w / 2;
        else if (mode === "t") nb.y = minY; else if (mode === "b") nb.y = maxY - o.b.h; else if (mode === "vc") nb.y = (minY + maxY) / 2 - o.b.h / 2;
        patches.set(o.id, fromBox(w, nb));
      }
    }
    mutate((ws) => ws.map((w) => (patches.has(w.id) ? { ...w, ...patches.get(w.id) } : w)));
  };

  /* ---- Zwischenablage (auch seitenübergreifend) ---- */
  const clip = useRef<Widget[]>([]);
  const copySel = () => {
    const ids = selRef.current;
    const cur = layoutRef.current.pages[pageIdxRef.current].widgets;
    clip.current = cur.filter((w) => ids.includes(w.id)).map((w) => ({ ...w }));
    if (clip.current.length) toast.success(`${clip.current.length} kopiert`);
  };
  const pasteClip = () => {
    if (!clip.current.length) return;
    const fresh = clip.current.map((w) => ({ ...w, id: "w" + Math.random().toString(36).slice(2, 8), x: w.x + 6, y: w.y + 6 }));
    mutate((ws) => [...ws, ...fresh]); setSelIds(fresh.map((w) => w.id));
  };

  /* ---- Ebenen (z-Reihenfolge = Array-Reihenfolge) ---- */
  const moveLayer = (id: string, dir: -1 | 1) => mutate((ws) => {
    const i = ws.findIndex((w) => w.id === id); const j = i + dir;
    if (i < 0 || j < 0 || j >= ws.length) return ws;
    const c = [...ws]; [c[i], c[j]] = [c[j], c[i]]; return c;
  });

  /* ---- Templates: mehrere Layouts, dateibasiert unter ./layouts ---- */
  const [tpl, setTpl] = useState("template-1");
  const [tplList, setTplList] = useState<string[]>([]);
  const [savedTick, setSavedTick] = useState<string>("");
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameVal, setRenameVal] = useState("");
  const [delOpen, setDelOpen] = useState(false);
  const loaded = useRef(false);
  const tplRef = useRef(tpl); tplRef.current = tpl;

  const saveTpl = async (name: string, lay: Layout) => {
    await fetch("/api/layouts", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name, layout: lay }) });
    setSavedTick(new Date().toLocaleTimeString("de-DE"));
  };
  const refreshList = async () => {
    const r = await fetch("/api/layouts", { cache: "no-store" });
    const j = await r.json();
    setTplList(j.templates ?? []);
    return (j.templates ?? []) as string[];
  };
  const loadTpl = async (name: string) => {
    const r = await fetch(`/api/layouts?name=${encodeURIComponent(name)}`, { cache: "no-store" });
    if (!r.ok) return false;
    const lay = (await r.json()) as Layout;
    past.current = []; future.current = []; setSel(null); setHist((h) => h + 1);
    setLayout(lay); setTpl(name);
    localStorage.setItem("slab:lastTpl", name);
    return true;
  };
  const switchTpl = async (name: string) => { await saveTpl(tplRef.current, layoutRef.current); await loadTpl(name); };
  const uniqueName = (base: string, list: string[]) => { let n = base, i = 2; while (list.includes(n)) n = `${base}-${i++}`; return n; };
  const newTpl = async () => { await saveTpl(tplRef.current, layoutRef.current); const list = await refreshList(); const name = uniqueName("template-" + (list.length + 1), list); await saveTpl(name, DEFAULT_LAYOUT); await refreshList(); await loadTpl(name); };
  const dupTpl = async () => { const list = await refreshList(); const name = uniqueName(tplRef.current + "-kopie", list); await saveTpl(name, layoutRef.current); await refreshList(); await loadTpl(name); };
  const doRename = async (name: string) => {
    const n = name.trim();
    if (!n || n === tplRef.current) return;
    await saveTpl(n, layoutRef.current);
    await fetch(`/api/layouts?name=${encodeURIComponent(tplRef.current)}`, { method: "DELETE" });
    await refreshList(); await loadTpl(n);
    toast.success(`Umbenannt in „${n}"`);
  };
  const doDelete = async () => {
    const gone = tplRef.current;
    await fetch(`/api/layouts?name=${encodeURIComponent(gone)}`, { method: "DELETE" });
    const list = await refreshList();
    if (list.length) await loadTpl(list[0]);
    else { const name = "template-1"; await saveTpl(name, DEFAULT_LAYOUT); await refreshList(); await loadTpl(name); }
    toast.success(`„${gone}" gelöscht`);
  };

  /* initial: letztes Template laden oder anlegen */
  useEffect(() => {
    (async () => {
      const list = await refreshList();
      const last = localStorage.getItem("slab:lastTpl");
      if (last && list.includes(last)) await loadTpl(last);
      else if (list.length) await loadTpl(list[0]);
      else await saveTpl("template-1", layoutRef.current).then(refreshList);
      loaded.current = true;
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /* Auto-Save (debounced) */
  useEffect(() => {
    if (!loaded.current) return;
    const t = window.setTimeout(() => saveTpl(tplRef.current, layoutRef.current), 800);
    return () => clearTimeout(t);
  }, [layout]);  

  /* ---- Datenquellen: poll alles über den Proxy ---- */
  const srcKey = JSON.stringify(sources);
  useEffect(() => {
    if (!sources.length) return;
    const timers = sources.map((s) => {
      const tick = async () => {
        if (!s.url) return;
        try {
          const r = await fetch("/api/proxy", {
            method: "POST", cache: "no-store",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ url: s.url, method: s.method ?? "GET", body: s.body, auth: s.auth, headers: s.headers }),
          });
          const j = await r.json();
          if (!r.ok) throw new Error(j?.error ?? "HTTP " + r.status);
          setData((d) => ({ ...d, [s.id]: j }));
          setSrcErr((e) => ({ ...e, [s.id]: "" }));
        } catch (e) { setSrcErr((er) => ({ ...er, [s.id]: (e as Error).message })); }
      };
      tick();
      return window.setInterval(tick, Math.max(1000, s.interval ?? 8000));
    });
    return () => timers.forEach(clearInterval);
  }, [srcKey]); // eslint-disable-line react-hooks/exhaustive-deps

  /* gebundene Werte auflösen (nur fürs Rendering/Publish, Layout bleibt unangetastet) */
  const resolve = useCallback((w: Widget): Widget => {
    let out = w;
    // bedingte Sichtbarkeit
    if (w.showIf?.path) {
      const cur = getPath(data[w.showIf.src], w.showIf.path);
      const a = String(cur ?? ""), b = w.showIf.value;
      const ok = w.showIf.op === "=" ? a === b : w.showIf.op === "!=" ? a !== b
        : w.showIf.op === ">" ? Number(a) > Number(b) : Number(a) < Number(b);
      if (!ok) return { ...w, hidden: true };
    }
    if (!w.bind) return out;
    const raw = getPath(data[w.bind.src], w.bind.path);
    if (raw === undefined || raw === null) return out;
    const { num, text } = applyTransform(raw, w.transform);
    if (w.type === "text" || w.type === "ticker") out = { ...out, text };
    else if (w.type === "value" || w.type === "stats") out = { ...out, value: num, suffix: w.transform ? "" : w.suffix, text };
    else if (w.type === "choice") out = { ...out, text };            // vergleicht den Wert als Text
    else if (w.type === "repeat") out = { ...out };                   // hat eigene Auflösung
    else out = { ...out, value: num };                                // alle übrigen zeigen eine Zahl
    // Schwellwert-Farbe
    const tc = thresholdColor(num, w.thresholds, undefined);
    if (tc) out = { ...out, color: tc };
    return out;
  }, [data]);
  const resolvedWidgets = useMemo(() => widgets.map(resolve), [widgets, resolve]);

  /* Drag & Resize */
  const startDrag = (e: React.PointerEvent, w: Widget) => {
    e.stopPropagation();
    const additive = e.shiftKey || e.metaKey;
    if (additive) { toggleSel(w.id, true); return; }
    if (!selIds.includes(w.id)) setSel(w.id);
    if (w.locked) return;
    // alle ausgewählten, unversperrten Felder wandern mit
    const gruppe = (selRef.current.includes(w.id) ? selRef.current : [w.id])
      .map((id) => widgets.find((x) => x.id === id))
      .filter((x): x is Widget => !!x && !x.locked)
      .map((x) => ({ id: x.id, box: bbox(x) }));
    action.current = { kind: "drag", id: w.id, sx: e.clientX, sy: e.clientY, startBox: bbox(w), mit: gruppe, snap: layoutRef.current, moved: false };
  };
  const startResize = (e: React.PointerEvent, dir: typeof HANDLES[number]["dir"]) => { e.stopPropagation(); if (!selected) return; action.current = { kind: "resize", id: selected.id, dir, sx: e.clientX, sy: e.clientY, startBox: bbox(selected), snap: layoutRef.current, moved: false }; };
  const onMove = (e: React.PointerEvent) => {
    const a = action.current; if (!a) return;
    const dx = (e.clientX - a.sx) / zoom, dy = (e.clientY - a.sy) / zoom;
    if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) a.moved = true;
    const w = layoutRef.current.pages[pageIdxRef.current].widgets.find((x) => x.id === a.id); if (!w) return;
    if (a.kind === "drag") {
      const b = a.startBox;
      const mitIds = new Set((a.mit ?? [{ id: a.id }]).map((g) => g.id));
      const others = layoutRef.current.pages[pageIdxRef.current].widgets.filter((o) => !mitIds.has(o.id) && !o.hidden).map(bbox);
      const { box, guides } = snapBox({ ...b, x: b.x + dx, y: b.y + dy }, others, W, H);
      setGuides(guides);
      // Das angefasste Feld fängt, die Verschiebung gilt für die ganze Auswahl.
      const vx = box.x - b.x, vy = box.y - b.y;
      const gruppe = a.mit ?? [{ id: a.id, box: b }];
      const lage = new Map(gruppe.map((g) => [g.id, g.box]));
      updateMany((ziel) => {
        const sb = lage.get(ziel.id)!;
        return fromBox(ziel, { ...sb, x: sb.x + vx, y: sb.y + vy });
      }, gruppe.map((g) => g.id), false);
    }
    else { const b = { ...a.startBox }; const d = a.dir!; let { x, y, w: bw, h: bh } = b;
      if (d.w) { x = b.x + dx; bw = b.w - dx; } if (d.e) bw = b.w + dx; if (d.n) { y = b.y + dy; bh = b.h - dy; } if (d.s) bh = b.h + dy;
      if (bw < MINW) { if (d.w) x = b.x + b.w - MINW; bw = MINW; } if (bh < MINW) { if (d.n) y = b.y + b.h - MINW; bh = MINW; }
      update(a.id, fromBox(w, { x, y, w: bw, h: bh }), false);
    }
  };
  const endAction = () => { const a = action.current; if (a && a.moved) { past.current.push(a.snap); future.current = []; setHist((h) => h + 1); } action.current = null; setGuides([]); };

  /* Port beim Verlassen/Neuladen freigeben, sonst bleibt er belegt */
  useEffect(() => {
    const release = () => { link.current.disconnect().catch(() => {}); };
    window.addEventListener("beforeunload", release);
    return () => { window.removeEventListener("beforeunload", release); release(); };
  }, []);

  /* Drag/Resize global verfolgen — unabhängig davon, wo der Zeiger gerade ist */
  useEffect(() => {
    const mv = (e: PointerEvent) => {
      if (action.current) { onMove(e as unknown as React.PointerEvent); return; }
      const r = rahmenStart.current; if (!r) return;
      const fl = document.querySelector("[data-flaeche]") as HTMLElement | null; if (!fl) return;
      const box = fl.getBoundingClientRect();
      const neu = { x0: r.x, y0: r.y, x1: (e.clientX - box.left) / zoom, y1: (e.clientY - box.top) / zoom };
      rahmenRef.current = neu; setRahmen(neu);
    };
    const up = () => {
      if (action.current) { endAction(); return; }
      const r = rahmenStart.current, rect = rahmenRef.current;
      rahmenStart.current = null; rahmenRef.current = null; setRahmen(null);
      if (!r || !rect) return;
      const x0 = Math.min(rect.x0, rect.x1), x1 = Math.max(rect.x0, rect.x1);
      const y0 = Math.min(rect.y0, rect.y1), y1 = Math.max(rect.y0, rect.y1);
      if (x1 - x0 < 3 && y1 - y0 < 3) return;          // reiner Klick, kein Rahmen
      // alles, was den Rahmen berührt (wie in Grafikprogrammen üblich)
      const treffer = widgets.filter((w) => {
        if (w.hidden) return false;
        const b = bbox(w);
        return b.x < x1 && b.x + b.w > x0 && b.y < y1 && b.y + b.h > y0;
      }).map((w) => w.id);
      setSelIds(r.additiv ? [...new Set([...r.vorher, ...treffer])] : treffer);
    };
    window.addEventListener("pointermove", mv);
    window.addEventListener("pointerup", up);
    return () => { window.removeEventListener("pointermove", mv); window.removeEventListener("pointerup", up); };
  }); // absichtlich ohne deps: Handler sollen immer die aktuelle Closure nutzen

  /* Keyboard */
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement; if (t && /INPUT|TEXTAREA|SELECT/.test(t.tagName)) return;
      const meta = e.metaKey || e.ctrlKey;
      if (meta && e.key.toLowerCase() === "z") { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
      if (meta && e.key.toLowerCase() === "d" && sel) { e.preventDefault(); duplicate(sel); return; }
      if (meta && e.key.toLowerCase() === "c") { e.preventDefault(); copySel(); return; }
      if (meta && e.key.toLowerCase() === "v") { e.preventDefault(); pasteClip(); return; }
      if (meta && e.key.toLowerCase() === "a") { e.preventDefault(); setSelIds(widgets.filter((w) => !w.locked).map((w) => w.id)); return; }
      if (e.key === "Escape") { setSelIds([]); return; }
      if (e.key === "?" ) { e.preventDefault(); setHelpOpen(true); return; }
      if ((e.key === "Delete" || e.key === "Backspace") && selRef.current.length) { e.preventDefault(); const ids = selRef.current; mutate((ws) => ws.filter((w) => !ids.includes(w.id))); setSelIds([]); return; }
      const cur = selRef.current;
      if (cur.length && e.key.startsWith("Arrow")) {
        e.preventDefault(); const step = e.shiftKey ? 10 : 1;
        const dx = e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0;
        const dy = e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0;
        mutate((ws) => ws.map((w) => (cur.includes(w.id) && !w.locked ? { ...w, x: w.x + dx, y: w.y + dy } : w)));
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [sel, selIds, widgets]); // eslint-disable-line react-hooks/exhaustive-deps

  /* Quellen-CRUD */
  const addSource = () => { const id = "src" + Math.random().toString(36).slice(2, 6); commit({ ...layoutRef.current, sources: [...sources, { id, url: "", interval: 8000 }] }); };
  const patchSource = (id: string, patch: Partial<DataSource>) => commit({ ...layoutRef.current, sources: sources.map((s) => (s.id === id ? { ...s, ...patch } : s)) });
  const delSource = (id: string) => {
    const betroffen = layoutRef.current.pages.reduce((n, p) => n + p.widgets.filter((w) => w.bind?.src === id).length, 0);
    nachfragen("Quelle löschen?", betroffen
      ? `${betroffen} Feld${betroffen === 1 ? "" : "er"} verliert dadurch die Datenbindung.`
      : "Diese Quelle wird von keinem Feld genutzt.",
      () => commit({ ...layoutRef.current, sources: sources.filter((s) => s.id !== id), pages: layoutRef.current.pages.map((p) => ({ ...p, widgets: p.widgets.map((w) => (w.bind?.src === id ? { ...w, bind: undefined } : w)) })) }));
  };

  const portBenutzt = useRef(false);
  const connect = async () => { try { portBenutzt.current = true; link.current.onClose = () => { setConnected(false); setDevLog((l) => [...l, "— Verbindung verloren —"]); };
      link.current.onLine = (s) => {
        setDevLog((l) => [...l.slice(-400), "< " + s]); if (s.startsWith("OK")) toast.success(s.startsWith("OK wifi") ? "WLAN gespeichert" : "Übernommen · " + s.slice(3).trim() + " B"); else if (s.startsWith("ERR")) toast.error(s); }; await link.current.connect(); setConnected(true); toast.success("Gerät verbunden");
      // Welche Schriften liegen schon drauf? Dann muss nichts erneut übertragen werden.
      try {
        const antwort = link.current.warteAufZeile(/^OK fonts/, 4000);
        await link.current.push(JSON.stringify({ _fonts: true }));
        const zeile = await antwort;
        gesendeteSchriften.current = new Set(
          [...zeile.matchAll(/([\w.-]+)\.vlw:(\d+)/g)].map((m) => m[1].replace(/^\//, "")),
        );
        if (gesendeteSchriften.current.size)
          setDevLog((l) => [...l, `> bereits auf dem Gerät: ${[...gesendeteSchriften.current].join(", ")}`]);
      } catch { /* ältere Firmware kennt das Kommando nicht */ }
      setDevLog((l) => [...l, "> Verbindung offen, frage Gerät ab…"]);
      setTimeout(() => { link.current.push(JSON.stringify({ _status: true })).catch(() => {}); }, 400); } catch (e) { toast.error((e as Error).message); } };
  const doFlash = async () => {
    setFlashing(true); setFlashDone(false); setFlashPct(0);
    try {
      const { flashFirmware } = await import("./lib/flash");
      // Immer freigeben — nach dem echten Portzustand, nicht nach der Anzeige.
      // (connected kann false sein, während der Port real noch offen ist.)
      let port = await link.current.release();
      if (port) await new Promise((r) => setTimeout(r, 800));
      if (!port) { const nav = navigator as unknown as { serial: { requestPort(): Promise<unknown> } }; port = await nav.serial.requestPort(); }
      setConnected(false);
      await flashFirmware(port, "/firmware/slab.bin", setFlashPct, (l) => setFlashLog((s) => (s + l).slice(-4000)));
      setFlashDone(true); toast.success("Firmware geflasht");
      // Gerät bootet neu — kurz warten, dann Datenlink wieder aufbauen
      await new Promise((r) => setTimeout(r, 1200));
      try { await link.current.reopen(port); setConnected(true); } catch { /* manuell verbinden */ }
    } catch (e) { toast.error("Flash-Fehler: " + (e as Error).message); }
    finally { setFlashing(false); }
  };
  /** Fragt ab, welche Schriften wirklich auf dem Gerät liegen. */
  const geraeteSchriften = async () => {
    try { setDevLog((l) => [...l, "> Schriften auf dem Gerät?"]); await link.current.push(JSON.stringify({ _fonts: true })); }
    catch (e) { toast.error((e as Error).message); }
  };
  const calibrate = async () => {
    try { setDevLog((l) => [...l, "> Kalibrierung angefordert"]); await link.current.push(JSON.stringify({ _calibrate: true })); toast("Auf dem Display die 3 Kreuze antippen"); }
    catch (e) { toast.error((e as Error).message); }
  };
  const touchtest = async () => {
    try { setDevLog((l) => [...l, "> Sensor-Test (12s) — jetzt aufs Display drücken"]); await link.current.push(JSON.stringify({ _touchtest: true })); }
    catch (e) { toast.error((e as Error).message); }
  };
  const disconnect = async () => {
    await link.current.disconnect(); setConnected(false); gesendeteSchriften.current.clear();
    // Chromium gibt den Port erst nach einem Neuladen wirklich frei
    toast("Verbindung getrennt — Seite lädt neu");
    setTimeout(() => location.reload(), 500);
  };
  const sendWifi = async () => {
    try { await link.current.push(JSON.stringify({ _wifi: { ssid: wifiSsid, pass: wifiPass } })); setWifiOpen(false); setWifiPass(""); }
    catch (e) { toast.error((e as Error).message); }
  };
  /** Welche Schriften in dieser Sitzung schon aufs Gerät gingen — spart Sekunden je Publish. */
  const gesendeteSchriften = useRef<Set<string>>(new Set());
  const publish = async () => {
    if (errCount > 0) { setCheckOpen(true); toast.error(`${errCount} Fehler — erst beheben`); return; }
    try {
      const snap: Layout = { ...layoutRef.current, pages: layoutRef.current.pages.map((p) => ({ ...p, widgets: p.widgets.map(resolve) })) };

      setPubSchritte([]); setPubPct(0); setPubOffen(true);

      // Eigene Schriften zuerst — das Layout verweist nur auf ihre Namen.
      const gebraucht = new Set<string>();
      snap.pages.forEach((p) => p.widgets.forEach((w) => { if (w.vlw) gebraucht.add(w.vlw); }));
      const offen = [...gebraucht].filter((n) => !gesendeteSchriften.current.has(n));
      if (gebraucht.size && !offen.length) pubLog(`> ${gebraucht.size} Schrift(en) liegen schon auf dem Gerät`);

      for (const name of offen) {
        const teile = name.match(/^(.+)-(\d+)$/);
        if (!teile) continue;
        try {
          pubLog(`> Schrift ${name} wird erzeugt…`);
          const erg = await vlwErzeugen(teile[1], Number(teile[2]));
          if (!erg) { pubLog(`! Schrift ${teile[1]} nicht im Vorrat — übersprungen`); continue; }
          pubLog(`> Schrift ${name}: ${(erg.v.data.length / 1024).toFixed(1)} KB, ${erg.v.glyphs} Zeichen`);
          // Prüfsumme mitschicken: das Gerät verwirft die Datei, wenn der Inhalt nicht stimmt
          let summe = 0;
          for (const b of erg.v.data) summe = (Math.imul(summe, 31) + b) >>> 0;
          const bereit = link.current.warteAufZeile(/^ACK 0 /, 8000);
          await link.current.push(JSON.stringify({ _font: { name, len: erg.v.data.length, sum: summe } }));
          try { await bereit; }
          catch {
            throw new Error("Firmware auf dem Gerät ist zu alt für Schriften — einmal Firmware flashen");
          }
          // Zuhörer VOR dem Senden anmelden: die Bestätigung folgt unmittelbar auf
          // den letzten Block und wäre sonst schon vorbei.
          const abschluss = link.current.warteAufZeile(/^OK font|^ERR font/, 20000);
          await link.current.sendeDatei(erg.v.data, (anteil) => setPubPct(Math.round(anteil * 90)));
          const fertig = await abschluss;
          pubLog(`< ${fertig}`);
          if (fertig.startsWith("ERR")) throw new Error(fertig);
          gesendeteSchriften.current.add(name);
        } catch (e) {
          pubLog(`! ${name}: ${(e as Error).message}`);
        }
      }

      const roh = serialize(snap);
      setDevLog((l) => [...l, `> Layout gesendet (${roh.length} Bytes)`]);
      // Bilder, QR-Codes und Wettersymbole: als Rohbild, gleicher Weg wie die Schriften
      const dateien: { name: string; daten: Uint8Array; was: string }[] = [];

      // Wettersymbole: für jedes Wetterfeld alle Zustände, die auftreten können
      const wetterFelder = snap.pages.flatMap((p) => p.widgets)
        .filter((wd) => wd.type === "weather" && wd.iconStyle !== "einfach");
      if (wetterFelder.length) {
        const gebrauchteCodes = [0, 2, 3, 45, 48, 51, 61, 71, 77, 80, 85, 95, 96];
        const gesehen = new Set<string>();
        for (const wd of wetterFelder) {
          const px = Math.max(12, Math.min(wd.w, wd.h));
          const bilder = Math.max(1, Math.min(12, wd.frames ?? 6));
          for (const code of gebrauchteCodes) {
            for (const nacht of wd.night ? [true] : [false]) {
              const name = meteoconFuer(code, nacht);
              const datei = symbolDateiname(name, px);
              if (gesehen.has(datei)) continue;
              gesehen.add(datei);
              try {
                const folge = await meteoconAlsFilm(name, px, snap.bg, wd.iconSet ?? "fill", bilder);
                dateien.push({
                  name: datei,
                  daten: nachRgb565Film(folge),
                  was: `Symbol ${name} ${px}px${folge.length > 1 ? ` · ${folge.length} Bilder` : ""}`,
                });
              } catch { /* fehlendes Symbol überspringen */ }
            }
          }
        }
      }

      for (const p of snap.pages) for (const wd of p.widgets) {
        if (wd.type === "image" && wd.asset) {
          const d = await bildLesen(wd.asset);
          if (d) dateien.push({ name: wd.asset, daten: d, was: `Bild ${wd.asset}` });
        } else if (wd.type === "qr") {
          const d = await qrErzeugen(wd.payload ?? "", Math.min(wd.w, wd.h));
          dateien.push({ name: `qr-${wd.id}`, daten: d, was: `QR ${wd.id}` });
        }
      }
      // Passt das überhaupt? Bewegte Symbole brauchen ein Vielfaches an Platz,
      // und ein volles Dateisystem soll nicht als kaputte Datei enden.
      if (dateien.length) {
        const bedarf = dateien.reduce((s, f) => s + f.daten.length, 0);
        try {
          const platz = link.current.warteAufZeile(/^OK fs frei=/, 4000);
          await link.current.push(JSON.stringify({ _status: true }));
          const frei = Number((await platz).match(/frei=(\d+)/)?.[1] ?? 0);
          pubLog(`> Dateien: ${(bedarf / 1024).toFixed(0)} KB · frei auf dem Gerät: ${(frei / 1024).toFixed(0)} KB`);
          // Erst ab einem spürbaren Fehlbetrag warnen: Dateien, die schon auf dem
          // Gerät liegen, geben ihren Platz beim Überschreiben wieder frei.
          if (bedarf > frei + 8 * 1024) {
            pubLog(`! Es fehlen ${((bedarf - frei) / 1024).toFixed(0)} KB — was schon auf dem Gerät liegt, wird überschrieben, der Rest schlägt fehl`);
          }
        } catch { /* ältere Firmware meldet keinen Platz — dann eben ohne */ }
      }

      for (const f of dateien) {
        // Der Merker enthält die Größe: ändert sich der Inhalt (andere Zahl von
        // Einzelbildern, anderer Hintergrund), wird die Datei erneut geschickt.
        const merker = `${f.name}#${f.daten.length}`;
        if (gesendeteSchriften.current.has(merker)) continue;
        try {
          pubLog(`> ${f.was}: ${(f.daten.length / 1024).toFixed(1)} KB`);
          let summe = 0;
          for (const b of f.daten) summe = (Math.imul(summe, 31) + b) >>> 0;
          const bereit = link.current.warteAufZeile(/^ACK 0 /, 8000);
          await link.current.push(JSON.stringify({ _font: { name: f.name, ext: ".565", len: f.daten.length, sum: summe } }));
          try { await bereit; }
          catch { throw new Error("Firmware auf dem Gerät ist zu alt für Bilder — einmal Firmware flashen"); }
          const abschluss = link.current.warteAufZeile(/^OK font|^ERR font/, 20000);
          await link.current.sendeDatei(f.daten, (a) => setPubPct(Math.round(a * 90)));
          const fertig = await abschluss;
          pubLog(`< ${fertig}`);
          if (fertig.startsWith("ERR")) throw new Error(fertig);
          gesendeteSchriften.current.add(merker);
        } catch (e) { pubLog(`! ${f.was}: ${(e as Error).message}`); }
      }

      pubLog(`> Layout gesendet (${roh.length} Bytes)`);
      setPubPct(95);
      const antwort = await link.current.pushUndWarten(roh);
      pubLog(`< ${antwort}`);
      setPubPct(100);
      toast.success("↗ Gerät hat übernommen · " + antwort.replace(/^OK\s*/, "") + " B");
    } catch (e) { pubLog(`! ${(e as Error).message}`); toast.error((e as Error).message); }
  };

  const { w: W, h: H } = sizeOf(layout);
  const issues: Issue[] = useMemo(() => validate(layout, data, (w) => fontPx(w)), [layout, data]);
  const errCount = issues.filter((i) => i.level === "fehler").length;
  const warnCount = issues.filter((i) => i.level === "warnung").length;
  const offscreen = widgets.filter((w) => { const b = bbox(w); return b.x < 0 || b.y < 0 || b.x + b.w > W || b.y + b.h > H; });
  const selBox = selected ? bbox(selected) : null;
  const selSrcData = selected?.bind ? data[selected.bind.src] : undefined;
  const boundLive = selected?.bind ? getPath(data[selected.bind.src], selected.bind.path) : undefined;
  const pickerSrc = selected && BINDABLE.includes(selected.type) ? (selected.bind?.src ?? sources[0]?.id) : undefined;
  const pickerPaths = useMemo(() => {
    if (!pickerSrc || data[pickerSrc] === undefined) return [];
    const all = leafPaths(data[pickerSrc]);
    const q = pathQuery.trim().toLowerCase();
    return (q ? all.filter((p) => p.path.toLowerCase().includes(q)) : all).slice(0, 60);
  }, [pickerSrc, data, pathQuery]);

  return (
    <div className="flex flex-col h-screen bg-background text-foreground select-none">
      <header className="min-h-16 shrink-0 border-b-2 border-border bg-card flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-2">
        <div className="flex items-center gap-2.5 select-none" title="SLAB — Display-Builder">
          {/* Platte, isometrisch: dieselbe Form wie das Zeichen im Browser-Reiter */}
          <svg viewBox="0 0 64 64" className="size-8 shrink-0" aria-hidden>
            <path d="M6 20 L32 34 L32 56 L6 42 Z" fill="#1a1a1a" stroke="#000" strokeWidth="3" strokeLinejoin="round" />
            <path d="M58 20 L32 34 L32 56 L58 42 Z" fill="#0d0d0d" stroke="#000" strokeWidth="3" strokeLinejoin="round" />
            <path d="M32 6 L58 20 L32 34 L6 20 Z" fill="var(--primary)" stroke="#000" strokeWidth="3" strokeLinejoin="round" />
            <path d="M20 20 L26 17 L30 19 L24 22 Z" fill="#000" />
            <path d="M33 15 L44 21 L41 23 L30 17 Z" fill="#000" />
            <path d="M26 25 L37 31 L34 33 L23 27 Z" fill="#000" />
          </svg>
          <span className="font-head text-2xl uppercase tracking-tight leading-none">Slab</span>
        </div>
        <div className="hidden sm:flex items-center gap-2">
          <Select value={tpl} onValueChange={switchTpl}>
            <SelectTrigger className="w-44 font-mono text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {(tplList.length ? tplList : [tpl]).map((t) => (<SelectItem key={t} value={t} className="font-mono text-xs">{t}</SelectItem>))}
            </SelectContent>
          </Select>
          <Menubar className="h-auto border-0 bg-transparent p-0 shadow-none gap-0.5">
            <MenubarMenu>
              <MenubarTrigger>Datei</MenubarTrigger>
              <MenubarContent>
                <MenubarItem onClick={newTpl}>Neues Template</MenubarItem>
                <MenubarItem onClick={dupTpl}>Template duplizieren</MenubarItem>
                <MenubarItem onClick={() => { setRenameVal(tpl); setRenameOpen(true); }}>Umbenennen…</MenubarItem>
                <MenubarSeparator />
                <MenubarItem onClick={exportTpl}>Als JSON exportieren</MenubarItem>
                <MenubarItem onClick={() => importRef.current?.click()}>JSON importieren…</MenubarItem>
                <MenubarItem onClick={() => { setJsonDraft(JSON.stringify(layoutRef.current, null, 2)); setJsonOpen(true); }}>JSON bearbeiten…</MenubarItem>
                <MenubarSeparator />
                <MenubarItem variant="destructive" onClick={() => setDelOpen(true)}>Template löschen</MenubarItem>
              </MenubarContent>
            </MenubarMenu>

            <MenubarMenu>
              <MenubarTrigger>Bearbeiten</MenubarTrigger>
              <MenubarContent>
                <MenubarItem disabled={!past.current.length} onClick={undo}>Rückgängig<MenubarShortcut>⌘Z</MenubarShortcut></MenubarItem>
                <MenubarItem disabled={!future.current.length} onClick={redo}>Wiederholen<MenubarShortcut>⇧⌘Z</MenubarShortcut></MenubarItem>
                <MenubarSeparator />
                <MenubarItem disabled={!selIds.length} onClick={copySel}>Kopieren<MenubarShortcut>⌘C</MenubarShortcut></MenubarItem>
                <MenubarItem onClick={pasteClip}>Einfügen<MenubarShortcut>⌘V</MenubarShortcut></MenubarItem>
                <MenubarItem disabled={!sel} onClick={() => sel && duplicate(sel)}>Duplizieren<MenubarShortcut>⌘D</MenubarShortcut></MenubarItem>
                <MenubarSeparator />
                <MenubarItem onClick={() => setSelIds(widgets.filter((w) => !w.locked).map((w) => w.id))}>Alles auswählen<MenubarShortcut>⌘A</MenubarShortcut></MenubarItem>
                <MenubarItem disabled={!selIds.length} onClick={() => setSelIds([])}>Auswahl aufheben<MenubarShortcut>Esc</MenubarShortcut></MenubarItem>
                <MenubarSeparator />
                <MenubarItem variant="destructive" disabled={!selIds.length}
                  onClick={() => { const ids = selIds; mutate((ws) => ws.filter((w) => !ids.includes(w.id))); setSelIds([]); }}>
                  Löschen<MenubarShortcut>⌫</MenubarShortcut>
                </MenubarItem>
              </MenubarContent>
            </MenubarMenu>

            <MenubarMenu>
              <MenubarTrigger>Feld</MenubarTrigger>
              <MenubarContent>
                <MenubarSub>
                  <MenubarSubTrigger disabled={!selIds.length}>Ausrichten</MenubarSubTrigger>
                  <MenubarSubContent>
                    <MenubarItem onClick={() => alignSel("l")}>Links</MenubarItem>
                    <MenubarItem onClick={() => alignSel("hc")}>Horizontal mittig</MenubarItem>
                    <MenubarItem onClick={() => alignSel("r")}>Rechts</MenubarItem>
                    <MenubarSeparator />
                    <MenubarItem onClick={() => alignSel("t")}>Oben</MenubarItem>
                    <MenubarItem onClick={() => alignSel("vc")}>Vertikal mittig</MenubarItem>
                    <MenubarItem onClick={() => alignSel("b")}>Unten</MenubarItem>
                    <MenubarSeparator />
                    <MenubarItem disabled={selIds.length < 3} onClick={() => alignSel("dh")}>Waagerecht verteilen</MenubarItem>
                    <MenubarItem disabled={selIds.length < 3} onClick={() => alignSel("dv")}>Senkrecht verteilen</MenubarItem>
                  </MenubarSubContent>
                </MenubarSub>
                <MenubarSeparator />
                <MenubarItem disabled={!sel} onClick={() => sel && moveLayer(sel, 1)}>Nach vorn</MenubarItem>
                <MenubarItem disabled={!sel} onClick={() => sel && moveLayer(sel, -1)}>Nach hinten</MenubarItem>
                <MenubarSeparator />
                <MenubarItem disabled={!selIds.length} onClick={() => updateAlle({ locked: !selected?.locked })}>{selected?.locked ? "Entsperren" : "Sperren"}</MenubarItem>
                <MenubarItem disabled={!selIds.length} onClick={() => updateAlle({ hidden: !selected?.hidden })}>{selected?.hidden ? "Einblenden" : "Ausblenden"}</MenubarItem>
                <MenubarSeparator />
                <MenubarSub>
                  <MenubarSubTrigger>Vorlage einfügen</MenubarSubTrigger>
                  <MenubarSubContent>
                    {VORLAGEN.map((v) => (
                      <MenubarItem key={v.name} onClick={() => vorlageEinfuegen(v.name)}>{v.name}</MenubarItem>
                    ))}
                  </MenubarSubContent>
                </MenubarSub>
                <MenubarSeparator />
                <MenubarItem disabled={!selIds.length || selected?.type === "repeat"} onClick={zuWiederholer}>Zu Wiederholer machen…</MenubarItem>
                <MenubarItem disabled={selected?.type !== "repeat"} onClick={() => sel && wiederholerAufloesen(sel)}>Wiederholer auflösen</MenubarItem>
              </MenubarContent>
            </MenubarMenu>

            <MenubarMenu>
              <MenubarTrigger>Seite</MenubarTrigger>
              <MenubarContent>
                <MenubarItem onClick={addPage}>Seite hinzufügen</MenubarItem>
                <MenubarItem onClick={dupPage}>Seite duplizieren</MenubarItem>
                <MenubarSeparator />
                <MenubarItem disabled={layout.pages.length < 2} onClick={() => setPageIdx((pageIdxRef.current + 1) % layout.pages.length)}>Nächste Seite</MenubarItem>
                <MenubarItem disabled={layout.pages.length < 2} onClick={() => setPageIdx((pageIdxRef.current - 1 + layout.pages.length) % layout.pages.length)}>Vorherige Seite</MenubarItem>
                <MenubarSeparator />
                <MenubarItem variant="destructive" disabled={layout.pages.length < 2} onClick={delPage}>Seite löschen</MenubarItem>
              </MenubarContent>
            </MenubarMenu>

            <MenubarMenu>
              <MenubarTrigger>Ansicht</MenubarTrigger>
              <MenubarContent>
                {Object.entries(DOCK_TITEL).map(([id, titel]) => (
                  <MenubarCheckboxItem key={id} checked={offenePanels.includes(id)} onCheckedChange={() => togglePanel(id)}>{titel}</MenubarCheckboxItem>
                ))}
                <MenubarSeparator />
                <MenubarSub>
                  <MenubarSubTrigger>Bereich abkoppeln</MenubarSubTrigger>
                  <MenubarSubContent>
                    {Object.entries(DOCK_TITEL).map(([id, titel]) => (
                      <MenubarItem key={id} onClick={() => schwebend(id)}>{titel}</MenubarItem>
                    ))}
                  </MenubarSubContent>
                </MenubarSub>
                <MenubarSub>
                  <MenubarSubTrigger>Bereich wieder andocken</MenubarSubTrigger>
                  <MenubarSubContent>
                    {Object.entries(DOCK_TITEL).map(([id, titel]) => (
                      <MenubarItem key={id} onClick={() => andocken(id)}>{titel}</MenubarItem>
                    ))}
                  </MenubarSubContent>
                </MenubarSub>
                <MenubarSeparator />
                <MenubarItem onClick={() => setZoom((z) => Math.min(4, z + 1))}>Vergrößern</MenubarItem>
                <MenubarItem onClick={() => setZoom((z) => Math.max(1, z - 1))}>Verkleinern</MenubarItem>
                <MenubarItem onClick={() => setZoom(2)}>Zoom zurücksetzen</MenubarItem>
                <MenubarSeparator />
                <MenubarItem onClick={resetDock}>Ansicht zurücksetzen</MenubarItem>
              </MenubarContent>
            </MenubarMenu>

            <MenubarMenu>
              <MenubarTrigger>Gerät</MenubarTrigger>
              <MenubarContent>
                <MenubarItem onClick={connected ? disconnect : connect}>{connected ? "Verbindung trennen" : "Verbinden"}</MenubarItem>
                <MenubarItem disabled={!connected} onClick={publish}>Publish<MenubarShortcut>↗</MenubarShortcut></MenubarItem>
                <MenubarSeparator />
                <MenubarItem disabled={!connected} onClick={() => setWifiOpen(true)}>WLAN einrichten…</MenubarItem>
                <MenubarItem disabled={!connected} onClick={calibrate}>Touch kalibrieren</MenubarItem>
                <MenubarItem disabled={!connected} onClick={touchtest}>Sensor prüfen</MenubarItem>
                <MenubarItem disabled={!connected} onClick={geraeteSchriften}>Schriften auf dem Gerät</MenubarItem>
                <MenubarSeparator />
                <MenubarItem onClick={() => setLogOpen(true)}>Log ansehen{devLog.length ? ` (${devLog.length})` : ""}</MenubarItem>
                <MenubarItem onClick={() => { sessionStorage.setItem("slab:flashNachNeuladen", "1"); location.reload(); }}>Firmware flashen…</MenubarItem>
                <MenubarSeparator />
                <MenubarItem onClick={() => setCheckOpen(true)}>Layout prüfen</MenubarItem>
              </MenubarContent>
            </MenubarMenu>

            <MenubarMenu>
              <MenubarTrigger>Hilfe</MenubarTrigger>
              <MenubarContent>
                <MenubarItem onClick={() => setHelpOpen(true)}>Tastenkürzel<MenubarShortcut>?</MenubarShortcut></MenubarItem>
              </MenubarContent>
            </MenubarMenu>
          </Menubar>

          <Button variant="outline" size="sm" onClick={() => setCheckOpen(true)}
            className={errCount ? "text-destructive border-destructive" : warnCount ? "" : ""}
            title="Layout prüfen">
            <ShieldCheck />{errCount ? `${errCount} Fehler` : warnCount ? `${warnCount} Hinweise` : "OK"}
          </Button>
        </div>
        {savedTick && <Badge variant="outline" className="font-mono text-[10px]">gespeichert {savedTick}</Badge>}
        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon-sm" title="Ansicht"><PanelsTopLeft /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              {Object.entries(DOCK_TITEL).map(([id, titel]) => (
                <DropdownMenuItem key={id} onClick={() => togglePanel(id)}>
                  <span className="w-4">{offenePanels.includes(id) ? <Check className="size-3.5" /> : null}</span>{titel}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              {Object.entries(DOCK_TITEL).map(([id, titel]) => (
                <DropdownMenuItem key={"f" + id} onClick={() => schwebend(id)}><span className="w-4" />{titel} abkoppeln</DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={resetDock}><span className="w-4" />Ansicht zurücksetzen</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button variant="outline" size="icon-sm" onClick={undo} disabled={!past.current.length} title="Rückgängig (⌘Z)"><Undo2 /></Button>
          <Button variant="outline" size="icon-sm" onClick={redo} disabled={!future.current.length} title="Wiederholen (⌘⇧Z)"><Redo2 /></Button>
        </div>
        <div className="flex-1" />
      </header>

      {/* Arbeitsfläche: Bereiche lassen sich verschieben, andocken, abkoppeln und einklappen */}
      <SlotCtx.Provider value={{ vorlagen: (<>
              <div className="flex flex-col gap-2">
                {VORLAGEN.map((v) => (
                  <Button key={v.name} variant="outline" size="sm" className="justify-start h-auto py-2 flex-col items-start gap-0.5"
                    onClick={() => vorlageEinfuegen(v.name)}>
                    <span>{v.name}</span>
                    <span className="text-[10px] text-muted-foreground font-normal normal-case">{v.beschreibung}</span>
                  </Button>
                ))}
              </div>
      </>), geraet: (<>
              <div className="flex flex-col gap-2">
                <Button variant="outline" size="sm" onClick={connected ? disconnect : connect} className="gap-2 justify-start" title={connected ? "Verbindung trennen (gibt den Port frei)" : "Gerät über USB verbinden"}><span className={`size-2 border border-black ${connected ? "bg-[#4ade80]" : "bg-muted-foreground"}`} />{connected ? "CYD verbunden" : "Verbinden"}<Usb className="size-4" /></Button>
                <Button variant="outline" size="sm" onClick={() => setWifiOpen(true)} disabled={!connected} className="justify-start" title="WLAN aufs Gerät"><Zap />WLAN</Button>
                <Button variant="outline" size="sm" onClick={calibrate} disabled={!connected} className="justify-start" title="Touch kalibrieren (3 Kreuze antippen)">Touch kalibrieren</Button>
                <Button variant="outline" size="sm" onClick={touchtest} disabled={!connected} className="justify-start" title="Rohwerte des Sensors 12s lang anzeigen">Sensor prüfen</Button>
                <Button variant="outline" size="sm" onClick={() => setLogOpen(true)} className="justify-start" title="Was das Gerät meldet">Log{devLog.length ? ` (${devLog.length})` : ""}</Button>
                <Button variant="outline" size="sm" onClick={() => { sessionStorage.setItem("slab:flashNachNeuladen", "1"); location.reload(); }} className="justify-start" title="Firmware aufs Gerät flashen"><Usb />Firmware flashen</Button>
                <Button size="sm" onClick={publish} disabled={!connected} className="gap-1.5 justify-start mt-1">Publish ↗</Button>
              </div>
      </>), felder: (<>
              <div>
                <div className="grid grid-cols-2 gap-2.5">
                  {PALETTE.map(({ t, icon: Icon, label }) => (
                    <Button key={t} variant="outline" size="sm" onClick={() => add(t)}>
                      <Icon strokeWidth={2.25} />{label}
                    </Button>
                  ))}
                </div>
              </div>
      </>), ebenen: (<>
              <div>
                {!widgets.length && <p className="text-[11px] text-muted-foreground px-1">Noch keine Felder auf dieser Seite.</p>}
                <div className="flex flex-col gap-1">
                  {[...widgets].reverse().map((w) => (
                    <ContextMenu key={w.id}>
                    <ContextMenuTrigger asChild>
                    <div onClick={(e) => toggleSel(w.id, e.shiftKey || e.metaKey)} onContextMenu={() => setSelIds([w.id])}
                      className={`flex items-center gap-0.5 px-1.5 py-1 border-2 cursor-pointer ${selIds.includes(w.id) ? "border-border bg-primary text-primary-foreground" : "border-transparent hover:bg-accent"}`}>
                      <span className="text-[11px] font-mono flex-1 truncate">{w.type === "text" || w.type === "button" ? (w.text || w.type) : w.type}</span>
                      <Button variant="link" size="icon-xs" aria-pressed={!!w.locked}
                        className={selIds.includes(w.id)
                          ? (w.locked ? "text-primary-foreground" : "text-primary-foreground/45")
                          : (w.locked ? "text-primary" : "text-muted-foreground")}
                        onClick={(e) => { e.stopPropagation(); update(w.id, { locked: !w.locked }); }}
                        title={w.locked ? "Gesperrt — klicken zum Entsperren" : "Sperren"}>{w.locked ? <Lock /> : <LockOpen />}</Button>
                      <Button variant="link" size="icon-xs" aria-pressed={!!w.hidden}
                        className={selIds.includes(w.id)
                          ? (w.hidden ? "text-primary-foreground" : "text-primary-foreground/45")
                          : (w.hidden ? "text-primary" : "text-muted-foreground")}
                        onClick={(e) => { e.stopPropagation(); update(w.id, { hidden: !w.hidden }); }}
                        title={w.hidden ? "Ausgeblendet — klicken zum Einblenden" : "Ausblenden"}>{w.hidden ? <EyeOff /> : <Eye />}</Button>
                      <Button variant="link" size="icon-xs" onClick={(e) => { e.stopPropagation(); moveLayer(w.id, 1); }} title="Nach vorn"><ChevronUp /></Button>
                      <Button variant="link" size="icon-xs" onClick={(e) => { e.stopPropagation(); moveLayer(w.id, -1); }} title="Nach hinten"><ChevronDown /></Button>
                    </div>
                    </ContextMenuTrigger>
                    <ContextMenuContent>{feldMenue(w.id)}</ContextMenuContent>
                    </ContextMenu>
                  ))}
                </div>
              </div>
      </>), quellen: (<>
              <div>
                <div className="flex items-center justify-end mb-2 px-1">
                  <Button variant="outline" size="sm" onClick={addSource} title="Datenquelle hinzufügen"><Plus />Quelle</Button>
                </div>
                {!sources.length && <p className="text-[11px] text-muted-foreground px-1">Keine Quellen. Mit + eine JSON-API anlegen, dann Felder daran binden.</p>}
                <div className="flex flex-col gap-2">
                  {sources.map((s) => (
                    <div key={s.id} className="border-2 border-border bg-background p-2 flex flex-col gap-1.5">
                      <div className="flex items-center gap-1.5">
                        <span className={`size-2 border border-black shrink-0 ${srcErr[s.id] ? "bg-destructive" : data[s.id] !== undefined ? "bg-[#4ade80]" : "bg-muted-foreground"}`} />
                        <span className="text-[11px] font-mono flex-1 truncate">{s.name || s.id}</span>
                        <Button variant="link" size="icon-xs" onClick={() => setSrcEdit(s.id)} title="Bearbeiten"><Pencil /></Button>
                        <Button variant="link" size="icon-xs" onClick={() => delSource(s.id)} className="text-muted-foreground hover:text-destructive" title="Löschen"><Trash2 /></Button>
                      </div>
                      <div className="text-[10px] font-mono text-muted-foreground truncate">{s.url || "keine URL"}</div>
                      {srcErr[s.id] && <div className="text-[10px] text-destructive truncate" title={srcErr[s.id]}>{srcErr[s.id]}</div>}
                    </div>
                  ))}
                </div>
              </div>
      </>), display: (<>
        {/* Optionsleiste: steht immer, Knöpfe greifen nur bei Auswahl */}
        <div className="w-full flex items-center gap-1 px-3 py-1.5 border-b-2 border-border bg-card min-h-10 pb-3">
          {([["l", AlignStartVertical, "Links ausrichten"], ["hc", AlignCenterVertical, "Horizontal zentrieren"], ["r", AlignEndVertical, "Rechts ausrichten"],
             ["t", AlignStartHorizontal, "Oben ausrichten"], ["vc", AlignCenterHorizontal, "Vertikal zentrieren"], ["b", AlignEndHorizontal, "Unten ausrichten"]] as const).map(([m, Icon, tip]) => (
            <Button key={m} variant="outline" size="icon-sm" disabled={!selIds.length} onClick={() => alignSel(m)}
              title={!selIds.length ? tip + " — erst ein Feld auswählen" : selIds.length === 1 ? tip + " (an der Zeichenfläche)" : tip}><Icon /></Button>
          ))}
          <span className="w-px h-5 bg-border mx-1.5" />
          <Button variant="outline" size="icon-sm" disabled={selIds.length < 3} onClick={() => alignSel("dh")} title="Waagerecht verteilen — ab 3 Feldern"><MoveHorizontal /></Button>
          <Button variant="outline" size="icon-sm" disabled={selIds.length < 3} onClick={() => alignSel("dv")} title="Senkrecht verteilen — ab 3 Feldern"><MoveVertical /></Button>
          <span className="w-px h-5 bg-border mx-1.5" />
          <Button variant="outline" size="icon-sm" disabled={!sel} onClick={() => sel && moveLayer(sel, 1)} title="Nach vorn"><ChevronUp /></Button>
          <Button variant="outline" size="icon-sm" disabled={!sel} onClick={() => sel && moveLayer(sel, -1)} title="Nach hinten"><ChevronDown /></Button>
          <span className="w-px h-5 bg-border mx-1.5" />
          <Button variant={selected?.locked ? "default" : "outline"} size="icon-sm" disabled={!selIds.length} aria-pressed={!!selected?.locked}
            onClick={() => updateAlle({ locked: !selected?.locked })}
            title={selected?.locked ? "Gesperrt — klicken zum Entsperren" : "Sperren"}>{selected?.locked ? <Lock /> : <LockOpen />}</Button>
          <Button variant={selected?.hidden ? "default" : "outline"} size="icon-sm" disabled={!selIds.length} aria-pressed={!!selected?.hidden}
            onClick={() => updateAlle({ hidden: !selected?.hidden })}
            title={selected?.hidden ? "Ausgeblendet — klicken zum Einblenden" : "Ausblenden"}>{selected?.hidden ? <EyeOff /> : <Eye />}</Button>
          <div className="flex-1" />
          <span className="text-[11px] text-muted-foreground font-mono">
            {selIds.length === 0 ? "nichts ausgewählt" : selIds.length === 1 ? selected?.type : `${selIds.length} Felder`}
          </span>
        </div>
        <main className="flex-1 min-w-0 relative flex [&>*]:m-auto" data-canvas
          style={{ backgroundImage: "radial-gradient(var(--border) 1px, transparent 1px)", backgroundSize: "24px 24px" }}
          onPointerDown={(e) => {
            // Auswahl nur leeren, wenn wirklich auf den leeren Hintergrund geklickt wurde —
            // nicht auf Widgets, Bedienelemente oder die Werkzeugleisten darunter.
            const t = e.target as HTMLElement;
            if (!t.closest('[data-widget], button, [role="button"], [data-slot], input, label, [data-devframe]')) setSelIds([]);
          }}
          onPointerDownCapture={(e) => {
            // Auf der Displayfläche (nicht auf einem Feld) einen Auswahlrahmen aufziehen
            const t = e.target as HTMLElement;
            if (t.closest('[data-widget], button, [role="button"], [data-slot], input, label')) return;
            const flaeche = (e.target as HTMLElement).closest("[data-devframe]")?.querySelector("[data-flaeche]") as HTMLElement | null;
            if (!flaeche) return;
            const r = flaeche.getBoundingClientRect();
            const x = (e.clientX - r.left) / zoom, y = (e.clientY - r.top) / zoom;
            if (x < 0 || y < 0 || x > W || y > H) return;
            rahmenStart.current = { x, y, additiv: e.shiftKey || e.metaKey, vorher: selRef.current };
            rahmenRef.current = { x0: x, y0: y, x1: x, y1: y };
            setRahmen(rahmenRef.current);
          }}>
                    <div className="relative flex flex-col items-center gap-5 m-auto">
            <div data-devframe className="bg-black" style={{ padding: 0 }}>
              <div className="relative overflow-hidden" style={{ width: W * zoom, height: H * zoom, background: "#000" }}>
                <div data-flaeche style={{ position: "absolute", inset: 0, transform: `scale(${zoom})`, transformOrigin: "top left", width: W, height: H, background: layout.bg }}>
                  {resolvedWidgets.map((w, i) => (
                    <ContextMenu key={w.id}>
                      <ContextMenuTrigger asChild>
                        <div onContextMenu={() => { if (!selIds.includes(w.id)) setSelIds([w.id]); }} style={{ display: "contents" }}>
                          <WidgetView w={w} selected={selIds.includes(w.id)} onDown={(e) => startDrag(e, widgets[i])} bg={layout.bg} seiten={layout.pages.length} seiteAktiv={pageIdx} bildDaten={vorschauen} qrVorschau={qrBilder[w.id]} symbole={symbolQuellen} />
                        </div>
                      </ContextMenuTrigger>
                      <ContextMenuContent>{feldMenue(w.id)}</ContextMenuContent>
                    </ContextMenu>
                  ))}
                </div>
                {rahmen && (
                  <div style={{ position: "absolute", pointerEvents: "none", zIndex: 30,
                    left: Math.min(rahmen.x0, rahmen.x1) * zoom, top: Math.min(rahmen.y0, rahmen.y1) * zoom,
                    width: Math.abs(rahmen.x1 - rahmen.x0) * zoom, height: Math.abs(rahmen.y1 - rahmen.y0) * zoom,
                    border: "1px solid #ffdc58", background: "#ffdc5820" }} />
                )}
                {/* Ausrichtungshilfen */}
                {guides.map((g, i) => (
                  <div key={i} style={{ position: "absolute", background: "#ffdc58", pointerEvents: "none", zIndex: 20,
                    ...(g.axis === "x" ? { left: g.at * zoom, top: 0, width: 1, height: H * zoom } : { top: g.at * zoom, left: 0, height: 1, width: W * zoom }) }} />
                ))}
                {selBox && HANDLES.map((hd) => (
                  <div key={hd.k} onPointerDown={(e) => startResize(e, hd.dir)}
                    style={{ position: "absolute", left: (selBox.x + hd.cx * selBox.w) * zoom - 4, top: (selBox.y + hd.cy * selBox.h) * zoom - 4, width: 8, height: 8, background: "#fff", border: "1.5px solid #000", cursor: hd.cursor, zIndex: 10 }} />
                ))}
                {widgets.length === 0 && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 text-center pointer-events-none">
                    <p className="text-sm text-neutral-400">Leeres Display</p><p className="text-xs text-neutral-600">Links ein Feld wählen</p>
                  </div>
                )}
              </div>
            </div>
            {/* Statusleiste: Seite, Auswahl, Zoom — wie am unteren Rand eines Grafikprogramms */}
            <div className="w-full flex items-center gap-3 px-3 py-1.5 border-t-2 border-border bg-card text-[11px]">
              <div className="flex items-center gap-1">
                <Button variant="outline" size="icon-xs" disabled={layout.pages.length < 2}
                  onClick={() => setPageIdx((pageIdxRef.current - 1 + layout.pages.length) % layout.pages.length)} title="Vorherige Seite"><ChevronUp className="rotate-270" /></Button>
                <ContextMenu>
                  <ContextMenuTrigger asChild>
                    <span className="font-mono px-1.5 cursor-context-menu select-none" title="Rechtsklick für Seiten-Aktionen">
                      Seite {pageIdx + 1}/{layout.pages.length}
                    </span>
                  </ContextMenuTrigger>
                  <ContextMenuContent>{seitenMenue(pageIdx)}</ContextMenuContent>
                </ContextMenu>
                <Button variant="outline" size="icon-xs" disabled={layout.pages.length < 2}
                  onClick={() => setPageIdx((pageIdxRef.current + 1) % layout.pages.length)} title="Nächste Seite"><ChevronDown className="rotate-270" /></Button>
                <Button variant="outline" size="icon-xs" onClick={addPage} title="Seite hinzufügen"><Plus /></Button>
              </div>

              <span className="text-muted-foreground font-mono">{W} × {H}</span>

              <span className="text-muted-foreground font-mono">
                {selIds.length === 0 ? `${widgets.length} Felder`
                  : selIds.length === 1 && selected ? `${selected.type} · ${Math.round(selected.x)}, ${Math.round(selected.y)}`
                  : `${selIds.length} gewählt`}
              </span>

              {offscreen.length > 0 && (
                <button onClick={() => setSelIds(offscreen.map((w) => w.id))}
                  className="text-destructive font-mono underline cursor-pointer"
                  title="Anklicken, um die betroffenen Felder auszuwählen">{offscreen.length} außerhalb</button>
              )}

              <div className="flex-1" />

              <div className="flex items-center gap-1">
                <Button variant="outline" size="icon-xs" onClick={() => setZoom((z) => Math.max(1, z - 1))} disabled={zoom <= 1} title="Kleiner"><ZoomOut /></Button>
                <span className="font-mono w-8 text-center">{zoom}×</span>
                <Button variant="outline" size="icon-xs" onClick={() => setZoom((z) => Math.min(4, z + 1))} disabled={zoom >= 4} title="Größer"><ZoomIn /></Button>
                <Button variant="outline" size="sm" onClick={() => setZoom(2)} title="Auf 2× zurücksetzen">Fit</Button>
              </div>
            </div>
          </div>
        </main>

      </>), eigenschaften: (<>
            <div className="flex flex-col gap-5 flex-1 min-h-0">
              {!selected && (<div className="pt-10 text-center"><p className="font-head text-sm uppercase text-muted-foreground">Kein Feld</p><p className="text-xs text-muted-foreground mt-1">Klick ein Element auf dem Display</p></div>)}
              {selected && (
                <>
                  <div className="flex items-center justify-between">
                    <span className="font-head text-lg uppercase">{selIds.length > 1 ? `${selIds.length} Felder` : selected.type}</span>
                    <Button variant="outline" size="icon-sm" title={selIds.length > 1 ? `${selIds.length} Felder löschen (⌫)` : "Feld löschen (⌫)"}
                      onClick={() => { const ids = selIds; mutate((ws) => ws.filter((w) => !ids.includes(w.id))); setSelIds([]); }}><Trash2 /></Button>
                  </div>
                  <Section title="Position">
                    <div className="grid grid-cols-2 gap-2">
                      <Num label="X" v={selected.x} on={(n) => updateAlle({ x: n })} /><Num label="Y" v={selected.y} on={(n) => updateAlle({ y: n })} />
                      {!["dot", "ring", "gauge", "lamp"].includes(selected.type) && <Num label="B" v={selected.w} on={(n) => updateAlle({ w: n })} />}
                      {["bar", "box", "button", "frame", "battery", "signal", "trend", "repeat", "spark", "histo", "toggle", "slider", "stepper", "choice", "image", "qr"].includes(selected.type) && <Num label="H" v={selected.h} on={(n) => updateAlle({ h: n })} />}
                      {selected.type === "dot" && <Num label="R" v={selected.r ?? 5} on={(n) => updateAlle({ r: n })} />}
                    </div>
                  </Section>
                  {["text", "value", "bar", "button", "ring", "gauge", "lamp", "frame", "pagedots", "trend", "battery", "signal", "ticker", "repeat", "spark", "histo", "stats", "clock", "toggle", "slider", "stepper", "choice", "weather", "icon", "image", "qr"].includes(selected.type) && (
                    <Section title="Inhalt">
                      {(selected.type === "text" || selected.type === "button") && <Txt label="Text" v={selected.text ?? ""} on={(s) => updateAlle({ text: s })} />}
                      {selected.type === "value" && <div className="grid grid-cols-2 gap-2"><Num label="Wert" v={selected.value ?? 0} on={(n) => updateAlle({ value: n })} /><Txt label="Suffix" v={selected.suffix ?? ""} on={(s) => updateAlle({ suffix: s })} /></div>}
                      {selected.type === "bar" && <Num label="Füllung %" v={selected.value ?? 0} on={(n) => updateAlle({ value: n })} />}

                      {["ring", "gauge", "lamp"].includes(selected.type) && (<>
                        <Num label="Wert" v={selected.value ?? 0} on={(n) => updateAlle({ value: n })} />
                        <div className="grid grid-cols-2 gap-2">
                          <Num label="Bereich von" v={selected.min ?? 0} on={(n) => updateAlle({ min: n })} />
                          <Num label="bis" v={selected.max ?? 100} on={(n) => updateAlle({ max: n })} />
                        </div>
                      </>)}

                      {["ring", "gauge"].includes(selected.type) && (<>
                        <div className="grid grid-cols-2 gap-2">
                          <Num label="Radius" v={selected.r ?? (selected.type === "ring" ? 30 : 38)} min={8} max={120}
                            on={(n) => updateAlle({ r: Math.round(n) })} />
                          <Num label="Stärke" v={selected.thickness ?? 8} min={1} max={40}
                            on={(n) => updateAlle({ thickness: Math.round(n) })} />
                        </div>
                        <div className="flex items-center justify-between">
                          <Label className="text-[11px] text-muted-foreground">Wert in der Mitte</Label>
                          <Switch checked={selected.showValue !== false} onCheckedChange={(v) => updateAlle({ showValue: v })} />
                        </div>
                        {selected.showValue !== false && (
                          <div className="grid grid-cols-2 gap-2">
                            <Num label="Nachkommastellen" v={selected.dec ?? 0} min={0} max={3} on={(n) => updateAlle({ dec: Math.round(n) })} />
                            <Txt label="Einheit" v={selected.suffix ?? ""} on={(t) => updateAlle({ suffix: t })} />
                          </div>
                        )}
                      </>)}

                      {selected.type === "lamp" && (<>
                        <div className="grid grid-cols-2 gap-2">
                          <Num label="Lampen" v={selected.lamps ?? 3} min={1} max={8} on={(n) => updateAlle({ lamps: Math.round(n) })} />
                          <Num label="Größe" v={selected.r ?? 5} min={2} max={30} on={(n) => updateAlle({ r: Math.round(n) })} />
                        </div>
                        <Num label="Abstand" v={selected.gap ?? 6} min={0} max={40} on={(n) => updateAlle({ gap: Math.round(n) })} />
                        <div className="flex items-center justify-between">
                          <Label className="text-[11px] text-muted-foreground">Untereinander</Label>
                          <Switch checked={!!selected.vertical} onCheckedChange={(v) => updateAlle({ vertical: v })} />
                        </div>
                      </>)}

                      {selected.type === "icon" && (
                        <div className="flex flex-col gap-1">
                          <Label className="text-[11px] text-muted-foreground">Symbol</Label>
                          <Select value={selected.icon ?? "haus"} onValueChange={(v) => updateAlle({ icon: v })}>
                            <SelectTrigger data-field="Symbol"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {ICONS.map((n) => <SelectItem key={n} value={n}>{n}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                      {selected.type === "image" && (
                        <div className="flex flex-col gap-2">
                          <div className="flex items-center justify-between">
                            <Label className="text-[11px] text-muted-foreground">Bild</Label>
                            <Button variant="outline" size="sm" onClick={() => bildRef.current?.click()}><Upload />Hochladen</Button>
                          </div>
                          {bilder.length === 0 && <p className="text-[11px] text-muted-foreground">Noch kein Bild. Wird auf Feldgröße gerechnet und beim Publish übertragen.</p>}
                          {bilder.map((b) => (
                            <div key={b.id} className={`flex items-center gap-2 p-1.5 border-2 ${selected.asset === b.id ? "border-primary" : "border-border"}`}>
                              {vorschauen[b.id] && <img src={vorschauen[b.id]} alt="" width={28} height={28} style={{ imageRendering: "pixelated" }} />}
                              <button className="text-[11px] flex-1 text-left truncate cursor-pointer"
                                onClick={() => updateAlle({ asset: b.id, w: b.w, h: b.h })}>{b.name}</button>
                              <span className="text-[10px] text-muted-foreground font-mono">{b.w}×{b.h}</span>
                              <Button variant="outline" size="icon-xs" onClick={() => bildEntfernen(b.id)} title="Entfernen"><Trash2 /></Button>
                            </div>
                          ))}
                        </div>
                      )}
                      {selected.type === "qr" && (<>
                        <Txt label="Inhalt" v={selected.payload ?? ""} on={(t) => updateAlle({ payload: t })} />
                        <p className="text-[11px] text-muted-foreground">
                          Wird beim Publish als Bild erzeugt und übertragen. Für WLAN-Zugang:{" "}
                          <span className="font-mono">WIFI:T:WPA;S:Netz;P:Passwort;;</span>
                        </p>
                      </>)}
                      {selected.type === "weather" && (<>
                        <div className="flex flex-col gap-1">
                          <Label className="text-[11px] text-muted-foreground">Symbole</Label>
                          <Select value={selected.iconStyle ?? "meteocons"} onValueChange={(v) => updateAlle({ iconStyle: v as Widget["iconStyle"] })}>
                            <SelectTrigger data-field="Symbole"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="meteocons">Meteocons (Bilder)</SelectItem>
                              <SelectItem value="einfach">Einfach (gezeichnet)</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        {selected.iconStyle !== "einfach" && (
                          <div className="flex flex-col gap-1">
                            <Label className="text-[11px] text-muted-foreground">Stil</Label>
                            <Select value={selected.iconSet ?? "fill"} onValueChange={(v) => updateAlle({ iconSet: v as Widget["iconSet"] })}>
                              <SelectTrigger data-field="Stil"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="fill">Gefüllt, farbig</SelectItem>
                                <SelectItem value="line">Linien</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        )}
                        <Num label="Wettercode (WMO)" v={selected.value ?? 0} min={0} max={99}
                          hinweis={WETTER_TEXT[Math.round(selected.value ?? 0)] ?? wetterArt(Math.round(selected.value ?? 0))}
                          on={(n) => updateAlle({ value: Math.round(n) })} />
                        <div className="flex items-center justify-between">
                          <Label className="text-[11px] text-muted-foreground">Nachtvariante (Mond)</Label>
                          <Switch checked={!!selected.night} onCheckedChange={(v) => updateAlle({ night: v })} />
                        </div>
                        <p className="text-[11px] text-muted-foreground">
                          An <span className="font-mono">weathercode</span> von Open-Meteo binden — 0 klar, 3 wolkig, 61 Regen, 71 Schnee, 95 Gewitter.
                        </p>
                      </>)}
                      {selected.type === "toggle" && (
                        <div className="grid grid-cols-2 gap-2">
                          <Txt label="Wert bei Ein" v={selected.onValue ?? "1"} on={(t) => updateAlle({ onValue: t })} />
                          <Txt label="Wert bei Aus" v={selected.offValue ?? "0"} on={(t) => updateAlle({ offValue: t })} />
                        </div>
                      )}
                      {["slider", "stepper"].includes(selected.type) && (
                        <div className="grid grid-cols-2 gap-2">
                          <Num label="von" v={selected.min ?? 0} on={(n) => updateAlle({ min: n })} />
                          <Num label="bis" v={selected.max ?? 100} on={(n) => updateAlle({ max: n })} />
                        </div>
                      )}
                      {selected.type === "stepper" && (
                        <Num label="Schrittweite" v={selected.stepSize ?? 1} min={0.01} on={(n) => updateAlle({ stepSize: n })} />
                      )}
                      {selected.type === "choice" && (
                        <div className="flex flex-col gap-2">
                          <Label className="text-[11px] text-muted-foreground">Auswahlmöglichkeiten</Label>
                          {(selected.options ?? []).map((o, k) => (
                            <div key={k} className="flex gap-2 items-end">
                              <Txt label="Beschriftung" v={o.label} on={(t) => updateAlle({
                                options: (selected.options ?? []).map((x, i2) => i2 === k ? { ...x, label: t } : x) })} />
                              <Txt label="Wert" v={o.value} on={(t) => updateAlle({
                                options: (selected.options ?? []).map((x, i2) => i2 === k ? { ...x, value: t } : x) })} />
                              <Button variant="outline" size="icon-sm" title="Entfernen"
                                onClick={() => updateAlle({ options: (selected.options ?? []).filter((_, i2) => i2 !== k) })}><Trash2 /></Button>
                            </div>
                          ))}
                          <Button variant="outline" size="sm" onClick={() => updateAlle({
                            options: [...(selected.options ?? []), { label: "Neu", value: "neu" }] })}><Plus />Möglichkeit</Button>
                        </div>
                      )}
                      {["toggle", "slider", "stepper", "choice"].includes(selected.type) && (
                        <p className="text-[11px] text-muted-foreground border-2 border-border p-2">
                          Beim Antippen wird die Aktion unten ausgeführt. Im URL oder Rumpf steht{" "}
                          <span className="font-mono">{"{value}"}</span> für den neuen Wert.
                        </p>
                      )}
                      {["spark", "histo", "stats"].includes(selected.type) && (<>
                        <Num label="Messwerte behalten" v={selected.samples ?? 40} min={2} max={64}
                          hinweis="Ringpuffer auf dem Gerät" on={(n) => updateAlle({ samples: Math.round(n) })} />
                      </>)}
                      {["spark", "histo"].includes(selected.type) && (<>
                        <div className="flex items-center justify-between">
                          <Label className="text-[11px] text-muted-foreground">Bereich automatisch</Label>
                          <Switch checked={selected.autoScale !== false} onCheckedChange={(v) => updateAlle({ autoScale: v })} />
                        </div>
                        {selected.autoScale === false && (
                          <div className="grid grid-cols-2 gap-2">
                            <Num label="von" v={selected.min ?? 0} on={(n) => updateAlle({ min: n })} />
                            <Num label="bis" v={selected.max ?? 100} on={(n) => updateAlle({ max: n })} />
                          </div>
                        )}
                      </>)}
                      {selected.type === "stats" && (
                        <div className="flex flex-col gap-1">
                          <Label className="text-[11px] text-muted-foreground">Kennzahl</Label>
                          <Select value={selected.stat ?? "avg"} onValueChange={(v) => updateAlle({ stat: v as Widget["stat"] })}>
                            <SelectTrigger data-field="Kennzahl"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="avg">Durchschnitt</SelectItem>
                              <SelectItem value="min">Kleinster Wert</SelectItem>
                              <SelectItem value="max">Größter Wert</SelectItem>
                              <SelectItem value="last">Letzter Wert</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                      {selected.type === "clock" && (
                        <div className="flex flex-col gap-1">
                          <Label className="text-[11px] text-muted-foreground">Anzeige</Label>
                          <Select value={selected.format ?? "HH:mm"} onValueChange={(v) => updateAlle({ format: v })}>
                            <SelectTrigger data-field="Anzeige"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="HH:mm">14:05</SelectItem>
                              <SelectItem value="HH:mm:ss">14:05:32</SelectItem>
                              <SelectItem value="dd.MM.">26.07.</SelectItem>
                              <SelectItem value="dd.MM.yyyy">26.07.2026</SelectItem>
                              <SelectItem value="dd.MM. HH:mm">26.07. 14:05</SelectItem>
                            </SelectContent>
                          </Select>
                          <span className="text-[11px] text-muted-foreground">Zeit kommt per NTP, WLAN nötig</span>
                        </div>
                      )}
                      {["trend", "battery", "signal"].includes(selected.type) && (
                        <Num label="Wert" v={selected.value ?? 0} on={(n) => updateAlle({ value: n })} />
                      )}
                      {selected.type === "trend" && (
                        <Num label="Vergleichswert" v={selected.refValue ?? 0} on={(n) => updateAlle({ refValue: n })} />
                      )}
                      {["battery", "signal"].includes(selected.type) && (
                        <div className="grid grid-cols-2 gap-2">
                          <Num label="Bereich von" v={selected.min ?? 0} on={(n) => updateAlle({ min: n })} />
                          <Num label="bis" v={selected.max ?? 100} on={(n) => updateAlle({ max: n })} />
                        </div>
                      )}
                      {selected.type === "signal" && (
                        <Num label="Balken" v={selected.bars ?? 4} min={1} max={8} on={(n) => updateAlle({ bars: Math.round(n) })} />
                      )}
                      {selected.type === "ticker" && (<>
                        <Txt label="Text" v={selected.text ?? ""} on={(t) => updateAlle({ text: t })} />
                        <Num label="Tempo (px/s)" v={selected.speed ?? 20} min={1} max={120}
                          hinweis="läuft nur, wenn der Text breiter als das Feld ist"
                          on={(n) => updateAlle({ speed: Math.round(n) })} />
                      </>)}
                      {selected.type === "repeat" && (<>
                        <div className="grid grid-cols-2 gap-2">
                          <Num label="Versatz je Zeile" v={selected.step ?? 40} min={1} max={240}
                            on={(n) => updateAlle({ step: Math.round(n) })} />
                          <Num label="höchstens" v={selected.maxItems ?? 10} min={1} max={50}
                            on={(n) => updateAlle({ maxItems: Math.round(n) })} />
                        </div>
                        <p className="text-[11px] text-muted-foreground">
                          {selected.children?.length
                            ? `Vorlage: ${selected.children.length} Feld${selected.children.length === 1 ? "" : "er"}`
                            : `Vorlage leer \u2014 Felder ausw\u00e4hlen und \u201eZu Wiederholer machen\u201c nutzen`}
                        </p>
                      </>)}
                      {selected.type === "pagedots" && (
                        <div className="grid grid-cols-2 gap-2">
                          <Num label="Punktgröße" v={selected.r ?? 3} min={1} max={12} on={(n) => updateAlle({ r: Math.round(n) })} />
                          <Num label="Abstand" v={selected.gap ?? 6} min={0} max={30} on={(n) => updateAlle({ gap: Math.round(n) })} />
                        </div>
                      )}
                      {selected.type === "frame" && <Txt label="Titel" v={selected.title ?? ""} on={(t) => updateAlle({ title: t })} />}
                      {["text", "value", "button", "ring", "gauge", "frame", "ticker", "stats", "clock", "stepper", "choice"].includes(selected.type) && (
                        <div className="flex flex-col gap-3">
                          <div className="flex flex-col gap-3">
                            <div className="flex flex-col gap-1">
                              <Label className="text-[11px] text-muted-foreground">Schrift</Label>
                              <Select
                                value={(() => {
                                  if (!selected.vlw) return parseFontId(selected.fontFace)?.family ?? "__builtin";
                                  const id = selected.vlw.replace(/-\d+$/, "");
                                  const treffer = eigeneSchriften.find((f) => f.id === id);
                                  return treffer ? "eigen:" + treffer.name : "__builtin";
                                })()}
                                onValueChange={(wahl) => {
                                  if (wahl === "__upload") { schriftRef.current?.click(); return; }
                                  if (wahl === "__google") { googleOeffnen(); return; }
                                  if (wahl.startsWith("eigen:")) {
                                    const fam = familienAus(eigeneSchriften).find((x) => x.name === wahl.slice(6));
                                    const start = fam?.schnitte.find((g) => g.schnitt === "400") ?? fam?.schnitte[0];
                                    if (!start) return;
                                    return updateAlle({ vlw: geraeteName(start.id, fontPx(selected)), fontFace: undefined, fontScale: undefined });
                                  }
                                  if (wahl === "__builtin") return updateAlle({ fontFace: undefined, vlw: undefined });
                                  const cur = parseFontId(selected.fontFace);
                                  const st = stylesFor(wahl).includes(cur?.style ?? "") ? (cur?.style ?? "") : "";
                                  updateAlle({ fontFace: fontId(wahl, st, cur?.size ?? 12), vlw: undefined });
                                }}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="__builtin">Pixel (eingebaut)</SelectItem>
                                  {FONT_FAMILIES.map((f) => <SelectItem key={f.id} value={f.id}>{f.label}</SelectItem>)}
                                  {familienAus(eigeneSchriften).map((fam) => (
                                    <SelectItem key={fam.name} value={"eigen:" + fam.name}>{fam.name}</SelectItem>
                                  ))}
                                  <SelectItem value="__google">＋ Google-Schrift wählen…</SelectItem>
                                  <SelectItem value="__upload">＋ Datei hochladen…</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            <Seg label="Ausrichtung" v={selected.align ?? "left"} opts={[["left", "\u2039"], ["center", "\u2261"], ["right", "\u203a"]]} on={(v) => updateAlle({ align: v as Widget["align"] })} />
                          </div>
                          {selected.vlw && (() => {
                            const id = selected.vlw.replace(/-\d+$/, "");
                            const aktuell = eigeneSchriften.find((f) => f.id === id);
                            const fam = familienAus(eigeneSchriften).find((x) => x.name === aktuell?.name);
                            if (!fam || fam.schnitte.length < 2) return null;
                            return (
                              <div className="flex flex-col gap-1">
                                <Label className="text-[11px] text-muted-foreground">Schnitt</Label>
                                <Select value={aktuell?.id ?? ""}
                                  onValueChange={(neu) => updateAlle({ vlw: geraeteName(neu, fontPx(selected)) })}>
                                  <SelectTrigger data-field="Schnitt"><SelectValue /></SelectTrigger>
                                  <SelectContent>
                                    {fam.schnitte.map((g) => (
                                      <SelectItem key={g.id} value={g.id}>{schnittName(g.schnitt)}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                            );
                          })()}
                          {!selected.vlw && parseFontId(selected.fontFace) && (
                            <div className="flex flex-col gap-1">
                              <Label className="text-[11px] text-muted-foreground">Schnitt</Label>
                              <Select value={parseFontId(selected.fontFace)!.style || "__n"}
                                onValueChange={(st) => { const c = parseFontId(selected.fontFace)!; updateAlle({ fontFace: fontId(c.family, st === "__n" ? "" : st, c.size) }); }}>
                                <SelectTrigger data-field="Schnitt"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  {stylesFor(parseFontId(selected.fontFace)!.family).map((st) => (
                                    <SelectItem key={st || "__n"} value={st || "__n"}>{FONT_STYLES[st]}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          )}
                          {/* Freie Größe: Wunschhöhe eingeben, das Gerät bekommt die nächstmögliche Kombination */}
                          {(() => {
                            // Eigene Schrift: jede Größe möglich, sie wird beim Publish passend erzeugt.
                            if (selected.vlw) {
                              const id = selected.vlw.replace(/-\d+$/, "");
                              return (
                                <Num label="Schriftgröße (px)" v={fontPx(selected)} min={6} max={200}
                                  hinweis="frei wählbar"
                                  on={(n) => updateAlle({ vlw: geraeteName(id, Math.max(6, Math.min(200, Math.round(n)))) })} />
                              );
                            }
                            const c = parseFontId(selected.fontFace);
                            const stufen = fontSteps(c?.family ?? "__builtin", c?.style ?? "");
                            return (
                              <Num label="Schriftgröße (px)" v={fontPx(selected)} min={stufen[0].px} max={stufen[stufen.length - 1].px}
                                hinweis={`${stufen[0].px}\u2013${stufen[stufen.length - 1].px} px möglich`}
                                on={(n) => {
                                  const treffer = pickFont(c?.family ?? "__builtin", c?.style ?? "", n || 8);
                                  updateAlle(treffer.face
                                    ? { fontFace: treffer.face, fontScale: treffer.scale }
                                    : { fontFace: undefined, font: treffer.font, fontScale: treffer.scale });
                                }} />
                            );
                          })()}
                        </div>
                      )}
                    </Section>
                  )}
                  {BINDABLE.includes(selected.type) && (
                    <Section title="Datenbindung">
                      {!sources.length && <p className="text-[11px] text-muted-foreground">Erst links eine Quelle anlegen.</p>}
                      {sources.length > 0 && !selected.bind && (
                        <div className="flex flex-col gap-2">
                          <div className="flex gap-2">
                            {sources.map((s) => (
                              <Button key={s.id} variant="outline" size="sm" onClick={() => { updateAlle({ bind: { src: s.id, path: "" } }); setPathQuery(""); }} className="flex-1 font-mono text-xs gap-1"><Link2 />{s.id}</Button>
                            ))}
                          </div>
                          <p className="text-[10px] text-muted-foreground">Quelle wählen, dann Pfad picken.</p>
                        </div>
                      )}
                      {selected.bind && (
                        <div className="flex flex-col gap-2">
                          <div className="flex items-center gap-2 border-2 border-border bg-background h-9 px-2.5">
                            <Link2 className="size-3.5 text-muted-foreground shrink-0" />
                            <span className="text-[11px] font-mono truncate flex-1">{selected.bind.src} · {selected.bind.path || "— Pfad wählen —"}</span>
                            <Button variant="link" size="icon-xs" onClick={() => updateAlle({ bind: undefined })} title="Bindung lösen" className="text-muted-foreground hover:text-destructive"><Link2Off /></Button>
                          </div>
                          {boundLive !== undefined && <div className="text-[11px] font-mono px-1 text-muted-foreground">live: <span className="text-foreground">{String(boundLive)}</span></div>}
                          {selSrcData === undefined && <p className="text-[11px] text-destructive">Quelle liefert noch nichts.</p>}
                          {selSrcData !== undefined && (
                            <Select value={selected.bind.path || undefined} onValueChange={(p) => updateAlle({ bind: { src: selected.bind!.src, path: p } })}>
                              <SelectTrigger className="font-mono text-xs"><SelectValue placeholder="Pfad wählen…" /></SelectTrigger>
                              <SelectContent className="max-h-72">
                                {pickerPaths.map((p) => (
                                  <SelectItem key={p.path} value={p.path} className="font-mono text-[11px]">
                                    {p.path} <span className="opacity-60">= {String(p.value).slice(0, 14)}</span>
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          )}
                        </div>
                      )}
                    </Section>
                  )}
                  {BINDABLE.includes(selected.type) && selected.bind && (
                    <Section title="Umrechnung">
                      <div className="grid grid-cols-2 gap-2">
                        <Num label="× Faktor" v={selected.transform?.scale ?? 1} on={(n) => updateAlle({ transform: { ...selected.transform, scale: n } })} />
                        <Num label="+ Offset" v={selected.transform?.offset ?? 0} on={(n) => updateAlle({ transform: { ...selected.transform, offset: n } })} />
                        <Num label="Bereich von" v={selected.transform?.min ?? 0} on={(n) => updateAlle({ transform: { ...selected.transform, min: n } })} />
                        <Num label="bis" v={selected.transform?.max ?? 100} on={(n) => updateAlle({ transform: { ...selected.transform, max: n } })} />
                        <Num label="Nachkommastellen" v={selected.transform?.round ?? 0} on={(n) => updateAlle({ transform: { ...selected.transform, round: n } })} />
                        <Txt label="Einheit" v={selected.transform?.suffix ?? ""} on={(v) => updateAlle({ transform: { ...selected.transform, suffix: v } })} />
                      </div>
                      <div className="flex flex-col gap-1.5 mt-1">
                        <div className="flex items-center justify-between">
                          <Label className="text-[11px] text-muted-foreground">Wert ersetzen durch Text</Label>
                          <Button variant="outline" size="icon-xs" title="Zuordnung hinzufügen"
                            onClick={() => updateAlle({ transform: { ...selected.transform, map: [...(selected.transform?.map ?? []), { when: "", then: "" }] } })}><Plus /></Button>
                        </div>
                        {(selected.transform?.map ?? []).map((m, i) => (
                          <div key={i} className="flex gap-2 items-center">
                            <Input data-field="wenn" value={m.when} placeholder="wenn" className="font-mono text-xs"
                              onChange={(e) => updateAlle({ transform: { ...selected.transform, map: (selected.transform?.map ?? []).map((x, k) => (k === i ? { ...x, when: e.target.value } : x)) } })} />
                            <span className="text-muted-foreground text-xs shrink-0">→</span>
                            <Input data-field="dann" value={m.then} placeholder="zeige" className="font-mono text-xs"
                              onChange={(e) => updateAlle({ transform: { ...selected.transform, map: (selected.transform?.map ?? []).map((x, k) => (k === i ? { ...x, then: e.target.value } : x)) } })} />
                            <Button variant="outline" size="icon-sm" title="Entfernen"
                              onClick={() => updateAlle({ transform: { ...selected.transform, map: (selected.transform?.map ?? []).filter((_, k) => k !== i) } })}><Trash2 /></Button>
                          </div>
                        ))}
                      </div>
                    </Section>
                  )}
                  {BINDABLE.includes(selected.type) && (
                    <Section title="Schwellwerte">
                      <div className="flex flex-col gap-1.5">
                        {(selected.thresholds ?? []).map((t, i) => (
                          <div key={i} className="flex gap-2 items-end">
                            <div className="w-20"><Num label="ab" v={t.at} on={(n) => updateAlle({ thresholds: (selected.thresholds ?? []).map((x, k) => (k === i ? { ...x, at: n } : x)) })} /></div>
                            <div className="flex-1"><Col label="Farbe" v={t.color} on={(c) => updateAlle({ thresholds: (selected.thresholds ?? []).map((x, k) => (k === i ? { ...x, color: c } : x)) })} /></div>
                            <Button variant="outline" size="icon-sm" onClick={() => updateAlle({ thresholds: (selected.thresholds ?? []).filter((_, k) => k !== i) })}><Trash2 /></Button>
                          </div>
                        ))}
                        <Button variant="outline" size="sm" onClick={() => updateAlle({ thresholds: [...(selected.thresholds ?? []), { at: 80, color: "#d6473b" }] })}><Plus />Schwellwert</Button>
                      </div>
                    </Section>
                  )}
                  {["button", "toggle", "slider", "stepper", "choice"].includes(selected.type) && (
                    <Section title="Aktion">
                      <div className="flex flex-col gap-2">
                        <Select value={selected.action?.kind ?? "page"} onValueChange={(k) => updateAlle({ action: k === "page" ? { kind: "page", to: "next" } : { kind: "http", method: "POST", url: "" } })}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="page">Seite wechseln</SelectItem>
                            <SelectItem value="http">HTTP-Aufruf</SelectItem>
                          </SelectContent>
                        </Select>
                        {selected.action?.kind === "page" && (
                          <Select value={selected.action.to} onValueChange={(to) => updateAlle({ action: { kind: "page", to } })}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="next">nächste</SelectItem>
                              <SelectItem value="prev">vorherige</SelectItem>
                              {layout.pages.map((p, i) => (<SelectItem key={p.id} value={p.id}>Seite {i + 1}</SelectItem>))}
                            </SelectContent>
                          </Select>
                        )}
                        {selected.action?.kind === "http" && (
                          <>
                            <Select value={selected.action.method} onValueChange={(m) => updateAlle({ action: { ...(selected.action as Extract<Action, { kind: "http" }>), method: m as "GET" | "POST" } })}>
                              <SelectTrigger><SelectValue /></SelectTrigger>
                              <SelectContent><SelectItem value="GET">GET</SelectItem><SelectItem value="POST">POST</SelectItem></SelectContent>
                            </Select>
                            <Txt label="URL" v={selected.action.url} on={(url) => updateAlle({ action: { ...(selected.action as Extract<Action, { kind: "http" }>), url } })} />
                            {selected.action.method === "POST" && <Txt label="Body (JSON)" v={selected.action.body ?? ""} on={(body) => updateAlle({ action: { ...(selected.action as Extract<Action, { kind: "http" }>), body } })} />}
                          </>
                        )}
                      </div>
                    </Section>
                  )}
                  {["box", "button"].includes(selected.type) && (
                    <Section title="Rahmen">
                      <div className="grid grid-cols-2 gap-2">
                        <Num label="Stärke" v={selected.borderWidth ?? (selected.type === "button" ? 1 : 0)} on={(n) => updateAlle({ borderWidth: Math.max(0, n) })} />
                        <Num label="Ecken" v={selected.r ?? 0} on={(n) => updateAlle({ r: Math.max(0, n) })} />
                      </div>
                      <Col label="Rahmenfarbe" v={selected.borderColor ?? selected.color ?? "#f5f5f5"} on={(c) => updateAlle({ borderColor: c })} />
                      {selected.type === "box" && (
                        <div className="flex items-center gap-2">
                          <Button variant={selected.fill !== false ? "default" : "outline"} size="sm" onClick={() => updateAlle({ fill: true })}>Gefüllt</Button>
                          <Button variant={selected.fill === false ? "default" : "outline"} size="sm" onClick={() => updateAlle({ fill: false })}>Nur Rahmen</Button>
                        </div>
                      )}
                    </Section>
                  )}
                  <Section title="Farbe">
                    <Col label={selected.type === "button" ? "Schrift" : "Vordergrund"} v={selected.color ?? "#ffffff"} on={(s) => updateAlle({ color: s })} />
                    {selected.type === "bar" && <Col label="Track" v={selected.track ?? "#262626"} on={(s) => updateAlle({ track: s })} />}
                    {selected.type === "button" && <Col label="Fläche" v={selected.bgColor ?? "#262626"} on={(s) => updateAlle({ bgColor: s })} />}
                  </Section>
                </>
              )}
              <Section title="Display">
                <Col label="Hintergrund" v={layout.bg} on={(s) => commit({ ...layoutRef.current, bg: s })} />
                <div className="flex flex-col gap-1">
                  <Label className="text-[11px] text-muted-foreground">Gerät</Label>
                  <Select value={SIZE_PRESETS.find((p) => p.w === W && p.h === H)?.label ?? "__frei"}
                    onValueChange={(v) => { const p = SIZE_PRESETS.find((x) => x.label === v); if (p) commit({ ...layoutRef.current, w: p.w, h: p.h }); }}>
                    <SelectTrigger data-field="Gerät"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {SIZE_PRESETS.map((p) => <SelectItem key={p.label} value={p.label}>{p.label} · {p.w}×{p.h}</SelectItem>)}
                      {!SIZE_PRESETS.some((p) => p.w === W && p.h === H) && <SelectItem value="__frei">Eigene Größe · {W}×{H}</SelectItem>}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-2 pt-1">
                  <Label className="text-[11px] text-muted-foreground">Seiten automatisch wechseln</Label>
                  <div className="grid grid-cols-2 gap-2">
                    <Num label="Sekunden (0 = aus)" v={layout.rotate ?? 0} min={0} max={600}
                      on={(n) => commit({ ...layoutRef.current, rotate: Math.max(0, Math.round(n)) })} />
                    <Num label="Pause nach Tippen" v={layout.rotatePause ?? 15} min={0} max={300}
                      on={(n) => commit({ ...layoutRef.current, rotatePause: Math.max(0, Math.round(n)) })} />
                  </div>
                  {(layout.rotate ?? 0) > 0 && (
                    <div className="flex flex-col gap-2 border-2 border-border p-2">
                      <span className="text-[11px] text-muted-foreground">Seite {pageIdx + 1}</span>
                      <Num label="Eigene Verweildauer (0 = Vorgabe)" v={layout.pages[pageIdx]?.dwell ?? 0} min={0} max={600}
                        on={(n) => commit({ ...layoutRef.current, pages: layoutRef.current.pages.map((p, i) =>
                          i === pageIdxRef.current ? { ...p, dwell: Math.max(0, Math.round(n)) || undefined } : p) })} />
                      <div className="flex items-center justify-between">
                        <Label className="text-[11px] text-muted-foreground">Beim Wechseln überspringen</Label>
                        <Switch checked={!!layout.pages[pageIdx]?.skip}
                          onCheckedChange={(v) => commit({ ...layoutRef.current, pages: layoutRef.current.pages.map((p, i) =>
                            i === pageIdxRef.current ? { ...p, skip: v || undefined } : p) })} />
                      </div>
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Num label="Breite" v={W} on={(n) => commit({ ...layoutRef.current, w: Math.max(16, Math.min(1024, Math.round(n))) })} />
                  <Num label="Höhe" v={H} on={(n) => commit({ ...layoutRef.current, h: Math.max(16, Math.min(1024, Math.round(n))) })} />
                </div>
              </Section>
            </div>
      </>) }}>
        <div className="flex-1 min-h-0">
          <DockviewReact className="slab-dock" components={DOCK_COMPONENTS} rightHeaderActionsComponent={PanelActions} onReady={onDockReady} />
        </div>
      </SlotCtx.Provider>

      {/* Datenquelle bearbeiten */}
      <Dialog open={!!srcEdit} onOpenChange={(o) => !o && setSrcEdit(null)}>
        <DialogContent className="max-w-lg grid-rows-[auto_1fr_auto] min-h-0">
          {(() => {
            const s = sources.find((x) => x.id === srcEdit);
            if (!s) return null;
            const auth = s.auth ?? { kind: "none" as const };
            const setAuth = (patch: Partial<typeof auth>) => patchSource(s.id, { auth: { ...auth, ...patch } });
            return (
              <>
                <DialogHeader>
                  <DialogTitle>Datenquelle</DialogTitle>
                  <DialogDescription>JSON-API, die alle {(s.interval ?? 8000) / 1000}s abgefragt wird. Läuft über den lokalen Proxy — Zugangsdaten bleiben auf dem Server.</DialogDescription>
                </DialogHeader>
                <OverlayScrollbarsComponent defer className="max-h-[55vh]">
                  <div className="flex flex-col gap-3 pr-2">
                    <div className="grid grid-cols-3 gap-2">
                      <div className="col-span-2"><Txt label="Name" v={s.name ?? ""} on={(v) => patchSource(s.id, { name: v })} /></div>
                      <Num label="Intervall (s)" v={(s.interval ?? 8000) / 1000} on={(v) => patchSource(s.id, { interval: Math.max(1, v) * 1000 })} />
                    </div>
                    <div className="grid grid-cols-4 gap-2">
                      <div className="flex flex-col gap-1">
                        <Label className="text-[11px] text-muted-foreground">Methode</Label>
                        <Select value={s.method ?? "GET"} onValueChange={(m) => patchSource(s.id, { method: m as "GET" | "POST" })}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent><SelectItem value="GET">GET</SelectItem><SelectItem value="POST">POST</SelectItem></SelectContent>
                        </Select>
                      </div>
                      <div className="col-span-3"><Txt label="URL" v={s.url} on={(v) => patchSource(s.id, { url: v })} /></div>
                    </div>
                    {s.method === "POST" && <Txt label="Body (JSON)" v={s.body ?? ""} on={(v) => patchSource(s.id, { body: v })} />}

                    <div className="flex flex-col gap-1">
                      <Label className="text-[11px] text-muted-foreground">Authentifizierung</Label>
                      <Select value={auth.kind} onValueChange={(k) => setAuth({ kind: k as typeof auth.kind })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">keine</SelectItem>
                          <SelectItem value="bearer">Bearer-Token</SelectItem>
                          <SelectItem value="basic">Basic (Benutzer/Passwort)</SelectItem>
                          <SelectItem value="header">eigener Header</SelectItem>
                          <SelectItem value="query">Query-Parameter</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    {auth.kind === "bearer" && <Txt label="Token" v={auth.token ?? ""} on={(v) => setAuth({ token: v })} />}
                    {auth.kind === "basic" && (
                      <div className="grid grid-cols-2 gap-2">
                        <Txt label="Benutzer" v={auth.user ?? ""} on={(v) => setAuth({ user: v })} />
                        <Txt label="Passwort" v={auth.pass ?? ""} on={(v) => setAuth({ pass: v })} />
                      </div>
                    )}
                    {auth.kind === "header" && (
                      <div className="grid grid-cols-2 gap-2">
                        <Txt label="Header-Name" v={auth.headerName ?? ""} on={(v) => setAuth({ headerName: v })} />
                        <Txt label="Wert" v={auth.headerValue ?? ""} on={(v) => setAuth({ headerValue: v })} />
                      </div>
                    )}
                    {auth.kind === "query" && (
                      <div className="grid grid-cols-2 gap-2">
                        <Txt label="Parameter" v={auth.queryName ?? ""} on={(v) => setAuth({ queryName: v })} />
                        <Txt label="Wert" v={auth.queryValue ?? ""} on={(v) => setAuth({ queryValue: v })} />
                      </div>
                    )}

                    <div className="flex flex-col gap-1.5">
                      <div className="flex items-center justify-between">
                        <Label className="text-[11px] text-muted-foreground">Zusätzliche Header</Label>
                        <Button variant="outline" size="icon-xs" onClick={() => patchSource(s.id, { headers: [...(s.headers ?? []), { k: "", v: "" }] })}><Plus /></Button>
                      </div>
                      {(s.headers ?? []).map((h, i) => (
                        <div key={i} className="flex gap-2">
                          <Input value={h.k} placeholder="Name" onChange={(e) => patchSource(s.id, { headers: (s.headers ?? []).map((x, k) => (k === i ? { ...x, k: e.target.value } : x)) })} className="font-mono text-xs" />
                          <Input value={h.v} placeholder="Wert" onChange={(e) => patchSource(s.id, { headers: (s.headers ?? []).map((x, k) => (k === i ? { ...x, v: e.target.value } : x)) })} className="font-mono text-xs" />
                          <Button variant="outline" size="icon-sm" onClick={() => patchSource(s.id, { headers: (s.headers ?? []).filter((_, k) => k !== i) })}><Trash2 /></Button>
                        </div>
                      ))}
                    </div>

                    <div className="flex flex-col gap-1">
                      <Label className="text-[11px] text-muted-foreground">Antwort</Label>
                      <OverlayScrollbarsComponent defer className="border-2 border-border bg-background p-2 max-h-40">
                        {srcErr[s.id] ? <span className="text-[11px] text-destructive font-mono">{srcErr[s.id]}</span>
                          : data[s.id] !== undefined ? <pre className="text-[10px] font-mono whitespace-pre-wrap">{JSON.stringify(data[s.id], null, 2).slice(0, 1500)}</pre>
                          : <span className="text-[11px] text-muted-foreground">noch keine Daten</span>}
                      </OverlayScrollbarsComponent>
                    </div>
                  </div>
                </OverlayScrollbarsComponent>
                <DialogFooter>
                  <DialogClose asChild><Button>Fertig</Button></DialogClose>
                </DialogFooter>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>

      <input ref={bildRef} type="file" accept="image/*" className="hidden"
        onChange={(e) => { bildHochladen(e.target.files?.[0]); e.target.value = ""; }} />
      <input ref={schriftRef} type="file" accept=".ttf,.otf,font/ttf,font/otf" className="hidden"
        onChange={(e) => { schriftHochladen(e.target.files?.[0]); e.target.value = ""; }} />
      <input ref={importRef} type="file" accept="application/json" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) importTpl(f); e.target.value = ""; }} />

      {/* Geräte-Log */}
      <Dialog open={logOpen} onOpenChange={setLogOpen}>
        <DialogContent className="max-w-2xl grid-rows-[auto_1fr_auto] min-h-0">
          <DialogHeader>
            <DialogTitle>Was das Gerät meldet</DialogTitle>
            <DialogDescription>Live über USB. Tippe auf dem Display eine Taste an — hier steht dann, ob sie getroffen wurde und was passiert.</DialogDescription>
          </DialogHeader>
          <LogView text={devLog.length ? devLog.join("\n") : "— noch nichts —"} size="text-[11px]"
                   className="min-h-32 max-h-[50vh] border-2 border-border bg-background" />
          <DialogFooter>
            <Button variant="outline" onClick={() => setDevLog([])}>Leeren</Button>
            <Button variant="outline" onClick={() => navigator.clipboard.writeText(devLog.join("\n"))}><Copy />Kopieren</Button>
            <DialogClose asChild><Button>Schließen</Button></DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Layout prüfen */}
      <Dialog open={checkOpen} onOpenChange={setCheckOpen}>
        <DialogContent className="max-w-xl grid-rows-[auto_1fr_auto] min-h-0">
          <DialogHeader>
            <DialogTitle>Layout prüfen</DialogTitle>
            <DialogDescription>
              {errCount === 0 && warnCount === 0
                ? "Keine Probleme gefunden — kann aufs Gerät."
                : `${errCount} Fehler, ${warnCount} Hinweise. Fehler verhindern das Übertragen.`}
            </DialogDescription>
          </DialogHeader>
          <OverlayScrollbarsComponent defer className="max-h-[45vh]">
            <div className="flex flex-col gap-1.5 pr-2">
              {issues.length === 0 && <p className="text-sm text-muted-foreground">Alles in Ordnung.</p>}
              {issues.map((it, i) => (
                <button key={i} onClick={() => { if (it.pageIdx !== undefined) setPageIdx(it.pageIdx); if (it.widgetId) setSelIds([it.widgetId]); setCheckOpen(false); }}
                  className={`text-left flex items-start gap-2 border-2 p-2 hover:bg-accent ${it.level === "fehler" ? "border-destructive" : "border-border"}`}>
                  <Badge variant="outline" className={`shrink-0 ${it.level === "fehler" ? "text-destructive border-destructive" : ""}`}>
                    {it.level === "fehler" ? "Fehler" : "Hinweis"}
                  </Badge>
                  <span className="text-sm">{it.msg}</span>
                </button>
              ))}
            </div>
          </OverlayScrollbarsComponent>
          <DialogFooter><DialogClose asChild><Button>Schließen</Button></DialogClose></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* JSON-Ansicht (bearbeitbar) */}
      <Dialog open={jsonOpen} onOpenChange={(o) => { setJsonOpen(o); if (o) setJsonDraft(JSON.stringify(layoutRef.current, null, 2)); }}>
        <DialogContent className="max-w-2xl grid-rows-[auto_1fr_auto] min-h-0">
          <DialogHeader>
            <DialogTitle>Layout als JSON</DialogTitle>
            <DialogDescription>Genau das, was aufs Gerät gepusht wird. Änderungen hier werden übernommen.</DialogDescription>
          </DialogHeader>
          <OverlayScrollbarsComponent defer className="border-2 border-border bg-input max-h-[52vh] min-h-32">
            <Textarea value={jsonDraft} onChange={(e) => setJsonDraft(e.target.value)}
              className="font-mono text-[11px] resize-none border-0 shadow-none min-h-[52vh] overflow-hidden focus-visible:outline-none"
              spellCheck={false} />
          </OverlayScrollbarsComponent>
          <DialogFooter>
            <Button variant="outline" onClick={() => { navigator.clipboard.writeText(jsonDraft); toast.success("Kopiert"); }}><Copy />Kopieren</Button>
            <DialogClose asChild><Button variant="outline">Abbrechen</Button></DialogClose>
            <Button onClick={() => {
              try { const l = JSON.parse(jsonDraft) as Layout; if (!l.pages?.length) throw new Error("pages fehlt"); commit(l); setSelIds([]); setPageIdx(0); setJsonOpen(false); toast.success("Layout übernommen"); }
              catch (e) { toast.error("Ungültiges JSON: " + (e as Error).message); }
            }}>Übernehmen</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Tastenkürzel */}
      <Dialog open={helpOpen} onOpenChange={setHelpOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Tastenkürzel</DialogTitle></DialogHeader>
          <div className="flex flex-col gap-1.5">
            {[["\u2318Z", "Rückgängig"], ["\u2318\u21E7Z", "Wiederholen"], ["\u2318D", "Duplizieren"],
              ["\u2318C", "Kopieren"], ["\u2318V", "Einfügen"], ["\u2318A", "Alles auswählen"],
              ["\u21E7 + Klick", "Mehrfachauswahl"], ["Pfeiltasten", "1 px verschieben"],
              ["\u21E7 + Pfeil", "10 px verschieben"], ["\u232B", "Löschen"],
              ["Esc", "Auswahl aufheben"], ["?", "Diese Hilfe"]].map(([k, v]) => (
              <div key={k} className="flex items-center gap-3">
                <Badge variant="outline" className="font-mono shrink-0 min-w-24 justify-center">{k}</Badge>
                <span className="text-muted-foreground text-sm">{v}</span>
              </div>
            ))}
          </div>
          <DialogFooter><DialogClose asChild><Button>Alles klar</Button></DialogClose></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Firmware flashen */}
      <Dialog open={flashOpen} onOpenChange={(o) => { if (flashing) return; if (!o) location.reload(); else setFlashOpen(true); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Firmware flashen</DialogTitle>
            <DialogDescription>Überträgt die SLAB-Firmware aufs Display. Nötig beim ersten Mal — danach reicht Publish. Dauert ~30 s.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            {flashing && (
              <div className="flex flex-col gap-1">
                <div className="flex justify-between text-[11px] font-mono"><span>Übertragung</span><span>{flashPct}%</span></div>
                <div className="h-3 border-2 border-border bg-background"><div className="h-full bg-primary transition-all" style={{ width: `${flashPct}%` }} /></div>
              </div>
            )}
            {flashLog && (
              <LogView text={flashLog} className="border-2 border-border bg-background max-h-40" />
            )}
          </div>
          <DialogFooter>
            <DialogClose asChild><Button variant="outline" disabled={flashing}>Schließen</Button></DialogClose>
            <Button onClick={doFlash} disabled={flashing}>{flashing ? "Läuft…" : flashDone ? "Fertig — nochmal flashen" : "Jetzt flashen"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* WLAN aufs Gerät */}
      <Dialog open={wifiOpen} onOpenChange={setWifiOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>WLAN des Displays</DialogTitle>
            <DialogDescription>Wird auf dem Gerät gespeichert, damit es Datenquellen selbst abrufen kann. Nur 2,4 GHz.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <Txt label="Netzwerkname (SSID)" v={wifiSsid} on={setWifiSsid} />
            <Txt label="Passwort" v={wifiPass} on={setWifiPass} />
          </div>
          <DialogFooter>
            <DialogClose asChild><Button variant="outline">Abbrechen</Button></DialogClose>
            <Button onClick={sendWifi} disabled={!connected || !wifiSsid}>Ans Gerät senden</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Template umbenennen */}
      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Template umbenennen</DialogTitle>
            <DialogDescription>Der Dateiname unter <span className="font-mono">layouts/</span> ändert sich mit.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <Label htmlFor="tplname">Name</Label>
            <Input id="tplname" value={renameVal} autoFocus onChange={(e) => setRenameVal(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { setRenameOpen(false); doRename(renameVal); } }} className="font-mono" />
          </div>
          <DialogFooter>
            <DialogClose asChild><Button variant="outline">Abbrechen</Button></DialogClose>
            <Button onClick={() => { setRenameOpen(false); doRename(renameVal); }}>Umbenennen</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Template löschen */}
      {/* Google-Schriften: suchen und übernehmen */}
      <Dialog open={googleOffen} onOpenChange={setGoogleOffen}>
        <DialogContent className="grid-rows-[auto_auto_auto_1fr_auto] min-h-0 max-h-[85vh]">
          <DialogHeader>
            <DialogTitle>Schriften</DialogTitle>
            <DialogDescription>
              Wird beim Publish in der eingestellten Größe erzeugt und aufs Gerät übertragen — nur die Schnitte, die im Layout vorkommen.
            </DialogDescription>
          </DialogHeader>
          {familienAus(eigeneSchriften).length > 0 && (
            <div className="border-2 border-border bg-background p-2 flex flex-col gap-1">
              <span className="text-[11px] text-muted-foreground uppercase font-head">Geladen</span>
              {familienAus(eigeneSchriften).map((fam) => (
                <div key={fam.name} className="flex items-center gap-2">
                  <span className="text-sm flex-1 truncate" style={{ fontFamily: `"${cssName(fam.schnitte[0].id)}", system-ui` }}>{fam.name}</span>
                  <span className="text-[10px] text-muted-foreground font-mono">
                    {fam.schnitte.length} Schnitt{fam.schnitte.length === 1 ? "" : "e"} · {Math.round(fam.schnitte.reduce((n, g) => n + g.bytes, 0) / 1024)} KB
                  </span>
                  <Button variant="outline" size="icon-xs" onClick={() => schriftEntfernen(fam.name)} title="Schrift entfernen"><Trash2 /></Button>
                </div>
              ))}
            </div>
          )}
          <Input autoFocus placeholder="Suchen…" value={googleSuche} onChange={(e) => setGoogleSuche(e.target.value)} />
          <OverlayScrollbarsComponent defer className="border-2 border-border bg-background max-h-[46vh]">
            <div className="p-2 flex flex-col gap-1">
              {!googleAlle.length && <p className="text-xs text-muted-foreground p-2">Liste wird geladen…</p>}
              {googleAlle.length > 0 && !googleTreffer.length && <p className="text-xs text-muted-foreground p-2">Nichts gefunden.</p>}
              {googleTreffer.map((f) => (
                <div key={f.name} className="flex items-center gap-3 px-2 py-2 border-2 border-transparent hover:border-border">
                  <div className="flex-1 min-w-0">
                    <div className="text-lg leading-tight truncate" style={{ fontFamily: `"${f.name}", system-ui, sans-serif` }}>
                      {f.name} — Wert 42%
                    </div>
                    <div className="text-[10px] text-muted-foreground font-mono">{f.kategorie}</div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[10px] text-muted-foreground font-mono">
                      {f.schnitte.filter((sc) => !sc.endsWith("i")).length} Schnitte
                    </span>
                    <Button variant="outline" size="sm" disabled={!!googleLaedt} onClick={() => googleWaehlen(f)}>
                      {googleLaedt === f.name ? "lädt…" : "Holen"}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </OverlayScrollbarsComponent>
          <DialogFooter>
            <span className="text-[11px] text-muted-foreground mr-auto">{googleAlle.length} Schriften</span>
            <Button variant="outline" onClick={() => setGoogleOffen(false)}>Schließen</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Publish: Fortschritt und was wirklich passiert */}
      <Dialog open={pubOffen} onOpenChange={setPubOffen}>
        <DialogContent className="grid-rows-[auto_auto_1fr_auto] min-h-0 max-h-[70vh]">
          <DialogHeader>
            <DialogTitle>Publish</DialogTitle>
            <DialogDescription>Schriften und Layout gehen aufs Gerät. Jeder Block wird vom Gerät bestätigt.</DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-3">
            <div className="flex-1 h-3 border-2 border-border bg-background">
              <div className="h-full bg-primary transition-[width] duration-150" style={{ width: `${pubPct}%` }} />
            </div>
            <span className="font-mono text-xs w-10 text-right">{pubPct}%</span>
          </div>
          <LogView text={pubSchritte.join("\n") || "…"} size="text-[11px]"
                   className="border-2 border-border bg-background max-h-[38vh] min-h-24" />
          <DialogFooter>
            <Button variant="outline" onClick={() => setPubOffen(false)}>Schließen</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!frage} onOpenChange={(o) => !o && setFrage(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{frage?.titel}</AlertDialogTitle>
            <AlertDialogDescription>{frage?.text}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction onClick={() => { frage?.tun(); setFrage(null); }}>Löschen</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={delOpen} onOpenChange={setDelOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Template löschen?</AlertDialogTitle>
            <AlertDialogDescription>
              {"\u201e"}{tpl}{"\u201c"} wird dauerhaft aus <span className="font-mono">layouts/</span> entfernt. Das lässt sich nicht rückgängig machen.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction onClick={doDelete}>Löschen</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div className="flex flex-col gap-2"><h3 className="font-head text-xs uppercase text-muted-foreground">{title}</h3>{children}</div>
);
function Num({ label, v, on, min, max, hinweis }: { label: string; v: number; on: (n: number) => void; min?: number; max?: number; hinweis?: string }) {
  // Während des Tippens gilt der rohe Text; übernommen wird beim Verlassen oder mit Enter.
  const [roh, setRoh] = useState<string | null>(null);
  const uebernehmen = () => {
    if (roh === null) return;
    const n = Number(roh);
    setRoh(null);
    if (roh.trim() !== "" && Number.isFinite(n)) on(n);
  };
  return (
    <div className="flex flex-col gap-1">
      <Label className="text-[11px] text-muted-foreground">{label}</Label>
      <div className="flex items-center gap-2">
        <Input data-field={label} type="number" inputMode="numeric" min={min} max={max}
          value={roh ?? v}
          onChange={(e) => setRoh(e.target.value)}
          onBlur={uebernehmen}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); uebernehmen(); (e.target as HTMLInputElement).blur(); }
            if (e.key === "Escape") { setRoh(null); (e.target as HTMLInputElement).blur(); }
          }}
          className="font-mono tabular-nums" />
        {hinweis && <span className="text-[11px] text-muted-foreground whitespace-nowrap">{hinweis}</span>}
      </div>
    </div>
  );
}
const Txt = ({ label, v, on }: { label: string; v: string; on: (s: string) => void }) => (
  <div className="flex flex-col gap-1"><Label className="text-[11px] text-muted-foreground">{label}</Label>
    <Input data-field={label} value={v} onChange={(e) => on(e.target.value)} /></div>
);
const Seg = ({ label, v, opts, on }: { label: string; v: string; opts: [string, string][]; on: (s: string) => void }) => (
  <div className="flex flex-col gap-1"><Label className="text-[11px] text-muted-foreground">{label}</Label>
    <div className="flex flex-wrap gap-3">{opts.map(([val, sym]) => (
      <Button key={val} variant={v === val ? "default" : "outline"} size={sym.length > 2 ? "sm" : "icon-sm"} onClick={() => on(val)}>{sym}</Button>
    ))}</div>
  </div>
);
const Col = ({ label, v, on }: { label: string; v: string; on: (s: string) => void }) => (
  <div className="flex flex-col gap-1"><Label className="text-[11px] text-muted-foreground">{label}</Label>
    <div className="flex gap-2">
      <Input type="color" value={v} onChange={(e) => on(e.target.value)} className="w-12 p-1" />
      <Input data-field={label} value={v} onChange={(e) => on(e.target.value)} className="flex-1 font-mono" />
    </div>
  </div>
);
