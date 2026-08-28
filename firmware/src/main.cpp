// SLAB - Interpreter-Firmware (v2)
// Rendert Layout-JSON (LittleFS oder Serial-Push), pollt Datenquellen per WLAN,
// wertet Touch aus (Buttons -> Aktionen) und blättert durch Seiten.
#include <Arduino.h>
#include <TFT_eSPI.h>
#include <ArduinoJson.h>
#include <LittleFS.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include <XPT2046_Bitbang.h>
#include <Preferences.h>

#define INVERT_DISPLAY true
#define LAYOUT_PATH "/layout.json"
#define STX 0x02
#define ETX 0x03
#define TOUCH_CLK 25
#define TOUCH_CS  33
#define TOUCH_MOSI 32
#define TOUCH_MISO 39
#define TOUCH_IRQ 36
#define TOUCH_Z 700

TFT_eSPI tft = TFT_eSPI();
XPT2046_Bitbang ts(TOUCH_MOSI, TOUCH_MISO, TOUCH_CLK, TOUCH_CS);
Preferences prefs;
const int W = 320, H = 240;

String layoutJson;
JsonDocument layoutDoc;          // geparstes Layout
JsonDocument dataDoc;            // { srcId: <payload> }
int pageIdx = 0;
unsigned long lastPoll = 0;
bool pollFaellig = true;    // beim Start und nach jedem Layout sofort abrufen

JsonArrayConst pages();
int pageCount();
unsigned long letzterWechsel = 0;    // wann zuletzt automatisch umgeblaettert wurde
unsigned long letzteBeruehrung = 0;  // fuer die Pause nach einer Bedienung
/* --- Messwert-Verlauf je Feld: Ringpuffer, damit Kurven/Kennzahlen Zeit zeigen --- */
#define VERLAUF_MAX 64
#define VERLAUF_FELDER 8
struct Verlauf { char id[12]; float w[VERLAUF_MAX]; uint8_t n; uint8_t start; };
Verlauf verlaeufe[VERLAUF_FELDER];
int verlaufAnzahl = 0;

static Verlauf* verlaufFuer(const char* id, bool anlegen) {
  for (int i = 0; i < verlaufAnzahl; i++) if (!strcmp(verlaeufe[i].id, id)) return &verlaeufe[i];
  if (!anlegen || verlaufAnzahl >= VERLAUF_FELDER) return nullptr;
  Verlauf* v = &verlaeufe[verlaufAnzahl++];
  strncpy(v->id, id, sizeof(v->id) - 1); v->id[sizeof(v->id) - 1] = 0;
  v->n = 0; v->start = 0;
  return v;
}
static void verlaufSchieben(Verlauf* v, float wert, int grenze) {
  if (grenze > VERLAUF_MAX) grenze = VERLAUF_MAX; if (grenze < 2) grenze = 2;
  if (v->n < grenze) { v->w[(v->start + v->n) % VERLAUF_MAX] = wert; v->n++; }
  else { v->w[v->start] = wert; v->start = (v->start + 1) % VERLAUF_MAX; }
}
static float verlaufAt(Verlauf* v, int i) { return v->w[(v->start + i) % VERLAUF_MAX]; }

uint32_t letzteSignatur[8] = {0};   // je Quelle die letzte Antwort-Signatur
String curVlw = "";              // gerade geladene .vlw-Schrift (leer = keine)

// Touch-Kalibrierung (aus NVS)
bool calXrawX = true; int calXmin = 300, calXmax = 3800;
bool calYrawX = false; int calYmin = 300, calYmax = 3800;

const char* DEFAULT_LAYOUT = R"JSON(
{"v":1,"bg":"#171717","pages":[{"id":"p1","widgets":[
{"type":"text","x":8,"y":8,"w":300,"text":"SLAB","color":"#f5f5f5","font":4,"align":"left"},
{"type":"line","x":0,"y":38,"w":320,"color":"#333333"},
{"type":"text","x":8,"y":48,"w":300,"text":"warte auf Layout...","color":"#9a9088","font":2,"align":"left"}
]}]}
)JSON";

uint16_t hex565(const char* s) {
  if (!s || s[0] != '#') return TFT_BLACK;
  long v = strtol(s + 1, nullptr, 16);
  uint8_t r = (v >> 16) & 0xFF, g = (v >> 8) & 0xFF, b = v & 0xFF;
  return ((r & 0xF8) << 8) | ((g & 0xFC) << 3) | (b >> 3);
}
uint8_t fontOf(int f) { return (f == 1 || f == 2 || f == 4 || f == 6 || f == 7) ? f : 2; }

// Schrift setzen: echte Schrift bevorzugt, sonst eingebaute Nummer
void applyFont(JsonObjectConst wd) {
  // Eigene Schrift aus dem Dateisystem? Die kann jede Groesse und ist geglaettet.
  const char* vlw = wd["vlw"] | "";
  if (*vlw) {
    if (curVlw != vlw) {
      if (curVlw.length()) tft.unloadFont();
      if (LittleFS.exists("/" + String(vlw) + ".vlw")) {
        tft.loadFont(String(vlw), LittleFS);
        curVlw = vlw;
      } else { curVlw = ""; Serial.printf("  Schrift fehlt: %s.vlw\n", vlw); }
    }
    if (curVlw.length()) { tft.setTextSize(1); return; }   // Groesse steckt in der Datei
  } else if (curVlw.length()) {
    tft.unloadFont(); curVlw = "";
  }
  // Eingebaute Pixelschriften als Rückfall — echte Schriften kommen als .vlw aufs Gerät
  tft.setTextFont(fontOf(wd["font"] | 2));
  int sc = wd["fontScale"] | 1;            // stufenlose Groesse: Vielfaches der Basisschrift
  tft.setTextSize(sc < 1 ? 1 : (sc > 8 ? 8 : sc));
}

/* --------- Datenbindung: Pfad "a.b[0].c" im geholten JSON auflösen --------- */
JsonVariantConst resolvePath(JsonVariantConst root, const char* path) {
  JsonVariantConst cur = root;
  char buf[96]; strncpy(buf, path, sizeof(buf) - 1); buf[sizeof(buf) - 1] = 0;
  char* p = buf;
  while (*p && !cur.isNull()) {
    while (*p == '.') p++;
    if (*p == '[') {                       // Array-Index
      int idx = atoi(p + 1);
      cur = cur[idx];
      while (*p && *p != ']') p++;
      if (*p) p++;
    } else {                               // Objekt-Key
      char* start = p;
      while (*p && *p != '.' && *p != '[') p++;
      char save = *p; *p = 0;
      if (*start) cur = cur[start];
      *p = save;
    }
  }
  return cur;
}
// Gebundenen Wert holen; liefert false wenn keine Bindung/kein Wert
bool boundValue(JsonObjectConst wd, JsonVariantConst& out) {
  JsonObjectConst b = wd["bind"];
  if (b.isNull()) return false;
  const char* src = b["src"] | "";
  const char* path = b["path"] | "";
  if (!*src || !*path) return false;
  JsonVariantConst root = dataDoc[src];
  if (root.isNull()) return false;
  out = resolvePath(root, path);
  return !out.isNull();
}

// Rohwert als Text (Booleans als true/false, nicht als 0/1)
String rawText(JsonVariantConst v) {
  if (v.isNull()) return "";
  if (v.is<bool>()) return v.as<bool>() ? "true" : "false";
  if (v.is<const char*>()) return String(v.as<const char*>());
  float f = v.as<float>();
  return (f == (long)f) ? String((long)f) : String(f, 2);
}
// Wert-Zuordnung aus transform.map: liefert true, wenn ein Treffer existiert
bool mappedText(JsonObjectConst wd, JsonVariantConst raw, String& out) {
  JsonObjectConst t = wd["transform"];
  if (t.isNull()) return false;
  JsonArrayConst m = t["map"].as<JsonArrayConst>();
  if (m.isNull()) return false;
  String r = rawText(raw);
  for (JsonObjectConst e : m) {
    String w = e["when"] | "";
    if (w.equalsIgnoreCase(r)) { out = String((const char*)(e["then"] | "")); return true; }
  }
  return false;
}

// Transform anwenden (scale/offset/min-max-Normalisierung)
float transformNum(JsonObjectConst wd, float v) {
  JsonObjectConst t = wd["transform"];
  if (t.isNull()) return v;
  if (!t["scale"].isNull()) v *= t["scale"].as<float>();
  if (!t["offset"].isNull()) v += t["offset"].as<float>();
  if (!t["min"].isNull() && !t["max"].isNull()) {
    float mn = t["min"], mx = t["max"];
    if (mx != mn) v = (v - mn) / (mx - mn) * 100.0f;
  }
  return v;
}
// Schwellwertfarbe (höchster passender gewinnt), sonst Default
uint16_t colorFor(JsonObjectConst wd, float v, const char* dflt) {
  JsonArrayConst th = wd["thresholds"].as<JsonArrayConst>();
  const char* chosen = wd["color"] | dflt;
  if (!th.isNull()) {
    float best = -1e9;
    for (JsonObjectConst t : th) {
      float at = t["at"] | 0.0f;
      if (v >= at && at >= best) { best = at; chosen = t["color"] | chosen; }
    }
  }
  return hex565(chosen);
}
// Sichtbarkeitsbedingung
bool visible(JsonObjectConst wd) {
  if (wd["hidden"] | false) return false;
  JsonObjectConst c = wd["showIf"];
  if (c.isNull()) return true;
  const char* src = c["src"] | ""; const char* path = c["path"] | "";
  if (!*src || !*path) return true;
  JsonVariantConst root = dataDoc[src];
  if (root.isNull()) return true;
  JsonVariantConst cur = resolvePath(root, path);
  const char* op = c["op"] | "=";
  String a = rawText(cur);
  String b = c["value"] | "";
  if (!strcmp(op, "=")) return a.equalsIgnoreCase(b);
  if (!strcmp(op, "!=")) return !a.equalsIgnoreCase(b);
  if (!strcmp(op, ">")) return a.toFloat() > b.toFloat();
  if (!strcmp(op, "<")) return a.toFloat() < b.toFloat();
  return true;
}

/**
 * Verbindung passend zum Schema öffnen. Bei https wird TLS genutzt; das Zertifikat
 * wird nicht geprüft, weil auf dem Gerät kein Zertifikatsspeicher liegt — für
 * öffentliche Datenquellen ausreichend, für Geheimnisse nicht.
 */
static bool httpOeffnen(HTTPClient& http, const String& url, WiFiClientSecure& tls) {
  if (url.startsWith("https://")) {
    tls.setInsecure();
    tls.setTimeout(12);
    return http.begin(tls, url);
  }
  return http.begin(url);
}

