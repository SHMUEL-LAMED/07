import http from "node:http";
import { Readable } from "node:stream";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const ADMIN_HTML = readFileSync(new URL("./admin.html", import.meta.url), "utf8");

const PORT = Number(process.env.PORT || 3000);
const TARGET = (process.env.TARGET_BASE || "https://yemot-ai.smwlyqswkwt232.workers.dev").replace(/\/$/, "");
const ALLOWED_ORIGIN = "https://shmuel-lamed.github.io";
const SELF_ORIGIN = "https://07-admin-bridge-production.up.railway.app";

function corsHeaders(origin) {
  if (origin !== ALLOWED_ORIGIN) return {};
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type, X-Requested-With",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin"
  };
}

const server = http.createServer(async (req, res) => {
  const origin = req.headers.origin || "";

  if (req.url === "/health") {
    res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("ok");
    return;
  }

  if (req.url === "/" || req.url === "/admin" || req.url === "/admin/") {
    res.writeHead(200, {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store"
    });
    res.end(ADMIN_HTML);
    return;
  }


  if (req.method === "OPTIONS") {
    if (origin && origin !== ALLOWED_ORIGIN && origin !== SELF_ORIGIN) {
      res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("forbidden");
      return;
    }
    res.writeHead(204, corsHeaders(origin));
    res.end();
    return;
  }

  if (origin && origin !== ALLOWED_ORIGIN && origin !== SELF_ORIGIN) {
    res.writeHead(403, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ error: "מקור לא מורשה" }));
    return;
  }

  const incoming = new URL(req.url, "http://proxy.local");
  if (!incoming.pathname.startsWith("/admin/api/")) {
    res.writeHead(404, { "Content-Type": "application/json; charset=utf-8", ...corsHeaders(origin) });
    res.end(JSON.stringify({ error: "לא נמצא" }));
    return;
  }

  try {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = chunks.length ? Buffer.concat(chunks) : undefined;

    const headers = new Headers();
    const token = incoming.searchParams.get("token") || "";
    incoming.searchParams.delete("token");
    if (token) headers.set("authorization", "Bearer " + token);
    if (req.headers.accept) headers.set("accept", Array.isArray(req.headers.accept) ? req.headers.accept.join(",") : req.headers.accept);
    if (req.method === "POST") {
      headers.set("content-type", "application/json");
      headers.set("x-requested-with", "dash");
    }

    const upstreamUrl = TARGET + incoming.pathname + (incoming.searchParams.toString() ? "?" + incoming.searchParams.toString() : "");
    const upstream = await fetch(upstreamUrl, {
      method: req.method,
      headers,
      body: req.method === "GET" || req.method === "HEAD" ? undefined : body,
      redirect: "manual"
    });

    const out = {
      ...corsHeaders(origin),
      "Cache-Control": upstream.headers.get("cache-control") || "no-store",
      "Content-Type": upstream.headers.get("content-type") || "application/octet-stream"
    };
    const cd = upstream.headers.get("content-disposition");
    if (cd) out["Content-Disposition"] = cd;

    res.writeHead(upstream.status, out);
    if (!upstream.body) {
      res.end();
      return;
    }
    Readable.fromWeb(upstream.body).pipe(res);
  } catch (err) {
    res.writeHead(502, { "Content-Type": "application/json; charset=utf-8", ...corsHeaders(origin) });
    res.end(JSON.stringify({ error: "proxy error" }));
  }
});

server.listen(PORT, "0.0.0.0", () => {
  console.log("07 admin proxy listening on", PORT);
});
