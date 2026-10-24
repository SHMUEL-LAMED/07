// Central Google identity and line directory. Sessions are independent of line-admin tokens.
const TTL = 30 * 86400;
const keyOf = token => "portal_session:" + token;
const normalize = email => String(email || "").trim().toLowerCase();
const publicLine = line => ({ slug: line.slug, name: line.name, line: line.line,
  enabled: line.enabled !== false, url: "/07/line/?l=" + encodeURIComponent(line.slug) });
const reply = (value, status = 200) => new Response(JSON.stringify(value), {
  status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
});
const randomToken = () => {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, n => n.toString(16).padStart(2, "0")).join("");
};
export async function portal(req, env, verifyGoogle) {
  const u = new URL(req.url), action = u.searchParams.get("action") || "me";
  const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
  const readLines = async () => await env.KV.get("factory_lines", "json") || [];
  const owner = normalize(env.OWNER_EMAIL);
  if (action === "login") {
    if (req.method !== "POST") return reply({ error: "שיטה לא מורשית" }, 405);
    let email;
    try { email = normalize(await verifyGoogle(env, body.google)); }
    catch { return reply({ error: "לא ניתן לאמת את חשבון גוגל" }, 401); }
    const blocked = await env.KV.get("portal_blocked:" + email);
    if (blocked) return reply({ error: "הגישה לשירות הושעתה" }, 403);
    const token = randomToken();
    await env.KV.put(keyOf(token), JSON.stringify({ email, exp: Date.now() + TTL * 1000 }), { expirationTtl: TTL });
    // Google credentials are never persisted.
    return reply({ token, email, isOwner: !!owner && email === owner });
  }
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "") || u.searchParams.get("token") || "";
  if (!/^[a-f0-9]{64}$/.test(token)) return reply({ error: "נדרשת כניסה" }, 401);
  const session = await env.KV.get(keyOf(token), "json");
  if (!session || session.exp <= Date.now()) return reply({ error: "החיבור פג" }, 401);
  if (await env.KV.get("portal_blocked:" + session.email)) return reply({ error: "הגישה לשירות הושעתה" }, 403);
  const isOwner = !!owner && session.email === owner;
  if (action === "logout") {
    if (req.method !== "POST") return reply({ error: "שיטה לא מורשית" }, 405);
    await env.KV.delete(keyOf(token));
    return reply({ ok: true });
  }
  const lines = await readLines();
  const memberships = await env.KV.get("portal_memberships:" + session.email, "json") || [];
  const allowed = isOwner ? lines : lines.filter(l => l.enabled !== false &&
    (normalize(l.ownerEmail) === session.email || memberships.includes(l.slug)));
  if (action === "me") return reply({ email: session.email, isOwner, lines: allowed.map(publicLine) });
  // All service-level operations enforce owner permission server-side.
  if (!isOwner) return reply({ error: "אין הרשאה למרכז הבעלים" }, 403);
  if (action === "access" && req.method === "POST") {
    const email = normalize(body.email);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email === owner)
      return reply({ error: "חשבון לא תקין" }, 400);
    if (body.blocked === true) await env.KV.put("portal_blocked:" + email, "1");
    else await env.KV.delete("portal_blocked:" + email);
    return reply({ ok: true });
  }
  if (action === "assign" && req.method === "POST") {
    const email = normalize(body.email), slugs = [...new Set(Array.isArray(body.lines) ? body.lines : [])];
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || slugs.some(s => !lines.some(l => l.slug === s)))
      return reply({ error: "חשבון או קו לא תקינים" }, 400);
    await env.KV.put("portal_memberships:" + email, JSON.stringify(slugs));
    return reply({ ok: true });
  }
  return reply({ error: "פעולה לא מוכרת" }, 404);
}