/* -------- Hilfsmittel fuer die neuen Felder -------- */
static float anteilVon(JsonObjectConst wd, float v) {
  float lo = wd["min"] | 0.0f, hi = wd["max"] | 100.0f;
  if (hi == lo) return 0;
  float a = (v - lo) / (hi - lo);
  return a < 0 ? 0 : (a > 1 ? 1 : a);
}
/**
 * Flaeche, die das zuletzt gezeichnete Feld wirklich bemalt hat.
 *
 * Sie kann groesser sein als das Feld selbst: Schrift wird ab der oberen Kante
 * gesetzt und in ihrer eigenen Hoehe gezeichnet, unabhaengig davon, wie hoch das
 * Feld im Layout ist. Steht eine 48-Punkt-Zahl in einem 20 Pixel hohen Feld,
 * ragt sie weit darunter hinaus — und beim gezielten Neuzeichnen bliebe von der
 * alten Zahl der untere Teil stehen.
 */
static int malX, malY, malW, malH;

/** Die bemalte Flaeche um ein Rechteck erweitern. */
static void bemalt(int x, int y, int w, int h) {
  int x2 = malX + malW, y2 = malY + malH;
  if (x < malX) malX = x;
  if (y < malY) malY = y;
  if (x + w > x2) x2 = x + w;
  if (y + h > y2) y2 = y + h;
  malW = x2 - malX; malH = y2 - malY;
}

/**
 * Text ausgeben und die beschriebene Flaeche vermerken.
 * Wo sie liegt, haengt am eingestellten Bezugspunkt — rechtsbuendiger Text
 * waechst nach links, mittiger nach beiden Seiten.
 */
static void schreibe(const char* s, int x, int y) {
  tft.drawString(s, x, y);
  int tw = tft.textWidth(s), th = tft.fontHeight();
  int lx = x, ly = y;
  switch (tft.getTextDatum()) {
    case TR_DATUM: lx = x - tw; break;
    case TC_DATUM: lx = x - tw / 2; break;
    case ML_DATUM: ly = y - th / 2; break;
    case MC_DATUM: lx = x - tw / 2; ly = y - th / 2; break;
    case MR_DATUM: lx = x - tw;     ly = y - th / 2; break;
    case BL_DATUM: ly = y - th; break;
    case BC_DATUM: lx = x - tw / 2; ly = y - th; break;
    case BR_DATUM: lx = x - tw;     ly = y - th; break;
    default: break;                                   // TL_DATUM: Ecke ist der Bezug
  }
  bemalt(lx, ly, tw, th);
}

/* Zahl mittig in ein Feld schreiben (Ring, Tacho) */
static void zahlMittig(JsonObjectConst wd, int cx, int cy, float v, uint16_t bg) {
  char buf[24];
  JsonObjectConst tr = wd["transform"];
  int dec = tr.isNull() ? (wd["dec"] | 0) : (tr["round"] | (int)(wd["dec"] | 0));
  const char* suf = wd["suffix"] | "";
  snprintf(buf, sizeof(buf), "%.*f%s", dec, v, suf);
  applyFont(wd);
  tft.setTextColor(hex565(wd["color"] | "#f5f5f5"), bg);
  tft.setTextDatum(MC_DATUM);
  schreibe(buf, cx, cy);
}

/* Bewegte Wettersymbole: welches Einzelbild gerade dran ist, und ob ueberhaupt
   eines auf der Seite liegt, das sich bewegt. */
uint16_t animBild = 0;
bool animLaeuft = false;

void drawWidget(JsonObjectConst wd, uint16_t bg, int ox = 0, int oy = 0, JsonVariantConst kontext = JsonVariantConst());

/** Wert eines Feldes holen — im Wiederholer relativ zum aktuellen Datensatz. */
static bool wertVon(JsonObjectConst wd, JsonVariantConst kontext, JsonVariantConst& out) {
  JsonObjectConst b = wd["bind"];
  if (b.isNull()) return false;
  const char* pfad = b["path"] | "";
  if (!*pfad) return false;
  if (!kontext.isNull()) { out = resolvePath(kontext, pfad); return !out.isNull(); }
  return boundValue(wd, out);
}

