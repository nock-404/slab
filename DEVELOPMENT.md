# Development

## Editor

```bash
pnpm install
pnpm dev          # http://localhost:3000
pnpm lint
```

Chrome or Edge — WebSerial exists nowhere else.

Layouts are stored as JSON files under `layouts/`. That's git-friendly and saves
a database; the editor autosaves with a debounce.

## Firmware

Source under `firmware/`, built with [PlatformIO](https://platformio.org/):

```bash
cd firmware
pio run                      # builds .pio/build/cyd/firmware.bin
pio run -t upload            # straight to the device
pio device monitor           # serial output, 115200 baud
```

For the **flash button in the editor** to work, the built firmware has to sit at
`public/firmware/slab.bin`:

```bash
cp firmware/.pio/build/cyd/firmware.bin public/firmware/slab.bin
```

That file is deliberately not committed — a compiled binary embeds the build
paths of the machine it was made on.

## How editor and device talk

Serial, 115200 baud. A frame is `STX <json> ETX`.

| Command | Effect |
|---|---|
| `{ "pages": [...] }` | Layout — stored and drawn. Replies `OK <bytes>` |
| `{ "_wifi": { "ssid", "pass" } }` | Store Wi-Fi in NVS and connect |
| `{ "_status": true }` | Wi-Fi, IP, page count, calibration, free space |
| `{ "_fonts": true }` | Which `.vlw` / `.565` files are on the device |
| `{ "_font": { name, ext, len, sum } }` | Announce a file; `len` raw bytes follow |
| `{ "_delfont": "<name>" }` | Delete a file |
| `{ "_calibrate": true }` | Touch calibration, tap three crosses |
| `{ "_touchtest": true }` | 12 seconds of raw sensor values |

Files transfer **block by block with acknowledgement**: the device reports
`ACK <sofar> <total>`, and only then does the next block go out. That makes the
pace self-regulating — no guessed delay, no buffer overrun. A checksum travels
along; if it doesn't match, the device discards the file. That is exactly how
you otherwise end up with mangled fonts.

The layout itself may be at most **24,000 bytes** — that's the firmware's
receive buffer. The editor warns from 80 percent.

## Structure

```
app/page.tsx           the entire editor
app/lib/types.ts       layout contract — must match the firmware 1:1
app/lib/serial.ts      WebSerial link, framing, block-wise file transfer
app/lib/flash.ts       firmware flashing via esptool-js
app/lib/vlw.ts         build .vlw fonts from TTF/OTF
app/lib/bilder.ts      images and QR codes to RGB565
app/lib/meteocons.ts   freeze weather icons and split them into frames
app/lib/validate.ts    check a layout against everything that fails on device
app/api/proxy          fetch data sources server-side (CORS + auth headers)
firmware/src/main.cpp  interpreter firmware
```

### The layout contract

`app/lib/types.ts` and `firmware/src/main.cpp` describe the same format. Adding
a field type means adding it in **both** places — the editor draws the preview,
the firmware draws the real thing.

The firmware ignores anything it doesn't know. A new field type therefore won't
break an old device; it just won't be drawn.

### .vlw fonts

Format per `TFT_eSPI/Extensions/Smooth_font.cpp`, all integers 32-bit **big
endian**:

```
header, 24 B:  gCount | version(11) | fontSize | 0 | ascent | descent
per glyph, 28: unicode | height | width | gxAdvance | dY | dX | 0
then:          bitmaps, one alpha byte per pixel
trailer:       1 B name length + name, same again as PS name, 1 B smooth(1)
```

`ascent` must cover **every** glyph: TFT_eSPI places the top edge at
`cursorY + ascent - dY`. If `ascent` were smaller than the largest `dY`, glyphs
would be clipped at the top. `readVlw()` parses the file exactly the way the
library does — to check the writer against itself.

### Weather icons

The Meteocons ship with SMIL animations. A serialised SVG keeps only the
instructions, not the state — so the image is briefly attached to the page, the
clock is paused, and the reached value of every animated attribute is written
out as a static one.

When a fast animation meets a slow one — a thunderstorm flashes every two
seconds while the sun takes 45 seconds for a full turn — the fast one sets the
tempo and the slow one is frozen. If everything moves slowly, the loop point is
measured instead of guessed: frames are rendered and compared until the icon
looks like its first frame again.

## UI scripts

Playwright scripts that click through the editor. They create a throwaway
template and clean it up afterwards — real layouts are never touched. The dev
server has to be running.

```bash
node test-ui.mjs      # clicks through the core features
node xcheck.mjs       # checks every dialog for overflow and native scrollbars
node shots.mjs        # screenshots to /tmp
```

## House rules in the code

- **No native scrollbars anywhere** — everything scrollable goes through OverlayScrollbars.
- **No `window.confirm`/`alert`** — prompts use the project's own dialog component.
- **No hardcoded colours** in components; everything through the tokens in `app/globals.css`.
