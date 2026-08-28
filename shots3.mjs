import { openTestEditor } from "./test-lib.mjs";
// bewusst kleines Fenster — hier zeigt sich Overflow zuerst
const { page, cleanup } = await openTestEditor("__ovfl", { width: 1280, height: 720 });

// viel Inhalt erzeugen, damit die Dialoge groß werden
for (let i = 0; i < 8; i++) { await page.getByRole("button", { name: "Text", exact: true }).click(); await page.waitForTimeout(120); }

const check = async (name, openFn) => {
  await openFn();
  await page.waitForTimeout(700);
  const dlg = page.locator('[role="dialog"]').last();
  const box = await dlg.boundingBox();
  const vp = page.viewportSize();
  const ok = box && box.y >= -1 && box.y + box.height <= vp.height + 1;
  console.log(`  ${ok ? "OK " : "RAUS"} ${name} — ${box ? `${Math.round(box.y)}..${Math.round(box.y+box.height)} von ${vp.height}` : "nicht gefunden"}`);
  await page.screenshot({ path: `/tmp/o-${name}.png` });
  await page.keyboard.press("Escape"); await page.waitForTimeout(400);
};

await check("json", () => page.locator('button[title="JSON ansehen/bearbeiten"]').click());
await check("tastenkuerzel", () => page.locator('button[title="Tastenkürzel (?)"]').click());
await check("pruefen", () => page.getByRole("button", { name: /OK$|Fehler|Hinweise/ }).first().click());
await check("log", () => page.getByRole("button", { name: /^Log/ }).click());
await check("flash", () => page.getByRole("button", { name: /^Flash$/ }).click());
await page.locator('button[title="Datenquelle hinzufügen"]').click(); await page.waitForTimeout(500);
await check("quelle", () => page.locator('button[title="Bearbeiten"]').first().click());
await cleanup();
