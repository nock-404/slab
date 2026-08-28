import { openTestEditor } from "./test-lib.mjs";
const { page, cleanup } = await openTestEditor("__fontshot");
await page.getByRole("button", { name: "Text", exact: true }).click(); await page.waitForTimeout(400);
const w = page.locator("[data-widget]").last(); const b = await w.boundingBox();
await page.mouse.click(b.x+b.width/2, b.y+b.height/2); await page.waitForTimeout(400);
// Schrift auf Serif Fett 18 stellen
const insp = page.locator("aside").last();
await insp.locator('[data-slot="select-trigger"]').first().click(); await page.waitForTimeout(400);
await page.getByRole("option", { name: "Serif" }).click(); await page.waitForTimeout(500);
await page.screenshot({ path: "/tmp/s-font.png" });
// Taste + Rahmen
await page.getByRole("button", { name: "Taste", exact: true }).click(); await page.waitForTimeout(500);
await page.screenshot({ path: "/tmp/s-border.png" });
await cleanup();