void drawWidget(JsonObjectConst wd, uint16_t bg, int ox, int oy, JsonVariantConst kontext) {
  if (!visible(wd)) return;
  const char* type = wd["type"] | "";
  int x = (wd["x"] | 0) + ox, y = (wd["y"] | 0) + oy, w = wd["w"] | 0, h = wd["h"] | 0;
  malX = x; malY = y; malW = w; malH = h;
  JsonVariantConst bv; bool hasBind = wertVon(wd, kontext, bv);
  float bnum = hasBind ? transformNum(wd, bv.as<float>()) : 0.0f;

  if (!strcmp(type, "box")) {
    uint16_t c = hex565(wd["color"] | "#000000");
    int r = wd["r"] | 0; bool fill = wd["fill"] | true;
    int bwid = wd["borderWidth"] | 0;
    if (fill) { r > 0 ? tft.fillRoundRect(x, y, w, h, r, c) : tft.fillRect(x, y, w, h, c); }
    if (!fill || bwid > 0) {
      uint16_t bc = hex565(wd["borderColor"] | (const char*)(wd["color"] | "#f5f5f5"));
      int n = fill ? bwid : (bwid > 0 ? bwid : 1);
      for (int i = 0; i < n; i++)
        r > 0 ? tft.drawRoundRect(x+i, y+i, w-2*i, h-2*i, r, bc) : tft.drawRect(x+i, y+i, w-2*i, h-2*i, bc);
    }
  }
  else if (!strcmp(type, "line")) {
    uint16_t c = hex565(wd["color"] | "#333333");
    if (h > w) tft.drawFastVLine(x, y, h ? h : 1, c); else tft.drawFastHLine(x, y, w ? w : 1, c);
  }
  else if (!strcmp(type, "dot")) {
    tft.fillCircle(x, y, wd["r"] | 4, colorFor(wd, bnum, "#22c55e"));
  }
  else if (!strcmp(type, "bar")) {
    int r = wd["r"] | (h / 2);
    float val = hasBind ? bnum : (wd["value"] | 0.0f);
    if (val < 0) val = 0; if (val > 100) val = 100;
    tft.fillRoundRect(x, y, w, h, r, hex565(wd["track"] | "#262626"));
    int fw = (int)(w * val / 100.0);
    if (fw > 3) tft.fillRoundRect(x, y, fw, h, r, colorFor(wd, val, "#16a34a"));
  }
  else if (!strcmp(type, "ring")) {
    // Prozentring: Bogen von oben im Uhrzeigersinn
    int r = wd["r"] | 30, dicke = wd["thickness"] | 8;
    int cx = x + r, cy = y + r;
    float val = hasBind ? bnum : (wd["value"] | 0.0f);
    float a = anteilVon(wd, val);
    uint16_t track = hex565(wd["track"] | "#262626");
    tft.drawSmoothArc(cx, cy, r, r - dicke, 0, 360, track, bg, true);
    if (a > 0.001f)
      tft.drawSmoothArc(cx, cy, r, r - dicke, 0, (uint32_t)(360 * a), colorFor(wd, val, "#22c55e"), bg, true);
    if (wd["showValue"] | true) zahlMittig(wd, cx, cy, val, bg);   // Vorgabe an, wie im Editor
  }
  else if (!strcmp(type, "gauge")) {
    // Tacho: Halbkreis mit Zeiger
    int r = wd["r"] | 38, dicke = wd["thickness"] | 8;
    int cx = x + r, cy = y + r;
    float val = hasBind ? bnum : (wd["value"] | 0.0f);
    float a = anteilVon(wd, val);
    uint16_t track = hex565(wd["track"] | "#262626");
    tft.drawSmoothArc(cx, cy, r, r - dicke, 270, 450, track, bg, true);
    if (a > 0.001f)
      tft.drawSmoothArc(cx, cy, r, r - dicke, 270, 270 + (uint32_t)(180 * a), colorFor(wd, val, "#22c55e"), bg, true);
    float w2 = (a * 180.0f - 90.0f) * 0.017453293f;   // -90..+90 Grad im Bogenmass
    float len = r - dicke - 4;
    tft.drawWideLine(cx, cy, cx + sin(w2) * len, cy - cos(w2) * len, 3,
                     colorFor(wd, val, "#f5f5f5"), bg);
    if (wd["showValue"] | true) zahlMittig(wd, cx, cy + dicke / 2 + tft.fontHeight() / 2 + 2, val, bg);
  }
  else if (!strcmp(type, "lamp")) {
    // Ampel: mehrere Lampen, die zum Wert passende leuchtet
    int r = wd["r"] | 5, gap = wd["gap"] | 6, n = wd["lamps"] | 3;
    if (n < 1) n = 1; if (n > 8) n = 8;
    bool senk = wd["vertical"] | false;
    float val = hasBind ? bnum : (wd["value"] | 0.0f);
    int aktiv = (int)(anteilVon(wd, val) * n);
    if (aktiv >= n) aktiv = n - 1;
    uint16_t aus = hex565(wd["track"] | "#262626");
    for (int i = 0; i < n; i++) {
      int cx = senk ? x + r : x + r + i * (2 * r + gap);
      int cy = senk ? y + r + i * (2 * r + gap) : y + r;
      tft.fillSmoothCircle(cx, cy, r, i == aktiv ? colorFor(wd, val, "#22c55e") : aus, bg);
    }
  }
  else if (!strcmp(type, "repeat")) {
    // Die Vorlage einmal je Datensatz zeichnen, jeweils um "step" versetzt.
    JsonObjectConst b = wd["bind"];
    JsonVariantConst liste;
    if (!b.isNull()) {
      JsonVariantConst wurzel = dataDoc[(const char*)(b["src"] | "")];
      liste = kontext.isNull() ? resolvePath(wurzel, b["path"] | "") : resolvePath(kontext, b["path"] | "");
    }
    JsonArrayConst arr = liste.as<JsonArrayConst>();
    if (arr.isNull()) return;
    int schritt = wd["step"] | 0;
    int grenze = wd["maxItems"] | 20;
    JsonArrayConst vorlage = wd["children"].as<JsonArrayConst>();
    if (vorlage.isNull()) return;
    int i = 0;
    for (JsonVariantConst eintrag : arr) {
      if (i >= grenze) break;
      for (JsonObjectConst kind : vorlage) drawWidget(kind, bg, x, y + i * schritt, eintrag);
      i++;
    }
  }
  else if (!strcmp(type, "icon")) {
    // Symbolsatz als Vektorzeichnung — skaliert mit der Feldgröße
    const char* nm = wd["icon"] | "haus";
    int s2 = (w < h ? w : h); if (s2 < 8) s2 = 8;
    int cx = x + s2 / 2, cy = y + s2 / 2, r = s2 / 2;
    uint16_t c = colorFor(wd, hasBind ? bnum : 0.0f, "#f5f5f5");
    int d = s2 / 8; if (d < 1) d = 1;                       // Strichstärke

    if (!strcmp(nm, "haus")) {
      tft.fillTriangle(cx, y, x, cy, x + s2, cy, c);
      tft.fillRect(cx - r / 2, cy, r, r, c);
    } else if (!strcmp(nm, "wlan")) {
      for (int i = 1; i <= 3; i++) tft.drawSmoothArc(cx, y + s2 - d, r * i / 3, r * i / 3 - d, 300, 60, c, bg, true);
      tft.fillSmoothCircle(cx, y + s2 - d, d, c, bg);
    } else if (!strcmp(nm, "temperatur")) {
      tft.fillRoundRect(cx - d, y, 2 * d, s2 - 2 * d, d, c);
      tft.fillSmoothCircle(cx, y + s2 - 2 * d, 2 * d, c, bg);
    } else if (!strcmp(nm, "tropfen")) {
      tft.fillTriangle(cx, y, cx - r / 2, cy, cx + r / 2, cy, c);
      tft.fillSmoothCircle(cx, cy + r / 3, r * 2 / 3, c, bg);
    } else if (!strcmp(nm, "wind")) {
      for (int i = 0; i < 3; i++) tft.fillRect(x, cy - r / 2 + i * (r / 2), s2 - i * (s2 / 4), d, c);
    } else if (!strcmp(nm, "blitz")) {
      tft.fillTriangle(cx + r / 3, y, cx - r / 2, cy + d, cx, cy + d, c);
      tft.fillTriangle(cx - r / 3, y + s2, cx + r / 2, cy - d, cx, cy - d, c);
    } else if (!strcmp(nm, "akku")) {
      tft.drawRect(x, cy - r / 2, s2 - d * 2, r, c);
      tft.fillRect(x + s2 - d * 2, cy - r / 4, d * 2, r / 2, c);
      tft.fillRect(x + d, cy - r / 2 + d, (s2 - d * 4) * 2 / 3, r - 2 * d, c);
    } else if (!strcmp(nm, "uhr")) {
      tft.drawSmoothCircle(cx, cy, r - 1, c, bg);
      tft.drawWideLine(cx, cy, cx, cy - r / 2, d, c, bg);
      tft.drawWideLine(cx, cy, cx + r / 3, cy, d, c, bg);
    } else if (!strcmp(nm, "warnung")) {
      tft.fillTriangle(cx, y, x, y + s2, x + s2, y + s2, c);
      tft.fillRect(cx - d / 2, cy - r / 4, d, r / 2, bg);
      tft.fillRect(cx - d / 2, cy + r / 2, d, d, bg);
    } else if (!strcmp(nm, "haken")) {
      tft.drawWideLine(x + d, cy, cx - d, y + s2 - d * 2, d * 1.5f, c, bg);
      tft.drawWideLine(cx - d, y + s2 - d * 2, x + s2 - d, y + d, d * 1.5f, c, bg);
    } else if (!strcmp(nm, "kreuz")) {
      tft.drawWideLine(x + d, y + d, x + s2 - d, y + s2 - d, d * 1.5f, c, bg);
      tft.drawWideLine(x + s2 - d, y + d, x + d, y + s2 - d, d * 1.5f, c, bg);
    } else if (!strcmp(nm, "pfeil-oben")) {
      tft.fillTriangle(cx, y, cx - r / 2, cy, cx + r / 2, cy, c);
      tft.fillRect(cx - d, cy, 2 * d, r, c);
    } else if (!strcmp(nm, "pfeil-unten")) {
      tft.fillTriangle(cx, y + s2, cx - r / 2, cy, cx + r / 2, cy, c);
      tft.fillRect(cx - d, y, 2 * d, r, c);
    } else if (!strcmp(nm, "person")) {
      tft.fillSmoothCircle(cx, y + r / 2, r / 3, c, bg);
      tft.fillRoundRect(cx - r / 2, cy + d, r, r - d, d, c);
    } else if (!strcmp(nm, "server")) {
      for (int i = 0; i < 3; i++) {
        int by = y + i * (s2 / 3);
        tft.drawRect(x, by, s2, s2 / 3 - 1, c);
        tft.fillRect(x + d, by + s2 / 9, d, d, c);
      }
    } else if (!strcmp(nm, "glocke")) {
      tft.fillRoundRect(cx - r / 2, y + d, r, s2 - 3 * d, r / 2, c);
      tft.fillRect(x, y + s2 - 3 * d, s2, d, c);
      tft.fillSmoothCircle(cx, y + s2 - d, d, c, bg);
    }
  }
  else if (!strcmp(type, "weather") && strcmp(wd["iconStyle"] | "meteocons", "einfach")) {
    // Echtes Symbolbild: der Builder legt je Zustand eine Datei ab
    int code = (int)(hasBind ? bnum : (wd["value"] | 0.0f));
    int s2 = (w < h ? w : h); if (s2 < 12) s2 = 12;
    bool nacht = wd["night"] | false;
    const char* t = nacht ? "night" : "day";
    char name[48];
    if (code == 0 || code == 1) snprintf(name, sizeof(name), "clear-%s", t);
    else if (code == 2)         snprintf(name, sizeof(name), "partly-cloudy-%s", t);
    else if (code == 3)         snprintf(name, sizeof(name), "overcast");
    else if (code == 45)        snprintf(name, sizeof(name), "fog-%s", t);
    else if (code == 48)        snprintf(name, sizeof(name), "fog");
    else if (code >= 51 && code <= 55) snprintf(name, sizeof(name), "drizzle");
    else if (code == 56 || code == 57 || code == 66 || code == 67) snprintf(name, sizeof(name), "sleet");
    else if (code >= 61 && code <= 65) snprintf(name, sizeof(name), "rain");
    else if (code >= 71 && code <= 75) snprintf(name, sizeof(name), "snow");
    else if (code == 77)        snprintf(name, sizeof(name), "snowflake");
    else if (code >= 80 && code <= 82) snprintf(name, sizeof(name), "partly-cloudy-%s-rain", t);
    else if (code == 85 || code == 86) snprintf(name, sizeof(name), "partly-cloudy-%s-snow", t);
    else if (code == 95)        snprintf(name, sizeof(name), "thunderstorms-%s", t);
    else if (code == 96 || code == 99) snprintf(name, sizeof(name), "thunderstorms-%s-rain", t);
    else                        snprintf(name, sizeof(name), "cloudy");

    String pfad = "/wi-" + String(name) + "-" + String(s2) + ".565";
    if (!LittleFS.exists(pfad)) { tft.drawRect(x, y, s2, s2, hex565("#3a3a3a")); return; }
    fs::File f = LittleFS.open(pfad, "r");
    if (!f) return;
    uint16_t bw = 0, bh = 0;
    f.read((uint8_t*)&bw, 2); f.read((uint8_t*)&bh, 2);
    if (bw && bh && bw <= 480 && bh <= 480) {
      // Bewegte Symbole liegen als Folge von Einzelbildern in einer Datei.
      // Wie viele es sind, sagt die Dateigroesse; bei einem bleibt es stehen.
      uint32_t proBild = (uint32_t)bw * bh * 2;
      uint16_t anzahl = proBild ? (uint16_t)((f.size() - 4) / proBild) : 1;
      if (anzahl < 1) anzahl = 1;
      if (anzahl > 1) f.seek(4 + (uint32_t)(animBild % anzahl) * proBild);
      uint16_t* zeile = (uint16_t*)malloc(bw * 2);
      if (zeile) {
        tft.setSwapBytes(true);      // Datei liegt als 16-Bit-Werte vor, das Display will das hoehere Byte zuerst
        tft.startWrite();
        for (uint16_t zy = 0; zy < bh; zy++) { f.read((uint8_t*)zeile, bw * 2); tft.pushImage(x, y + zy, bw, 1, zeile); }
        tft.endWrite();
        tft.setSwapBytes(false);
        free(zeile);
      }
      if (anzahl > 1) animLaeuft = true;   // dieses Bild bewegt sich: weiterschalten
    }
    f.close();
  }
  else if (!strcmp(type, "image") || !strcmp(type, "qr")) {
    // Rohbild in RGB565 aus dem Dateisystem — der Builder rechnet um, das Geraet zeichnet nur
    String nm = !strcmp(type, "qr") ? String("qr-") + (const char*)(wd["id"] | "") : String((const char*)(wd["asset"] | ""));
    if (!nm.length()) return;
    String pfad = "/" + nm + ".565";
    if (!LittleFS.exists(pfad)) {
      tft.drawRect(x, y, w, h, hex565("#3a3a3a"));
      return;
    }
    fs::File f = LittleFS.open(pfad, "r");
    if (!f) return;
    uint16_t bw = 0, bh = 0;
    f.read((uint8_t*)&bw, 2); f.read((uint8_t*)&bh, 2);      // Kopf: Breite, Hoehe
    if (!bw || !bh || bw > 480 || bh > 480) { f.close(); return; }
    uint16_t* zeile = (uint16_t*)malloc(bw * 2);
    if (!zeile) { f.close(); return; }
    tft.setSwapBytes(true);          // wie beim Wettersymbol: hoeheres Byte zuerst aufs Display
    tft.startWrite();
    for (uint16_t zy = 0; zy < bh; zy++) {
      f.read((uint8_t*)zeile, bw * 2);
      tft.pushImage(x, y + zy, bw, 1, zeile);
    }
    tft.endWrite();
    tft.setSwapBytes(false);
    free(zeile);
    f.close();
  }
  else if (!strcmp(type, "weather")) {
    // Wettersymbol als Vektorzeichnung — WMO-Code rein, Bild raus
    int code = (int)(hasBind ? bnum : (wd["value"] | 0.0f));
    int s2 = (w < h ? w : h); if (s2 < 12) s2 = 12;
    int cx = x + s2 / 2, cy = y + s2 / 2;
    uint16_t vorn = hex565(wd["color"] | "#f5f5f5");
    uint16_t zweit = hex565(wd["track"] | "#9a9088");
    bool nacht = wd["night"] | false;

    auto sonne = [&](int mx, int my, int r) {
      if (nacht) {                                   // Mond: Kreis mit Bissen
        tft.fillSmoothCircle(mx, my, r, vorn, bg);
        tft.fillSmoothCircle(mx + r / 2, my - r / 3, r, bg, bg);
      } else {
        tft.fillSmoothCircle(mx, my, r * 2 / 3, vorn, bg);
        for (int i = 0; i < 8; i++) {
          float a = i * 0.7853982f;
          tft.drawWideLine(mx + cos(a) * r, my + sin(a) * r,
                           mx + cos(a) * (r + r / 2), my + sin(a) * (r + r / 2), 2, vorn, bg);
        }
      }
    };
    auto wolke = [&](int mx, int my, int b, uint16_t c) {
      int r = b / 4;
      tft.fillSmoothCircle(mx - b / 4, my, r, c, bg);
      tft.fillSmoothCircle(mx + b / 4, my, r, c, bg);
      tft.fillSmoothCircle(mx, my - r / 2, r + r / 3, c, bg);
      tft.fillRect(mx - b / 4 - r, my, b / 2 + 2 * r, r, c);
    };
    auto tropfen = [&](int mx, int my, int b, int n, uint16_t c) {
      for (int i = 0; i < n; i++) {
        int tx = mx - b / 3 + i * (b / (n > 1 ? n - 1 : 1)) * 2 / 3;
        tft.drawWideLine(tx, my, tx - 2, my + s2 / 5, 2, c, bg);
      }
    };

    switch (code == 0 ? 0 : code <= 2 ? 1 : code == 3 ? 3 : (code == 45 || code == 48) ? 45
            : (code >= 51 && code <= 67) || (code >= 80 && code <= 82) ? 61
            : (code >= 71 && code <= 77) || code == 85 || code == 86 ? 71
            : code >= 95 ? 95 : 3) {
      case 0:  sonne(cx, cy, s2 / 3); break;
      case 1:  sonne(cx - s2 / 6, cy - s2 / 6, s2 / 5); wolke(cx + s2 / 8, cy + s2 / 8, s2 * 2 / 3, zweit); break;
      case 3:  wolke(cx, cy, s2 * 3 / 4, vorn); break;
      case 45: for (int i = 0; i < 4; i++) tft.fillRect(cx - s2 / 3, cy - s2 / 4 + i * (s2 / 6), s2 * 2 / 3, 2, vorn); break;
      case 61: wolke(cx, cy - s2 / 6, s2 * 3 / 4, vorn); tropfen(cx, cy + s2 / 5, s2 * 2 / 3, 3, hex565("#38bdf8")); break;
      case 71: wolke(cx, cy - s2 / 6, s2 * 3 / 4, vorn);
               for (int i = 0; i < 3; i++) tft.fillSmoothCircle(cx - s2 / 4 + i * (s2 / 4), cy + s2 / 4, 2, vorn, bg); break;
      case 95: wolke(cx, cy - s2 / 6, s2 * 3 / 4, zweit);
               tft.fillTriangle(cx - 2, cy + s2 / 8, cx + s2 / 8, cy + s2 / 8, cx - s2 / 12, cy + s2 / 3, hex565("#fbbf24")); break;
    }
  }
  else if (!strcmp(type, "toggle")) {
    // Schalter: Zustand kommt aus der Bindung, Antippen sendet die Aktion
    float val = hasBind ? bnum : (wd["value"] | 0.0f);
    bool ein = val > 0.5f;
    int r = wd["r"] | (h / 2);
    tft.fillRoundRect(x, y, w, h, r, ein ? colorFor(wd, val, "#22c55e") : hex565(wd["track"] | "#3a3a3a"));
    int kr = h / 2 - 3; if (kr < 2) kr = 2;
    int kx = ein ? x + w - h / 2 : x + h / 2;
    tft.fillSmoothCircle(kx, y + h / 2, kr, hex565(wd["bgColor"] | "#f5f5f5"), ein ? colorFor(wd, val, "#22c55e") : hex565(wd["track"] | "#3a3a3a"));
  }
  else if (!strcmp(type, "slider")) {
    // Regler: Schiene, Füllung, Griff
    float val = hasBind ? bnum : (wd["value"] | 0.0f);
    float a = anteilVon(wd, val);
    int r = wd["r"] | (h / 3);
    int sh = h / 3; if (sh < 3) sh = 3;
    int sy = y + (h - sh) / 2;
    tft.fillRoundRect(x, sy, w, sh, sh / 2, hex565(wd["track"] | "#262626"));
    int fw = (int)(w * a);
    if (fw > 2) tft.fillRoundRect(x, sy, fw, sh, sh / 2, colorFor(wd, val, "#22c55e"));
    int gr = h / 2 - 1; if (gr < 3) gr = 3;
    tft.fillSmoothCircle(x + fw, y + h / 2, gr, hex565(wd["color"] | "#22c55e"), bg);
    (void)r;
  }
  else if (!strcmp(type, "stepper")) {
    // Zähler mit Minus und Plus
    float val = hasBind ? bnum : (wd["value"] | 0.0f);
    int r = wd["r"] | 4, bwid = wd["borderWidth"] | 1;
    uint16_t rahmen = hex565(wd["borderColor"] | "#3a3a3a");
    tft.fillRoundRect(x, y, w, h, r, hex565(wd["bgColor"] | "#262626"));
    for (int i = 0; i < bwid; i++) tft.drawRoundRect(x+i, y+i, w-2*i, h-2*i, r, rahmen);
    // Die Tastenfelder sind quadratisch, duerfen aber hoechstens ein Drittel der
    // Breite einnehmen — sonst ueberlappen sie sich in der Mitte und die
    // Trennlinien tauschen die Seiten.
    int seite = h < w / 3 ? h : w / 3;
    tft.drawFastVLine(x + seite, y + 2, h - 4, rahmen);
    tft.drawFastVLine(x + w - seite, y + 2, h - 4, rahmen);
    uint16_t fg = hex565(wd["color"] | "#f5f5f5");
    int zl = seite / 3; if (zl < 3) zl = 3;      // Laenge der Striche, mit dem Feld wachsend
    int zd = zl / 5;    if (zd < 2) zd = 2;      // ihre Dicke
    tft.fillRect(x + seite / 2 - zl / 2, y + h / 2 - zd / 2, zl, zd, fg);            // Minus
    tft.fillRect(x + w - seite / 2 - zl / 2, y + h / 2 - zd / 2, zl, zd, fg);        // Plus
    tft.fillRect(x + w - seite / 2 - zd / 2, y + h / 2 - zl / 2, zd, zl, fg);
    char buf[16];
    JsonObjectConst tr = wd["transform"];
    int dec = tr.isNull() ? (wd["dec"] | 0) : (tr["round"] | (int)(wd["dec"] | 0));
    snprintf(buf, sizeof(buf), "%.*f%s", dec, val, (const char*)(wd["suffix"] | ""));
    applyFont(wd);
    tft.setTextColor(fg, hex565(wd["bgColor"] | "#262626"));
    tft.setTextDatum(MC_DATUM);
    schreibe(buf, x + w / 2, y + h / 2);
  }
  else if (!strcmp(type, "choice")) {
    // Auswahlgruppe: der zum Wert passende Eintrag ist hervorgehoben
    JsonArrayConst opts = wd["options"].as<JsonArrayConst>();
    int n = opts.isNull() ? 0 : opts.size();
    if (!n) return;
    String istWert = hasBind ? rawText(bv) : String((const char*)(wd["text"] | ""));
    int r = wd["r"] | 4, bwid = wd["borderWidth"] | 1;
    uint16_t rahmen = hex565(wd["borderColor"] | "#3a3a3a");
    uint16_t hg = hex565(wd["bgColor"] | "#262626");
    uint16_t fg = hex565(wd["color"] | "#f5f5f5");
    int bw = w / n;
    applyFont(wd);
    int i = 0;
    for (JsonObjectConst o : opts) {
      int bx = x + i * bw;
      bool aktiv = istWert == String((const char*)(o["value"] | ""));
      tft.fillRoundRect(bx, y, bw, h, r, aktiv ? fg : hg);
      for (int k = 0; k < bwid; k++) tft.drawRoundRect(bx+k, y+k, bw-2*k, h-2*k, r, rahmen);
      tft.setTextColor(aktiv ? hg : fg, aktiv ? fg : hg);
      tft.setTextDatum(MC_DATUM);
      schreibe((const char*)(o["label"] | ""), bx + bw / 2, y + h / 2);
      i++;
    }
  }
  else if (!strcmp(type, "spark") || !strcmp(type, "histo") || !strcmp(type, "stats")) {
    // Alle drei leben vom Verlauf desselben Feldes
    const char* fid = wd["id"] | "";
    Verlauf* v = verlaufFuer(fid, true);
    if (!v) return;
    float jetzt = hasBind ? bnum : (wd["value"] | 0.0f);
    verlaufSchieben(v, jetzt, wd["samples"] | 40);

    if (!strcmp(type, "stats")) {
      // Kennzahl über den Verlauf
      float mi = v->w[v->start], ma = mi, su = 0;
      for (int i = 0; i < v->n; i++) { float t = verlaufAt(v, i); if (t < mi) mi = t; if (t > ma) ma = t; su += t; }
      const char* welche = wd["stat"] | "avg";
      float erg = !strcmp(welche, "min") ? mi : !strcmp(welche, "max") ? ma
                : !strcmp(welche, "last") ? verlaufAt(v, v->n - 1) : (v->n ? su / v->n : 0);
      char buf[24];
      JsonObjectConst tr = wd["transform"];
      int dec = tr.isNull() ? (wd["dec"] | 0) : (tr["round"] | (int)(wd["dec"] | 0));
      snprintf(buf, sizeof(buf), "%.*f%s", dec, erg, (const char*)(wd["suffix"] | ""));
      applyFont(wd);
      tft.setTextColor(colorFor(wd, erg, "#f5f5f5"), bg);
      const char* al = wd["align"] | "left";
      tft.setTextDatum(al[0] == 'r' ? TR_DATUM : al[0] == 'c' ? TC_DATUM : TL_DATUM);
      schreibe(buf, al[0] == 'r' ? x + w : al[0] == 'c' ? x + w / 2 : x, y);
      return;
    }

    // Bereich bestimmen: automatisch aus den Werten oder fest über min/max
    float lo = wd["min"] | 0.0f, hi = wd["max"] | 100.0f;
    if (wd["autoScale"] | true) {
      lo = verlaufAt(v, 0); hi = lo;
      for (int i = 0; i < v->n; i++) { float t = verlaufAt(v, i); if (t < lo) lo = t; if (t > hi) hi = t; }
      if (hi - lo < 0.001f) { hi = lo + 1; }
    }
    uint16_t linie = colorFor(wd, jetzt, "#22c55e");
    uint16_t grund = hex565(wd["track"] | "#262626");
    tft.drawFastHLine(x, y + h - 1, w, grund);
    if (v->n < 2) return;

    auto yFuer = [&](float wert) {
      float a = (wert - lo) / (hi - lo); if (a < 0) a = 0; if (a > 1) a = 1;
      return y + h - 1 - (int)(a * (h - 2));
    };
    if (!strcmp(type, "histo")) {
      int bw = w / v->n; if (bw < 1) bw = 1;
      for (int i = 0; i < v->n; i++) {
        int bx = x + i * bw, by = yFuer(verlaufAt(v, i));
        tft.fillRect(bx, by, bw > 1 ? bw - 1 : 1, y + h - by, linie);
      }
    } else {
      for (int i = 1; i < v->n; i++) {
        int x0 = x + (i - 1) * (w - 1) / (v->n - 1), x1 = x + i * (w - 1) / (v->n - 1);
        tft.drawLine(x0, yFuer(verlaufAt(v, i - 1)), x1, yFuer(verlaufAt(v, i)), linie);
      }
    }
  }
  else if (!strcmp(type, "clock")) {
    // Zeit vom NTP-Server; ohne Zeit bleibt das Feld leer statt Unsinn zu zeigen
    struct tm t;
    applyFont(wd);
    tft.setTextColor(hex565(wd["color"] | "#f5f5f5"), bg);
    const char* al = wd["align"] | "left";
    tft.setTextDatum(al[0] == 'r' ? TR_DATUM : al[0] == 'c' ? TC_DATUM : TL_DATUM);
    int tx = al[0] == 'r' ? x + w : al[0] == 'c' ? x + w / 2 : x;
    if (!getLocalTime(&t, 5)) { schreibe("--:--", tx, y); return; }
    String f = wd["format"] | "HH:mm";
    char buf[32];
    // eigene, schlanke Ersetzung statt strftime-Format im Layout
    f.replace("HH", String(t.tm_hour < 10 ? "0" : "") + String(t.tm_hour));
    f.replace("mm", String(t.tm_min < 10 ? "0" : "") + String(t.tm_min));
    f.replace("ss", String(t.tm_sec < 10 ? "0" : "") + String(t.tm_sec));
    f.replace("dd", String(t.tm_mday < 10 ? "0" : "") + String(t.tm_mday));
    f.replace("MM", String(t.tm_mon + 1 < 10 ? "0" : "") + String(t.tm_mon + 1));
    f.replace("yyyy", String(t.tm_year + 1900));
    snprintf(buf, sizeof(buf), "%s", f.c_str());
    schreibe(buf, tx, y);
  }
  else if (!strcmp(type, "trend")) {
    // Pfeil nach oben/unten/waagerecht — je nach Vergleich mit dem Bezugswert
    float val = hasBind ? bnum : (wd["value"] | 0.0f);
    float ref = wd["refValue"] | 0.0f;
    int s2 = (w < h ? w : h); if (s2 < 6) s2 = 6;
    int cx = x + s2 / 2, cy = y + s2 / 2, a = s2 / 2 - 1;
    uint16_t rauf = hex565(wd["color"] | "#22c55e"), runter = hex565(wd["track"] | "#ef4444");
    if (val > ref + 0.001f)      tft.fillTriangle(cx, cy - a, cx - a, cy + a, cx + a, cy + a, rauf);
    else if (val < ref - 0.001f) tft.fillTriangle(cx, cy + a, cx - a, cy - a, cx + a, cy - a, runter);
    else                         tft.fillRect(cx - a, cy - 1, 2 * a, 3, hex565(wd["borderColor"] | "#9a9088"));
  }
  else if (!strcmp(type, "battery")) {
    // Gehäuse mit Pluspol, Füllung nach Wert
    float val = hasBind ? bnum : (wd["value"] | 0.0f);
    float f = anteilVon(wd, val);
    int kopf = h / 3; if (kopf < 2) kopf = 2;
    int bw = w - kopf - 1;
    uint16_t rahmen = hex565(wd["track"] | "#3a3a3a");
    tft.drawRect(x, y, bw, h, rahmen);
    tft.fillRect(x + bw + 1, y + h / 3, kopf, h - 2 * (h / 3), rahmen);
    int fw = (int)((bw - 4) * f);
    if (fw > 0) tft.fillRect(x + 2, y + 2, fw, h - 4, colorFor(wd, val, "#22c55e"));
  }
  else if (!strcmp(type, "signal")) {
    // Balken steigender Höhe, so viele aktiv wie der Wert hergibt
    float val = hasBind ? bnum : (wd["value"] | 0.0f);
    int n = wd["bars"] | 4; if (n < 1) n = 1; if (n > 8) n = 8;
    int aktiv = (int)(anteilVon(wd, val) * n + 0.5f);
    int bw = (w - (n - 1) * 2) / n; if (bw < 1) bw = 1;
    uint16_t an = colorFor(wd, val, "#22c55e"), aus = hex565(wd["track"] | "#3a3a3a");
    for (int i = 0; i < n; i++) {
      int bh = h * (i + 1) / n;
      tft.fillRect(x + i * (bw + 2), y + h - bh, bw, bh, i < aktiv ? an : aus);
    }
  }
  else if (!strcmp(type, "ticker")) {
    // Laufschrift: schiebt den Text zyklisch nach links
    applyFont(wd);
    tft.setTextColor(hex565(wd["color"] | "#f5f5f5"), bg);
    tft.setTextDatum(TL_DATUM);
    const char* txt = wd["text"] | "";
    int tw = tft.textWidth(txt);
    int hoch = tft.fontHeight();
    if (tw <= w) { schreibe(txt, x, y); }
    else {
      int tempo = wd["speed"] | 20; if (tempo < 1) tempo = 1;
      int strecke = tw + 20;
      int versatz = (int)((millis() / (1000 / tempo)) % strecke);
      // Innerhalb eines Ausschnitts zaehlen die Koordinaten ab dessen Ecke,
      // nicht ab dem Bildschirmrand — sonst landet der Text neben dem Feld.
      tft.setViewport(x, y, w, hoch);
      tft.fillRect(0, 0, w, hoch, bg);
      schreibe(txt, -versatz, 0);
      schreibe(txt, -versatz + strecke, 0);
      tft.resetViewport();
    }
  }
  else if (!strcmp(type, "pagedots")) {
    int r = wd["r"] | 3, gap = wd["gap"] | 6, n = pageCount();
    if (n < 1) n = 1;
    uint16_t an = hex565(wd["color"] | "#f5f5f5"), aus = hex565(wd["track"] | "#3a3a3a");
    for (int i = 0; i < n; i++)
      tft.fillSmoothCircle(x + r + i * (2 * r + gap), y + r, r, i == pageIdx ? an : aus, bg);
  }
  else if (!strcmp(type, "frame")) {
    // Rahmen mit Beschriftung in der oberen Kante
    int r = wd["r"] | 4, bwid = wd["borderWidth"] | 1;
    uint16_t bc = hex565(wd["borderColor"] | "#333333");
    const char* titel = wd["title"] | "";
    for (int i = 0; i < (bwid > 0 ? bwid : 1); i++)
      r > 0 ? tft.drawRoundRect(x+i, y+i, w-2*i, h-2*i, r, bc) : tft.drawRect(x+i, y+i, w-2*i, h-2*i, bc);
    if (*titel) {
      applyFont(wd);
      tft.setTextDatum(TL_DATUM);
      int tw = tft.textWidth(titel) + 6;
      tft.fillRect(x + 8, y - 1, tw, tft.fontHeight() > 2 ? 3 : 2, bg);   // Rahmen aufreissen
      tft.setTextColor(hex565(wd["color"] | "#f5f5f5"), bg);
      schreibe(titel, x + 11, y - tft.fontHeight() / 2);
    }
  }
  else if (!strcmp(type, "button")) {
    int r = wd["r"] | 4;
    tft.fillRoundRect(x, y, w, h, r, hex565(wd["bgColor"] | "#262626"));
    int bwid = wd["borderWidth"] | 1;
    if (bwid > 0) {
      uint16_t bc = hex565(wd["borderColor"] | (const char*)(wd["color"] | "#f5f5f5"));
      for (int i = 0; i < bwid; i++) tft.drawRoundRect(x+i, y+i, w-2*i, h-2*i, r, bc);
    }
    applyFont(wd);
    tft.setTextColor(hex565(wd["color"] | "#f5f5f5"), hex565(wd["bgColor"] | "#262626"));
    tft.setTextDatum(MC_DATUM);
    schreibe((const char*)(wd["text"] | ""), x + w / 2, y + h / 2);
  }
  else if (!strcmp(type, "text") || !strcmp(type, "value")) {
    float v = hasBind ? bnum : (wd["value"] | 0.0f);
    applyFont(wd);
    tft.setTextColor(colorFor(wd, v, "#f5f5f5"), bg);
    const char* a = wd["align"] | "left";
    int ax = x; uint8_t datum = TL_DATUM;
    if (a[0] == 'r') { ax = x + w; datum = TR_DATUM; }
    else if (a[0] == 'c') { ax = x + w / 2; datum = TC_DATUM; }
    tft.setTextDatum(datum);
    JsonObjectConst tr = wd["transform"];
    const char* pre = tr.isNull() ? "" : (tr["prefix"] | "");
    const char* suf = tr.isNull() ? (wd["suffix"] | "") : (tr["suffix"] | (const char*)(wd["suffix"] | ""));
    int dec = tr.isNull() ? (wd["dec"] | 0) : (tr["round"] | (int)(wd["dec"] | 0));
    char buf[96];
    if (!strcmp(type, "value")) {
      String mapped;
      if (hasBind && mappedText(wd, bv, mapped)) snprintf(buf, sizeof(buf), "%s%s%s", pre, mapped.c_str(), suf);
      else snprintf(buf, sizeof(buf), "%s%.*f%s", pre, dec, v, suf);
      schreibe(buf, ax, y);
    } else {
      if (hasBind) {
        String mapped;
        if (mappedText(wd, bv, mapped)) snprintf(buf, sizeof(buf), "%s%s%s", pre, mapped.c_str(), suf);
        else if (bv.is<const char*>()) snprintf(buf, sizeof(buf), "%s%s%s", pre, bv.as<const char*>(), suf);
        else snprintf(buf, sizeof(buf), "%s%.*f%s", pre, dec, v, suf);
        schreibe(buf, ax, y);
      } else {
        const char* s = wd["text"] | "";
        schreibe(s, ax, y);
      }
    }
  }
}

