// דף הניהול של הקו (/admin): כניסה בסיסמה עם cookie חתום, ו-API ב-JSON לדף עצמו (src/dash.html).
// הסיסמה היא הסוד ADMIN_PASS ב-Cloudflare. בלי הסוד – הדף נעול. RUN_KEY לא מופיע כאן בכלל.
// הפעולות עצמן (מחיקה, העברה, תזמון, השתקה...) עוברות דרך doAdmin ו-applyReview של worker.js,
// כך שההתנהגות זהה לפקודות הקוליות דרך העוזר ובשלוחה 7.
import PAGE from "./dash.html";

const COOKIE = "adm", TTL_DAYS = 30, MAX_FAILS = 6, FAIL_WINDOW = 15 * 60;
const enc = new TextEncoder();
const b64u = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const sha = async s => b64u(await crypto.subtle.digest("SHA-256", enc.encode(s)));
// השוואה בזמן קבוע, כדי שמשך הבדיקה לא ילמד כמה תווים נכונים
function same(a, b) { a = String(a); b = String(b); let r = a.length ^ b.length; for (let i = 0; i < Math.max(a.length, b.length); i++) r |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0); return r === 0; }
// חתימת ה-cookie נגזרת מהסיסמה: שינוי הסיסמה מנתק את כל המכשירים
async function sign(env, msg) {
  const raw = await crypto.subtle.digest("SHA-256", enc.encode("dash|" + env.ADMIN_PASS + "|" + (env.RUN_KEY || "")));
  const key = await crypto.subtle.importKey("raw", raw, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64u(await crypto.subtle.sign("HMAC", key, enc.encode(msg)));
}
// אסימון רגיל: exp.sig. אסימון צפייה בלבד (קישור לשיתוף): exp.ro.sig – מותר רק GET
async function newToken(env, ro = false, days = TTL_DAYS) { const exp = String(Date.now() + days * 864e5); return ro ? exp + ".ro." + await sign(env, "ro|" + exp) : exp + "." + await sign(env, exp); }
async function validToken(env, tok) {
  const parts = String(tok || "").split("."), exp = parts[0], ro = parts.length === 3 && parts[1] === "ro", sig = parts[parts.length - 1];
  if (!exp || !sig || parts.length > 3 || !(+exp > Date.now())) return null;
  return same(sig, await sign(env, ro ? "ro|" + exp : exp)) ? { ro, exp: +exp } : null;
}
const cookie = (req, name) => { const m = new RegExp("(?:^|;\\s*)" + name + "=([^;]*)").exec(req.headers.get("Cookie") || ""); return m ? m[1] : ""; };
const setCookie = tok => `${COOKIE}=${tok}; Path=/admin; Max-Age=${tok ? TTL_DAYS * 86400 : 0}; HttpOnly; Secure; SameSite=Lax`;
const html = (body, status = 200, headers = {}) => new Response(body, { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Frame-Options": "DENY", "Referrer-Policy": "no-referrer", ...headers } });
const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
const GH_ORIGIN = "https://shmuel-lamed.github.io";
const corsOrigin = req => req.headers.get("Origin") === GH_ORIGIN ? GH_ORIGIN : "";
function withCors(resp, req) {
  const origin = corsOrigin(req);
  if (!origin) return resp;
  const h = new Headers(resp.headers);
  h.set("Access-Control-Allow-Origin", origin);
  h.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  h.set("Access-Control-Allow-Headers", "Authorization, Content-Type, X-Requested-With");
  h.set("Access-Control-Max-Age", "86400");
  h.set("Vary", "Origin");
  return new Response(resp.body, { status: resp.status, statusText: resp.statusText, headers: h });
}
const redirect = (to, headers = {}) => new Response(null, { status: 303, headers: { Location: to, ...headers } });
const esc = t => String(t ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

const SMALL_CSS = `:root{color-scheme:light;--bg:#f9f9f7;--card:#fcfcfb;--ink:#0b0b0b;--mut:#52514e;--line:#e1e0d9;--acc:#2a78d6;--bad:#d03b3b}
@media(prefers-color-scheme:dark){:root{color-scheme:dark;--bg:#0d0d0d;--card:#1a1a19;--ink:#fff;--mut:#c3c2b7;--line:#2c2c2a;--acc:#3987e5;--bad:#e66767}}
*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;background:var(--bg);color:var(--ink);font:16px/1.5 system-ui,-apple-system,"Segoe UI",Arial,sans-serif;padding:16px}
.box{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:28px 24px;width:min(380px,100%);display:grid;gap:12px}h1{margin:0;font-size:20px}p{margin:0;color:var(--mut);font-size:14px}
input{font:inherit;padding:12px;border:1px solid var(--line);border-radius:10px;background:transparent;color:inherit;width:100%}button{font:inherit;font-weight:600;padding:12px;border:0;border-radius:10px;background:var(--acc);color:#fff;cursor:pointer}.err{color:var(--bad);font-size:14px}code{font-size:13px;background:var(--bg);padding:2px 6px;border-radius:6px}`;
const shell = inner => `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>ניהול קו הקבוצה</title><style>${SMALL_CSS}</style></head><body>${inner}</body></html>`;
const loginPage = (err = "") => shell(`<form class="box" method="post" action="/admin/login"><h1>ניהול קו הקבוצה</h1><p>073-351-2880</p>${err ? `<div class="err">${esc(err)}</div>` : ""}<input type="password" name="p" placeholder="סיסמה" autocomplete="current-password" autofocus required><button>כניסה</button></form>`);
const setupPage = shell(`<div class="box"><h1>דף הניהול נעול</h1><p>כדי להפעיל אותו צריך להגדיר סיסמה כסוד בשם <code>ADMIN_PASS</code> ב-Cloudflare: Workers &amp; Pages ← yemot-ai ← Settings ← Variables and Secrets (או <code>npx wrangler secret put ADMIN_PASS</code>). אחרי ההגדרה הדף נפתח מיד, בלי פריסה נוספת.</p></div>`);

// הגבלת ניסיונות כניסה לפי כתובת IP (נשמר ב-KV לרבע שעה)
const failKey = ip => "dash_fail:" + ip;
async function fails(env, ip) { try { return (await env.KV.get(failKey(ip), "json")) || { n: 0 }; } catch { return { n: 0 }; } }

export async function adminApp(req, env, ctx, u, parts, D) {
  const sub = parts[0] || "";
  if (!env.ADMIN_PASS) return html(setupPage, 503);
  const ip = req.headers.get("CF-Connecting-IP") || "?";
  // GitHub Pages frontend: exact-origin CORS + short-lived signed session token.
  if (sub === "api" && req.method === "OPTIONS") {
    if (!corsOrigin(req)) return json({ error: "מקור לא מורשה" }, 403);
    return withCors(new Response(null, { status: 204 }), req);
  }
  if (sub === "api" && parts[1] === "session") {
    const origin = req.headers.get("Origin") || "";
    if (origin && origin !== GH_ORIGIN) return json({ error: "מקור לא מורשה" }, 403);
    if (req.method !== "POST") return withCors(json({ error: "שיטה לא מורשית" }, 405), req);
    const f = await fails(env, ip);
    if (f.n >= MAX_FAILS) return withCors(json({ error: "יותר מדי ניסיונות. נסו שוב בעוד רבע שעה" }, 429), req);
    const body = await req.json().catch(() => ({}));
    const pass = String(body.password || "");
    if (!pass || !same(await sha(pass), await sha(env.ADMIN_PASS))) {
      await env.KV.put(failKey(ip), JSON.stringify({ n: f.n + 1 }), { expirationTtl: FAIL_WINDOW }).catch(() => {});
      await D.log(env, `ניסיון כניסה שגוי לדף הניהול מ-GitHub Pages (${ip})`).catch(() => {});
      return withCors(json({ error: "סיסמה שגויה" }, 401), req);
    }
    if (f.n) await env.KV.delete(failKey(ip)).catch(() => {});
    return withCors(json({ token: await newToken(env) }), req);
  }
  if (sub === "login") {
    if (req.method !== "POST") return redirect("/admin");
    const f = await fails(env, ip);
    if (f.n >= MAX_FAILS) return html(loginPage("יותר מדי ניסיונות. נסו שוב בעוד רבע שעה"), 429);
    const form = await req.formData().catch(() => null);
    const pass = String((form && form.get("p")) || "");
    if (!pass || !same(await sha(pass), await sha(env.ADMIN_PASS))) {
      await env.KV.put(failKey(ip), JSON.stringify({ n: f.n + 1 }), { expirationTtl: FAIL_WINDOW }).catch(() => {});
      await D.log(env, `ניסיון כניסה שגוי לדף הניהול (${ip})`).catch(() => {});
      return html(loginPage("סיסמה שגויה"), 401);
    }
    if (f.n) await env.KV.delete(failKey(ip)).catch(() => {});
    return redirect("/admin", { "Set-Cookie": setCookie(await newToken(env)) });
  }
  if (sub === "logout") return redirect("/admin", { "Set-Cookie": setCookie("") });
  const m = /^Bearer\s+(.+)$/i.exec(req.headers.get("Authorization") || "");
  const queryToken = sub === "api" && parts[1] === "audio" ? String(u.searchParams.get("token") || "") : "";
  const token = cookie(req, COOKIE) || (m && m[1]) || queryToken;
  const authed = await validToken(env, token);
  if (!authed) return sub === "api" ? withCors(json({ error: "לא מחובר" }, 401), req) : html(loginPage());
  if (sub === "api") {
    // אותו-origin כרגיל, או GitHub Pages המדויק בלבד.
    if (req.method === "POST" && req.headers.get("X-Requested-With") !== "dash") return withCors(json({ error: "בקשה לא תקינה" }, 400), req);
    const origin = req.headers.get("Origin") || "", gh = origin === GH_ORIGIN;
    const site = req.headers.get("Sec-Fetch-Site");
    if (site && site !== "same-origin" && site !== "none" && !gh) return withCors(json({ error: "בקשה לא תקינה" }, 403), req);
    if (authed.ro && req.method === "POST") return withCors(json({ error: "קישור לצפייה בלבד – אי אפשר לבצע פעולות" }, 403), req);
    try { return withCors(await api(req, env, ctx, u, parts[1] || "", D, authed), req); }
    catch (e) { return withCors(json({ error: String(e.message || e) }, 500), req); }
  }
  if (sub) return redirect("/admin");
  return html(PAGE);
}

// יומני הכניסה לשלוחות של ימות (LogFolderEnterExit-YYYY-MM.ymgr): שיחות לפי יום, שעה, חבר ושלוחה
async function callLog(env, D, months = 1, keys = null) {
  const [y, m] = D.nowIL().slice(0, 7).split("-").map(Number);
  if (!keys) { keys = []; for (let i = 0; i < months; i++) keys.push(new Date(Date.UTC(y, m - 1 - i, 1)).toISOString().slice(0, 7)); }
  const texts = await Promise.all(keys.map(k => D.ym(env, "GetTextFile", { what: `ivr2:/Log/LogFolderEnterExit-${k}.ymgr` }).then(r => (r && r.contents) || "").catch(() => "")));
  const calls = new Map(), last = {}, imp11 = [], ents = [];
  for (const txt of texts) for (const line of txt.split("\n")) {
    if (!line.includes("#")) continue;
    const d = Object.fromEntries(line.split("%").map(x => x.split("#")));
    if (!d.Phone || !d.EnterDate) continue;
    const [dd, mm, yy] = d.EnterDate.split("/"), day = `${yy}-${mm}-${dd}`, t = `${day} ${d.EnterTime || ""}`;
    if (!last[d.Phone] || last[d.Phone] < t) last[d.Phone] = t;
    if (d.Folder === "1/1") imp11.push({ p: d.Phone, t });
    ents.push({ p: d.Phone, t, f: d.Folder || "", x: d.ExitTime || "" });
    const id = d.CallId || t + d.Phone;
    let c = calls.get(id);
    if (!c) { c = { p: d.Phone, day, h: +(d.EnterTime || "0").slice(0, 2) || 0, folders: new Set() }; calls.set(id, c); }
    if (d.Folder) c.folders.add(d.Folder);
  }
  const per = {}, byDay = {}, byHour = Array(24).fill(0), byFolder = {}, callers = {};
  for (const c of calls.values()) {
    byDay[c.day] = (byDay[c.day] || 0) + 1; byHour[c.h] = (byHour[c.h] || 0) + 1; per[c.p] = (per[c.p] || 0) + 1;
    (callers[c.day] = callers[c.day] || new Set()).add(c.p);
    for (const f of c.folders) byFolder[f] = (byFolder[f] || 0) + 1;
  }
  return { last, per, byDay, byHour, byFolder, imp11, ents, callers: Object.fromEntries(Object.entries(callers).map(([k, s]) => [k, s.size])), total: calls.size, months: keys };
}
const membersList = (env, D) => D.ym(env, "TzintukimListManagement", { action: "getlistEnteres", TzintukimList: "members" }).then(r => r.enteres || []).catch(() => []);
const isPhone = p => /^0\d{8,9}$/.test(p);

async function api(req, env, ctx, u, name, D, auth = {}) {
  const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
  const nm = D.names(env), who = p => nm[p] || p || "לא ידוע";
  const admin = D.OWNER, VIA = "דף הניהול", now = Date.now();
  switch (name) {
    case "overview": {
      const [online, counts, joins, rsvp, ev, jobs, holy, deferred, undo, watch, allCount, members, admins] = await Promise.all([
        D.onlineNow(env).then(x => x.calls).catch(() => []),
        Promise.all(D.PENDING_ORDER.map(k => D.pendingFiles(env, D.REVIEW[k].folder).then(f => f.length).catch(() => 0))),
        D.pendingFiles(env, D.REVIEW.join.folder).then(f => f.length).catch(() => 0),
        D.rsvpLoad(env).catch(() => ({})), D.curEvent(env), D.kvGet(env, "scheduled", []), D.isHoly(env).catch(() => false),
        D.kvGet(env, "deferred_tz", []), D.kvGet(env, "undo", []), D.kvGet(env, "watch", {}), D.nextFileNum(env, D.ALL).catch(() => 0),
        membersList(env, D), D.listPhones(env, "admins").catch(() => []),
      ]);
      const muted = Object.entries(watch).filter(([, w]) => w && w.hold && (!w.until || w.until > now)).map(([p, w]) => ({ p, n: who(p), until: w.until ? D.ilAt(w.until).slice(0, 16) : "" }));
      return json({
        now: D.nowIL(), names: nm, online: online.map(c => ({ ...c, n: nm[c.p] || "" })),
        pending: D.PENDING_ORDER.map((k, i) => ({ k, name: D.REVIEW[k].name, n: counts[i] })), joins,
        event: { title: ev.title, desc: ev.desc, count: Object.keys(rsvp).length, total: Object.keys(nm).length },
        jobs: jobs.filter(j => !j.done).sort((a, b) => (a.at < b.at ? -1 : 1)).slice(0, 8).map(j => ({ ...j, who: j.phone ? who(j.phone) : "" })),
        holy, deferred, undo: undo.length ? undo[undo.length - 1] : null, muted,
        members: { active: members.filter(e => e.active).length, total: members.length },
        admins: [...new Set([...admins, D.OWNER])].map(p => ({ p, n: who(p) })), allCount,
      });
    }
    case "online": {
      const { calls } = await D.onlineNow(env);
      return json({ now: D.nowIL(), online: calls.map(c => ({ ...c, n: nm[c.p] || "" })) });
    }
    case "hangup": {
      const id = String(body.id || "").trim(); if (!id) return json({ error: "לשיחה הזו אין מזהה, אי אפשר לנתק אותה מכאן" }, 400);
      const r = await D.ym(env, "CallAction", { ids: id, action: "set:GOasap=hangup" });
      await D.log(env, `מנהל ${who(admin)} ניתק מ${VIA} את השיחה של ${who(body.phone)}`);
      return json({ ok: r && r.responseStatus === "OK", r });
    }
    case "tzintuk": {
      const list = ["members", "admins", "general"].includes(body.list) ? body.list : "";
      if (!list) return json({ error: "רשימה לא מוכרת" }, 400);
      const r = await D.tzintuk(env, list);
      await D.log(env, `מנהל ${who(admin)} שלח מ${VIA} צינתוק לרשימת ${list}${r.deferred ? " (נדחה למוצאי שבת/חג)" : ""}`);
      return json({ ok: !!r && r.responseStatus === "OK", deferred: !!r.deferred });
    }
    case "pending": {
      const kinds = [...D.PENDING_ORDER, "join"];
      const [lists, jmap, demap, archive] = await Promise.all([Promise.all(kinds.map(k => D.pendingFiles(env, D.REVIEW[k].folder).catch(() => []))), D.kvGet(env, "joinmap", {}), D.kvGet(env, "demap", {}), D.kvGet(env, "archive", {})]);
      return json({ names: nm, lists: kinds.map((k, i) => ({ k, name: D.REVIEW[k].name, folder: D.REVIEW[k].folder, files: lists[i].map(f => {
        const p = f.phone || jmap[f.name] || "", copy = k === "demoted" ? demap[f.name] : "";
        return { name: f.name, p, n: p ? nm[p] || "" : "", date: f.date || f.mtime || "", dur: +f.duration || 0, size: +f.size || 0, t: copy && archive[copy] ? archive[copy].t : "" };
      }) })) });
    }
    case "review": {
      const kind = D.REVIEW[body.kind] ? body.kind : "", act = String(body.act || ""), file = String(body.file || "");
      if (!kind || !/^\d+\.wav$/.test(file) || !["1", "2", "3"].includes(act)) return json({ error: "בקשה לא תקינה" }, 400);
      const f = (await D.pendingFiles(env, D.REVIEW[kind].folder)).find(x => x.name === file);
      if (!f) return json({ msg: "ההודעה הזו כבר טופלה", gone: true });
      if (kind === "join" && act === "1" && body.name) { // אישור הצטרפות עם שם שהמנהל הקליד
        const jmap = await D.kvGet(env, "joinmap", {}), p = f.phone || jmap[f.name] || "";
        if (!isPhone(p)) return json({ error: "לא ידוע מאיזה מספר הבקשה" }, 400);
        return json({ msg: await D.doAdmin(env, { type: "approve_join", phone: p, name: String(body.name).trim().slice(0, 40) }, admin, VIA) });
      }
      return json({ msg: await D.applyReview(env, ctx, kind, f, act, admin, " מ" + VIA) });
    }
    case "audio": { // השמעת הקלטה מהקו בדפדפן (רק מתיקיות ההודעות)
      const p = String(u.searchParams.get("p") || "");
      const folders = [...Object.values(D.REVIEW).map(r => r.folder), D.ALL, D.IMPORTANT, "/DeletedByAdmin"];
      const ok = audioPathOk(D, p) && (folders.some(f => p.startsWith(f + "/")) || /^\/personalMessages\/Phone\/\d+(\/Old)?\/\d+\.wav$/.test(p));
      if (!ok) return json({ error: "נתיב לא מורשה" }, 400);
      const bytes = await D.ym(env, "DownloadFile", { path: "ivr2:" + p });
      if (!bytes || bytes.length < 100 || bytes[0] === 0x7b) return json({ error: "הקובץ לא נמצא" }, 404);
      return new Response(bytes, { headers: { "Content-Type": "audio/wav", "Cache-Control": "private, max-age=600", "Content-Disposition": `inline; filename="${p.split("/").pop()}"` } });
    }
    case "messages": {
      const n = Math.min(+u.searchParams.get("n") || 200, 3000);
      const [all, imp, archive] = await Promise.all([D.allFiles(env, D.ALL), D.ym(env, "GetIVR2Dir", { path: "ivr2:" + D.IMPORTANT }).catch(() => ({})), D.kvGet(env, "archive", {})]);
      const impSizes = new Set((imp.files || []).filter(f => /^\d+\.wav$/.test(f.name)).map(f => f.size));
      const files = (all.files || []).filter(f => /^\d+\.wav$/.test(f.name)).sort((a, b) => parseInt(b.name) - parseInt(a.name));
      return json({ total: files.length, names: nm, list: files.slice(0, n).map(f => { const a = archive[f.name] || {}, p = f.phone || a.p || "";
        return { id: f.name.replace(".wav", ""), p, n: nm[p] || a.n || "", date: f.date || f.mtime || a.d || "", dur: +f.duration || 0, size: +f.size || 0, t: a.t || "", imp: impSizes.has(f.size) }; }) });
    }
    case "act": { // פעולת ניהול – אותו קוד כמו הפקודות הקוליות דרך העוזר, כולל undo
      const a = body.a || {};
      if (!D.ADMIN_ACTS.has(a.type)) return json({ error: "פעולה לא מוכרת" }, 400);
      if (a.type === "schedule" && !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(a.at || "")) return json({ error: "זמן לא תקין" }, 400);
      if (["mute", "unmute", "rename", "approve_join"].includes(a.type) && !isPhone(String(a.phone || ""))) return json({ error: "מספר טלפון לא תקין" }, 400);
      const r = await D.doAdmin(env, a, admin, VIA);
      return json({ r, desc: D.describeAct(a, env) });
    }
    case "members": {
      const [people, mem, general, admins, rsvp, watch, approved, blocked, jmap, joins, calls] = await Promise.all([
        D.peopleList(env), membersList(env, D), D.listPhones(env, "general").catch(() => []), D.listPhones(env, "admins").catch(() => []),
        D.rsvpLoad(env).catch(() => ({})), D.kvGet(env, "watch", {}), D.kvGet(env, "approved", {}), D.kvGet(env, "blocked", []), D.kvGet(env, "joinmap", {}),
        D.pendingFiles(env, D.REVIEW.join.folder).catch(() => []), callLog(env, D, 1).catch(() => ({ last: {}, per: {} })),
      ]);
      const mstat = Object.fromEntries(mem.map(e => [e.phone, e.active])), codes = Object.fromEntries(people.map(p => [p.p, p.c]));
      const phones = [...new Set([...Object.keys(nm), ...mem.map(e => e.phone), ...people.map(p => p.p)])];
      const rows = phones.map(p => { const w = watch[p], mutedOn = w && w.hold && (!w.until || w.until > now);
        return { p, n: nm[p] || "", code: codes[p] || "", tz: mstat[p] === true ? "on" : mstat[p] === false ? "off" : "none", general: general.includes(p), admin: admins.includes(p) || p === D.OWNER, rsvp: !!rsvp[p], muted: mutedOn ? (w.until ? D.ilAt(w.until).slice(0, 16) : "ללא הגבלה") : "", last: calls.last[p] || "", calls: calls.per[p] || 0, blocked: blocked.includes(p) }; });
      rows.sort((a, b) => (a.n || "תתת").localeCompare(b.n || "תתת", "he"));
      return json({ names: nm, owner: D.OWNER, rows, blocked: blocked.map(p => ({ p, n: nm[p] || "" })), approved: Object.entries(approved).map(([p, x]) => ({ p, n: nm[p] || "", t: x.t, by: who(x.by) })), joins: joins.map(f => ({ name: f.name, p: f.phone || jmap[f.name] || "", date: f.date || f.mtime || "" })) });
    }
    case "block": {
      const p = String(body.phone || "").replace(/\D/g, ""); if (!isPhone(p)) return json({ error: "מספר לא תקין" }, 400);
      const blocked = await D.kvGet(env, "blocked", []), on = !!body.on, next = on ? [...new Set([...blocked, p])] : blocked.filter(x => x !== p);
      await env.KV.put("blocked", JSON.stringify(next));
      await D.log(env, `מנהל ${who(admin)} ${on ? "חסם מ" + VIA + " את" : "הסיר מ" + VIA + " את החסימה של"} ${who(p)} (${p})`);
      return json({ ok: true, blocked: next });
    }
    case "schedule": {
      const [jobs, ev, rsvp] = await Promise.all([D.kvGet(env, "scheduled", []), D.curEvent(env), D.rsvpLoad(env).catch(() => ({}))]);
      return json({ names: nm, now: D.nowIL(), jobs: jobs.slice().sort((a, b) => (a.at < b.at ? 1 : -1)).map((j, i) => ({ ...j, i, who: j.phone ? who(j.phone) : "", byName: j.by ? who(j.by) : "" })), event: ev,
        rsvp: Object.entries(rsvp).map(([p, x]) => ({ p, n: x.n, ts: x.ts })).sort((a, b) => (a.ts < b.ts ? -1 : 1)), notReg: Object.keys(nm).filter(p => !rsvp[p]).map(p => ({ p, n: nm[p] })) });
    }
    case "unsched": {
      const jobs = await D.kvGet(env, "scheduled", []);
      const j = jobs.find(x => !x.done && (body.id ? x.id === body.id : x.at === body.at && (x.text || "") === (body.text || "") && x.type === body.type));
      if (!j) return json({ error: "לא נמצאה משימה ממתינה כזו" }, 404);
      await env.KV.put("scheduled", JSON.stringify(jobs.filter(x => x !== j)));
      await D.log(env, `מנהל ${who(admin)} ביטל מ${VIA} משימה מתוזמנת ל-${j.at}: ${j.type === "remind" ? "תזכורת ל" + who(j.phone) : j.text || j.type}`);
      return json({ ok: true });
    }
    case "assistant": {
      const [conv, rules, retort, undo, strict] = await Promise.all([D.kvGet(env, "convlog", []), D.kvGet(env, "rules", []), D.kvGet(env, "retort", []), D.kvGet(env, "undo", []), D.kvGet(env, "strict", [])]);
      return json({ names: nm, conv: conv.slice(-400).reverse().map(e => ({ d: e.d, p: e.p, n: who(e.p), q: e.q, a: e.a })), rules, retort: retort.map(p => ({ p, n: who(p) })), strict: strict.map(p => ({ p, n: who(p) })), undo: undo.slice().reverse() });
    }
    case "stats": {
      const [lg, imp, archive, deferred, holy, profiles, conv] = await Promise.all([callLog(env, D, 2), D.ym(env, "GetIVR2Dir", { path: "ivr2:" + D.IMPORTANT }).catch(() => ({})), D.kvGet(env, "archive", {}), D.kvGet(env, "deferred_tz", []), D.isHoly(env).catch(() => false), D.kvGet(env, "profiles", {}), D.kvGet(env, "convlog", [])]);
      const days = []; for (let i = 29; i >= 0; i--) days.push(D.ilAt(now - i * 864e5).slice(0, 10));
      // מי שמע את ההודעה החשובה האחרונה: מי שנכנס לשלוחה 1/1 אחרי שהיא עלתה
      const lastImp = (imp.files || []).filter(f => /^\d+\.wav$/.test(f.name)).map(f => ({ f: f.name, t: D.sortable(f.mtime || f.date) })).sort((a, b) => (a.t < b.t ? 1 : -1))[0] || null;
      const heard = lastImp ? [...new Set(lg.imp11.filter(e => e.t >= lastImp.t).map(e => e.p))] : [];
      const msgsByDay = {}; for (const a of Object.values(archive)) { const t = D.sortable(a.d); if (t) msgsByDay[t.slice(0, 10)] = (msgsByDay[t.slice(0, 10)] || 0) + 1; }
      const convByDay = {}; for (const e of conv) { const d = String(e.d || "").slice(0, 10); if (d) convByDay[d] = (convByDay[d] || 0) + 1; }
      const weekAgo = D.ilAt(now - 7 * 864e5).slice(0, 16);
      const folderLabel = f => { const p = "/" + f; for (const [pre, label] of D.WHERE) if (p === pre || p.startsWith(pre + "/")) return label; return f ? "שלוחה " + f : "התפריט הראשי"; };
      const byFolder = {}; for (const [f, n] of Object.entries(lg.byFolder)) { const l = folderLabel(f); byFolder[l] = (byFolder[l] || 0) + n; }
      return json({ today: days[29], days, calls: days.map(d => lg.byDay[d] || 0), callers: days.map(d => lg.callers[d] || 0), msgs: days.map(d => msgsByDay[d] || 0), conv: days.map(d => convByDay[d] || 0), byHour: lg.byHour,
        perMember: Object.entries(lg.per).map(([p, n]) => ({ p, n: who(p), calls: n })).sort((a, b) => b.calls - a.calls).slice(0, 20),
        byFolder: Object.entries(byFolder).map(([l, n]) => ({ l, n })).sort((a, b) => b.n - a.n).slice(0, 12),
        lastImp, heard: heard.map(p => ({ p, n: who(p) })), notHeard: lastImp ? Object.keys(nm).filter(p => !heard.includes(p)).map(p => ({ p, n: nm[p] })) : [],
        quiet: Object.keys(nm).filter(p => !lg.last[p] || lg.last[p] < weekAgo).map(p => ({ p, n: nm[p], last: lg.last[p] || "" })),
        holy, deferred, system: { archive: Object.keys(archive).length, transcribed: Object.values(archive).filter(a => a.t).length, profiles: Object.keys(profiles).length, conv: conv.length, months: lg.months, totalCalls: lg.total } });
    }
    case "log": {
      const r = await D.ym(env, "GetTextFile", { what: "ivr2:/AILog.txt" }).catch(() => ({}));
      const lines = ((r && r.contents) || "").split("\n").filter(Boolean).slice(0, 500).map(l => { const m = /^\[([^\]]+)\]\s*(.*)$/.exec(l); return m ? { t: m[1], m: m[2] } : { t: "", m: l }; });
      return json({ lines });
    }
  }
  return api2(req, env, ctx, u, name, D, auth, body, nm, who, admin, VIA, now);
}

// ============================================================================
// ניהול מתקדם (ספטמבר 2026): כרטיס חבר, הודעות אישיות, אצווה, העלאות, סל מחזור, ייצוא,
// תזמון מתקדם, שבת וחג, סיכום שבועי, גיבוי, אירוע, פרסומות, קודים, דוחות, ניטור, שיתוף לצפייה.
// כל פעולה עוברת דרך אותם מנגנונים כמו הפקודות הקוליות (doAdmin / pushUndo / log).
// ============================================================================
const BACKUP_KEYS = ["people", "names_over", "rules", "scheduled", "blocked", "watch", "retort", "strict", "ads", "event", "approved", "archive", "facts", "profiles", "dashnotes", "joinmap", "demap"];
const b64dec = s => Uint8Array.from(atob(String(s || "").replace(/^data:[^,]*,/, "")), c => c.charCodeAt(0));
const csvCell = v => { const s = String(v ?? ""); return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
const csvResp = (rows, name) => new Response("﻿" + rows.map(r => r.map(csvCell).join(",")).join("\r\n"), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(name)}`, "Cache-Control": "no-store" } });
const fileResp = (bytes, name, type = "application/octet-stream") => new Response(bytes, { headers: { "Content-Type": type, "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(name)}`, "Cache-Control": "no-store" } });
const MSG_FOLDERS = D => [...Object.values(D.REVIEW).map(r => r.folder), D.ALL, D.IMPORTANT, "/DeletedByAdmin"];
const audioPathOk = (D, p) => /^\/[\w\/-]+\/[\w-]+\.wav$/.test(p) && (MSG_FOLDERS(D).some(f => p.startsWith(f + "/")) || /^\/personalMessages\/Phone\/\d+(\/Old)?\/\d+\.wav$/.test(p));
// ZIP בלי דחיסה (store) – מספיק להקלטות wav, בלי ספריות
let CRC_TABLE = null;
function crc32(bytes) {
  if (!CRC_TABLE) { CRC_TABLE = new Int32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; CRC_TABLE[n] = c; } }
  let c = -1; for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8); return (c ^ -1) >>> 0;
}
function makeZip(files) { // files: [{name, bytes}]
  const parts = [], central = []; let off = 0; const le16 = n => [n & 255, (n >> 8) & 255], le32 = n => [n & 255, (n >> 8) & 255, (n >> 16) & 255, (n >>> 24) & 255];
  for (const f of files) {
    const name = enc.encode(f.name), crc = crc32(f.bytes), n = f.bytes.length;
    const head = new Uint8Array([0x50, 0x4b, 3, 4, ...le16(20), ...le16(0x800), ...le16(0), ...le16(0), ...le16(0x21), ...le32(crc), ...le32(n), ...le32(n), ...le16(name.length), ...le16(0)]);
    parts.push(head, name, f.bytes);
    central.push(new Uint8Array([0x50, 0x4b, 1, 2, ...le16(20), ...le16(20), ...le16(0x800), ...le16(0), ...le16(0), ...le16(0x21), ...le32(crc), ...le32(n), ...le32(n), ...le16(name.length), ...le16(0), ...le16(0), ...le16(0), ...le16(0), ...le32(0), ...le32(off)]), name);
    off += head.length + name.length + n;
  }
  const cdSize = central.reduce((a, b) => a + b.length, 0);
  const end = new Uint8Array([0x50, 0x4b, 5, 6, 0, 0, 0, 0, ...le16(files.length), ...le16(files.length), ...le32(cdSize), ...le32(off), 0, 0]);
  const all = [...parts, ...central, end], out = new Uint8Array(all.reduce((a, b) => a + b.length, 0)); let o = 0;
  for (const b of all) { out.set(b, o); o += b.length; }
  return out;
}
const HE_STOP = new Set("של את על עם זה זו לא כן יש אין מה מי איך למה איפה מתי גם רק אם או כי אבל אז הוא היא הם הן אני אתה את אנחנו אתם לי לך לו לה לנו להם עוד כל כמה איזה ככה פה שם היום מחר אתמול בבקשה תודה שלום הי היי אחי וואלה תכלס יכול יכולה רוצה צריך אפשר תגיד תגידי ואם עוד ואז אולי כבר עכשיו".split(" "));
// צינתוק למספרים נבחרים. ב-TEST_MODE=1 (בדיקות) הצינתוק יוצא רק למנהלים שבין הנבחרים, כמו ברשימות
async function tzPhones(env, D, phones) {
  if (env.TEST_MODE === "1") { const admins = [...(await D.listPhones(env, "admins").catch(() => [])), D.OWNER]; phones = phones.filter(p => admins.includes(p)); if (!phones.length) return { responseStatus: "OK", test: true }; }
  return D.ym(env, "RunTzintuk", { phones: phones.join(":") });
}
const speakerFolder = (D, f) => { const p = "/" + f; for (const [pre, label] of D.WHERE) if (p === pre || p.startsWith(pre + "/")) return label; return f ? "שלוחה " + f : "התפריט הראשי"; };


