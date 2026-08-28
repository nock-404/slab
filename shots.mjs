import { openTestEditor } from "./test-lib.mjs";
const { page, errors, cleanup } = await openTestEditor("__shots");
const shot = async (n) => { await page.screenshot({ path: `/tmp/s-${n}.png` }); console.log("  " + n); };

// Ein paar Felder als Inhalt
for (const f of ["Text", "Balken", "Wert"]) { await page.getByRole("button", { name: f, exact: true }).click(); await page.waitForTimeout(250); }

await page.locator('[data-slot="select-trigger"]').first().click(); await page.waitForTimeout(500);
await shot("01-dropdown"); await page.keyboard.press("Escape"); await page.waitForTimeout(400);

await page.locator('button[title="Tastenkürzel (?)"]').click(); await page.waitForTimeout(500);
await shot("02-tastenkuerzel"); await page.keyboard.press("Escape"); await page.waitForTimeout(400);

await page.locator('button[title="JSON ansehen/bearbeiten"]').click(); await page.waitForTimeout(600);
await shot("03-json"); await page.keyboard.press("Escape"); await page.waitForTimeout(400);

await page.locator('button[title="Datenquelle hinzufügen"]').click(); await page.waitForTimeout(600);
await page.locator('button[title="Bearbeiten"]').first().click(); await page.waitForTimeout(700);
await shot("04-quelle");
await page.getByText("keine", { exact: true }).first().click().catch(() => {});
await page.waitForTimeout(500); await shot("05-quelle-auth");
await page.keyboard.press("Escape"); await page.waitForTimeout(300);
await page.keyboard.press("Escape"); await page.waitForTimeout(400);

await page.getByRole("button", { name: /^Flash$/ }).click(); await page.waitForTimeout(500);
await shot("06-flash"); await page.keyboard.press("Escape"); await page.waitForTimeout(400);

const w = page.locator("[data-widget]").last(); const bx = await w.boundingBox();
if (bx) { await page.mouse.click(bx.x + bx.width / 2, bx.y + bx.height / 2); await page.waitForTimeout(400); }
await shot("07-inspector");

await page.getByRole("button", { name: "Taste", exact: true }).click(); await page.waitForTimeout(500);
await shot("08-inspector-taste");

console.log("Konsolenfehler:", errors.length);
await cleanup();