JsonArrayConst pages() { return layoutDoc["pages"].as<JsonArrayConst>(); }
int pageCount() { JsonArrayConst p = pages(); return p.isNull() ? 0 : p.size(); }

static void signaturenMerken();
static void zeichneUndMerke(JsonObjectConst wd, uint16_t bg, int idx);

void render() {
  uint16_t bg = hex565(layoutDoc["bg"] | "#000000");
  animLaeuft = false;      // setzt sich beim Zeichnen neu, falls ein bewegtes Symbol dabei ist
  tft.fillScreen(bg);
  int n = pageCount();
  Serial.printf("RENDER Seiten=%d Seite=%d bg=%s\n", n, pageIdx, (const char*)(layoutDoc["bg"] | "-"));
  if (!n) {
    // Kein Layout -> sichtbare Meldung statt schwarzem Schirm
    if (curVlw.length()) { tft.unloadFont(); curVlw = ""; }
    tft.setTextSize(1); tft.setTextFont(2);
    tft.setTextColor(TFT_WHITE, bg); tft.setTextDatum(TL_DATUM);
    tft.drawString("SLAB - kein Layout", 8, 8);
    tft.drawString("im Builder auf Publish druecken", 8, 30);
    Serial.println("  keine Seiten im Layout");
    return;
  }
  if (pageIdx >= pageCount()) pageIdx = 0;
  int i = 0;
  for (JsonObjectConst wd : pages()[pageIdx]["widgets"].as<JsonArrayConst>()) zeichneUndMerke(wd, bg, i++);
  signaturenMerken();     // ab hier weiss das Geraet, wie die Seite gerade aussieht
}

