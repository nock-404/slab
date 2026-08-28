// Gemeinsame Basis für alle UI-Skripte: legt ein Wegwerf-Template an, wechselt hin,
// und räumt es weg. Echte Layouts werden NIE angefasst.
import { chromium } from "playwright";
const BASE = "http://localhost:3737";

export async function openTestEditor(name = "__test", viewport = { width: 1500, height: 950 }) {
  await fetch(`${BASE}/api/layouts`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ name, layout: { v: 1, bg: "#171717", pages: [{ id: "p1", widgets: [] }] } }),
  });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport });
  const errors = [];
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text().slice(0, 200)); });
  page.on("pageerror", (e) => errors.push("PAGEERROR: " + e.message.slice(0, 200)));
  // Vor dem Laden das Zieltemplate setzen, damit nichts anderes geöffnet wird
  await page.addInitScript((n) => localStorage.setItem("slab:lastTpl", n), name);
  await page.goto(BASE + "/", { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  return {
    browser, page, errors,
    cleanup: async () => {
      await browser.close();
      await fetch(`${BASE}/api/layouts?name=${encodeURIComponent(name)}`, { method: "DELETE" });
    },
  };
}
