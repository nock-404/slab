<div align="center">

# SLAB

### Ein Display-Builder fürs CYD. Ziehen statt kompilieren.

Bau dir das Dashboard für dein „Cheap Yellow Display" im Browser zusammen —
29 Feldtypen, echte Datenquellen, eigene Schriften — und schieb es per USB
aufs Gerät. **Ohne eine Zeile C++ anzufassen.**

`ESP32-2432S028R` · `WebSerial` · `Next.js 16` · `TFT_eSPI`

</div>

---

## Die Idee

Das CYD ist ein 2,8-Zoll-Touchdisplay mit ESP32 für unter 15 Euro. Etwas darauf
anzuzeigen heißt normalerweise: Arduino-IDE auf, Layout in C++ hardcodieren,
kompilieren, flashen, Tippfehler finden, von vorn.

SLAB dreht das um. Auf dem Gerät läuft **eine** Firmware — ein Interpreter. Er
liest Layout-JSON und zeichnet, was drinsteht. Das Layout baust du im Browser
mit der Maus. Ein Klick auf *Publish* schiebt es über die serielle Schnittstelle
rüber, in unter einer Sekunde.

Neues Feld verschieben? Ziehen, Publish, fertig. Kein Compiler.

## Was drin ist

**29 Feldtypen** — Text, Wert, Balken, Status, Box, Linie, Taste, Ring, Tacho,
Ampel, Rahmen, Seitenpunkte, Trend, Batterie, Signal, Laufschrift, Kurve,
Säulen, Kennzahl, Uhr, Schalter, Regler, Zähler, Auswahl, Wetter, Symbol, Bild,
QR-Code, Wiederholer.

| | |
|---|---|
| **Andockbare Bereiche** | Panels verschieben, abkoppeln als eigenes Fenster, einklappen — die Aufteilung merkt sich der Browser |
| **Datenbindung** | Jede JSON-API als Quelle. Pfad per Picker aus der echten Antwort wählen, Umrechnung und Schwellwert-Farben pro Feld |
| **Auth** | Bearer, Basic, eigener Header, Query-Parameter — läuft über den lokalen Proxy, Zugangsdaten bleiben auf dem Server |
| **Eigene Schriften** | TTF/OTF hochladen oder direkt aus Google Fonts holen. Beim Publish wird die `.vlw` in genau der Größe erzeugt, die das Layout braucht |
| **Bilder & QR** | Werden zu RGB565-Rohbildern gerechnet und blockweise übertragen — das Display kann keine PNGs |
| **Wettersymbole** | Meteocons, als Folge von Einzelbildern. Auf dem Gerät bewegen sie sich |
| **Wiederholer** | Felder an eine Liste binden: eine Vorlage, beliebig viele Datensätze |
| **Touch-Aktionen** | Seitenwechsel oder HTTP-Aufruf. `{value}` im URL wird durch den neuen Wert ersetzt |
| **Layout prüfen** | Findet Felder außerhalb des Displays, tote Bindungen, unsichtbare Farben, zu große Pushs — bevor das Gerät es merkt |
| **Firmware flashen** | Direkt aus dem Browser über WebSerial, mit Fallback auf langsamere Baudraten |

## Warum das Gerät nicht flackert

Ein Dashboard, das bei jedem Abruf komplett neu aufgebaut wird, sieht man
flackern. Die Firmware merkt sich deshalb für jedes Feld eine Signatur aus
seinem Wert und seiner Sichtbarkeit. Ändert sich nichts, wird nichts gezeichnet.

Ändert sich etwas, wird nicht das Feldmaß aus dem Layout gelöscht, sondern die
Fläche, die das Feld beim letzten Mal **tatsächlich bemalt** hat — eine
48-Punkt-Zahl in einem 20 Pixel hohen Feld ragt weit darunter hinaus. Danach
wird alles neu gezeichnet, was diese Fläche berührt, in Layout-Reihenfolge,
damit die Überdeckung stimmt.

## Loslegen

```bash
pnpm install
pnpm dev
```

Editor unter `http://localhost:3000`. Chrome oder Edge — WebSerial gibt es
sonst nirgends.

Dann: **Verbinden** → **Firmware flashen** (einmalig) → **WLAN einrichten** →
Layout bauen → **Publish**.

Die Firmware liegt als Quelltext unter `firmware/` und wird mit PlatformIO
gebaut. Mehr dazu und zum Aufbau: **[DEVELOPMENT.md](DEVELOPMENT.md)**

## Hardware

Entwickelt für das **ESP32-2432S028R** (2,8" ILI9341, 320×240, XPT2046-Touch).
Andere Maße lassen sich im Editor einstellen — 3,5", hochkant, Round 1,28",
T-Display S3 sind als Voreinstellung dabei. Die Firmware-Pinbelegung in
`firmware/platformio.ini` gilt fürs CYD und muss für andere Boards angepasst
werden.

## Lizenz

MIT. Wettersymbole von [Meteocons](https://github.com/basmilius/weather-icons)
(basmilius, MIT).