/* ---------------- Neu zeichnen, aber nur was sich geaendert hat ---------------- */

/**
 * Kennzahl ueber alles, was ein Feld anzeigt: seinen Wert und ob es sichtbar ist.
 * Bleibt sie gleich, sieht das Feld gleich aus und muss nicht neu gezeichnet werden.
 */
static uint32_t feldSignatur(JsonObjectConst wd) {
  uint32_t s = 2166136261u;
  auto misch = [&](const String& t) {
    for (size_t i = 0; i < t.length(); i++) s = (s ^ (uint8_t)t[i]) * 16777619u;
  };
  misch(String((const char*)(wd["type"] | "")));
  misch(visible(wd) ? "1" : "0");
  JsonVariantConst v;
  if (boundValue(wd, v)) { String t; serializeJson(v, t); misch(t); }
  return s;
}

#define MAX_FELDER 64
static uint32_t feldSig[MAX_FELDER];
static int feldSigAnzahl = -1;      // -1 = noch nichts gemerkt

/* Wo jedes Feld beim letzten Mal wirklich Farbe hinterlassen hat. Das Feldmass
   aus dem Layout reicht nicht: Schrift ragt darueber hinaus. */
static struct { int16_t x, y, w, h; } feldFlaeche[MAX_FELDER];

