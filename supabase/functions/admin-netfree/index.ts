// גשר בין GitHub Pages (https://shmuel-lamed.github.io/07/) ל-Worker של Cloudflare, כי נטפרי חוסם workers.dev.
// הדפדפן שולח את אסימון הכניסה בפרמטר token (בלי כותרות מיוחדות, בלי preflight),
// והגשר מעביר אותו ל-Worker ככותרת Authorization: Bearer. הסיסמה עצמה עוברת רק ב-/session ולא נשמרת כאן.
// פריסה: Supabase MCP / `supabase functions deploy admin-netfree --no-verify-jwt`.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const TARGET = "https://yemot-ai.smwlyqswkwt232.workers.dev";
const GH_ORIGIN = "https://shmuel-lamed.github.io";
const FN = "/admin-netfree";
// כל נתיבי ה-API של דף הניהול: מילה אחת באותיות קטנות (ה-Worker עצמו בודק הרשאה לכל נתיב)
const ROUTES = /^\/[a-z][a-z0-9_]{1,30}$/;

const cors = () => ({
  "access-control-allow-origin": GH_ORIGIN,
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-headers": "content-type, range",
  "access-control-expose-headers": "content-length, content-range, accept-ranges, content-disposition",
  "access-control-max-age": "86400",
  "vary": "Origin",
});
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { ...cors(), "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
});

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors() });
  const u = new URL(req.url);
  const i = u.pathname.indexOf(FN);
  let rest = i >= 0 ? u.pathname.slice(i + FN.length) : u.pathname;
  if (!rest.startsWith("/")) rest = "/" + rest;
  if (!ROUTES.test(rest)) return json({ error: "לא נמצא", path: rest }, 404);
  if (req.method !== "GET" && req.method !== "POST") return json({ error: "שיטה לא מורשית" }, 405);

  const token = u.searchParams.get("token") || "";
  u.searchParams.delete("token");
  const upstream = new URL(TARGET + "/admin/api" + rest);
  for (const [k, v] of u.searchParams) upstream.searchParams.append(k, v);

  const headers = new Headers();
  if (token) headers.set("authorization", "Bearer " + token);
  // הכתובת האמיתית של הדפדפן (הראשונה ב-x-forwarded-for). ה-Worker סומך עליה רק עם הסוד המשותף BRIDGE_KEY
  const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim();
  const bridgeKey = Deno.env.get("BRIDGE_KEY") || "";
  if (ip && bridgeKey) { headers.set("x-client-ip", ip); headers.set("x-bridge-key", bridgeKey); }
  const range = req.headers.get("range");
  if (range) headers.set("range", range);
  let body: Uint8Array | undefined;
  if (req.method === "POST") {
    headers.set("content-type", "application/json");
    headers.set("x-requested-with", "dash");
    body = new Uint8Array(await req.arrayBuffer());
  }

  try {
    const r = await fetch(upstream, { method: req.method, headers, body, redirect: "manual" });
    const out = new Headers(cors());
    for (const h of ["content-type", "cache-control", "content-disposition", "content-length", "content-range", "accept-ranges"]) {
      const v = r.headers.get(h);
      if (v) out.set(h, v);
    }
    if (!out.has("cache-control")) out.set("cache-control", "no-store");
    return new Response(r.body, { status: r.status, headers: out });
  } catch (e) {
    console.error(e);
    return json({ error: "שגיאת חיבור לשרת" }, 502);
  }
});
