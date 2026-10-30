// Central Google identity and line directory. Sessions are independent of line-admin tokens.
import { kvGetRemote, kvPut, setSuspended } from "./factory.js";
const TTL = 30 * 86400;
const keyOf = token => "portal_session:" + token;
const normalize = email => String(email || "").trim().toLowerCase();
const LEGACY_LINES = [
  { slug: "shimchas", name: "שימחס", line: "073-351-2880", url: "/07/source/", api: "https://ydcfafijktzasrkkxyux.supabase.co/functions/v1/admin-netfree/" },
  { slug: "daat", name: "דעת תורה", line: "079-494-7582", url: "/07/daattorah/", api: "https://ydcfafijktzasrkkxyux.supabase.co/functions/v1/admin-netfree-daat/" }
];
const publicLine = line => ({ slug: line.slug, name: line.name, line: line.line,
  enabled: line.enabled !== false, legacy: !!line.legacy, api: line.api || null,
  url: line.url || "/07/line/?l=" + encodeURIComponent(line.slug),
  manager: line.ownerEmail || "", created: line.created || 0, test: line.test !== false });
// הקווים הוותיקים (לא מהמפעל). ל-KV של דעת תורה מגיעים לפי שם ה-Worker שלו
const LEGACY = LEGACY_LINES.map(l => ({ ...l, legacy: true, enabled: true, script: l.slug === "daat" ? "yemot-ai-daat" : undefined }));
const emailsOf = raw => { let a; try { a = typeof raw === "string" ? JSON.parse(raw) : raw; } catch { a = []; }
  return (Array.isArray(a) ? a : []).map(m => typeof m === "string" ? { e: normalize(m), role: "admin" } : { e: normalize(m && m.e), role: m && m.role === "viewer" ? "viewer" : "admin" }).filter(m => m.e); };