/** Ein Feld zeichnen und sich merken, wie weit es dabei reicht. */
static void zeichneUndMerke(JsonObjectConst wd, uint16_t bg, int idx) {
  drawWidget(wd, bg);
  if (idx >= 0 && idx < MAX_FELDER) feldFlaeche[idx] = { (int16_t)malX, (int16_t)malY, (int16_t)malW, (int16_t)malH };
}

/** Signaturen aller Felder der Seite festhalten — nach einem vollen Neuaufbau. */
static void signaturenMerken() {
  JsonArrayConst ws = pages()[pageIdx]["widgets"].as<JsonArrayConst>();
  int i = 0;
  for (JsonObjectConst wd : ws) { if (i >= MAX_FELDER) break; feldSig[i++] = feldSignatur(wd); }
  feldSigAnzahl = i;
}

/**
 * Nach neuen Daten nur die Felder erneuern, deren Inhalt sich geaendert hat.
 *
 * Den ganzen Schirm zu loeschen und neu aufzubauen sieht man — er flackert bei
 * jedem Abruf. Stattdessen werden die Flaechen der geaenderten Felder gesammelt,
 * nur diese geloescht und alles neu gezeichnet, was sie beruehrt. Das Letzte ist
 * noetig, weil Felder sich ueberlappen duerfen: ein Balken kann auf einer Box
 * liegen, und die muss dann mit.
 */
void aktualisiere() {
  if (!pageCount()) return;
  JsonArrayConst ws = pages()[pageIdx]["widgets"].as<JsonArrayConst>();
  int n = ws.size();
  if (feldSigAnzahl < 0 || n != feldSigAnzahl || n > MAX_FELDER) { render(); return; }

  struct { int x, y, w, h; } schmutzig[12];
  int ns = 0; bool zuViel = false;
  int i = 0;
  for (JsonObjectConst wd : ws) {
    uint32_t s = feldSignatur(wd);
    if (s != feldSig[i]) {
      feldSig[i] = s;
      if (ns >= (int)(sizeof(schmutzig) / sizeof(schmutzig[0]))) { zuViel = true; break; }
      // Was beim letzten Mal bemalt wurde, nicht was im Layout als Feldmass steht:
      // eine 48-Punkt-Zahl in einem 20 Pixel hohen Feld reicht weit darunter.
      const auto& f = feldFlaeche[i];
      schmutzig[ns++] = { f.x, f.y, f.w, f.h };
    }
    i++;
  }
  if (zuViel) { render(); return; }   // so viel geaendert: gleich alles
  if (!ns) return;

  uint16_t bg = hex565(layoutDoc["bg"] | "#000000");
  for (int k = 0; k < ns; k++) {
    if (schmutzig[k].w > 0 && schmutzig[k].h > 0)
      tft.fillRect(schmutzig[k].x, schmutzig[k].y, schmutzig[k].w, schmutzig[k].h, bg);
  }
  // Alles zeichnen, was eine der geloeschten Flaechen beruehrt — in Layout-Reihenfolge,
  // damit die Ueberdeckung stimmt.
  int j = 0;
  for (JsonObjectConst wd : ws) {
    const auto& e = feldFlaeche[j];
    for (int k = 0; k < ns; k++) {
      const auto& r = schmutzig[k];
      if (e.x < r.x + r.w && e.x + e.w > r.x && e.y < r.y + r.h && e.y + e.h > r.y) {
        zeichneUndMerke(wd, bg, j);
        break;
      }
    }
    j++;
  }
}

/* ---------------- Datenquellen pollen ---------------- */
void pollSources() {
  if (WiFi.status() != WL_CONNECTED) { Serial.println("POLL uebersprungen: kein WLAN"); return; }
  JsonArrayConst srcs = layoutDoc["sources"].as<JsonArrayConst>();
  if (srcs.isNull()) return;
  bool changed = false;
  int qi = -1;
  for (JsonObjectConst s : srcs) {
    qi++; if (qi >= 8) break;
    const char* id = s["id"] | ""; String url = s["url"] | "";
    if (!*id || !url.length()) continue;

    JsonObjectConst au = s["auth"];
    const char* akind = au.isNull() ? "none" : (au["kind"] | "none");
    if (!strcmp(akind, "query") && !au.isNull()) {
      const char* qn = au["queryName"] | ""; const char* qv = au["queryValue"] | "";
      if (*qn) url += (url.indexOf('?') >= 0 ? "&" : "?") + String(qn) + "=" + String(qv);
    }

    WiFiClientSecure tls;   // je Abfrage frisch, sonst meldet der Socket "Bad file number"
    HTTPClient http; if (!httpOeffnen(http, url, tls)) { Serial.println("  Verbindung nicht moeglich"); continue; }
    http.setTimeout(12000);
    if (!au.isNull()) {
      if (!strcmp(akind, "bearer")) http.addHeader("Authorization", String("Bearer ") + (const char*)(au["token"] | ""));
      else if (!strcmp(akind, "basic")) http.setAuthorization((const char*)(au["user"] | ""), (const char*)(au["pass"] | ""));
      else if (!strcmp(akind, "header")) { const char* hn = au["headerName"] | ""; if (*hn) http.addHeader(hn, (const char*)(au["headerValue"] | "")); }
    }
    for (JsonObjectConst h : s["headers"].as<JsonArrayConst>()) {
      const char* k = h["k"] | ""; if (*k) http.addHeader(k, (const char*)(h["v"] | ""));
    }

    Serial.printf("POLL %s -> %.60s\n", id, url.c_str());
    int code;
    const char* method = s["method"] | "GET";
    if (!strcmp(method, "POST")) { http.addHeader("Content-Type", "application/json"); code = http.POST((const char*)(s["body"] | "")); }
    else code = http.GET();

    if (code != 200) Serial.printf("POLL %s: HTTP %d\n", id, code);
    if (code == 200) {
      String antwort = http.getString();
      Serial.printf("POLL %s: %u Bytes\n", id, (unsigned)antwort.length());
      // Gleiche Daten -> nicht neu zeichnen. Sonst baut sich der Schirm sinnlos neu auf.
      uint32_t sig = 2166136261u;
      for (size_t k = 0; k < antwort.length(); k++) sig = (sig ^ (uint8_t)antwort[k]) * 16777619u;
      JsonDocument tmp;
      DeserializationError derr = deserializeJson(tmp, antwort);
      if (derr) Serial.printf("POLL %s: JSON-Fehler %s\n", id, derr.c_str());
      else {
        dataDoc[id] = tmp;
        if (sig != letzteSignatur[qi]) { letzteSignatur[qi] = sig; changed = true; Serial.printf("POLL %s: neue Daten\n", id); }
        else Serial.printf("POLL %s: unveraendert\n", id);
      }
    }
    http.end();
  }
  if (changed) aktualisiere();
}

/**
 * Nur Felder eines bestimmten Typs neu zeichnen — für Uhr und Laufschrift,
 * die sich von selbst ändern. Der Rest des Bildes bleibt stehen.
 */
void zeichneTyp(const char* typ) {
  if (!pageCount()) return;
  uint16_t bg = hex565(layoutDoc["bg"] | "#000000");
  int i = 0;
  for (JsonObjectConst wd : pages()[pageIdx]["widgets"].as<JsonArrayConst>()) {
    if (strcmp(wd["type"] | "", typ) || !visible(wd)) { i++; continue; }
    // Wettersymbole decken ihre Flaeche vollstaendig ab. Sie vorher zu loeschen
    // wuerde bei jedem Einzelbild ein Flackern erzeugen.
    if (strcmp(typ, "weather") && i < MAX_FELDER) {
      const auto& f = feldFlaeche[i];      // was zuletzt bemalt wurde, nicht das Feldmass
      if (f.w > 0 && f.h > 0) tft.fillRect(f.x, f.y, f.w, f.h, bg);
    }
    zeichneUndMerke(wd, bg, i);
    i++;
  }
}

