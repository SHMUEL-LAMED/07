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
async function newToken(env) { const exp = String(Date.now() + TTL_DAYS * 864e5); return exp + "." + await sign(env, exp); }
async function validToken(env, tok) { const [exp, sig] = String(tok || "").split("."); if (!exp || !sig || !(+exp > Date.now())) return false; return same(sig, await sign(env, exp)); }
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
    try { return withCors(await api(req, env, ctx, u, parts[1] || "", D), req); }
    catch (e) { return withCors(json({ error: String(e.message || e) }, 500), req); }
  }
  if (sub) return redirect("/admin");
  return html(PAGE);
}

// יומני הכניסה לשלוחות של ימות (LogFolderEnterExit-YYYY-MM.ymgr): שיחות לפי יום, שעה, חבר ושלוחה
async function callLog(env, D, months = 1) {
  const [y, m] = D.nowIL().slice(0, 7).split("-").map(Number), keys = [];
  for (let i = 0; i < months; i++) keys.push(new Date(Date.UTC(y, m - 1 - i, 1)).toISOString().slice(0, 7));
  const texts = await Promise.all(keys.map(k => D.ym(env, "GetTextFile", { what: `ivr2:/Log/LogFolderEnterExit-${k}.ymgr` }).then(r => (r && r.contents) || "").catch(() => "")));
  const calls = new Map(), last = {}, imp11 = [];
  for (const txt of texts) for (const line of txt.split("\n")) {
    if (!line.includes("#")) continue;
    const d = Object.fromEntries(line.split("%").map(x => x.split("#")));
    if (!d.Phone || !d.EnterDate) continue;
    const [dd, mm, yy] = d.EnterDate.split("/"), day = `${yy}-${mm}-${dd}`, t = `${day} ${d.EnterTime || ""}`;
    if (!last[d.Phone] || last[d.Phone] < t) last[d.Phone] = t;
    if (d.Folder === "1/1") imp11.push({ p: d.Phone, t });
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
  return { last, per, byDay, byHour, byFolder, imp11, callers: Object.fromEntries(Object.entries(callers).map(([k, s]) => [k, s.size])), total: calls.size, months: keys };
}
const membersList = (env, D) => D.ym(env, "TzintukimListManagement", { action: "getlistEnteres", TzintukimList: "members" }).then(r => r.enteres || []).catch(() => []);
const isPhone = p => /^0\d{8,9}$/.test(p);

async function api(req, env, ctx, u, name, D) {
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
      const ok = /^\/[\w\/-]+\/\d+\.wav$/.test(p) && (folders.some(f => p.startsWith(f + "/")) || /^\/personalMessages\/Phone\/\d+(\/Old)?\/\d+\.wav$/.test(p));
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
  return json({ error: "לא נמצא" }, 404);
}