const cfReady = env => !!(env.CF_FACTORY_TOKEN && env.CF_ACCOUNT_ID);
// מזהה ה-KV של קו דעת תורה (נשמר אחרי הפעם הראשונה)
async function legacyKv(env, script) {
  const k = "portal_kv:" + script, cached = await env.KV.get(k);
  if (cached) return cached;
  const r = await fetch("https://api.cloudflare.com/client/v4/accounts/" + env.CF_ACCOUNT_ID + "/workers/scripts/" + script + "/settings", { headers: { Authorization: "Bearer " + env.CF_FACTORY_TOKEN } });
  const j = await r.json().catch(() => ({}));
  const b = ((j.result || {}).bindings || []).find(x => x.type === "kv_namespace" && x.name === "KV");
  if (!b) return "";
  await env.KV.put(k, b.namespace_id);
  return b.namespace_id;
}
// לאילו קווים יש לחשבון גישה: מנהלי הדף של כל קו (גם מי שמנהל קו הוסיף בעצמו), ומנהל הקו שנקבע בבנייה
async function accessOf(env, email, lines) {
  const out = [];
  const has = list => emailsOf(list).find(m => m.e === email);
  const m0 = has(await env.KV.get("dash_emails"));
  if (m0) out.push({ slug: "shimchas", role: m0.role });
  if (!cfReady(env)) return out.concat(lines.filter(l => normalize(l.ownerEmail) === email).map(l => ({ slug: l.slug, role: "admin" })));
  const checks = [...lines.filter(l => l.kv).map(l => ({ slug: l.slug, kv: l.kv, owner: normalize(l.ownerEmail) })),
    ...LEGACY.filter(l => l.script).map(l => ({ slug: l.slug, script: l.script }))];
  await Promise.all(checks.map(async c => {
    try {
      const id = c.kv || await legacyKv(env, c.script);
      const m = id && has(await kvGetRemote(env, id, "dash_emails"));
      if (m) out.push({ slug: c.slug, role: m.role });
    } catch {} // קו שלא ענה – פשוט לא מופיע
  }));
  return out;
}
const reply = (value, status = 200) => new Response(JSON.stringify(value), {
  status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
});
async function syncClientLines(env, lines, email, slugs) {
  for (const line of lines) {
    if (!line.kv) continue;
    const old = await env.KV.get("portal_synced:" + email + ":" + line.slug);
    const endpoint = "https://api.cloudflare.com/client/v4/accounts/" + env.CF_ACCOUNT_ID + "/storage/kv/namespaces/" + line.kv + "/values/dash_emails";
    const headers = { Authorization: "Bearer " + env.CF_FACTORY_TOKEN };
    const current = await fetch(endpoint, { headers });
    if (!current.ok && current.status !== 404) throw new Error("לא ניתן לקרוא הרשאות קו");
    let managers = current.status === 404 ? [] : await current.json().catch(() => []);
    if (!Array.isArray(managers)) managers = [];
    if (slugs.includes(line.slug) || old) {
      managers = managers.filter(m => (typeof m === "string" ? m : m.e) !== email);
      if (slugs.includes(line.slug)) managers.push({ e: email, role: "admin" });
    }
    const saved = await fetch(endpoint, { method: "PUT", headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify(managers) });
    if (!saved.ok) throw new Error("לא ניתן לעדכן הרשאות קו");
    if (slugs.includes(line.slug)) await env.KV.put("portal_synced:" + email + ":" + line.slug, "1");
    else if (old) await env.KV.delete("portal_synced:" + email + ":" + line.slug);
  }
}
async function syncClientBlock(env, lines, email, blocked) {
  const headers = { Authorization: "Bearer " + env.CF_FACTORY_TOKEN };
  for (const line of lines) {
    if (!line.kv) continue;
    const url = "https://api.cloudflare.com/client/v4/accounts/" + env.CF_ACCOUNT_ID + "/storage/kv/namespaces/" + line.kv + "/values/" + encodeURIComponent("portal_blocked:" + email);
    const r = await fetch(url, blocked ? { method: "PUT", headers: { ...headers, "Content-Type": "text/plain" }, body: "1" } : { method: "DELETE", headers });
    if (!r.ok) throw new Error("לא ניתן לעדכן חסימת גישה בקו " + line.name);
  }
}
async function revokeClientSessions(env, email) {
  let cursor;
  do {
    const page = await env.KV.list({ prefix: "portal_session:", cursor });
    for (const item of page.keys) {
      const session = await env.KV.get(item.name, "json");
      if (normalize(session?.email) === email) await env.KV.delete(item.name);
    }
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
}
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
    const approved = email === owner || !!(await env.KV.get("portal_approved:" + email)) ||
      (await accessOf(env, email, await readLines())).length > 0; // מנהל שנוסף בתוך קו – בלי אישור נפרד
    if (blocked) return reply({ error: "הגישה לשירות הושעתה" }, 403);
    if (!approved) return reply({ error: "החשבון עדיין לא אושר לשירות. בקש מבעל השירות לאשר את הגישה." }, 403);
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
  const available = [...lines, ...LEGACY];
  const access = isOwner ? [] : await accessOf(env, session.email, lines);
  const viaLine = new Set(access.map(a => a.slug));
  // רק קווים שהחשבון באמת יכול להיכנס אליהם: רשום ברשימת המנהלים של הקו עצמו.
  // שיוך במרכז או מנהל מהבנייה לא מספיקים – מנהל הקו יכול להסיר אותו מהקו, ואז הקו לא מוצג.
  // בלי חיבור ל-Cloudflare אי אפשר לבדוק קווים אחרים, ואז נשארים עם השיוך (חוץ משימחס, שנבדק תמיד)
  const strict = cfReady(env);
  const allowed = isOwner ? available : [
    ...LEGACY.filter(l => viaLine.has(l.slug) || (!strict && l.slug !== "shimchas" && memberships.includes(l.slug))),
    ...lines.filter(l => viaLine.has(l.slug) || (!strict && (normalize(l.ownerEmail) === session.email || memberships.includes(l.slug))))];
  if (action === "me") {
    // The service owner must be recognized by every independent line Worker too,
    // so the same Google credential can open each line dashboard.
    if (isOwner) {
      try { await syncClientLines(env, lines, owner, lines.map(l => l.slug)); }
      catch (e) { return reply({ error: String(e.message || "לא ניתן לסנכרן את הרשאות בעל השירות לקווים") }, 502); }
    }
    if (!isOwner) return reply({ email: session.email, isOwner, lines: allowed.map(publicLine) });
    const accounts = await env.KV.list({ prefix: "portal_approved:" });
    const clients = [];
    for (const item of accounts.keys) {
      const email = item.name.slice("portal_approved:".length);
      clients.push({ email, lines: await env.KV.get("portal_memberships:" + email, "json") || [],
        blocked: !!(await env.KV.get("portal_blocked:" + email)) });
    }
    return reply({ email: session.email, isOwner, lines: allowed.map(publicLine), clients });
  }
  // All service-level operations enforce owner permission server-side.
  if (!isOwner) return reply({ error: "אין הרשאה למרכז הבעלים" }, 403);
  if (action === "access" && req.method === "POST") {
    const email = normalize(body.email);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email === owner)
      return reply({ error: "חשבון לא תקין" }, 400);
    const assigned = await env.KV.get("portal_memberships:" + email, "json") || [];
    if (body.blocked === true || body.approved === false) {
      // Block centrally first, then remove only memberships created by this portal.
      await env.KV.put("portal_blocked:" + email, "1");
      if (body.approved === false) await env.KV.delete("portal_approved:" + email);
      await revokeClientSessions(env, email);
      try { await syncClientBlock(env, lines, email, true); }
      catch (e) { return reply({ error: String(e.message || "הגישה נחסמה במרכז, אך לא בכל הקווים") }, 502); }
      try { await syncClientLines(env, lines, email, []); }
      catch (e) { return reply({ error: String(e.message || "הגישה נחסמה במרכז, אך סנכרון קו נכשל") }, 502); }
      if (body.approved === false) await env.KV.delete("portal_memberships:" + email);
    }
    if (body.approved === true) {
      await env.KV.put("portal_approved:" + email, "1");
      await env.KV.delete("portal_blocked:" + email);
      try { await syncClientBlock(env, lines, email, false); }
      catch (e) { return reply({ error: String(e.message || "החשבון אושר, אך לא ניתן לעדכן את הגישה בקווים") }, 502); }
    }
    if (body.blocked === false) {
      if (await env.KV.get("portal_approved:" + email)) {
        try { await syncClientLines(env, lines, email, assigned); }
        catch (e) { return reply({ error: String(e.message || "לא ניתן לשחזר את הרשאות הקווים") }, 502); }
        try { await syncClientBlock(env, lines, email, false); }
        catch (e) { return reply({ error: String(e.message || "לא ניתן לשחזר את הגישה בכל הקווים") }, 502); }
      }
      await env.KV.delete("portal_blocked:" + email);
    }
    return reply({ ok: true });
  }
  if ((action === "suspend" || action === "resume") && req.method === "POST") {
    const line = lines.find(l => l.slug === body.slug);
    if (!line) return reply({ error: "אפשר להשהות רק קווים שנבנו במפעל" }, 400);
    if (action === "suspend" && String(body.confirm || "") !== line.slug) return reply({ error: "להשהיה יש להקליד את השם הקצר של הקו" }, 400);
    try { return reply(await setSuspended(env, line.slug, action === "suspend")); }
    catch (e) { return reply({ error: String(e.message || "הפעולה נכשלה") }, 502); }
  }
  if (action === "assign" && req.method === "POST") {
    const email = normalize(body.email), slugs = [...new Set(Array.isArray(body.lines) ? body.lines : [])];
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || slugs.some(s => !available.some(l => l.slug === s)))
      return reply({ error: "חשבון או קו לא תקינים" }, 400);
    try { await syncClientLines(env, lines, email, slugs.filter(s => lines.some(l => l.slug === s))); }
    catch (e) { return reply({ error: String(e.message || "עדכון הרשאות נכשל") }, 502); }
    await env.KV.put("portal_memberships:" + email, JSON.stringify(slugs));
    return reply({ ok: true });
  }
  if (action === "copy" && req.method === "POST") return reply(await copySettings(env, lines, body));
  return reply({ error: "פעולה לא מוכרת" }, 404);
}
// שכפול הגדרות בין קווים (רק בעל השירות). קודם תצוגה מקדימה, ואז כתיבה רק אחרי הקלדת השם הקצר של קו היעד.
// הערך הקודם בקו היעד נשמר ב-copybak:<מפתח> לשבוע, כדי שאפשר יהיה להחזיר
const COPY_KEYS = { rules: "כללי העוזר", scheduled: "תזמונים פעילים", strict: "הגדרות בדיקת ההודעות", ads: "פרסומות", event: "אירוע (שלוחה 9)" };
async function kvOfLine(env, lines, slug) {
  if (slug === "shimchas") return { get: k => env.KV.get(k), put: (k, v, o) => env.KV.put(k, v, o) };
  const l = lines.find(x => x.slug === slug), legacy = LEGACY.find(x => x.slug === slug && x.script);
  const id = l ? l.kv : legacy && cfReady(env) ? await legacyKv(env, legacy.script) : "";
  if (!id) throw new Error("אין גישה ל-KV של הקו " + slug);
  return { get: k => kvGetRemote(env, id, k), put: (k, v) => kvPut(env, id, k, v) };
}
async function copySettings(env, lines, body) {
  const from = String(body.from || ""), to = String(body.to || ""), keys = (Array.isArray(body.keys) ? body.keys : []).filter(k => COPY_KEYS[k]);
  if (!from || !to || from === to) return { error: "צריך לבחור קו מקור וקו יעד שונים" };
  if (!keys.length) return { error: "לא נבחר מה להעתיק", keys: COPY_KEYS };
  let src, dst; try { [src, dst] = await Promise.all([kvOfLine(env, lines, from), kvOfLine(env, lines, to)]); } catch (e) { return { error: e.message }; }
  const out = [];
  for (const k of keys) {
    let v = await src.get(k), old = await dst.get(k);
    if (k === "scheduled" && v) { try { v = JSON.stringify(JSON.parse(v).filter(j => !j.done && !j.phone)); } catch {} } // בלי משימות שבוצעו ובלי הודעות אישיות לטלפון מסוים
    const n = s => { try { const j = JSON.parse(s); return Array.isArray(j) ? j.length + " פריטים" : j ? "יש" : "ריק"; } catch { return s ? "יש" : "ריק"; } };
    out.push({ k, label: COPY_KEYS[k], from: n(v), to: n(old), same: v === old, _v: v, _old: old });
  }
  if (body.preview !== false) return { preview: true, items: out.map(({ _v, _old, ...x }) => x) };
  if (String(body.confirm || "") !== to) return { error: "לאישור יש להקליד את השם הקצר של קו היעד" };
  const done = [];
  for (const x of out) {
    if (x.same || x._v == null) continue;
    if (x._old != null) await dst.put("copybak:" + x.k, x._old, { expirationTtl: 7 * 86400 });
    await dst.put(x.k, x._v); done.push(x.label);
  }
  return { ok: true, done };
}