/* ---------------- Aktionen ---------------- */
void runAction(JsonObjectConst act, const String& wert = String()) {
  const char* kind = act["kind"] | "";
  if (!strcmp(kind, "page")) {
    const char* to = act["to"] | "next";
    int n = pageCount();
    Serial.printf("  Seitenwechsel \"%s\": %d Seiten vorhanden\n", to, n);
    if (n < 2) { Serial.println("  -> nur eine Seite, nichts zu wechseln"); return; }
    if (!strcmp(to, "next")) pageIdx = (pageIdx + 1) % n;
    else if (!strcmp(to, "prev")) pageIdx = (pageIdx - 1 + n) % n;
    else { for (int i = 0; i < n; i++) if (!strcmp(pages()[i]["id"] | "", to)) { pageIdx = i; break; } }
    render();
  } else if (!strcmp(kind, "http")) {
    if (WiFi.status() != WL_CONNECTED) { Serial.println("  -> kein WLAN"); return; }
    String url = act["url"] | ""; if (!url.length()) { Serial.println("  -> keine URL"); return; }
    if (wert.length()) url.replace("{value}", wert);          // Platzhalter fuer Bedienfelder
    Serial.printf("  -> rufe auf: %s\n", url.c_str());
    WiFiClientSecure tls;
    HTTPClient http; if (!httpOeffnen(http, url, tls)) { Serial.println("  -> Verbindung nicht moeglich"); return; }
    http.setTimeout(12000);
    const char* m = act["method"] | "GET";
    if (!strcmp(m, "POST")) {
      String rumpf = act["body"] | "";
      if (wert.length()) rumpf.replace("{value}", wert);
      http.addHeader("Content-Type", "application/json"); http.POST(rumpf);
    }
    else http.GET();
    Serial.println("  -> Aufruf abgesetzt");
    http.end();
  }
}

/* ---------------- Touch ---------------- */
bool pressedRaw(TouchPoint& p);
void mapTouch(const TouchPoint& p, int& sx, int& sy) {
  int rx = calXrawX ? p.xRaw : p.yRaw, ry = calYrawX ? p.xRaw : p.yRaw;
  sx = constrain(map(rx, calXmin, calXmax, 0, W), 0, W);
  sy = constrain(map(ry, calYmin, calYmax, 0, H), 0, H);
}
void handleTouch() {
  // WICHTIG: erst messen, dann IRQ pruefen. Der XPT2046 haelt PENIRQ waehrend
  // der Wandlung hoch — wer den Pin vorher liest, verpasst jeden Druck.
  TouchPoint p;
  if (!pressedRaw(p)) return;
  letzteBeruehrung = millis();
  int sx, sy; mapTouch(p, sx, sy);
  Serial.printf("TOUCH roh=%d,%d z=%d -> %d,%d (Seite %d)\n", p.xRaw, p.yRaw, p.zRaw, sx, sy, pageIdx);
  if (!pageCount()) { Serial.println("  keine Seite"); return; }
  int buttons = 0;
  for (JsonObjectConst wd : pages()[pageIdx]["widgets"].as<JsonArrayConst>()) {
    const char* wtyp = wd["type"] | "";
    bool bedienbar = !strcmp(wtyp, "button") || !strcmp(wtyp, "toggle") || !strcmp(wtyp, "slider")
                  || !strcmp(wtyp, "stepper") || !strcmp(wtyp, "choice");
    if (!bedienbar) continue;
    buttons++;
    bool vis = visible(wd);
    int x = wd["x"] | 0, y = wd["y"] | 0, w = wd["w"] | 0, h = wd["h"] | 0;
    bool hit = (sx >= x && sx <= x + w && sy >= y && sy <= y + h);
    Serial.printf("  Taste \"%s\" %d,%d %dx%d sichtbar=%d treffer=%d\n",
                  (const char*)(wd["text"] | ""), x, y, w, h, vis, hit);
    if (!vis || !hit) continue;
    JsonObjectConst act = wd["action"];
    // Bedienfelder bestimmen erst ihren neuen Wert, dann wird die Aktion damit gerufen
    String neuerWert;
    if (!strcmp(wtyp, "toggle")) {
      JsonVariantConst cur; bool hat = boundValue(wd, cur);
      float ist = hat ? cur.as<float>() : (wd["value"] | 0.0f);
      neuerWert = (ist > 0.5f) ? String((const char*)(wd["offValue"] | "0")) : String((const char*)(wd["onValue"] | "1"));
    } else if (!strcmp(wtyp, "slider")) {
      float lo = wd["min"] | 0.0f, hi = wd["max"] | 100.0f;
      float a = (float)(sx - x) / (float)(w > 0 ? w : 1);
      if (a < 0) a = 0; if (a > 1) a = 1;
      neuerWert = String(lo + a * (hi - lo), 2);
    } else if (!strcmp(wtyp, "stepper")) {
      JsonVariantConst cur; bool hat = boundValue(wd, cur);
      float ist = hat ? cur.as<float>() : (wd["value"] | 0.0f);
      float schritt = wd["stepSize"] | 1.0f;
      float lo = wd["min"] | 0.0f, hi = wd["max"] | 100.0f;
      int seite = h < w / 3 ? h : w / 3;      // muss zum gezeichneten Tastenfeld passen
      if (sx < x + seite) ist -= schritt;
      else if (sx > x + w - seite) ist += schritt;
      else { Serial.println("  -> Mitte angetippt, kein Schritt"); continue; }
      if (ist < lo) ist = lo; if (ist > hi) ist = hi;
      neuerWert = String(ist, 2);
    } else if (!strcmp(wtyp, "choice")) {
      JsonArrayConst opts = wd["options"].as<JsonArrayConst>();
      int n = opts.isNull() ? 0 : opts.size();
      if (!n) continue;
      int idx = (sx - x) * n / (w > 0 ? w : 1);
      if (idx < 0) idx = 0; if (idx >= n) idx = n - 1;
      neuerWert = String((const char*)(opts[idx]["value"] | ""));
    }
    if (neuerWert.length()) Serial.printf("  -> Wert: %s\n", neuerWert.c_str());
    if (act.isNull()) { Serial.println("  -> keine Aktion hinterlegt"); }
    else {
      Serial.printf("  -> fuehre aus: %s\n", (const char*)(act["kind"] | "?"));
      runAction(act, neuerWert);
    }
    TouchPoint rel; unsigned long t0 = millis();
    while (pressedRaw(rel) && millis() - t0 < 2000) delay(10);
    delay(120);
    return;
  }
  if (!buttons) Serial.println("  keine Taste auf dieser Seite");
}

/* ---------------- Touch-Kalibrierung ---------------- */
bool pressedRaw(TouchPoint& p) { p = ts.getTouch(); return digitalRead(TOUCH_IRQ) == LOW && p.zRaw > TOUCH_Z; }
void calCapture(int idx, int tx, int ty, int& rawx, int& rawy) {
  tft.fillScreen(TFT_BLACK);
  if (curVlw.length()) { tft.unloadFont(); curVlw = ""; }
  tft.setTextSize(1); tft.setTextFont(2);
  tft.setTextColor(TFT_WHITE, TFT_BLACK); tft.setTextDatum(MC_DATUM);
  char m[32]; snprintf(m, sizeof(m), "Kreuz %d/3 antippen", idx);
  tft.drawString(m, W / 2, H / 2);
  tft.drawLine(tx - 14, ty, tx + 14, ty, TFT_RED);
  tft.drawLine(tx, ty - 14, tx, ty + 14, TFT_RED);
  tft.drawCircle(tx, ty, 12, TFT_RED);
  TouchPoint p;
  while (pressedRaw(p)) delay(10);          // loslassen
  delay(200);
  long ax = 0, ay = 0; int n = 0;
  while (n < 25) { if (pressedRaw(p)) { ax += p.xRaw; ay += p.yRaw; n++; } delay(8); }
  rawx = ax / n; rawy = ay / n;
  tft.fillCircle(tx, ty, 12, TFT_GREEN);
  while (pressedRaw(p)) delay(10);
  delay(300);
}
void runCalibration() {
  int m = 26, tlx, tly, trx, tryy, brx, bry;
  calCapture(1, m, m, tlx, tly);
  calCapture(2, W - m, m, trx, tryy);
  calCapture(3, W - m, H - m, brx, bry);
  if (abs(trx - tlx) >= abs(tryy - tly)) { calXrawX = true;  calXmin = tlx; calXmax = trx; }
  else                                   { calXrawX = false; calXmin = tly; calXmax = tryy; }
  if (abs(bry - tryy) >= abs(brx - trx))  { calYrawX = false; calYmin = tryy; calYmax = bry; }
  else                                    { calYrawX = true;  calYmin = trx;  calYmax = brx; }
  prefs.begin("slab", false);
  prefs.putBool("cal", true);
  prefs.putBool("cx", calXrawX); prefs.putInt("cxa", calXmin); prefs.putInt("cxb", calXmax);
  prefs.putBool("cy", calYrawX); prefs.putInt("cya", calYmin); prefs.putInt("cyb", calYmax);
  prefs.end();
  tft.fillScreen(TFT_BLACK); tft.setTextDatum(MC_DATUM); tft.setTextColor(TFT_GREEN, TFT_BLACK);
  tft.drawString("Kalibriert!", W / 2, H / 2);
  delay(900);
  render();
}

/* ---------------- Layout laden/speichern ---------------- */
void applyLayout(const String& json) {
  DeserializationError err = deserializeJson(layoutDoc, json);
  if (err) {
    tft.fillScreen(TFT_BLACK); tft.setTextFont(2); tft.setTextColor(TFT_RED, TFT_BLACK); tft.setTextDatum(TL_DATUM);
    tft.drawString("JSON-Fehler:", 8, 8); tft.drawString(err.c_str(), 8, 28); return;
  }
  layoutJson = json; pageIdx = 0; render();
  lastPoll = 0; pollFaellig = true;   // sofort abrufen, nicht erst nach einem Intervall
}
String loadLayout() {
  if (LittleFS.exists(LAYOUT_PATH)) {
    fs::File f = LittleFS.open(LAYOUT_PATH, "r");
    if (f) { String s = f.readString(); f.close(); if (s.length() > 5) return s; }
  }
  return String(DEFAULT_LAYOUT);
}
void saveLayout(const String& json) {
  fs::File f = LittleFS.open(LAYOUT_PATH, "w");
  if (f) { f.print(json); f.close(); }
}

