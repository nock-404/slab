// WebSerial-Verbindung zum CYD — pusht Layout-JSON mit STX/ETX-Rahmen.
// Chrome/Edge only (WebSerial). Firmware antwortet "OK <n>".

const STX = 0x02;
const ETX = 0x03;

/* eslint-disable @typescript-eslint/no-explicit-any */
export class DeviceLink {
  port: any = null;
  writer: any = null;
  reader: any = null;
  onLine: (s: string) => void = () => {};
  /** Zusätzliche Zuhörer — überschreiben onLine nicht, sondern hören mit. */
  private zuhoerer = new Set<(s: string) => void>();
  lauschen(fn: (s: string) => void): () => void {
    this.zuhoerer.add(fn);
    return () => { this.zuhoerer.delete(fn); };
  }
  onClose: () => void = () => {};
  private readTask: Promise<void> | null = null;

  get connected() {
    return !!this.port;
  }

  /**
   * Verbinden. Wurde für dieses Gerät schon einmal die Erlaubnis erteilt, merkt der
   * Browser sie sich — dann geht es ohne Auswahlfenster. Sonst wird gefragt.
   */
  async connect() {
    const nav = navigator as any;
    if (!nav.serial) throw new Error("WebSerial nicht verfügbar (Chrome/Edge nötig)");
    const bekannt: any[] = await nav.serial.getPorts().catch(() => []);
    const port: any = bekannt.length === 1 ? bekannt[0] : await nav.serial.requestPort();
    await port.open({ baudRate: 115200 });
    this.port = port;
    this.writer = port.writable.getWriter();
    this.readTask = this.readLoop(port);
  }

  private async readLoop(port: any) {
    const reader = port.readable!.getReader();
    this.reader = reader;
    const dec = new TextDecoder();
    let buf = "";
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value);
        let nl;
        while ((nl = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (line) { this.onLine(line); this.zuhoerer.forEach((z) => z(line)); }
        }
      }
    } catch {
      /* getrennt */
    } finally {
      // Gerät abgezogen oder Port verloren -> Zustand melden
      this.port = null; this.reader = null; this.writer = null;
      this.onClose();
    }
  }

  async push(json: string): Promise<void> {
    if (!this.writer) throw new Error("nicht verbunden");
    const body = new TextEncoder().encode(json);
    const frame = new Uint8Array(body.length + 2);
    frame[0] = STX;
    frame.set(body, 1);
    frame[body.length + 1] = ETX;
    await this.writer.write(frame);
  }

  /**
   * Senden und auf die Antwort des Geräts warten.
   * Ohne das meldet die App Erfolg, obwohl nichts angekommen ist.
   */
  async pushUndWarten(json: string, timeoutMs = 15000): Promise<string> {
    if (!this.writer) throw new Error("nicht verbunden");
    return new Promise<string>((ok, fehler) => {
      const ab = this.lauschen((zeile) => {
        if (zeile.startsWith("OK")) fertig(() => ok(zeile));
        else if (zeile.startsWith("ERR")) fertig(() => fehler(new Error("Gerät meldet: " + zeile)));
      });
      const t = setTimeout(() => fertig(() => fehler(new Error("Gerät hat nicht geantwortet"))), timeoutMs);
      const fertig = (fn: () => void) => { clearTimeout(t); ab(); fn(); };
      this.push(json).catch((e) => fertig(() => fehler(e)));
    });
  }

  /** Auf eine bestimmte Antwortzeile warten (z.B. die Bestätigung einer Schriftdatei). */
  warteAufZeile(muster: RegExp, timeoutMs = 30000): Promise<string> {
    return new Promise<string>((ok, fehler) => {
      const ab = this.lauschen((zeile) => { if (muster.test(zeile)) fertig(() => ok(zeile)); });
      const t = setTimeout(() => fertig(() => fehler(new Error("Gerät hat nicht geantwortet"))), timeoutMs);
      const fertig = (fn: () => void) => { clearTimeout(t); ab(); fn(); };
    });
  }

  /**
   * Datei blockweise senden. Das Gerät bestätigt jeden Block mit "ACK <bisher> <gesamt>";
   * erst danach geht der nächste raus. Dadurch regelt sich das Tempo von selbst —
   * kein geratener Wartewert, kein Pufferüberlauf.
   */
  async sendeDatei(daten: Uint8Array, fortschritt?: (anteil: number) => void): Promise<void> {
    if (!this.writer) throw new Error("nicht verbunden");
    const BLOCK = 1024;
    let ab = 0;
    while (ab < daten.length) {
      const quittung = this.warteAufZeile(/^ACK \d+/, 10000);
      await this.writer.write(daten.slice(ab, ab + BLOCK));
      const zeile = await quittung;
      const stand = Number(zeile.split(/\s+/)[1]);
      if (!Number.isFinite(stand) || stand <= ab) throw new Error("Gerät bestätigt nicht — Übertragung abgebrochen");
      ab = stand;
      fortschritt?.(ab / daten.length);
    }
  }

  /** Port freigeben, aber Objekt behalten — für Flashen nötig (Transport braucht geschlossenen Port). */
  /** Port freigeben und WIRKLICH schließen — Voraussetzung fürs Flashen. */
  async release(): Promise<any> {
    const p = this.port;
    if (!p) return null;
    // 1) Lesen abbrechen und abwarten, bis die Schleife durch ist (sonst bleibt der Lock)
    try { await this.reader?.cancel(); } catch { /* schon zu */ }
    try { await this.readTask; } catch { /* egal */ }
    this.readTask = null;
    // 2) Schreiber lösen
    try { await this.writer?.close(); } catch { /* egal */ }
    try { this.writer?.releaseLock(); } catch { /* egal */ }
    this.reader = null; this.writer = null; this.port = null;
    // 3) Schließen — und diesmal Fehler NICHT verschlucken
    for (let i = 0; i < 5; i++) {
      try { await p.close(); return p; }
      catch { await new Promise((r) => setTimeout(r, 200)); }
    }
    throw new Error("Serieller Port ließ sich nicht schließen. Seite neu laden und erneut versuchen.");
  }

  /** Nach dem Flashen: denselben Port wieder als Datenlink öffnen. */
  async reopen(port: any) {
    await port.open({ baudRate: 115200 });
    this.port = port;
    this.writer = port.writable.getWriter();
    this.readTask = this.readLoop(port);
  }

  async disconnect() {
    try {
      await this.reader?.cancel();
      this.reader?.releaseLock();
      this.writer?.releaseLock();
      await this.port?.close();
    } catch {
      /* egal */
    }
    this.port = null;
    this.writer = null;
    this.reader = null;
  }
}
