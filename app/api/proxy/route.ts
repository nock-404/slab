// LAN-/API-Proxy: der Browser darf von localhost nicht direkt auf private Netzadressen (CORS + Private Network
// Access), und Auth-Header gehören nicht in den Client. Deshalb holt der Next-Server die Daten.
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  let cfg: {
    url: string;
    method?: string;
    body?: string;
    auth?: { kind: string; token?: string; user?: string; pass?: string; headerName?: string; headerValue?: string; queryName?: string; queryValue?: string };
    headers?: { k: string; v: string }[];
  };
  try { cfg = await req.json(); } catch { return NextResponse.json({ error: "ungültiger Body" }, { status: 400 }); }
  if (!cfg?.url) return NextResponse.json({ error: "url fehlt" }, { status: 400 });

  let u: URL;
  try { u = new URL(cfg.url); } catch { return NextResponse.json({ error: "ungültige url" }, { status: 400 }); }
  if (!/^https?:$/.test(u.protocol)) return NextResponse.json({ error: "nur http/https" }, { status: 400 });

  const headers: Record<string, string> = { accept: "application/json" };
  for (const h of cfg.headers ?? []) if (h.k) headers[h.k] = h.v;

  const a = cfg.auth;
  if (a) {
    if (a.kind === "bearer" && a.token) headers.authorization = `Bearer ${a.token}`;
    else if (a.kind === "basic" && a.user !== undefined) headers.authorization = "Basic " + Buffer.from(`${a.user}:${a.pass ?? ""}`).toString("base64");
    else if (a.kind === "header" && a.headerName) headers[a.headerName] = a.headerValue ?? "";
    else if (a.kind === "query" && a.queryName) u.searchParams.set(a.queryName, a.queryValue ?? "");
  }

  const method = (cfg.method ?? "GET").toUpperCase();
  if (method === "POST") headers["content-type"] = headers["content-type"] ?? "application/json";

  try {
    const r = await fetch(u.toString(), {
      method,
      headers,
      body: method === "POST" ? cfg.body ?? "" : undefined,
      signal: AbortSignal.timeout(8000),
    });
    const text = await r.text();
    return new NextResponse(text, {
      status: r.status,
      headers: { "content-type": r.headers.get("content-type") ?? "application/json", "cache-control": "no-store" },
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