/* ---------------- Serial-Push: STX <json> ETX ---------------- */
String rxBuf; bool rxActive = false;
void handleSerial() {
  while (Serial.available()) {
    char c = Serial.read();
    if (c == STX) { rxBuf = ""; rxActive = true; }
    else if (c == ETX && rxActive) {
      rxActive = false;
      JsonDocument test;
      if (deserializeJson(test, rxBuf) == DeserializationError::Ok) {
        // Sonderfall: WLAN-Zugangsdaten statt Layout
        if (!test["_wifi"].isNull()) {
          const char* ssid = test["_wifi"]["ssid"] | "";
          const char* pass = test["_wifi"]["pass"] | "";
          prefs.begin("slab", false);
          prefs.putString("ssid", ssid); prefs.putString("pass", pass);
          prefs.end();
          if (*ssid) {
            WiFi.mode(WIFI_STA); WiFi.begin(ssid, pass);
            // Ohne das bekaeme die Uhr nie eine Zeit, wenn das WLAN erst jetzt kommt
            configTzTime("CET-1CEST,M3.5.0/2,M10.5.0/3", "pool.ntp.org", "time.cloudflare.com");
          }
          Serial.println("\nOK wifi");
        } else if (!test["_touchtest"].isNull()) {
          Serial.println("\nOK touchtest 12s — jetzt aufs Display druecken");
          unsigned long t0 = millis(); int n = 0;
          while (millis() - t0 < 12000) {
            TouchPoint tp = ts.getTouch();
            int irq = digitalRead(TOUCH_IRQ);
            if (irq == LOW || tp.zRaw > 100) {
              Serial.printf("  irq=%d z=%d x=%d y=%d\n", irq, tp.zRaw, tp.xRaw, tp.yRaw);
              n++;
            }
            delay(120);
          }
          Serial.printf("OK touchtest fertig, %d Messungen\n", n);
        } else if (!test["_calibrate"].isNull()) {
          Serial.println("\nOK cal_start");
          runCalibration();
          Serial.println("OK cal_done");
        } else if (!test["_font"].isNull()) {
          // Danach folgen genau len Rohbytes der .vlw-Datei
          String fn = test["_font"]["name"] | "";
          String fext = test["_font"]["ext"] | ".vlw";   // .vlw fuer Schriften, .565 fuer Bilder
          uint32_t flen = test["_font"]["len"] | 0;
          uint32_t fsum = test["_font"]["sum"] | 0;   // Pruefsumme, 0 = keine
          if (!fn.length() || !flen) { Serial.println("\nERR font_kopf"); }
          else {
            if (curVlw == fn) { tft.unloadFont(); curVlw = ""; }   // nicht die offene Datei ueberschreiben
            fs::File f = LittleFS.open("/" + fn + fext, "w");
            if (!f) Serial.println("\nERR font_datei");
            else {
              // Blockweise mit Bestaetigung: der Sender wartet auf jedes ACK.
              // Ohne das laeuft der Empfangspuffer ueber, waehrend wir in den Flash schreiben.
              uint8_t buf[1024]; uint32_t got = 0; uint32_t summe = 0; unsigned long t0 = millis();
              Serial.printf("\nACK 0 %u\n", (unsigned)flen);   // bereit
              while (got < flen && millis() - t0 < 15000) {
                uint32_t want = flen - got; if (want > sizeof(buf)) want = sizeof(buf);
                size_t n = Serial.readBytes(buf, want);
                if (n) {
                  for (size_t k = 0; k < n; k++) summe = summe * 31u + buf[k];
                  f.write(buf, n); got += n; t0 = millis();
                  Serial.printf("ACK %u %u\n", (unsigned)got, (unsigned)flen);
                }
              }
              f.close();
              if (got != flen) { LittleFS.remove("/" + fn + fext); Serial.printf("\nERR font_kurz %u/%u\n", (unsigned)got, (unsigned)flen); }
              else if (fsum && summe != fsum) {
                // Länge stimmt, Inhalt nicht — genau so entstehen zerhackte Schriften
                LittleFS.remove("/" + fn + fext);
                Serial.printf("\nERR font_pruefsumme %u!=%u\n", (unsigned)summe, (unsigned)fsum);
              }
              else Serial.printf("\nOK font %s %u\n", fn.c_str(), (unsigned)got);
            }
          }
        } else if (!test["_fonts"].isNull()) {
          Serial.print("\nOK fonts");
          fs::File d = LittleFS.open("/");
          for (fs::File e = d.openNextFile(); e; e = d.openNextFile()) {
            String n = e.name();
            if (n.endsWith(".vlw") || n.endsWith(".565")) Serial.printf(" %s:%u", n.c_str(), (unsigned)e.size());
          }
          Serial.printf(" frei=%u\n", (unsigned)(LittleFS.totalBytes() - LittleFS.usedBytes()));
        } else if (!test["_delfont"].isNull()) {
          String fn = test["_delfont"] | "";
          if (curVlw == fn) { tft.unloadFont(); curVlw = ""; }
          bool weg = LittleFS.remove("/" + fn + ".vlw") || LittleFS.remove("/" + fn + ".565");
          Serial.println(weg ? "\nOK font_weg" : "\nERR font_weg");
        } else if (!test["_status"].isNull()) {
          Serial.printf("\nOK status wifi=%s ip=%s pages=%d cal=%s\n",
            WiFi.status() == WL_CONNECTED ? "on" : "off",
            WiFi.status() == WL_CONNECTED ? WiFi.localIP().toString().c_str() : "-",
            pageCount(), calXmin != 300 || calXmax != 3800 ? "ja" : "NEIN");
          Serial.printf("OK fs frei=%u von %u\n",
            (unsigned)(LittleFS.totalBytes() - LittleFS.usedBytes()), (unsigned)LittleFS.totalBytes());
        } else if (test["pages"].isNull() || !test["pages"].as<JsonArrayConst>().size()) {
          // Kein Layout (unbekanntes Kommando) -> Anzeige NICHT zerstören
          Serial.println("\nERR kein_layout");
        } else {
          saveLayout(rxBuf); applyLayout(rxBuf);
          Serial.printf("\nOK %d\n", rxBuf.length());
        }
      } else Serial.println("\nERR json");
    }
    else if (rxActive) { rxBuf += c; if (rxBuf.length() > 24000) { rxActive = false; Serial.println("\nERR too_big"); } }
  }
}

void setup() {
  Serial.setRxBufferSize(8192);   // MUSS vor begin() stehen
  Serial.begin(115200);
  Serial.setTimeout(5000);
  pinMode(TFT_BL, OUTPUT); digitalWrite(TFT_BL, HIGH);
  pinMode(TOUCH_IRQ, INPUT);
  tft.init(); tft.setRotation(1);
  if (INVERT_DISPLAY) tft.invertDisplay(true);
  ts.begin();
  LittleFS.begin(true);
  prefs.begin("slab", true);
  bool haveCal = prefs.getBool("cal", false);
  if (!haveCal) {                      // einmalig aus der früheren Firmware übernehmen
    prefs.end(); prefs.begin("cyd", true);
    if (prefs.getBool("ok", false)) {
      calXrawX = prefs.getBool("cx", true);  calXmin = prefs.getInt("cxa", 300); calXmax = prefs.getInt("cxb", 3800);
      calYrawX = prefs.getBool("cy", false); calYmin = prefs.getInt("cya", 300); calYmax = prefs.getInt("cyb", 3800);
      haveCal = true;
    }
    prefs.end(); prefs.begin("slab", false);
    if (haveCal) {
      prefs.putBool("cal", true);
      prefs.putBool("cx", calXrawX); prefs.putInt("cxa", calXmin); prefs.putInt("cxb", calXmax);
      prefs.putBool("cy", calYrawX); prefs.putInt("cya", calYmin); prefs.putInt("cyb", calYmax);
    }
    prefs.end(); prefs.begin("slab", true);
  }
  if (haveCal) {
    calXrawX = prefs.getBool("cx", true); calXmin = prefs.getInt("cxa", 300); calXmax = prefs.getInt("cxb", 3800);
    calYrawX = prefs.getBool("cy", false); calYmin = prefs.getInt("cya", 300); calYmax = prefs.getInt("cyb", 3800);
  }
  String wifiSsid = prefs.getString("ssid", ""), wifiPass = prefs.getString("pass", "");
  prefs.end();
  applyLayout(loadLayout());
  if (wifiSsid.length()) {
    WiFi.mode(WIFI_STA); WiFi.begin(wifiSsid.c_str(), wifiPass.c_str());
    // Zeit für das Uhr-Feld; MEZ/MESZ mit automatischer Umstellung
    configTzTime("CET-1CEST,M3.5.0/2,M10.5.0/3", "pool.ntp.org", "time.cloudflare.com");
  }
  Serial.println("\nSLAB READY");
}

void loop() {
  handleSerial();
  handleTouch();

  // Automatischer Seitenwechsel: Verweildauer je Seite, Pause nach Berührung
  int sekunden = layoutDoc["rotate"] | 0;
  if (sekunden > 0 && pageCount() > 1) {
    JsonObjectConst seite = pages()[pageIdx];
    unsigned long dauer = (unsigned long)(seite["dwell"] | sekunden) * 1000UL;
    unsigned long pause = (unsigned long)(layoutDoc["rotatePause"] | 15) * 1000UL;
    bool ruhe = letzteBeruehrung && (millis() - letzteBeruehrung < pause);
    if (!ruhe && millis() - letzterWechsel > dauer) {
      int n = pageCount(), start = pageIdx;
      do { pageIdx = (pageIdx + 1) % n; }             // uebersprungene Seiten auslassen
      while ((pages()[pageIdx]["skip"] | false) && pageIdx != start);
      letzterWechsel = millis();
      if (pageIdx != start) render();
    }
  }
  JsonArrayConst srcs = layoutDoc["sources"].as<JsonArrayConst>();
  unsigned long iv = 8000;
  if (!srcs.isNull() && srcs.size()) {
    iv = max((unsigned long)(srcs[0]["interval"] | 8000), 2000UL);
    // TLS-Handshake kostet Sekunden — bei https nicht zu oft nachfragen
    String u0 = srcs[0]["url"] | "";
    if (u0.startsWith("https://") && iv < 30000UL) iv = 30000UL;
  }
  if (pollFaellig || millis() - lastPoll > iv) {
    pollFaellig = false; lastPoll = millis(); pollSources();
  }

  // Bewegte Wettersymbole: naechstes Einzelbild. Nur wenn ueberhaupt eines
  // auf der Seite liegt, das mehr als ein Bild mitbringt.
  static unsigned long letzteAnim = 0;
  if (animLaeuft && millis() - letzteAnim > 110) {
    letzteAnim = millis(); animBild++; zeichneTyp("weather");
  }

  // Uhr: nur wenn die Minute (bzw. Sekunde bei entsprechendem Format) umspringt
  static int letzteZeit = -1;
  static unsigned long letzteLaufschrift = 0;
  struct tm jetzt;
  if (getLocalTime(&jetzt, 0)) {
    bool mitSekunden = layoutJson.indexOf("ss") >= 0;
    int marke = mitSekunden ? jetzt.tm_sec : jetzt.tm_min;
    if (marke != letzteZeit) { letzteZeit = marke; zeichneTyp("clock"); }
  }
  // Laufschrift: gleichmäßig weiterschieben
  if (millis() - letzteLaufschrift > 60) { letzteLaufschrift = millis(); zeichneTyp("ticker"); }
  delay(5);
}
