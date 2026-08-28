# Entwicklung

## Editor

```bash
pnpm install
pnpm dev          # http://localhost:3000
pnpm lint
```

Chrome oder Edge — WebSerial gibt es sonst nirgends.

Layouts liegen als JSON-Dateien unter `layouts/`. Das ist git-freundlich und
spart eine Datenbank; der Editor speichert automatisch mit Verzögerung.

## Firmware

Quelltext unter `firmware/`, gebaut mit [PlatformIO](https://platformio.org/):

```bash
cd firmware
pio run                      # baut .pio/build/cyd/firmware.bin
pio run -t upload            # direkt aufs Gerät
pio device monitor           # Serielle Ausgabe, 115200 Baud
```

Damit auch der **Flash-Knopf im Editor** funktioniert, muss die gebaute
Firmware unter `public/firmware/slab.bin` liegen:

```bash
cp firmware/.pio/build/cyd/firmware.bin public/firmware/slab.bin
```

Diese Datei ist bewusst nicht eingecheckt — ein kompiliertes Binary enthält die
Build-Pfade der Maschine, auf der es entstanden ist.

## Wie Editor und Gerät reden

Serielle Verbindung, 115200 Baud. Ein Rahmen ist `STX <json> ETX`.

| Kommando | Wirkung |
|---|---|
| `{ "pages": [...] }` | Layout — wird gespeichert und gezeichnet. Antwort `OK <bytes>` |
| `{ "_wifi": { "ssid", "pass" } }` | WLAN in NVS ablegen und verbinden |
| `{ "_status": true }` | WLAN, IP, Seitenzahl, Kalibrierung, freier Speicher |
| `{ "_fonts": true }` | Welche `.vlw`/`.565` liegen auf dem Gerät |
| `{ "_font": { name, ext, len, sum } }` | Datei ankündigen, danach folgen `len` Rohbytes |
| `{ "_delfont": "<name>" }` | Datei löschen |
| `{ "_calibrate": true }` | Touch-Kalibrierung, drei Kreuze antippen |
| `{ "_touchtest": true }` | 12 Sekunden Rohwerte des Sensors |

Dateien gehen **blockweise mit Bestätigung**: das Gerät meldet `ACK <bisher>
<gesamt>`, erst danach geht der nächste Block raus. Dadurch regelt sich das
Tempo von selbst — kein geratener Wartewert, kein Pufferüberlauf. Eine
Prüfsumme wandert mit; stimmt sie nicht, verwirft das Gerät die Datei. Genau so
entstehen sonst zerhackte Schriften.

Das Layout selbst darf höchstens **24000 Bytes** groß sein — das ist der
Empfangspuffer der Firmware. Der Editor warnt ab 80 Prozent.

## Aufbau

```
app/page.tsx           der ganze Editor
app/lib/types.ts       Layout-Vertrag — muss 1:1 zur Firmware passen
app/lib/serial.ts      WebSerial-Verbindung, Rahmen, blockweiser Dateiversand
app/lib/flash.ts       Firmware flashen über esptool-js
app/lib/vlw.ts         .vlw-Schriften aus TTF/OTF erzeugen
app/lib/bilder.ts      Bilder und QR-Codes nach RGB565
app/lib/meteocons.ts   Wettersymbole einfrieren und als Film zerlegen
app/lib/validate.ts    Layout gegen alles prüfen, was auf dem Gerät schiefgeht
app/api/proxy          Datenquellen serverseitig holen (CORS + Auth-Header)
firmware/src/main.cpp  Interpreter-Firmware
```

### Der Layout-Vertrag

`app/lib/types.ts` und `firmware/src/main.cpp` beschreiben dasselbe Format.
Wer einen Feldtyp ergänzt, muss ihn an **beiden** Stellen eintragen — der
Editor zeichnet die Vorschau, die Firmware das Echte.

Die Firmware ignoriert Unbekanntes. Ein neuer Feldtyp macht ein altes Gerät
also nicht kaputt, er wird nur nicht gezeichnet.

### .vlw-Schriften

Format laut `TFT_eSPI/Extensions/Smooth_font.cpp`, alle Zahlen 32 Bit **Big
Endian**:

```
Kopf, 24 B:   gCount | version(11) | fontSize | 0 | ascent | descent
je Glyph, 28: unicode | height | width | gxAdvance | dY | dX | 0
danach:       Bitmaps, je Pixel 1 Byte Alpha
Abschluss:    1 B Namenslänge + Name, dasselbe als PS-Name, 1 B geglättet(1)
```

`ascent` muss **jedes** Zeichen einschließen: TFT_eSPI setzt die Oberkante auf
`cursorY + ascent - dY`. Wäre `ascent` kleiner als das größte `dY`, würde oben
abgeschnitten. `readVlw()` liest die Datei genauso ein wie die Library — zum
Gegenprüfen des Writers.

### Wettersymbole

Die Meteocons bringen SMIL-Animationen mit. Ein serialisiertes SVG behält davon
nur die Anweisungen, nicht den Stand — deshalb wird das Bild kurz in die Seite
gehängt, die Uhr angehalten und der erreichte Wert jedes bewegten Attributs fest
eingetragen.

Trifft eine schnelle Bewegung auf eine langsame — beim Gewitter blitzt es alle
zwei Sekunden, während die Sonne 45 Sekunden für eine Umdrehung braucht — gibt
die schnelle den Takt vor und die langsame wird angehalten. Bewegt sich alles
nur langsam, wird nachgemessen, nach welchem Abschnitt das Symbol wieder gleich
aussieht: Bild für Bild verglichen, statt es zu raten.

## UI-Skripte

Playwright-Skripte, die den Editor durchklicken. Sie legen ein
Wegwerf-Template an und räumen es wieder weg — echte Layouts werden nie
angefasst. Der Dev-Server muss laufen.

```bash
node test-ui.mjs      # Klickt die Kernfunktionen durch
node xcheck.mjs       # Prüft jeden Dialog auf Überlauf und native Scrollbalken
node shots.mjs        # Screenshots nach /tmp
```

## Regeln im Code

- **Nirgends native Scrollbalken** — alles Scrollbare läuft über OverlayScrollbars.
- **Kein `window.confirm`/`alert`** — Rückfragen über die eigene Dialog-Komponente.
- **Keine Farbe hartkodiert** in Komponenten; alles über die Tokens in `app/globals.css`.
