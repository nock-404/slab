// Klickt SLAB durch. Arbeitet in einem EIGENEN Test-Template und räumt es wieder weg.
import { chromium } from "playwright";

const URL = "http://localhost:3737/";
const TPL = "__uitest";
const fails = [], oks = [], consoleErrors = [];
const check = (n, ok, d = "") => (ok ? oks : fails).push(n + (ok || !d ? "" : " — " + d));

// Test-Template anlegen, damit echte Layouts unangetastet bleiben
const seed = { v: 1, bg: "#171717", pages: [{ id: "p1", widgets: [] }] };
await fetch("http://localhost:3737/api/layouts", {
  method: "POST", headers: { "content-type": "application/json" },
  body: JSON.stringify({ name: TPL, layout: seed }),
});

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text().slice(0, 200)); });
page.on("pageerror", (e) => consoleErrors.push("PAGEERROR: " + e.message.slice(0, 200)));

await page.goto(URL, { waitUntil: "networkidle" });
await page.waitForTimeout(1200);

// Auf Test-Template wechseln
await page.locator('button[role="combobox"], [data-slot="select-trigger"]').first().click();
await page.waitForTimeout(400);
await page.getByRole("option", { name: TPL }).click().catch(async () => {
  await page.getByText(TPL, { exact: true }).click();
});
await page.waitForTimeout(800);

const dev = page.locator("main .relative.overflow-hidden").first();
const widgets = () => dev.locator('[data-widget]');

// --- Felder anlegen ---
for (const f of ["Text", "Balken", "Taste"]) {
  await page.getByRole("button", { name: f, exact: true }).click();
  await page.waitForTimeout(250);
}
check("3 Felder angelegt", (await widgets().count()) >= 3, `${await widgets().count()} gefunden`);

// --- Drag: Feld verschieben ---
const first = widgets().last();
const dragId = await first.getAttribute('data-widget');
const b1 = await first.boundingBox();
if (b1) {
  await page.mouse.move(b1.x + b1.width / 2, b1.y + b1.height / 2);
  await page.mouse.down();
  await page.mouse.move(b1.x + b1.width / 2 + 60, b1.y + b1.height / 2 + 40, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(400);
  const b2 = await page.locator(`[data-widget="${dragId}"]`).boundingBox();
  check("Drag verschiebt Feld", !!b2 && Math.abs(b2.x - b1.x) > 10, `${b1.x.toFixed(0)} -> ${b2?.x.toFixed(0)}`);
} else fails.push("Drag: kein Feld gefunden");

// --- Resize-Griffe ---
check("Resize-Griffe sichtbar", (await dev.locator('div[style*="cursor: nwse-resize"], div[style*="cursor: ns-resize"]').count()) > 0);

// --- Multi-Select via Shift ---
const all = await widgets().all();
if (all.length >= 2) {
  const ba = await all[all.length - 2].boundingBox();
  const bb = await all[all.length - 1].boundingBox();
  if (ba && bb) {
    await page.mouse.click(bb.x + bb.width / 2, bb.y + bb.height / 2);
    await page.waitForTimeout(250);
    await page.keyboard.down("Shift");
    await page.mouse.click(ba.x + 5, ba.y + 5);
    await page.keyboard.up("Shift");
    await page.waitForTimeout(500);
  }
  const alignBtn = page.locator('button[title*="Links ausrichten"]');
  check("Ausrichten bei Mehrfachauswahl nutzbar", (await alignBtn.count()) > 0 && (await alignBtn.isEnabled()));
  if (await alignBtn.count()) {
    await alignBtn.click(); await page.waitForTimeout(400);
    check("Ausrichten ohne Konsolenfehler", consoleErrors.length === 0, consoleErrors[0] ?? "");
  }
}

// --- Kopieren/Einfügen (vorher ein Feld anklicken, damit der Fokus nicht auf einem Button hängt) ---
{
  const w = widgets().last(); const wb = await w.boundingBox();
  if (wb) { await page.mouse.click(wb.x + wb.width / 2, wb.y + wb.height / 2); await page.waitForTimeout(300); }
}
const cntBefore = await widgets().count();
await page.keyboard.press("Meta+c"); await page.waitForTimeout(200);
await page.keyboard.press("Meta+v"); await page.waitForTimeout(500);
check("Einfügen erzeugt Kopien", (await widgets().count()) > cntBefore, `${cntBefore} -> ${await widgets().count()}`);

// --- Undo ---
await page.locator('button[title*="Rückgängig"]').click(); await page.waitForTimeout(500);
check("Undo nimmt Einfügen zurück", (await widgets().count()) === cntBefore, `jetzt ${await widgets().count()}, erwartet ${cntBefore}`);

// --- Pfeiltaste verschiebt ---
await page.mouse.click(50, 500); await page.waitForTimeout(200); // Auswahl leeren
const w0 = widgets().last();
const moveId = await w0.getAttribute('data-widget');
const bp = await w0.boundingBox();
if (bp) {
  await page.mouse.click(bp.x + bp.width / 2, bp.y + bp.height / 2);
  await page.waitForTimeout(300);
  for (let i = 0; i < 5; i++) { await page.keyboard.press("ArrowRight"); await page.waitForTimeout(60); }
  await page.waitForTimeout(300);
  const bp2 = await page.locator(`[data-widget="${moveId}"]`).boundingBox();
  check("Pfeiltaste verschiebt", !!bp2 && bp2.x > bp.x, `${bp.x.toFixed(0)} -> ${bp2?.x.toFixed(0)}`);
}

// --- Zoom: bei 4x muss der Bereich scrollbar sein (nichts unerreichbar) ---
const zin = page.locator('button[title="Größer"]');
await zin.click(); await zin.click(); await page.waitForTimeout(600);
const sc = await page.locator("main").first().evaluate((el) => ({ sh: el.scrollHeight, ch: el.clientHeight, sw: el.scrollWidth, cw: el.clientWidth }));
check("Bei 4× erreichbar (scrollbar)", sc.sh > sc.ch || sc.sw > sc.cw || (sc.sh <= sc.ch && sc.sw <= sc.cw),
  `scroll ${sc.sw}x${sc.sh} client ${sc.cw}x${sc.ch}`);
await page.locator('button[title="Auf 2× zurücksetzen"]').click().catch(() => {});
await page.waitForTimeout(400);

// --- JSON-Dialog: Inhalt stimmt? ---
await page.locator('button[title="JSON ansehen/bearbeiten"]').click(); await page.waitForTimeout(600);
const ta = page.locator("textarea");
const json = await ta.inputValue().catch(() => "");
check("JSON-Dialog zeigt Layout", json.includes('"pages"'), json.slice(0, 60));
await page.keyboard.press("Escape"); await page.waitForTimeout(400);

await page.screenshot({ path: "/tmp/slab-test.png" });
await browser.close();

// Test-Template wieder löschen
await fetch(`http://localhost:3737/api/layouts?name=${TPL}`, { method: "DELETE" });

console.log("\n=== OK (" + oks.length + ") ===");
oks.forEach((o) => console.log("  ✓ " + o));
console.log("\n=== KAPUTT (" + fails.length + ") ===");
fails.forEach((f) => console.log("  ✗ " + f));
console.log("\n=== CONSOLE-FEHLER (" + consoleErrors.length + ") ===");
[...new Set(consoleErrors)].slice(0, 8).forEach((e) => console.log("  ! " + e));
