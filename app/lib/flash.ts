/* eslint-disable @typescript-eslint/no-explicit-any */
// Firmware per WebSerial aufs CYD flashen (esptool-js 0.6).
// Wichtig (verifiziert am esptool-js-Quellcode):
//  - Transport bekommt einen GESCHLOSSENEN Port; es öffnet ihn selbst.
//  - fileArray.data muss Uint8Array sein (nicht binary string wie in alten Beispielen).
//  - App-Image liegt bei 0x10000; eraseAll MUSS false bleiben, sonst ist der Bootloader weg.
//  - 460800 Baud (921600 rauscht am CH340).
//  - writeFlash resettet nicht — danach after("hard_reset").

export async function flashFirmware(
  port: any,
  binUrl: string,
  onProgress: (pct: number) => void,
  onLog: (line: string) => void,
): Promise<void> {
  const { ESPLoader, Transport } = await import("esptool-js");

  const res = await fetch(binUrl, { cache: "no-store" });
  if (!res.ok) throw new Error(`Firmware nicht gefunden (HTTP ${res.status})`);
  const firmware = new Uint8Array(await res.arrayBuffer());
  if (firmware.length < 1024) throw new Error("Firmware-Datei zu klein — falscher Pfad?");

  // Der Port kann noch offen sein, auch wenn die Anzeige "getrennt" sagt.
  // port.readable ist der verlässliche Hinweis — nicht unser eigener Zustand.
  async function ensureClosed() {
    for (let i = 0; i < 8; i++) {
      if (!port.readable && !port.writable) return true;
      try {
        if (port.readable?.locked) { const r = port.readable.getReader(); await r.cancel().catch(() => {}); r.releaseLock(); }
      } catch { /* egal */ }
      try {
        if (port.writable?.locked) { const w = port.writable.getWriter(); await w.close().catch(() => {}); w.releaseLock(); }
      } catch { /* egal */ }
      try { await port.close(); return true; } catch { /* noch nicht */ }
      await new Promise((r) => setTimeout(r, 250));
    }
    return !port.readable && !port.writable;
  }

  if (!(await ensureClosed()))
    throw new Error("Der serielle Port ist noch belegt. Bitte die Seite neu laden (⌘R) und direkt flashen, ohne vorher zu verbinden.");
  onLog("Port frei\n");

  // Chip in den Bootloader holen: der Auto-Reset greift beim CH340 oft nicht.
  try {
    await port.open({ baudRate: 115200 });
    await port.setSignals({ dataTerminalReady: false, requestToSend: true });
    await new Promise((r) => setTimeout(r, 120));
    await port.setSignals({ dataTerminalReady: true, requestToSend: false });
    await new Promise((r) => setTimeout(r, 120));
    await port.setSignals({ dataTerminalReady: false, requestToSend: false });
    await new Promise((r) => setTimeout(r, 120));
    onLog("Bootloader-Reset ausgelöst\n");
  } catch (e) {
    onLog("Reset übersprungen: " + (e as Error).message + "\n");
  }
  await ensureClosed();
  await new Promise((r) => setTimeout(r, 300));

  // Ein Versuch je Geschwindigkeit: schnell zuerst, bei Übertragungsfehlern langsamer.
  // "Serial data stream stopped" heißt fast immer: Baudrate zu hoch für Kabel/Adapter.
  const tempi = [460800, 230400, 115200];
  let letzterFehler: Error | null = null;

  for (const baud of tempi) {
    await ensureClosed();
    await new Promise((r) => setTimeout(r, 300));
    const transport = new Transport(port, false);
    const loader = new ESPLoader({
      transport,
      baudrate: baud,
      terminal: { clean: () => {}, write: (d: string) => onLog(d), writeLine: (d: string) => onLog(d + "\n") },
      debugLogging: false,
    } as any);

    try {
      onLog(`\n— Versuch mit ${baud} Baud —\n`);
      const chip = await Promise.race([
        loader.main(),
        new Promise<never>((_, rej) => setTimeout(() => rej(new Error(
          "Gerät meldet sich nicht. Meist hilft: USB-Kabel kurz abziehen und wieder anstecken, dann erneut flashen. " +
          "Falls das Board einen BOOT-Knopf hat: beim Flashen gedrückt halten."
        )), 20000)),
      ]) as string;
      onLog(`Chip: ${chip}\n`);
      await loader.writeFlash({
        fileArray: [{ data: firmware, address: 0x10000 }],
        flashMode: "keep",
        flashFreq: "keep",
        flashSize: "keep",
        eraseAll: false,
        compress: true,
        reportProgress: (_i: number, written: number, total: number) => onProgress(Math.round((written / total) * 100)),
      } as any);
      await loader.after("hard_reset");
      await transport.disconnect();

      // Der Auto-Reset von esptool greift bei diesem Board nicht zuverlässig.
      // Deshalb den Reset selbst fahren: EN kurz auf Masse, DTR bleibt aus,
      // damit der Chip normal startet statt wieder im Bootloader zu landen.
      try {
        await ensureClosed();
        await port.open({ baudRate: 115200 });
        await port.setSignals({ dataTerminalReady: false, requestToSend: true });   // EN low
        await new Promise((r) => setTimeout(r, 150));
        await port.setSignals({ dataTerminalReady: false, requestToSend: false });  // EN high -> Start
        await new Promise((r) => setTimeout(r, 200));
        await port.close();
        onLog("Neustart ausgelöst\n");
      } catch (e) {
        onLog("Neustart-Versuch fehlgeschlagen: " + (e as Error).message + "\n");
      }

      onLog("\nFertig.\n");
      return;
    } catch (e) {
      letzterFehler = e as Error;
      onLog(`\nBei ${baud} Baud fehlgeschlagen: ${letzterFehler.message}\n`);
      try { await transport.disconnect(); } catch { /* egal */ }
      // Nur bei Übertragungsproblemen langsamer probieren
      if (!/stream stopped|noise|corruption|timed out|invalid head|packet/i.test(letzterFehler.message)) throw letzterFehler;
    }
  }
  throw letzterFehler ?? new Error("Flashen fehlgeschlagen");
}
