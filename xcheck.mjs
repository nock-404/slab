// Prüft JEDEN Dialog auf horizontales Ausbrechen + native Scrollbalken
import { openTestEditor } from "./test-lib.mjs";
const { page, cleanup } = await openTestEditor("__xchk", { width: 1280, height: 720 });
for (let i = 0; i < 8; i++) { await page.getByRole("button", { name: "Text", exact: true }).click(); await page.waitForTimeout(100); }

const audit = async (name, openFn) => {
  await openFn(); await page.waitForTimeout(700);
  const r = await page.evaluate(() => {
    const d = [...document.querySelectorAll('[role="dialog"]')].pop();
    if (!d) return null;
    const db = d.getBoundingClientRect();
    const bad = [];
    d.querySelectorAll("*").forEach((el) => {
      const b = el.getBoundingClientRect();
      if (b.width > 0 && (b.right > db.right + 1 || b.left < db.left - 1))
        bad.push(`${el.tagName.toLowerCase()}.${(el.className || "").toString().slice(0, 25)} ${Math.round(b.left)}..${Math.round(b.right)}`);
      const cs = getComputedStyle(el);
      if ((cs.overflowY === "auto" || cs.overflowY === "scroll") && el.scrollHeight > el.clientHeight + 2 && !el.closest("[data-overlayscrollbars]"))
        bad.push(`NATIVE-SCROLLBAR ${el.tagName.toLowerCase()}.${(el.className||"").toString().slice(0,25)}`);
    });
    return { dlg: `${Math.round(db.left)}..${Math.round(db.right)}`, bad: bad.slice(0, 4) };
  });
  console.log(`  ${r && !r.bad.length ? "OK  " : "FEHL"} ${name}` + (r?.bad.length ? "\n       " + r.bad.join("\n       ") : ""));
  await page.keyboard.press("Escape"); await page.waitForTimeout(350);
};

await audit("json", () => page.locator('button[title="JSON ansehen/bearbeiten"]').click());
await audit("tastenkuerzel", () => page.locator('button[title="Tastenkürzel (?)"]').click());
await audit("pruefen", () => page.getByRole("button", { name: /OK$|Fehler|Hinweise/ }).first().click());
await audit("log", () => page.getByRole("button", { name: /^Log/ }).click());
await audit("flash", () => page.getByRole("button", { name: /^Flash$/ }).click());
await page.locator('button[title="Datenquelle hinzufügen"]').click(); await page.waitForTimeout(400);
await audit("quelle", () => page.locator('button[title="Bearbeiten"]').first().click());
await cleanup();