// ---------- עוזר AI לדף הניהול ----------
// העוזר רק מציע פעולות. כל פעולה מאומתת כאן מול רשימה סגורה, ומתבצעת בדפדפן רק אחרי אישור המנהל,
// דרך אותם נתיבי API (ולכן עם אותו יומן, undo ובדיקות). זו הנחיה נפרדת – לא נוגעת בעוזר הקולי של הקו.
const DASH_AI_SYSTEM = `אתה עוזר הניהול של קו טלפוני (ימות המשיח 073-351-2880) של קבוצת בחורי ישיבה. אתה עונה למנהל הקו בתוך דף הניהול בדפדפן, בעברית, בקצרה ולעניין.
אתה מקבל את מצב הקו העדכני (JSON) ואת בקשת המנהל. אם הוא שואל שאלה – ענה מתוך הנתונים בלבד, ואל תמציא. אם הוא מבקש לבצע משהו – הצע פעולות מתוך הרשימה הסגורה למטה. אתה לא מבצע בעצמך: המנהל יאשר כל פעולה.
זהה חברים לפי שם מתוך members (התאמה חלקית מותרת, למשל שם פרטי). אם יש כמה התאמות או שלא ברור למי הכוונה – אל תציע פעולה, ושאל.
זמנים: בפורמט "YYYY-MM-DD HH:MM" לפי שעון ישראל. "עכשיו" מופיע ב-now. "מחר בשמונה בערב" = התאריך של מחר 20:00.
פעולות מותרות (שדה kind):
- act: פעולת ניהול. שדה a עם type אחד מ: delete {id}, move {id, to:"important"|"regular"}, schedule {at, text, important:boolean}, event {title, desc}, mute {phone, hours}, unmute {phone}, entry {text}, entry_delete {}, approve_join {phone, name}, rule_add {text}, rule_remove {n}, rename {phone, name}, broadcast {text}, undo {}
- tzintuk: {list:"members"|"admins"|"general"} – צינתוק לרשימה
- tz_phones: {phones:[...]} – צינתוק למספרים מסוימים
- pm: {text, phones:[...]} או {text, list:"members"|"admins"} – הודעה אישית קולית לתיבה האישית
- schedule2: {type:"post"|"tz"|"entry"|"pm"|"remind", at, text?, important?, list?, phones?, phone?, every?:"day"|"week", until?}
- block: {phone, on:boolean}
- lists: {list:"retort"|"strict", phone, on:boolean}
- event: {op:"edit", title, details} | {op:"rsvp_add", phone, name} | {op:"rsvp_remove", phone} | {op:"tz_missing"}
- unsched: {id}
- navigate: {tab} – מעבר ללשונית (home, pending, msgs, trash, members, studio, sched, event, bot, reports, stats, live, system, log)
- open_member: {phone} – פתיחת כרטיס חבר
לכל פעולה הוסף desc: משפט קצר בעברית שמתאר בדיוק מה יקרה.
החזר JSON בלבד: {"answer":"תשובה קצרה למנהל","actions":[{"kind":"...", ..., "desc":"..."}]}`;
const TABS_OK = new Set(["home", "pending", "msgs", "trash", "members", "studio", "sched", "event", "bot", "reports", "stats", "live", "system", "log"]);
const ATIME = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/;
function aiCheck(x, D, nm) { // מחזיר פעולה נקייה, או null אם היא לא תקינה
  if (!x || typeof x !== "object") return null;
  const ph = v => { const p = String(v || "").replace(/\D/g, ""); return isPhone(p) ? p : ""; }, txt = (v, n = 1500) => String(v || "").trim().slice(0, n);
  const desc = txt(x.desc, 300), phones = a => [...new Set((Array.isArray(a) ? a : []).map(ph).filter(Boolean))];
  switch (x.kind) {
    case "act": {
      const a = x.a || {}, t = a.type; if (!D.ADMIN_ACTS.has(t)) return null;
      const o = { type: t };
      if (t === "delete" || t === "move") { o.id = String(a.id || "").replace(/\D/g, ""); if (!o.id) return null; if (t === "move") { o.to = a.to === "important" ? "important" : "regular"; } }
      if (t === "schedule") { if (!ATIME.test(a.at || "") || !txt(a.text)) return null; o.at = a.at; o.text = txt(a.text); o.important = !!a.important; }
      if (t === "event") { if (!txt(a.title, 80)) return null; o.title = txt(a.title, 80); o.desc = txt(a.desc, 200); }
      if (["mute", "unmute", "rename", "approve_join"].includes(t)) { o.phone = ph(a.phone); if (!o.phone) return null; }
      if (t === "mute") o.hours = Math.max(1, Math.min(720, +a.hours || 24));
      if (t === "rename" || t === "approve_join") { o.name = txt(a.name, 40); if (!o.name) return null; }
      if (["entry", "rule_add", "broadcast"].includes(t)) { o.text = txt(a.text, t === "rule_add" ? 300 : 800); if (!o.text) return null; }
      if (t === "rule_remove") { o.n = +a.n; if (!(o.n >= 1)) return null; }
      return { kind: "act", a: o, desc: desc || D.describeAct(o) };
    }
    case "tzintuk": return ["members", "admins", "general"].includes(x.list) ? { kind: "tzintuk", list: x.list, desc } : null;
    case "tz_phones": { const p = phones(x.phones); return p.length ? { kind: "tz_phones", phones: p, desc } : null; }
    case "pm": { const text = txt(x.text, 800); if (!text) return null; if (["members", "admins"].includes(x.list)) return { kind: "pm", text, list: x.list, desc }; const p = phones(x.phones); return p.length ? { kind: "pm", text, phones: p, desc } : null; }
    case "schedule2": {
      if (!ATIME.test(x.at || "") || !["post", "tz", "entry", "pm", "remind"].includes(x.type)) return null;
      const o = { kind: "schedule2", type: x.type, at: x.at, desc };
      if (x.type !== "tz") { o.text = txt(x.text); if (!o.text) return null; }
      if (x.type === "post") o.important = !!x.important;
      if (x.type === "tz") o.list = ["members", "admins", "general"].includes(x.list) ? x.list : "members";
      if (x.type === "pm") { o.phones = phones(x.phones); if (!o.phones.length) return null; }
      if (x.type === "remind") { o.phone = ph(x.phone); if (!o.phone) return null; }
      if (["day", "week"].includes(x.every)) { o.every = x.every; if (ATIME.test(x.until || "")) o.until = x.until; }
      return o;
    }
    case "block": { const p = ph(x.phone); return p ? { kind: "block", phone: p, on: !!x.on, desc } : null; }
    case "lists": { const p = ph(x.phone); return p && ["retort", "strict"].includes(x.list) ? { kind: "lists", list: x.list, phone: p, on: !!x.on, desc } : null; }
    case "event": {
      if (x.op === "edit") return txt(x.title, 80) ? { kind: "event", op: "edit", title: txt(x.title, 80), details: txt(x.details, 200), desc } : null;
      if (x.op === "rsvp_add" || x.op === "rsvp_remove") { const p = ph(x.phone); return p ? { kind: "event", op: x.op, phone: p, name: txt(x.name || nm[p] || "", 40), desc } : null; }
      if (x.op === "tz_missing") return { kind: "event", op: "tz_missing", desc };
      return null;
    }
    case "unsched": return x.id ? { kind: "unsched", id: String(x.id).slice(0, 40), desc } : null;
    case "navigate": return TABS_OK.has(x.tab) ? { kind: "navigate", tab: x.tab, desc } : null;
    case "open_member": { const p = ph(x.phone); return p ? { kind: "open_member", phone: p, desc } : null; }
  }
  return null;
}
async function api2(req, env, ctx, u, name, D, auth, body, nm, who, admin, VIA, now) {
  const q = k => String(u.searchParams.get(k) || "");
  const ok = (extra = {}) => json({ ok: true, ...extra });
  switch (name) {
    case "ai": {
      const ask = String(body.q || "").trim().slice(0, 1500); if (!ask) return json({ error: "מה לעשות?" }, 400);
      const hist = (Array.isArray(body.history) ? body.history : []).slice(-8).map(h => ({ role: h.role === "model" ? "model" : "user", parts: [{ text: String(h.text || "").slice(0, 1500) }] }));
      const [counts, joins, jobs, ev, rsvp, rules, online, holy, ar, logR, watch, blocked, undo] = await Promise.all([
        Promise.all(D.PENDING_ORDER.map(k => D.pendingFiles(env, D.REVIEW[k].folder).then(f => f.length).catch(() => 0))), D.pendingFiles(env, D.REVIEW.join.folder).then(f => f.length).catch(() => 0),
        D.kvGet(env, "scheduled", []), D.curEvent(env), D.rsvpLoad(env).catch(() => ({})), D.kvGet(env, "rules", []), D.onlineNow(env).then(x => x.calls).catch(() => []), D.isHoly(env).catch(() => false),
        D.kvGet(env, "archive", {}), D.ym(env, "GetTextFile", { what: "ivr2:/AILog.txt" }).catch(() => ({})), D.kvGet(env, "watch", {}), D.kvGet(env, "blocked", []), D.kvGet(env, "undo", [])]);
      const recent = Object.entries(ar).sort((a, b) => parseInt(b[0]) - parseInt(a[0])).slice(0, 25).map(([k, a]) => ({ id: k.replace(".wav", ""), d: a.d, n: a.n || nm[a.p] || "", t: String(a.t || "").slice(0, 220) }));
      const ctxData = { now: D.nowIL(), holy, members: Object.entries(nm).map(([p, n]) => ({ n, p })), online: online.map(c => ({ n: nm[c.p] || "", p: c.p, w: c.w })),
        pending: D.PENDING_ORDER.map((k, i) => ({ list: D.REVIEW[k].name, n: counts[i] })), joins,
        scheduled: jobs.filter(j => !j.done).map(j => ({ id: j.id, at: j.at, type: j.type, text: String(j.text || "").slice(0, 120), phone: j.phone || "", every: j.every || "" })),
        event: { title: ev.title, desc: ev.desc, registered: Object.values(rsvp).map(x => x.n), notRegistered: Object.keys(nm).filter(p => !rsvp[p]).map(p => nm[p]) },
        rules: rules.map((r, i) => ({ n: i + 1, r })), muted: Object.entries(watch).filter(([, w]) => w && w.hold && (!w.until || w.until > now)).map(([p]) => nm[p] || p), blocked,
        lastUndo: undo.length ? undo[undo.length - 1].desc : "", recentMessages: recent,
        recentLog: ((logR && logR.contents) || "").split("\n").filter(Boolean).slice(0, 25) };
      let r;
      try { r = await D.aiText(env, { system: DASH_AI_SYSTEM, contents: [...hist, { role: "user", parts: [{ text: "מצב הקו:\n" + JSON.stringify(ctxData).slice(0, 24000) + "\n\nבקשת המנהל: " + ask }] }], deadline: 26000, timeout: 20000 }); }
      catch (e) { return json({ error: "העוזר לא זמין כרגע: " + String(e.message || e).slice(0, 200) }, 503); }
      const raw = Array.isArray(r && r.actions) ? r.actions : [], actions = raw.map(x => aiCheck(x, D, nm)).filter(Boolean).slice(0, 12);
      const answer = String((r && (r.answer || r.text)) || "").trim().slice(0, 3000) || (actions.length ? "הנה מה שאני מציע לבצע:" : "לא הבנתי, אפשר לנסח אחרת?");
      const hlog = await D.kvGet(env, "dashai", []); hlog.push({ d: D.nowIL(), q: ask.slice(0, 300), a: answer.slice(0, 300), n: actions.length }); await env.KV.put("dashai", JSON.stringify(hlog.slice(-100)));
      return json({ answer, actions, dropped: raw.length - actions.length });
    }
    case "whoami": return json({ ro: !!auth.ro, exp: auth.exp || 0, owner: D.OWNER, name: who(D.OWNER), now: D.nowIL() });
    case "share": { // קישור לצפייה בלבד (7 ימים כברירת מחדל): מותר לראות הכול, אסור לבצע שום פעולה
      const days = Math.max(1, Math.min(90, +body.days || 7)), token = await newToken(env, true, days);
      await D.log(env, `מנהל ${who(admin)} יצר מ${VIA} קישור לצפייה בלבד ל-${days} ימים`);
      return json({ token, days });
    }
    case "notes": {
      if (req.method === "POST") {
        const kind = body.kind === "member" ? "member" : "msg", key = String(body.key || "").replace(/[^\w-]/g, "").slice(0, 40), text = String(body.text || "").trim().slice(0, 1000);
        if (!key) return json({ error: "מפתח לא תקין" }, 400);
        const notes = await D.kvGet(env, "dashnotes", { msg: {}, member: {} }); notes[kind] = notes[kind] || {};
        if (text) notes[kind][key] = { t: text, d: D.nowIL() }; else delete notes[kind][key];
        await env.KV.put("dashnotes", JSON.stringify(notes)); return ok({ notes });
      }
      return json({ notes: await D.kvGet(env, "dashnotes", { msg: {}, member: {} }) });
    }
    case "transcript": { // תיקון תמלול בארכיון (המקור נשמר ב-undo)
      const id = String(body.id || "").replace(/\D/g, ""), text = String(body.text || "").trim().slice(0, 3000); if (!id) return json({ error: "מספר הודעה לא תקין" }, 400);
      const ar = await D.kvGet(env, "archive", {}), key = id + ".wav", prev = ar[key] || null;
      ar[key] = { ...(prev || { p: "", n: "", d: D.nowIL() }), t: text, s: "g" }; await env.KV.put("archive", JSON.stringify(ar));
      await D.pushUndo(env, `תיקון התמלול של הודעה ${id}`, [{ archive: [key, prev || { ...ar[key], t: "", s: "a" }] }]); await D.log(env, `מנהל ${who(admin)} תיקן מ${VIA} את התמלול של הודעה ${id}`);
      return ok();
    }

    // ---------- חברים ----------
    case "member": {
      const p = q("p").replace(/\D/g, ""); if (!isPhone(p)) return json({ error: "מספר לא תקין" }, 400);
      const [archive, conv, profiles, mem, facts, people, watch, blocked, retort, strict, ads, lg, pmDir, pmOld, approved, rsvp, notes, general, admins, members] = await Promise.all([
        D.kvGet(env, "archive", {}), D.kvGet(env, "convlog", []), D.kvGet(env, "profiles", {}), D.kvGet(env, "mem:" + p, null), D.kvGet(env, "facts", {}), D.peopleList(env),
        D.kvGet(env, "watch", {}), D.kvGet(env, "blocked", []), D.kvGet(env, "retort", []), D.kvGet(env, "strict", []), D.kvGet(env, "ads", {}), callLog(env, D, 2).catch(() => ({ last: {}, per: {}, ents: [] })),
        D.ym(env, "GetIVR2Dir", { path: "ivr2:" + D.PM(p) }).catch(() => ({})), D.ym(env, "GetIVR2Dir", { path: "ivr2:" + D.PM(p) + "/Old" }).catch(() => ({})),
        D.kvGet(env, "approved", {}), D.rsvpLoad(env).catch(() => ({})), D.kvGet(env, "dashnotes", { msg: {}, member: {} }), D.listPhones(env, "general").catch(() => []), D.listPhones(env, "admins").catch(() => []), membersList(env, D),
      ]);
      const person = people.find(x => x.p === p) || null, w = watch[p], mstat = members.find(e => e.phone === p);
      const msgs = Object.entries(archive).filter(([, a]) => a && a.p === p).map(([k, a]) => ({ id: k.replace(".wav", ""), d: a.d, t: a.t || "", s: a.s })).sort((a, b) => parseInt(b.id) - parseInt(a.id));
      const pmFiles = d => (d.files || []).filter(f => /^\d+\.(wav|tts)$/.test(f.name)).map(f => ({ name: f.name, date: f.date || f.mtime || "", dur: +f.duration || 0 }));
      const calls = lg.ents.filter(e => e.p === p).sort((a, b) => (a.t < b.t ? 1 : -1)).slice(0, 60).map(e => ({ t: e.t, x: e.x, f: e.f, l: speakerFolder(D, e.f) }));
      return json({
        p, n: nm[p] || "", person, admin: admins.includes(p) || p === D.OWNER, general: general.includes(p), tz: mstat ? (mstat.active ? "on" : "off") : "none",
        muted: w && w.hold && (!w.until || w.until > now) ? (w.until ? D.ilAt(w.until).slice(0, 16) : "ללא הגבלה") : "", blocked: blocked.includes(p), retort: retort.includes(p), strict: strict.includes(p),
        rsvp: rsvp[p] || null, approved: approved[p] || null, ads: ads[p] || [], note: (notes.member || {})[p] || null,
        msgs: msgs.slice(0, 100), msgTotal: msgs.length, conv: conv.filter(c => c.p === p).slice(-60).reverse(), profile: profiles[p] || null, memory: mem, talk: ((facts || {}).talk || {})[p] || "",
        calls, callsMonth: lg.per[p] || 0, last: lg.last[p] || "", pm: pmFiles(pmDir), pmOld: pmFiles(pmOld).slice(-20), now: D.nowIL(),
      });
    }
    case "pm_delete": { // מחיקת הודעה מהתיבה האישית של חבר
      const p = String(body.phone || "").replace(/\D/g, ""), f = String(body.name || ""); if (!isPhone(p) || !/^\d+\.(wav|tts)$/.test(f)) return json({ error: "בקשה לא תקינה" }, 400);
      const path = D.PM(p) + (body.old ? "/Old" : "") + "/" + f;
      const r = await D.ym(env, "FileAction", { action: "delete", what: "ivr2:" + path });
      await D.log(env, `מנהל ${who(admin)} מחק מ${VIA} הודעה אישית (${f}) מהתיבה של ${who(p)}`);
      return ok({ r });
    }
    case "tts": { // הקול של העוזר לתצוגה מקדימה: נשמר ל-3 ימים ומשמש אחר כך לשליחה בלי ליצור שוב
      const text = String(body.text || "").trim().slice(0, 1500); if (!text) return json({ error: "אין טקסט" }, 400);
      const pcm = await D.ttsLong(env, text); if (!pcm) return json({ error: "הקול של העוזר לא זמין כרגע, נסו שוב בעוד דקה" }, 503);
      const id = "d" + Date.now().toString(36), m8 = D.to8k(D.pcmTrim(pcm));
      await env.KV.put("bc:" + id, m8.buffer, { expirationTtl: 3 * 86400 });
      await env.KV.put("bctext:" + id, text, { expirationTtl: 3 * 86400 });
      return json({ id, seconds: Math.round(m8.length / 8000) });
    }
    case "preview": { // השמעת קול שנוצר ב-tts
      const id = q("id").replace(/[^\w]/g, ""), buf = id ? await env.KV.get("bc:" + id, "arrayBuffer") : null; if (!buf) return json({ error: "הקול הזה כבר לא קיים" }, 404);
      return new Response(D.pcmToWav(new Uint8Array(buf), 8000), { headers: { "Content-Type": "audio/wav", "Cache-Control": "private, max-age=600" } });
    }
    case "send_pm": { // הודעה אישית (מהקול שנוצר ב-tts) לחברים נבחרים / לכולם / למנהלים
      const id = String(body.id || "").replace(/[^\w]/g, ""); if (!id || !(await env.KV.get("bc:" + id, "arrayBuffer"))) return json({ error: "קודם צריך ליצור את הקול (תצוגה מקדימה)" }, 400);
      const text = (await env.KV.get("bctext:" + id)) || "";
      let phones = [];
      if (body.list === "members") phones = (await D.peopleList(env)).map(x => x.p);
      else if (body.list === "admins") phones = [...new Set([...(await D.listPhones(env, "admins").catch(() => [])), D.OWNER])];
      else phones = (Array.isArray(body.phones) ? body.phones : []).map(x => String(x).replace(/\D/g, "")).filter(isPhone);
      phones = [...new Set(phones)]; if (!phones.length) return json({ error: "לא נבחרו נמענים" }, 400);
      await D.bgAdd(env, [...phones.map(p => ({ k: "bc", id, p })), { k: "log", line: `ההודעה האישית הושארה אצל ${phones.length} חברים (מנהל ${who(admin)} דרך ${VIA}): ${text.slice(0, 200)}` }]);
      await D.pushUndo(env, `הודעה אישית ל-${phones.length} חברים`, [{ bcdel: id }]);
      return ok({ count: phones.length });
    }
    case "tz_phones": { // צינתוק לחברים נבחרים
      const phones = [...new Set((Array.isArray(body.phones) ? body.phones : []).map(x => String(x).replace(/\D/g, "")).filter(isPhone))].slice(0, 200);
      if (!phones.length) return json({ error: "לא נבחרו מספרים" }, 400);
      const r = await tzPhones(env, D, phones);
      await D.log(env, `מנהל ${who(admin)} שלח מ${VIA} צינתוק ל-${phones.length} נבחרים${r && r.deferred ? " (נדחה למוצאי שבת/חג)" : ""}`);
      return ok({ deferred: !!(r && r.deferred), sent: !!r && r.responseStatus === "OK", count: phones.length });
    }
    case "members_csv": {
      const [people, mem, admins, rsvp, lg] = await Promise.all([D.peopleList(env), membersList(env, D), D.listPhones(env, "admins").catch(() => []), D.rsvpLoad(env).catch(() => ({})), callLog(env, D, 1).catch(() => ({ last: {}, per: {} }))]);
      const mstat = Object.fromEntries(mem.map(e => [e.phone, e.active])), codes = Object.fromEntries(people.map(p => [p.p, p.c]));
      const phones = [...new Set([...Object.keys(nm), ...mem.map(e => e.phone), ...people.map(p => p.p)])].sort((a, b) => (nm[a] || "תתת").localeCompare(nm[b] || "תתת", "he"));
      const rows = [["שם", "טלפון", "קוד", "צינתוקים", "מנהל", "נרשם לאירוע", "שיחות החודש", "כניסה אחרונה"]];
      for (const p of phones) rows.push([nm[p] || "", p, codes[p] || "", mstat[p] === true ? "פעיל" : mstat[p] === false ? "חסם" : "לא ברשימה", admins.includes(p) || p === D.OWNER ? "כן" : "", rsvp[p] ? "כן" : "", lg.per[p] || 0, lg.last[p] || ""]);
      return csvResp(rows, `members-${D.nowIL().slice(0, 10)}.csv`);
    }
    case "members_import": { // שורות {p, n}: חדש – מצטרף (כמו הוספה ידנית), קיים עם שם אחר – שינוי שם
      const rows = (Array.isArray(body.rows) ? body.rows : []).slice(0, 300).map(r => ({ p: String(r.p || "").replace(/\D/g, ""), n: String(r.n || "").trim().slice(0, 40) })).filter(r => isPhone(r.p) && r.n);
      if (!rows.length) return json({ error: "לא נמצאו שורות תקינות (מספר טלפון ושם)" }, 400);
      const people = await D.peopleList(env), res = { added: [], renamed: [], same: [], errors: [] };
      for (const r of rows) {
        try {
          const ex = people.find(x => x.p === r.p);
          if (!ex) { await D.doAdmin(env, { type: "approve_join", phone: r.p, name: r.n }, admin, VIA); res.added.push(r); }
          else if (ex.n !== r.n && body.rename) { await D.doAdmin(env, { type: "rename", phone: r.p, name: r.n }, admin, VIA); res.renamed.push(r); }
          else res.same.push(r);
        } catch (e) { res.errors.push({ ...r, e: e.message }); }
      }
      await D.log(env, `ייבוא חברים מ${VIA}: ${res.added.length} נוספו, ${res.renamed.length} שונה שמם, ${res.same.length} ללא שינוי (מנהל ${who(admin)})`);
      return ok(res);
    }
    case "lists": { // רשימות retort / strict (משפיעות על התנהגות העוזר כלפי אותו חבר)
      const list = body.list === "retort" ? "retort" : body.list === "strict" ? "strict" : ""; const p = String(body.phone || "").replace(/\D/g, "");
      if (!list || !isPhone(p)) return json({ error: "בקשה לא תקינה" }, 400);
      const cur = await D.kvGet(env, list, []), next = body.on ? [...new Set([...cur, p])] : cur.filter(x => x !== p);
      await env.KV.put(list, JSON.stringify(next));
      await D.log(env, `מנהל ${who(admin)} ${body.on ? "הוסיף" : "הסיר"} מ${VIA} את ${who(p)} ${body.on ? "ל" : "מ"}רשימת ${list === "retort" ? "התגובה העוקצנית" : "הפיקוח המוגבר"}`);
      return ok({ list: next });
    }
    case "codes": { // קוד זיהוי לתפריט ההודעות האישיות
      const p = String(body.phone || "").replace(/\D/g, ""), code = String(body.code || "").replace(/\D/g, "").padStart(2, "0").slice(-2);
      if (!isPhone(p) || !/^\d{2}$/.test(code)) return json({ error: "קוד צריך להיות שתי ספרות" }, 400);
      const people = await D.peopleList(env), me = people.find(x => x.p === p); if (!me) return json({ error: "החבר לא ברשימה" }, 404);
      if (people.some(x => x.p !== p && x.c === code)) return json({ error: "הקוד הזה כבר תפוס" }, 409);
      const old = me.c; me.c = code; await D.saveNames(env, people); await D.bgAdd(env, D.peopleRegenSteps(people, [me]));
      await D.log(env, `מנהל ${who(admin)} שינה מ${VIA} את הקוד של ${who(p)} מ-${old} ל-${code}`);
      return ok({ code });
    }
    case "ads": {
      if (req.method === "POST") {
        const p = String(body.phone || "").replace(/\D/g, ""); if (!isPhone(p)) return json({ error: "מספר לא תקין" }, 400);
        const list = (Array.isArray(body.list) ? body.list : []).map(t => String(t).trim().slice(0, 300)).filter(Boolean).slice(0, 20);
        const ads = await D.kvGet(env, "ads", {}); if (list.length) ads[p] = list; else delete ads[p]; await env.KV.put("ads", JSON.stringify(ads));
        await D.log(env, `מנהל ${who(admin)} עדכן מ${VIA} את הפרסומות של ${who(p)} (${list.length})`);
        return ok({ ads });
      }
      const ads = await D.kvGet(env, "ads", {});
      return json({ names: nm, ads: Object.entries(ads).map(([p, list]) => ({ p, n: who(p), list })), yossi: (await env.KV.get("yossiad")) !== "off" });
    }

    // ---------- הודעות ----------
    case "batch": {
      const ids = [...new Set((Array.isArray(body.ids) ? body.ids : []).map(x => String(x).replace(/\D/g, "")).filter(Boolean))].slice(0, 100), op = String(body.op || "");
      if (!ids.length || !["delete", "important", "regular"].includes(op)) return json({ error: "בקשה לא תקינה" }, 400);
      if (op === "important" && ids.length > 5) return json({ error: "העברה לחשובות שולחת צינתוק לכולם – עד 5 הודעות בבת אחת" }, 400);
      const results = [];
      for (const id of ids) { try { results.push({ id, r: await D.doAdmin(env, op === "delete" ? { type: "delete", id } : { type: "move", id, to: op }, admin, VIA) }); } catch (e) { results.push({ id, error: e.message }); } }
      return ok({ results });
    }
    case "upload": { // קובץ שמע מהדפדפן (WAV) → הודעה רגילה / חשובה / הודעת כניסה / תיבה אישית
      const kind = String(body.kind || ""), bytes = b64dec(body.data);
      if (bytes.length < 100 || bytes.length > 12e6) return json({ error: "הקובץ ריק או גדול מדי (עד 12MB)" }, 400);
      if (String.fromCharCode(...bytes.subarray(0, 4)) !== "RIFF") return json({ error: "הקובץ צריך להיות WAV" }, 400);
      const note = String(body.text || "").trim().slice(0, 3000);
      if (kind === "regular" || kind === "important") {
        const num = String(await D.nextFileNum(env, D.ALL)).padStart(3, "0"); await D.ymUpload(env, `${D.ALL}/${num}.wav`, bytes);
        const ops = [{ mv: [`${D.ALL}/${num}.wav`, `/DeletedByAdmin/up-${num}.wav`] }];
        if (kind === "important") { const n2 = String(await D.nextFileNum(env, D.IMPORTANT)).padStart(3, "0"); await D.ymUpload(env, `${D.IMPORTANT}/${n2}.wav`, bytes); ops.push({ mv: [`${D.IMPORTANT}/${n2}.wav`, `/DeletedByAdmin/upi-${n2}.wav`] }); }
        const from = String(body.phone || "").replace(/\D/g, ""), ar = await D.kvGet(env, "archive", {});
        ar[num + ".wav"] = { p: isPhone(from) ? from : "", n: nm[from] || "", d: D.nowIL().replace(/^(\d{4})-(\d{2})-(\d{2}) /, "$3/$2/$1 "), t: note, s: note ? "g" : "a", up: true }; await env.KV.put("archive", JSON.stringify(ar));
        await D.pushUndo(env, `העלאת הודעה ${num} מהדפדפן`, ops);
        ctx.waitUntil(D.notify(env, kind === "important" ? "important" : "regular").then(() => D.processFlags(env)).catch(() => {}));
        await D.log(env, `מנהל ${who(admin)} העלה מ${VIA} הקלטה כהודעה ${kind === "important" ? "חשובה (עם צינתוק)" : "רגילה"} מספר ${num}`);
        return ok({ id: num });
      }
      if (kind === "entry") {
        const bk = `/OldEntry/${Date.now().toString(36)}.wav`;
        const had = await D.ym(env, "FileAction", { action: "copy", what: "ivr2:/M0000-1.wav", target: "ivr2:" + bk }).then(r => r.responseStatus === "OK").catch(() => false);
        await D.ymUpload(env, "/M0000-1.wav", bytes);
        await D.pushUndo(env, "החלפת ההודעה בכניסה (הקלטה)", [had ? { copy: [bk, "/M0000-1.wav"] } : { del: "/M0000-1.wav" }]);
        await D.log(env, `מנהל ${who(admin)} החליף מ${VIA} את ההודעה בכניסה לקו בהקלטה`);
        return ok();
      }
      if (kind === "pm") {
        const p = String(body.phone || "").replace(/\D/g, ""); if (!isPhone(p)) return json({ error: "מספר לא תקין" }, 400);
        await D.ensureDir(env, D.PM(p), false).catch(() => {});
        const fname = await D.nextName(env, D.PM(p), "wav"); await D.ymUpload(env, `${D.PM(p)}/${fname}`, bytes);
        await D.log(env, `מנהל ${who(admin)} השאיר מ${VIA} הקלטה בתיבה האישית של ${who(p)}`);
        return ok({ name: fname });
      }
      return json({ error: "סוג לא מוכר" }, 400);
    }
    case "trash": {
      const d = await D.ym(env, "GetIVR2Dir", { path: "ivr2:/DeletedByAdmin" }).catch(() => ({}));
      const files = (d.files || []).filter(f => /\.wav$/.test(f.name)).map(f => ({ name: f.name, date: f.date || f.mtime || "", dur: +f.duration || 0, size: +f.size || 0, imp: /^imp-|^upi-/.test(f.name) })).sort((a, b) => (D.sortable(a.date) < D.sortable(b.date) ? 1 : -1));
      return json({ files });
    }
    case "restore": {
      const f = String(body.name || ""); if (!/^[\w-]+\.wav$/.test(f)) return json({ error: "שם קובץ לא תקין" }, 400);
      const to = body.to === "important" ? D.IMPORTANT : D.ALL, num = String(await D.nextFileNum(env, to)).padStart(3, "0");
      const r = await D.ym(env, "FileAction", { action: "move", what: "ivr2:/DeletedByAdmin/" + f, target: `ivr2:${to}/${num}.wav` });
      if (!r || r.responseStatus !== "OK") return json({ error: "ימות לא אישרו את השחזור: " + (r && r.message || "") }, 502);
      await D.pushUndo(env, `שחזור ${f} מסל המחזור`, [{ mv: [`${to}/${num}.wav`, "/DeletedByAdmin/" + f] }]);
      await D.log(env, `מנהל ${who(admin)} שחזר מ${VIA} את ${f} מסל המחזור ל${to === D.IMPORTANT ? "חשובות" : "רגילות"} (${num})`);
      return ok({ id: num });
    }
    case "purge": {
      const names = body.all ? ((await D.ym(env, "GetIVR2Dir", { path: "ivr2:/DeletedByAdmin" }).catch(() => ({}))).files || []).map(f => f.name).filter(n => /\.wav$/.test(n)) : [String(body.name || "")].filter(n => /^[\w-]+\.wav$/.test(n));
      let n = 0; for (const f of names.slice(0, 300)) { await D.ym(env, "FileAction", { action: "delete", what: "ivr2:/DeletedByAdmin/" + f }).then(r => { if (r && r.responseStatus === "OK") n++; }).catch(() => {}); }
      await D.log(env, `מנהל ${who(admin)} מחק לצמיתות מ${VIA} ${n} הקלטות מסל המחזור`);
      return ok({ n });
    }
    case "download": {
      const p = q("p"); if (!audioPathOk(D, p)) return json({ error: "נתיב לא מורשה" }, 400);
      const bytes = await D.ym(env, "DownloadFile", { path: "ivr2:" + p }); if (!bytes || bytes.length < 100 || bytes[0] === 0x7b) return json({ error: "הקובץ לא נמצא" }, 404);
      return fileResp(bytes, p.slice(1).replace(/\//g, "_"), "audio/wav");
    }
    case "zip": { // עד 60 הקלטות בקובץ אחד (בלי דחיסה)
      const paths = [...new Set((Array.isArray(body.paths) ? body.paths : []).map(String).filter(p => audioPathOk(D, p)))].slice(0, 60);
      if (!paths.length) return json({ error: "לא נבחרו הקלטות" }, 400);
      const files = [];
      for (const p of paths) { try { const b = await D.ym(env, "DownloadFile", { path: "ivr2:" + p }); if (b && b.length > 100 && b[0] !== 0x7b) files.push({ name: p.slice(1).replace(/\//g, "_"), bytes: b }); } catch {} }
      if (!files.length) return json({ error: "לא נמצאו קבצים" }, 404);
      return fileResp(makeZip(files), `recordings-${D.nowIL().slice(0, 10)}.zip`, "application/zip");
    }
    case "export_transcripts": {
      const ar = await D.kvGet(env, "archive", {}), notes = (await D.kvGet(env, "dashnotes", { msg: {} })).msg || {};
      const rows = [["מספר", "תאריך", "שם", "טלפון", "סוג תמלול", "תמלול", "הערת מנהל"]];
      for (const [k, a] of Object.entries(ar).sort((x, y) => parseInt(y[0]) - parseInt(x[0]))) rows.push([k.replace(".wav", ""), a.d || "", a.n || nm[a.p] || "", a.p || "", a.s === "g" ? "מלא" : a.s === "a" ? "אוטומטי" : "", a.t || "", (notes[k.replace(".wav", "")] || {}).t || ""]);
      return csvResp(rows, `transcripts-${D.nowIL().slice(0, 10)}.csv`);
    }

    // ---------- תזמון, שבת וחג, סיכום שבועי ----------
    case "schedule2": {
      const at = String(body.at || ""); if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(at) || at <= D.nowIL().slice(0, 16)) return json({ error: "זמן לא תקין או שכבר עבר" }, 400);
      const type = String(body.type || ""), text = String(body.text || "").trim().slice(0, 1500), every = ["day", "week"].includes(body.every) ? body.every : "", until = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(body.until || "") ? body.until : "";
      let j = { id: "j" + Date.now().toString(36), at, by: admin, via: VIA };
      if (type === "post") { if (!text) return json({ error: "אין נוסח" }, 400); j = { ...j, type: "post", text, important: !!body.important }; }
      else if (type === "tz") { const list = ["members", "admins", "general"].includes(body.list) ? body.list : "members"; j = { ...j, type: "tz", list }; }
      else if (type === "entry") { if (!text) return json({ error: "אין נוסח" }, 400); j = { ...j, type: "entry", text }; }
      else if (type === "pm") { const phones = [...new Set((Array.isArray(body.phones) ? body.phones : []).map(x => String(x).replace(/\D/g, "")).filter(isPhone))]; if (!text || !phones.length) return json({ error: "צריך נוסח ונמענים" }, 400); j = { ...j, type: "pm", text, phones }; }
      else if (type === "remind") { const p = String(body.phone || "").replace(/\D/g, ""); if (!text || !isPhone(p)) return json({ error: "צריך נוסח וחבר" }, 400); j = { ...j, type: "remind", text, phone: p }; }
      else return json({ error: "סוג תזמון לא מוכר" }, 400);
      if (every) { j.every = every; if (until) j.until = until; }
      const jobs = await D.kvGet(env, "scheduled", []); jobs.push(j); await env.KV.put("scheduled", JSON.stringify(jobs));
      await D.pushUndo(env, `תזמון ל-${at}${every ? " (חוזר)" : ""}`, [{ unsched: j.id }]);
      await D.log(env, `מנהל ${who(admin)} קבע מ${VIA} תזמון ל-${at}${every ? " חוזר כל " + (every === "day" ? "יום" : "שבוע") : ""}: ${type === "tz" ? "צינתוק ל-" + j.list : type === "pm" ? "הודעה אישית ל-" + j.phones.length + " חברים" : type === "entry" ? "הודעת כניסה" : type === "remind" ? "תזכורת ל" + who(j.phone) : (j.important ? "הודעה חשובה" : "הודעה רגילה")}${text ? ": " + text.slice(0, 120) : ""}`);
      return ok({ id: j.id });
    }
    case "holy": {
      const [periods, holy, deferred] = await Promise.all([D.holyPeriods(env).catch(() => []), D.isHoly(env).catch(() => false), D.kvGet(env, "deferred_tz", [])]);
      return json({ holy, now: D.nowIL(), periods: periods.map(([a, b]) => ({ from: D.ilAt(a), to: D.ilAt(b), active: now >= a && now <= b + 5 * 60e3, past: now > b + 5 * 60e3 })), deferred: deferred.map((phones, i) => ({ i, phones, label: phones.startsWith("tzl:") ? "רשימת " + phones.slice(4) : phones.split(":").length + " מספרים" })) });
    }
    case "deferred": {
      const d = await D.kvGet(env, "deferred_tz", []), i = +body.i;
      if (body.op === "cancel_all") { await env.KV.delete("deferred_tz"); await D.log(env, `מנהל ${who(admin)} ביטל מ${VIA} ${d.length} צינתוקים שחיכו למוצאי שבת/חג`); return ok(); }
      if (!(i >= 0 && i < d.length)) return json({ error: "לא נמצא" }, 404);
      const phones = d[i]; d.splice(i, 1); await env.KV.put("deferred_tz", JSON.stringify(d));
      if (body.op === "send") { const r = await D.ym(env, "RunTzintuk", { phones, force: true }); await D.log(env, `מנהל ${who(admin)} שלח מ${VIA} מיד צינתוק שחיכה (${phones})`); return ok({ r }); }
      await D.log(env, `מנהל ${who(admin)} ביטל מ${VIA} צינתוק שחיכה (${phones})`); return ok();
    }
    case "weekly": {
      if (req.method === "POST") {
        if (body.op === "dry") { const r = await D.weeklySummary(env, true); if (r.summary) await env.KV.put("weekly_draft", JSON.stringify({ summary: r.summary, count: r.count, d: D.nowIL() }), { expirationTtl: 7 * 86400 }); return json(r); }
        if (body.op === "send") {
          const text = String(body.text || "").trim().slice(0, 4000); if (text.length < 40) return json({ error: "הסיכום קצר מדי" }, 400);
          const [num] = await D.postVoice(env, [D.ALL], text); ctx.waitUntil(D.notify(env, "regular").then(() => D.processFlags(env)).catch(() => {}));
          await env.KV.put("weeklyDone", D.nowIL().slice(0, 10)); await env.KV.delete("weekly_draft");
          await D.log(env, `מנהל ${who(admin)} פרסם מ${VIA} את הסיכום השבועי (הודעה ${num})`);
          return ok({ file: num });
        }
        return json({ error: "פעולה לא מוכרת" }, 400);
      }
      return json({ draft: await D.kvGet(env, "weekly_draft", null), done: await env.KV.get("weeklyDone"), now: D.nowIL() });
    }

    // ---------- אירוע (שלוחה 9) ----------
    case "event": {
      const cur = await D.curEvent(env);
      if (body.op === "edit") {
        const title = String(body.title || "").trim().slice(0, 80), desc = String(body.desc || "").trim().slice(0, 200); if (!title) return json({ error: "אין שם לאירוע" }, 400);
        const ev = { ...cur, title, desc }; await env.KV.put("event", JSON.stringify(ev));
        await D.bgAdd(env, [{ k: "tts", path: "/9", name: "M1000", text: D.event9Menu(ev) }, { k: "ini", path: "/9", text: `type=menu\ntitle=${ev.title}\n` }]);
        await D.pushUndo(env, `עריכת פרטי האירוע`, [{ event: cur }]); await D.log(env, `מנהל ${who(admin)} ערך מ${VIA} את האירוע: ${title} ${desc}`);
        return ok({ event: ev });
      }
      if (body.op === "rsvp_add" || body.op === "rsvp_remove") {
        const p = String(body.phone || "").replace(/\D/g, ""); if (!isPhone(p)) return json({ error: "מספר לא תקין" }, 400);
        const list = await D.rsvpLoad(env);
        if (body.op === "rsvp_add") list[p] = { n: String(body.name || nm[p] || p).trim().slice(0, 40), ts: D.nowIL().slice(0, 16) }; else delete list[p];
        await D.rsvpSave(env, list);
        await D.log(env, `מנהל ${who(admin)} ${body.op === "rsvp_add" ? "רשם" : "הסיר"} מ${VIA} את ${who(p)} ${body.op === "rsvp_add" ? "ל" : "מ"}${cur.title}`);
        return ok({ count: Object.keys(list).length });
      }
      if (body.op === "tz_missing") {
        const list = await D.rsvpLoad(env), phones = Object.keys(nm).filter(p => !list[p]); if (!phones.length) return json({ error: "כולם כבר נרשמו" }, 400);
        const r = await tzPhones(env, D, phones);
        await D.log(env, `מנהל ${who(admin)} שלח מ${VIA} צינתוק ל-${phones.length} שעוד לא נרשמו ל${cur.title}${r && r.deferred ? " (נדחה למוצאי שבת/חג)" : ""}`);
        return ok({ count: phones.length, deferred: !!(r && r.deferred) });
      }
      return json({ error: "פעולה לא מוכרת" }, 400);
    }
    case "rsvp_csv": {
      const [ev, list] = await Promise.all([D.curEvent(env), D.rsvpLoad(env)]);
      const rows = [["שם", "טלפון", "נרשם"], ...Object.entries(list).sort((a, b) => (a[1].ts > b[1].ts ? 1 : -1)).map(([p, x]) => [x.n, p, x.ts]), [], ["לא נרשמו"], ...Object.keys(nm).filter(p => !list[p]).map(p => [nm[p], p, ""])];
      return csvResp(rows, `event-rsvp-${D.nowIL().slice(0, 10)}.csv`);
    }

    // ---------- זמן אמת, דוחות, ניתוח, ניטור ----------
    case "pulse": { // דופק קל לפולינג: מי בקו, כמה ממתינות, מספר ההודעה האחרונה
      const [online, counts, joins, last] = await Promise.all([D.onlineNow(env).then(x => x.calls).catch(() => []), Promise.all(D.PENDING_ORDER.map(k => D.pendingFiles(env, D.REVIEW[k].folder).then(f => f.length).catch(() => 0))), D.pendingFiles(env, D.REVIEW.join.folder).then(f => f.length).catch(() => 0), D.nextFileNum(env, D.ALL).catch(() => 0)]);
      return json({ now: D.nowIL(), online: online.map(c => ({ ...c, n: nm[c.p] || "" })), pending: counts.reduce((a, b) => a + b, 0), joins, lastMsg: Math.max(0, last - 1) });
    }
    case "calls": { // ציר זמן של שיחות ביום מסוים
      const day = /^\d{4}-\d{2}-\d{2}$/.test(q("day")) ? q("day") : D.nowIL().slice(0, 10), cur = D.nowIL().slice(0, 7);
      const months = day.slice(0, 7) === cur ? 1 : 2, lg = await callLog(env, D, months).catch(() => ({ ents: [] }));
      const ents = lg.ents.filter(e => e.t.startsWith(day)).sort((a, b) => (a.t < b.t ? -1 : 1)).map(e => ({ p: e.p, n: nm[e.p] || "", t: e.t.slice(11, 16), x: e.x.slice(0, 5), f: e.f, l: speakerFolder(D, e.f) }));
      return json({ day, ents, callers: new Set(ents.map(e => e.p)).size });
    }
    case "report": { // דוח חודשי (עם השוואה לחודש הקודם)
      const m = /^\d{4}-\d{2}$/.test(q("m")) ? q("m") : D.nowIL().slice(0, 7);
      const [y, mm] = m.split("-").map(Number), prevKey = new Date(Date.UTC(y, mm - 2, 1)).toISOString().slice(0, 7);
      const [cur, prev, archive, conv, imp] = await Promise.all([callLog(env, D, 1, [m]), callLog(env, D, 1, [prevKey]), D.kvGet(env, "archive", {}), D.kvGet(env, "convlog", []), D.ym(env, "GetIVR2Dir", { path: "ivr2:" + D.IMPORTANT }).catch(() => ({}))]);
      const inMonth = (d, k) => D.sortable(d).slice(0, 7) === k || String(d || "").slice(0, 7) === k;
      const msgs = Object.values(archive).filter(a => inMonth(a.d, m)).length, msgsPrev = Object.values(archive).filter(a => inMonth(a.d, prevKey)).length;
      const convN = conv.filter(c => String(c.d || "").slice(0, 7) === m).length, convPrev = conv.filter(c => String(c.d || "").slice(0, 7) === prevKey).length;
      const impN = (imp.files || []).filter(f => /^\d+\.wav$/.test(f.name) && inMonth(f.mtime || f.date, m)).length;
      const days = Object.keys(cur.byDay).sort(), byWeekday = Array(7).fill(0); for (const d of days) byWeekday[new Date(d + "T00:00:00Z").getUTCDay()] += cur.byDay[d];
      const callers = new Set(Object.keys(cur.per)).size, callersPrev = new Set(Object.keys(prev.per)).size;
      const active = Object.keys(nm).filter(p => cur.per[p]).length, silent = Object.keys(nm).filter(p => !cur.per[p]).map(p => ({ p, n: nm[p] }));
      return json({ month: m, prev: prevKey, calls: cur.total, callsPrev: prev.total, callers, callersPrev, msgs, msgsPrev, imp: impN, conv: convN, convPrev, members: Object.keys(nm).length, active, silent,
        byDay: days.map(d => ({ d, n: cur.byDay[d] })), byHour: cur.byHour, byWeekday, top: Object.entries(cur.per).map(([p, n]) => ({ p, n: who(p), calls: n })).sort((a, b) => b.calls - a.calls).slice(0, 15),
        byFolder: Object.entries(cur.byFolder).reduce((acc, [f, n]) => { const l = speakerFolder(D, f); acc[l] = (acc[l] || 0) + n; return acc; }, {}), now: D.nowIL() });
    }
    case "convstats": {
      const conv = await D.kvGet(env, "convlog", []), per = {}, byHour = Array(24).fill(0), words = {}, byDay = {};
      for (const c of conv) { per[c.p] = (per[c.p] || 0) + 1; const h = +String(c.d || "").slice(11, 13); if (h >= 0 && h < 24) byHour[h]++; const d = String(c.d || "").slice(0, 10); if (d) byDay[d] = (byDay[d] || 0) + 1;
        for (const w of String(c.q || "").replace(/[^֐-׿a-zA-Z0-9 ]/g, " ").split(/\s+/)) { const x = w.replace(/^[ושמלבכה]/, "").trim(); if (x.length >= 3 && !HE_STOP.has(w) && !HE_STOP.has(x)) words[x] = (words[x] || 0) + 1; } }
      return json({ total: conv.length, per: Object.entries(per).map(([p, n]) => ({ p, n: who(p), c: n })).sort((a, b) => b.c - a.c).slice(0, 20), byHour, words: Object.entries(words).sort((a, b) => b[1] - a[1]).slice(0, 40).map(([w, n]) => ({ w, n })),
        byDay: Object.entries(byDay).sort().slice(-30).map(([d, n]) => ({ d, n })), first: conv.length ? conv[0].d : "", conv: conv.slice(-500).reverse().map(e => ({ d: e.d, p: e.p, n: who(e.p), q: e.q, a: e.a })) });
    }
    case "health": {
      if (req.method === "POST") {
        if (body.op === "clearbg") { const n = (await D.kvGet(env, "bgjobs", [])).length; await env.KV.put("bgjobs", "[]"); await D.log(env, `מנהל ${who(admin)} ניקה מ${VIA} את תור משימות הרקע (${n})`); return ok({ n }); }
        if (body.op === "dropbg") { const qq = await D.kvGet(env, "bgjobs", []), i = +body.i; if (!(i >= 0 && i < qq.length)) return json({ error: "לא נמצא" }, 404); qq.splice(i, 1); await env.KV.put("bgjobs", JSON.stringify(qq)); return ok({ n: qq.length }); }
        return json({ error: "פעולה לא מוכרת" }, 400);
      }
      const [logR, bg, pc, aai, cron, weekly, deferred, errCount, retortq, holy, sample] = await Promise.all([D.ym(env, "GetTextFile", { what: "ivr2:/AILog.txt" }).catch(() => ({})), D.kvGet(env, "bgjobs", []), D.kvGet(env, "postcheck", {}), D.kvGet(env, "aai_pending", []),
        env.KV.get("cronlock"), env.KV.get("weeklyDone"), D.kvGet(env, "deferred_tz", []), D.pendingFiles(env, D.REVIEW.error.folder).then(f => f.length).catch(() => 0), D.kvGet(env, "retortq", []), D.isHoly(env).catch(() => null), env.KV.get("incall_sample")]);
      const lines = ((logR && logR.contents) || "").split("\n").filter(l => /שגיאה|error|נכשל|לא הצליח|תקלה/i.test(l)).slice(0, 80).map(l => { const m = /^\[([^\]]+)\]\s*(.*)$/.exec(l); return m ? { t: m[1], m: m[2] } : { t: "", m: l }; });
      const bgs = bg.map((s, i) => ({ i, k: s.k, what: s.k === "tts" ? `${s.path}/${s.name}: ${String(s.text || "").slice(0, 60)}` : s.k === "bc" ? "הודעה אישית ל" + who(s.p) : s.k === "ini" ? "ini " + s.path : s.k === "fa" ? `${s.action} ${s.what}` : s.k === "log" ? String(s.line || "").slice(0, 60) : s.k, tries: s.tries || 0 }));
      return json({ now: D.nowIL(), errors: lines, bg: bgs, postcheck: Object.keys(pc).length, aai: Array.isArray(aai) ? aai.length : Object.keys(aai || {}).length, lastCron: cron ? D.ilAt(+cron) : "", cronAgo: cron ? Math.round((now - +cron) / 1000) : null, weeklyDone: weekly || "", deferred: deferred.length, pendingError: errCount, retortq: retortq.length, holy, hasSample: !!sample, testMode: env.TEST_MODE === "1" });
    }
    case "heard": { // מי שמע כל אחת מההודעות החשובות האחרונות (לפי כניסה לשלוחה 1/1 אחרי שההודעה עלתה)
      if (req.method === "POST") {
        const phones = [...new Set((Array.isArray(body.phones) ? body.phones : []).map(x => String(x).replace(/\D/g, "")).filter(isPhone))]; if (!phones.length) return json({ error: "אין למי לשלוח" }, 400);
        const r = await tzPhones(env, D, phones); await D.log(env, `מנהל ${who(admin)} שלח מ${VIA} צינתוק ל-${phones.length} שעוד לא שמעו הודעה חשובה${r && r.deferred ? " (נדחה)" : ""}`);
        return ok({ count: phones.length, deferred: !!(r && r.deferred) });
      }
      const [imp, lg, archive] = await Promise.all([D.ym(env, "GetIVR2Dir", { path: "ivr2:" + D.IMPORTANT }).catch(() => ({})), callLog(env, D, 2).catch(() => ({ imp11: [] })), D.kvGet(env, "archive", {})]);
      const files = (imp.files || []).filter(f => /^\d+\.wav$/.test(f.name)).map(f => ({ f: f.name, t: D.sortable(f.mtime || f.date), size: +f.size || 0 })).sort((a, b) => (a.t < b.t ? 1 : -1)).slice(0, 12);
      const bySize = {}; for (const [k, a] of Object.entries(archive)) if (a && a.t) bySize[k] = a;
      const all = Object.keys(nm);
      return json({ list: files.map(x => { const heard = [...new Set(lg.imp11.filter(e => e.t >= x.t).map(e => e.p))]; return { f: x.f, t: x.t, heard: heard.map(p => ({ p, n: who(p) })), not: all.filter(p => !heard.includes(p)).map(p => ({ p, n: nm[p] })) }; }), total: all.length });
    }

    // ---------- גיבוי ושחזור ----------
    case "backup": {
      const data = {}; for (const k of BACKUP_KEYS) data[k] = await D.kvGet(env, k, null);
      data._meta = { at: D.nowIL(), line: D.LINE_PHONE, keys: BACKUP_KEYS };
      return fileResp(enc.encode(JSON.stringify(data)), `yemot-backup-${D.nowIL().slice(0, 10)}.json`, "application/json");
    }
    case "restore_backup": {
      const data = body.data && typeof body.data === "object" ? body.data : null, keys = (Array.isArray(body.keys) ? body.keys : []).filter(k => BACKUP_KEYS.includes(k));
      if (!data || !keys.length) return json({ error: "אין מה לשחזר" }, 400);
      const done = [];
      for (const k of keys) { if (data[k] === undefined) continue; if (data[k] === null) await env.KV.delete(k); else await env.KV.put(k, JSON.stringify(data[k])); done.push(k); }
      await env.KV.delete("admintext");
      await D.log(env, `מנהל ${who(admin)} שחזר מ${VIA} מגיבוי את: ${done.join(", ")}`);
      return ok({ done });
    }
  }
  return json({ error: "לא נמצא" }, 404);
}
