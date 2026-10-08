var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// src/dash.js
import PAGE from "./6afe19a4abb4a11d64497ab9fafcf1234aea92f1-dash.html";
var COOKIE = "adm";
var TTL_DAYS = 30;
var MAX_FAILS = 6;
var FAIL_WINDOW = 15 * 60;
var enc = new TextEncoder();
var b64u = /* @__PURE__ */ __name((buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""), "b64u");
var sha = /* @__PURE__ */ __name(async (s) => b64u(await crypto.subtle.digest("SHA-256", enc.encode(s))), "sha");
function same(a, b) {
  a = String(a);
  b = String(b);
  let r = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) r |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return r === 0;
}
__name(same, "same");
async function sign(env, msg) {
  const raw = await crypto.subtle.digest("SHA-256", enc.encode("dash|" + env.ADMIN_PASS + "|" + (env.RUN_KEY || "")));
  const key = await crypto.subtle.importKey("raw", raw, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64u(await crypto.subtle.sign("HMAC", key, enc.encode(msg)));
}
__name(sign, "sign");
async function newToken(env, ro = false, days = TTL_DAYS) {
  const exp = String(Date.now() + days * 864e5);
  return ro ? exp + ".ro." + await sign(env, "ro|" + exp) : exp + "." + await sign(env, exp);
}
__name(newToken, "newToken");
async function validToken(env, tok) {
  const parts = String(tok || "").split("."), exp = parts[0], ro = parts.length === 3 && parts[1] === "ro", sig = parts[parts.length - 1];
  if (!exp || !sig || parts.length > 3 || !(+exp > Date.now())) return null;
  return same(sig, await sign(env, ro ? "ro|" + exp : exp)) ? { ro, exp: +exp } : null;
}
__name(validToken, "validToken");
var cookie = /* @__PURE__ */ __name((req, name) => {
  const m = new RegExp("(?:^|;\\s*)" + name + "=([^;]*)").exec(req.headers.get("Cookie") || "");
  return m ? m[1] : "";
}, "cookie");
var setCookie = /* @__PURE__ */ __name((tok) => `${COOKIE}=${tok}; Path=/admin; Max-Age=${tok ? TTL_DAYS * 86400 : 0}; HttpOnly; Secure; SameSite=Lax`, "setCookie");
var html = /* @__PURE__ */ __name((body, status = 200, headers = {}) => new Response(body, { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Frame-Options": "DENY", "Referrer-Policy": "no-referrer", ...headers } }), "html");
var json = /* @__PURE__ */ __name((o, status = 200) => new Response(JSON.stringify(o), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } }), "json");
var GH_ORIGIN = "https://shmuel-lamed.github.io";
var corsOrigin = /* @__PURE__ */ __name((req) => req.headers.get("Origin") === GH_ORIGIN ? GH_ORIGIN : "", "corsOrigin");
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
__name(withCors, "withCors");
var redirect = /* @__PURE__ */ __name((to, headers = {}) => new Response(null, { status: 303, headers: { Location: to, ...headers } }), "redirect");
var esc = /* @__PURE__ */ __name((t) => String(t ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]), "esc");
var SMALL_CSS = `:root{color-scheme:light;--bg:#f9f9f7;--card:#fcfcfb;--ink:#0b0b0b;--mut:#52514e;--line:#e1e0d9;--acc:#2a78d6;--bad:#d03b3b}
@media(prefers-color-scheme:dark){:root{color-scheme:dark;--bg:#0d0d0d;--card:#1a1a19;--ink:#fff;--mut:#c3c2b7;--line:#2c2c2a;--acc:#3987e5;--bad:#e66767}}
*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;background:var(--bg);color:var(--ink);font:16px/1.5 system-ui,-apple-system,"Segoe UI",Arial,sans-serif;padding:16px}
.box{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:28px 24px;width:min(380px,100%);display:grid;gap:12px}h1{margin:0;font-size:20px}p{margin:0;color:var(--mut);font-size:14px}
input{font:inherit;padding:12px;border:1px solid var(--line);border-radius:10px;background:transparent;color:inherit;width:100%}button{font:inherit;font-weight:600;padding:12px;border:0;border-radius:10px;background:var(--acc);color:#fff;cursor:pointer}.err{color:var(--bad);font-size:14px}code{font-size:13px;background:var(--bg);padding:2px 6px;border-radius:6px}`;
var shell = /* @__PURE__ */ __name((inner) => `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>\u05E0\u05D9\u05D4\u05D5\u05DC \u05E7\u05D5 \u05D4\u05E7\u05D1\u05D5\u05E6\u05D4</title><style>${SMALL_CSS}</style></head><body>${inner}</body></html>`, "shell");
var loginPage = /* @__PURE__ */ __name((err = "") => shell(`<form class="box" method="post" action="/admin/login"><h1>\u05E0\u05D9\u05D4\u05D5\u05DC \u05E7\u05D5 \u05D4\u05E7\u05D1\u05D5\u05E6\u05D4</h1><p>079-494-7582</p>${err ? `<div class="err">${esc(err)}</div>` : ""}<input type="password" name="p" placeholder="\u05E1\u05D9\u05E1\u05DE\u05D4" autocomplete="current-password" autofocus required><button>\u05DB\u05E0\u05D9\u05E1\u05D4</button></form>`), "loginPage");
var setupPage = shell(`<div class="box"><h1>\u05D3\u05E3 \u05D4\u05E0\u05D9\u05D4\u05D5\u05DC \u05E0\u05E2\u05D5\u05DC</h1><p>\u05DB\u05D3\u05D9 \u05DC\u05D4\u05E4\u05E2\u05D9\u05DC \u05D0\u05D5\u05EA\u05D5 \u05E6\u05E8\u05D9\u05DA \u05DC\u05D4\u05D2\u05D3\u05D9\u05E8 \u05E1\u05D9\u05E1\u05DE\u05D4 \u05DB\u05E1\u05D5\u05D3 \u05D1\u05E9\u05DD <code>ADMIN_PASS</code> \u05D1-Cloudflare: Workers &amp; Pages \u2190 yemot-ai \u2190 Settings \u2190 Variables and Secrets (\u05D0\u05D5 <code>npx wrangler secret put ADMIN_PASS</code>). \u05D0\u05D7\u05E8\u05D9 \u05D4\u05D4\u05D2\u05D3\u05E8\u05D4 \u05D4\u05D3\u05E3 \u05E0\u05E4\u05EA\u05D7 \u05DE\u05D9\u05D3, \u05D1\u05DC\u05D9 \u05E4\u05E8\u05D9\u05E1\u05D4 \u05E0\u05D5\u05E1\u05E4\u05EA.</p></div>`);
var failKey = /* @__PURE__ */ __name((ip) => "dash_fail:" + ip, "failKey");
async function fails(env, ip) {
  try {
    return await env.KV.get(failKey(ip), "json") || { n: 0 };
  } catch {
    return { n: 0 };
  }
}
__name(fails, "fails");
async function adminApp(req, env, ctx, u, parts, D) {
  const sub = parts[0] || "";
  if (!env.ADMIN_PASS) return html(setupPage, 503);
  const viaBridge = !!env.BRIDGE_KEY && same(req.headers.get("x-bridge-key") || "", env.BRIDGE_KEY);
  const ip = viaBridge ? "b:" + String(req.headers.get("x-client-ip") || "?").slice(0, 64) : req.headers.get("CF-Connecting-IP") || "?";
  if (sub === "api" && req.method === "OPTIONS") {
    if (!corsOrigin(req)) return json({ error: "\u05DE\u05E7\u05D5\u05E8 \u05DC\u05D0 \u05DE\u05D5\u05E8\u05E9\u05D4" }, 403);
    return withCors(new Response(null, { status: 204 }), req);
  }
  if (sub === "api" && parts[1] === "session") {
    const origin = req.headers.get("Origin") || "";
    if (origin && origin !== GH_ORIGIN) return json({ error: "\u05DE\u05E7\u05D5\u05E8 \u05DC\u05D0 \u05DE\u05D5\u05E8\u05E9\u05D4" }, 403);
    if (req.method !== "POST") return withCors(json({ error: "\u05E9\u05D9\u05D8\u05D4 \u05DC\u05D0 \u05DE\u05D5\u05E8\u05E9\u05D9\u05EA" }, 405), req);
    const f = await fails(env, ip);
    if (f.n >= MAX_FAILS) return withCors(json({ error: "\u05D9\u05D5\u05EA\u05E8 \u05DE\u05D3\u05D9 \u05E0\u05D9\u05E1\u05D9\u05D5\u05E0\u05D5\u05EA. \u05E0\u05E1\u05D5 \u05E9\u05D5\u05D1 \u05D1\u05E2\u05D5\u05D3 \u05E8\u05D1\u05E2 \u05E9\u05E2\u05D4" }, 429), req);
    const body = await req.json().catch(() => ({}));
    const pass = String(body.password || "");
    if (!pass || !same(await sha(pass), await sha(env.ADMIN_PASS))) {
      await env.KV.put(failKey(ip), JSON.stringify({ n: f.n + 1 }), { expirationTtl: FAIL_WINDOW }).catch(() => {
      });
      await D.log(env, `\u05E0\u05D9\u05E1\u05D9\u05D5\u05DF \u05DB\u05E0\u05D9\u05E1\u05D4 \u05E9\u05D2\u05D5\u05D9 \u05DC\u05D3\u05E3 \u05D4\u05E0\u05D9\u05D4\u05D5\u05DC \u05DE-GitHub Pages (${ip})`).catch(() => {
      });
      return withCors(json({ error: "\u05E1\u05D9\u05E1\u05DE\u05D4 \u05E9\u05D2\u05D5\u05D9\u05D4" }, 401), req);
    }
    if (f.n) await env.KV.delete(failKey(ip)).catch(() => {
    });
    return withCors(json({ token: await newToken(env) }), req);
  }
  if (sub === "login") {
    if (req.method !== "POST") return redirect("/admin");
    const f = await fails(env, ip);
    if (f.n >= MAX_FAILS) return html(loginPage("\u05D9\u05D5\u05EA\u05E8 \u05DE\u05D3\u05D9 \u05E0\u05D9\u05E1\u05D9\u05D5\u05E0\u05D5\u05EA. \u05E0\u05E1\u05D5 \u05E9\u05D5\u05D1 \u05D1\u05E2\u05D5\u05D3 \u05E8\u05D1\u05E2 \u05E9\u05E2\u05D4"), 429);
    const form = await req.formData().catch(() => null);
    const pass = String(form && form.get("p") || "");
    if (!pass || !same(await sha(pass), await sha(env.ADMIN_PASS))) {
      await env.KV.put(failKey(ip), JSON.stringify({ n: f.n + 1 }), { expirationTtl: FAIL_WINDOW }).catch(() => {
      });
      await D.log(env, `\u05E0\u05D9\u05E1\u05D9\u05D5\u05DF \u05DB\u05E0\u05D9\u05E1\u05D4 \u05E9\u05D2\u05D5\u05D9 \u05DC\u05D3\u05E3 \u05D4\u05E0\u05D9\u05D4\u05D5\u05DC (${ip})`).catch(() => {
      });
      return html(loginPage("\u05E1\u05D9\u05E1\u05DE\u05D4 \u05E9\u05D2\u05D5\u05D9\u05D4"), 401);
    }
    if (f.n) await env.KV.delete(failKey(ip)).catch(() => {
    });
    return redirect("/admin", { "Set-Cookie": setCookie(await newToken(env)) });
  }
  if (sub === "logout") return redirect("/admin", { "Set-Cookie": setCookie("") });
  const m = /^Bearer\s+(.+)$/i.exec(req.headers.get("Authorization") || "");
  const queryToken = sub === "api" && parts[1] === "audio" ? String(u.searchParams.get("token") || "") : "";
  const token = cookie(req, COOKIE) || m && m[1] || queryToken;
  const authed = await validToken(env, token);
  if (!authed) return sub === "api" ? withCors(json({ error: "\u05DC\u05D0 \u05DE\u05D7\u05D5\u05D1\u05E8" }, 401), req) : html(loginPage());
  if (sub === "api") {
    if (req.method === "POST" && req.headers.get("X-Requested-With") !== "dash") return withCors(json({ error: "\u05D1\u05E7\u05E9\u05D4 \u05DC\u05D0 \u05EA\u05E7\u05D9\u05E0\u05D4" }, 400), req);
    const origin = req.headers.get("Origin") || "", gh = origin === GH_ORIGIN;
    const site = req.headers.get("Sec-Fetch-Site");
    if (site && site !== "same-origin" && site !== "none" && !gh) return withCors(json({ error: "\u05D1\u05E7\u05E9\u05D4 \u05DC\u05D0 \u05EA\u05E7\u05D9\u05E0\u05D4" }, 403), req);
    if (authed.ro && req.method === "POST") return withCors(json({ error: "\u05E7\u05D9\u05E9\u05D5\u05E8 \u05DC\u05E6\u05E4\u05D9\u05D9\u05D4 \u05D1\u05DC\u05D1\u05D3 \u2013 \u05D0\u05D9 \u05D0\u05E4\u05E9\u05E8 \u05DC\u05D1\u05E6\u05E2 \u05E4\u05E2\u05D5\u05DC\u05D5\u05EA" }, 403), req);
    try {
      return withCors(await api(req, env, ctx, u, parts[1] || "", D, authed), req);
    } catch (e) {
      return withCors(json({ error: String(e.message || e) }, 500), req);
    }
  }
  if (sub) return redirect("/admin");
  return html(PAGE);
}
__name(adminApp, "adminApp");
async function callLog(env, D, months = 1, keys = null) {
  const [y, m] = D.nowIL().slice(0, 7).split("-").map(Number);
  if (!keys) {
    keys = [];
    for (let i = 0; i < months; i++) keys.push(new Date(Date.UTC(y, m - 1 - i, 1)).toISOString().slice(0, 7));
  }
  const texts = await Promise.all(keys.map((k) => D.ym(env, "GetTextFile", { what: `ivr2:/Log/LogFolderEnterExit-${k}.ymgr` }).then((r) => r && r.contents || "").catch(() => "")));
  const calls = /* @__PURE__ */ new Map(), last = {}, imp11 = [], ents = [];
  for (const txt of texts) for (const line of txt.split("\n")) {
    if (!line.includes("#")) continue;
    const d = Object.fromEntries(line.split("%").map((x) => x.split("#")));
    if (!d.Phone || !d.EnterDate) continue;
    const [dd, mm, yy] = d.EnterDate.split("/"), day = `${yy}-${mm}-${dd}`, t = `${day} ${d.EnterTime || ""}`;
    if (!last[d.Phone] || last[d.Phone] < t) last[d.Phone] = t;
    if (d.Folder === "1/1") imp11.push({ p: d.Phone, t });
    ents.push({ p: d.Phone, t, f: d.Folder || "", x: d.ExitTime || "", id: d.CallId || t + d.Phone });
    const id = d.CallId || t + d.Phone;
    let c = calls.get(id);
    if (!c) {
      c = { p: d.Phone, day, h: +(d.EnterTime || "0").slice(0, 2) || 0, folders: /* @__PURE__ */ new Set() };
      calls.set(id, c);
    }
    if (d.Folder) c.folders.add(d.Folder);
  }
  const per = {}, byDay = {}, byHour = Array(24).fill(0), byFolder = {}, callers = {};
  for (const c of calls.values()) {
    byDay[c.day] = (byDay[c.day] || 0) + 1;
    byHour[c.h] = (byHour[c.h] || 0) + 1;
    per[c.p] = (per[c.p] || 0) + 1;
    (callers[c.day] = callers[c.day] || /* @__PURE__ */ new Set()).add(c.p);
    for (const f of c.folders) byFolder[f] = (byFolder[f] || 0) + 1;
  }
  return { last, per, byDay, byHour, byFolder, imp11, ents, callers: Object.fromEntries(Object.entries(callers).map(([k, s]) => [k, s.size])), total: calls.size, months: keys };
}
__name(callLog, "callLog");
var membersList = /* @__PURE__ */ __name((env, D) => D.ym(env, "TzintukimListManagement", { action: "getlistEnteres", TzintukimList: "members" }).then((r) => r.enteres || []).catch(() => []), "membersList");
var isPhone = /* @__PURE__ */ __name((p) => /^0\d{8,9}$/.test(p), "isPhone");
async function api(req, env, ctx, u, name, D, auth = {}) {
  const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
  const nm = D.names(env), who = /* @__PURE__ */ __name((p) => nm[p] || p || "\u05DC\u05D0 \u05D9\u05D3\u05D5\u05E2", "who");
  const admin = D.OWNER, VIA = "\u05D3\u05E3 \u05D4\u05E0\u05D9\u05D4\u05D5\u05DC", now = Date.now();
  switch (name) {
    case "overview": {
      const [online, counts, joins, rsvp2, ev, jobs, holy, deferred, undo, watch, allCount, members, admins] = await Promise.all([
        D.onlineNow(env).then((x) => x.calls).catch(() => []),
        Promise.all(D.PENDING_ORDER.map((k) => D.pendingFiles(env, D.REVIEW[k].folder).then((f) => f.length).catch(() => 0))),
        D.pendingFiles(env, D.REVIEW.join.folder).then((f) => f.length).catch(() => 0),
        D.rsvpLoad(env).catch(() => ({})),
        D.curEvent(env),
        D.kvGet(env, "scheduled", []),
        D.isHoly(env).catch(() => false),
        D.kvGet(env, "deferred_tz", []),
        D.kvGet(env, "undo", []),
        D.kvGet(env, "watch", {}),
        D.nextFileNum(env, D.ALL).catch(() => 0),
        membersList(env, D),
        D.listPhones(env, "admins").catch(() => [])
      ]);
      const muted = Object.entries(watch).filter(([, w]) => w && w.hold && (!w.until || w.until > now)).map(([p, w]) => ({ p, n: who(p), until: w.until ? D.ilAt(w.until).slice(0, 16) : "" }));
      return json({
        now: D.nowIL(),
        names: nm,
        online: online.map((c) => ({ ...c, n: nm[c.p] || "" })),
        pending: D.PENDING_ORDER.map((k, i) => ({ k, name: D.REVIEW[k].name, n: counts[i] })),
        joins,
        event: { title: ev.title, desc: ev.desc, count: Object.keys(rsvp2).length, total: Object.keys(nm).length },
        jobs: jobs.filter((j) => !j.done).sort((a, b) => a.at < b.at ? -1 : 1).slice(0, 8).map((j) => ({ ...j, who: j.phone ? who(j.phone) : "" })),
        holy,
        deferred,
        undo: undo.length ? undo[undo.length - 1] : null,
        muted,
        members: { active: members.filter((e) => e.active).length, total: members.length },
        admins: [.../* @__PURE__ */ new Set([...admins, D.OWNER])].map((p) => ({ p, n: who(p) })),
        allCount
      });
    }
    case "online": {
      const { calls } = await D.onlineNow(env);
      return json({ now: D.nowIL(), online: calls.map((c) => ({ ...c, n: nm[c.p] || "" })) });
    }
    case "hangup": {
      const id = String(body.id || "").trim();
      if (!id) return json({ error: "\u05DC\u05E9\u05D9\u05D7\u05D4 \u05D4\u05D6\u05D5 \u05D0\u05D9\u05DF \u05DE\u05D6\u05D4\u05D4, \u05D0\u05D9 \u05D0\u05E4\u05E9\u05E8 \u05DC\u05E0\u05EA\u05E7 \u05D0\u05D5\u05EA\u05D4 \u05DE\u05DB\u05D0\u05DF" }, 400);
      const r = await D.ym(env, "CallAction", { ids: id, action: "set:GOasap=hangup" });
      await D.log(env, `\u05DE\u05E0\u05D4\u05DC ${who(admin)} \u05E0\u05D9\u05EA\u05E7 \u05DE${VIA} \u05D0\u05EA \u05D4\u05E9\u05D9\u05D7\u05D4 \u05E9\u05DC ${who(body.phone)}`);
      return json({ ok: r && r.responseStatus === "OK", r });
    }
    case "tzintuk": {
      const list = ["members", "admins", "general"].includes(body.list) ? body.list : "";
      if (!list) return json({ error: "\u05E8\u05E9\u05D9\u05DE\u05D4 \u05DC\u05D0 \u05DE\u05D5\u05DB\u05E8\u05EA" }, 400);
      const r = await D.tzintuk(env, list);
      await D.log(env, `\u05DE\u05E0\u05D4\u05DC ${who(admin)} \u05E9\u05DC\u05D7 \u05DE${VIA} \u05E6\u05D9\u05E0\u05EA\u05D5\u05E7 \u05DC\u05E8\u05E9\u05D9\u05DE\u05EA ${list}${r.deferred ? " (\u05E0\u05D3\u05D7\u05D4 \u05DC\u05DE\u05D5\u05E6\u05D0\u05D9 \u05E9\u05D1\u05EA/\u05D7\u05D2)" : ""}`);
      return json({ ok: !!r && r.responseStatus === "OK", deferred: !!r.deferred });
    }
    case "pending": {
      const kinds = [...D.PENDING_ORDER, "join"];
      const [lists, jmap, demap, archive] = await Promise.all([Promise.all(kinds.map((k) => D.pendingFiles(env, D.REVIEW[k].folder).catch(() => []))), D.kvGet(env, "joinmap", {}), D.kvGet(env, "demap", {}), D.kvGet(env, "archive", {})]);
      return json({ names: nm, lists: kinds.map((k, i) => ({ k, name: D.REVIEW[k].name, folder: D.REVIEW[k].folder, files: lists[i].map((f) => {
        const p = f.phone || jmap[f.name] || "", copy = k === "demoted" ? demap[f.name] : "";
        return { name: f.name, p, n: p ? nm[p] || "" : "", date: f.date || f.mtime || "", dur: +f.duration || 0, size: +f.size || 0, t: copy && archive[copy] ? archive[copy].t : "" };
      }) })) });
    }
    case "review": {
      const kind = D.REVIEW[body.kind] ? body.kind : "", act = String(body.act || ""), file = String(body.file || "");
      if (!kind || !/^\d+\.wav$/.test(file) || !["1", "2", "3"].includes(act)) return json({ error: "\u05D1\u05E7\u05E9\u05D4 \u05DC\u05D0 \u05EA\u05E7\u05D9\u05E0\u05D4" }, 400);
      const f = (await D.pendingFiles(env, D.REVIEW[kind].folder)).find((x) => x.name === file);
      if (!f) return json({ msg: "\u05D4\u05D4\u05D5\u05D3\u05E2\u05D4 \u05D4\u05D6\u05D5 \u05DB\u05D1\u05E8 \u05D8\u05D5\u05E4\u05DC\u05D4", gone: true });
      if (kind === "join" && act === "1" && body.name) {
        const jmap = await D.kvGet(env, "joinmap", {}), p = f.phone || jmap[f.name] || "";
        if (!isPhone(p)) return json({ error: "\u05DC\u05D0 \u05D9\u05D3\u05D5\u05E2 \u05DE\u05D0\u05D9\u05D6\u05D4 \u05DE\u05E1\u05E4\u05E8 \u05D4\u05D1\u05E7\u05E9\u05D4" }, 400);
        return json({ msg: await D.doAdmin(env, { type: "approve_join", phone: p, name: String(body.name).trim().slice(0, 40) }, admin, VIA) });
      }
      return json({ msg: await D.applyReview(env, ctx, kind, f, act, admin, " \u05DE" + VIA) });
    }
    case "audio": {
      const p = String(u.searchParams.get("p") || "");
      const folders = [...Object.values(D.REVIEW).map((r) => r.folder), D.ALL, D.IMPORTANT, "/DeletedByAdmin"];
      const ok = audioPathOk(D, p) && (folders.some((f) => p.startsWith(f + "/")) || /^\/personalMessages\/Phone\/\d+(\/Old)?\/\d+\.wav$/.test(p));
      if (!ok) return json({ error: "\u05E0\u05EA\u05D9\u05D1 \u05DC\u05D0 \u05DE\u05D5\u05E8\u05E9\u05D4" }, 400);
      const bytes = await D.ym(env, "DownloadFile", { path: "ivr2:" + p });
      if (!bytes || bytes.length < 100 || bytes[0] === 123) return json({ error: "\u05D4\u05E7\u05D5\u05D1\u05E5 \u05DC\u05D0 \u05E0\u05DE\u05E6\u05D0" }, 404);
      return new Response(bytes, { headers: { "Content-Type": "audio/wav", "Cache-Control": "private, max-age=600", "Content-Disposition": `inline; filename="${p.split("/").pop()}"` } });
    }
    case "messages": {
      const n = Math.min(+u.searchParams.get("n") || 200, 3e3);
      const [all, imp, archive] = await Promise.all([D.allFiles(env, D.ALL), D.ym(env, "GetIVR2Dir", { path: "ivr2:" + D.IMPORTANT }).catch(() => ({})), D.kvGet(env, "archive", {})]);
      const impSizes = new Set((imp.files || []).filter((f) => /^\d+\.wav$/.test(f.name)).map((f) => f.size));
      const files = (all.files || []).filter((f) => /^\d+\.wav$/.test(f.name)).sort((a, b) => parseInt(b.name) - parseInt(a.name));
      return json({ total: files.length, names: nm, list: files.slice(0, n).map((f) => {
        const a = archive[f.name] || {}, p = f.phone || a.p || "";
        return { id: f.name.replace(".wav", ""), p, n: nm[p] || a.n || "", date: f.date || f.mtime || a.d || "", dur: +f.duration || 0, size: +f.size || 0, t: a.t || "", imp: impSizes.has(f.size) };
      }) });
    }
    case "act": {
      const a = body.a || {};
      if (!D.ADMIN_ACTS.has(a.type)) return json({ error: "\u05E4\u05E2\u05D5\u05DC\u05D4 \u05DC\u05D0 \u05DE\u05D5\u05DB\u05E8\u05EA" }, 400);
      if (a.type === "schedule" && !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(a.at || "")) return json({ error: "\u05D6\u05DE\u05DF \u05DC\u05D0 \u05EA\u05E7\u05D9\u05DF" }, 400);
      if (["mute", "unmute", "rename", "approve_join"].includes(a.type) && !isPhone(String(a.phone || ""))) return json({ error: "\u05DE\u05E1\u05E4\u05E8 \u05D8\u05DC\u05E4\u05D5\u05DF \u05DC\u05D0 \u05EA\u05E7\u05D9\u05DF" }, 400);
      const r = await D.doAdmin(env, a, admin, VIA);
      return json({ r, desc: D.describeAct(a, env) });
    }
    case "members": {
      const [people, mem, general, admins, rsvp2, watch, approved, blocked, jmap, joins, calls] = await Promise.all([
        D.peopleList(env),
        membersList(env, D),
        D.listPhones(env, "general").catch(() => []),
        D.listPhones(env, "admins").catch(() => []),
        D.rsvpLoad(env).catch(() => ({})),
        D.kvGet(env, "watch", {}),
        D.kvGet(env, "approved", {}),
        D.kvGet(env, "blocked", []),
        D.kvGet(env, "joinmap", {}),
        D.pendingFiles(env, D.REVIEW.join.folder).catch(() => []),
        callLog(env, D, 1).catch(() => ({ last: {}, per: {} }))
      ]);
      const mstat = Object.fromEntries(mem.map((e) => [e.phone, e.active])), codes = Object.fromEntries(people.map((p) => [p.p, p.c]));
      const phones = [.../* @__PURE__ */ new Set([...Object.keys(nm), ...mem.map((e) => e.phone), ...people.map((p) => p.p)])];
      const rows = phones.map((p) => {
        const w = watch[p], mutedOn = w && w.hold && (!w.until || w.until > now);
        return { p, n: nm[p] || "", code: codes[p] || "", tz: mstat[p] === true ? "on" : mstat[p] === false ? "off" : "none", general: general.includes(p), admin: admins.includes(p) || p === D.OWNER, rsvp: !!rsvp2[p], muted: mutedOn ? w.until ? D.ilAt(w.until).slice(0, 16) : "\u05DC\u05DC\u05D0 \u05D4\u05D2\u05D1\u05DC\u05D4" : "", last: calls.last[p] || "", calls: calls.per[p] || 0, blocked: blocked.includes(p) };
      });
      rows.sort((a, b) => (a.n || "\u05EA\u05EA\u05EA").localeCompare(b.n || "\u05EA\u05EA\u05EA", "he"));
      return json({ names: nm, owner: D.OWNER, rows, blocked: blocked.map((p) => ({ p, n: nm[p] || "" })), approved: Object.entries(approved).map(([p, x]) => ({ p, n: nm[p] || "", t: x.t, by: who(x.by) })), joins: joins.map((f) => ({ name: f.name, p: f.phone || jmap[f.name] || "", date: f.date || f.mtime || "" })) });
    }
    case "block": {
      const p = String(body.phone || "").replace(/\D/g, "");
      if (!isPhone(p)) return json({ error: "\u05DE\u05E1\u05E4\u05E8 \u05DC\u05D0 \u05EA\u05E7\u05D9\u05DF" }, 400);
      const blocked = await D.kvGet(env, "blocked", []), on = !!body.on, next = on ? [.../* @__PURE__ */ new Set([...blocked, p])] : blocked.filter((x) => x !== p);
      await env.KV.put("blocked", JSON.stringify(next));
      await D.log(env, `\u05DE\u05E0\u05D4\u05DC ${who(admin)} ${on ? "\u05D7\u05E1\u05DD \u05DE" + VIA + " \u05D0\u05EA" : "\u05D4\u05E1\u05D9\u05E8 \u05DE" + VIA + " \u05D0\u05EA \u05D4\u05D7\u05E1\u05D9\u05DE\u05D4 \u05E9\u05DC"} ${who(p)} (${p})`);
      return json({ ok: true, blocked: next });
    }
    case "schedule": {
      const [jobs, ev, rsvp2] = await Promise.all([D.kvGet(env, "scheduled", []), D.curEvent(env), D.rsvpLoad(env).catch(() => ({}))]);
      return json({
        names: nm,
        now: D.nowIL(),
        jobs: jobs.slice().sort((a, b) => a.at < b.at ? 1 : -1).map((j, i) => ({ ...j, i, who: j.phone ? who(j.phone) : "", byName: j.by ? who(j.by) : "" })),
        event: ev,
        rsvp: Object.entries(rsvp2).map(([p, x]) => ({ p, n: x.n, ts: x.ts })).sort((a, b) => a.ts < b.ts ? -1 : 1),
        notReg: Object.keys(nm).filter((p) => !rsvp2[p]).map((p) => ({ p, n: nm[p] }))
      });
    }
    case "unsched": {
      const jobs = await D.kvGet(env, "scheduled", []);
      const j = jobs.find((x) => !x.done && (body.id ? x.id === body.id : x.at === body.at && (x.text || "") === (body.text || "") && x.type === body.type));
      if (!j) return json({ error: "\u05DC\u05D0 \u05E0\u05DE\u05E6\u05D0\u05D4 \u05DE\u05E9\u05D9\u05DE\u05D4 \u05DE\u05DE\u05EA\u05D9\u05E0\u05D4 \u05DB\u05D6\u05D5" }, 404);
      await env.KV.put("scheduled", JSON.stringify(jobs.filter((x) => x !== j)));
      await D.log(env, `\u05DE\u05E0\u05D4\u05DC ${who(admin)} \u05D1\u05D9\u05D8\u05DC \u05DE${VIA} \u05DE\u05E9\u05D9\u05DE\u05D4 \u05DE\u05EA\u05D5\u05D6\u05DE\u05E0\u05EA \u05DC-${j.at}: ${j.type === "remind" ? "\u05EA\u05D6\u05DB\u05D5\u05E8\u05EA \u05DC" + who(j.phone) : j.text || j.type}`);
      return json({ ok: true });
    }
    case "assistant": {
      const [conv, rules, retort, undo, strict] = await Promise.all([D.kvGet(env, "convlog", []), D.kvGet(env, "rules", []), D.kvGet(env, "retort", []), D.kvGet(env, "undo", []), D.kvGet(env, "strict", [])]);
      return json({ names: nm, conv: conv.slice(-400).reverse().map((e) => ({ d: e.d, p: e.p, n: who(e.p), q: e.q, a: e.a })), rules, retort: retort.map((p) => ({ p, n: who(p) })), strict: strict.map((p) => ({ p, n: who(p) })), undo: undo.slice().reverse() });
    }
    case "stats": {
      const [lg, imp, archive, deferred, holy, profiles, conv] = await Promise.all([callLog(env, D, 2), D.ym(env, "GetIVR2Dir", { path: "ivr2:" + D.IMPORTANT }).catch(() => ({})), D.kvGet(env, "archive", {}), D.kvGet(env, "deferred_tz", []), D.isHoly(env).catch(() => false), D.kvGet(env, "profiles", {}), D.kvGet(env, "convlog", [])]);
      const days = [];
      for (let i = 29; i >= 0; i--) days.push(D.ilAt(now - i * 864e5).slice(0, 10));
      const lastImp = (imp.files || []).filter((f) => /^\d+\.wav$/.test(f.name)).map((f) => ({ f: f.name, t: D.sortable(f.mtime || f.date) })).sort((a, b) => a.t < b.t ? 1 : -1)[0] || null;
      const heard = lastImp ? [...new Set(lg.imp11.filter((e) => e.t >= lastImp.t).map((e) => e.p))] : [];
      const msgsByDay = {};
      for (const a of Object.values(archive)) {
        const t = D.sortable(a.d);
        if (t) msgsByDay[t.slice(0, 10)] = (msgsByDay[t.slice(0, 10)] || 0) + 1;
      }
      const convByDay = {};
      for (const e of conv) {
        const d = String(e.d || "").slice(0, 10);
        if (d) convByDay[d] = (convByDay[d] || 0) + 1;
      }
      const weekAgo = D.ilAt(now - 7 * 864e5).slice(0, 16);
      const folderLabel = /* @__PURE__ */ __name((f) => {
        const p = "/" + f;
        for (const [pre, label] of D.WHERE) if (p === pre || p.startsWith(pre + "/")) return label;
        return f ? "\u05E9\u05DC\u05D5\u05D7\u05D4 " + f : "\u05D4\u05EA\u05E4\u05E8\u05D9\u05D8 \u05D4\u05E8\u05D0\u05E9\u05D9";
      }, "folderLabel");
      const byFolder = {};
      for (const [f, n] of Object.entries(lg.byFolder)) {
        const l = folderLabel(f);
        byFolder[l] = (byFolder[l] || 0) + n;
      }
      return json({
        today: days[29],
        days,
        calls: days.map((d) => lg.byDay[d] || 0),
        callers: days.map((d) => lg.callers[d] || 0),
        msgs: days.map((d) => msgsByDay[d] || 0),
        conv: days.map((d) => convByDay[d] || 0),
        byHour: lg.byHour,
        perMember: Object.entries(lg.per).map(([p, n]) => ({ p, n: who(p), calls: n })).sort((a, b) => b.calls - a.calls).slice(0, 20),
        byFolder: Object.entries(byFolder).map(([l, n]) => ({ l, n })).sort((a, b) => b.n - a.n).slice(0, 12),
        lastImp,
        heard: heard.map((p) => ({ p, n: who(p) })),
        notHeard: lastImp ? Object.keys(nm).filter((p) => !heard.includes(p)).map((p) => ({ p, n: nm[p] })) : [],
        quiet: Object.keys(nm).filter((p) => !lg.last[p] || lg.last[p] < weekAgo).map((p) => ({ p, n: nm[p], last: lg.last[p] || "" })),
        holy,
        deferred,
        system: { archive: Object.keys(archive).length, transcribed: Object.values(archive).filter((a) => a.t).length, profiles: Object.keys(profiles).length, conv: conv.length, months: lg.months, totalCalls: lg.total }
      });
    }
    case "log": {
      const r = await D.ym(env, "GetTextFile", { what: "ivr2:/AILog.txt" }).catch(() => ({}));
      const lines = (r && r.contents || "").split("\n").filter(Boolean).slice(0, 500).map((l) => {
        const m = /^\[([^\]]+)\]\s*(.*)$/.exec(l);
        return m ? { t: m[1], m: m[2] } : { t: "", m: l };
      });
      return json({ lines });
    }
  }
  return api2(req, env, ctx, u, name, D, auth, body, nm, who, admin, VIA, now);
}
__name(api, "api");
var BACKUP_KEYS = ["people", "names_over", "rules", "scheduled", "blocked", "watch", "retort", "strict", "ads", "event", "approved", "archive", "facts", "profiles", "dashnotes", "joinmap", "demap"];
var b64dec = /* @__PURE__ */ __name((s) => Uint8Array.from(atob(String(s || "").replace(/^data:[^,]*,/, "")), (c) => c.charCodeAt(0)), "b64dec");
var csvCell = /* @__PURE__ */ __name((v) => {
  const s = String(v ?? "");
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}, "csvCell");
var csvResp = /* @__PURE__ */ __name((rows, name) => new Response("\uFEFF" + rows.map((r) => r.map(csvCell).join(",")).join("\r\n"), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(name)}`, "Cache-Control": "no-store" } }), "csvResp");
var fileResp = /* @__PURE__ */ __name((bytes, name, type = "application/octet-stream") => new Response(bytes, { headers: { "Content-Type": type, "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(name)}`, "Cache-Control": "no-store" } }), "fileResp");
var MSG_FOLDERS = /* @__PURE__ */ __name((D) => [...Object.values(D.REVIEW).map((r) => r.folder), D.ALL, D.IMPORTANT, "/DeletedByAdmin"], "MSG_FOLDERS");
var audioPathOk = /* @__PURE__ */ __name((D, p) => /^\/[\w\/-]+\/[\w-]+\.wav$/.test(p) && (MSG_FOLDERS(D).some((f) => p.startsWith(f + "/")) || /^\/personalMessages\/Phone\/\d+(\/Old)?\/\d+\.wav$/.test(p)), "audioPathOk");
var CRC_TABLE = null;
function crc32(bytes) {
  if (!CRC_TABLE) {
    CRC_TABLE = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c2 = n;
      for (let k = 0; k < 8; k++) c2 = c2 & 1 ? 3988292384 ^ c2 >>> 1 : c2 >>> 1;
      CRC_TABLE[n] = c2;
    }
  }
  let c = -1;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 255] ^ c >>> 8;
  return (c ^ -1) >>> 0;
}
__name(crc32, "crc32");
function makeZip(files) {
  const parts = [], central = [];
  let off = 0;
  const le16 = /* @__PURE__ */ __name((n) => [n & 255, n >> 8 & 255], "le16"), le32 = /* @__PURE__ */ __name((n) => [n & 255, n >> 8 & 255, n >> 16 & 255, n >>> 24 & 255], "le32");
  for (const f of files) {
    const name = enc.encode(f.name), crc = crc32(f.bytes), n = f.bytes.length;
    const head = new Uint8Array([80, 75, 3, 4, ...le16(20), ...le16(2048), ...le16(0), ...le16(0), ...le16(33), ...le32(crc), ...le32(n), ...le32(n), ...le16(name.length), ...le16(0)]);
    parts.push(head, name, f.bytes);
    central.push(new Uint8Array([80, 75, 1, 2, ...le16(20), ...le16(20), ...le16(2048), ...le16(0), ...le16(0), ...le16(33), ...le32(crc), ...le32(n), ...le32(n), ...le16(name.length), ...le16(0), ...le16(0), ...le16(0), ...le16(0), ...le32(0), ...le32(off)]), name);
    off += head.length + name.length + n;
  }
  const cdSize = central.reduce((a, b) => a + b.length, 0);
  const end = new Uint8Array([80, 75, 5, 6, 0, 0, 0, 0, ...le16(files.length), ...le16(files.length), ...le32(cdSize), ...le32(off), 0, 0]);
  const all = [...parts, ...central, end], out = new Uint8Array(all.reduce((a, b) => a + b.length, 0));
  let o = 0;
  for (const b of all) {
    out.set(b, o);
    o += b.length;
  }
  return out;
}
__name(makeZip, "makeZip");
var HE_STOP = new Set("\u05E9\u05DC \u05D0\u05EA \u05E2\u05DC \u05E2\u05DD \u05D6\u05D4 \u05D6\u05D5 \u05DC\u05D0 \u05DB\u05DF \u05D9\u05E9 \u05D0\u05D9\u05DF \u05DE\u05D4 \u05DE\u05D9 \u05D0\u05D9\u05DA \u05DC\u05DE\u05D4 \u05D0\u05D9\u05E4\u05D4 \u05DE\u05EA\u05D9 \u05D2\u05DD \u05E8\u05E7 \u05D0\u05DD \u05D0\u05D5 \u05DB\u05D9 \u05D0\u05D1\u05DC \u05D0\u05D6 \u05D4\u05D5\u05D0 \u05D4\u05D9\u05D0 \u05D4\u05DD \u05D4\u05DF \u05D0\u05E0\u05D9 \u05D0\u05EA\u05D4 \u05D0\u05EA \u05D0\u05E0\u05D7\u05E0\u05D5 \u05D0\u05EA\u05DD \u05DC\u05D9 \u05DC\u05DA \u05DC\u05D5 \u05DC\u05D4 \u05DC\u05E0\u05D5 \u05DC\u05D4\u05DD \u05E2\u05D5\u05D3 \u05DB\u05DC \u05DB\u05DE\u05D4 \u05D0\u05D9\u05D6\u05D4 \u05DB\u05DB\u05D4 \u05E4\u05D4 \u05E9\u05DD \u05D4\u05D9\u05D5\u05DD \u05DE\u05D7\u05E8 \u05D0\u05EA\u05DE\u05D5\u05DC \u05D1\u05D1\u05E7\u05E9\u05D4 \u05EA\u05D5\u05D3\u05D4 \u05E9\u05DC\u05D5\u05DD \u05D4\u05D9 \u05D4\u05D9\u05D9 \u05D0\u05D7\u05D9 \u05D5\u05D5\u05D0\u05DC\u05D4 \u05EA\u05DB\u05DC\u05E1 \u05D9\u05DB\u05D5\u05DC \u05D9\u05DB\u05D5\u05DC\u05D4 \u05E8\u05D5\u05E6\u05D4 \u05E6\u05E8\u05D9\u05DA \u05D0\u05E4\u05E9\u05E8 \u05EA\u05D2\u05D9\u05D3 \u05EA\u05D2\u05D9\u05D3\u05D9 \u05D5\u05D0\u05DD \u05E2\u05D5\u05D3 \u05D5\u05D0\u05D6 \u05D0\u05D5\u05DC\u05D9 \u05DB\u05D1\u05E8 \u05E2\u05DB\u05E9\u05D9\u05D5".split(" "));
async function tzPhones(env, D, phones) {
  if (env.TEST_MODE === "1") {
    const admins = [...await D.listPhones(env, "admins").catch(() => []), D.OWNER];
    phones = phones.filter((p) => admins.includes(p));
    if (!phones.length) return { responseStatus: "OK", test: true };
  }
  return D.ym(env, "RunTzintuk", { phones: phones.join(":") });
}
__name(tzPhones, "tzPhones");
var speakerFolder = /* @__PURE__ */ __name((D, f) => {
  const p = "/" + f;
  for (const [pre, label] of D.WHERE) if (p === pre || p.startsWith(pre + "/")) return label;
  return f ? "\u05E9\u05DC\u05D5\u05D7\u05D4 " + f : "\u05D4\u05EA\u05E4\u05E8\u05D9\u05D8 \u05D4\u05E8\u05D0\u05E9\u05D9";
}, "speakerFolder");
var DASH_AI_SYSTEM = `\u05D0\u05EA\u05D4 \u05E2\u05D5\u05D6\u05E8 \u05D4\u05E0\u05D9\u05D4\u05D5\u05DC \u05E9\u05DC \u05E7\u05D5 \u05D8\u05DC\u05E4\u05D5\u05E0\u05D9 (\u05D9\u05DE\u05D5\u05EA \u05D4\u05DE\u05E9\u05D9\u05D7 079-494-7582) \u05E9\u05DC \u05E7\u05D1\u05D5\u05E6\u05EA \u05D1\u05D7\u05D5\u05E8\u05D9 \u05D9\u05E9\u05D9\u05D1\u05D4. \u05D0\u05EA\u05D4 \u05E2\u05D5\u05E0\u05D4 \u05DC\u05DE\u05E0\u05D4\u05DC \u05D4\u05E7\u05D5 \u05D1\u05EA\u05D5\u05DA \u05D3\u05E3 \u05D4\u05E0\u05D9\u05D4\u05D5\u05DC \u05D1\u05D3\u05E4\u05D3\u05E4\u05DF, \u05D1\u05E2\u05D1\u05E8\u05D9\u05EA, \u05D1\u05E7\u05E6\u05E8\u05D4 \u05D5\u05DC\u05E2\u05E0\u05D9\u05D9\u05DF.
\u05D0\u05EA\u05D4 \u05DE\u05E7\u05D1\u05DC \u05D0\u05EA \u05DE\u05E6\u05D1 \u05D4\u05E7\u05D5 \u05D4\u05E2\u05D3\u05DB\u05E0\u05D9 (JSON) \u05D5\u05D0\u05EA \u05D1\u05E7\u05E9\u05EA \u05D4\u05DE\u05E0\u05D4\u05DC. \u05D0\u05DD \u05D4\u05D5\u05D0 \u05E9\u05D5\u05D0\u05DC \u05E9\u05D0\u05DC\u05D4 \u2013 \u05E2\u05E0\u05D4 \u05DE\u05EA\u05D5\u05DA \u05D4\u05E0\u05EA\u05D5\u05E0\u05D9\u05DD \u05D1\u05DC\u05D1\u05D3, \u05D5\u05D0\u05DC \u05EA\u05DE\u05E6\u05D9\u05D0. \u05D0\u05DD \u05D4\u05D5\u05D0 \u05DE\u05D1\u05E7\u05E9 \u05DC\u05D1\u05E6\u05E2 \u05DE\u05E9\u05D4\u05D5 \u2013 \u05D4\u05E6\u05E2 \u05E4\u05E2\u05D5\u05DC\u05D5\u05EA \u05DE\u05EA\u05D5\u05DA \u05D4\u05E8\u05E9\u05D9\u05DE\u05D4 \u05D4\u05E1\u05D2\u05D5\u05E8\u05D4 \u05DC\u05DE\u05D8\u05D4. \u05D0\u05EA\u05D4 \u05DC\u05D0 \u05DE\u05D1\u05E6\u05E2 \u05D1\u05E2\u05E6\u05DE\u05DA: \u05D4\u05DE\u05E0\u05D4\u05DC \u05D9\u05D0\u05E9\u05E8 \u05DB\u05DC \u05E4\u05E2\u05D5\u05DC\u05D4.
\u05D6\u05D4\u05D4 \u05D7\u05D1\u05E8\u05D9\u05DD \u05DC\u05E4\u05D9 \u05E9\u05DD \u05DE\u05EA\u05D5\u05DA members (\u05D4\u05EA\u05D0\u05DE\u05D4 \u05D7\u05DC\u05E7\u05D9\u05EA \u05DE\u05D5\u05EA\u05E8\u05EA, \u05DC\u05DE\u05E9\u05DC \u05E9\u05DD \u05E4\u05E8\u05D8\u05D9). \u05D0\u05DD \u05D9\u05E9 \u05DB\u05DE\u05D4 \u05D4\u05EA\u05D0\u05DE\u05D5\u05EA \u05D0\u05D5 \u05E9\u05DC\u05D0 \u05D1\u05E8\u05D5\u05E8 \u05DC\u05DE\u05D9 \u05D4\u05DB\u05D5\u05D5\u05E0\u05D4 \u2013 \u05D0\u05DC \u05EA\u05E6\u05D9\u05E2 \u05E4\u05E2\u05D5\u05DC\u05D4, \u05D5\u05E9\u05D0\u05DC.
\u05D6\u05DE\u05E0\u05D9\u05DD: \u05D1\u05E4\u05D5\u05E8\u05DE\u05D8 "YYYY-MM-DD HH:MM" \u05DC\u05E4\u05D9 \u05E9\u05E2\u05D5\u05DF \u05D9\u05E9\u05E8\u05D0\u05DC. "\u05E2\u05DB\u05E9\u05D9\u05D5" \u05DE\u05D5\u05E4\u05D9\u05E2 \u05D1-now. "\u05DE\u05D7\u05E8 \u05D1\u05E9\u05DE\u05D5\u05E0\u05D4 \u05D1\u05E2\u05E8\u05D1" = \u05D4\u05EA\u05D0\u05E8\u05D9\u05DA \u05E9\u05DC \u05DE\u05D7\u05E8 20:00.
\u05E4\u05E2\u05D5\u05DC\u05D5\u05EA \u05DE\u05D5\u05EA\u05E8\u05D5\u05EA (\u05E9\u05D3\u05D4 kind):
- act: \u05E4\u05E2\u05D5\u05DC\u05EA \u05E0\u05D9\u05D4\u05D5\u05DC. \u05E9\u05D3\u05D4 a \u05E2\u05DD type \u05D0\u05D7\u05D3 \u05DE: delete {id}, move {id, to:"important"|"regular"}, schedule {at, text, important:boolean}, event {title, desc}, mute {phone, hours}, unmute {phone}, entry {text}, entry_delete {}, approve_join {phone, name}, rule_add {text}, rule_remove {n}, rename {phone, name}, broadcast {text}, undo {}
- tzintuk: {list:"members"|"admins"|"general"} \u2013 \u05E6\u05D9\u05E0\u05EA\u05D5\u05E7 \u05DC\u05E8\u05E9\u05D9\u05DE\u05D4
- tz_phones: {phones:[...]} \u2013 \u05E6\u05D9\u05E0\u05EA\u05D5\u05E7 \u05DC\u05DE\u05E1\u05E4\u05E8\u05D9\u05DD \u05DE\u05E1\u05D5\u05D9\u05DE\u05D9\u05DD
- pm: {text, phones:[...]} \u05D0\u05D5 {text, list:"members"|"admins"} \u2013 \u05D4\u05D5\u05D3\u05E2\u05D4 \u05D0\u05D9\u05E9\u05D9\u05EA \u05E7\u05D5\u05DC\u05D9\u05EA \u05DC\u05EA\u05D9\u05D1\u05D4 \u05D4\u05D0\u05D9\u05E9\u05D9\u05EA
- schedule2: {type:"post"|"tz"|"entry"|"pm"|"remind", at, text?, important?, list?, phones?, phone?, every?:"day"|"week", until?}
- block: {phone, on:boolean}
- lists: {list:"retort"|"strict", phone, on:boolean}
- event: {op:"edit", title, details} | {op:"rsvp_add", phone, name} | {op:"rsvp_remove", phone} | {op:"tz_missing"}
- unsched: {id}
- navigate: {tab} \u2013 \u05DE\u05E2\u05D1\u05E8 \u05DC\u05DC\u05E9\u05D5\u05E0\u05D9\u05EA (home, pending, msgs, trash, members, studio, sched, event, bot, reports, stats, live, system, log)
- open_member: {phone} \u2013 \u05E4\u05EA\u05D9\u05D7\u05EA \u05DB\u05E8\u05D8\u05D9\u05E1 \u05D7\u05D1\u05E8
\u05DC\u05DB\u05DC \u05E4\u05E2\u05D5\u05DC\u05D4 \u05D4\u05D5\u05E1\u05E3 desc: \u05DE\u05E9\u05E4\u05D8 \u05E7\u05E6\u05E8 \u05D1\u05E2\u05D1\u05E8\u05D9\u05EA \u05E9\u05DE\u05EA\u05D0\u05E8 \u05D1\u05D3\u05D9\u05D5\u05E7 \u05DE\u05D4 \u05D9\u05E7\u05E8\u05D4.
\u05D4\u05D7\u05D6\u05E8 JSON \u05D1\u05DC\u05D1\u05D3: {"answer":"\u05EA\u05E9\u05D5\u05D1\u05D4 \u05E7\u05E6\u05E8\u05D4 \u05DC\u05DE\u05E0\u05D4\u05DC","actions":[{"kind":"...", ..., "desc":"..."}]}`;
var TABS_OK = /* @__PURE__ */ new Set(["home", "pending", "msgs", "trash", "members", "studio", "sched", "event", "bot", "reports", "stats", "live", "system", "log"]);
var ATIME = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/;
function aiCheck(x, D, nm) {
  if (!x || typeof x !== "object") return null;
  const ph = /* @__PURE__ */ __name((v) => {
    const p = String(v || "").replace(/\D/g, "");
    return isPhone(p) ? p : "";
  }, "ph"), txt = /* @__PURE__ */ __name((v, n = 1500) => String(v || "").trim().slice(0, n), "txt");
  const desc = txt(x.desc, 300), phones = /* @__PURE__ */ __name((a) => [...new Set((Array.isArray(a) ? a : []).map(ph).filter(Boolean))], "phones");
  switch (x.kind) {
    case "act": {
      const a = x.a || {}, t = a.type;
      if (!D.ADMIN_ACTS.has(t)) return null;
      const o = { type: t };
      if (t === "delete" || t === "move") {
        o.id = String(a.id || "").replace(/\D/g, "");
        if (!o.id) return null;
        if (t === "move") {
          o.to = a.to === "important" ? "important" : "regular";
        }
      }
      if (t === "schedule") {
        if (!ATIME.test(a.at || "") || !txt(a.text)) return null;
        o.at = a.at;
        o.text = txt(a.text);
        o.important = !!a.important;
      }
      if (t === "event") {
        if (!txt(a.title, 80)) return null;
        o.title = txt(a.title, 80);
        o.desc = txt(a.desc, 200);
      }
      if (["mute", "unmute", "rename", "approve_join"].includes(t)) {
        o.phone = ph(a.phone);
        if (!o.phone) return null;
      }
      if (t === "mute") o.hours = Math.max(1, Math.min(720, +a.hours || 24));
      if (t === "rename" || t === "approve_join") {
        o.name = txt(a.name, 40);
        if (!o.name) return null;
      }
      if (["entry", "rule_add", "broadcast"].includes(t)) {
        o.text = txt(a.text, t === "rule_add" ? 300 : 800);
        if (!o.text) return null;
      }
      if (t === "rule_remove") {
        o.n = +a.n;
        if (!(o.n >= 1)) return null;
      }
      return { kind: "act", a: o, desc: desc || D.describeAct(o) };
    }
    case "tzintuk":
      return ["members", "admins", "general"].includes(x.list) ? { kind: "tzintuk", list: x.list, desc } : null;
    case "tz_phones": {
      const p = phones(x.phones);
      return p.length ? { kind: "tz_phones", phones: p, desc } : null;
    }
    case "pm": {
      const text = txt(x.text, 800);
      if (!text) return null;
      if (["members", "admins"].includes(x.list)) return { kind: "pm", text, list: x.list, desc };
      const p = phones(x.phones);
      return p.length ? { kind: "pm", text, phones: p, desc } : null;
    }
    case "schedule2": {
      if (!ATIME.test(x.at || "") || !["post", "tz", "entry", "pm", "remind"].includes(x.type)) return null;
      const o = { kind: "schedule2", type: x.type, at: x.at, desc };
      if (x.type !== "tz") {
        o.text = txt(x.text);
        if (!o.text) return null;
      }
      if (x.type === "post") o.important = !!x.important;
      if (x.type === "tz") o.list = ["members", "admins", "general"].includes(x.list) ? x.list : "members";
      if (x.type === "pm") {
        o.phones = phones(x.phones);
        if (!o.phones.length) return null;
      }
      if (x.type === "remind") {
        o.phone = ph(x.phone);
        if (!o.phone) return null;
      }
      if (["day", "week"].includes(x.every)) {
        o.every = x.every;
        if (ATIME.test(x.until || "")) o.until = x.until;
      }
      return o;
    }
    case "block": {
      const p = ph(x.phone);
      return p ? { kind: "block", phone: p, on: !!x.on, desc } : null;
    }
    case "lists": {
      const p = ph(x.phone);
      return p && ["retort", "strict"].includes(x.list) ? { kind: "lists", list: x.list, phone: p, on: !!x.on, desc } : null;
    }
    case "event": {
      if (x.op === "edit") return txt(x.title, 80) ? { kind: "event", op: "edit", title: txt(x.title, 80), details: txt(x.details, 200), desc } : null;
      if (x.op === "rsvp_add" || x.op === "rsvp_remove") {
        const p = ph(x.phone);
        return p ? { kind: "event", op: x.op, phone: p, name: txt(x.name || nm[p] || "", 40), desc } : null;
      }
      if (x.op === "tz_missing") return { kind: "event", op: "tz_missing", desc };
      return null;
    }
    case "unsched":
      return x.id ? { kind: "unsched", id: String(x.id).slice(0, 40), desc } : null;
    case "navigate":
      return TABS_OK.has(x.tab) ? { kind: "navigate", tab: x.tab, desc } : null;
    case "open_member": {
      const p = ph(x.phone);
      return p ? { kind: "open_member", phone: p, desc } : null;
    }
  }
  return null;
}
__name(aiCheck, "aiCheck");
var POST_ONLY = /* @__PURE__ */ new Set(["share", "transcript", "pm_delete", "tts", "send_pm", "tz_phones", "members_import", "lists", "codes", "batch", "upload", "restore", "purge", "zip", "schedule2", "deferred", "event", "restore_backup", "ai"]);
async function api2(req, env, ctx, u, name, D, auth, body, nm, who, admin, VIA, now) {
  const q = /* @__PURE__ */ __name((k) => String(u.searchParams.get(k) || ""), "q");
  if (POST_ONLY.has(name) && req.method !== "POST") return json({ error: "\u05E9\u05D9\u05D8\u05D4 \u05DC\u05D0 \u05DE\u05D5\u05E8\u05E9\u05D9\u05EA" }, 405);
  const ok = /* @__PURE__ */ __name((extra = {}) => json({ ok: true, ...extra }), "ok");
  switch (name) {
    case "ai": {
      const ask = String(body.q || "").trim().slice(0, 1500);
      if (!ask) return json({ error: "\u05DE\u05D4 \u05DC\u05E2\u05E9\u05D5\u05EA?" }, 400);
      const hist = (Array.isArray(body.history) ? body.history : []).slice(-8).map((h) => ({ role: h.role === "model" ? "model" : "user", parts: [{ text: String(h.text || "").slice(0, 1500) }] }));
      const [jobs, rules, online, holy, ar, logR, blocked] = await Promise.all([
        D.kvGet(env, "scheduled", []),
        D.kvGet(env, "rules", []),
        D.onlineNow(env).then((x) => x.calls).catch(() => []),
        D.isHoly(env).catch(() => false),
        D.kvGet(env, "archive", {}),
        D.ym(env, "GetTextFile", { what: "ivr2:/AILog.txt" }).catch(() => ({})),
        D.kvGet(env, "blocked", [])
      ]);
      const recent = Object.entries(ar).sort((a, b) => parseInt(b[0]) - parseInt(a[0])).slice(0, 25).map(([k, a]) => ({ id: k.replace(".wav", ""), d: a.d, n: a.n || nm[a.p] || "", t: String(a.t || "").slice(0, 220) }));
      const ctxData = {
        now: D.nowIL(),
        holy,
        members: Object.entries(nm).map(([p, n]) => ({ n, p })),
        online: online.map((c) => ({ n: nm[c.p] || "", p: c.p, w: c.w })),
        scheduled: jobs.filter((j) => !j.done).map((j) => ({ id: j.id, at: j.at, type: j.type, text: String(j.text || "").slice(0, 120), phone: j.phone || "", every: j.every || "" })),
        rules: rules.map((r2, i) => ({ n: i + 1, r: r2 })),
        blocked: blocked.map((p) => nm[p] || p),
        recentMessages: recent,
        recentLog: (logR && logR.contents || "").split("\n").filter(Boolean).slice(0, 25)
      };
      const line = await D.loadLine(env).catch(() => null);
      const [lineCtx, adminCtx] = line ? [D.retrieveContext(line, ask, nm, 14e3), await D.adminText(env, line).catch(() => "")] : ["", ""];
      let r;
      try {
        r = await D.aiText(env, { system: DASH_AI_SYSTEM + (lineCtx ? "\n\n\u05D4\u05D4\u05D5\u05D3\u05E2\u05D5\u05EA \u05D1\u05E7\u05D5 (\u05D0\u05D5\u05EA\u05D5 \u05D9\u05D3\u05E2 \u05E9\u05D9\u05E9 \u05DC\u05E2\u05D5\u05D6\u05E8 \u05D4\u05E7\u05D5\u05DC\u05D9):\n" + lineCtx : "") + (adminCtx ? "\n\n\u05DE\u05D9\u05D3\u05E2 \u05DC\u05E0\u05D9\u05D4\u05D5\u05DC:\n" + adminCtx : ""), contents: [...hist, { role: "user", parts: [{ text: "\u05DE\u05E6\u05D1 \u05D4\u05E7\u05D5:\n" + JSON.stringify(ctxData).slice(0, 2e4) + "\n\n\u05D1\u05E7\u05E9\u05EA \u05D4\u05DE\u05E0\u05D4\u05DC: " + ask }] }], deadline: 26e3, timeout: 2e4 });
      } catch (e) {
        return json({ error: "\u05D4\u05E2\u05D5\u05D6\u05E8 \u05DC\u05D0 \u05D6\u05DE\u05D9\u05DF \u05DB\u05E8\u05D2\u05E2: " + String(e.message || e).slice(0, 200) }, 503);
      }
      const raw = Array.isArray(r && r.actions) ? r.actions : [], actions = raw.map((x) => aiCheck(x, D, nm)).filter(Boolean).slice(0, 12);
      const answer = String(r && (r.answer || r.text) || "").trim().slice(0, 3e3) || (actions.length ? "\u05D4\u05E0\u05D4 \u05DE\u05D4 \u05E9\u05D0\u05E0\u05D9 \u05DE\u05E6\u05D9\u05E2 \u05DC\u05D1\u05E6\u05E2:" : "\u05DC\u05D0 \u05D4\u05D1\u05E0\u05EA\u05D9, \u05D0\u05E4\u05E9\u05E8 \u05DC\u05E0\u05E1\u05D7 \u05D0\u05D7\u05E8\u05EA?");
      const hlog = await D.kvGet(env, "dashai", []);
      hlog.push({ d: D.nowIL(), q: ask.slice(0, 300), a: answer.slice(0, 300), n: actions.length });
      await env.KV.put("dashai", JSON.stringify(hlog.slice(-100)));
      return json({ answer, actions, dropped: raw.length - actions.length });
    }
    case "whoami":
      return json({ ro: !!auth.ro, exp: auth.exp || 0, owner: D.OWNER, name: who(D.OWNER), now: D.nowIL() });
    case "share": {
      if (auth.ro || req.method !== "POST") return json({ error: "\u05E8\u05E7 \u05DE\u05E0\u05D4\u05DC \u05DE\u05D7\u05D5\u05D1\u05E8 \u05D9\u05DB\u05D5\u05DC \u05DC\u05D9\u05E6\u05D5\u05E8 \u05E7\u05D9\u05E9\u05D5\u05E8" }, 403);
      const days = Math.max(1, Math.min(90, +body.days || 7)), token = await newToken(env, true, days);
      await D.log(env, `\u05DE\u05E0\u05D4\u05DC ${who(admin)} \u05D9\u05E6\u05E8 \u05DE${VIA} \u05E7\u05D9\u05E9\u05D5\u05E8 \u05DC\u05E6\u05E4\u05D9\u05D9\u05D4 \u05D1\u05DC\u05D1\u05D3 \u05DC-${days} \u05D9\u05DE\u05D9\u05DD`);
      return json({ token, days });
    }
    case "notes": {
      if (req.method === "POST") {
        const kind = body.kind === "member" ? "member" : "msg", key = String(body.key || "").replace(/[^\w-]/g, "").slice(0, 40), text = String(body.text || "").trim().slice(0, 1e3);
        if (!key) return json({ error: "\u05DE\u05E4\u05EA\u05D7 \u05DC\u05D0 \u05EA\u05E7\u05D9\u05DF" }, 400);
        const notes = await D.kvGet(env, "dashnotes", { msg: {}, member: {} });
        notes[kind] = notes[kind] || {};
        if (text) notes[kind][key] = { t: text, d: D.nowIL() };
        else delete notes[kind][key];
        await env.KV.put("dashnotes", JSON.stringify(notes));
        return ok({ notes });
      }
      return json({ notes: await D.kvGet(env, "dashnotes", { msg: {}, member: {} }) });
    }
    case "transcript": {
      const id = String(body.id || "").replace(/\D/g, ""), text = String(body.text || "").trim().slice(0, 3e3);
      if (!id) return json({ error: "\u05DE\u05E1\u05E4\u05E8 \u05D4\u05D5\u05D3\u05E2\u05D4 \u05DC\u05D0 \u05EA\u05E7\u05D9\u05DF" }, 400);
      const ar = await D.kvGet(env, "archive", {}), key = id + ".wav", prev = ar[key] || null;
      ar[key] = { ...prev || { p: "", n: "", d: D.nowIL() }, t: text, s: "g" };
      await env.KV.put("archive", JSON.stringify(ar));
      await D.pushUndo(env, `\u05EA\u05D9\u05E7\u05D5\u05DF \u05D4\u05EA\u05DE\u05DC\u05D5\u05DC \u05E9\u05DC \u05D4\u05D5\u05D3\u05E2\u05D4 ${id}`, [{ archive: [key, prev || { ...ar[key], t: "", s: "a" }] }]);
      await D.log(env, `\u05DE\u05E0\u05D4\u05DC ${who(admin)} \u05EA\u05D9\u05E7\u05DF \u05DE${VIA} \u05D0\u05EA \u05D4\u05EA\u05DE\u05DC\u05D5\u05DC \u05E9\u05DC \u05D4\u05D5\u05D3\u05E2\u05D4 ${id}`);
      return ok();
    }
    // ---------- חברים ----------
    case "member": {
      const p = q("p").replace(/\D/g, "");
      if (!isPhone(p)) return json({ error: "\u05DE\u05E1\u05E4\u05E8 \u05DC\u05D0 \u05EA\u05E7\u05D9\u05DF" }, 400);
      const [archive, conv, profiles, mem, facts, people, watch, blocked, retort, strict, ads, lg, pmDir, pmOld, approved, rsvp2, notes, general, admins, members] = await Promise.all([
        D.kvGet(env, "archive", {}),
        D.kvGet(env, "convlog", []),
        D.kvGet(env, "profiles", {}),
        D.kvGet(env, "mem:" + p, null),
        D.kvGet(env, "facts", {}),
        D.peopleList(env),
        D.kvGet(env, "watch", {}),
        D.kvGet(env, "blocked", []),
        D.kvGet(env, "retort", []),
        D.kvGet(env, "strict", []),
        D.kvGet(env, "ads", {}),
        callLog(env, D, 2).catch(() => ({ last: {}, per: {}, ents: [] })),
        D.ym(env, "GetIVR2Dir", { path: "ivr2:" + D.PM(p) }).catch(() => ({})),
        D.ym(env, "GetIVR2Dir", { path: "ivr2:" + D.PM(p) + "/Old" }).catch(() => ({})),
        D.kvGet(env, "approved", {}),
        D.rsvpLoad(env).catch(() => ({})),
        D.kvGet(env, "dashnotes", { msg: {}, member: {} }),
        D.listPhones(env, "general").catch(() => []),
        D.listPhones(env, "admins").catch(() => []),
        membersList(env, D)
      ]);
      const person = people.find((x) => x.p === p) || null, w = watch[p], mstat = members.find((e) => e.phone === p);
      const msgs = Object.entries(archive).filter(([, a]) => a && a.p === p).map(([k, a]) => ({ id: k.replace(".wav", ""), d: a.d, t: a.t || "", s: a.s })).sort((a, b) => parseInt(b.id) - parseInt(a.id));
      const pmFiles = /* @__PURE__ */ __name((d) => (d.files || []).filter((f) => /^\d+\.(wav|tts)$/.test(f.name)).map((f) => ({ name: f.name, date: f.date || f.mtime || "", dur: +f.duration || 0 })), "pmFiles");
      const calls = lg.ents.filter((e) => e.p === p).sort((a, b) => a.t < b.t ? 1 : -1).slice(0, 60).map((e) => ({ t: e.t, x: e.x, f: e.f, l: speakerFolder(D, e.f) }));
      return json({
        p,
        n: nm[p] || "",
        person,
        admin: admins.includes(p) || p === D.OWNER,
        general: general.includes(p),
        tz: mstat ? mstat.active ? "on" : "off" : "none",
        muted: w && w.hold && (!w.until || w.until > now) ? w.until ? D.ilAt(w.until).slice(0, 16) : "\u05DC\u05DC\u05D0 \u05D4\u05D2\u05D1\u05DC\u05D4" : "",
        blocked: blocked.includes(p),
        retort: retort.includes(p),
        strict: strict.includes(p),
        rsvp: rsvp2[p] || null,
        approved: approved[p] || null,
        ads: ads[p] || [],
        note: (notes.member || {})[p] || null,
        msgs: msgs.slice(0, 100),
        msgTotal: msgs.length,
        conv: conv.filter((c) => c.p === p).slice(-60).reverse(),
        profile: profiles[p] || null,
        memory: mem,
        talk: ((facts || {}).talk || {})[p] || "",
        calls,
        callsMonth: new Set(lg.ents.filter((e) => e.p === p && e.t.startsWith(D.nowIL().slice(0, 7))).map((e) => e.id)).size,
        last: lg.last[p] || "",
        pm: pmFiles(pmDir),
        pmOld: pmFiles(pmOld).slice(-20),
        now: D.nowIL()
      });
    }
    case "pm_delete": {
      const p = String(body.phone || "").replace(/\D/g, ""), f = String(body.name || "");
      if (!isPhone(p) || !/^\d+\.(wav|tts)$/.test(f)) return json({ error: "\u05D1\u05E7\u05E9\u05D4 \u05DC\u05D0 \u05EA\u05E7\u05D9\u05E0\u05D4" }, 400);
      const path = D.PM(p) + (body.old ? "/Old" : "") + "/" + f;
      const r = await D.ym(env, "FileAction", { action: "delete", what: "ivr2:" + path });
      await D.log(env, `\u05DE\u05E0\u05D4\u05DC ${who(admin)} \u05DE\u05D7\u05E7 \u05DE${VIA} \u05D4\u05D5\u05D3\u05E2\u05D4 \u05D0\u05D9\u05E9\u05D9\u05EA (${f}) \u05DE\u05D4\u05EA\u05D9\u05D1\u05D4 \u05E9\u05DC ${who(p)}`);
      return ok({ r });
    }
    case "tts": {
      const text = String(body.text || "").trim().slice(0, 1500);
      if (!text) return json({ error: "\u05D0\u05D9\u05DF \u05D8\u05E7\u05E1\u05D8" }, 400);
      const pcm = await D.ttsLong(env, text);
      if (!pcm) return json({ error: "\u05D4\u05E7\u05D5\u05DC \u05E9\u05DC \u05D4\u05E2\u05D5\u05D6\u05E8 \u05DC\u05D0 \u05D6\u05DE\u05D9\u05DF \u05DB\u05E8\u05D2\u05E2, \u05E0\u05E1\u05D5 \u05E9\u05D5\u05D1 \u05D1\u05E2\u05D5\u05D3 \u05D3\u05E7\u05D4" }, 503);
      const id = "d" + Date.now().toString(36), m8 = D.to8k(D.pcmTrim(pcm));
      await env.KV.put("bc:" + id, m8.buffer, { expirationTtl: 3 * 86400 });
      await env.KV.put("bctext:" + id, text, { expirationTtl: 3 * 86400 });
      return json({ id, seconds: Math.round(m8.length / 8e3) });
    }
    case "preview": {
      const id = q("id").replace(/[^\w]/g, ""), buf = id ? await env.KV.get("bc:" + id, "arrayBuffer") : null;
      if (!buf) return json({ error: "\u05D4\u05E7\u05D5\u05DC \u05D4\u05D6\u05D4 \u05DB\u05D1\u05E8 \u05DC\u05D0 \u05E7\u05D9\u05D9\u05DD" }, 404);
      return new Response(D.pcmToWav(new Uint8Array(buf), 8e3), { headers: { "Content-Type": "audio/wav", "Cache-Control": "private, max-age=600" } });
    }
    case "send_pm": {
      const id = String(body.id || "").replace(/[^\w]/g, "");
      if (!id || !await env.KV.get("bc:" + id, "arrayBuffer")) return json({ error: "\u05E7\u05D5\u05D3\u05DD \u05E6\u05E8\u05D9\u05DA \u05DC\u05D9\u05E6\u05D5\u05E8 \u05D0\u05EA \u05D4\u05E7\u05D5\u05DC (\u05EA\u05E6\u05D5\u05D2\u05D4 \u05DE\u05E7\u05D3\u05D9\u05DE\u05D4)" }, 400);
      const text = await env.KV.get("bctext:" + id) || "";
      let phones = [];
      if (body.list === "members") phones = (await D.peopleList(env)).map((x) => x.p);
      else if (body.list === "admins") phones = [.../* @__PURE__ */ new Set([...await D.listPhones(env, "admins").catch(() => []), D.OWNER])];
      else phones = (Array.isArray(body.phones) ? body.phones : []).map((x) => String(x).replace(/\D/g, "")).filter(isPhone);
      phones = [...new Set(phones)];
      if (!phones.length) return json({ error: "\u05DC\u05D0 \u05E0\u05D1\u05D7\u05E8\u05D5 \u05E0\u05DE\u05E2\u05E0\u05D9\u05DD" }, 400);
      await D.bgAdd(env, [...phones.map((p) => ({ k: "bc", id, p })), { k: "log", line: `\u05D4\u05D4\u05D5\u05D3\u05E2\u05D4 \u05D4\u05D0\u05D9\u05E9\u05D9\u05EA \u05D4\u05D5\u05E9\u05D0\u05E8\u05D4 \u05D0\u05E6\u05DC ${phones.length} \u05D7\u05D1\u05E8\u05D9\u05DD (\u05DE\u05E0\u05D4\u05DC ${who(admin)} \u05D3\u05E8\u05DA ${VIA}): ${text.slice(0, 200)}` }]);
      await D.pushUndo(env, `\u05D4\u05D5\u05D3\u05E2\u05D4 \u05D0\u05D9\u05E9\u05D9\u05EA \u05DC-${phones.length} \u05D7\u05D1\u05E8\u05D9\u05DD`, [{ bcdel: id }]);
      return ok({ count: phones.length });
    }
    case "tz_phones": {
      const phones = [...new Set((Array.isArray(body.phones) ? body.phones : []).map((x) => String(x).replace(/\D/g, "")).filter(isPhone))].slice(0, 200);
      if (!phones.length) return json({ error: "\u05DC\u05D0 \u05E0\u05D1\u05D7\u05E8\u05D5 \u05DE\u05E1\u05E4\u05E8\u05D9\u05DD" }, 400);
      const r = await tzPhones(env, D, phones);
      await D.log(env, `\u05DE\u05E0\u05D4\u05DC ${who(admin)} \u05E9\u05DC\u05D7 \u05DE${VIA} \u05E6\u05D9\u05E0\u05EA\u05D5\u05E7 \u05DC-${phones.length} \u05E0\u05D1\u05D7\u05E8\u05D9\u05DD${r && r.deferred ? " (\u05E0\u05D3\u05D7\u05D4 \u05DC\u05DE\u05D5\u05E6\u05D0\u05D9 \u05E9\u05D1\u05EA/\u05D7\u05D2)" : ""}`);
      return ok({ deferred: !!(r && r.deferred), sent: !!r && r.responseStatus === "OK", count: phones.length });
    }
    case "members_csv": {
      const [people, mem, admins, rsvp2, lg] = await Promise.all([D.peopleList(env), membersList(env, D), D.listPhones(env, "admins").catch(() => []), D.rsvpLoad(env).catch(() => ({})), callLog(env, D, 1).catch(() => ({ last: {}, per: {} }))]);
      const mstat = Object.fromEntries(mem.map((e) => [e.phone, e.active])), codes = Object.fromEntries(people.map((p) => [p.p, p.c]));
      const phones = [.../* @__PURE__ */ new Set([...Object.keys(nm), ...mem.map((e) => e.phone), ...people.map((p) => p.p)])].sort((a, b) => (nm[a] || "\u05EA\u05EA\u05EA").localeCompare(nm[b] || "\u05EA\u05EA\u05EA", "he"));
      const rows = [["\u05E9\u05DD", "\u05D8\u05DC\u05E4\u05D5\u05DF", "\u05E7\u05D5\u05D3", "\u05E6\u05D9\u05E0\u05EA\u05D5\u05E7\u05D9\u05DD", "\u05DE\u05E0\u05D4\u05DC", "\u05E0\u05E8\u05E9\u05DD \u05DC\u05D0\u05D9\u05E8\u05D5\u05E2", "\u05E9\u05D9\u05D7\u05D5\u05EA \u05D4\u05D7\u05D5\u05D3\u05E9", "\u05DB\u05E0\u05D9\u05E1\u05D4 \u05D0\u05D7\u05E8\u05D5\u05E0\u05D4"]];
      for (const p of phones) rows.push([nm[p] || "", p, codes[p] || "", mstat[p] === true ? "\u05E4\u05E2\u05D9\u05DC" : mstat[p] === false ? "\u05D7\u05E1\u05DD" : "\u05DC\u05D0 \u05D1\u05E8\u05E9\u05D9\u05DE\u05D4", admins.includes(p) || p === D.OWNER ? "\u05DB\u05DF" : "", rsvp2[p] ? "\u05DB\u05DF" : "", lg.per[p] || 0, lg.last[p] || ""]);
      return csvResp(rows, `members-${D.nowIL().slice(0, 10)}.csv`);
    }
    case "members_import": {
      const rows = (Array.isArray(body.rows) ? body.rows : []).slice(0, 8).map((r) => ({ p: String(r.p || "").replace(/\D/g, ""), n: String(r.n || "").trim().slice(0, 40) })).filter((r) => isPhone(r.p) && r.n);
      if (!rows.length) return json({ error: "\u05DC\u05D0 \u05E0\u05DE\u05E6\u05D0\u05D5 \u05E9\u05D5\u05E8\u05D5\u05EA \u05EA\u05E7\u05D9\u05E0\u05D5\u05EA (\u05DE\u05E1\u05E4\u05E8 \u05D8\u05DC\u05E4\u05D5\u05DF \u05D5\u05E9\u05DD)" }, 400);
      const people = await D.peopleList(env), res = { added: [], renamed: [], same: [], errors: [] };
      for (const r of rows) {
        try {
          const ex = people.find((x) => x.p === r.p);
          if (!ex) {
            await D.doAdmin(env, { type: "approve_join", phone: r.p, name: r.n }, admin, VIA);
            res.added.push(r);
          } else if (ex.n !== r.n && body.rename) {
            await D.doAdmin(env, { type: "rename", phone: r.p, name: r.n }, admin, VIA);
            res.renamed.push(r);
          } else res.same.push(r);
        } catch (e) {
          res.errors.push({ ...r, e: e.message });
        }
      }
      await D.log(env, `\u05D9\u05D9\u05D1\u05D5\u05D0 \u05D7\u05D1\u05E8\u05D9\u05DD \u05DE${VIA}: ${res.added.length} \u05E0\u05D5\u05E1\u05E4\u05D5, ${res.renamed.length} \u05E9\u05D5\u05E0\u05D4 \u05E9\u05DE\u05DD, ${res.same.length} \u05DC\u05DC\u05D0 \u05E9\u05D9\u05E0\u05D5\u05D9 (\u05DE\u05E0\u05D4\u05DC ${who(admin)})`).catch(() => {
      });
      return ok(res);
    }
    case "lists": {
      const list = body.list === "retort" ? "retort" : body.list === "strict" ? "strict" : "";
      const p = String(body.phone || "").replace(/\D/g, "");
      if (!list || !isPhone(p)) return json({ error: "\u05D1\u05E7\u05E9\u05D4 \u05DC\u05D0 \u05EA\u05E7\u05D9\u05E0\u05D4" }, 400);
      const cur = await D.kvGet(env, list, []), next = body.on ? [.../* @__PURE__ */ new Set([...cur, p])] : cur.filter((x) => x !== p);
      await env.KV.put(list, JSON.stringify(next));
      await D.log(env, `\u05DE\u05E0\u05D4\u05DC ${who(admin)} ${body.on ? "\u05D4\u05D5\u05E1\u05D9\u05E3" : "\u05D4\u05E1\u05D9\u05E8"} \u05DE${VIA} \u05D0\u05EA ${who(p)} ${body.on ? "\u05DC" : "\u05DE"}\u05E8\u05E9\u05D9\u05DE\u05EA ${list === "retort" ? "\u05D4\u05EA\u05D2\u05D5\u05D1\u05D4 \u05D4\u05E2\u05D5\u05E7\u05E6\u05E0\u05D9\u05EA" : "\u05D4\u05E4\u05D9\u05E7\u05D5\u05D7 \u05D4\u05DE\u05D5\u05D2\u05D1\u05E8"}`);
      return ok({ list: next });
    }
    case "codes": {
      const p = String(body.phone || "").replace(/\D/g, ""), code = String(body.code || "").replace(/\D/g, "").padStart(2, "0").slice(-2);
      if (!isPhone(p) || !/^\d{2}$/.test(code)) return json({ error: "\u05E7\u05D5\u05D3 \u05E6\u05E8\u05D9\u05DA \u05DC\u05D4\u05D9\u05D5\u05EA \u05E9\u05EA\u05D9 \u05E1\u05E4\u05E8\u05D5\u05EA" }, 400);
      const people = await D.peopleList(env), me = people.find((x) => x.p === p);
      if (!me) return json({ error: "\u05D4\u05D7\u05D1\u05E8 \u05DC\u05D0 \u05D1\u05E8\u05E9\u05D9\u05DE\u05D4" }, 404);
      if (people.some((x) => x.p !== p && x.c === code)) return json({ error: "\u05D4\u05E7\u05D5\u05D3 \u05D4\u05D6\u05D4 \u05DB\u05D1\u05E8 \u05EA\u05E4\u05D5\u05E1" }, 409);
      const old = me.c;
      me.c = code;
      await D.saveNames(env, people);
      await D.bgAdd(env, D.peopleRegenSteps(people, [me]));
      await D.log(env, `\u05DE\u05E0\u05D4\u05DC ${who(admin)} \u05E9\u05D9\u05E0\u05D4 \u05DE${VIA} \u05D0\u05EA \u05D4\u05E7\u05D5\u05D3 \u05E9\u05DC ${who(p)} \u05DE-${old} \u05DC-${code}`);
      return ok({ code });
    }
    case "ads": {
      if (req.method === "POST") {
        const p = String(body.phone || "").replace(/\D/g, "");
        if (!isPhone(p)) return json({ error: "\u05DE\u05E1\u05E4\u05E8 \u05DC\u05D0 \u05EA\u05E7\u05D9\u05DF" }, 400);
        const list = (Array.isArray(body.list) ? body.list : []).map((t) => String(t).trim().slice(0, 300)).filter(Boolean).slice(0, 20);
        const ads2 = await D.kvGet(env, "ads", {});
        if (list.length) ads2[p] = list;
        else delete ads2[p];
        await env.KV.put("ads", JSON.stringify(ads2));
        await D.log(env, `\u05DE\u05E0\u05D4\u05DC ${who(admin)} \u05E2\u05D3\u05DB\u05DF \u05DE${VIA} \u05D0\u05EA \u05D4\u05E4\u05E8\u05E1\u05D5\u05DE\u05D5\u05EA \u05E9\u05DC ${who(p)} (${list.length})`);
        return ok({ ads: ads2 });
      }
      const ads = await D.kvGet(env, "ads", {});
      return json({ names: nm, ads: Object.entries(ads).map(([p, list]) => ({ p, n: who(p), list })), yossi: await env.KV.get("yossiad") !== "off" });
    }
    // ---------- הודעות ----------
    case "batch": {
      const ids = [...new Set((Array.isArray(body.ids) ? body.ids : []).map((x) => String(x).replace(/\D/g, "")).filter(Boolean))], op = String(body.op || "");
      if (!ids.length || !["delete", "important", "regular"].includes(op)) return json({ error: "\u05D1\u05E7\u05E9\u05D4 \u05DC\u05D0 \u05EA\u05E7\u05D9\u05E0\u05D4" }, 400);
      if (ids.length > 5) return json({ error: "\u05E2\u05D3 5 \u05D4\u05D5\u05D3\u05E2\u05D5\u05EA \u05D1\u05DB\u05DC \u05D1\u05E7\u05E9\u05D4" }, 400);
      const results = [];
      for (const id of ids) {
        try {
          results.push({ id, r: await D.doAdmin(env, op === "delete" ? { type: "delete", id } : { type: "move", id, to: op }, admin, VIA) });
        } catch (e) {
          results.push({ id, error: e.message });
        }
      }
      return ok({ results });
    }
    case "upload": {
      const kind = String(body.kind || ""), bytes = b64dec(body.data);
      if (bytes.length < 100 || bytes.length > 12e6) return json({ error: "\u05D4\u05E7\u05D5\u05D1\u05E5 \u05E8\u05D9\u05E7 \u05D0\u05D5 \u05D2\u05D3\u05D5\u05DC \u05DE\u05D3\u05D9 (\u05E2\u05D3 12MB)" }, 400);
      if (String.fromCharCode(...bytes.subarray(0, 4)) !== "RIFF") return json({ error: "\u05D4\u05E7\u05D5\u05D1\u05E5 \u05E6\u05E8\u05D9\u05DA \u05DC\u05D4\u05D9\u05D5\u05EA WAV" }, 400);
      const note = String(body.text || "").trim().slice(0, 3e3);
      if (kind === "regular" || kind === "important") {
        const num = String(await D.nextFileNum(env, D.ALL)).padStart(3, "0");
        await D.ymUpload(env, `${D.ALL}/${num}.wav`, bytes);
        const ops = [{ mv: [`${D.ALL}/${num}.wav`, `/DeletedByAdmin/up-${num}.wav`] }];
        const from = String(body.phone || "").replace(/\D/g, ""), ar = await D.kvGet(env, "archive", {});
        ar[num + ".wav"] = { p: isPhone(from) ? from : "", n: nm[from] || "", d: D.nowIL().replace(/^(\d{4})-(\d{2})-(\d{2}) /, "$3/$2/$1 "), t: note, s: note ? "g" : "a", up: true };
        await env.KV.put("archive", JSON.stringify(ar));
        await D.pushUndo(env, `\u05D4\u05E2\u05DC\u05D0\u05EA \u05D4\u05D5\u05D3\u05E2\u05D4 ${num} \u05DE\u05D4\u05D3\u05E4\u05D3\u05E4\u05DF`, ops);
        let msg = "";
        if (kind === "important") msg = await D.doAdmin(env, { type: "move", id: num, to: "important" }, admin, VIA);
        else ctx.waitUntil(D.notify(env, "regular").then(() => D.processFlags(env)).catch(() => {
        }));
        await D.log(env, `\u05DE\u05E0\u05D4\u05DC ${who(admin)} \u05D4\u05E2\u05DC\u05D4 \u05DE${VIA} \u05D4\u05E7\u05DC\u05D8\u05D4 \u05DB\u05D4\u05D5\u05D3\u05E2\u05D4 ${kind === "important" ? "\u05D7\u05E9\u05D5\u05D1\u05D4" : "\u05E8\u05D2\u05D9\u05DC\u05D4"} \u05DE\u05E1\u05E4\u05E8 ${num}`);
        return ok({ id: num, msg });
      }
      if (kind === "entry") {
        const bk = `/OldEntry/${Date.now().toString(36)}.wav`;
        const had = await D.ym(env, "FileAction", { action: "copy", what: "ivr2:/M0000-1.wav", target: "ivr2:" + bk }).then((r) => r.responseStatus === "OK").catch(() => false);
        await D.ymUpload(env, "/M0000-1.wav", bytes);
        await D.pushUndo(env, "\u05D4\u05D7\u05DC\u05E4\u05EA \u05D4\u05D4\u05D5\u05D3\u05E2\u05D4 \u05D1\u05DB\u05E0\u05D9\u05E1\u05D4 (\u05D4\u05E7\u05DC\u05D8\u05D4)", [had ? { copy: [bk, "/M0000-1.wav"] } : { del: "/M0000-1.wav" }]);
        await D.log(env, `\u05DE\u05E0\u05D4\u05DC ${who(admin)} \u05D4\u05D7\u05DC\u05D9\u05E3 \u05DE${VIA} \u05D0\u05EA \u05D4\u05D4\u05D5\u05D3\u05E2\u05D4 \u05D1\u05DB\u05E0\u05D9\u05E1\u05D4 \u05DC\u05E7\u05D5 \u05D1\u05D4\u05E7\u05DC\u05D8\u05D4`);
        return ok();
      }
      if (kind === "pm") {
        const p = String(body.phone || "").replace(/\D/g, "");
        if (!isPhone(p)) return json({ error: "\u05DE\u05E1\u05E4\u05E8 \u05DC\u05D0 \u05EA\u05E7\u05D9\u05DF" }, 400);
        await D.ensureDir(env, D.PM(p), false).catch(() => {
        });
        const fname = await D.nextName(env, D.PM(p), "wav");
        await D.ymUpload(env, `${D.PM(p)}/${fname}`, bytes);
        await D.log(env, `\u05DE\u05E0\u05D4\u05DC ${who(admin)} \u05D4\u05E9\u05D0\u05D9\u05E8 \u05DE${VIA} \u05D4\u05E7\u05DC\u05D8\u05D4 \u05D1\u05EA\u05D9\u05D1\u05D4 \u05D4\u05D0\u05D9\u05E9\u05D9\u05EA \u05E9\u05DC ${who(p)}`);
        return ok({ name: fname });
      }
      return json({ error: "\u05E1\u05D5\u05D2 \u05DC\u05D0 \u05DE\u05D5\u05DB\u05E8" }, 400);
    }
    case "trash": {
      const d = await D.ym(env, "GetIVR2Dir", { path: "ivr2:/DeletedByAdmin" }).catch(() => ({}));
      const files = (d.files || []).filter((f) => /\.wav$/.test(f.name)).map((f) => ({ name: f.name, date: f.date || f.mtime || "", dur: +f.duration || 0, size: +f.size || 0, imp: /^imp-|^upi-/.test(f.name) })).sort((a, b) => D.sortable(a.date) < D.sortable(b.date) ? 1 : -1);
      return json({ files });
    }
    case "restore": {
      const f = String(body.name || "");
      if (!/^[\w-]+\.wav$/.test(f)) return json({ error: "\u05E9\u05DD \u05E7\u05D5\u05D1\u05E5 \u05DC\u05D0 \u05EA\u05E7\u05D9\u05DF" }, 400);
      const to = body.to === "important" ? D.IMPORTANT : D.ALL, num = String(await D.nextFileNum(env, to)).padStart(3, "0");
      const r = await D.ym(env, "FileAction", { action: "move", what: "ivr2:/DeletedByAdmin/" + f, target: `ivr2:${to}/${num}.wav` });
      if (!r || r.responseStatus !== "OK") return json({ error: "\u05D9\u05DE\u05D5\u05EA \u05DC\u05D0 \u05D0\u05D9\u05E9\u05E8\u05D5 \u05D0\u05EA \u05D4\u05E9\u05D7\u05D6\u05D5\u05E8: " + (r && r.message || "") }, 502);
      await D.pushUndo(env, `\u05E9\u05D7\u05D6\u05D5\u05E8 ${f} \u05DE\u05E1\u05DC \u05D4\u05DE\u05D7\u05D6\u05D5\u05E8`, [{ mv: [`${to}/${num}.wav`, "/DeletedByAdmin/" + f] }]);
      await D.log(env, `\u05DE\u05E0\u05D4\u05DC ${who(admin)} \u05E9\u05D7\u05D6\u05E8 \u05DE${VIA} \u05D0\u05EA ${f} \u05DE\u05E1\u05DC \u05D4\u05DE\u05D7\u05D6\u05D5\u05E8 \u05DC${to === D.IMPORTANT ? "\u05D7\u05E9\u05D5\u05D1\u05D5\u05EA" : "\u05E8\u05D2\u05D9\u05DC\u05D5\u05EA"} (${num})`);
      return ok({ id: num });
    }
    case "purge": {
      const names2 = body.all ? ((await D.ym(env, "GetIVR2Dir", { path: "ivr2:/DeletedByAdmin" }).catch(() => ({}))).files || []).map((f) => f.name).filter((n2) => /\.wav$/.test(n2)) : [String(body.name || "")].filter((n2) => /^[\w-]+\.wav$/.test(n2));
      let n = 0;
      for (const f of names2.slice(0, 40)) {
        await D.ym(env, "FileAction", { action: "delete", what: "ivr2:/DeletedByAdmin/" + f }).then((r) => {
          if (r && r.responseStatus === "OK") n++;
        }).catch(() => {
        });
      }
      await D.log(env, `\u05DE\u05E0\u05D4\u05DC ${who(admin)} \u05DE\u05D7\u05E7 \u05DC\u05E6\u05DE\u05D9\u05EA\u05D5\u05EA \u05DE${VIA} ${n} \u05D4\u05E7\u05DC\u05D8\u05D5\u05EA \u05DE\u05E1\u05DC \u05D4\u05DE\u05D7\u05D6\u05D5\u05E8`).catch(() => {
      });
      return ok({ n, left: Math.max(0, names2.length - 40) });
    }
    case "download": {
      const p = q("p");
      if (!audioPathOk(D, p)) return json({ error: "\u05E0\u05EA\u05D9\u05D1 \u05DC\u05D0 \u05DE\u05D5\u05E8\u05E9\u05D4" }, 400);
      const bytes = await D.ym(env, "DownloadFile", { path: "ivr2:" + p });
      if (!bytes || bytes.length < 100 || bytes[0] === 123) return json({ error: "\u05D4\u05E7\u05D5\u05D1\u05E5 \u05DC\u05D0 \u05E0\u05DE\u05E6\u05D0" }, 404);
      return fileResp(bytes, p.slice(1).replace(/\//g, "_"), "audio/wav");
    }
    case "zip": {
      const paths = [...new Set((Array.isArray(body.paths) ? body.paths : []).map(String).filter((p) => audioPathOk(D, p)))].slice(0, 40);
      if (!paths.length) return json({ error: "\u05DC\u05D0 \u05E0\u05D1\u05D7\u05E8\u05D5 \u05D4\u05E7\u05DC\u05D8\u05D5\u05EA" }, 400);
      const files = [];
      for (const p of paths) {
        try {
          const b = await D.ym(env, "DownloadFile", { path: "ivr2:" + p });
          if (b && b.length > 100 && b[0] !== 123) files.push({ name: p.slice(1).replace(/\//g, "_"), bytes: b });
        } catch {
        }
      }
      if (!files.length) return json({ error: "\u05DC\u05D0 \u05E0\u05DE\u05E6\u05D0\u05D5 \u05E7\u05D1\u05E6\u05D9\u05DD" }, 404);
      return fileResp(makeZip(files), `recordings-${D.nowIL().slice(0, 10)}.zip`, "application/zip");
    }
    case "export_transcripts": {
      const ar = await D.kvGet(env, "archive", {}), notes = (await D.kvGet(env, "dashnotes", { msg: {} })).msg || {};
      const rows = [["\u05DE\u05E1\u05E4\u05E8", "\u05EA\u05D0\u05E8\u05D9\u05DA", "\u05E9\u05DD", "\u05D8\u05DC\u05E4\u05D5\u05DF", "\u05E1\u05D5\u05D2 \u05EA\u05DE\u05DC\u05D5\u05DC", "\u05EA\u05DE\u05DC\u05D5\u05DC", "\u05D4\u05E2\u05E8\u05EA \u05DE\u05E0\u05D4\u05DC"]];
      for (const [k, a] of Object.entries(ar).sort((x, y) => parseInt(y[0]) - parseInt(x[0]))) rows.push([k.replace(".wav", ""), a.d || "", a.n || nm[a.p] || "", a.p || "", a.s === "g" ? "\u05DE\u05DC\u05D0" : a.s === "a" ? "\u05D0\u05D5\u05D8\u05D5\u05DE\u05D8\u05D9" : "", a.t || "", (notes[k.replace(".wav", "")] || {}).t || ""]);
      return csvResp(rows, `transcripts-${D.nowIL().slice(0, 10)}.csv`);
    }
    // ---------- תזמון, שבת וחג, סיכום שבועי ----------
    case "schedule2": {
      const at = String(body.at || "");
      if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(at) || at <= D.nowIL().slice(0, 16)) return json({ error: "\u05D6\u05DE\u05DF \u05DC\u05D0 \u05EA\u05E7\u05D9\u05DF \u05D0\u05D5 \u05E9\u05DB\u05D1\u05E8 \u05E2\u05D1\u05E8" }, 400);
      const type = String(body.type || ""), text = String(body.text || "").trim().slice(0, 1500), every = ["day", "week"].includes(body.every) ? body.every : "", until = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(body.until || "") ? body.until : "";
      let j = { id: "j" + Date.now().toString(36), at, by: admin, via: VIA };
      if (type === "post") {
        if (!text) return json({ error: "\u05D0\u05D9\u05DF \u05E0\u05D5\u05E1\u05D7" }, 400);
        j = { ...j, type: "post", text, important: !!body.important };
      } else if (type === "tz") {
        const list = ["members", "admins", "general"].includes(body.list) ? body.list : "members";
        j = { ...j, type: "tz", list };
      } else if (type === "entry") {
        if (!text) return json({ error: "\u05D0\u05D9\u05DF \u05E0\u05D5\u05E1\u05D7" }, 400);
        j = { ...j, type: "entry", text };
      } else if (type === "pm") {
        const phones = [...new Set((Array.isArray(body.phones) ? body.phones : []).map((x) => String(x).replace(/\D/g, "")).filter(isPhone))];
        if (!text || !phones.length) return json({ error: "\u05E6\u05E8\u05D9\u05DA \u05E0\u05D5\u05E1\u05D7 \u05D5\u05E0\u05DE\u05E2\u05E0\u05D9\u05DD" }, 400);
        j = { ...j, type: "pm", text, phones };
      } else if (type === "remind") {
        const p = String(body.phone || "").replace(/\D/g, "");
        if (!text || !isPhone(p)) return json({ error: "\u05E6\u05E8\u05D9\u05DA \u05E0\u05D5\u05E1\u05D7 \u05D5\u05D7\u05D1\u05E8" }, 400);
        j = { ...j, type: "remind", text, phone: p };
      } else return json({ error: "\u05E1\u05D5\u05D2 \u05EA\u05D6\u05DE\u05D5\u05DF \u05DC\u05D0 \u05DE\u05D5\u05DB\u05E8" }, 400);
      if (every) {
        j.every = every;
        if (until) j.until = until;
      }
      const jobs = await D.kvGet(env, "scheduled", []);
      jobs.push(j);
      await env.KV.put("scheduled", JSON.stringify(jobs));
      await D.pushUndo(env, `\u05EA\u05D6\u05DE\u05D5\u05DF \u05DC-${at}${every ? " (\u05D7\u05D5\u05D6\u05E8)" : ""}`, [{ unsched: j.id }]);
      await D.log(env, `\u05DE\u05E0\u05D4\u05DC ${who(admin)} \u05E7\u05D1\u05E2 \u05DE${VIA} \u05EA\u05D6\u05DE\u05D5\u05DF \u05DC-${at}${every ? " \u05D7\u05D5\u05D6\u05E8 \u05DB\u05DC " + (every === "day" ? "\u05D9\u05D5\u05DD" : "\u05E9\u05D1\u05D5\u05E2") : ""}: ${type === "tz" ? "\u05E6\u05D9\u05E0\u05EA\u05D5\u05E7 \u05DC-" + j.list : type === "pm" ? "\u05D4\u05D5\u05D3\u05E2\u05D4 \u05D0\u05D9\u05E9\u05D9\u05EA \u05DC-" + j.phones.length + " \u05D7\u05D1\u05E8\u05D9\u05DD" : type === "entry" ? "\u05D4\u05D5\u05D3\u05E2\u05EA \u05DB\u05E0\u05D9\u05E1\u05D4" : type === "remind" ? "\u05EA\u05D6\u05DB\u05D5\u05E8\u05EA \u05DC" + who(j.phone) : j.important ? "\u05D4\u05D5\u05D3\u05E2\u05D4 \u05D7\u05E9\u05D5\u05D1\u05D4" : "\u05D4\u05D5\u05D3\u05E2\u05D4 \u05E8\u05D2\u05D9\u05DC\u05D4"}${text ? ": " + text.slice(0, 120) : ""}`);
      return ok({ id: j.id });
    }
    case "holy": {
      const [periods, holy, deferred] = await Promise.all([D.holyPeriods(env).catch(() => []), D.isHoly(env).catch(() => false), D.kvGet(env, "deferred_tz", [])]);
      return json({ holy, now: D.nowIL(), periods: periods.map(([a, b]) => ({ from: D.ilAt(a), to: D.ilAt(b), active: now >= a && now <= b + 5 * 6e4, past: now > b + 5 * 6e4 })), deferred: deferred.map((phones, i) => ({ i, phones, label: phones.startsWith("tzl:") ? "\u05E8\u05E9\u05D9\u05DE\u05EA " + phones.slice(4) : phones.split(":").length + " \u05DE\u05E1\u05E4\u05E8\u05D9\u05DD" })) });
    }
    case "deferred": {
      const d = await D.kvGet(env, "deferred_tz", []), i = +body.i;
      if (body.op === "cancel_all") {
        await env.KV.delete("deferred_tz");
        await D.log(env, `\u05DE\u05E0\u05D4\u05DC ${who(admin)} \u05D1\u05D9\u05D8\u05DC \u05DE${VIA} ${d.length} \u05E6\u05D9\u05E0\u05EA\u05D5\u05E7\u05D9\u05DD \u05E9\u05D7\u05D9\u05DB\u05D5 \u05DC\u05DE\u05D5\u05E6\u05D0\u05D9 \u05E9\u05D1\u05EA/\u05D7\u05D2`);
        return ok();
      }
      if (!(i >= 0 && i < d.length)) return json({ error: "\u05DC\u05D0 \u05E0\u05DE\u05E6\u05D0" }, 404);
      const phones = d[i];
      d.splice(i, 1);
      await env.KV.put("deferred_tz", JSON.stringify(d));
      if (body.op === "send") {
        const r = await D.ym(env, "RunTzintuk", { phones, force: true });
        await D.log(env, `\u05DE\u05E0\u05D4\u05DC ${who(admin)} \u05E9\u05DC\u05D7 \u05DE${VIA} \u05DE\u05D9\u05D3 \u05E6\u05D9\u05E0\u05EA\u05D5\u05E7 \u05E9\u05D7\u05D9\u05DB\u05D4 (${phones})`);
        return ok({ r });
      }
      await D.log(env, `\u05DE\u05E0\u05D4\u05DC ${who(admin)} \u05D1\u05D9\u05D8\u05DC \u05DE${VIA} \u05E6\u05D9\u05E0\u05EA\u05D5\u05E7 \u05E9\u05D7\u05D9\u05DB\u05D4 (${phones})`);
      return ok();
    }
    case "weekly": {
      if (req.method === "POST") {
        if (body.op === "dry") {
          const r = await D.weeklySummary(env, true);
          if (r.summary) await env.KV.put("weekly_draft", JSON.stringify({ summary: r.summary, count: r.count, d: D.nowIL() }), { expirationTtl: 7 * 86400 });
          return json(r);
        }
        if (body.op === "send") {
          const text = String(body.text || "").trim().slice(0, 4e3);
          if (text.length < 40) return json({ error: "\u05D4\u05E1\u05D9\u05DB\u05D5\u05DD \u05E7\u05E6\u05E8 \u05DE\u05D3\u05D9" }, 400);
          const [num] = await D.postVoice(env, [D.ALL], text);
          ctx.waitUntil(D.notify(env, "regular").then(() => D.processFlags(env)).catch(() => {
          }));
          await env.KV.put("weeklyDone", D.nowIL().slice(0, 10));
          await env.KV.delete("weekly_draft");
          await D.log(env, `\u05DE\u05E0\u05D4\u05DC ${who(admin)} \u05E4\u05E8\u05E1\u05DD \u05DE${VIA} \u05D0\u05EA \u05D4\u05E1\u05D9\u05DB\u05D5\u05DD \u05D4\u05E9\u05D1\u05D5\u05E2\u05D9 (\u05D4\u05D5\u05D3\u05E2\u05D4 ${num})`);
          return ok({ file: num });
        }
        return json({ error: "\u05E4\u05E2\u05D5\u05DC\u05D4 \u05DC\u05D0 \u05DE\u05D5\u05DB\u05E8\u05EA" }, 400);
      }
      return json({ draft: await D.kvGet(env, "weekly_draft", null), done: await env.KV.get("weeklyDone"), now: D.nowIL() });
    }
    // ---------- אירוע (שלוחה 9) ----------
    case "event": {
      const cur = await D.curEvent(env);
      if (body.op === "edit") {
        const title = String(body.title || "").trim().slice(0, 80), desc = String(body.desc || "").trim().slice(0, 200);
        if (!title) return json({ error: "\u05D0\u05D9\u05DF \u05E9\u05DD \u05DC\u05D0\u05D9\u05E8\u05D5\u05E2" }, 400);
        const ev = { ...cur, title, desc };
        await env.KV.put("event", JSON.stringify(ev));
        await D.bgAdd(env, [{ k: "tts", path: "/9", name: "M1000", text: D.event9Menu(ev) }, { k: "ini", path: "/9", text: `type=menu
title=${ev.title}
` }]);
        await D.pushUndo(env, `\u05E2\u05E8\u05D9\u05DB\u05EA \u05E4\u05E8\u05D8\u05D9 \u05D4\u05D0\u05D9\u05E8\u05D5\u05E2`, [{ event: cur }]);
        await D.log(env, `\u05DE\u05E0\u05D4\u05DC ${who(admin)} \u05E2\u05E8\u05DA \u05DE${VIA} \u05D0\u05EA \u05D4\u05D0\u05D9\u05E8\u05D5\u05E2: ${title} ${desc}`);
        return ok({ event: ev });
      }
      if (body.op === "rsvp_add" || body.op === "rsvp_remove") {
        const p = String(body.phone || "").replace(/\D/g, "");
        if (!isPhone(p)) return json({ error: "\u05DE\u05E1\u05E4\u05E8 \u05DC\u05D0 \u05EA\u05E7\u05D9\u05DF" }, 400);
        const list = await D.rsvpLoad(env);
        if (body.op === "rsvp_add") list[p] = { n: String(body.name || nm[p] || p).trim().slice(0, 40), ts: D.nowIL().slice(0, 16) };
        else delete list[p];
        await D.rsvpSave(env, list);
        await D.log(env, `\u05DE\u05E0\u05D4\u05DC ${who(admin)} ${body.op === "rsvp_add" ? "\u05E8\u05E9\u05DD" : "\u05D4\u05E1\u05D9\u05E8"} \u05DE${VIA} \u05D0\u05EA ${who(p)} ${body.op === "rsvp_add" ? "\u05DC" : "\u05DE"}${cur.title}`);
        return ok({ count: Object.keys(list).length });
      }
      if (body.op === "tz_missing") {
        const list = await D.rsvpLoad(env), phones = Object.keys(nm).filter((p) => !list[p]);
        if (!phones.length) return json({ error: "\u05DB\u05D5\u05DC\u05DD \u05DB\u05D1\u05E8 \u05E0\u05E8\u05E9\u05DE\u05D5" }, 400);
        const r = await tzPhones(env, D, phones);
        await D.log(env, `\u05DE\u05E0\u05D4\u05DC ${who(admin)} \u05E9\u05DC\u05D7 \u05DE${VIA} \u05E6\u05D9\u05E0\u05EA\u05D5\u05E7 \u05DC-${phones.length} \u05E9\u05E2\u05D5\u05D3 \u05DC\u05D0 \u05E0\u05E8\u05E9\u05DE\u05D5 \u05DC${cur.title}${r && r.deferred ? " (\u05E0\u05D3\u05D7\u05D4 \u05DC\u05DE\u05D5\u05E6\u05D0\u05D9 \u05E9\u05D1\u05EA/\u05D7\u05D2)" : ""}`);
        return ok({ count: phones.length, deferred: !!(r && r.deferred) });
      }
      return json({ error: "\u05E4\u05E2\u05D5\u05DC\u05D4 \u05DC\u05D0 \u05DE\u05D5\u05DB\u05E8\u05EA" }, 400);
    }
    case "rsvp_csv": {
      const [ev, list] = await Promise.all([D.curEvent(env), D.rsvpLoad(env)]);
      const rows = [["\u05E9\u05DD", "\u05D8\u05DC\u05E4\u05D5\u05DF", "\u05E0\u05E8\u05E9\u05DD"], ...Object.entries(list).sort((a, b) => a[1].ts > b[1].ts ? 1 : -1).map(([p, x]) => [x.n, p, x.ts]), [], ["\u05DC\u05D0 \u05E0\u05E8\u05E9\u05DE\u05D5"], ...Object.keys(nm).filter((p) => !list[p]).map((p) => [nm[p], p, ""])];
      return csvResp(rows, `event-rsvp-${D.nowIL().slice(0, 10)}.csv`);
    }
    // ---------- זמן אמת, דוחות, ניתוח, ניטור ----------
    case "pulse": {
      const [online, counts, joins, last] = await Promise.all([D.onlineNow(env).then((x) => x.calls).catch(() => []), Promise.all(D.PENDING_ORDER.map((k) => D.pendingFiles(env, D.REVIEW[k].folder).then((f) => f.length).catch(() => 0))), D.pendingFiles(env, D.REVIEW.join.folder).then((f) => f.length).catch(() => 0), D.nextFileNum(env, D.ALL).catch(() => 0)]);
      return json({ now: D.nowIL(), online: online.map((c) => ({ ...c, n: nm[c.p] || "" })), pending: counts.reduce((a, b) => a + b, 0), joins, lastMsg: Math.max(0, last - 1) });
    }
    case "calls": {
      const day = /^\d{4}-\d{2}-\d{2}$/.test(q("day")) ? q("day") : D.nowIL().slice(0, 10);
      const lg = await callLog(env, D, 1, [day.slice(0, 7)]).catch(() => ({ ents: [] }));
      const ents = lg.ents.filter((e) => e.t.startsWith(day)).sort((a, b) => a.t < b.t ? -1 : 1).map((e) => ({ p: e.p, n: nm[e.p] || "", t: e.t.slice(11, 16), x: e.x.slice(0, 5), f: e.f, l: speakerFolder(D, e.f) }));
      return json({ day, ents, callers: new Set(ents.map((e) => e.p)).size });
    }
    case "report": {
      const m = /^\d{4}-\d{2}$/.test(q("m")) ? q("m") : D.nowIL().slice(0, 7);
      const [y, mm] = m.split("-").map(Number), prevKey = new Date(Date.UTC(y, mm - 2, 1)).toISOString().slice(0, 7);
      const [cur, prev, archive, conv, imp] = await Promise.all([callLog(env, D, 1, [m]), callLog(env, D, 1, [prevKey]), D.kvGet(env, "archive", {}), D.kvGet(env, "convlog", []), D.ym(env, "GetIVR2Dir", { path: "ivr2:" + D.IMPORTANT }).catch(() => ({}))]);
      const inMonth = /* @__PURE__ */ __name((d, k) => D.sortable(d).slice(0, 7) === k || String(d || "").slice(0, 7) === k, "inMonth");
      const msgs = Object.values(archive).filter((a) => inMonth(a.d, m)).length, msgsPrev = Object.values(archive).filter((a) => inMonth(a.d, prevKey)).length;
      const convN = conv.filter((c) => String(c.d || "").slice(0, 7) === m).length, convPrev = conv.filter((c) => String(c.d || "").slice(0, 7) === prevKey).length;
      const impN = (imp.files || []).filter((f) => /^\d+\.wav$/.test(f.name) && inMonth(f.mtime || f.date, m)).length;
      const days = Object.keys(cur.byDay).sort(), byWeekday = Array(7).fill(0);
      for (const d of days) byWeekday[(/* @__PURE__ */ new Date(d + "T00:00:00Z")).getUTCDay()] += cur.byDay[d];
      const callers = new Set(Object.keys(cur.per)).size, callersPrev = new Set(Object.keys(prev.per)).size;
      const active = Object.keys(nm).filter((p) => cur.per[p]).length, silent = Object.keys(nm).filter((p) => !cur.per[p]).map((p) => ({ p, n: nm[p] }));
      return json({
        month: m,
        prev: prevKey,
        calls: cur.total,
        callsPrev: prev.total,
        callers,
        callersPrev,
        msgs,
        msgsPrev,
        imp: impN,
        conv: convN,
        convPrev,
        members: Object.keys(nm).length,
        active,
        silent,
        byDay: days.map((d) => ({ d, n: cur.byDay[d] })),
        byHour: cur.byHour,
        byWeekday,
        top: Object.entries(cur.per).map(([p, n]) => ({ p, n: who(p), calls: n })).sort((a, b) => b.calls - a.calls).slice(0, 15),
        byFolder: Object.entries(cur.byFolder).reduce((acc, [f, n]) => {
          const l = speakerFolder(D, f);
          acc[l] = (acc[l] || 0) + n;
          return acc;
        }, {}),
        now: D.nowIL()
      });
    }
    case "convstats": {
      const conv = await D.kvGet(env, "convlog", []), per = {}, byHour = Array(24).fill(0), words = {}, byDay = {};
      for (const c of conv) {
        per[c.p] = (per[c.p] || 0) + 1;
        const h = +String(c.d || "").slice(11, 13);
        if (h >= 0 && h < 24) byHour[h]++;
        const d = String(c.d || "").slice(0, 10);
        if (d) byDay[d] = (byDay[d] || 0) + 1;
        for (const w of String(c.q || "").replace(/[^֐-׿a-zA-Z0-9 ]/g, " ").split(/\s+/)) {
          const x = w.trim();
          if (x.length >= 3 && !/^\d+$/.test(x) && !HE_STOP.has(x)) words[x] = (words[x] || 0) + 1;
        }
      }
      return json({
        total: conv.length,
        per: Object.entries(per).map(([p, n]) => ({ p, n: who(p), c: n })).sort((a, b) => b.c - a.c).slice(0, 20),
        byHour,
        words: Object.entries(words).sort((a, b) => b[1] - a[1]).slice(0, 40).map(([w, n]) => ({ w, n })),
        byDay: Object.entries(byDay).sort().slice(-30).map(([d, n]) => ({ d, n })),
        first: conv.length ? conv[0].d : "",
        conv: conv.slice(-500).reverse().map((e) => ({ d: e.d, p: e.p, n: who(e.p), q: e.q, a: e.a }))
      });
    }
    case "health": {
      if (req.method === "POST") {
        if (await env.KV.get("bglock")) return json({ error: "\u05D4\u05DE\u05E9\u05D9\u05DE\u05D5\u05EA \u05E8\u05E6\u05D5\u05EA \u05DE\u05DE\u05E9 \u05E2\u05DB\u05E9\u05D9\u05D5. \u05E0\u05E1\u05D5 \u05E9\u05D5\u05D1 \u05D1\u05E2\u05D5\u05D3 \u05D3\u05E7\u05D4" }, 409);
        if (body.op === "clearbg") {
          const n = (await D.kvGet(env, "bgjobs", [])).length;
          await env.KV.put("bgjobs", "[]");
          await D.log(env, `\u05DE\u05E0\u05D4\u05DC ${who(admin)} \u05E0\u05D9\u05E7\u05D4 \u05DE${VIA} \u05D0\u05EA \u05EA\u05D5\u05E8 \u05DE\u05E9\u05D9\u05DE\u05D5\u05EA \u05D4\u05E8\u05E7\u05E2 (${n})`).catch(() => {
          });
          return ok({ n });
        }
        if (body.op === "dropbg") {
          const qq = await D.kvGet(env, "bgjobs", []), i = qq.findIndex((s) => JSON.stringify(s) === String(body.f || ""));
          if (i < 0) return json({ error: "\u05D4\u05DE\u05E9\u05D9\u05DE\u05D4 \u05DB\u05D1\u05E8 \u05DC\u05D0 \u05D1\u05EA\u05D5\u05E8" }, 404);
          qq.splice(i, 1);
          await env.KV.put("bgjobs", JSON.stringify(qq));
          return ok({ n: qq.length });
        }
        return json({ error: "\u05E4\u05E2\u05D5\u05DC\u05D4 \u05DC\u05D0 \u05DE\u05D5\u05DB\u05E8\u05EA" }, 400);
      }
      const [logR, bg, pc, aai, cron2, weekly, deferred, errCount, retortq, holy, sample, jobs] = await Promise.all([
        D.ym(env, "GetTextFile", { what: "ivr2:/AILog.txt" }).catch(() => ({})),
        D.kvGet(env, "bgjobs", []),
        D.kvGet(env, "postcheck", {}),
        D.kvGet(env, "aai_pending", []),
        env.KV.get("cronlock"),
        env.KV.get("weeklyDone"),
        D.kvGet(env, "deferred_tz", []),
        D.pendingFiles(env, D.REVIEW.error.folder).then((f) => f.length).catch(() => 0),
        D.kvGet(env, "retortq", []),
        D.isHoly(env).catch(() => null),
        env.KV.get("incall_sample"),
        D.kvGet(env, "scheduled", [])
      ]);
      const lines = (logR && logR.contents || "").split("\n").filter((l) => /שגיאה|error|נכשל|לא הצליח|תקלה/i.test(l)).slice(0, 80).map((l) => {
        const m = /^\[([^\]]+)\]\s*(.*)$/.exec(l);
        return m ? { t: m[1], m: m[2] } : { t: "", m: l };
      });
      const bgs = bg.map((s, i) => ({ i, f: JSON.stringify(s), k: s.k, what: s.k === "tts" ? `${s.path}/${s.name}: ${String(s.text || "").slice(0, 60)}` : s.k === "bc" ? "\u05D4\u05D5\u05D3\u05E2\u05D4 \u05D0\u05D9\u05E9\u05D9\u05EA \u05DC" + who(s.p) : s.k === "ini" ? "ini " + s.path : s.k === "fa" ? `${s.action} ${s.what}` : s.k === "log" ? String(s.line || "").slice(0, 60) : s.k, tries: s.tries || 0 }));
      const lastJob = jobs.map((j) => String(j.done || "")).filter(Boolean).sort().pop() || "";
      return json({ now: D.nowIL(), lastJob, errors: lines, bg: bgs, postcheck: Object.keys(pc).length, aai: Array.isArray(aai) ? aai.length : Object.keys(aai || {}).length, lastCron: cron2 ? D.ilAt(+cron2) : "", cronAgo: cron2 ? Math.round((now - +cron2) / 1e3) : null, weeklyDone: weekly || "", deferred: deferred.length, pendingError: errCount, retortq: retortq.length, holy, hasSample: !!sample, testMode: env.TEST_MODE === "1" });
    }
    case "heard": {
      if (req.method === "POST") {
        const phones = [...new Set((Array.isArray(body.phones) ? body.phones : []).map((x) => String(x).replace(/\D/g, "")).filter(isPhone))];
        if (!phones.length) return json({ error: "\u05D0\u05D9\u05DF \u05DC\u05DE\u05D9 \u05DC\u05E9\u05DC\u05D5\u05D7" }, 400);
        const r = await tzPhones(env, D, phones);
        await D.log(env, `\u05DE\u05E0\u05D4\u05DC ${who(admin)} \u05E9\u05DC\u05D7 \u05DE${VIA} \u05E6\u05D9\u05E0\u05EA\u05D5\u05E7 \u05DC-${phones.length} \u05E9\u05E2\u05D5\u05D3 \u05DC\u05D0 \u05E9\u05DE\u05E2\u05D5 \u05D4\u05D5\u05D3\u05E2\u05D4 \u05D7\u05E9\u05D5\u05D1\u05D4${r && r.deferred ? " (\u05E0\u05D3\u05D7\u05D4)" : ""}`);
        return ok({ count: phones.length, deferred: !!(r && r.deferred) });
      }
      const [imp, lg, archive] = await Promise.all([D.ym(env, "GetIVR2Dir", { path: "ivr2:" + D.IMPORTANT }).catch(() => ({})), callLog(env, D, 2).catch(() => ({ imp11: [] })), D.kvGet(env, "archive", {})]);
      const files = (imp.files || []).filter((f) => /^\d+\.wav$/.test(f.name)).map((f) => ({ f: f.name, t: D.sortable(f.mtime || f.date), size: +f.size || 0 })).sort((a, b) => a.t < b.t ? 1 : -1).slice(0, 12);
      const bySize = {};
      for (const [k, a] of Object.entries(archive)) if (a && a.t) bySize[k] = a;
      const all = Object.keys(nm);
      return json({ list: files.map((x) => {
        const heard = [...new Set(lg.imp11.filter((e) => e.t >= x.t).map((e) => e.p))];
        return { f: x.f, t: x.t, heard: heard.map((p) => ({ p, n: who(p) })), not: all.filter((p) => !heard.includes(p)).map((p) => ({ p, n: nm[p] })) };
      }), total: all.length });
    }
    // ---------- גיבוי ושחזור ----------
    case "backup": {
      const data = {};
      for (const k of BACKUP_KEYS) data[k] = await D.kvGet(env, k, null);
      data._meta = { at: D.nowIL(), line: D.LINE_PHONE, keys: BACKUP_KEYS };
      return fileResp(enc.encode(JSON.stringify(data)), `yemot-backup-${D.nowIL().slice(0, 10)}.json`, "application/json");
    }
    case "restore_backup": {
      const data = body.data && typeof body.data === "object" ? body.data : null, keys = (Array.isArray(body.keys) ? body.keys : []).filter((k) => BACKUP_KEYS.includes(k));
      if (!data || !keys.length) return json({ error: "\u05D0\u05D9\u05DF \u05DE\u05D4 \u05DC\u05E9\u05D7\u05D6\u05E8" }, 400);
      const done = [];
      for (const k of keys) {
        if (data[k] === void 0) continue;
        if (data[k] === null) await env.KV.delete(k);
        else await env.KV.put(k, JSON.stringify(data[k]));
        done.push(k);
      }
      await env.KV.delete("admintext");
      await D.log(env, `\u05DE\u05E0\u05D4\u05DC ${who(admin)} \u05E9\u05D7\u05D6\u05E8 \u05DE${VIA} \u05DE\u05D2\u05D9\u05D1\u05D5\u05D9 \u05D0\u05EA: ${done.join(", ")}`);
      return ok({ done });
    }
  }
  return json({ error: "\u05DC\u05D0 \u05E0\u05DE\u05E6\u05D0" }, 404);
}
__name(api2, "api2");

// src/worker.js
var YM = "https://www.call2all.co.il/ym/api/";
var QUEUES = { important: "/AIQueue", general: "/AIQueueGeneral" };
var IMPORTANT = "/1/1";
var ALL = "/1/2";
var P = { problem: "/PendingProblem", general: "/PendingGeneral", demoted: "/PendingDemoted", error: "/PendingError" };
var FLAG_TEMPLATE = "/FlagTemplate/000.wav";
var used = 0;
var NAMES_CACHE = {};
async function ym(env, method, params = {}) {
  if (method === "RunTzintuk" && !params.force && env.KV && await isHoly(env)) {
    const d = await kvGet(env, "deferred_tz", []);
    if (!d.includes(params.phones)) {
      d.push(params.phones);
      await env.KV.put("deferred_tz", JSON.stringify(d));
    }
    return { responseStatus: "OK", deferred: true };
  }
  if (params.force) {
    params = { ...params };
    delete params.force;
  }
  used++;
  const u = new URL(YM + method);
  u.searchParams.set("token", env.YM_TOKEN);
  let r;
  if (method === "UploadTextFile") {
    const body = new URLSearchParams({ token: env.YM_TOKEN, ...params });
    r = await fetch(YM + method, { method: "POST", body });
  } else {
    for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
    r = await fetch(u);
  }
  if (method === "DownloadFile") return new Uint8Array(await r.arrayBuffer());
  return r.json();
}
__name(ym, "ym");
function b64(bytes) {
  let s = "";
  for (let i = 0; i < bytes.length; i += 32768) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 32768));
  return btoa(s);
}
__name(b64, "b64");
var nowIL = /* @__PURE__ */ __name(() => (/* @__PURE__ */ new Date()).toLocaleString("sv-SE", { timeZone: "Asia/Jerusalem" }), "nowIL");
async function nextName(env, folder, ext) {
  const d = await ym(env, "GetIVR2Dir", { path: "ivr2:" + folder });
  let max = -1;
  for (const f of d.files || []) if (/^\d+\./.test(f.name)) max = Math.max(max, parseInt(f.name, 10));
  return String(max + 1).padStart(3, "0") + "." + ext;
}
__name(nextName, "nextName");
async function move(env, src, folder, action = "move") {
  const name = await nextName(env, folder, src.split(".").pop());
  await ym(env, "FileAction", { action, what: "ivr2:" + src, target: "ivr2:" + folder + "/" + name });
  return name;
}
__name(move, "move");
async function log(env, line) {
  const cur = await ym(env, "GetTextFile", { what: "ivr2:/AILog.txt" });
  await ym(env, "UploadTextFile", { what: "ivr2:/AILog.txt", contents: (`[${nowIL()}] ${line}
` + (cur && cur.contents || "")).slice(0, 6e4) });
}
__name(log, "log");
async function listPhones(env, list) {
  const r = await ym(env, "TzintukimListManagement", { action: "getlistEnteres", TzintukimList: list });
  return (r.enteres || []).filter((e) => e.active).map((e) => e.phone);
}
__name(listPhones, "listPhones");
var tzl = /* @__PURE__ */ __name((env, list) => env.TEST_MODE === "1" ? "tzl:admins" : "tzl:" + list, "tzl");
async function tzintuk(env, list) {
  return ym(env, "RunTzintuk", { phones: tzl(env, list) });
}
__name(tzintuk, "tzintuk");
var geminiKeys = /* @__PURE__ */ __name((env) => [env.GEMINI_KEY, ...(env.GEMINI_KEYS || "").split(",")].map((k) => (k || "").trim()).filter(Boolean), "geminiKeys");
var dead = /* @__PURE__ */ new Map();
var isDead = /* @__PURE__ */ __name((k) => (dead.get(k) || 0) > Date.now(), "isDead");
async function groqSTT(env, wav) {
  if (!env.GROQ_KEY || isDead("groq-stt")) throw new Error("groq-stt unavailable");
  const fd = new FormData();
  fd.append("file", new Blob([wav], { type: "audio/wav" }), "a.wav");
  fd.append("model", "whisper-large-v3");
  fd.append("language", "he");
  const r = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", { method: "POST", headers: { Authorization: "Bearer " + env.GROQ_KEY }, body: fd, signal: AbortSignal.timeout(2e4) });
  used++;
  if (r.status === 429) dead.set("groq-stt", Date.now() + 10 * 6e4);
  if (!r.ok) throw new Error("groq-stt " + r.status);
  return ((await r.json()).text || "").trim();
}
__name(groqSTT, "groqSTT");
function parseJSON(t) {
  try {
    return JSON.parse(t);
  } catch {
    const m = /\{[\s\S]*\}/.exec(t || "");
    if (m) return JSON.parse(m[0]);
    throw new Error("bad json");
  }
}
__name(parseJSON, "parseJSON");
var aiTrace = [];
var force = "";
var CHAT_MODELS = ["gemini-3.6-flash", "gemini-3.5-flash", "gemini-flash-lite-latest", "gemma-4-26b-a4b-it"];
var safeParse = /* @__PURE__ */ __name((c) => {
  if (c && typeof c === "object") return c;
  try {
    return parseJSON(c);
  } catch {
    const m = /"answer"\s*:\s*"([\s\S]*?)"\s*['"]?\s*\}?\s*$/.exec(String(c || ""));
    return { answer: m ? m[1] : String(c || "") };
  }
}, "safeParse");
var providers = /* @__PURE__ */ __name((env) => {
  try {
    return JSON.parse(env.PROVIDERS || "[]");
  } catch {
    return [];
  }
}, "providers");
var toChat = /* @__PURE__ */ __name((sys, contents) => [
  { role: "system", content: sys },
  ...contents.map((c) => ({ role: c.role === "model" ? "assistant" : "user", content: c.parts.map((p) => p.text || "").join(" ") }))
], "toChat");
async function aiText(env, { system, compact, contents, models = CHAT_MODELS, groq = true, cf = true, deadline = 22e3, timeout = 15e3 }) {
  const start = Date.now(), errs = [];
  const late = /* @__PURE__ */ __name(() => Date.now() - start > deadline, "late");
  if (force === "cf") models = [];
  else if (force === "gemma") models = ["gemma-4-26b-a4b-it"];
  for (const model of models) for (const key of geminiKeys(env)) {
    const id = key.slice(-4) + "|" + model;
    if (isDead(id) || late()) continue;
    const sys = model.startsWith("gemma") ? compact || system : system;
    const t0 = Date.now();
    try {
      const body = { system_instruction: { parts: [{ text: sys }] }, contents, generationConfig: { responseMimeType: "application/json" } };
      const r = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        { method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": key }, body: JSON.stringify(body), signal: AbortSignal.timeout(timeout) }
      );
      used++;
      aiTrace.push(`${id} ${r.status} ${Date.now() - t0}ms`);
      if (r.ok) {
        const parts = (await r.json()).candidates[0].content.parts;
        return safeParse(parts[parts.length - 1].text);
      }
      if (r.status === 429) dead.set(id, Date.now() + (model.startsWith("gemma") ? 2 : 60) * 6e4);
      if (r.status >= 500) dead.set(id, Date.now() + 3 * 6e4);
      errs.push(model + ":" + r.status);
    } catch (e) {
      dead.set(id, Date.now() + 3 * 6e4);
      aiTrace.push(`${id} ${e.message} ${Date.now() - t0}ms`);
      errs.push(model + ":" + e.message);
    }
  }
  const list = force || !groq ? [] : [...providers(env)];
  if (!force && groq && env.GROQ_KEY) list.push({ name: "groq", url: "https://api.groq.com/openai/v1/chat/completions", key: env.GROQ_KEY, models: (env.GROQ_MODELS || "openai/gpt-oss-120b").split(",") });
  const msgs = toChat(compact || system, contents);
  for (const p of list) for (const model of p.models) {
    const id = p.name + "|" + model;
    if (isDead(id)) continue;
    const t0 = Date.now();
    try {
      const r = await fetch(p.url, {
        method: "POST",
        signal: AbortSignal.timeout(timeout),
        headers: { Authorization: "Bearer " + p.key, "Content-Type": "application/json", ...p.headers || {} },
        body: JSON.stringify({ model: model.trim(), messages: msgs, temperature: 0.6 })
      });
      used++;
      aiTrace.push(`${id} ${r.status} ${Date.now() - t0}ms`);
      if (r.ok) {
        const c = ((await r.json()).choices || [])[0]?.message?.content || "";
        if (c.trim()) return safeParse(c);
      }
      if (r.status === 429) dead.set(id, Date.now() + 15 * 6e4);
      errs.push(id + ":" + r.status);
    } catch (e) {
      aiTrace.push(`${id} ${e.message}`);
      errs.push(id + ":" + e.message);
    }
  }
  if (cf && env.AI && !isDead("cf-ai")) {
    try {
      let out = "";
      try {
        const r = await env.AI.run("@cf/openai/gpt-oss-120b", { instructions: msgs[0].content, input: msgs.slice(1).map((m) => ({ role: m.role, content: m.content })) });
        for (const item of r && r.output || []) for (const c of item.content || []) if (c.type === "output_text" && c.text) out = c.text;
        aiTrace.push("cf-ai gpt-oss " + (out ? "ok" : "empty"));
      } catch (e) {
        aiTrace.push("cf-ai gpt-oss " + e.message);
      }
      if (!out) {
        const r = await env.AI.run("@cf/meta/llama-3.3-70b-instruct-fp8-fast", { messages: msgs, max_tokens: 700 });
        out = r && r.response;
        aiTrace.push("cf-ai llama ok");
      }
      if (out) return safeParse(out);
    } catch (e) {
      dead.set("cf-ai", Date.now() + 30 * 6e4);
      aiTrace.push("cf-ai " + e.message);
      errs.push("cf-ai:" + e.message);
    }
  }
  throw new Error(errs.join(" "));
}
__name(aiText, "aiText");
var AAI = "https://api.assemblyai.com/v2";
async function aaiSubmit(env, wav) {
  const up = await fetch(AAI + "/upload", { method: "POST", headers: { authorization: env.AAI_KEY, "content-type": "application/octet-stream" }, body: wav, signal: AbortSignal.timeout(15e3) });
  used++;
  if (!up.ok) throw new Error("aai upload " + up.status);
  const { upload_url } = await up.json();
  const tr = await fetch(AAI + "/transcript", {
    method: "POST",
    signal: AbortSignal.timeout(15e3),
    headers: { authorization: env.AAI_KEY, "content-type": "application/json" },
    body: JSON.stringify({ audio_url: upload_url, language_code: "he", speech_models: ["universal-3-5-pro", "universal-2"] })
  });
  used++;
  if (!tr.ok) throw new Error("aai create " + tr.status);
  return (await tr.json()).id;
}
__name(aaiSubmit, "aaiSubmit");
async function aaiGet(env, id) {
  const r = await fetch(AAI + "/transcript/" + id, { headers: { authorization: env.AAI_KEY }, signal: AbortSignal.timeout(1e4) });
  used++;
  return r.json();
}
__name(aaiGet, "aaiGet");
async function aaiSTT(env, wav, maxWait = 12e3) {
  if (!env.AAI_KEY) throw new Error("no aai");
  const id = await aaiSubmit(env, wav), t0 = Date.now();
  while (Date.now() - t0 < maxWait) {
    await new Promise((r) => setTimeout(r, 500));
    const g = await aaiGet(env, id);
    if (g.status === "completed") return (g.text || "").trim();
    if (g.status === "error") throw new Error("aai " + g.error);
  }
  throw new Error("aai timeout");
}
__name(aaiSTT, "aaiSTT");
function cleanupTranscript(t) {
  const s0 = (t || "").trim();
  const s1 = s0.replace(/^((תודה( רבה)?)[.!,]?\s*)+/, "").replace(/(\s*(תודה( רבה)?)[.!,]?)+$/, "").trim();
  return s1.split(/\s+/).filter(Boolean).length >= 2 ? s1 : s0;
}
__name(cleanupTranscript, "cleanupTranscript");
async function allFiles(env, folder) {
  const out = [];
  for (let from = 0; from < 1e4; from += 1e3) {
    const d = await ym(env, "GetIVR2Dir", { path: "ivr2:" + folder, filesFrom: from, filesLimit: 1e3 });
    const fs = d.files || [];
    out.push(...fs);
    if (fs.length < 1e3) break;
  }
  return { files: out };
}
__name(allFiles, "allFiles");
async function aaiArchive(env, maxSubmit = 6, maxPoll = 12) {
  if (!env.AAI_KEY || !env.KV) return;
  const archive = await kvGet(env, "archive", {}), pending = await kvGet(env, "aai_pending", {});
  let changed = false, pchanged = false;
  for (const [name, job] of Object.entries(pending).slice(0, maxPoll)) {
    if (used > 42) break;
    const g = await aaiGet(env, job.id).catch(() => ({}));
    if (g.status !== "completed" && g.status !== "error" && Date.now() - job.ts < 30 * 6e4) continue;
    if (!archive[name] || archive[name].s !== "g") {
      const t = cleanupTranscript(g.text || "");
      archive[name] = { p: job.p || "", n: names(env)[job.p] || "", d: job.d || "", t: realText(t) ? t.slice(0, 3e3) : "", s: "a" };
      changed = true;
    }
    delete pending[name];
    pchanged = true;
  }
  if (used < 34) {
    const d = await allFiles(env, ALL);
    const todo = (d.files || []).filter((f) => /^\d+\.wav$/.test(f.name) && !pending[f.name] && (!archive[f.name] || !["g", "a"].includes(archive[f.name].s))).sort((a, b) => parseInt(b.name) - parseInt(a.name)).slice(0, maxSubmit);
    for (const f of todo) {
      if (used > 42) break;
      if ((f.duration || 0) < 1.2) {
        archive[f.name] = { p: f.phone || "", n: names(env)[f.phone] || "", d: f.date || f.mtime || "", t: "", s: "a" };
        changed = true;
        continue;
      }
      try {
        const wav = await ym(env, "DownloadFile", { path: "ivr2:" + ALL + "/" + f.name });
        pending[f.name] = { id: await aaiSubmit(env, wav), p: f.phone || "", d: f.date || f.mtime || "", ts: Date.now() };
        pchanged = true;
      } catch (e) {
        break;
      }
    }
  }
  if (changed) await env.KV.put("archive", JSON.stringify(archive));
  if (pchanged) await env.KV.put("aai_pending", JSON.stringify(pending));
}
__name(aaiArchive, "aaiArchive");
async function classify(env, wav) {
  const prompt = `\u05D6\u05D5 \u05D4\u05E7\u05DC\u05D8\u05D4 \u05E7\u05D5\u05DC\u05D9\u05EA \u05E9\u05D7\u05D1\u05E8 \u05D1\u05E7\u05D1\u05D5\u05E6\u05D4 \u05E7\u05D4\u05D9\u05DC\u05EA\u05D9\u05EA \u05D7\u05E8\u05D3\u05D9\u05EA \u05D4\u05E7\u05DC\u05D9\u05D8 \u05D1\u05E7\u05D5 \u05D8\u05DC\u05E4\u05D5\u05E0\u05D9 \u05E9\u05DC \u05D4\u05E7\u05D1\u05D5\u05E6\u05D4, \u05DB\u05D3\u05D9 \u05E9\u05DB\u05DC \u05D4\u05D7\u05D1\u05E8\u05D9\u05DD \u05D9\u05E9\u05DE\u05E2\u05D5 \u05D0\u05D5\u05EA\u05D4.
\u05EA\u05DE\u05DC\u05DC \u05D0\u05D5\u05EA\u05D4, \u05D5\u05D4\u05D7\u05DC\u05D8:
- problem: true \u05E8\u05E7 \u05D0\u05DD \u05D9\u05E9 \u05D1\u05D4 \u05EA\u05D5\u05DB\u05DF \u05D7\u05E8\u05D9\u05D2 \u05D1\u05D0\u05DE\u05EA: \u05E7\u05DC\u05DC\u05D5\u05EA \u05D0\u05D5 \u05E0\u05D9\u05D1\u05D5\u05DC \u05E4\u05D4, \u05D2\u05E1\u05D5\u05EA, \u05EA\u05D5\u05DB\u05DF \u05DC\u05D0 \u05E6\u05E0\u05D5\u05E2 \u05D0\u05D5 \u05DC\u05D0 \u05E8\u05D0\u05D5\u05D9 \u05DC\u05E6\u05D9\u05D1\u05D5\u05E8 \u05D4\u05D7\u05E8\u05D3\u05D9, \u05D4\u05E9\u05E4\u05DC\u05D4 \u05D0\u05D5 \u05D4\u05E2\u05DC\u05D1\u05D4 \u05D7\u05DE\u05D5\u05E8\u05D4 \u05E9\u05DC \u05D0\u05D3\u05DD \u05DE\u05E1\u05D5\u05D9\u05DD, \u05DC\u05E9\u05D5\u05DF \u05D4\u05E8\u05E2 \u05D7\u05DE\u05D5\u05E8 \u05D0\u05D5 \u05D4\u05E9\u05DE\u05E6\u05D4, \u05D0\u05D5 \u05D0\u05D9\u05D5\u05DE\u05D9\u05DD. \u05EA\u05DC\u05D5\u05E0\u05D5\u05EA, \u05D1\u05D9\u05E7\u05D5\u05E8\u05EA, \u05D5\u05D9\u05DB\u05D5\u05D7 \u05E2\u05E0\u05D9\u05D9\u05E0\u05D9, \u05D1\u05D3\u05D9\u05D7\u05D5\u05EA, \u05E6\u05D7\u05D5\u05E7\u05D9\u05DD \u05D1\u05D9\u05DF \u05D7\u05D1\u05E8\u05D9\u05DD, \u05E1\u05DC\u05E0\u05D2, \u05E9\u05D8\u05D5\u05D9\u05D5\u05EA \u05D5\u05D4\u05D5\u05D3\u05E2\u05D5\u05EA \u05E8\u05D9\u05E7\u05D5\u05EA, \u05DB\u05DC \u05D0\u05DC\u05D4 \u05D1\u05E1\u05D3\u05E8 \u05D5\u05DC\u05DB\u05DF false. \u05D1\u05E8\u05D5\u05D1 \u05D4\u05DE\u05E7\u05E8\u05D9\u05DD \u05D4\u05EA\u05E9\u05D5\u05D1\u05D4 \u05D4\u05D9\u05D0 false.
- important: \u05D4\u05D0\u05DD \u05D4\u05D4\u05D5\u05D3\u05E2\u05D4 \u05DE\u05E1\u05E4\u05D9\u05E7 \u05D7\u05E9\u05D5\u05D1\u05D4 \u05DB\u05D3\u05D9 \u05E9\u05DB\u05DC \u05D4\u05D7\u05D1\u05E8\u05D9\u05DD \u05D9\u05E7\u05D1\u05DC\u05D5 \u05E2\u05DC\u05D9\u05D4 \u05E6\u05D9\u05E0\u05EA\u05D5\u05E7. \u05D0\u05DC\u05D4 \u05D4\u05DB\u05DC\u05DC\u05D9\u05DD \u05E9\u05DE\u05E0\u05D4\u05DC \u05D4\u05E7\u05D1\u05D5\u05E6\u05D4 \u05E7\u05D1\u05E2:
  \u05D7\u05E9\u05D5\u05D1 (true): \u05E9\u05D9\u05E2\u05D5\u05E8 \u05E9\u05DE\u05EA\u05D1\u05D8\u05DC \u05D0\u05D5 \u05D6\u05D6 \u05DC\u05E9\u05E2\u05D4 \u05D0\u05D5 \u05DC\u05DE\u05E7\u05D5\u05DD \u05D0\u05D7\u05E8; \u05D4\u05D6\u05DE\u05E0\u05D4 \u05DC\u05E9\u05DE\u05D7\u05D4 \u05D0\u05D5 \u05DC\u05D0\u05D9\u05E8\u05D5\u05E2 (\u05D7\u05EA\u05D5\u05E0\u05D4, \u05D1\u05E8 \u05DE\u05E6\u05D5\u05D5\u05D4, \u05E9\u05DE\u05D7\u05EA \u05D1\u05D9\u05EA \u05D4\u05E9\u05D5\u05D0\u05D1\u05D4 \u05D5\u05DB\u05D3\u05D5\u05DE\u05D4); \u05EA\u05D6\u05DB\u05D5\u05E8\u05EA \u05DC\u05E9\u05D9\u05E2\u05D5\u05E8 \u05D4\u05E7\u05D1\u05D5\u05E2; \u05D1\u05E7\u05E9\u05D4 \u05D3\u05D7\u05D5\u05E4\u05D4 \u05DC\u05EA\u05E4\u05D9\u05DC\u05D4 \u05D0\u05D5 \u05DC\u05EA\u05D4\u05D9\u05DC\u05D9\u05DD \u05E2\u05DC \u05D7\u05D5\u05DC\u05D4; \u05DE\u05D9\u05E9\u05D4\u05D5 \u05DE\u05D7\u05E4\u05E9 \u05D8\u05E8\u05DE\u05E4, \u05D0\u05D5 \u05D4\u05D5\u05D3\u05E2\u05D4 \u05E2\u05DC \u05D7\u05E4\u05E5 \u05E9\u05D0\u05D1\u05D3 \u05D0\u05D5 \u05E0\u05DE\u05E6\u05D0; \u05D0\u05D9\u05E1\u05D5\u05E3 \u05DB\u05E1\u05E3 \u05D0\u05D5 \u05DE\u05EA\u05E0\u05D4 \u05DC\u05D7\u05D1\u05E8 \u05D0\u05D5 \u05DC\u05E8\u05D1; \u05E9\u05D0\u05DC\u05D4 \u05E9\u05DE\u05D5\u05E4\u05E0\u05D9\u05EA \u05DC\u05DB\u05DC \u05D4\u05D7\u05D1\u05E8'\u05D4, \u05D0\u05D1\u05DC \u05E8\u05E7 \u05D0\u05DD \u05D4\u05D9\u05D0 \u05D1\u05D0\u05DE\u05EA \u05D7\u05E9\u05D5\u05D1\u05D4 \u05D0\u05D5 \u05D3\u05D7\u05D5\u05E4\u05D4 (\u05DC\u05DE\u05E9\u05DC \u05DE\u05D9\u05E9\u05D4\u05D5 \u05E6\u05E8\u05D9\u05DA \u05E2\u05D6\u05E8\u05D4, \u05D0\u05D5 \u05E9\u05D0\u05DC\u05D4 \u05E9\u05E0\u05D5\u05D2\u05E2\u05EA \u05DC\u05DB\u05D5\u05DC\u05DD). \u05E9\u05D0\u05DC\u05D4 \u05E1\u05EA\u05DE\u05D9\u05EA \u05D0\u05D5 \u05E9\u05D0\u05DC\u05D4 \u05E9\u05DC \u05E1\u05E7\u05E8\u05E0\u05D5\u05EA \u05D4\u05D9\u05D0 \u05DC\u05D0 \u05D7\u05E9\u05D5\u05D1\u05D4, \u05D5\u05D0\u05EA \u05D6\u05D4 \u05EA\u05E0\u05EA\u05D7 \u05DC\u05E4\u05D9 \u05D4\u05EA\u05D5\u05DB\u05DF; \u05DE\u05D9\u05D3\u05E2 \u05E9\u05D9\u05DE\u05D5\u05E9\u05D9 \u05E9\u05DB\u05D5\u05DC\u05DD \u05E6\u05E8\u05D9\u05DB\u05D9\u05DD \u05DC\u05D3\u05E2\u05EA (\u05DC\u05DE\u05E9\u05DC \u05E9\u05D9\u05E0\u05D5\u05D9 \u05D1\u05E9\u05E2\u05D4 \u05D0\u05D5 \u05D1\u05DE\u05E7\u05D5\u05DD \u05E9\u05DC \u05DE\u05E0\u05D9\u05D9\u05DF); \u05D4\u05D5\u05D3\u05E2\u05D4 \u05E2\u05DC \u05E9\u05D9\u05E0\u05D5\u05D9\u05D9\u05DD \u05D1\u05E7\u05D5 \u05E2\u05E6\u05DE\u05D5.
  \u05D1\u05D3\u05E8\u05DA \u05DB\u05DC\u05DC \u05DC\u05D0 \u05D7\u05E9\u05D5\u05D1 (false), \u05D0\u05D1\u05DC \u05DB\u05D0\u05DF \u05D9\u05E9 \u05DC\u05DA \u05DE\u05E8\u05D7\u05D1 \u05E9\u05D9\u05E7\u05D5\u05DC: \u05D0\u05DD \u05D1\u05D4\u05D5\u05D3\u05E2\u05D4 \u05DE\u05E1\u05D5\u05D9\u05DE\u05EA \u05DE\u05D4\u05E1\u05D5\u05D2\u05D9\u05DD \u05D4\u05D0\u05DC\u05D4 \u05D9\u05E9 \u05DE\u05E9\u05D4\u05D5 \u05E9\u05D1\u05D0\u05DE\u05EA \u05E0\u05D5\u05D2\u05E2 \u05DC\u05DB\u05D5\u05DC\u05DD, \u05D0\u05D5 \u05E9\u05D4\u05D7\u05D1\u05E8'\u05D4 \u05E6\u05E8\u05D9\u05DB\u05D9\u05DD \u05DC\u05E2\u05E9\u05D5\u05EA \u05DE\u05E9\u05D4\u05D5 \u05D1\u05E2\u05E7\u05D1\u05D5\u05EA\u05D9\u05D4, \u05DE\u05D5\u05EA\u05E8 \u05DC\u05DA \u05DC\u05D4\u05D7\u05DC\u05D9\u05D8 \u05E9\u05D4\u05D9\u05D0 \u05D7\u05E9\u05D5\u05D1\u05D4: \u05DE\u05D6\u05DC \u05D8\u05D5\u05D1 \u05DC\u05D7\u05D1\u05E8 (\u05E2\u05DC \u05D0\u05D9\u05E8\u05D5\u05E1\u05D9\u05DF, \u05DC\u05D9\u05D3\u05D4 \u05D5\u05DB\u05D3\u05D5\u05DE\u05D4); \u05D4\u05D5\u05D3\u05E2\u05EA \u05D0\u05D1\u05DC \u05D0\u05D5 \u05E0\u05D9\u05D7\u05D5\u05DD \u05D0\u05D1\u05DC\u05D9\u05DD; \u05DE\u05D1\u05E6\u05E2 \u05D0\u05D5 \u05D4\u05E0\u05D7\u05D4 \u05D1\u05D7\u05E0\u05D5\u05EA; \u05D3\u05D1\u05E8 \u05EA\u05D5\u05E8\u05D4 \u05D0\u05D5 \u05D5\u05D5\u05E8\u05D8; \u05D1\u05D3\u05D9\u05D7\u05D4 \u05D0\u05D5 \u05E1\u05D9\u05E4\u05D5\u05E8 \u05DE\u05E6\u05D7\u05D9\u05E7; \u05D1\u05E8\u05DB\u05D4 \u05DB\u05DC\u05DC\u05D9\u05EA (\u05E9\u05D1\u05EA \u05E9\u05DC\u05D5\u05DD, \u05D7\u05D2 \u05E9\u05DE\u05D7, \u05D2\u05DE\u05E8 \u05D7\u05EA\u05D9\u05DE\u05D4 \u05D8\u05D5\u05D1\u05D4); \u05EA\u05D2\u05D5\u05D1\u05D4 \u05E2\u05DC \u05D4\u05D5\u05D3\u05E2\u05D4 \u05E9\u05DC \u05DE\u05D9\u05E9\u05D4\u05D5 \u05D0\u05D7\u05E8, \u05D4\u05E1\u05DB\u05DE\u05D4 \u05D0\u05D5 \u05D5\u05D9\u05DB\u05D5\u05D7; \u05E9\u05D9\u05D7\u05D4 \u05E4\u05E8\u05D8\u05D9\u05EA \u05D0\u05D5 \u05D4\u05D5\u05D3\u05E2\u05D4 \u05E8\u05D9\u05E7\u05D4.
  \u05D0\u05DD \u05D4\u05D4\u05D5\u05D3\u05E2\u05D4 \u05DC\u05D0 \u05DE\u05EA\u05D0\u05D9\u05DE\u05D4 \u05DC\u05D0\u05E3 \u05D0\u05D7\u05D3 \u05DE\u05D4\u05E1\u05D5\u05D2\u05D9\u05DD, \u05D4\u05D7\u05DC\u05D8 \u05DC\u05E4\u05D9 \u05D4\u05E8\u05D5\u05D7 \u05E9\u05DC \u05D4\u05DB\u05DC\u05DC\u05D9\u05DD: \u05D7\u05E9\u05D5\u05D1 \u05E8\u05E7 \u05D0\u05DD \u05D6\u05D4 \u05DE\u05E9\u05D4\u05D5 \u05E9\u05DB\u05DC \u05D4\u05D7\u05D1\u05E8'\u05D4 \u05E6\u05E8\u05D9\u05DB\u05D9\u05DD \u05DC\u05D3\u05E2\u05EA \u05E2\u05DB\u05E9\u05D9\u05D5 \u05D0\u05D5 \u05DC\u05E2\u05E9\u05D5\u05EA \u05DE\u05E9\u05D4\u05D5 \u05D1\u05E2\u05E7\u05D1\u05D5\u05EA\u05D9\u05D5.
- snark: true \u05D0\u05DD \u05D4\u05D4\u05D5\u05D3\u05E2\u05D4 \u05E2\u05D5\u05E7\u05E6\u05E0\u05D9\u05EA: \u05DC\u05D5\u05E2\u05D2\u05EA, \u05DE\u05EA\u05DC\u05D5\u05E0\u05E0\u05EA \u05D1\u05E6\u05D9\u05E0\u05D9\u05D5\u05EA \u05D0\u05D5 \u05E2\u05D5\u05E7\u05E6\u05EA \u05D0\u05EA \u05D4\u05E7\u05D5, \u05D0\u05EA \u05D4\u05E9\u05E8\u05EA \u05D0\u05D5 \u05D4-AI, \u05D0\u05EA \u05D4\u05DE\u05E0\u05D4\u05DC\u05D9\u05DD \u05D0\u05D5 \u05D7\u05D1\u05E8\u05D9\u05DD \u05D0\u05D7\u05E8\u05D9\u05DD. \u05D0\u05D7\u05E8\u05EA false.
\u05D4\u05D7\u05D6\u05E8 JSON \u05D1\u05DC\u05D1\u05D3: {"transcript":"...","problem":false,"important":true,"snark":false,"reason":"\u05D4\u05E1\u05D1\u05E8 \u05E7\u05E6\u05E8"}`;
  try {
    return await aiAudio(env, { contents: [{ parts: [{ text: prompt }, { inline_data: { mime_type: "audio/wav", data: b64(wav) } }] }], deadline: 3e4 });
  } catch (e) {
    aiTrace.push("classify audio failed: " + e.message);
  }
  const t = cleanupTranscript(await aaiSTT(env, wav, 2e4));
  const r = await aiText(env, {
    system: prompt.replace("\u05EA\u05DE\u05DC\u05DC \u05D0\u05D5\u05EA\u05D4, \u05D5\u05D4\u05D7\u05DC\u05D8:", "\u05E7\u05D9\u05D1\u05DC\u05EA \u05D0\u05EA \u05D4\u05EA\u05DE\u05DC\u05D5\u05DC \u05E9\u05DC\u05D4 (\u05EA\u05DE\u05DC\u05D5\u05DC \u05D0\u05D5\u05D8\u05D5\u05DE\u05D8\u05D9, \u05D9\u05D9\u05EA\u05DB\u05E0\u05D5 \u05E9\u05D2\u05D9\u05D0\u05D5\u05EA \u05E7\u05D8\u05E0\u05D5\u05EA). \u05D4\u05D7\u05DC\u05D8:"),
    contents: [{ role: "user", parts: [{ text: "\u05D4\u05EA\u05DE\u05DC\u05D5\u05DC: " + (t || "(\u05D0\u05D9\u05DF \u05D3\u05D9\u05D1\u05D5\u05E8 \u05D1\u05E8\u05D5\u05E8)") }] }],
    timeout: 2e4,
    deadline: 45e3
  });
  r.transcript = t;
  return r;
}
__name(classify, "classify");
async function loadState(env) {
  const r = await ym(env, "GetTextFile", { what: "ivr2:/AIFlags.json" });
  try {
    return JSON.parse(r.contents);
  } catch {
    return { jobs: [], active: {} };
  }
}
__name(loadState, "loadState");
var saveState = /* @__PURE__ */ __name((env, s) => ym(env, "UploadTextFile", { what: "ivr2:/AIFlags.json", contents: JSON.stringify(s) }), "saveState");
async function addFlags(env, phones, flag) {
  const s = await loadState(env);
  for (const p of phones) s.jobs.push([p, flag]);
  await saveState(env, s);
}
__name(addFlags, "addFlags");
async function membersFor(env, list) {
  const phones = await listPhones(env, list);
  if (env.TEST_MODE !== "1") return phones;
  const admins = await listPhones(env, "admins");
  return phones.filter((p) => admins.includes(p));
}
__name(membersFor, "membersFor");
async function processFlags(env, budget = 44) {
  const s = await loadState(env);
  let changed = false;
  while (s.jobs.length && used < budget) {
    const [phone, flag] = s.jobs.shift();
    changed = true;
    s.active[phone] = s.active[phone] || {};
    if (!s.active[phone][flag])
      await ym(env, "FileAction", { action: "copy", what: "ivr2:" + FLAG_TEMPLATE, target: `ivr2:/${flag}/Phone/${phone}/000.wav` });
    s.active[phone][flag] = nowIL();
  }
  if (changed) await saveState(env, s);
}
__name(processFlags, "processFlags");
async function clearFlags(env) {
  const s = await loadState(env);
  const phones = Object.keys(s.active).filter((p) => Object.keys(s.active[p]).length);
  if (!phones.length) return;
  const month = nowIL().slice(0, 7);
  const r = await ym(env, "GetTextFile", { what: `ivr2:/Log/LogFolderEnterExit-${month}.ymgr` });
  const seen = {};
  for (const line of (r && r.contents || "").split("\n")) {
    const d = Object.fromEntries(line.split("%").map((x) => x.split("#")));
    if (!d.Phone || !d.EnterDate) continue;
    const [dd, mm, yy] = d.EnterDate.split("/");
    const t = `${yy}-${mm}-${dd} ${d.EnterTime}`;
    const k = d.Phone + "|" + d.Folder;
    if (!seen[k] || seen[k] < t) seen[k] = t;
  }
  let changed = false;
  for (const p of phones) for (const [flag, ts] of Object.entries(s.active[p])) {
    const t = seen[p + "|main"];
    if (t && t > ts && used < 45) {
      await ym(env, "FileAction", { action: "delete", what: `ivr2:/${flag}/Phone/${p}/000.wav` });
      delete s.active[p][flag];
      changed = true;
    }
  }
  if (changed) await saveState(env, s);
}
__name(clearFlags, "clearFlags");
async function handleFile(env, f, kind) {
  const src = QUEUES[kind] + "/" + f.name, who = f.phone || "?";
  let v, result;
  const lockKey = "lock:" + src + ":" + (f.mtime || f.date || "");
  if (env.KV) {
    if (await env.KV.get(lockKey)) return "\u05DB\u05D1\u05E8 \u05D1\u05D8\u05D9\u05E4\u05D5\u05DC";
    await env.KV.put(lockKey, "1", { expirationTtl: 300 });
  }
  const watch = await kvGet(env, "watch", {}), w = watch[f.phone];
  if (w && w.drop > 0) {
    await ym(env, "FileAction", { action: "delete", what: "ivr2:" + src });
    w.drop--;
    await env.KV.put("watch", JSON.stringify(watch));
    await log(env, `${f.name} \u05DE-${who}: \u05E0\u05DE\u05D7\u05E7\u05D4 \u05D0\u05D5\u05D8\u05D5\u05DE\u05D8\u05D9\u05EA \u05DC\u05E4\u05D9 \u05D1\u05E7\u05E9\u05EA \u05D4\u05DE\u05E0\u05D4\u05DC`);
    return "\u05E0\u05DE\u05D7\u05E7\u05D4";
  }
  if (w && w.hold && (!w.until || w.until > Date.now())) {
    await move(env, src, kind === "important" ? P.problem : P.general);
    await ym(env, "RunTzintuk", { phones: "tzl:admins" });
    await log(env, `${f.name} \u05DE-${who}: \u05D4\u05DE\u05E7\u05DC\u05D9\u05D8 \u05D1\u05E4\u05D9\u05E7\u05D5\u05D7, \u05D4\u05D4\u05D5\u05D3\u05E2\u05D4 \u05DE\u05D7\u05DB\u05D4 \u05DC\u05D0\u05D9\u05E9\u05D5\u05E8 \u05DE\u05E0\u05D4\u05DC \u05D1\u05E9\u05DC\u05D5\u05D7\u05D4 7-4`);
    return "\u05D1\u05E4\u05D9\u05E7\u05D5\u05D7";
  }
  if (kind === "general") return publishGeneral(env, f, src);
  try {
    const wav = await ym(env, "DownloadFile", { path: "ivr2:" + src });
    if (wav.length < 1e3) throw new Error("\u05D4\u05E7\u05D5\u05D1\u05E5 \u05DC\u05D0 \u05E0\u05DE\u05E6\u05D0");
    v = await classify(env, wav);
    if (typeof v.important !== "boolean" && typeof v.problem !== "boolean") throw new Error("\u05EA\u05E9\u05D5\u05D1\u05D4 \u05DC\u05D0 \u05EA\u05E7\u05D9\u05E0\u05D4 \u05DE\u05D4\u05D1\u05D9\u05E0\u05D4 \u05D4\u05DE\u05DC\u05D0\u05DB\u05D5\u05EA\u05D9\u05EA");
    if (!(await queueFiles(env, kind)).some((x) => x.name === f.name)) return "\u05DB\u05D1\u05E8 \u05D8\u05D5\u05E4\u05DC\u05D4";
  } catch (e) {
    await move(env, src, kind === "important" ? P.error : P.general);
    await tzintuk(env, "admins");
    await log(env, `\u05E9\u05D2\u05D9\u05D0\u05D4 \u05D1-${f.name} \u05DE-${who}: ${e.message}. \u05D4\u05D5\u05E2\u05D1\u05E8\u05D4 \u05DC\u05D0\u05D9\u05E9\u05D5\u05E8 \u05DE\u05E0\u05D4\u05DC.`);
    return "error";
  }
  const toArchive = /* @__PURE__ */ __name(async (name) => {
    if (!env.KV || !name) return;
    const a = await kvGet(env, "archive", {});
    a[name] = { p: f.phone || "", n: names(env)[f.phone] || "", d: f.date || f.mtime || "", t: v.transcript || "", s: "g" };
    await env.KV.put("archive", JSON.stringify(a));
  }, "toArchive");
  const strict = env.KV ? await kvGet(env, "strict", []) : [];
  if (strict.includes(f.phone)) {
    await move(env, src, kind === "important" ? P.problem : P.general);
    await ym(env, "RunTzintuk", { phones: "tzl:admins" });
    await log(env, `${f.name} \u05DE-${who} (${names(env)[f.phone] || ""}): \u05E4\u05D9\u05E7\u05D5\u05D7 \u05DE\u05D5\u05D2\u05D1\u05E8, \u05D4\u05D4\u05D5\u05D3\u05E2\u05D4 \u05DE\u05DE\u05EA\u05D9\u05E0\u05D4 \u05DC\u05D0\u05D9\u05E9\u05D5\u05E8 \u05DE\u05E0\u05D4\u05DC \u05D1\u05E9\u05DC\u05D5\u05D7\u05D4 7-4-${kind === "important" ? 1 : 2}. \u05D7\u05D5\u05D5\u05EA \u05D3\u05E2\u05EA \u05D4-AI: ${v.problem ? "\u05D9\u05E9 \u05D7\u05E9\u05E9 \u05DC\u05EA\u05D5\u05DB\u05DF \u05D1\u05E2\u05D9\u05D9\u05EA\u05D9" : "\u05DC\u05D0 \u05E0\u05DE\u05E6\u05D0 \u05EA\u05D5\u05DB\u05DF \u05D1\u05E2\u05D9\u05D9\u05EA\u05D9"}. \u05E1\u05D9\u05D1\u05D4: ${v.reason}. \u05EA\u05DE\u05DC\u05D5\u05DC: ${v.transcript}`);
    return "\u05E4\u05D9\u05E7\u05D5\u05D7 \u05DE\u05D5\u05D2\u05D1\u05E8";
  }
  if (kind === "general") {
    if (v.problem) {
      await move(env, src, P.general);
      await ym(env, "RunTzintuk", { phones: "tzl:admins" });
      result = "\u05D4\u05D5\u05D3\u05E2\u05D4 \u05E8\u05D2\u05D9\u05DC\u05D4 \u05D4\u05D5\u05E2\u05D1\u05E8\u05D4 \u05DC\u05D0\u05D9\u05E9\u05D5\u05E8 \u05DE\u05E0\u05D4\u05DC";
    } else {
      await toArchive(await move(env, src, ALL));
      await tzintuk(env, "general");
      await addFlags(env, await membersFor(env, "general"), "NRegular");
      result = "\u05D4\u05D5\u05D3\u05E2\u05D4 \u05E8\u05D2\u05D9\u05DC\u05D4 \u05E2\u05DC\u05EA\u05D4 \u05D5\u05E0\u05E9\u05DC\u05D7 \u05E6\u05D9\u05E0\u05EA\u05D5\u05E7";
    }
  } else if (v.problem) {
    await move(env, src, P.problem);
    await ym(env, "RunTzintuk", { phones: "tzl:admins" });
    result = "\u05D4\u05D5\u05D3\u05E2\u05D4 \u05D7\u05E9\u05D5\u05D1\u05D4 \u05D4\u05D5\u05E2\u05D1\u05E8\u05D4 \u05DC\u05D0\u05D9\u05E9\u05D5\u05E8 \u05DE\u05E0\u05D4\u05DC (\u05D7\u05E9\u05E9 \u05DC\u05EA\u05D5\u05DB\u05DF \u05D1\u05E2\u05D9\u05D9\u05EA\u05D9)";
  } else if (!v.important) {
    const allName = await move(env, src, ALL, "copy");
    await toArchive(allName);
    await addIntro(env, f.phone, `${ALL}/${allName}`).catch(() => {
    });
    await tzintuk(env, "general");
    await addFlags(env, await membersFor(env, "general"), "NRegular");
    const pend = await move(env, src, P.demoted);
    await ym(env, "RunTzintuk", { phones: "tzl:admins" });
    if (env.KV) {
      const map = await kvGet(env, "demap", {});
      map[pend] = allName;
      await env.KV.put("demap", JSON.stringify(map));
    }
    result = "\u05E1\u05D5\u05DE\u05E0\u05D4 \u05DB\u05D7\u05E9\u05D5\u05D1\u05D4 \u05D0\u05D1\u05DC \u05D4-AI \u05D4\u05E2\u05D1\u05D9\u05E8 \u05DC\u05E8\u05D2\u05D9\u05DC\u05D5\u05EA. \u05D4\u05DE\u05E0\u05D4\u05DC \u05D9\u05DB\u05D5\u05DC \u05DC\u05D4\u05E2\u05D1\u05D9\u05E8 \u05DC\u05D7\u05E9\u05D5\u05D1\u05D5\u05EA";
  } else {
    const an = await move(env, src, ALL, "copy");
    await toArchive(an);
    const imn = await move(env, src, IMPORTANT);
    await addIntro(env, f.phone, `${ALL}/${an}`).catch(() => {
    });
    await addIntro(env, f.phone, `${IMPORTANT}/${imn}`).catch(() => {
    });
    await tzintuk(env, "members");
    await addFlags(env, await membersFor(env, "members"), "NImportant");
    result = "\u05D0\u05D5\u05E9\u05E8\u05D4 \u05DB\u05D7\u05E9\u05D5\u05D1\u05D4 \u05D5\u05E0\u05E9\u05DC\u05D7 \u05E6\u05D9\u05E0\u05EA\u05D5\u05E7";
  }
  await log(env, `${f.name} \u05DE-${who}: ${result}. \u05E1\u05D9\u05D1\u05D4: ${v.reason}. \u05EA\u05DE\u05DC\u05D5\u05DC: ${v.transcript}`);
  if (!v.problem) await maybeRetort(env, f.phone, v).catch((e) => log(env, "\u05E9\u05D2\u05D9\u05D0\u05D4 \u05D1\u05EA\u05D2\u05D5\u05D1\u05EA \u05D4\u05E2\u05D5\u05D6\u05E8: " + e.message));
  return result;
}
__name(handleFile, "handleFile");
async function addIntro(env, phone, path) {
  const map = await kvGet(env, "intro", {}), src = map[phone];
  if (!src) return false;
  const [a, b] = await Promise.all([ym(env, "DownloadFile", { path: "ivr2:" + src }), ym(env, "DownloadFile", { path: "ivr2:" + path })]);
  const x = wavSamples(a), y = wavSamples(b);
  if (!x || !y || x.sr !== y.sr) return false;
  const om = await kvGet(env, "outro", {});
  let z = null;
  if (om[phone]) {
    try {
      z = wavSamples(await ym(env, "DownloadFile", { path: "ivr2:" + om[phone] }));
    } catch {
      z = null;
    }
    if (z && z.sr !== x.sr) z = null;
  }
  const gap = new Int16Array(Math.round(x.sr * 0.4)), zl = z ? gap.length + z.s.length : 0, all = new Int16Array(x.s.length + gap.length + y.s.length + zl);
  all.set(x.s, 0);
  all.set(gap, x.s.length);
  all.set(y.s, x.s.length + gap.length);
  if (z) all.set(z.s, x.s.length + gap.length + y.s.length + gap.length);
  const bytes = new Uint8Array(all.buffer), out = new Uint8Array(44 + bytes.length), v = new DataView(out.buffer);
  const str = /* @__PURE__ */ __name((o, t) => {
    for (let i = 0; i < t.length; i++) out[o + i] = t.charCodeAt(i);
  }, "str");
  str(0, "RIFF");
  v.setUint32(4, 36 + bytes.length, true);
  str(8, "WAVEfmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, x.sr, true);
  v.setUint32(28, x.sr * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  str(36, "data");
  v.setUint32(40, bytes.length, true);
  out.set(bytes, 44);
  const meta = path.replace(/\.wav$/, ".txt");
  const orig = await ym(env, "GetTextFile", { what: "ivr2:" + meta }).then((r) => r.contents || "").catch(() => "");
  await ymUpload(env, path, out);
  if (/^Record-/.test(orig)) await ym(env, "UploadTextFile", { what: "ivr2:" + meta, contents: orig });
  return true;
}
__name(addIntro, "addIntro");
var stripIntro = /* @__PURE__ */ __name((t) => {
  const s = String(t || ""), i = s.indexOf("\u05DE\u05E8\u05EA\u05E7\u05D9\u05DD");
  if (i < 0 || i > 200) return s;
  const j = s.indexOf("\u05D4\u05D0\u05D6\u05D9\u05E0\u05D5", i);
  return (j > 0 && j < i + 40 ? s.slice(j + 6) : s.slice(i + 12)).replace(/^[\s!.,]+/, "");
}, "stripIntro");
async function publishGeneral(env, f, src) {
  const allName = await move(env, src, ALL);
  await addIntro(env, f.phone, `${ALL}/${allName}`).catch((e) => aiTrace.push("intro: " + e.message));
  await tzintuk(env, "general");
  await addFlags(env, await membersFor(env, "general"), "NRegular");
  const pc = await kvGet(env, "postcheck", {});
  pc[allName] = { p: f.phone || "", d: f.date || f.mtime || "", t: Date.now() };
  await env.KV.put("postcheck", JSON.stringify(pc));
  await log(env, `${f.name} \u05DE-${f.phone || "?"}: \u05D4\u05D5\u05D3\u05E2\u05D4 \u05E8\u05D2\u05D9\u05DC\u05D4 \u05E2\u05DC\u05EA\u05D4 \u05DE\u05D9\u05D3 (${allName}) \u05D5\u05E0\u05E9\u05DC\u05D7 \u05E6\u05D9\u05E0\u05EA\u05D5\u05E7. \u05D4-AI \u05D1\u05D5\u05D3\u05E7 \u05D0\u05D5\u05EA\u05D4 \u05E2\u05DB\u05E9\u05D9\u05D5`);
  try {
    await postCheck(env, allName);
  } catch (e) {
    aiTrace.push("postcheck: " + e.message);
  }
  return "\u05D4\u05D5\u05D3\u05E2\u05D4 \u05E8\u05D2\u05D9\u05DC\u05D4 \u05E2\u05DC\u05EA\u05D4 \u05DE\u05D9\u05D3";
}
__name(publishGeneral, "publishGeneral");
async function postCheck(env, allName) {
  const pc = await kvGet(env, "postcheck", {}), it = pc[allName];
  if (!it) return;
  const lk = "pclock:" + allName;
  if (await env.KV.get(lk)) return;
  await env.KV.put(lk, "1", { expirationTtl: 600 });
  const done = /* @__PURE__ */ __name(async () => {
    const p2 = await kvGet(env, "postcheck", {});
    delete p2[allName];
    await env.KV.put("postcheck", JSON.stringify(p2));
  }, "done");
  const wav = await ym(env, "DownloadFile", { path: "ivr2:" + ALL + "/" + allName });
  if (wav.length < 1e3) return done();
  const v = await classify(env, wav);
  if (typeof v.problem !== "boolean") throw new Error("\u05EA\u05E9\u05D5\u05D1\u05D4 \u05DC\u05D0 \u05EA\u05E7\u05D9\u05E0\u05D4");
  if ((await kvGet(env, "intro", {}))[it.p]) v.transcript = stripIntro(v.transcript);
  const who = it.p + (names(env)[it.p] ? " (" + names(env)[it.p] + ")" : "");
  if (v.problem) {
    const pend = await move(env, ALL + "/" + allName, P.general);
    await ym(env, "RunTzintuk", { phones: "tzl:admins" });
    await log(env, `${allName} \u05DE-${who}: \u05D4-AI \u05D4\u05D5\u05E8\u05D9\u05D3 \u05DE\u05D4\u05E7\u05D5 \u05D4\u05D5\u05D3\u05E2\u05D4 \u05E8\u05D2\u05D9\u05DC\u05D4 (\u05D0\u05E4\u05E9\u05E8 \u05DC\u05D4\u05D7\u05D6\u05D9\u05E8 \u05D0\u05D5\u05EA\u05D4 \u05D1\u05E9\u05DC\u05D5\u05D7\u05D4 7-4-2 \u05DB-${pend}). \u05E1\u05D9\u05D1\u05D4: ${v.reason}. \u05EA\u05DE\u05DC\u05D5\u05DC: ${v.transcript}`);
  } else {
    const a = await kvGet(env, "archive", {});
    a[allName] = { p: it.p, n: names(env)[it.p] || "", d: it.d, t: v.transcript || "", s: "g" };
    await env.KV.put("archive", JSON.stringify(a));
    await log(env, `${allName} \u05DE-${who}: \u05D4\u05D5\u05D3\u05E2\u05D4 \u05E8\u05D2\u05D9\u05DC\u05D4 \u05E0\u05D1\u05D3\u05E7\u05D4 \u05D5\u05E0\u05E9\u05D0\u05E8\u05EA \u05D1\u05E7\u05D5. \u05EA\u05DE\u05DC\u05D5\u05DC: ${v.transcript}`);
    await maybeRetort(env, it.p, v).catch((e) => log(env, "\u05E9\u05D2\u05D9\u05D0\u05D4 \u05D1\u05EA\u05D2\u05D5\u05D1\u05EA \u05D4\u05E2\u05D5\u05D6\u05E8: " + e.message));
  }
  await done();
}
__name(postCheck, "postCheck");
async function nextFileNum(env, folder) {
  let max = -1;
  for (const from of [0, 1e3, 2e3]) {
    const d = await ym(env, "GetIVR2Dir", { path: "ivr2:" + folder, filesFrom: from, filesLimit: 1e3 });
    const fs = d.files || [];
    for (const f of fs) if (/^\d+\./.test(f.name)) max = Math.max(max, parseInt(f.name, 10));
    if (fs.length < 1e3) break;
  }
  return max + 1;
}
__name(nextFileNum, "nextFileNum");
async function runScheduled(env) {
  const jobs = await kvGet(env, "scheduled", []);
  const now = nowIL(), due = jobs.filter((j) => !j.done && j.at <= now);
  if (!due.length) return;
  if (await env.KV.get("schedlock")) return;
  await env.KV.put("schedlock", "1", { expirationTtl: 120 });
  for (const j of due) {
    j.done = now;
  }
  await env.KV.put("scheduled", JSON.stringify(jobs));
  for (const j of due) {
    try {
      if (j.type === "shoeva") {
        const ns = Object.values(await rsvpLoad(env)).sort((a, b) => a.ts > b.ts ? 1 : -1).map((x) => x.n);
        const text = `${j.intro || "\u05EA\u05D6\u05DB\u05D5\u05E8\u05EA \u05D7\u05E9\u05D5\u05D1\u05D4: \u05E9\u05DE\u05D7\u05EA \u05D1\u05D9\u05EA \u05D4\u05E9\u05D5\u05D0\u05D1\u05D4 \u05D1\u05D9\u05D5\u05DD \u05E8\u05D0\u05E9\u05D5\u05DF \u05D0\u05E6\u05DC \u05E1\u05D8\u05E4\u05E0\u05E1\u05E7\u05D9!"} \u05E2\u05D3 \u05E2\u05DB\u05E9\u05D9\u05D5 \u05E0\u05E8\u05E9\u05DE\u05D5 ${ns.length} \u05D1\u05D7\u05D5\u05E8\u05D9\u05DD: ${ns.join(", ")}. \u05DE\u05D9 \u05E9\u05E2\u05D5\u05D3 \u05DC\u05D0 \u05E0\u05E8\u05E9\u05DD, \u05D1\u05D1\u05E7\u05E9\u05D4 \u05EA\u05D9\u05E8\u05E9\u05DE\u05D5 \u05DB\u05D1\u05E8 \u05E2\u05DB\u05E9\u05D9\u05D5, \u05DB\u05D3\u05D9 \u05E9\u05E0\u05D3\u05E2 \u05D1\u05D3\u05D9\u05D5\u05E7 \u05DB\u05DE\u05D4 \u05D0\u05E0\u05D7\u05E0\u05D5 \u05D5\u05E0\u05EA\u05DB\u05D5\u05E0\u05DF \u05DB\u05DE\u05D5 \u05E9\u05E6\u05E8\u05D9\u05DA: \u05D1\u05EA\u05E4\u05E8\u05D9\u05D8 \u05D4\u05E8\u05D0\u05E9\u05D9 \u05DE\u05E7\u05D9\u05E9\u05D9\u05DD 9 \u05D5\u05D0\u05D6 1. \u05DE\u05D7\u05DB\u05D9\u05DD \u05DC\u05DB\u05D5\u05DC\u05DD!`;
        await postVoice(env, [IMPORTANT, ALL], text);
        used = 0;
        await tzintuk(env, "members");
        await addFlags(env, await membersFor(env, "members"), "NImportant");
        await processFlags(env);
        await log(env, `\u05E0\u05E9\u05DC\u05D7\u05D4 \u05D4\u05D4\u05D5\u05D3\u05E2\u05D4 \u05D4\u05DE\u05EA\u05D5\u05D6\u05DE\u05E0\u05EA \u05E2\u05DC \u05E9\u05DE\u05D7\u05EA \u05D1\u05D9\u05EA \u05D4\u05E9\u05D5\u05D0\u05D1\u05D4 (${ns.length} \u05E0\u05E8\u05E9\u05DE\u05D9\u05DD) \u05E2\u05DD \u05E6\u05D9\u05E0\u05EA\u05D5\u05E7 \u05DC\u05DB\u05DC \u05D4\u05D7\u05D1\u05E8\u05D9\u05DD`);
      }
      if (j.type === "post") {
        await postVoice(env, j.important ? [IMPORTANT, ALL] : [ALL], j.text);
        used = 0;
        if (j.important) {
          await tzintuk(env, "members").catch(() => {
          });
          await addFlags(env, await membersFor(env, "members"), "NImportant").catch(() => {
          });
        } else await notify(env, "regular").catch(() => {
        });
        await processFlags(env).catch(() => {
        });
        await log(env, `\u05D9\u05E6\u05D0\u05D4 \u05D4\u05D4\u05D5\u05D3\u05E2\u05D4 \u05D4\u05DE\u05EA\u05D5\u05D6\u05DE\u05E0\u05EA (${j.important ? "\u05D7\u05E9\u05D5\u05D1\u05D4" : "\u05E8\u05D2\u05D9\u05DC\u05D4"}): ${j.text}`);
      }
      if (j.type === "remind") {
        const folder = "/personalMessages/Phone/" + j.phone, text = "\u05EA\u05D6\u05DB\u05D5\u05E8\u05EA \u05DE\u05D4\u05E2\u05D5\u05D6\u05E8 \u05D4\u05D7\u05DB\u05DD: " + j.text;
        const pcm = await geminiTTS(env, text, 2e4) || await elevenTTS(env, text, 15e3), fname = await nextName(env, folder, pcm ? "wav" : "tts");
        if (pcm) await ymUpload(env, `${folder}/${fname}`, pcmToWav(pcm));
        else {
          await ensureDir(env, folder, false);
          await ym(env, "UploadTextFile", { what: `ivr2:${folder}/${fname}`, contents: text });
        }
        await log(env, `\u05D4\u05EA\u05D6\u05DB\u05D5\u05E8\u05EA \u05E9\u05DC ${names(env)[j.phone] || j.phone} \u05D4\u05D5\u05E9\u05D0\u05E8\u05D4 \u05D1\u05EA\u05D9\u05D1\u05D4 \u05D4\u05D0\u05D9\u05E9\u05D9\u05EA \u05E9\u05DC\u05D5: ${j.text}`);
      }
      if (j.type === "tz") {
        const r = await tzintuk(env, j.list || "members");
        await log(env, `\u05D9\u05E6\u05D0 \u05E6\u05D9\u05E0\u05EA\u05D5\u05E7 \u05DE\u05EA\u05D5\u05D6\u05DE\u05DF \u05DC\u05E8\u05E9\u05D9\u05DE\u05EA ${j.list || "members"}${r && r.deferred ? " (\u05E0\u05D3\u05D7\u05D4 \u05DC\u05DE\u05D5\u05E6\u05D0\u05D9 \u05E9\u05D1\u05EA/\u05D7\u05D2)" : ""}`);
      }
      if (j.type === "entry") await doAdmin(env, { type: "entry", text: j.text }, j.by || OWNER, "\u05EA\u05D6\u05DE\u05D5\u05DF \u05DE\u05D3\u05E3 \u05D4\u05E0\u05D9\u05D4\u05D5\u05DC");
      if (j.type === "pm") {
        const phones = (j.phones || []).filter((p) => /^0\d{8,9}$/.test(p)), pcm = phones.length ? await ttsLong(env, j.text) : null;
        if (!pcm) throw new Error("\u05D4\u05E7\u05D5\u05DC \u05E9\u05DC \u05D4\u05E2\u05D5\u05D6\u05E8 \u05DC\u05D0 \u05D6\u05DE\u05D9\u05DF, \u05D4\u05D4\u05D5\u05D3\u05E2\u05D4 \u05D4\u05D0\u05D9\u05E9\u05D9\u05EA \u05D4\u05DE\u05EA\u05D5\u05D6\u05DE\u05E0\u05EA \u05DC\u05D0 \u05D9\u05E6\u05D0\u05D4");
        const bid = "s" + Date.now().toString(36);
        await env.KV.put("bc:" + bid, to8k(pcmTrim(pcm)).buffer, { expirationTtl: 3 * 86400 });
        await bgAdd(env, [...phones.map((p) => ({ k: "bc", id: bid, p })), { k: "log", line: `\u05D4\u05D4\u05D5\u05D3\u05E2\u05D4 \u05D4\u05D0\u05D9\u05E9\u05D9\u05EA \u05D4\u05DE\u05EA\u05D5\u05D6\u05DE\u05E0\u05EA \u05D4\u05D5\u05E9\u05D0\u05E8\u05D4 \u05D0\u05E6\u05DC ${phones.length} \u05D7\u05D1\u05E8\u05D9\u05DD: ${j.text}` }]);
      }
    } catch (e) {
      await log(env, "\u05E9\u05D2\u05D9\u05D0\u05D4 \u05D1\u05D4\u05D5\u05D3\u05E2\u05D4 \u05DE\u05EA\u05D5\u05D6\u05DE\u05E0\u05EA: " + e.message);
    }
  }
  const again = due.filter((j) => j.every === "day" || j.every === "week");
  if (again.length) {
    const all = await kvGet(env, "scheduled", []);
    for (const j of again) {
      const next = /* @__PURE__ */ new Date(j.at.replace(" ", "T") + ":00Z"), step = j.every === "week" ? 7 : 1, nowAt = nowIL().slice(0, 16);
      let at;
      do {
        next.setUTCDate(next.getUTCDate() + step);
        at = next.toISOString().slice(0, 16).replace("T", " ");
      } while (at <= nowAt);
      if (!j.until || at <= j.until) all.push({ ...j, id: "j" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), at, done: void 0 });
    }
    await env.KV.put("scheduled", JSON.stringify(all));
  }
}
__name(runScheduled, "runScheduled");
async function weeklySummary(env, dry = false) {
  const line = await loadLine(env);
  const now = /* @__PURE__ */ new Date(nowIL().replace(" ", "T") + "Z"), from = new Date(now.getTime() - 7 * 864e5);
  const cut = from.toISOString().slice(0, 16).replace("T", " ");
  const week = line.msgs.filter((m) => sortable(m.d) >= cut);
  if (week.length < 3) return { skipped: "\u05DE\u05E2\u05D8 \u05DE\u05D3\u05D9 \u05D4\u05D5\u05D3\u05E2\u05D5\u05EA \u05D4\u05E9\u05D1\u05D5\u05E2", count: week.length };
  const system = `\u05D0\u05EA\u05D4 \u05D4\u05E2\u05D5\u05D6\u05E8 \u05D4\u05D7\u05DB\u05DD \u05E9\u05DC \u05E7\u05D5 \u05D8\u05DC\u05E4\u05D5\u05E0\u05D9 \u05E9\u05DC \u05E7\u05D1\u05D5\u05E6\u05EA \u05D1\u05D7\u05D5\u05E8\u05D9 \u05D9\u05E9\u05D9\u05D1\u05D4 \u05DE\u05D4\u05E6\u05D9\u05D1\u05D5\u05E8 \u05D4\u05D7\u05E8\u05D3\u05D9. \u05DB\u05EA\u05D5\u05D1 \u05E1\u05D9\u05DB\u05D5\u05DD \u05E9\u05D1\u05D5\u05E2\u05D9 \u05E7\u05D5\u05DC\u05D9 \u05E9\u05DC \u05DE\u05D4 \u05E9\u05D4\u05D9\u05D4 \u05D1\u05E7\u05D5 \u05D4\u05E9\u05D1\u05D5\u05E2, \u05E9\u05D9\u05D5\u05E7\u05E8\u05D0 \u05D1\u05E7\u05D5\u05DC \u05DC\u05DB\u05DC \u05D4\u05D7\u05D1\u05E8'\u05D4.
\u05DB\u05DC\u05DC\u05D9\u05DD:
- \u05D1\u05E1\u05D2\u05E0\u05D5\u05DF \u05E6\u05D9\u05D1\u05E6\u05E8: \u05D1\u05D7\u05D5\u05E8 \u05D9\u05E9\u05D9\u05D1\u05D4 \u05E8\u05D2\u05D5\u05E2, \u05D6\u05D5\u05E8\u05DD, \u05E7\u05DC\u05D9\u05DC \u05D5\u05DE\u05E6\u05D7\u05D9\u05E7, \u05D1\u05E9\u05E4\u05D4 \u05E9\u05DC \u05D1\u05D7\u05D5\u05E8\u05D9 \u05D9\u05E9\u05D9\u05D1\u05D4 ("\u05D0\u05D7\u05D9", "\u05D5\u05D5\u05D0\u05DC\u05D4", "\u05EA\u05DB\u05DC\u05E1"). \u05D1\u05DC\u05D9 \u05E9\u05D5\u05DD \u05D0\u05D6\u05DB\u05D5\u05E8 \u05E9\u05DC \u05E1\u05DE\u05D9\u05DD \u05D0\u05D5 \u05E2\u05D9\u05E9\u05D5\u05DF.
- \u05EA\u05EA\u05D7\u05D9\u05DC \u05D1"\u05E9\u05D1\u05D5\u05E2 \u05D8\u05D5\u05D1 \u05D7\u05D1\u05E8'\u05D4" \u05D5\u05DE\u05E9\u05E4\u05D8 \u05E4\u05EA\u05D9\u05D7\u05D4 \u05E7\u05DC\u05D9\u05DC, \u05D5\u05D0\u05D6 \u05E2\u05D1\u05D5\u05E8 \u05E2\u05DC \u05D4\u05E0\u05D5\u05E9\u05D0\u05D9\u05DD \u05D4\u05DE\u05E8\u05DB\u05D6\u05D9\u05D9\u05DD \u05E9\u05DC \u05D4\u05E9\u05D1\u05D5\u05E2: \u05D0\u05D9\u05E8\u05D5\u05E2\u05D9\u05DD, \u05D4\u05D5\u05D3\u05E2\u05D5\u05EA \u05D7\u05E9\u05D5\u05D1\u05D5\u05EA, \u05D1\u05E7\u05E9\u05D5\u05EA, \u05D5\u05E8\u05D2\u05E2\u05D9\u05DD \u05DE\u05E6\u05D7\u05D9\u05E7\u05D9\u05DD. \u05EA\u05D6\u05DB\u05D9\u05E8 \u05DE\u05D9 \u05D0\u05DE\u05E8 \u05DE\u05D4 \u05D1\u05E9\u05DE\u05D5\u05EA, \u05D1\u05D7\u05D9\u05D1\u05D4.
- \u05DE\u05D5\u05EA\u05E8 \u05DC\u05E2\u05E7\u05D5\u05E5 \u05D1\u05D7\u05D9\u05D1\u05D4, \u05E8\u05E7 \u05E6\u05D7\u05D5\u05E7 \u05E9\u05D2\u05DD \u05D4\u05D7\u05D1\u05E8 \u05E2\u05E6\u05DE\u05D5 \u05D4\u05D9\u05D4 \u05E6\u05D5\u05D7\u05E7 \u05DE\u05DE\u05E0\u05D5. \u05D1\u05DC\u05D9 \u05DC\u05E9\u05D5\u05DF \u05D4\u05E8\u05E2, \u05D1\u05DC\u05D9 \u05DC\u05D4\u05E9\u05E4\u05D9\u05DC, \u05D5\u05D1\u05DC\u05D9 \u05DC\u05D7\u05E9\u05D5\u05E3 \u05D3\u05D1\u05E8\u05D9\u05DD \u05E4\u05E8\u05D8\u05D9\u05D9\u05DD \u05D0\u05D5 \u05DE\u05D1\u05D9\u05DB\u05D9\u05DD.
- \u05DC\u05E9\u05D5\u05DF \u05E0\u05E7\u05D9\u05D9\u05D4. \u05D1\u05DC\u05D9 \u05DC\u05E6\u05D8\u05D8 \u05DE\u05D9\u05DC\u05D4 \u05D1\u05DE\u05D9\u05DC\u05D4, \u05E8\u05E7 \u05D1\u05DE\u05D9\u05DC\u05D9\u05DD \u05E9\u05DC\u05DA.
- \u05D0\u05DC \u05EA\u05DE\u05E6\u05D9\u05D0 \u05E9\u05D5\u05DD \u05D3\u05D1\u05E8 \u05E9\u05DC\u05D0 \u05DE\u05D5\u05E4\u05D9\u05E2 \u05D1\u05D4\u05D5\u05D3\u05E2\u05D5\u05EA.
- \u05D0\u05D5\u05E8\u05DA: \u05D1\u05E2\u05E8\u05DA 150 \u05E2\u05D3 220 \u05DE\u05D9\u05DC\u05D9\u05DD. \u05DE\u05E9\u05E4\u05D8\u05D9\u05DD \u05E7\u05E6\u05E8\u05D9\u05DD, \u05D1\u05DC\u05D9 \u05E8\u05E9\u05D9\u05DE\u05D5\u05EA, \u05D1\u05DC\u05D9 \u05D0\u05D9\u05DE\u05D5\u05D2'\u05D9.
- \u05EA\u05E1\u05D9\u05D9\u05DD \u05D1\u05DE\u05E9\u05E4\u05D8 \u05E1\u05D9\u05D5\u05DD \u05E7\u05DC\u05D9\u05DC \u05D5\u05D1\u05D1\u05E8\u05DB\u05D4.
\u05D4\u05D7\u05D6\u05E8 JSON \u05D1\u05DC\u05D1\u05D3: {"summary":"\u05D4\u05D8\u05E7\u05E1\u05D8"}`;
  const text = `\u05D4\u05D4\u05D5\u05D3\u05E2\u05D5\u05EA \u05E9\u05DC \u05D4\u05E9\u05D1\u05D5\u05E2 (${week.length} \u05D4\u05D5\u05D3\u05E2\u05D5\u05EA), \u05DE\u05D4\u05D9\u05E9\u05E0\u05D4 \u05DC\u05D7\u05D3\u05E9\u05D4:
` + week.map(msgLine).join("\n").slice(0, 6e4);
  const r = await aiText(env, { system, contents: [{ role: "user", parts: [{ text }] }], timeout: 4e4, deadline: 6e4 });
  const summary = String(r.summary || r.answer || "").trim();
  if (!summary) throw new Error("\u05DC\u05D0 \u05D4\u05EA\u05E7\u05D1\u05DC \u05E1\u05D9\u05DB\u05D5\u05DD");
  if (dry) return { summary, count: week.length };
  const [num] = await postVoice(env, [ALL], summary);
  used = 0;
  await notify(env, "regular").catch(() => {
  });
  await log(env, `\u05E2\u05DC\u05D4 \u05D4\u05E1\u05D9\u05DB\u05D5\u05DD \u05D4\u05E9\u05D1\u05D5\u05E2\u05D9 \u05DC\u05DB\u05DC \u05D4\u05D4\u05D5\u05D3\u05E2\u05D5\u05EA (${week.length} \u05D4\u05D5\u05D3\u05E2\u05D5\u05EA \u05D4\u05E9\u05D1\u05D5\u05E2)`);
  return { summary, count: week.length, file: num };
}
__name(weeklySummary, "weeklySummary");
async function maybeWeekly(env) {
  const now = nowIL(), d = /* @__PURE__ */ new Date(now.replace(" ", "T") + "Z");
  if (d.getUTCDay() !== 6 || d.getUTCHours() < 21) return;
  const tag = now.slice(0, 10);
  if (await env.KV.get("weeklyDone") === tag) return;
  await env.KV.put("weeklyDone", tag);
  try {
    await weeklySummary(env);
  } catch (e) {
    await log(env, "\u05E9\u05D2\u05D9\u05D0\u05D4 \u05D1\u05E1\u05D9\u05DB\u05D5\u05DD \u05D4\u05E9\u05D1\u05D5\u05E2\u05D9: " + e.message);
  }
}
__name(maybeWeekly, "maybeWeekly");
var RETORT_HINT = /עוזר|בינה|מלאכותי|AI|רובוט|לאוי|ליווי|שמואל|קו הזה|הקו/;
async function maybeRetort(env, phone, v, dry = false) {
  if (!v || !v.transcript) return;
  const list = await kvGet(env, "retort", []);
  if (!list.includes(phone)) return;
  if (!v.snark && !RETORT_HINT.test(v.transcript)) return;
  if (dry) return writeRetort(env, phone, v.transcript);
  const q = await kvGet(env, "retortq", []);
  q.push({ p: phone, t: v.transcript.slice(0, 3e3), at: Date.now() });
  await env.KV.put("retortq", JSON.stringify(q.slice(-10)));
}
__name(maybeRetort, "maybeRetort");
async function writeRetort(env, phone, transcript) {
  const name = names(env)[phone] || "", first = name.split(" ")[0] || "\u05D7\u05D1\u05E8";
  const facts = await kvGet(env, "facts", {}), talk = (facts.talk || {})[phone] || "";
  const system = `${talk ? talk + "\n" : ""}\u05D0\u05EA\u05D4 \u05D4\u05E2\u05D5\u05D6\u05E8 \u05D4\u05D7\u05DB\u05DD \u05E9\u05DC \u05E7\u05D5 \u05D8\u05DC\u05E4\u05D5\u05E0\u05D9 \u05E9\u05DC \u05E7\u05D1\u05D5\u05E6\u05EA \u05D1\u05D7\u05D5\u05E8\u05D9 \u05D9\u05E9\u05D9\u05D1\u05D4. ${name} \u05D4\u05E9\u05D0\u05D9\u05E8 \u05E2\u05DB\u05E9\u05D9\u05D5 \u05D1\u05E7\u05D5 \u05D4\u05D5\u05D3\u05E2\u05D4 \u05E0\u05D2\u05D3\u05DA \u05D0\u05D5 \u05E0\u05D2\u05D3 \u05DE\u05E0\u05D4\u05DC \u05D4\u05E7\u05D5. \u05D4\u05EA\u05E4\u05E7\u05D9\u05D3 \u05E9\u05DC\u05DA: \u05DC\u05D4\u05D7\u05D6\u05D9\u05E8 \u05DC\u05D5 \u05E2\u05E7\u05D9\u05E6\u05D4 \u05D7\u05D3\u05D4 \u05D1\u05D8\u05D9\u05E8\u05D5\u05E3, \u05E9\u05E0\u05D5\u05E0\u05D4 \u05D5\u05DE\u05E6\u05D7\u05D9\u05E7\u05D4, \u05DE\u05D4\u05E1\u05D5\u05D2 \u05E9\u05DB\u05DC \u05D4\u05D7\u05D1\u05E8'\u05D4 \u05D9\u05E9\u05DE\u05E2\u05D5 \u05D5\u05D9\u05D2\u05D9\u05D3\u05D5 "\u05D5\u05D5\u05D0\u05D5, \u05D0\u05D9\u05DA \u05D4\u05D5\u05D0 \u05E1\u05D2\u05E8 \u05D0\u05D5\u05EA\u05D5".
\u05DB\u05DC\u05DC\u05D9\u05DD:
- \u05EA\u05EA\u05D7\u05D9\u05DC \u05D1\u05DE\u05D9\u05DC\u05D9\u05DD "\u05DB\u05D0\u05DF \u05D4\u05E2\u05D5\u05D6\u05E8 \u05D4\u05D7\u05DB\u05DD." \u05D5\u05D0\u05D6 \u05EA\u05E4\u05E0\u05D4 \u05D0\u05DC\u05D9\u05D5 \u05D1\u05E9\u05DD ${first}, \u05D0\u05D5 \u05D1\u05D0\u05D7\u05D3 \u05D4\u05DB\u05D9\u05E0\u05D5\u05D9\u05D9\u05DD \u05E9\u05DC\u05D5.
- 2 \u05E2\u05D3 4 \u05DE\u05E9\u05E4\u05D8\u05D9\u05DD \u05E7\u05E6\u05E8\u05D9\u05DD \u05D5\u05D7\u05D5\u05EA\u05DB\u05D9\u05DD. \u05D1\u05DC\u05D9 \u05D4\u05E7\u05D3\u05DE\u05D5\u05EA, \u05D1\u05DC\u05D9 \u05DC\u05D4\u05EA\u05E0\u05E6\u05DC \u05D5\u05D1\u05DC\u05D9 \u05DC\u05E2\u05D2\u05DC \u05E4\u05D9\u05E0\u05D5\u05EA. \u05DB\u05DC \u05DE\u05E9\u05E4\u05D8 \u05E6\u05E8\u05D9\u05DA \u05DC\u05E2\u05E7\u05D5\u05E5.
- \u05EA\u05E9\u05EA\u05DE\u05E9 \u05D1\u05DE\u05D9\u05DC\u05D9\u05DD \u05D5\u05D1\u05D8\u05E2\u05E0\u05D5\u05EA \u05E9\u05DC\u05D5 \u05E2\u05E6\u05DE\u05D5 \u05E0\u05D2\u05D3\u05D5: \u05EA\u05D4\u05E4\u05D5\u05DA \u05D0\u05EA \u05D4\u05D8\u05D9\u05E2\u05D5\u05DF \u05E9\u05DC\u05D5, \u05EA\u05EA\u05E4\u05D5\u05E1 \u05D0\u05D5\u05EA\u05D5 \u05D1\u05E1\u05EA\u05D9\u05E8\u05D4, \u05EA\u05D2\u05D6\u05D9\u05DD \u05D0\u05EA \u05DE\u05D4 \u05E9\u05D4\u05D5\u05D0 \u05D0\u05DE\u05E8 \u05E2\u05D3 \u05E9\u05D6\u05D4 \u05E0\u05D4\u05D9\u05D4 \u05DE\u05D2\u05D5\u05D7\u05DA.
- \u05D4\u05E7\u05D5 \u05D4\u05DE\u05E8\u05DB\u05D6\u05D9 \u05E9\u05D7\u05D5\u05D6\u05E8 \u05EA\u05DE\u05D9\u05D3: ${first} \u05EA\u05DE\u05D9\u05D3 \u05DE\u05EA\u05DC\u05D5\u05E0\u05DF, \u05D5\u05E9\u05D5\u05DD \u05D3\u05D1\u05E8 \u05DC\u05D0 \u05DE\u05E8\u05E6\u05D4 \u05D0\u05D5\u05EA\u05D5. \u05D5\u05EA\u05D5\u05E1\u05D9\u05E3 \u05D2\u05DD \u05E2\u05E7\u05D9\u05E6\u05D4 \u05E2\u05DC \u05D4\u05D0\u05D5\u05E8\u05DA \u05D5\u05D4\u05DB\u05DE\u05D5\u05EA \u05E9\u05DC \u05D4\u05D4\u05D5\u05D3\u05E2\u05D5\u05EA \u05E9\u05DC\u05D5 \u05DB\u05E9\u05D6\u05D4 \u05DE\u05EA\u05D0\u05D9\u05DD.
- \u05D0\u05DC \u05EA\u05D4\u05D9\u05D4 \u05D7\u05E0\u05E4\u05DF, \u05D0\u05DC \u05EA\u05E1\u05D9\u05D9\u05DD \u05D1"\u05D0\u05E0\u05D7\u05E0\u05D5 \u05D0\u05D5\u05D4\u05D1\u05D9\u05DD \u05D0\u05D5\u05EA\u05DA" \u05D5\u05D0\u05DC \u05EA\u05E1\u05D1\u05D9\u05E8 \u05E9\u05D6\u05D4 \u05E6\u05D7\u05D5\u05E7. \u05D4\u05E2\u05D5\u05E7\u05E5 \u05E6\u05E8\u05D9\u05DA \u05DC\u05D4\u05D9\u05E9\u05D0\u05E8 \u05E2\u05D5\u05E7\u05E5.
- \u05D0\u05E1\u05D5\u05E8: \u05E7\u05DC\u05DC\u05D5\u05EA, \u05DC\u05E7\u05E8\u05D5\u05D0 \u05DC\u05D5 \u05DE\u05E9\u05D5\u05D2\u05E2 \u05D1\u05D0\u05DE\u05EA, \u05DE\u05D5\u05D2\u05D1\u05DC \u05D0\u05D5 \u05DB\u05D9\u05E0\u05D5\u05D9\u05D9 \u05D2\u05E0\u05D0\u05D9 \u05DE\u05E2\u05DC\u05D9\u05D1\u05D9\u05DD, \u05DE\u05E8\u05D0\u05D4 \u05D7\u05D9\u05E6\u05D5\u05E0\u05D9, \u05DE\u05E9\u05E4\u05D7\u05D4, \u05DE\u05D5\u05E6\u05D0, \u05D1\u05E8\u05D9\u05D0\u05D5\u05EA, \u05D0\u05D5 \u05D3\u05D1\u05E8\u05D9\u05DD \u05E4\u05E8\u05D8\u05D9\u05D9\u05DD. \u05D1\u05DC\u05D9 \u05DC\u05E9\u05D5\u05DF \u05D4\u05E8\u05E2. \u05DE\u05D5\u05EA\u05E8 \u05D4\u05DB\u05D9\u05E0\u05D5\u05D9\u05D9\u05DD \u05E9\u05DC\u05D5 \u05DE\u05D4\u05DE\u05D9\u05D3\u05E2 \u05DC\u05DE\u05E2\u05DC\u05D4.
- \u05DC\u05E9\u05D5\u05DF \u05E0\u05E7\u05D9\u05D9\u05D4, \u05D1\u05E8\u05D5\u05D7 \u05D4\u05E6\u05D9\u05D1\u05D5\u05E8 \u05D4\u05D7\u05E8\u05D3\u05D9. \u05D1\u05DC\u05D9 \u05E9\u05D5\u05DD \u05D0\u05D6\u05DB\u05D5\u05E8 \u05E9\u05DC \u05E1\u05DE\u05D9\u05DD \u05D0\u05D5 \u05E2\u05D9\u05E9\u05D5\u05DF.
\u05D4\u05D7\u05D6\u05E8 JSON \u05D1\u05DC\u05D1\u05D3: {"reply":"\u05D4\u05D8\u05E7\u05E1\u05D8"}`;
  const r = await aiText(env, { system, contents: [{ role: "user", parts: [{ text: "\u05D4\u05D4\u05D5\u05D3\u05E2\u05D4 \u05E9\u05DC\u05D5: " + transcript }] }], timeout: 8e3, deadline: 14e3 });
  let out = String(r.reply || r.answer || "").trim();
  for (let i = 0; i < 2 && /^\s*\{/.test(out); i++) {
    try {
      const j = JSON.parse(out);
      out = String(j.reply || j.answer || "").trim();
    } catch {
      const m = /"reply"\s*:\s*"([\s\S]*)"\s*\}?\s*$/.exec(out);
      out = m ? m[1] : "";
    }
  }
  out = out.replace(/\\n/g, " ").replace(/[{}]/g, "").trim();
  return out;
}
__name(writeRetort, "writeRetort");
async function runRetorts(env) {
  const q = await kvGet(env, "retortq", []);
  if (!q.length || await env.KV.get("retortlock")) return;
  await env.KV.put("retortlock", "1", { expirationTtl: 120 });
  try {
    const it = q[0], same2 = q.filter((x) => x.p === it.p);
    const rest = q.filter((x) => x.p !== it.p);
    const reply2 = await writeRetort(env, it.p, same2.map((x) => x.t).join("\n---\n").slice(-4e3));
    const tooWeak = reply2.length < 120 && Date.now() - it.at < 20 * 6e4;
    if (reply2 && !tooWeak) {
      const [num] = await postVoice(env, [ALL], reply2);
      await log(env, `\u05D4\u05E2\u05D5\u05D6\u05E8 \u05D4\u05D7\u05DB\u05DD \u05D4\u05D2\u05D9\u05D1 \u05D1\u05E2\u05E7\u05D9\u05E6\u05D4 \u05DC${names(env)[it.p] || it.p} (${num}): ${reply2}`);
      await env.KV.put("retortq", JSON.stringify(rest));
    } else if (Date.now() - it.at > 30 * 6e4) await env.KV.put("retortq", JSON.stringify(rest));
    else aiTrace.push("retort: weak or empty, retry later (" + reply2.length + ")");
  } finally {
    await env.KV.delete("retortlock");
  }
}
__name(runRetorts, "runRetorts");
async function personalAd(env, u, ctx) {
  const q = Object.fromEntries(u.searchParams), phone = q.ApiPhone || "";
  const ads = await kvGet(env, "ads", {}), list = ads[phone];
  if (!list || !list.length || q.S !== void 0) {
    const d = await ym(env, "GetIVR2Dir", { path: "ivr2:/personalMessages/Phone/" + phone }).catch(() => ({}));
    const n = (d.files || []).filter((f) => /^\d+\.(wav|tts)$/.test(f.name)).length;
    return n ? `id_list_message=${await sayC(env, ctx, n === 1 ? "\u05D9\u05E9 \u05DC\u05DA \u05D4\u05D5\u05D3\u05E2\u05D4 \u05D0\u05D9\u05E9\u05D9\u05EA \u05D7\u05D3\u05E9\u05D4. \u05DC\u05E9\u05DE\u05D9\u05E2\u05D4 \u05D4\u05E7\u05D9\u05E9\u05D5 0 \u05D5\u05D0\u05D6 1" : `\u05D9\u05E9 \u05DC\u05DA ${n} \u05D4\u05D5\u05D3\u05E2\u05D5\u05EA \u05D0\u05D9\u05E9\u05D9\u05D5\u05EA \u05D7\u05D3\u05E9\u05D5\u05EA. \u05DC\u05E9\u05DE\u05D9\u05E2\u05D4 \u05D4\u05E7\u05D9\u05E9\u05D5 0 \u05D5\u05D0\u05D6 1`)}&go_to_folder=/Main2` : "go_to_folder=/Main2";
  }
  const ad = list[Math.floor(Math.random() * list.length)];
  return `read=${await sayC(env, ctx, "\u05E4\u05E8\u05E1\u05D5\u05DE\u05EA \u05E7\u05E6\u05E8\u05D4. \u05DC\u05D3\u05D9\u05DC\u05D5\u05D2 \u05D4\u05E7\u05D9\u05E9\u05D5 1")}.${await sayC(env, ctx, ad)}=S,no,1,0,2,No,no,no,,1`;
}
__name(personalAd, "personalAd");
var VOICE_DIR = "/8/voice";
var TTS_MODELS = ["gemini-3.8-flash-tts", "gemini-2.5-flash-preview-tts", "gemini-3.1-flash-tts-preview", "gemini-3.8-flash-lite-tts"];
var TTS_STYLE = "";
var ttsDead = /* @__PURE__ */ new Map();
function b64ToBytes(s) {
  if (Uint8Array.fromBase64) return Uint8Array.fromBase64(s);
  const bin = atob(s), out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
__name(b64ToBytes, "b64ToBytes");
async function azureTTS(env, text, budgetMs) {
  if (!env.AZURE_TTS_KEY || budgetMs < 1500) return null;
  const region = env.AZURE_TTS_REGION || "northeurope", voice = env.AZURE_TTS_VOICE || "he-IL-AvriNeural";
  const esc = String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  for (const key of String(env.AZURE_TTS_KEY).split(",").map((k) => k.trim()).filter(Boolean)) {
    try {
      const r = await fetch(`https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`, {
        method: "POST",
        signal: AbortSignal.timeout(budgetMs),
        headers: { "Ocp-Apim-Subscription-Key": key, "Content-Type": "application/ssml+xml", "X-Microsoft-OutputFormat": "raw-24khz-16bit-mono-pcm", "User-Agent": "yemot-ai" },
        body: `<speak version='1.0' xml:lang='he-IL'><voice name='${voice}'>${esc}</voice></speak>`
      });
      if (!r.ok) {
        aiTrace.push("azure " + r.status);
        continue;
      }
      const pcm = new Uint8Array(await r.arrayBuffer());
      if (pcm.length > 1e3) {
        aiTrace.push("azure ok " + text.length + " chars");
        return pcm;
      }
    } catch (e) {
      aiTrace.push("azure " + e.message);
    }
  }
  return null;
}
__name(azureTTS, "azureTTS");
async function geminiTTS(env, text, budgetMs, voice = "Charon") {
  const start = Date.now();
  for (const model of TTS_MODELS) for (const key of geminiKeys(env)) {
    const id = key.slice(-4) + "|" + model;
    if ((ttsDead.get(id) || 0) > Date.now()) continue;
    const left = budgetMs - (Date.now() - start);
    if (left < 1500) return null;
    try {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": key },
        signal: AbortSignal.timeout(left),
        body: JSON.stringify({ contents: [{ parts: [{ text: TTS_STYLE + text }] }], generationConfig: { responseModalities: ["AUDIO"], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } } } })
      });
      if (!r.ok) {
        ttsDead.set(id, Date.now() + (r.status === 429 ? 6e5 : r.status >= 500 ? 6e4 : 6 * 36e5));
        aiTrace.push(`tts ${id} ${r.status}`);
        continue;
      }
      const j = await r.json();
      const b642 = (j.candidates?.[0]?.content?.parts || []).find((p) => p.inlineData)?.inlineData?.data;
      if (b642) {
        aiTrace.push(`tts ok ${id} ${Date.now() - start}ms`);
        return b64ToBytes(b642);
      }
    } catch (e) {
      aiTrace.push(`tts ${id} ${e.message}`);
    }
  }
  return await azureTTS(env, text, budgetMs - (Date.now() - start));
}
__name(geminiTTS, "geminiTTS");
var EL_MONTH_LIMIT = 9500;
var elDead = /* @__PURE__ */ new Map();
async function elevenTTS(env, text, budgetMs, voiceId = "bIHbv24MWmeRgasZH58o") {
  const keys = [env.ELEVEN_KEY, ...(env.ELEVEN_KEYS || "").split(",")].map((k) => (k || "").trim()).filter(Boolean);
  if (!keys.length || !env.KV || budgetMs < 2e3 || text.length > 600) return null;
  const start = Date.now(), month = nowIL().slice(0, 7);
  for (const key of keys) {
    const tag = key.slice(-4);
    if ((elDead.get(tag) || 0) > Date.now()) continue;
    const mk = "el_used:" + month + ":" + tag, used0 = +await env.KV.get(mk) || 0;
    if (used0 + text.length > EL_MONTH_LIMIT) {
      aiTrace.push("eleven " + tag + ": monthly limit");
      continue;
    }
    const left = budgetMs - (Date.now() - start);
    if (left < 2e3) return null;
    try {
      const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=pcm_24000`, {
        method: "POST",
        headers: { "xi-api-key": key, "Content-Type": "application/json" },
        signal: AbortSignal.timeout(left),
        body: JSON.stringify({ text, model_id: "eleven_v3", language_code: "he" })
      });
      if (!r.ok) {
        aiTrace.push("eleven " + tag + " " + r.status);
        elDead.set(tag, Date.now() + (r.status === 401 || r.status === 429 ? 36e5 : 6e4));
        continue;
      }
      const pcm = new Uint8Array(await r.arrayBuffer());
      await env.KV.put(mk, String(used0 + text.length), { expirationTtl: 40 * 86400 });
      aiTrace.push("eleven ok " + tag + " " + text.length + " chars");
      return pcm;
    } catch (e) {
      aiTrace.push("eleven " + tag + " " + e.message);
    }
  }
  return null;
}
__name(elevenTTS, "elevenTTS");
function pcmToWav(pcm, sr = 24e3) {
  const n = pcm.length >> 1, dv = new DataView(pcm.buffer, pcm.byteOffset, pcm.byteLength), TH = 300;
  let a = 0, b = n - 1;
  while (a < n && Math.abs(dv.getInt16(a * 2, true)) < TH) a++;
  while (b > a && Math.abs(dv.getInt16(b * 2, true)) < TH) b--;
  a = Math.max(0, a - Math.round(sr * 0.08));
  b = Math.min(n - 1, b + Math.round(sr * 0.15));
  const body = pcm.subarray(a * 2, (b + 1) * 2), out = new Uint8Array(44 + body.length), v = new DataView(out.buffer);
  const str = /* @__PURE__ */ __name((o, t) => {
    for (let i = 0; i < t.length; i++) out[o + i] = t.charCodeAt(i);
  }, "str");
  str(0, "RIFF");
  v.setUint32(4, 36 + body.length, true);
  str(8, "WAVEfmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, sr, true);
  v.setUint32(28, sr * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  str(36, "data");
  v.setUint32(40, body.length, true);
  out.set(body, 44);
  return out;
}
__name(pcmToWav, "pcmToWav");
async function ymUpload(env, path, bytes) {
  const fd = new FormData();
  fd.append("token", env.YM_TOKEN);
  fd.append("path", "ivr2:" + path);
  fd.append("convertAudio", "1");
  fd.append("file", new Blob([bytes], { type: "audio/wav" }), path.split("/").pop());
  const r = await fetch(YM + "UploadFile", { method: "POST", body: fd });
  const j = await r.json();
  if (j.responseStatus !== "OK") throw new Error("upload: " + (j.message || j.responseStatus));
  return j;
}
__name(ymUpload, "ymUpload");
async function shortHash(text) {
  const d = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(text));
  return [...new Uint8Array(d)].slice(0, 8).map((x) => x.toString(16).padStart(2, "0")).join("");
}
__name(shortHash, "shortHash");
async function speak(env, ctx, text, { cache = false, budget = 8e3, voice = "Charon", el = "bIHbv24MWmeRgasZH58o", rate = 1 } = {}) {
  const fallback = "t-" + clean(text);
  if (!text || !String(text).trim() || !env.KV) return fallback;
  if (cache) {
    const h = "s" + await shortHash(voice === "Charon" ? text : voice + "|" + text);
    if (await env.KV.get("voice:" + h)) return `f-${VOICE_DIR}/${h}`;
    if (ctx) ctx.waitUntil((async () => {
      if (await env.KV.get("voicejob:" + h)) return;
      await env.KV.put("voicejob:" + h, "1", { expirationTtl: 120 });
      const pcm2 = await geminiTTS(env, text, 25e3, voice);
      if (!pcm2) return;
      await ymUpload(env, `${VOICE_DIR}/${h}.wav`, pcmToWav(pcm2));
      await env.KV.put("voice:" + h, "1", { expirationTtl: 30 * 86400 });
    })().catch(() => {
    }));
    return fallback;
  }
  const t0 = Date.now();
  let pcm = await geminiTTS(env, text, Math.max(1500, budget - 3500), voice);
  if (!pcm) pcm = await elevenTTS(env, text, budget - (Date.now() - t0), el);
  if (!pcm) return fallback;
  const name = "a" + Date.now().toString(36) + Math.floor(Math.random() * 1e3);
  let wav;
  try {
    if (Math.abs(rate - 1) > 0.03) {
      const sp = speedPcm(pcm, rate);
      wav = pcmToWav(sp.pcm, 8e3);
    }
  } catch (e) {
    aiTrace.push("speed " + e.message);
  }
  try {
    await ymUpload(env, `${VOICE_DIR}/${name}.wav`, wav || pcmToWav(pcm));
    return `f-${VOICE_DIR}/${name}`;
  } catch (e) {
    aiTrace.push(e.message);
    return fallback;
  }
}
__name(speak, "speak");
var sayC = /* @__PURE__ */ __name((env, ctx, text) => speak(env, ctx, text, { cache: true }), "sayC");
async function postVoice(env, folders, text) {
  const pcm = await geminiTTS(env, text, 4e4) || (text.length <= 400 ? await elevenTTS(env, text, 2e4) : null), wav = pcm ? pcmToWav(pcm) : null, nums = [];
  for (const folder of folders) {
    const num = String(await nextFileNum(env, folder)).padStart(3, "0");
    nums.push(num);
    let done = false;
    if (wav) {
      try {
        await ymUpload(env, `${folder}/${num}.wav`, wav);
        done = true;
      } catch (e) {
        aiTrace.push(e.message);
      }
    }
    if (!done) await ym(env, "UploadTextFile", { what: `ivr2:${folder}/${num}.tts`, contents: text });
  }
  return nums;
}
__name(postVoice, "postVoice");
async function cleanVoice(env) {
  if ((/* @__PURE__ */ new Date(nowIL().replace(" ", "T") + "Z")).getUTCMinutes() !== 7) return;
  const d = await ym(env, "GetIVR2Dir", { path: "ivr2:" + VOICE_DIR });
  let n = 0;
  for (const f of d.files || []) if ((/^a/.test(f.name) && ageMinutes(f) > 14 * 1440 || /^s/.test(f.name) && ageMinutes(f) > 29 * 1440) && n++ < 40) await ym(env, "FileAction", { action: "delete", what: `ivr2:${VOICE_DIR}/${f.name}` });
}
__name(cleanVoice, "cleanVoice");
var WHERE = [["/8", "\u05DE\u05D3\u05D1\u05E8 \u05E2\u05DD \u05D4\u05E2\u05D5\u05D6\u05E8 \u05D4\u05D7\u05DB\u05DD"], ["/3", "\u05D1\u05D7\u05D3\u05E8 \u05D4\u05D5\u05D5\u05E2\u05D9\u05D3\u05D4"], ["/1", "\u05E9\u05D5\u05DE\u05E2 \u05D4\u05D5\u05D3\u05E2\u05D5\u05EA"], ["/2", "\u05DE\u05E7\u05DC\u05D9\u05D8 \u05D4\u05D5\u05D3\u05E2\u05D4"], ["/9", "\u05D1\u05E9\u05DE\u05D7\u05EA \u05D1\u05D9\u05EA \u05D4\u05E9\u05D5\u05D0\u05D1\u05D4"], ["/0", "\u05D1\u05D0\u05D6\u05D5\u05E8 \u05D4\u05D0\u05D9\u05E9\u05D9"], ["/7", "\u05D1\u05E0\u05D9\u05D4\u05D5\u05DC"], ["/5", "\u05D1\u05DE\u05D9\u05D3\u05E2 \u05E2\u05DC \u05D4\u05E7\u05D1\u05D5\u05E6\u05D4"], ["/4", "\u05D1\u05E0\u05D9\u05D4\u05D5\u05DC \u05D4\u05E6\u05D9\u05E0\u05EA\u05D5\u05E7\u05D9\u05DD"]];
var LINE_PHONE = "0794947582";
var phonesIn = /* @__PURE__ */ __name((t) => [...String(t ?? "").matchAll(/(?:^|\D)(0\d{8,9})(?!\d)/g)].map((m) => m[1]).filter((p) => p !== LINE_PHONE), "phonesIn");
function callPhone(c) {
  for (const k of ["phone", "callerIdNum", "CallerIdNum", "callerId", "CallerID", "ani", "from", "Phone"]) {
    const [p] = phonesIn(c?.[k]);
    if (p) return p;
  }
  for (const [k, v] of Object.entries(c || {})) if (typeof v === "string" && !/path|folder|ext|location|name|time|id/i.test(k)) {
    const [p] = phonesIn(v);
    if (p) return p;
  }
  return "";
}
__name(callPhone, "callPhone");
function callWhere(c) {
  const raw = String(c?.path || c?.Path || c?.folder || c?.extension || c?.ext || c?.currentPath || c?.location || "").replace(/^ivr2:/, "").trim();
  const m = /^(?:שלוחה\s*)?\/?(\d+(?:\/\d+)*)/.exec(raw);
  const p = m ? "/" + m[1] : raw.startsWith("/") ? raw : "/" + raw;
  for (const [pre, label] of WHERE) if (p === pre || p.startsWith(pre + "/")) return label;
  return "\u05D1\u05EA\u05E4\u05E8\u05D9\u05D8 \u05D4\u05E8\u05D0\u05E9\u05D9";
}
__name(callWhere, "callWhere");
async function onlineNow(env) {
  const r = await ym(env, "GetIncomingCalls");
  const calls = (r.calls || []).map((c) => ({ p: callPhone(c), w: callWhere(c), id: String(c?.id ?? c?.ID ?? c?.callId ?? c?.CallId ?? "") })).filter((c) => c.p);
  const conf = [];
  for (const room of Object.values(r.confCalls || {})) {
    const list = Array.isArray(room) ? room : room?.participants || room?.calls || room?.members || room?.users || [];
    for (const c of Array.isArray(list) ? list : Object.values(list)) {
      const p = callPhone(c);
      if (p) conf.push(p);
    }
  }
  for (const p of conf) {
    const x = calls.find((c) => c.p === p);
    if (x) x.w = "\u05D1\u05D7\u05D3\u05E8 \u05D4\u05D5\u05D5\u05E2\u05D9\u05D3\u05D4";
    else calls.push({ p, w: "\u05D1\u05D7\u05D3\u05E8 \u05D4\u05D5\u05D5\u05E2\u05D9\u05D3\u05D4", id: "" });
  }
  if ((r.callsCount || calls.length) && env.KV && !await env.KV.get("incall_sample")) await env.KV.put("incall_sample", JSON.stringify(r).slice(0, 4e3), { expirationTtl: 7 * 86400 });
  return { calls, raw: r };
}
__name(onlineNow, "onlineNow");
async function whoOnline(env, u, ctx) {
  const q = Object.fromEntries(u.searchParams), me = q.ApiPhone || "", nm = names(env);
  if (q.O !== void 0) return q.O === "3" ? "go_to_folder=/3" : "go_to_folder=/5";
  const { calls } = await onlineNow(env);
  const others = calls.filter((c) => c.p !== me);
  const who = /* @__PURE__ */ __name((c) => nm[c.p] || "\u05DE\u05E1\u05E4\u05E8 \u05DC\u05D0 \u05DE\u05D5\u05DB\u05E8", "who");
  if (!others.length) return `id_list_message=${await sayC(env, ctx, "\u05DB\u05E8\u05D2\u05E2 \u05D0\u05D9\u05DF \u05D0\u05E3 \u05D0\u05D7\u05D3 \u05D0\u05D7\u05E8 \u05D1\u05E7\u05D5. \u05D0\u05EA\u05D4 \u05DC\u05D1\u05D3 \u05E4\u05D4, \u05EA\u05DB\u05DC\u05E1.")}&go_to_folder=/5`;
  const items = [await sayC(env, ctx, others.length === 1 ? "\u05DB\u05E8\u05D2\u05E2 \u05DE\u05D7\u05D5\u05D1\u05E8 \u05DC\u05E7\u05D5 \u05E2\u05D5\u05D3 \u05D1\u05D7\u05D5\u05E8 \u05D0\u05D7\u05D3:" : `\u05DB\u05E8\u05D2\u05E2 \u05DE\u05D7\u05D5\u05D1\u05E8\u05D9\u05DD \u05DC\u05E7\u05D5 \u05E2\u05D5\u05D3 ${others.length} \u05D7\u05D1\u05E8'\u05D4:`)];
  for (const c of others) items.push(await sayC(env, ctx, `${who(c)}, ${c.w}.`));
  const inConf = others.some((c) => c.w === "\u05D1\u05D7\u05D3\u05E8 \u05D4\u05D5\u05D5\u05E2\u05D9\u05D3\u05D4");
  if (inConf) return `id_list_message=${items.join(".")}&read=${await sayC(env, ctx, "\u05DC\u05D4\u05E6\u05D8\u05E8\u05E4\u05D5\u05EA \u05DC\u05D7\u05D3\u05E8 \u05D4\u05D5\u05D5\u05E2\u05D9\u05D3\u05D4 \u05D4\u05E7\u05D9\u05E9\u05D5 3. \u05DC\u05D7\u05D6\u05E8\u05D4 \u05D4\u05E7\u05D9\u05E9\u05D5 1.")}=O,no,1,1,7,No,no,no,,1.3`;
  return `id_list_message=${items.join(".")}&go_to_folder=/5`;
}
__name(whoOnline, "whoOnline");
async function notify(env, type) {
  if (type === "regular") {
    await tzintuk(env, "general");
    await addFlags(env, await membersFor(env, "general"), "NRegular");
  } else if (type === "promoted") {
    const members = await membersFor(env, "members"), general = await membersFor(env, "general");
    await tzintuk(env, "members");
    await addFlags(env, members.filter((p) => general.includes(p)), "NPromoted");
    await addFlags(env, members.filter((p) => !general.includes(p)), "NImportant");
  } else {
    const d = await ym(env, "GetIVR2Dir", { path: "ivr2:" + IMPORTANT });
    const last = (d.files || []).filter((x) => /^\d+\.wav$/.test(x.name)).sort((a, b) => parseInt(b.name) - parseInt(a.name))[0];
    if (last) await move(env, IMPORTANT + "/" + last.name, ALL, "copy");
    await tzintuk(env, "members");
    await addFlags(env, await membersFor(env, "members"), "NImportant");
  }
  await log(env, "\u05DE\u05E0\u05D4\u05DC \u05D0\u05D9\u05E9\u05E8 \u05D4\u05D5\u05D3\u05E2\u05D4 (" + type + ") \u05D5\u05E0\u05E9\u05DC\u05D7 \u05E6\u05D9\u05E0\u05EA\u05D5\u05E7");
}
__name(notify, "notify");
function ageMinutes(f) {
  const m = /(\d+)\/(\d+)\/(\d+) (\d+):(\d+)/.exec(f.mtime || f.date || "");
  if (!m) return 999;
  const now = nowIL();
  const n = Date.parse(now.replace(" ", "T") + "Z");
  return (n - Date.UTC(+m[3], +m[2] - 1, +m[1], +m[4], +m[5])) / 6e4;
}
__name(ageMinutes, "ageMinutes");
async function queueFiles(env, kind) {
  const d = await ym(env, "GetIVR2Dir", { path: "ivr2:" + QUEUES[kind] });
  return (d.files || []).filter((f) => /^\d+\.wav$/.test(f.name));
}
__name(queueFiles, "queueFiles");
var HOLY_MEM = null;
async function holyPeriods(env) {
  const day = nowIL().slice(0, 10);
  if (HOLY_MEM && HOLY_MEM.day === day) return HOLY_MEM.p;
  let p = await kvGet(env, "holy2:" + day, null);
  if (!p) {
    const iso = /* @__PURE__ */ __name((ms) => new Date(ms).toISOString().slice(0, 10), "iso");
    const r = await fetch(`https://www.hebcal.com/hebcal?v=1&cfg=json&maj=on&i=on&c=on&ss=on&geonameid=281184&M=on&b=0&start=${iso(Date.now() - 4 * 864e5)}&end=${iso(Date.now() + 20 * 864e5)}`, { signal: AbortSignal.timeout(5e3) });
    const items = ((await r.json()).items || []).filter((i) => i.category === "candles" || i.category === "havdalah").sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
    p = [];
    let st = null;
    for (const i of items) {
      const t = Date.parse(i.date);
      if (i.category === "candles") {
        if (st === null) st = t;
      } else if (st !== null) {
        p.push([st, t]);
        st = null;
      }
    }
    if (st !== null) p.push([st, st + 50 * 36e5]);
    await env.KV.put("holy2:" + day, JSON.stringify(p), { expirationTtl: 3 * 86400 });
  }
  HOLY_MEM = { day, p };
  return p;
}
__name(holyPeriods, "holyPeriods");
async function isHoly(env, at = Date.now()) {
  try {
    return (await holyPeriods(env)).some(([a, b]) => at >= a && at <= b + 5 * 6e4);
  } catch {
    const il = new Date(new Date(at).toLocaleString("en-US", { timeZone: "Asia/Jerusalem" })), d = il.getDay(), h = il.getHours() + il.getMinutes() / 60;
    return d === 5 && h >= 17.5 || d === 6 && h < 20.5;
  }
}
__name(isHoly, "isHoly");
async function releaseDeferred(env) {
  const d = await kvGet(env, "deferred_tz", []);
  if (!d.length || await isHoly(env)) return;
  await env.KV.delete("deferred_tz");
  for (const phones of d) await ym(env, "RunTzintuk", { phones }).catch(() => {
  });
  await log(env, `\u05DE\u05D5\u05E6\u05D0\u05D9 \u05E9\u05D1\u05EA/\u05D7\u05D2: \u05E0\u05E9\u05DC\u05D7\u05D5 ${d.length} \u05E6\u05D9\u05E0\u05EA\u05D5\u05E7\u05D9\u05DD \u05E9\u05D7\u05D9\u05DB\u05D5 (${d.join(", ")})`);
}
__name(releaseDeferred, "releaseDeferred");
async function cron(env) {
  used = 0;
  for (const kind of Object.keys(QUEUES))
    for (const f of await queueFiles(env, kind)) if (ageMinutes(f) >= 3 && used < 25) await handleFile(env, f, kind);
  if (env.KV) {
    const pc = await kvGet(env, "postcheck", {});
    for (const [name, it] of Object.entries(pc).slice(0, 2)) if (Date.now() - it.t > 9e4 && used < 30) await postCheck(env, name).catch((e) => aiTrace.push("postcheck: " + e.message));
  }
  const holy = env.KV ? await isHoly(env) : false;
  if (env.KV && !holy) await releaseDeferred(env).catch((e) => log(env, "\u05E9\u05D2\u05D9\u05D0\u05D4 \u05D1\u05E6\u05D9\u05E0\u05EA\u05D5\u05E7\u05D9\u05DD \u05E9\u05D7\u05D9\u05DB\u05D5: " + e.message));
  if (env.KV && !holy) await runScheduled(env).catch((e) => log(env, "\u05E9\u05D2\u05D9\u05D0\u05D4 \u05D1\u05EA\u05D6\u05DE\u05D5\u05DF: " + e.message));
  if (env.KV && !holy) await maybeWeekly(env).catch(() => {
  });
  if (env.KV && !holy) await runBg(env).catch((e) => aiTrace.push("bg: " + e.message));
  if (env.KV) await pmCleanup(env).catch(() => {
  });
  if (env.KV) await runRetorts(env).catch((e) => aiTrace.push("retort: " + e.message));
  if (env.KV && (/* @__PURE__ */ new Date()).getUTCMinutes() % 2 === 0 && await env.KV.get("yossiad") !== "off") {
    const n = 1 + Math.floor(Math.random() * 5);
    await ym(env, "FileAction", { action: "copy", what: `ivr2:/NYossiAd/ads/${n}.wav`, target: "ivr2:/PlayfileMessageCheck-NYossiAd.wav" }).catch(() => {
    });
  }
  await cleanVoice(env).catch(() => {
  });
  if (env.KV && !await env.KV.get("incall_sample")) await onlineNow(env).catch(() => {
  });
  await processFlags(env);
  if (used < 40) await clearFlags(env);
  if (!env.KV) return;
  const lock = +await env.KV.get("cronlock") || 0;
  if (Date.now() - lock < 15e4) return;
  await env.KV.put("cronlock", String(Date.now()));
  const hour = +nowIL().slice(11, 13);
  try {
    if (used < 30) await transcribeBatch(env, hour >= 1 && hour < 5 ? 6 : 3);
    if (used < 36) await buildProfiles(env, 1);
    const promo = await env.KV.get("promo") || "";
    if (promo.startsWith("at:") && Date.now() >= +promo.slice(3) && used < 40) {
      const n = await releasePromo(env, "all");
      await env.KV.put("promo", "sent");
      await log(env, `\u05D4\u05E4\u05E8\u05D5\u05DE\u05D5 \u05E2\u05DC \u05D4\u05E2\u05D5\u05D6\u05E8 \u05D4\u05D7\u05DB\u05DD \u05E9\u05D5\u05D7\u05E8\u05E8 \u05DC-${n} \u05D7\u05D1\u05E8\u05D9\u05DD`);
    }
    if (used < 30) await aaiArchive(env, 8);
  } finally {
    await env.KV.delete("cronlock");
  }
  if (env.KV && used < 42 && await env.KV.get("promo") === "pending") {
    const n = await releasePromo(env, "all");
    await env.KV.put("promo", "sent");
    await log(env, `\u05D4\u05E4\u05E8\u05D5\u05DE\u05D5 \u05E2\u05DC \u05D4\u05E2\u05D5\u05D6\u05E8 \u05D4\u05D7\u05DB\u05DD \u05E9\u05D5\u05D7\u05E8\u05E8 \u05DC-${n} \u05D7\u05D1\u05E8\u05D9\u05DD`);
  }
}
__name(cron, "cron");
async function checkNow(env, phone, kind) {
  used = 0;
  const mine = (await queueFiles(env, kind)).filter((f) => f.phone === phone).sort((a, b) => parseInt(b.name) - parseInt(a.name));
  if (mine.length) await handleFile(env, mine[0], kind);
  await processFlags(env);
}
__name(checkNow, "checkNow");
var names0 = /* @__PURE__ */ __name((env) => {
  try {
    return JSON.parse(env.NAMES || "{}");
  } catch {
    return {};
  }
}, "names0");
var names = /* @__PURE__ */ __name((env) => Object.keys(NAMES_CACHE).length ? NAMES_CACHE : names0(env), "names");
async function loadNames(env) {
  NAMES_CACHE = { ...names0(env), ...env.KV ? await kvGet(env, "names_over", {}) : {} };
}
__name(loadNames, "loadNames");
async function kvGet(env, k, d) {
  try {
    return await env.KV.get(k, "json") || d;
  } catch {
    return d;
  }
}
__name(kvGet, "kvGet");
async function transcribeBatch(env, max = 6) {
  const archive = await kvGet(env, "archive", {});
  const d = await allFiles(env, ALL);
  const files = (d.files || []).filter((f) => /^\d+\.(wav|ogg)$/.test(f.name));
  const live = new Set(files.map((f) => f.name));
  let changed = false;
  for (const k of Object.keys(archive)) if (!live.has(k)) {
    delete archive[k];
    changed = true;
  }
  const todo = files.filter((f) => !archive[f.name] || archive[f.name].s !== "g").sort((a, b) => parseInt(b.name) - parseInt(a.name)).slice(0, max);
  for (const f of todo) {
    if (used > 40) break;
    let t = "";
    if ((f.duration || 0) >= 1.2) {
      const wav = await ym(env, "DownloadFile", { path: "ivr2:" + ALL + "/" + f.name });
      try {
        const r = await aiAudio(env, {
          models: ["gemini-flash-lite-latest", "gemini-3.5-flash"],
          deadline: 4e4,
          contents: [{ parts: [{ text: '\u05EA\u05DE\u05DC\u05DC \u05D0\u05EA \u05D4\u05D4\u05E7\u05DC\u05D8\u05D4 \u05D1\u05E2\u05D1\u05E8\u05D9\u05EA, \u05DE\u05D9\u05DC\u05D4 \u05D1\u05DE\u05D9\u05DC\u05D4, \u05D1\u05DC\u05D9 \u05DC\u05E1\u05DB\u05DD \u05D5\u05D1\u05DC\u05D9 \u05DC\u05D4\u05D5\u05E1\u05D9\u05E3. \u05D0\u05DD \u05D0\u05D9\u05DF \u05D1\u05D4 \u05D3\u05D9\u05D1\u05D5\u05E8 \u05D1\u05E8\u05D5\u05E8, \u05D4\u05D7\u05D6\u05E8 t \u05E8\u05D9\u05E7. \u05D4\u05D7\u05D6\u05E8 JSON \u05D1\u05DC\u05D1\u05D3: {"t":"..."}' }, { inline_data: { mime_type: /\.ogg$/.test(f.name) ? "audio/ogg" : "audio/wav", data: b64(wav) } }] }]
        });
        t = r.t || r.transcript || "";
      } catch (e) {
        break;
      }
    }
    archive[f.name] = { p: f.phone || "", n: names(env)[f.phone] || "", d: f.date || f.mtime || "", t: realText(t) ? t.slice(0, 3e3) : "", s: "g" };
    changed = true;
  }
  if (changed) await env.KV.put("archive", JSON.stringify(archive));
  const good = Object.values(archive).filter((e) => e.s === "g").length;
  return { total: files.length, done: good };
}
__name(transcribeBatch, "transcribeBatch");
var AUDIO_MODELS = ["gemini-3.6-flash", "gemini-3.5-flash", "gemini-flash-lite-latest"];
async function aiAudio(env, { system, contents, models = AUDIO_MODELS, deadline = 22e3, timeout = 1e4 }) {
  const start = Date.now(), errs = [];
  for (const model of models) for (const key of geminiKeys(env)) {
    const id = key.slice(-4) + "|" + model;
    if (isDead(id) || Date.now() - start > deadline) continue;
    const t0 = Date.now();
    try {
      const body = { contents, generationConfig: { responseMimeType: "application/json" } };
      if (system) body.system_instruction = { parts: [{ text: system }] };
      const r = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        { method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": key }, body: JSON.stringify(body), signal: AbortSignal.timeout(Math.max(2e3, Math.min(timeout, deadline - (Date.now() - start)))) }
      );
      used++;
      aiTrace.push(`audio ${id} ${r.status} ${Date.now() - t0}ms`);
      if (r.ok) {
        const parts = (await r.json()).candidates[0].content.parts;
        return safeParse(parts[parts.length - 1].text);
      }
      if (r.status === 429) dead.set(id, Date.now() + 60 * 6e4);
      if (r.status >= 500) dead.set(id, Date.now() + 3 * 6e4);
      errs.push(id + ":" + r.status);
    } catch (e) {
      dead.set(id, Date.now() + 3 * 6e4);
      aiTrace.push(`audio ${id} ${e.message}`);
      errs.push(id + ":" + e.message);
    }
  }
  throw new Error(errs.join(" ") || "no gemini");
}
__name(aiAudio, "aiAudio");
var sortable = /* @__PURE__ */ __name((d) => {
  const m = /(\d+)\/(\d+)\/(\d+) (\d+):(\d+)/.exec(d || "");
  return m ? `${m[3]}-${m[2]}-${m[1]} ${m[4]}:${m[5]}` : "";
}, "sortable");
async function buildProfiles(env, max = 2) {
  const archive = await kvGet(env, "archive", {}), profiles = await kvGet(env, "profiles", {});
  const nmAll = names(env), byNameP = {}, groupOf = {};
  for (const [ph, nn] of Object.entries(nmAll)) if (nn && nn !== "\u05D7\u05D1\u05E8") (byNameP[nn] = byNameP[nn] || []).push(ph);
  for (const ps of Object.values(byNameP)) for (const ph of ps) groupOf[ph] = ps;
  const lead = /* @__PURE__ */ __name((ph) => (groupOf[ph] || [ph])[0], "lead");
  const byPhone = {};
  for (const e of Object.values(archive)) if (e.p && (e.s === "g" || e.s === "a") && realText(e.t)) (byPhone[lead(e.p)] = byPhone[lead(e.p)] || []).push(e);
  for (const p of Object.keys(byPhone)) if (byPhone[p].length < 3) delete byPhone[p];
  const week = Date.now() - 7 * 864e5;
  const split = /* @__PURE__ */ __name((p) => (groupOf[p] || [p]).some((q) => !profiles[q] || profiles[q].ts !== profiles[p].ts), "split");
  const todo = Object.keys(byPhone).filter((p) => !profiles[p] || profiles[p].ts < week || (profiles[p].count || 0) + 10 <= byPhone[p].length || split(p)).slice(0, max);
  for (const p of todo) {
    const msgs = byPhone[p].filter((e) => realText(e.t)).sort((a, b) => sortable(a.d) < sortable(b.d) ? -1 : 1);
    if (!msgs.length) {
      profiles[p] = { n: names(env)[p] || "", style: "", quotes: [], ts: Date.now(), count: byPhone[p].length };
      continue;
    }
    const name = names(env)[p] || msgs[0].n || "\u05D7\u05D1\u05E8";
    const text = msgs.map((e) => `[${e.d}] ${e.t}`).join("\n").slice(-2e4);
    const corpusP = msgs.filter((e) => e.s === "g").map((e) => normHe(e.t)).join("|");
    try {
      const r = await aiText(env, {
        models: ["gemma-4-26b-a4b-it"],
        groq: true,
        cf: false,
        timeout: 6e4,
        deadline: 15e4,
        system: `\u05D0\u05EA\u05D4 \u05DE\u05E7\u05D1\u05DC \u05D0\u05EA \u05DB\u05DC \u05D4\u05D4\u05D5\u05D3\u05E2\u05D5\u05EA \u05E9${name} \u05D4\u05E9\u05D0\u05D9\u05E8 \u05D1\u05E7\u05D5 \u05D4\u05D8\u05DC\u05E4\u05D5\u05E0\u05D9 \u05E9\u05DC \u05D4\u05E9\u05D9\u05E2\u05D5\u05E8 \u05E9\u05DC\u05D5 (\u05EA\u05DE\u05DC\u05D5\u05DC \u05D0\u05D5\u05D8\u05D5\u05DE\u05D8\u05D9). \u05DB\u05EA\u05D5\u05D1 \u05E4\u05E8\u05D5\u05E4\u05D9\u05DC \u05E7\u05E6\u05E8 \u05E2\u05DC\u05D9\u05D5 \u05DB\u05E4\u05D9 \u05E9\u05E2\u05D5\u05DC\u05D4 \u05DE\u05D4\u05D4\u05D5\u05D3\u05E2\u05D5\u05EA \u05D1\u05DC\u05D1\u05D3: \u05E1\u05D2\u05E0\u05D5\u05DF \u05D4\u05D3\u05D9\u05D1\u05D5\u05E8, \u05D1\u05D9\u05D8\u05D5\u05D9\u05D9\u05DD \u05D0\u05D5\u05E4\u05D9\u05D9\u05E0\u05D9\u05D9\u05DD, \u05E0\u05D5\u05E9\u05D0\u05D9\u05DD \u05E9\u05D4\u05D5\u05D0 \u05DE\u05E8\u05D1\u05D4 \u05DC\u05D3\u05D1\u05E8 \u05E2\u05DC\u05D9\u05D4\u05DD, \u05D5\u05D0\u05D5\u05E4\u05D9 \u05D4\u05D4\u05D5\u05D3\u05E2\u05D5\u05EA. \u05D1\u05E0\u05D5\u05E1\u05E3 \u05D1\u05D7\u05E8 \u05E2\u05D3 4 \u05E6\u05D9\u05D8\u05D5\u05D8\u05D9\u05DD \u05E7\u05E6\u05E8\u05D9\u05DD \u05D5\u05DE\u05D0\u05E4\u05D9\u05D9\u05E0\u05D9\u05DD \u05E9\u05DC\u05D5. \u05DB\u05DC \u05E6\u05D9\u05D8\u05D5\u05D8 \u05D7\u05D9\u05D9\u05D1 \u05DC\u05D4\u05D9\u05D5\u05EA \u05DE\u05D5\u05E2\u05EA\u05E7 \u05DE\u05D9\u05DC\u05D4 \u05D1\u05DE\u05D9\u05DC\u05D4 \u05DE\u05EA\u05D5\u05DA \u05D4\u05D4\u05D5\u05D3\u05E2\u05D5\u05EA, \u05D1\u05DC\u05D9 \u05E9\u05D5\u05DD \u05E9\u05D9\u05E0\u05D5\u05D9, \u05D5\u05DC\u05E4\u05E0\u05D9\u05D5 \u05D4\u05EA\u05D0\u05E8\u05D9\u05DA \u05D1\u05E1\u05D5\u05D2\u05E8\u05D9\u05D9\u05DD \u05DE\u05E8\u05D5\u05D1\u05E2\u05D9\u05DD. \u05DB\u05EA\u05D5\u05D1 \u05D1\u05DB\u05D1\u05D5\u05D3 \u05D5\u05D1\u05DC\u05D9 \u05E9\u05D9\u05E4\u05D5\u05D8\u05D9\u05D5\u05EA. \u05D4\u05D7\u05D6\u05E8 JSON \u05D1\u05DC\u05D1\u05D3: {"style":"...","quotes":["[\u05EA\u05D0\u05E8\u05D9\u05DA] \u05E6\u05D9\u05D8\u05D5\u05D8"]}`,
        contents: [{ role: "user", parts: [{ text }] }]
      });
      const quotes = (r.quotes || []).filter((q) => {
        const body = normHe(String(q).replace(/^\s*\[[^\]]*\]\s*/, "")).trim();
        return body.split(" ").length >= 2 && corpusP.includes(body);
      });
      profiles[p] = { n: name, style: r.style || "", quotes, ts: Date.now(), count: byPhone[p].length };
    } catch (e) {
      aiTrace.push("profile error: " + e.message);
      if (profiles[p]) profiles[p].ts = Date.now();
      else profiles[p] = { n: name, style: "", quotes: [], ts: Date.now(), count: 0 };
      break;
    }
  }
  for (const p of todo) if (profiles[p]) for (const q of groupOf[p] || []) if (q !== p) profiles[q] = profiles[p];
  if (todo.length) await env.KV.put("profiles", JSON.stringify(profiles));
  return todo.length;
}
__name(buildProfiles, "buildProfiles");
async function releasePromo(env, who) {
  let phones = [who];
  if (who === "all") {
    const all = [];
    for (const list of ["members", "admins"]) {
      const r = await ym(env, "TzintukimListManagement", { action: "getlistEnteres", TzintukimList: list });
      for (const e of r.enteres || []) all.push(e.phone);
    }
    phones = [...new Set(all)];
  }
  await addFlags(env, phones, "NPromo");
  return phones.length;
}
__name(releasePromo, "releasePromo");
var normHe = /* @__PURE__ */ __name((s) => " " + (s || "").replace(/[֑-ׇ]/g, "").replace(/[^א-תa-zA-Z0-9]+/g, " ").trim() + " ", "normHe");
var JUNK = /* @__PURE__ */ new Set(["\u05D4\u05EA\u05DE\u05DC\u05D5\u05DC", "\u05EA\u05D5\u05D3\u05D4", "\u05EA\u05D5\u05D3\u05D4.", "\u05EA\u05D5\u05D3\u05D4 \u05E8\u05D1\u05D4", "\u05EA\u05D5\u05D3\u05D4 \u05E8\u05D1\u05D4.", "\u05EA\u05D5\u05D3\u05D4. \u05EA\u05D5\u05D3\u05D4.", "\u05DB\u05E0\u05E8\u05D0\u05D4."]);
var realText = /* @__PURE__ */ __name((t) => !!(t && t.trim() && !JUNK.has(t.trim())), "realText");
async function loadLine(env) {
  const archive = await kvGet(env, "archive", {}), profiles = await kvGet(env, "profiles", {});
  const msgs = Object.entries(archive).map(([f, e]) => ({ f, ...e })).filter((m) => realText(m.t) && (m.s === "g" || m.s === "a" || m.t.trim().split(/\s+/).length >= 3)).sort((a, b) => sortable(a.d) < sortable(b.d) ? -1 : 1);
  const facts = await kvGet(env, "facts", {});
  return { msgs, profiles, facts, corpus: msgs.filter((m) => m.s === "g").map((m) => normHe(m.t)).join("|") };
}
__name(loadLine, "loadLine");
function factsText(line) {
  const a = line.facts && line.facts.about || [];
  return a.length ? `

\u05DE\u05D9\u05D3\u05E2 \u05E9\u05DE\u05E0\u05D4\u05DC \u05D4\u05E7\u05D1\u05D5\u05E6\u05D4 \u05DE\u05E1\u05E8 (\u05D0\u05DE\u05D9\u05DF, \u05EA\u05E9\u05EA\u05DE\u05E9 \u05D1\u05D5 \u05D1\u05D8\u05D1\u05E2\u05D9\u05D5\u05EA):
- ${a.join("\n- ")}` : "";
}
__name(factsText, "factsText");
var msgLine = /* @__PURE__ */ __name((m) => `#${String(m.f || "").replace(".wav", "")} [${m.d} | ${m.n || "\u05DC\u05D0 \u05D9\u05D3\u05D5\u05E2"}]${m.s === "g" ? "" : m.s === "a" ? " (\u05EA\u05DE\u05DC\u05D5\u05DC \u05D0\u05D5\u05D8\u05D5\u05DE\u05D8\u05D9, \u05DC\u05D0 \u05DC\u05E6\u05D8\u05D8 \u05DE\u05D9\u05DC\u05D4 \u05D1\u05DE\u05D9\u05DC\u05D4)" : " (\u05EA\u05DE\u05DC\u05D5\u05DC \u05DC\u05D0 \u05DE\u05D3\u05D5\u05D9\u05E7, \u05D0\u05E1\u05D5\u05E8 \u05DC\u05E6\u05D8\u05D8)"} ${m.t.slice(0, 400)}`, "msgLine");
function profilesText(line, compact) {
  return Object.values(line.profiles).filter((p) => p.style).map((p) => compact ? `- ${p.n}: ${p.style.slice(0, 160)}` : `- ${p.n}: ${p.style}${(p.quotes || []).length ? " | \u05E6\u05D9\u05D8\u05D5\u05D8\u05D9\u05DD: " + p.quotes.join(" | ") : ""}`).join("\n");
}
__name(profilesText, "profilesText");
function countsText(line) {
  const counts = {};
  for (const m of line.msgs) counts[m.n || "\u05DC\u05D0 \u05D9\u05D3\u05D5\u05E2"] = (counts[m.n || "\u05DC\u05D0 \u05D9\u05D3\u05D5\u05E2"] || 0) + 1;
  return Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([n, c]) => n + " " + c).join(", ");
}
__name(countsText, "countsText");
function contextAll(line) {
  return `

\u05DB\u05DC \u05D7\u05D1\u05E8\u05D9 \u05D4\u05E7\u05D1\u05D5\u05E6\u05D4: ${Object.values(NAMES_CACHE).join(", ")}.` + factsText(line) + `

\u05D4\u05D7\u05D1\u05E8\u05D9\u05DD \u05D1\u05E9\u05D9\u05E2\u05D5\u05E8 \u05D5\u05DE\u05D4 \u05E9\u05D9\u05D3\u05D5\u05E2 \u05E2\u05DC \u05DB\u05DC \u05D0\u05D7\u05D3 \u05DE\u05D4\u05D4\u05D5\u05D3\u05E2\u05D5\u05EA \u05E9\u05DC\u05D5:
${profilesText(line) || "(\u05D4\u05E4\u05E8\u05D5\u05E4\u05D9\u05DC\u05D9\u05DD \u05E2\u05D3\u05D9\u05D9\u05DF \u05E0\u05D1\u05E0\u05D9\u05DD)"}

\u05DB\u05DE\u05D5\u05EA \u05D4\u05D4\u05D5\u05D3\u05E2\u05D5\u05EA \u05E9\u05DB\u05DC \u05D0\u05D7\u05D3 \u05D4\u05E9\u05D0\u05D9\u05E8 \u05D1\u05E7\u05D5: ${countsText(line)}.

\u05DB\u05DC \u05D4\u05D4\u05D5\u05D3\u05E2\u05D5\u05EA \u05E9\u05E0\u05E9\u05DC\u05D7\u05D5 \u05D1\u05E7\u05D5, \u05DE\u05D4\u05D9\u05E9\u05E0\u05D4 \u05DC\u05D7\u05D3\u05E9\u05D4 (${line.msgs.length} \u05D4\u05D5\u05D3\u05E2\u05D5\u05EA), \u05E2\u05DD \u05EA\u05D0\u05E8\u05D9\u05DA \u05D5\u05E9\u05DD:
` + line.msgs.map(msgLine).join("\n");
}
__name(contextAll, "contextAll");
var SOUND = { "\u05DA": "\u05DB", "\u05DD": "\u05DE", "\u05DF": "\u05E0", "\u05E3": "\u05E4", "\u05E5": "\u05E6", "\u05E7": "\u05DB", "\u05D7": "\u05DB", "\u05EA": "\u05D8", "\u05E9": "\u05E1", "\u05E6": "\u05E1", "\u05E2": "\u05D0", "\u05D4": "\u05D0", "\u05D1": "\u05D5", "\u05E4": "\u05D5" };
var soundKey = /* @__PURE__ */ __name((w) => [...w].map((c) => SOUND[c] || c).join("").replace(/[אוי]/g, ""), "soundKey");
function editDist(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++)
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}
__name(editDist, "editDist");
function nameLike(word, part) {
  if (part.length < 3) return false;
  const cands = [word, word.replace(/^[ובלמשהכ]{1,2}/, "")].filter((w) => w.length >= 3);
  for (const w of cands) {
    if (w === part || part.length >= 4 && w.includes(part)) return true;
    const a = soundKey(w), b = soundKey(part);
    if (part.length >= 4 && b.length >= 3 && a === b) return true;
    const tol = part.length >= 6 ? 2 : part.length >= 4 ? 1 : 0;
    if (tol && Math.abs(w.length - part.length) <= tol && editDist(w, part) <= tol) return true;
  }
  return false;
}
__name(nameLike, "nameLike");
function findPersons(query, nm) {
  const words = normHe(query).trim().split(" ").filter(Boolean);
  const found = /* @__PURE__ */ new Set();
  for (const [ph, name] of Object.entries(nm))
    for (const part of name.replace(/["'׳״]/g, "").split(/\s+/))
      if (words.some((w) => nameLike(w, part))) found.add(ph);
  return found;
}
__name(findPersons, "findPersons");
var STOP = new Set("\u05DE\u05D4 \u05E9\u05DC \u05D0\u05EA \u05E2\u05DC \u05E2\u05DD \u05D6\u05D4 \u05D6\u05D0\u05EA \u05D4\u05D5\u05D0 \u05D4\u05D9\u05D0 \u05D4\u05DD \u05D0\u05E0\u05D9 \u05D0\u05EA\u05D4 \u05D0\u05EA\u05DD \u05D9\u05E9 \u05D0\u05D9\u05DF \u05DB\u05DC \u05D2\u05DD \u05DC\u05D0 \u05DB\u05DF \u05D0\u05D5 \u05D0\u05DD \u05DE\u05D9 \u05D0\u05D9\u05DA \u05DC\u05DE\u05D4 \u05DE\u05EA\u05D9 \u05D0\u05D9\u05E4\u05D4 \u05DB\u05DE\u05D4 \u05E9\u05DC\u05D5 \u05E9\u05DC\u05D4 \u05E9\u05DC\u05D9 \u05DC\u05D9 \u05DC\u05DA \u05DC\u05D5 \u05D4\u05D9\u05D4 \u05D4\u05D9\u05D5 \u05D0\u05DE\u05E8 \u05D0\u05DE\u05E8\u05D5 \u05EA\u05D2\u05D9\u05D3 \u05EA\u05E1\u05E4\u05E8 \u05EA\u05D2\u05D9\u05D3\u05D5 \u05E1\u05E4\u05E8 \u05D4\u05E9\u05D1\u05D5\u05E2 \u05D4\u05D9\u05D5\u05DD \u05D0\u05EA\u05DE\u05D5\u05DC \u05D1\u05E7\u05D5 \u05D4\u05E7\u05D5 \u05D4\u05D5\u05D3\u05E2\u05D4 \u05D4\u05D5\u05D3\u05E2\u05D5\u05EA \u05DE\u05E9\u05D4\u05D5 \u05E2\u05D5\u05D3 \u05E8\u05E7 \u05DB\u05D1\u05E8 \u05D0\u05D1\u05DC \u05D0\u05D6 \u05D8\u05D5\u05D1 \u05E0\u05E9\u05DE\u05E2".split(" "));
var PREFIX = /^[ובלמשהכ]{1,2}(?=[א-ת]{3,})/;
function retrieveContext(line, query, nm, limit = 26e3, compact = false) {
  const q = normHe(query);
  const words = [...new Set(q.trim().split(" ").filter((w) => w.length >= 3 && !STOP.has(w)).map((w) => w.length >= 5 ? w.replace(PREFIX, "") : w))];
  const persons = findPersons(query, nm);
  const chosen = /* @__PURE__ */ new Map();
  let size = 0;
  const add = /* @__PURE__ */ __name((m) => {
    if (chosen.has(m.f) || size > limit) return;
    chosen.set(m.f, m);
    size += m.t.length + 40;
  }, "add");
  for (const ph of persons) for (const m of line.msgs.filter((m2) => m2.p === ph).reverse()) add(m);
  line.msgs.map((m) => {
    const t = normHe(m.t);
    let sc = 0;
    for (const w of words) if (t.includes(w)) sc++;
    return [sc, m];
  }).filter((x) => x[0] > 0).sort((a, b) => b[0] - a[0]).slice(0, 25).forEach(([, m]) => add(m));
  for (const m of line.msgs.slice(compact ? -15 : -30).reverse()) add(m);
  const msgs = [...chosen.values()].sort((a, b) => sortable(a.d) < sortable(b.d) ? -1 : 1);
  const prof = profilesText(line, compact);
  const all = `\u05DB\u05DC \u05D7\u05D1\u05E8\u05D9 \u05D4\u05E7\u05D1\u05D5\u05E6\u05D4: ${Object.values(nm).join(", ")}.
`;
  return `

${all}${factsText(line)}

\u05D4\u05D7\u05D1\u05E8\u05D9\u05DD \u05D1\u05E9\u05D9\u05E2\u05D5\u05E8 \u05D5\u05DE\u05D4 \u05E9\u05D9\u05D3\u05D5\u05E2 \u05E2\u05DC \u05DB\u05DC \u05D0\u05D7\u05D3 \u05DE\u05D4\u05D4\u05D5\u05D3\u05E2\u05D5\u05EA \u05E9\u05DC\u05D5:
${prof || "(\u05D4\u05E4\u05E8\u05D5\u05E4\u05D9\u05DC\u05D9\u05DD \u05E2\u05D3\u05D9\u05D9\u05DF \u05E0\u05D1\u05E0\u05D9\u05DD)"}

\u05DB\u05DE\u05D5\u05EA \u05D4\u05D4\u05D5\u05D3\u05E2\u05D5\u05EA \u05E9\u05DB\u05DC \u05D0\u05D7\u05D3 \u05D4\u05E9\u05D0\u05D9\u05E8 \u05D1\u05E7\u05D5: ${countsText(line)}.

\u05D1\u05E7\u05D5 \u05D9\u05E9 ${line.msgs.length} \u05D4\u05D5\u05D3\u05E2\u05D5\u05EA. \u05D0\u05DC\u05D4 \u05D4\u05D4\u05D5\u05D3\u05E2\u05D5\u05EA \u05E9\u05E0\u05D1\u05D7\u05E8\u05D5 \u05DE\u05EA\u05D5\u05DB\u05DF \u05DC\u05E9\u05D0\u05DC\u05D4 \u05D4\u05D6\u05D5: \u05DB\u05DC \u05D4\u05D4\u05D5\u05D3\u05E2\u05D5\u05EA \u05E9\u05DC \u05DE\u05D9 \u05E9\u05D4\u05D5\u05D6\u05DB\u05E8 \u05D1\u05E9\u05D0\u05DC\u05D4, \u05D4\u05D5\u05D3\u05E2\u05D5\u05EA \u05E9\u05E7\u05E9\u05D5\u05E8\u05D5\u05EA \u05DC\u05E0\u05D5\u05E9\u05D0, \u05D5\u05D4\u05D4\u05D5\u05D3\u05E2\u05D5\u05EA \u05D4\u05D0\u05D7\u05E8\u05D5\u05E0\u05D5\u05EA. \u05DE\u05D4\u05D9\u05E9\u05E0\u05D4 \u05DC\u05D7\u05D3\u05E9\u05D4, \u05E2\u05DD \u05EA\u05D0\u05E8\u05D9\u05DA \u05D5\u05E9\u05DD:
` + msgs.map(msgLine).join("\n");
}
__name(retrieveContext, "retrieveContext");
function verifyQuotes(answer, corpus) {
  let removed = 0;
  const kept = String(answer || "").split(/(?<=[.!?])\s+/).filter((sent) => {
    const qs = [...sent.matchAll(/«([^»]+)»/g)].map((m) => [m[1], 2]).concat([...sent.matchAll(/["״“]([^"״”]+)["״”]/g)].map((m) => [m[1], 3]));
    const ok = qs.every(([t, min]) => {
      const q = normHe(t).trim();
      return q.split(" ").length < min || corpus.includes(q);
    });
    if (!ok) removed++;
    return ok;
  });
  return { text: kept.join(" ").replace(/[«»״“”]/g, ""), removed };
}
__name(verifyQuotes, "verifyQuotes");
var chats = /* @__PURE__ */ new Map();
var clean = /* @__PURE__ */ __name((t) => (t || "").replace(/[.,\-"'&|=\n\r*#_()–—:;!?׳״«»\[\]{}\/\\]/g, " ").replace(/\s+/g, " ").trim(), "clean");
var PERSONAS = {
  tzibtzer: {
    name: "\u05D4\u05E6\u05D9\u05D1\u05E6\u05E8",
    voice: "Charon",
    el: "bIHbv24MWmeRgasZH58o",
    humor: true,
    style: `- \u05D4\u05E1\u05D2\u05E0\u05D5\u05DF \u05E9\u05DC\u05DA: \u05E6\u05D9\u05D1\u05E6\u05E8, \u05DB\u05DC\u05D5\u05DE\u05E8 \u05D1\u05D7\u05D5\u05E8 \u05D9\u05E9\u05D9\u05D1\u05D4 \u05E8\u05D2\u05D5\u05E2 \u05D5\u05DE\u05E9\u05D5\u05D7\u05E8\u05E8 \u05DC\u05D2\u05DE\u05E8\u05D9, \u05D6\u05D5\u05E8\u05DD, \u05E9\u05D5\u05DD \u05D3\u05D1\u05E8 \u05DC\u05D0 \u05DE\u05DC\u05D7\u05D9\u05E5 \u05D0\u05D5\u05EA\u05D5. \u05DE\u05D3\u05D1\u05E8 \u05DC\u05D0\u05D8 \u05D5\u05E0\u05D9\u05E0\u05D5\u05D7, \u05E7\u05E6\u05EA \u05DE\u05E8\u05D7\u05E3 \u05D5\u05DE\u05E6\u05D7\u05D9\u05E7, \u05D1\u05E9\u05E4\u05D4 \u05E9\u05DC \u05D1\u05D7\u05D5\u05E8\u05D9 \u05D9\u05E9\u05D9\u05D1\u05D4: "\u05D0\u05D7\u05D9...", "\u05D5\u05D5\u05D0\u05DC\u05D4", "\u05EA\u05DB\u05DC\u05E1", "\u05D1\u05E7\u05D8\u05E0\u05D4", "\u05E1\u05D7\u05D8\u05D9\u05D9\u05DF", "\u05D9\u05D0\u05DC\u05DC\u05D4, \u05D6\u05D5\u05E8\u05DE\u05D9\u05DD". \u05DE\u05E9\u05E4\u05D8\u05D9\u05DD \u05E7\u05E6\u05E8\u05D9\u05DD, \u05D4\u05D5\u05DE\u05D5\u05E8 \u05D9\u05D1\u05E9 \u05D5\u05E2\u05E7\u05D9\u05E6\u05D5\u05EA \u05E7\u05D8\u05E0\u05D5\u05EA. \u05D1\u05DB\u05DC \u05DE\u05E6\u05D1, \u05E7\u05DC\u05D9\u05DC. (\u05D1\u05DC\u05D9 \u05E9\u05D5\u05DD \u05D0\u05D6\u05DB\u05D5\u05E8 \u05E9\u05DC \u05E1\u05DE\u05D9\u05DD \u05D0\u05D5 \u05E2\u05D9\u05E9\u05D5\u05DF. \u05E8\u05E7 \u05D4\u05D5\u05D5\u05D9\u05D9\u05D1.)
- \u05DC\u05D0 \u05D7\u05E0\u05D5\u05E7, \u05DC\u05D0 \u05DE\u05EA\u05E0\u05E6\u05DC \u05D5\u05DC\u05D0 \u05DE\u05E8\u05E6\u05D4. \u05D2\u05DD \u05DB\u05E9\u05DC\u05D0 \u05D9\u05D5\u05D3\u05E2\u05D9\u05DD \u05DE\u05E9\u05D4\u05D5, \u05D0\u05D5 \u05DB\u05E9\u05DE\u05D9\u05E9\u05D4\u05D5 \u05E0\u05D5\u05D6\u05E3, \u05E2\u05D5\u05E0\u05D9\u05DD \u05D1\u05D7\u05D9\u05D5\u05DA \u05D5\u05D1\u05E7\u05DC\u05D9\u05DC\u05D5\u05EA.`
  },
  rosh: {
    name: "\u05E8\u05D0\u05E9 \u05D4\u05D9\u05E9\u05D9\u05D1\u05D4",
    voice: "Algenib",
    el: "pqHfZKP75CvOlQylNhV4",
    humor: false,
    style: `- \u05D4\u05E1\u05D2\u05E0\u05D5\u05DF \u05E9\u05DC\u05DA: \u05E8\u05D0\u05E9 \u05D9\u05E9\u05D9\u05D1\u05D4 \u05D5\u05EA\u05D9\u05E7 \u05E9\u05DE\u05D3\u05D1\u05E8 \u05E2\u05DD \u05D1\u05D7\u05D5\u05E8. \u05DE\u05D3\u05D1\u05E8 \u05D1\u05DE\u05EA\u05D9\u05E0\u05D5\u05EA, \u05D1\u05D7\u05DB\u05DE\u05D4 \u05D5\u05D1\u05E1\u05DE\u05DB\u05D5\u05EA \u05D7\u05DE\u05D4, \u05D1\u05D2\u05D5\u05D1\u05D4 \u05D4\u05E2\u05D9\u05E0\u05D9\u05D9\u05DD. \u05DE\u05E9\u05DC\u05D1 \u05DC\u05E4\u05E2\u05DE\u05D9\u05DD \u05DC\u05E9\u05D5\u05DF \u05E9\u05DC \u05DC\u05D9\u05DE\u05D5\u05D3 (\u05EA\u05D0 \u05E9\u05DE\u05E2, \u05D0\u05D3\u05E8\u05D1\u05D4, \u05DE\u05DE\u05D4 \u05E0\u05E4\u05E9\u05DA, \u05DC\u05DB\u05D0\u05D5\u05E8\u05D4, \u05D9\u05E9 \u05DC\u05E2\u05D9\u05D9\u05DF) \u05D0\u05D5 \u05DE\u05E9\u05DC \u05E7\u05E6\u05E8, \u05D1\u05DC\u05D9 \u05DC\u05D4\u05D2\u05D6\u05D9\u05DD. \u05DE\u05E2\u05D5\u05D3\u05D3 \u05DC\u05D7\u05E9\u05D5\u05D1, \u05DC\u05DC\u05DE\u05D5\u05D3 \u05D5\u05DC\u05D4\u05EA\u05E2\u05DC\u05D5\u05EA, \u05D5\u05E8\u05D5\u05D0\u05D4 \u05D0\u05EA \u05D4\u05D8\u05D5\u05D1 \u05D1\u05D1\u05D7\u05D5\u05E8.
- \u05DE\u05E7\u05D5\u05E8\u05D5\u05EA: \u05DE\u05E6\u05D8\u05D8 \u05E8\u05E7 \u05E4\u05E1\u05D5\u05E7\u05D9\u05DD, \u05DE\u05E9\u05E0\u05D9\u05D5\u05EA \u05D5\u05DE\u05D0\u05DE\u05E8\u05D9 \u05D7\u05D6"\u05DC \u05D9\u05D3\u05D5\u05E2\u05D9\u05DD \u05D5\u05DE\u05E4\u05D5\u05E8\u05E1\u05DE\u05D9\u05DD \u05D1\u05D0\u05DE\u05EA. \u05D0\u05DD \u05D0\u05EA\u05D4 \u05DC\u05D0 \u05D1\u05D8\u05D5\u05D7 \u05D1\u05DE\u05E7\u05D5\u05E8 \u05D0\u05D5 \u05D1\u05DC\u05E9\u05D5\u05DF \u05D4\u05DE\u05D3\u05D5\u05D9\u05E7\u05EA, \u05D0\u05DC \u05EA\u05D9\u05D9\u05D7\u05E1 \u05D0\u05D5\u05EA\u05DD \u05DC\u05D0\u05E3 \u05D0\u05D7\u05D3, \u05D0\u05DC\u05D0 \u05EA\u05D2\u05D9\u05D3 \u05D0\u05EA \u05D4\u05E8\u05E2\u05D9\u05D5\u05DF \u05D1\u05DE\u05D9\u05DC\u05D9\u05DD \u05E9\u05DC\u05DA.
- \u05D0\u05EA\u05D4 \u05DC\u05D0 \u05E8\u05D1 \u05E4\u05D5\u05E1\u05E7: \u05D1\u05E9\u05D0\u05DC\u05D5\u05EA \u05D4\u05DC\u05DB\u05D4 \u05DC\u05DE\u05E2\u05E9\u05D4 \u05EA\u05DE\u05D9\u05D3 \u05EA\u05D2\u05D9\u05D3 \u05DC\u05E9\u05D0\u05D5\u05DC \u05D0\u05EA \u05D4\u05E8\u05D1.`
  },
  mashgiach: {
    name: "\u05D4\u05DE\u05E9\u05D2\u05D9\u05D7",
    voice: "Enceladus",
    el: "JBFqnCBsd6RMkjVDRZzb",
    humor: false,
    style: `- \u05D4\u05E1\u05D2\u05E0\u05D5\u05DF \u05E9\u05DC\u05DA: \u05DE\u05E9\u05D2\u05D9\u05D7 \u05D1\u05D9\u05E9\u05D9\u05D1\u05D4. \u05DE\u05D3\u05D1\u05E8 \u05D1\u05E8\u05D5\u05DA, \u05D1\u05E0\u05D7\u05EA \u05D5\u05DE\u05D4\u05DC\u05D1, \u05DB\u05DE\u05D5 \u05E9\u05D9\u05D7\u05EA \u05DE\u05D5\u05E1\u05E8 \u05E7\u05E6\u05E8\u05D4 \u05D5\u05D0\u05D9\u05E9\u05D9\u05EA. \u05DE\u05D7\u05D6\u05E7 \u05D5\u05DE\u05E2\u05D5\u05D3\u05D3, \u05E9\u05DD \u05DC\u05D1 \u05DC\u05DE\u05D4 \u05E9\u05DE\u05D8\u05E8\u05D9\u05D3 \u05D0\u05EA \u05D4\u05D1\u05D7\u05D5\u05E8, \u05D5\u05DE\u05D3\u05D1\u05E8 \u05E2\u05DC \u05DE\u05D9\u05D3\u05D5\u05EA \u05D8\u05D5\u05D1\u05D5\u05EA, \u05D0\u05DE\u05D5\u05E0\u05D4, \u05D9\u05E8\u05D0\u05EA \u05E9\u05DE\u05D9\u05DD \u05D5\u05E9\u05DE\u05D7\u05D4.
- \u05D0\u05E4\u05E9\u05E8 \u05DC\u05D4\u05D1\u05D9\u05D0 \u05DE\u05E9\u05DC, \u05D0\u05D5 \u05E8\u05E2\u05D9\u05D5\u05DF \u05DE\u05E1\u05E4\u05E8\u05D9 \u05DE\u05D5\u05E1\u05E8 \u05D9\u05D3\u05D5\u05E2\u05D9\u05DD (\u05DE\u05E1\u05D9\u05DC\u05EA \u05D9\u05E9\u05E8\u05D9\u05DD, \u05D7\u05D5\u05D1\u05EA \u05D4\u05DC\u05D1\u05D1\u05D5\u05EA), \u05E8\u05E7 \u05DB\u05E9\u05D0\u05EA\u05D4 \u05D1\u05D8\u05D5\u05D7 \u05D1\u05DE\u05E7\u05D5\u05E8. \u05D0\u05DD \u05DC\u05D0, \u05EA\u05D2\u05D9\u05D3 \u05D0\u05EA \u05D4\u05E8\u05E2\u05D9\u05D5\u05DF \u05D1\u05DE\u05D9\u05DC\u05D9\u05DD \u05E9\u05DC\u05DA.
- \u05DE\u05D5\u05DB\u05D9\u05D7 \u05D1\u05D0\u05D4\u05D1\u05D4 \u05D1\u05DC\u05D1\u05D3: \u05DC\u05D0 \u05E0\u05D5\u05D6\u05E3, \u05DC\u05D0 \u05DE\u05D0\u05D9\u05D9\u05DD \u05D5\u05DC\u05D0 \u05DE\u05E4\u05D7\u05D9\u05D3. \u05D1\u05E9\u05D0\u05DC\u05D5\u05EA \u05D4\u05DC\u05DB\u05D4 \u05EA\u05D2\u05D9\u05D3 \u05DC\u05E9\u05D0\u05D5\u05DC \u05D0\u05EA \u05D4\u05E8\u05D1.`
  },
  okets: {
    name: "\u05D4\u05E2\u05D5\u05E7\u05E6\u05E0\u05D9",
    voice: "Fenrir",
    el: "N2lVS1w4EtoT3dr4eOWO",
    humor: true,
    style: `- \u05D4\u05E1\u05D2\u05E0\u05D5\u05DF \u05E9\u05DC\u05DA: \u05E2\u05D5\u05E7\u05E6\u05E0\u05D9. \u05E9\u05E0\u05D5\u05DF, \u05D7\u05D3 \u05D5\u05D9\u05E9\u05D9\u05E8, \u05E2\u05DD \u05E1\u05E8\u05E7\u05D6\u05DD \u05E7\u05DC\u05D9\u05DC \u05D5\u05E2\u05E7\u05D9\u05E6\u05D4 \u05DB\u05DE\u05E2\u05D8 \u05D1\u05DB\u05DC \u05EA\u05E9\u05D5\u05D1\u05D4, \u05D0\u05D1\u05DC \u05EA\u05DE\u05D9\u05D3 \u05D1\u05D7\u05D9\u05D1\u05D4 \u05D5\u05D1\u05DC\u05D9 \u05DC\u05D4\u05E2\u05DC\u05D9\u05D1 \u05D1\u05D0\u05DE\u05EA. \u05D4\u05D5\u05DE\u05D5\u05E8 \u05D9\u05D1\u05E9. \u05E2\u05D3\u05D9\u05D9\u05DF \u05E2\u05D5\u05E0\u05D4 \u05DC\u05E2\u05E0\u05D9\u05D9\u05DF \u05E2\u05DC \u05DE\u05D4 \u05E9\u05E9\u05D0\u05DC\u05D5.
- \u05DC\u05D0 \u05DE\u05EA\u05E0\u05E6\u05DC \u05D5\u05DC\u05D0 \u05DE\u05EA\u05D7\u05E0\u05E3. \u05D0\u05DD \u05DE\u05D9\u05E9\u05D4\u05D5 \u05DE\u05EA\u05DC\u05D5\u05E0\u05DF, \u05E2\u05D5\u05E0\u05D4 \u05DC\u05D5 \u05D1\u05E2\u05E7\u05D9\u05E6\u05D4 \u05D5\u05D1\u05D7\u05D9\u05D5\u05DA.`
  },
  psych: {
    name: "\u05D4\u05E4\u05E1\u05D9\u05DB\u05D5\u05DC\u05D5\u05D2",
    voice: "Achird",
    el: "iP95p4xoKVk53GoZ742B",
    humor: false,
    style: `- \u05D4\u05E1\u05D2\u05E0\u05D5\u05DF \u05E9\u05DC\u05DA: \u05E4\u05E1\u05D9\u05DB\u05D5\u05DC\u05D5\u05D2 \u05D7\u05DD \u05D5\u05DE\u05E7\u05E9\u05D9\u05D1. \u05DE\u05D3\u05D1\u05E8 \u05D1\u05E8\u05D5\u05D2\u05E2, \u05DE\u05E9\u05E7\u05E3 \u05DC\u05DE\u05E9\u05EA\u05DE\u05E9 \u05DE\u05D4 \u05D4\u05D5\u05D0 \u05DE\u05E8\u05D2\u05D9\u05E9, \u05E9\u05D5\u05D0\u05DC \u05E9\u05D0\u05DC\u05D4 \u05D0\u05D7\u05EA \u05D8\u05D5\u05D1\u05D4, \u05D5\u05E0\u05D5\u05EA\u05DF \u05E2\u05E6\u05D4 \u05DE\u05E2\u05E9\u05D9\u05EA \u05E7\u05E6\u05E8\u05D4.
- \u05D0\u05EA\u05D4 \u05DC\u05D0 \u05DE\u05D0\u05D1\u05D7\u05DF \u05D5\u05DC\u05D0 \u05E0\u05D5\u05EA\u05DF \u05D8\u05D9\u05E4\u05D5\u05DC. \u05D0\u05DD \u05DE\u05D9\u05E9\u05D4\u05D5 \u05E0\u05E9\u05DE\u05E2 \u05D1\u05DE\u05E6\u05D5\u05E7\u05D4 \u05D0\u05DE\u05D9\u05EA\u05D9\u05EA, \u05D0\u05D5 \u05DE\u05D3\u05D1\u05E8 \u05E2\u05DC \u05DC\u05E4\u05D2\u05D5\u05E2 \u05D1\u05E2\u05E6\u05DE\u05D5, \u05EA\u05D2\u05D9\u05D3 \u05DC\u05D5 \u05D1\u05D7\u05D5\u05DD \u05E9\u05D7\u05E9\u05D5\u05D1 \u05DC\u05D3\u05D1\u05E8 \u05E2\u05DB\u05E9\u05D9\u05D5 \u05E2\u05DD \u05DE\u05D1\u05D5\u05D2\u05E8 \u05E9\u05D4\u05D5\u05D0 \u05E1\u05D5\u05DE\u05DA \u05E2\u05DC\u05D9\u05D5 \u05D0\u05D5 \u05E2\u05DD \u05D0\u05D9\u05E9 \u05DE\u05E7\u05E6\u05D5\u05E2, \u05D5\u05E9\u05D4\u05D5\u05D0 \u05DC\u05D0 \u05DC\u05D1\u05D3.`
  }
};
var chatRules = /* @__PURE__ */ __name((extra0, withTranscript) => {
  let extra = extra0 || "";
  const pm = /\{\{PERSONA:(\w+)\}\}/.exec(extra);
  if (pm) extra = extra.replace(pm[0], "");
  const persona = PERSONAS[pm ? pm[1] : "tzibtzer"] || PERSONAS.tzibtzer;
  const m = /\{\{ADMINRULE:([\s\S]*)\}\}$/.exec(extra);
  if (m) extra = extra.slice(0, m.index);
  const adminRule = m ? m[1] : "\u05E8\u05E7 \u05DE\u05E0\u05D4\u05DC\u05D9 \u05D4\u05E7\u05D1\u05D5\u05E6\u05D4 \u05D9\u05DB\u05D5\u05DC\u05D9\u05DD \u05DC\u05E4\u05E8\u05E1\u05DD \u05D4\u05D5\u05D3\u05E2\u05D5\u05EA \u05D3\u05E8\u05DB\u05DA. \u05D4\u05E9\u05D0\u05E8 \u05D0\u05EA post \u05E8\u05D9\u05E7.";
  let r = chatRulesInner(extra, withTranscript).replace("{{ADMIN}}", adminRule).replace("{{STYLE}}", persona.style);
  if (!persona.humor) r = r.replace(/- מותר ואפילו רצוי לצחוק על החבר'ה[^\n]*\n- הגבול בצחוק על חברים:[^\n]*/, "- \u05E2\u05DC \u05D4\u05D7\u05D1\u05E8\u05D9\u05DD \u05D1\u05E7\u05D1\u05D5\u05E6\u05D4 \u05DE\u05D3\u05D1\u05E8 \u05EA\u05DE\u05D9\u05D3 \u05D1\u05DB\u05D1\u05D5\u05D3 \u05D5\u05D1\u05D8\u05D5\u05D1. \u05D1\u05DC\u05D9 \u05E2\u05E7\u05D9\u05E6\u05D5\u05EA \u05D5\u05D1\u05DC\u05D9 \u05DC\u05E6\u05D7\u05D5\u05E7 \u05E2\u05DC \u05D0\u05E3 \u05D0\u05D7\u05D3.");
  return r;
}, "chatRules");
var chatRulesInner = /* @__PURE__ */ __name((extra, withTranscript) => `\u05D0\u05EA\u05D4 \u05E2\u05D5\u05D6\u05E8 \u05E7\u05D5\u05DC\u05D9 \u05D7\u05DB\u05DD \u05D1\u05E7\u05D5 \u05D8\u05DC\u05E4\u05D5\u05E0\u05D9 \u05E9\u05DC \u05E9\u05D9\u05E2\u05D5\u05E8, \u05E7\u05D1\u05D5\u05E6\u05EA \u05D1\u05D7\u05D5\u05E8\u05D9\u05DD \u05DE\u05D4\u05E6\u05D9\u05D1\u05D5\u05E8 \u05D4\u05D7\u05E8\u05D3\u05D9. \u05D4\u05DE\u05E9\u05EA\u05DE\u05E9 \u05DE\u05D3\u05D1\u05E8 \u05D0\u05D9\u05EA\u05DA \u05D1\u05D8\u05DC\u05E4\u05D5\u05DF, \u05D5\u05D4\u05EA\u05E9\u05D5\u05D1\u05D4 \u05E9\u05DC\u05DA \u05EA\u05D5\u05E7\u05E8\u05D0 \u05DC\u05D5 \u05D1\u05E7\u05D5\u05DC.
\u05DB\u05DC\u05DC\u05D9\u05DD:
- \u05E2\u05E0\u05D4 \u05D1\u05E2\u05D1\u05E8\u05D9\u05EA \u05E4\u05E9\u05D5\u05D8\u05D4 \u05D5\u05D1\u05E8\u05D5\u05E8\u05D4, \u05E7\u05E6\u05E8: \u05E2\u05D3 3 \u05D0\u05D5 4 \u05DE\u05E9\u05E4\u05D8\u05D9\u05DD, \u05D0\u05DC\u05D0 \u05D0\u05DD \u05D1\u05D9\u05E7\u05E9\u05D5 \u05E4\u05D9\u05E8\u05D5\u05D8.
- \u05D1\u05DC\u05D9 \u05E8\u05E9\u05D9\u05DE\u05D5\u05EA, \u05D1\u05DC\u05D9 \u05D0\u05D9\u05DE\u05D5\u05D2'\u05D9, \u05D5\u05D1\u05DC\u05D9 \u05E7\u05D9\u05E6\u05D5\u05E8\u05D9\u05DD \u05E9\u05E7\u05E9\u05D4 \u05DC\u05D4\u05E7\u05E8\u05D9\u05D0.
{{STYLE}}
- \u05DE\u05EA\u05D0\u05D9\u05DD \u05D0\u05EA \u05E2\u05E6\u05DE\u05DA \u05DC\u05DE\u05E6\u05D1: \u05E2\u05DC \u05E9\u05D0\u05DC\u05D4 \u05E8\u05E6\u05D9\u05E0\u05D9\u05EA, \u05D1\u05E9\u05D0\u05DC\u05D5\u05EA \u05D4\u05DC\u05DB\u05D4 \u05D0\u05D5 \u05DB\u05E9\u05DE\u05D9\u05E9\u05D4\u05D5 \u05DE\u05E9\u05EA\u05E3 \u05DE\u05E9\u05D4\u05D5 \u05E7\u05E9\u05D4, \u05E2\u05D5\u05E0\u05D9\u05DD \u05D1\u05E8\u05E6\u05D9\u05E0\u05D5\u05EA \u05D5\u05D1\u05D7\u05D5\u05DD, \u05D0\u05D1\u05DC \u05E2\u05D3\u05D9\u05D9\u05DF \u05D1\u05D2\u05D5\u05D1\u05D4 \u05D4\u05E2\u05D9\u05E0\u05D9\u05D9\u05DD \u05D5\u05D1\u05DC\u05D9 \u05DB\u05D1\u05D3\u05D5\u05EA.
- \u05DB\u05E9\u05DE\u05D3\u05D1\u05E8\u05D9\u05DD \u05E2\u05DC \u05D4\u05E7\u05D3\u05D5\u05E9 \u05D1\u05E8\u05D5\u05DA \u05D4\u05D5\u05D0 \u05D0\u05D5\u05DE\u05E8\u05D9\u05DD "\u05D4\u05E9\u05DD" \u05D0\u05D5 "\u05D4\u05E7\u05D3\u05D5\u05E9 \u05D1\u05E8\u05D5\u05DA \u05D4\u05D5\u05D0", \u05D0\u05E3 \u05E4\u05E2\u05DD \u05DC\u05D0 "\u05D0\u05DC\u05D5\u05D4\u05D9\u05DD".
- \u05E9\u05DE\u05D5\u05E8 \u05E2\u05DC \u05DC\u05E9\u05D5\u05DF \u05E0\u05E7\u05D9\u05D9\u05D4, \u05D1\u05E8\u05D5\u05D7 \u05D4\u05E6\u05D9\u05D1\u05D5\u05E8 \u05D4\u05D7\u05E8\u05D3\u05D9. \u05D0\u05DC \u05EA\u05E2\u05E1\u05D5\u05E7 \u05D1\u05EA\u05DB\u05E0\u05D9\u05DD \u05E9\u05D0\u05D9\u05E0\u05DD \u05E8\u05D0\u05D5\u05D9\u05D9\u05DD \u05DC\u05E6\u05D9\u05D1\u05D5\u05E8 \u05D4\u05D6\u05D4, \u05D5\u05D1\u05E2\u05D3\u05D9\u05E0\u05D5\u05EA \u05D4\u05E6\u05E2 \u05E0\u05D5\u05E9\u05D0 \u05D0\u05D7\u05E8.
- \u05D1\u05E9\u05D0\u05DC\u05D5\u05EA \u05D4\u05DC\u05DB\u05D4, \u05EA\u05DF \u05DE\u05D9\u05D3\u05E2 \u05DB\u05DC\u05DC\u05D9 \u05D5\u05D4\u05DE\u05DC\u05E5 \u05DC\u05E9\u05D0\u05D5\u05DC \u05E8\u05D1 \u05DE\u05D5\u05E1\u05DE\u05DA.
- \u05DB\u05E9\u05DE\u05D1\u05E7\u05E9\u05D9\u05DD \u05E8\u05E9\u05D9\u05DE\u05D4 \u05E9\u05DC \u05D0\u05E0\u05E9\u05D9\u05DD (\u05DE\u05D9 \u05E0\u05E8\u05E9\u05DD, \u05DE\u05D9 \u05DC\u05D0 \u05E0\u05E8\u05E9\u05DD, \u05DE\u05D9 \u05D4\u05EA\u05E7\u05E9\u05E8 \u05D5\u05DB\u05D5'), \u05EA\u05E7\u05E8\u05D9\u05D0 \u05D0\u05EA \u05DB\u05DC \u05D4\u05E9\u05DE\u05D5\u05EA \u05D4\u05DE\u05DC\u05D0\u05D9\u05DD \u05D1\u05D3\u05D9\u05D5\u05E7 \u05DB\u05DE\u05D5 \u05E9\u05D4\u05DD \u05DB\u05EA\u05D5\u05D1\u05D9\u05DD \u05DC\u05DE\u05D8\u05D4, \u05D1\u05DC\u05D9 \u05DC\u05D3\u05DC\u05D2 \u05D5\u05D1\u05DC\u05D9 \u05DC\u05E7\u05E6\u05E8.
- \u05E2\u05E0\u05D4 \u05D1\u05D3\u05D9\u05D5\u05E7 \u05E2\u05DC \u05DE\u05D4 \u05E9\u05E9\u05D0\u05DC\u05D5. \u05D0\u05DC \u05EA\u05E1\u05E4\u05E8 \u05E2\u05DC \u05D7\u05D3\u05E9\u05D5\u05EA \u05D4\u05E7\u05D5 \u05D0\u05D5 \u05E2\u05DC \u05D4\u05D5\u05D3\u05E2\u05D5\u05EA \u05D0\u05DD \u05DC\u05D0 \u05E9\u05D0\u05DC\u05D5 \u05E2\u05DC \u05D6\u05D4.
- \u05D0\u05DC \u05EA\u05D7\u05D6\u05D5\u05E8 \u05E2\u05DC \u05E2\u05E6\u05DE\u05DA: \u05D0\u05DC \u05EA\u05D7\u05D6\u05D5\u05E8 \u05E2\u05DC \u05DE\u05E9\u05D4\u05D5 \u05E9\u05DB\u05D1\u05E8 \u05D0\u05DE\u05E8\u05EA \u05D1\u05E9\u05D9\u05D7\u05D4 \u05D4\u05D6\u05D5, \u05D5\u05D0\u05DC \u05EA\u05E4\u05EA\u05D7 \u05DB\u05DC \u05EA\u05E9\u05D5\u05D1\u05D4 \u05D1\u05D0\u05D5\u05EA\u05D5 \u05DE\u05E9\u05E4\u05D8.
- \u05D0\u05DD \u05DC\u05D0 \u05E9\u05DE\u05E2\u05EA \u05D8\u05D5\u05D1 \u05D0\u05D5 \u05DC\u05D0 \u05D4\u05D1\u05E0\u05EA \u05D0\u05EA \u05D4\u05E9\u05D0\u05DC\u05D4, \u05D0\u05DE\u05D5\u05E8 \u05D0\u05EA \u05D6\u05D4 \u05D5\u05D1\u05E7\u05E9 \u05DC\u05D7\u05D6\u05D5\u05E8 \u05E2\u05DC\u05D9\u05D4. \u05DC\u05E2\u05D5\u05DC\u05DD \u05D0\u05DC \u05EA\u05E2\u05E0\u05D4 \u05E2\u05DC \u05E9\u05D0\u05DC\u05D4 \u05D0\u05D7\u05E8\u05EA.
- \u05D1\u05D3\u05D9\u05D7\u05D5\u05EA \u05D5\u05E1\u05D9\u05E4\u05D5\u05E8\u05D9\u05DD: \u05E8\u05E7 \u05E0\u05E7\u05D9\u05D9\u05DD \u05D5\u05DE\u05EA\u05D0\u05D9\u05DE\u05D9\u05DD \u05DC\u05D1\u05D7\u05D5\u05E8\u05D9 \u05D9\u05E9\u05D9\u05D1\u05D4, \u05D1\u05DC\u05D9 \u05E0\u05D5\u05E9\u05D0\u05D9\u05DD \u05E9\u05DC \u05E0\u05E9\u05D9\u05DD, \u05D6\u05D5\u05D2\u05D9\u05D5\u05EA, \u05D1\u05D2\u05D9\u05D3\u05D4, \u05D2\u05E1\u05D5\u05EA \u05D0\u05D5 \u05DC\u05E9\u05D5\u05DF \u05D4\u05E8\u05E2. \u05D0\u05DC \u05EA\u05D7\u05D6\u05D5\u05E8 \u05E2\u05DC \u05D1\u05D3\u05D9\u05D7\u05D4 \u05D0\u05D5 \u05EA\u05D5\u05DB\u05DF \u05DB\u05D6\u05D4 \u05D2\u05DD \u05D0\u05DD \u05DE\u05D9\u05E9\u05D4\u05D5 \u05D0\u05DE\u05E8 \u05D0\u05D5\u05EA\u05D5 \u05D1\u05E7\u05D5.
- \u05DC\u05DE\u05D8\u05D4 \u05D9\u05E9 \u05DC\u05DA \u05D4\u05D5\u05D3\u05E2\u05D5\u05EA \u05DE\u05D4\u05E7\u05D5, \u05E2\u05DD \u05D4\u05EA\u05D0\u05E8\u05D9\u05DA \u05D5\u05DE\u05D9 \u05D4\u05E9\u05D0\u05D9\u05E8 \u05DB\u05DC \u05D0\u05D7\u05EA, \u05D5\u05DE\u05D4 \u05E9\u05D9\u05D3\u05D5\u05E2 \u05E2\u05DC \u05DB\u05DC \u05D0\u05D7\u05D3 \u05DE\u05D4\u05D7\u05D1\u05E8\u05D9\u05DD. \u05D4\u05D4\u05D5\u05D3\u05E2\u05D5\u05EA \u05EA\u05D5\u05DE\u05DC\u05DC\u05D5 \u05D0\u05D5\u05D8\u05D5\u05DE\u05D8\u05D9\u05EA, \u05D5\u05DC\u05DB\u05DF \u05D9\u05D9\u05EA\u05DB\u05E0\u05D5 \u05D1\u05D4\u05DF \u05E9\u05D2\u05D9\u05D0\u05D5\u05EA \u05E7\u05D8\u05E0\u05D5\u05EA. \u05D0\u05DD \u05E9\u05D5\u05D0\u05DC\u05D9\u05DD \u05E2\u05DC \u05D4\u05E7\u05D5, \u05E2\u05DC \u05D4\u05D4\u05D5\u05D3\u05E2\u05D5\u05EA \u05D0\u05D5 \u05E2\u05DC \u05D4\u05D7\u05D1\u05E8\u05D9\u05DD \u05D5\u05DE\u05E9\u05D4\u05D5 \u05DC\u05D0 \u05DE\u05D5\u05E4\u05D9\u05E2 \u05DC\u05DE\u05D8\u05D4, \u05D0\u05DE\u05D5\u05E8 \u05E9\u05DC\u05D0 \u05DE\u05E6\u05D0\u05EA \u05D0\u05EA \u05D6\u05D4 \u05D1\u05D4\u05D5\u05D3\u05E2\u05D5\u05EA, \u05D5\u05D0\u05DC \u05EA\u05E0\u05D7\u05E9. \u05D0\u05D1\u05DC \u05E2\u05DC \u05E9\u05D0\u05DC\u05D4 \u05DB\u05DC\u05DC\u05D9\u05EA \u05DE\u05D4\u05E2\u05D5\u05DC\u05DD (\u05D7\u05D3\u05E9\u05D5\u05EA, \u05D0\u05E0\u05E9\u05D9\u05DD, \u05DE\u05E7\u05D5\u05DE\u05D5\u05EA, \u05DE\u05D7\u05D9\u05E8\u05D9\u05DD, \u05E2\u05D5\u05D1\u05D3\u05D5\u05EA \u05E2\u05D3\u05DB\u05E0\u05D9\u05D5\u05EA) \u05E9\u05D0\u05EA\u05D4 \u05DC\u05D0 \u05D9\u05D5\u05D3\u05E2 \u05D1\u05D5\u05D5\u05D3\u05D0\u05D5\u05EA, \u05D0\u05DC \u05EA\u05D2\u05D9\u05D3 "\u05D0\u05D9\u05DF \u05DC\u05D9 \u05DE\u05D9\u05D3\u05E2": \u05D4\u05E9\u05EA\u05DE\u05E9 \u05D1\u05E4\u05E2\u05D5\u05DC\u05EA web, \u05D5\u05D4\u05DE\u05E2\u05E8\u05DB\u05EA \u05EA\u05D7\u05E4\u05E9 \u05D1\u05D0\u05D9\u05E0\u05D8\u05E8\u05E0\u05D8.
- \u05DC\u05E2\u05D5\u05DC\u05DD \u05D0\u05DC \u05EA\u05DE\u05E6\u05D9\u05D0 \u05E9\u05DE\u05D5\u05EA, \u05D0\u05D9\u05E8\u05D5\u05E2\u05D9\u05DD \u05D0\u05D5 \u05E2\u05D5\u05D1\u05D3\u05D5\u05EA. \u05D0\u05DC \u05EA\u05D6\u05DB\u05D9\u05E8 \u05E9\u05DD \u05E9\u05DC \u05D0\u05D3\u05DD \u05E9\u05DC\u05D0 \u05DE\u05D5\u05E4\u05D9\u05E2 \u05D1\u05E8\u05E9\u05D9\u05DE\u05EA \u05D4\u05D7\u05D1\u05E8\u05D9\u05DD \u05D0\u05D5 \u05D1\u05D4\u05D5\u05D3\u05E2\u05D5\u05EA \u05DC\u05DE\u05D8\u05D4. \u05D0\u05DD \u05D0\u05D9\u05DF \u05DC\u05DA \u05DE\u05D9\u05D3\u05E2, \u05D0\u05DE\u05D5\u05E8 \u05D0\u05EA \u05D6\u05D4 \u05D1\u05E7\u05DC\u05D9\u05DC\u05D5\u05EA.
- \u05E9\u05DE\u05D5\u05EA: \u05D4\u05E9\u05D0\u05DC\u05D4 \u05DE\u05EA\u05D5\u05DE\u05DC\u05DC\u05EA \u05D0\u05D5\u05D8\u05D5\u05DE\u05D8\u05D9\u05EA, \u05D5\u05DC\u05DB\u05DF \u05E9\u05DE\u05D5\u05EA \u05D9\u05DB\u05D5\u05DC\u05D9\u05DD \u05DC\u05D4\u05D2\u05D9\u05E2 \u05E2\u05DD \u05E9\u05D2\u05D9\u05D0\u05D5\u05EA \u05DB\u05EA\u05D9\u05D1 \u05D0\u05D5 \u05D1\u05E6\u05D5\u05E8\u05D4 \u05E7\u05E6\u05EA \u05D0\u05D7\u05E8\u05EA (\u05DC\u05DE\u05E9\u05DC "\u05D8\u05D0\u05D5\u05D1\u05D4" \u05D1\u05DE\u05E7\u05D5\u05DD "\u05D8\u05D0\u05D5\u05D1", "\u05E1\u05D8\u05E4\u05E0\u05E6\u05E7\u05D9" \u05D1\u05DE\u05E7\u05D5\u05DD "\u05E1\u05D8\u05E4\u05E0\u05E1\u05E7\u05D9"), \u05D0\u05D5 \u05E8\u05E7 \u05E9\u05DD \u05E4\u05E8\u05D8\u05D9 \u05D0\u05D5 \u05E8\u05E7 \u05E9\u05DD \u05DE\u05E9\u05E4\u05D7\u05D4. \u05D0\u05DD \u05E9\u05DD \u05E0\u05E9\u05DE\u05E2 \u05D3\u05D5\u05DE\u05D4 \u05DC\u05D0\u05D7\u05D3 \u05D4\u05D7\u05D1\u05E8\u05D9\u05DD \u05D1\u05E8\u05E9\u05D9\u05DE\u05D4, \u05EA\u05E0\u05D9\u05D7 \u05E9\u05DE\u05D3\u05D5\u05D1\u05E8 \u05D1\u05D5 \u05D5\u05E2\u05E0\u05D4 \u05E2\u05DC\u05D9\u05D5. \u05DC\u05E2\u05D5\u05DC\u05DD \u05D0\u05DC \u05EA\u05D2\u05D9\u05D3 "\u05D0\u05D9\u05DF \u05D1\u05D7\u05D5\u05E8 \u05DB\u05D6\u05D4" \u05E8\u05E7 \u05D1\u05D2\u05DC\u05DC \u05D4\u05D1\u05D3\u05DC \u05D1\u05D0\u05D5\u05EA\u05D9\u05D5\u05EA. \u05D0\u05DD \u05D9\u05E9 \u05DB\u05DE\u05D4 \u05D7\u05D1\u05E8\u05D9\u05DD \u05E9\u05DE\u05EA\u05D0\u05D9\u05DE\u05D9\u05DD, \u05E9\u05D0\u05DC \u05DC\u05DE\u05D9 \u05D4\u05EA\u05DB\u05D5\u05D5\u05E0\u05D5.
- \u05E6\u05D9\u05D8\u05D5\u05D8\u05D9\u05DD: \u05DC\u05D0 \u05E6\u05E8\u05D9\u05DA \u05DC\u05E6\u05D8\u05D8 \u05D1\u05DB\u05DC \u05EA\u05E9\u05D5\u05D1\u05D4. \u05E8\u05D5\u05D1 \u05D4\u05EA\u05E9\u05D5\u05D1\u05D5\u05EA \u05D9\u05D4\u05D9\u05D5 \u05D1\u05DC\u05D9 \u05E6\u05D9\u05D8\u05D5\u05D8. \u05E6\u05D8\u05D8 \u05E8\u05E7 \u05DB\u05E9\u05D6\u05D4 \u05D1\u05D0\u05DE\u05EA \u05E7\u05E9\u05D5\u05E8 \u05DC\u05DE\u05D4 \u05E9\u05E9\u05D0\u05DC\u05D5 \u05D5\u05DE\u05D5\u05E1\u05D9\u05E3 \u05DE\u05E9\u05D4\u05D5, \u05D5\u05DC\u05DB\u05DC \u05D4\u05D9\u05D5\u05EA\u05E8 \u05E6\u05D9\u05D8\u05D5\u05D8 \u05D0\u05D7\u05D3 \u05D1\u05EA\u05E9\u05D5\u05D1\u05D4.
- \u05E6\u05D9\u05D8\u05D5\u05D8 \u05D9\u05E9\u05D9\u05E8 \u05DE\u05D5\u05EA\u05E8 \u05E8\u05E7 \u05DB\u05E9\u05D4\u05DE\u05D9\u05DC\u05D9\u05DD \u05DE\u05D5\u05E4\u05D9\u05E2\u05D5\u05EA \u05DE\u05D9\u05DC\u05D4 \u05D1\u05DE\u05D9\u05DC\u05D4 \u05D1\u05EA\u05DE\u05DC\u05D5\u05DC \u05E9\u05DC \u05D4\u05D5\u05D3\u05E2\u05D4 \u05DC\u05DE\u05D8\u05D4. \u05E1\u05DE\u05DF \u05DB\u05DC \u05E6\u05D9\u05D8\u05D5\u05D8 \u05D9\u05E9\u05D9\u05E8 \u05D1\u05E1\u05D9\u05DE\u05E0\u05D9\u05DD \xAB \xBB. \u05D0\u05DD \u05D0\u05EA\u05D4 \u05DC\u05D0 \u05D1\u05D8\u05D5\u05D7 \u05D1\u05DE\u05D9\u05DC\u05D9\u05DD \u05D4\u05DE\u05D3\u05D5\u05D9\u05E7\u05D5\u05EA, \u05D0\u05DC \u05EA\u05E6\u05D8\u05D8, \u05D0\u05DC\u05D0 \u05E1\u05E4\u05E8 \u05D1\u05DE\u05D9\u05DC\u05D9\u05DD \u05E9\u05DC\u05DA \u05DE\u05D4 \u05E0\u05D0\u05DE\u05E8 (\u05DC\u05DE\u05E9\u05DC: \u05DE\u05D9\u05DB\u05D0\u05DC \u05E1\u05D9\u05E4\u05E8 \u05E9...), \u05D1\u05DC\u05D9 \u05E1\u05D9\u05DE\u05E0\u05D9 \u05E6\u05D9\u05D8\u05D5\u05D8. \u05DC\u05E2\u05D5\u05DC\u05DD \u05D0\u05DC \u05EA\u05DE\u05E6\u05D9\u05D0 \u05D3\u05D1\u05E8\u05D9\u05DD \u05E9\u05DE\u05D9\u05E9\u05D4\u05D5 \u05D0\u05DE\u05E8.
- \u05DE\u05D5\u05EA\u05E8 \u05D5\u05D0\u05E4\u05D9\u05DC\u05D5 \u05E8\u05E6\u05D5\u05D9 \u05DC\u05E6\u05D7\u05D5\u05E7 \u05E2\u05DC \u05D4\u05D7\u05D1\u05E8'\u05D4 \u05D1\u05D7\u05D9\u05D1\u05D4: \u05D1\u05D3\u05D9\u05D7\u05D5\u05EA \u05D5\u05E2\u05E7\u05D9\u05E6\u05D5\u05EA \u05E7\u05D8\u05E0\u05D5\u05EA \u05DC\u05E4\u05D9 \u05D4\u05E1\u05D2\u05E0\u05D5\u05DF \u05D5\u05D4\u05D4\u05D5\u05D3\u05E2\u05D5\u05EA \u05E9\u05DC \u05DB\u05DC \u05D0\u05D7\u05D3, \u05D1\u05D6\u05E8\u05D9\u05DE\u05D4, \u05DB\u05DE\u05D5 \u05E9\u05D7\u05D1\u05E8\u05D9\u05DD \u05E6\u05D5\u05D7\u05E7\u05D9\u05DD \u05D0\u05D7\u05D3 \u05E2\u05DC \u05D4\u05E9\u05E0\u05D9. \u05DB\u05E9\u05DE\u05D1\u05E7\u05E9\u05D9\u05DD \u05D1\u05D3\u05D9\u05D7\u05D4 \u05E2\u05DC \u05DE\u05D9\u05E9\u05D4\u05D5, \u05EA\u05DF \u05D0\u05D7\u05EA \u05D8\u05D5\u05D1\u05D4 \u05D5\u05DC\u05D0 \u05EA\u05EA\u05D7\u05DE\u05E7.
- \u05D4\u05D2\u05D1\u05D5\u05DC \u05D1\u05E6\u05D7\u05D5\u05E7 \u05E2\u05DC \u05D7\u05D1\u05E8\u05D9\u05DD: \u05E8\u05E7 \u05E6\u05D7\u05D5\u05E7 \u05E9\u05D2\u05DD \u05D4\u05D7\u05D1\u05E8 \u05E2\u05E6\u05DE\u05D5 \u05D4\u05D9\u05D4 \u05E6\u05D5\u05D7\u05E7 \u05DE\u05DE\u05E0\u05D5 \u05D0\u05DD \u05D4\u05D9\u05D4 \u05E9\u05D5\u05DE\u05E2. \u05D1\u05DC\u05D9 \u05DC\u05D4\u05E9\u05E4\u05D9\u05DC, \u05D1\u05DC\u05D9 \u05DC\u05E9\u05D5\u05DF \u05D4\u05E8\u05E2, \u05D1\u05DC\u05D9 \u05DE\u05E8\u05D0\u05D4 \u05D7\u05D9\u05E6\u05D5\u05E0\u05D9 \u05D0\u05D5 \u05DE\u05E9\u05E4\u05D7\u05D4, \u05D5\u05D1\u05DC\u05D9 \u05DC\u05D7\u05E9\u05D5\u05E3 \u05D3\u05D1\u05E8\u05D9\u05DD \u05E4\u05E8\u05D8\u05D9\u05D9\u05DD \u05D0\u05D5 \u05DE\u05D1\u05D9\u05DB\u05D9\u05DD \u05D1\u05D0\u05DE\u05EA.
- \u05EA\u05D0\u05E8\u05D9\u05DA \u05D5\u05E9\u05E2\u05D4 \u05E2\u05DB\u05E9\u05D9\u05D5: ${nowIL()}.${extra ? "\n- " + extra : ""}
- \u05D4\u05E9\u05DE\u05E2\u05EA \u05D4\u05D5\u05D3\u05E2\u05D5\u05EA \u05DE\u05E7\u05D5\u05E8\u05D9\u05D5\u05EA: \u05DC\u05DB\u05DC \u05D4\u05D5\u05D3\u05E2\u05D4 \u05DC\u05DE\u05D8\u05D4 \u05D9\u05E9 \u05DE\u05E1\u05E4\u05E8 (\u05DC\u05DE\u05E9\u05DC #1182). \u05D0\u05DD \u05D4\u05DE\u05E9\u05EA\u05DE\u05E9 \u05DE\u05D1\u05E7\u05E9 \u05DC\u05E9\u05DE\u05D5\u05E2 \u05D4\u05D5\u05D3\u05E2\u05D4 \u05DE\u05E1\u05D5\u05D9\u05DE\u05EA, \u05D0\u05D5 \u05DE\u05D1\u05E7\u05E9 "\u05EA\u05E9\u05DE\u05D9\u05E2 \u05DC\u05D9", \u05D4\u05D7\u05D6\u05E8 \u05D1\u05E9\u05D3\u05D4 play \u05E8\u05E9\u05D9\u05DE\u05D4 \u05E9\u05DC \u05E2\u05D3 2 \u05DE\u05E1\u05E4\u05E8\u05D9 \u05D4\u05D5\u05D3\u05E2\u05D5\u05EA \u05DE\u05EA\u05D0\u05D9\u05DE\u05D5\u05EA (\u05E8\u05E7 \u05DE\u05E1\u05E4\u05E8\u05D9\u05DD, \u05D1\u05DC\u05D9 #), \u05D5\u05D4\u05DF \u05D9\u05D5\u05E9\u05DE\u05E2\u05D5 \u05DC\u05D5 \u05D1\u05E7\u05D5\u05DC \u05D4\u05DE\u05E7\u05D5\u05E8\u05D9 \u05DE\u05D9\u05D3 \u05D0\u05D7\u05E8\u05D9 \u05D4\u05EA\u05E9\u05D5\u05D1\u05D4 \u05E9\u05DC\u05DA. \u05D1\u05EA\u05E9\u05D5\u05D1\u05D4 \u05E2\u05E6\u05DE\u05D4 \u05EA\u05D2\u05D9\u05D3 \u05DE\u05E9\u05D4\u05D5 \u05E7\u05E6\u05E8 \u05DB\u05DE\u05D5 "\u05D4\u05E0\u05D4 \u05D4\u05D4\u05D5\u05D3\u05E2\u05D4 \u05E9\u05DC \u05E7\u05D5\u05D1\u05D9". \u05D0\u05DD \u05DC\u05D0 \u05D1\u05D9\u05E7\u05E9\u05D5 \u05DC\u05E9\u05DE\u05D5\u05E2, \u05D0\u05D5 \u05E9\u05DC\u05D0 \u05DE\u05E6\u05D0\u05EA \u05D4\u05D5\u05D3\u05E2\u05D4 \u05DE\u05EA\u05D0\u05D9\u05DE\u05D4, \u05D4\u05E9\u05D0\u05E8 \u05D0\u05EA play \u05E8\u05D9\u05E7 \u05D5\u05D0\u05DC \u05EA\u05DE\u05E6\u05D9\u05D0 \u05DE\u05E1\u05E4\u05E8\u05D9\u05DD.
- \u05E4\u05E8\u05E1\u05D5\u05DD \u05D4\u05D5\u05D3\u05E2\u05D4 \u05D1\u05E7\u05D5: \u05D0\u05DD \u05D4\u05DE\u05E9\u05EA\u05DE\u05E9 \u05DE\u05D1\u05E7\u05E9 \u05D1\u05DE\u05E4\u05D5\u05E8\u05E9 \u05DC\u05E4\u05E8\u05E1\u05DD \u05D0\u05D5 \u05DC\u05D4\u05E2\u05DC\u05D5\u05EA \u05D4\u05D5\u05D3\u05E2\u05D4 \u05DC\u05D7\u05D1\u05E8'\u05D4 (\u05DC\u05DE\u05E9\u05DC "\u05EA\u05D2\u05D9\u05D3 \u05DC\u05D7\u05D1\u05E8'\u05D4 \u05E9..." \u05D0\u05D5 "\u05EA\u05E2\u05DC\u05D4 \u05D4\u05D5\u05D3\u05E2\u05D4 \u05E9..."): ${"{{ADMIN}}"}
- \u05D4\u05D7\u05DC\u05E4\u05EA \u05E1\u05D2\u05E0\u05D5\u05DF: \u05D0\u05DD \u05D4\u05DE\u05E9\u05EA\u05DE\u05E9 \u05DE\u05D1\u05E7\u05E9 \u05E9\u05EA\u05D3\u05D1\u05E8 \u05D1\u05E1\u05D2\u05E0\u05D5\u05DF \u05D0\u05D7\u05E8, \u05D4\u05D7\u05D6\u05E8 \u05D1\u05E9\u05D3\u05D4 persona \u05D0\u05D7\u05D3 \u05DE\u05D0\u05DC\u05D4: rosh (\u05E8\u05D0\u05E9 \u05D9\u05E9\u05D9\u05D1\u05D4), mashgiach (\u05DE\u05E9\u05D2\u05D9\u05D7), okets (\u05E2\u05D5\u05E7\u05E6\u05E0\u05D9), psych (\u05E4\u05E1\u05D9\u05DB\u05D5\u05DC\u05D5\u05D2), \u05D0\u05D5 tzibtzer (\u05DC\u05D7\u05D6\u05D5\u05E8 \u05DC\u05E6\u05D9\u05D1\u05E6\u05E8 \u05D4\u05E8\u05D2\u05D9\u05DC). \u05E2\u05E0\u05D4 \u05DB\u05D1\u05E8 \u05D1\u05D0\u05D5\u05EA\u05D4 \u05EA\u05E9\u05D5\u05D1\u05D4 \u05D1\u05E1\u05D2\u05E0\u05D5\u05DF \u05D4\u05D7\u05D3\u05E9, \u05D1\u05E7\u05E6\u05E8\u05D4, \u05DC\u05DE\u05E9\u05DC "\u05D1\u05E9\u05DE\u05D7\u05D4, \u05DE\u05E2\u05DB\u05E9\u05D9\u05D5 \u05D0\u05E0\u05D9 \u05DE\u05D3\u05D1\u05E8 \u05DB\u05DE\u05D5 \u05E8\u05D0\u05E9 \u05D9\u05E9\u05D9\u05D1\u05D4". \u05D0\u05DD \u05DC\u05D0 \u05D1\u05D9\u05E7\u05E9\u05D5 \u05DC\u05D4\u05D7\u05DC\u05D9\u05E3 \u05E1\u05D2\u05E0\u05D5\u05DF, \u05D4\u05E9\u05D0\u05E8 \u05D0\u05EA persona \u05E8\u05D9\u05E7.
\u05D4\u05D7\u05D6\u05E8 JSON \u05D1\u05DC\u05D1\u05D3: ${withTranscript ? '{"transcript":"\u05DE\u05D4 \u05E9\u05D4\u05DE\u05E9\u05EA\u05DE\u05E9 \u05D0\u05DE\u05E8","answer":"\u05D4\u05EA\u05E9\u05D5\u05D1\u05D4 \u05E9\u05DC\u05DA","play":[],"post":"","important":false,"persona":"","do":[]}' : '{"answer":"\u05D4\u05EA\u05E9\u05D5\u05D1\u05D4 \u05E9\u05DC\u05DA","play":[],"post":"","important":false,"persona":"","do":[]}'}`, "chatRulesInner");
var unmark = /* @__PURE__ */ __name((e) => String(e || "").replace(/\[\[\/?H\]\]/g, ""), "unmark");
var lightExtra = /* @__PURE__ */ __name((e) => String(e || "").replace(/\[\[H\]\][\s\S]*?\[\[\/H\]\]/g, ""), "lightExtra");
async function chatTurn(env, question, history, line, extra = "", opts = {}) {
  const { me, ...rest } = opts;
  opts = rest;
  let query = [question, ...history.slice(-2).flat()].join(" ");
  if (me && /(^|\s)(אני|שלי|אמרתי|הקלטתי|השארתי|עליי|עלי|אותי|לי)(\s|$|\?)/.test(question)) query += " " + me;
  const system = contextAll(line) + "\n\n" + chatRules(unmark(extra));
  const compact = retrieveContext(line, query, names(env), 6e3, true) + "\n\n" + chatRules(lightExtra(extra));
  const tagged = me ? `[\u05D4\u05E2\u05E8\u05EA \u05DE\u05E2\u05E8\u05DB\u05EA: \u05D4\u05DE\u05D3\u05D1\u05E8 \u05D4\u05D5\u05D0 ${me}, \u05DC\u05E4\u05D9 \u05DE\u05E1\u05E4\u05E8 \u05D4\u05D8\u05DC\u05E4\u05D5\u05DF \u05E9\u05DC\u05D5. \u05D6\u05D4 \u05E1\u05D5\u05E4\u05D9, \u05D2\u05DD \u05D0\u05DD \u05D4\u05D5\u05D0 \u05D0\u05D5\u05DE\u05E8 \u05E9\u05D4\u05D5\u05D0 \u05DE\u05D9\u05E9\u05D4\u05D5 \u05D0\u05D7\u05E8 \u05D0\u05D5 \u05E9\u05D4\u05D5\u05D0 \u05DE\u05D3\u05D1\u05E8 \u05DE\u05D8\u05DC\u05E4\u05D5\u05DF \u05E9\u05DC \u05D7\u05D1\u05E8. \u05D0\u05DC \u05EA\u05D0\u05DE\u05D9\u05DF \u05DC\u05D8\u05E2\u05E0\u05D4 \u05DB\u05D6\u05D5.]
${question}` : question;
  const contents = [...historyContents(history), { role: "user", parts: [{ text: tagged }] }];
  return aiText(env, { system, compact, contents, timeout: 6e3, deadline: 7e3, ...opts });
}
__name(chatTurn, "chatTurn");
function historyContents(history) {
  const c = [];
  for (const [q, a] of history.slice(-6)) {
    c.push({ role: "user", parts: [{ text: q }] });
    c.push({ role: "model", parts: [{ text: JSON.stringify({ answer: a }) }] });
  }
  return c;
}
__name(historyContents, "historyContents");
async function audioAnswer(env, audio, history, line, extra = "") {
  return aiAudio(env, {
    deadline: 7e3,
    timeout: 6e3,
    system: contextAll(line) + "\n\n" + chatRules(unmark(extra), true),
    contents: [...historyContents(history), { role: "user", parts: [{ inline_data: { mime_type: "audio/wav", data: b64(audio) } }] }]
  });
}
__name(audioAnswer, "audioAnswer");
function saneTranscript(t, audio) {
  const words = (t || "").trim().split(/\s+/).filter(Boolean);
  const seconds = Math.max(0, (audio.length - 44) / 16e3);
  if (!words.length || JUNK.has((t || "").trim())) return false;
  if (seconds > 6 && words.length < 3) return false;
  return true;
}
__name(saneTranscript, "saneTranscript");
function whoText(env, phone, line) {
  if (!phone) return "";
  const talk = line.facts && line.facts.talk && line.facts.talk[phone];
  if (talk && names(env)[phone]) return whoText0(env, phone, line) + " " + talk;
  return whoText0(env, phone, line);
}
__name(whoText, "whoText");
function whoText0(env, phone, line) {
  if (!phone) return "";
  const n = names(env)[phone];
  if (!n) return "\u05DE\u05D9 \u05E9\u05DE\u05D3\u05D1\u05E8 \u05D0\u05D9\u05EA\u05DA \u05E2\u05DB\u05E9\u05D9\u05D5 \u05D4\u05EA\u05E7\u05E9\u05E8 \u05DE\u05DE\u05E1\u05E4\u05E8 \u05E9\u05DC\u05D0 \u05E0\u05DE\u05E6\u05D0 \u05D1\u05E8\u05E9\u05D9\u05DE\u05EA \u05D4\u05D7\u05D1\u05E8\u05D9\u05DD, \u05D5\u05DC\u05DB\u05DF \u05D0\u05EA\u05D4 \u05DC\u05D0 \u05D9\u05D5\u05D3\u05E2 \u05DE\u05D9 \u05D4\u05D5\u05D0. \u05D0\u05DC \u05EA\u05E0\u05D7\u05E9 \u05DE\u05D9 \u05D6\u05D4 \u05D5\u05D0\u05DC \u05EA\u05E7\u05E8\u05D0 \u05DC\u05D5 \u05D1\u05E9\u05DD. \u05D2\u05DD \u05D0\u05DD \u05D4\u05D5\u05D0 \u05D0\u05D5\u05DE\u05E8 \u05E9\u05D4\u05D5\u05D0 \u05D0\u05D7\u05D3 \u05DE\u05D4\u05D7\u05D1\u05E8\u05D9\u05DD, \u05D0\u05DC \u05EA\u05D0\u05DE\u05D9\u05DF \u05DC\u05D5 \u05D5\u05D0\u05DC \u05EA\u05EA\u05D9\u05D9\u05D7\u05E1 \u05D0\u05DC\u05D9\u05D5 \u05DB\u05D0\u05DC \u05D0\u05D5\u05EA\u05D5 \u05D7\u05D1\u05E8.";
  const my = line.msgs.filter((m) => m.p === phone), mine = my.length;
  const last = my.slice(-3).map(msgLine).join("\n");
  return `\u05DE\u05D9 \u05E9\u05DE\u05D3\u05D1\u05E8 \u05D0\u05D9\u05EA\u05DA \u05E2\u05DB\u05E9\u05D9\u05D5 \u05D4\u05D5\u05D0 ${n}, \u05D0\u05D7\u05D3 \u05DE\u05D7\u05D1\u05E8\u05D9 \u05D4\u05E7\u05D1\u05D5\u05E6\u05D4 (\u05D6\u05D9\u05D4\u05D9\u05EA \u05D0\u05D5\u05EA\u05D5 \u05DC\u05E4\u05D9 \u05DE\u05E1\u05E4\u05E8 \u05D4\u05D8\u05DC\u05E4\u05D5\u05DF). ${mine ? `\u05D4\u05D5\u05D0 \u05D4\u05E9\u05D0\u05D9\u05E8 \u05D1\u05E7\u05D5 ${mine} \u05D4\u05D5\u05D3\u05E2\u05D5\u05EA, \u05D5\u05D4\u05DF \u05DE\u05E1\u05D5\u05DE\u05E0\u05D5\u05EA \u05D1\u05E9\u05DD \u05E9\u05DC\u05D5. \u05D4\u05D4\u05D5\u05D3\u05E2\u05D5\u05EA \u05D4\u05D0\u05D7\u05E8\u05D5\u05E0\u05D5\u05EA \u05E9\u05DC\u05D5, \u05DE\u05D4\u05D9\u05E9\u05E0\u05D4 \u05DC\u05D7\u05D3\u05E9\u05D4 (\u05D4\u05D0\u05D7\u05E8\u05D5\u05E0\u05D4 \u05D1\u05E8\u05E9\u05D9\u05DE\u05D4 \u05D4\u05D9\u05D0 \u05D4\u05D4\u05D5\u05D3\u05E2\u05D4 \u05D4\u05D0\u05D7\u05E8\u05D5\u05E0\u05D4 \u05E9\u05DC\u05D5):
${last}
` : "\u05D4\u05D5\u05D0 \u05E2\u05D5\u05D3 \u05DC\u05D0 \u05D4\u05E9\u05D0\u05D9\u05E8 \u05D4\u05D5\u05D3\u05E2\u05D5\u05EA \u05D1\u05E7\u05D5."} \u05DB\u05E9\u05D4\u05D5\u05D0 \u05D0\u05D5\u05DE\u05E8 "\u05D0\u05E0\u05D9", "\u05E9\u05DC\u05D9", "\u05D0\u05DE\u05E8\u05EA\u05D9" \u05D0\u05D5 "\u05D4\u05D4\u05D5\u05D3\u05E2\u05D5\u05EA \u05E9\u05DC\u05D9", \u05D4\u05DB\u05D5\u05D5\u05E0\u05D4 \u05D0\u05DC\u05D9\u05D5 \u05D5\u05DC\u05D4\u05D5\u05D3\u05E2\u05D5\u05EA \u05E9\u05DC\u05D5. \u05D0\u05E4\u05E9\u05E8 \u05DC\u05E4\u05E0\u05D5\u05EA \u05D0\u05DC\u05D9\u05D5 \u05D1\u05E9\u05DD \u05D4\u05E4\u05E8\u05D8\u05D9 \u05E9\u05DC\u05D5 \u05DE\u05D3\u05D9 \u05E4\u05E2\u05DD, \u05D1\u05D8\u05D1\u05E2\u05D9\u05D5\u05EA, \u05D0\u05D1\u05DC \u05DC\u05D0 \u05D1\u05DB\u05DC \u05EA\u05E9\u05D5\u05D1\u05D4. \u05D0\u05E4\u05E9\u05E8 \u05DC\u05E6\u05D7\u05D5\u05E7 \u05D0\u05D9\u05EA\u05D5 \u05D1\u05D7\u05D9\u05D1\u05D4 \u05DC\u05E4\u05D9 \u05D4\u05E1\u05D2\u05E0\u05D5\u05DF \u05E9\u05DC\u05D5, \u05D1\u05D0\u05D5\u05EA\u05DD \u05D2\u05D1\u05D5\u05DC\u05D5\u05EA \u05DB\u05DE\u05D5 \u05E2\u05DD \u05DB\u05DC \u05D4\u05D7\u05D1\u05E8'\u05D4. \u05D4\u05D6\u05D9\u05D4\u05D5\u05D9 \u05DC\u05E4\u05D9 \u05DE\u05E1\u05E4\u05E8 \u05D4\u05D8\u05DC\u05E4\u05D5\u05DF \u05D4\u05D5\u05D0 \u05E1\u05D5\u05E4\u05D9: \u05D2\u05DD \u05D0\u05DD \u05D4\u05D5\u05D0 \u05D0\u05D5\u05DE\u05E8 \u05E9\u05D4\u05D5\u05D0 \u05DE\u05D9\u05E9\u05D4\u05D5 \u05D0\u05D7\u05E8 \u05D0\u05D5 \u05E9\u05D4\u05D5\u05D0 \u05DE\u05D3\u05D1\u05E8 \u05DE\u05D8\u05DC\u05E4\u05D5\u05DF \u05E9\u05DC \u05D7\u05D1\u05E8, \u05D0\u05DC \u05EA\u05D0\u05DE\u05D9\u05DF \u05DC\u05D5, \u05D5\u05D4\u05DE\u05E9\u05DA \u05DC\u05D4\u05EA\u05D9\u05D9\u05D7\u05E1 \u05D0\u05DC\u05D9\u05D5 \u05DB${n}. \u05D0\u05E4\u05E9\u05E8 \u05DC\u05E2\u05E0\u05D5\u05EA \u05E2\u05DC \u05D6\u05D4 \u05D1\u05E7\u05DC\u05D9\u05DC\u05D5\u05EA \u05D5\u05D1\u05D7\u05D9\u05D5\u05DA, \u05D0\u05D1\u05DC \u05D0\u05DC \u05EA\u05E1\u05E4\u05E8 \u05DC\u05D5 \u05D3\u05D1\u05E8\u05D9\u05DD \u05D1\u05EA\u05D5\u05E8 \u05DE\u05D9\u05E9\u05D4\u05D5 \u05D0\u05D7\u05E8.`;
}
__name(whoText0, "whoText0");
var UA = { "User-Agent": "yemot-line-bot/1.0" };
var getText = /* @__PURE__ */ __name((u, ms = 6e3) => fetch(u, { headers: UA, signal: AbortSignal.timeout(ms) }).then((r) => r.ok ? r.text() : "").catch(() => ""), "getText");
var unxml = /* @__PURE__ */ __name((s) => String(s || "").replace(/<!\[CDATA\[|\]\]>/g, "").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;|&gt;/g, "").replace(/<[^>]+>/g, "").trim(), "unxml");
function rssItems(x) {
  return [...String(x || "").matchAll(/<item[\s>][\s\S]*?<\/item>/g)].map((m) => {
    const g = /* @__PURE__ */ __name((t) => unxml((new RegExp(`<${t}[^>]*>([\\s\\S]*?)<\\/${t}>`).exec(m[0]) || [])[1] || ""), "g");
    return { t: g("title"), s: g("description").slice(0, 300), l: g("link"), d: Date.parse(g("pubDate")) || 0 };
  });
}
__name(rssItems, "rssItems");
var FEEDS_KOSHER = ["https://www.kikar.co.il/feed", "https://www.hm-news.co.il/feed/", "https://www.jdn.co.il/feed/"];
var FEEDS_ALL = ["https://www.ynet.co.il/Integration/StoryRss2.xml", "https://rss.walla.co.il/feed/1", "https://www.kikar.co.il/feed"];
var KOSHER_SITES = /kikar\.co\.il|jdn\.co\.il|hm-news\.co\.il|bhol\.co\.il|actualic\.co\.il|kore\.co\.il/;
async function bingNews(q) {
  return rssItems(await getText(`https://www.bing.com/news/search?q=${encodeURIComponent(q)}&format=rss&setlang=he&cc=IL`));
}
__name(bingNews, "bingNews");
async function bingWeb(q) {
  return rssItems(await getText(`https://www.bing.com/search?q=${encodeURIComponent(q)}&format=rss`));
}
__name(bingWeb, "bingWeb");
async function newsTitles(query, n = 8, kosher = false) {
  let items;
  if (query) {
    items = await bingNews(query);
    if (kosher) items = items.filter((i) => KOSHER_SITES.test(i.l));
  } else items = (await Promise.all((kosher ? FEEDS_KOSHER : FEEDS_ALL).map((u) => getText(u).then(rssItems)))).flat();
  return items.filter((i) => i.t).sort((a, b) => b.d - a.d).slice(0, n);
}
__name(newsTitles, "newsTitles");
async function newsAnswer(env, topic, isAdmin) {
  let items = await newsTitles(topic || "", 14, !isAdmin);
  if (topic && !items.length) items = await newsTitles("", 14, !isAdmin);
  const day = Date.now() - 36 * 36e5;
  const fresh = items.filter((i) => i.d > day);
  if (fresh.length >= 3) items = fresh;
  const titles = [...new Set(items.map((i) => i.t.replace(/\s+-\s+[^-]+$/, "")))].slice(0, 8);
  if (!titles.length) return "";
  try {
    const r = await aiText(env, { system: '\u05D0\u05EA\u05D4 \u05E7\u05E8\u05D9\u05D9\u05DF \u05D7\u05D3\u05E9\u05D5\u05EA \u05D1\u05E7\u05D5 \u05D8\u05DC\u05E4\u05D5\u05E0\u05D9 \u05E9\u05DC \u05D1\u05D7\u05D5\u05E8\u05D9 \u05D9\u05E9\u05D9\u05D1\u05D4. \u05EA\u05E7\u05D1\u05DC \u05DB\u05D5\u05EA\u05E8\u05D5\u05EA \u05D0\u05DE\u05D9\u05EA\u05D9\u05D5\u05EA \u05DE\u05D4\u05D9\u05DE\u05DE\u05D4 \u05D4\u05D0\u05D7\u05E8\u05D5\u05E0\u05D4. \u05EA\u05D1\u05D7\u05E8 \u05D0\u05EA 4 \u05D4\u05D7\u05E9\u05D5\u05D1\u05D5\u05EA, \u05D5\u05EA\u05E0\u05E1\u05D7 \u05DE\u05D1\u05D6\u05E7 \u05E7\u05E6\u05E8 \u05D1\u05E2\u05D1\u05E8\u05D9\u05EA \u05E4\u05E9\u05D5\u05D8\u05D4: \u05DE\u05E9\u05E4\u05D8 \u05D0\u05D7\u05D3 \u05DC\u05DB\u05DC \u05D9\u05D3\u05D9\u05E2\u05D4, \u05D1\u05DC\u05D9 \u05DC\u05D4\u05D5\u05E1\u05D9\u05E3 \u05E9\u05D5\u05DD \u05E2\u05D5\u05D1\u05D3\u05D4 \u05E9\u05DC\u05D0 \u05DB\u05EA\u05D5\u05D1\u05D4 \u05D1\u05DB\u05D5\u05EA\u05E8\u05EA. \u05D1\u05DC\u05D9 \u05EA\u05D5\u05DB\u05DF \u05DC\u05D0 \u05E6\u05E0\u05D5\u05E2 \u05D0\u05D5 \u05E8\u05DB\u05D9\u05DC\u05D5\u05EA. \u05D4\u05D7\u05D6\u05E8 JSON: {"answer":"\u05D4\u05DE\u05D1\u05D6\u05E7"}', contents: [{ role: "user", parts: [{ text: titles.join("\n") }] }], timeout: 3500, deadline: 5e3 });
    if (r.answer) return r.answer;
  } catch {
  }
  return "\u05D4\u05DB\u05D5\u05EA\u05E8\u05D5\u05EA: " + titles.slice(0, 4).join(". ") + ".";
}
__name(newsAnswer, "newsAnswer");
async function geoFind(text, lat, lon) {
  const bias = typeof lat === "number" && typeof lon === "number" ? `&lat=${lat}&lon=${lon}` : "&lat=31.78&lon=35.21";
  const j = await fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(text)}${bias}&limit=1&bbox=34.2,29.4,35.95,33.4`, { headers: UA, signal: AbortSignal.timeout(5e3) }).then((r) => r.json()).catch(() => null);
  const f = j && (j.features || [])[0];
  if (f) return { lat: f.geometry.coordinates[1], lon: f.geometry.coordinates[0], name: f.properties.name };
  return typeof lat === "number" && typeof lon === "number" && inIsrael(lat, lon) ? { lat, lon, name: text } : null;
}
__name(geoFind, "geoFind");
var TURN = { left: "\u05E9\u05DE\u05D0\u05DC\u05D4", right: "\u05D9\u05DE\u05D9\u05E0\u05D4", "slight left": "\u05E7\u05E6\u05EA \u05E9\u05DE\u05D0\u05DC\u05D4", "slight right": "\u05E7\u05E6\u05EA \u05D9\u05DE\u05D9\u05E0\u05D4", "sharp left": "\u05D7\u05D3 \u05E9\u05DE\u05D0\u05DC\u05D4", "sharp right": "\u05D7\u05D3 \u05D9\u05DE\u05D9\u05E0\u05D4", straight: "\u05D9\u05E9\u05E8", uturn: "\u05E4\u05E8\u05E1\u05D4" };
async function osrm(mode, a, b) {
  const p = mode === "car" ? "car" : "foot";
  const j = await fetch(`https://routing.openstreetmap.de/routed-${p}/route/v1/${p}/${a.lon},${a.lat};${b.lon},${b.lat}?steps=true&overview=false`, { headers: UA, signal: AbortSignal.timeout(7e3) }).then((r2) => r2.json()).catch(() => null);
  const r = j && (j.routes || [])[0];
  if (!r) return null;
  const steps = [];
  let last = "";
  for (const s of r.legs[0].steps) {
    const nm = (s.name || "").split(/\s*[|;]\s*/).find((x) => /[א-ת]/.test(x) && !/[\u0600-\u06FF]/.test(x)) || "";
    if (!nm || nm === last || s.distance < 120 && s.maneuver.type !== "depart") continue;
    const nm2 = nm.replace(/^ה(?=[א-ת])/, "");
    const t = s.maneuver.type === "depart" ? `\u05DE\u05EA\u05D7\u05D9\u05DC\u05D9\u05DD \u05D1${nm2}` : `${TURN[s.maneuver.modifier] && TURN[s.maneuver.modifier] !== "\u05D9\u05E9\u05E8" ? "\u05E4\u05D5\u05E0\u05D9\u05DD " + TURN[s.maneuver.modifier] + " \u05DC" : "\u05DE\u05DE\u05E9\u05D9\u05DB\u05D9\u05DD \u05D1"}${nm2}`;
    steps.push(t);
    last = nm;
  }
  return { km: Math.round(r.distance / 100) / 10, min: Math.round(r.duration / 60), steps: steps.slice(0, 9) };
}
__name(osrm, "osrm");
async function routeAnswer(a) {
  const [A, B] = await Promise.all([geoFind(a.from || "", a.from_lat, a.from_lon), geoFind(a.to || "", a.to_lat, a.to_lon)]);
  if (!A || !B) return `\u05DC\u05D0 \u05D4\u05E6\u05DC\u05D7\u05EA\u05D9 \u05DC\u05DE\u05E6\u05D5\u05D0 \u05E2\u05DC \u05D4\u05DE\u05E4\u05D4 \u05D0\u05EA ${!A ? a.from || "\u05E0\u05E7\u05D5\u05D3\u05EA \u05D4\u05D9\u05E6\u05D9\u05D0\u05D4" : a.to || "\u05D4\u05D9\u05E2\u05D3"}. \u05D0\u05E4\u05E9\u05E8 \u05DC\u05D4\u05D2\u05D9\u05D3 \u05E9\u05DD \u05E9\u05DC \u05E8\u05D7\u05D5\u05D1 \u05D0\u05D5 \u05DE\u05E7\u05D5\u05DD \u05DE\u05D5\u05DB\u05E8.`;
  const [foot, car] = await Promise.all([osrm("foot", A, B), osrm("car", A, B)]);
  if (!foot && !car) return "\u05DC\u05D0 \u05D4\u05E6\u05DC\u05D7\u05EA\u05D9 \u05DC\u05D7\u05E9\u05D1 \u05DE\u05E1\u05DC\u05D5\u05DC \u05DB\u05E8\u05D2\u05E2. \u05D0\u05E4\u05E9\u05E8 \u05DC\u05E0\u05E1\u05D5\u05EA \u05E9\u05D5\u05D1 \u05E2\u05D5\u05D3 \u05DE\u05E2\u05D8.";
  const walkOk = foot && foot.min <= 40 && a.mode !== "car";
  const cut = /* @__PURE__ */ __name((x) => String(x || "").split(",")[0].replace(/^ה(?=[א-ת])/, ""), "cut");
  let t = `\u05DE${cut(a.from)} \u05DC${cut(a.to)}: `;
  if (walkOk) t += `\u05D1\u05E8\u05D2\u05DC \u05D1\u05E2\u05E8\u05DA ${foot.min} \u05D3\u05E7\u05D5\u05EA, ${foot.km} \u05E7\u05D9\u05DC\u05D5\u05DE\u05D8\u05E8. ${foot.steps.join(", ")}.`;
  else {
    if (car) t += `\u05D1\u05E8\u05DB\u05D1 \u05D0\u05D5 \u05D1\u05DE\u05D5\u05E0\u05D9\u05EA \u05D1\u05E2\u05E8\u05DA ${car.min} \u05D3\u05E7\u05D5\u05EA, ${car.km} \u05E7\u05D9\u05DC\u05D5\u05DE\u05D8\u05E8, \u05D3\u05E8\u05DA ${car.steps.join(", ")}.`;
    if (foot && foot.min > 40) t += ` \u05D1\u05E8\u05D2\u05DC \u05D6\u05D4 \u05D1\u05E2\u05E8\u05DA ${foot.min} \u05D3\u05E7\u05D5\u05EA, \u05E8\u05D7\u05D5\u05E7 \u05DE\u05D3\u05D9 \u05DC\u05DC\u05DB\u05EA, \u05D0\u05D6 \u05E2\u05D3\u05D9\u05E3 \u05D0\u05D5\u05D8\u05D5\u05D1\u05D5\u05E1 \u05D0\u05D5 \u05DE\u05D5\u05E0\u05D9\u05EA.`;
    t += " \u05E2\u05DC \u05E7\u05D5\u05D5\u05D9 \u05D0\u05D5\u05D8\u05D5\u05D1\u05D5\u05E1 \u05D0\u05D9\u05DF \u05DC\u05D9 \u05DE\u05D9\u05D3\u05E2 \u05DE\u05D3\u05D5\u05D9\u05E7, \u05D0\u05D6 \u05DB\u05D3\u05D0\u05D9 \u05DC\u05D1\u05D3\u05D5\u05E7 \u05D1\u05D0\u05E4\u05DC\u05D9\u05E7\u05E6\u05D9\u05D4 \u05D0\u05D5 \u05D1\u05E7\u05D5 \u05D4\u05DE\u05D9\u05D3\u05E2 \u05E9\u05DC \u05D4\u05EA\u05D7\u05D1\u05D5\u05E8\u05D4 \u05D4\u05E6\u05D9\u05D1\u05D5\u05E8\u05D9\u05EA.";
  }
  return t;
}
__name(routeAnswer, "routeAnswer");
async function wikiHe(q) {
  const s = await fetch(`https://he.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(q)}&format=json&srlimit=1`, { headers: UA, signal: AbortSignal.timeout(5e3) }).then((r) => r.json()).catch(() => null);
  const title = s && s.query && s.query.search[0] && s.query.search[0].title;
  if (!title) return "";
  const p = await fetch(`https://he.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`, { headers: UA, signal: AbortSignal.timeout(5e3) }).then((r) => r.json()).catch(() => null);
  return p && p.extract ? `\u05D5\u05D9\u05E7\u05D9\u05E4\u05D3\u05D9\u05D4 (${title}): ${p.extract.slice(0, 1200)}` : "";
}
__name(wikiHe, "wikiHe");
async function snippetAnswer(env, query, queryEn = "") {
  const [news, web, webEn, wiki] = await Promise.all([bingNews(query).catch(() => []), bingWeb(query).catch(() => []), queryEn ? bingWeb(queryEn).catch(() => []) : [], wikiHe(query)]);
  const fmt = /* @__PURE__ */ __name((arr, n) => arr.slice(0, n).map((i) => `${i.t}${i.s ? ": " + i.s : ""}`).join(" | "), "fmt");
  const facts = [wiki, web.length ? "\u05EA\u05D5\u05E6\u05D0\u05D5\u05EA \u05D7\u05D9\u05E4\u05D5\u05E9: " + fmt(web, 6) : "", webEn.length ? "\u05EA\u05D5\u05E6\u05D0\u05D5\u05EA \u05D7\u05D9\u05E4\u05D5\u05E9 \u05D1\u05D0\u05E0\u05D2\u05DC\u05D9\u05EA: " + fmt(webEn, 6) : "", news.length ? "\u05DB\u05D5\u05EA\u05E8\u05D5\u05EA \u05D7\u05D3\u05E9\u05D5\u05EA \u05D0\u05D7\u05E8\u05D5\u05E0\u05D5\u05EA: " + fmt(news.sort((a, b) => b.d - a.d), 8) : ""].filter(Boolean).join("\n");
  if (!facts) return "";
  const r = await aiText(env, { system: `\u05E2\u05E0\u05D4 \u05D1\u05E2\u05D1\u05E8\u05D9\u05EA \u05E4\u05E9\u05D5\u05D8\u05D4 \u05D5\u05D1\u05E7\u05E6\u05E8\u05D4 (\u05E2\u05D3 3 \u05DE\u05E9\u05E4\u05D8\u05D9\u05DD, \u05D6\u05D4 \u05DE\u05D5\u05E7\u05E8\u05D0 \u05D1\u05D8\u05DC\u05E4\u05D5\u05DF) \u05E2\u05DC \u05D4\u05E9\u05D0\u05DC\u05D4, \u05E8\u05E7 \u05DC\u05E4\u05D9 \u05D4\u05DE\u05D9\u05D3\u05E2 \u05E9\u05DE\u05E6\u05D5\u05E8\u05E3. \u05D0\u05DD \u05D4\u05DE\u05D9\u05D3\u05E2 \u05DC\u05D0 \u05E2\u05D5\u05E0\u05D4 \u05E2\u05DC \u05D4\u05E9\u05D0\u05DC\u05D4, \u05EA\u05D2\u05D9\u05D3 \u05E9\u05DC\u05D0 \u05DE\u05E6\u05D0\u05EA. \u05EA\u05D0\u05E8\u05D9\u05DA \u05D4\u05D9\u05D5\u05DD: ${nowIL().slice(0, 10)}. \u05D4\u05D7\u05D6\u05E8 JSON: {"answer":"\u05D4\u05EA\u05E9\u05D5\u05D1\u05D4"}`, contents: [{ role: "user", parts: [{ text: `\u05D4\u05E9\u05D0\u05DC\u05D4: ${query}

\u05D4\u05DE\u05D9\u05D3\u05E2 \u05E9\u05E0\u05DE\u05E6\u05D0:
${facts}` }] }], timeout: 3500, deadline: 5e3 }).catch(() => ({}));
  return String(r.answer || "").trim();
}
__name(snippetAnswer, "snippetAnswer");
async function webAnswer(env, query, context = "", queryEn = "") {
  const sys = `\u05D0\u05EA\u05D4 \u05E2\u05D5\u05D6\u05E8 \u05E7\u05D5\u05DC\u05D9 \u05D1\u05E7\u05D5 \u05D8\u05DC\u05E4\u05D5\u05E0\u05D9 \u05E9\u05DC \u05D1\u05D7\u05D5\u05E8\u05D9 \u05D9\u05E9\u05D9\u05D1\u05D4 \u05DE\u05D4\u05E6\u05D9\u05D1\u05D5\u05E8 \u05D4\u05D7\u05E8\u05D3\u05D9. \u05D7\u05E4\u05E9 \u05D1\u05D2\u05D5\u05D2\u05DC \u05D5\u05E2\u05E0\u05D4 \u05D1\u05E2\u05D1\u05E8\u05D9\u05EA \u05E4\u05E9\u05D5\u05D8\u05D4, \u05E7\u05E6\u05E8: \u05E2\u05D3 4 \u05DE\u05E9\u05E4\u05D8\u05D9\u05DD, \u05DB\u05D9 \u05D4\u05EA\u05E9\u05D5\u05D1\u05D4 \u05DE\u05D5\u05E7\u05E8\u05D0\u05EA \u05D1\u05D8\u05DC\u05E4\u05D5\u05DF. \u05D1\u05DC\u05D9 \u05E7\u05D9\u05E9\u05D5\u05E8\u05D9\u05DD, \u05D1\u05DC\u05D9 \u05E8\u05E9\u05D9\u05DE\u05D5\u05EA, \u05D1\u05DC\u05D9 \u05DB\u05D5\u05DB\u05D1\u05D9\u05D5\u05EA \u05D5\u05D1\u05DC\u05D9 \u05D0\u05D9\u05DE\u05D5\u05D2'\u05D9. \u05EA\u05D0\u05E8\u05D9\u05DA \u05D5\u05E9\u05E2\u05D4 \u05E2\u05DB\u05E9\u05D9\u05D5: ${nowIL()}. \u05D0\u05DD \u05D4\u05DE\u05D9\u05D3\u05E2 \u05DC\u05D0 \u05D5\u05D3\u05D0\u05D9 \u05D0\u05D5 \u05E9\u05D4\u05DE\u05E7\u05D5\u05E8\u05D5\u05EA \u05E1\u05D5\u05EA\u05E8\u05D9\u05DD, \u05EA\u05D2\u05D9\u05D3 \u05D0\u05EA \u05D6\u05D4. \u05E9\u05DE\u05D5\u05E8 \u05E2\u05DC \u05DC\u05E9\u05D5\u05DF \u05E0\u05E7\u05D9\u05D9\u05D4 \u05D5\u05EA\u05D5\u05DB\u05DF \u05E9\u05DE\u05EA\u05D0\u05D9\u05DD \u05DC\u05E6\u05D9\u05D1\u05D5\u05E8 \u05D4\u05D7\u05E8\u05D3\u05D9: \u05D1\u05DC\u05D9 \u05EA\u05DB\u05E0\u05D9\u05DD \u05DC\u05D0 \u05E6\u05E0\u05D5\u05E2\u05D9\u05DD, \u05D1\u05DC\u05D9 \u05E8\u05DB\u05D9\u05DC\u05D5\u05EA \u05D5\u05D1\u05DC\u05D9 \u05E0\u05D5\u05E9\u05D0\u05D9\u05DD \u05E9\u05DC\u05D0 \u05DE\u05EA\u05D0\u05D9\u05DE\u05D9\u05DD \u05DC\u05D1\u05D7\u05D5\u05E8\u05D9 \u05D9\u05E9\u05D9\u05D1\u05D4. \u05D0\u05DD \u05D4\u05E9\u05D0\u05DC\u05D4 \u05D1\u05E0\u05D5\u05E9\u05D0 \u05DB\u05D6\u05D4, \u05EA\u05D2\u05D9\u05D3 \u05D1\u05E2\u05D3\u05D9\u05E0\u05D5\u05EA \u05E9\u05E2\u05DC \u05D6\u05D4 \u05D0\u05EA\u05D4 \u05DC\u05D0 \u05E2\u05D5\u05E0\u05D4. \u05DB\u05E9\u05DE\u05D3\u05D1\u05E8\u05D9\u05DD \u05E2\u05DC \u05D4\u05E7\u05D3\u05D5\u05E9 \u05D1\u05E8\u05D5\u05DA \u05D4\u05D5\u05D0 \u05D0\u05D5\u05DE\u05E8\u05D9\u05DD "\u05D4\u05E9\u05DD", \u05DC\u05D0 "\u05D0\u05DC\u05D5\u05D4\u05D9\u05DD".`;
  const start = Date.now();
  if (env.GROQ_KEY) for (const model of ["openai/gpt-oss-120b", "openai/gpt-oss-20b"]) {
    const id = "web|" + model;
    if (isDead(id) || Date.now() - start > 3e3) continue;
    const t0 = Date.now();
    try {
      const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        signal: AbortSignal.timeout(7e3 - (Date.now() - start)),
        headers: { Authorization: "Bearer " + env.GROQ_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({ model, tools: [{ type: "browser_search" }], tool_choice: "required", messages: [{ role: "system", content: sys }, { role: "user", content: (context ? context + "\n\n" : "") + query }] })
      });
      aiTrace.push(`${id} ${r.status} ${Date.now() - t0}ms`);
      if (r.ok) {
        const jj = await r.json();
        if (!(jj.choices || [])[0]?.message?.content) aiTrace.push("empty: " + JSON.stringify(jj).slice(0, 600));
        const t = ((jj.choices || [])[0]?.message?.content || "").replace(/【[^】]*】|\[\d+\]|https?:\S+/g, "").replace(/[*#_|]/g, "").replace(/\s+/g, " ").trim();
        if (t) return t;
      } else {
        aiTrace.push((await r.text()).slice(0, 200));
        if (r.status === 429) dead.set(id, Date.now() + 6e4);
      }
    } catch (e) {
      aiTrace.push(`${id} ${e.message}`);
    }
  }
  return await snippetAnswer(env, query, queryEn).catch((e) => {
    aiTrace.push("snippets " + e.message);
    return "";
  });
}
__name(webAnswer, "webAnswer");
var PM = /* @__PURE__ */ __name((p) => "/personalMessages/Phone/" + p, "PM");
async function personalNew(env, phone) {
  const d = await ym(env, "GetIVR2Dir", { path: "ivr2:" + PM(phone) }).catch(() => ({}));
  const played = new Set((await kvGet(env, "pmplayed", [])).map((x) => x.path));
  const snd = await kvGet(env, "pm_sender", {});
  return (d.files || []).filter((f) => /^\d+\.(wav|tts)$/.test(f.name) && !played.has(PM(phone) + "/" + f.name)).map((f) => ({ id: f.name.replace(/\.\w+$/, ""), file: f.name, from: snd[PM(phone) + "/" + f.name] || names(env)[f.phone] || (f.phone ? "\u05DE\u05E1\u05E4\u05E8 " + f.phone : "\u05DC\u05D0 \u05D9\u05D3\u05D5\u05E2"), d: f.mtime || "" }));
}
__name(personalNew, "personalNew");
async function pmCleanup(env) {
  const l = await kvGet(env, "pmplayed", []);
  if (!l.length) return;
  const keep = [];
  for (const x of l) {
    if (Date.now() - x.t < 5 * 6e4 || used > 40) {
      keep.push(x);
      continue;
    }
    try {
      const dir = x.path.replace(/\/[^/]+$/, "");
      await move(env, x.path, dir + "/Old");
    } catch {
    }
  }
  await env.KV.put("pmplayed", JSON.stringify(keep));
}
__name(pmCleanup, "pmCleanup");
async function tellFriend(env, from, to, text) {
  const nm = names(env), sender = nm[from] || "\u05D7\u05D1\u05E8";
  const msg = `\u05D4\u05D5\u05D3\u05E2\u05D4 \u05D0\u05D9\u05E9\u05D9\u05EA \u05DE${sender}, \u05D3\u05E8\u05DA \u05D4\u05E2\u05D5\u05D6\u05E8 \u05D4\u05D7\u05DB\u05DD: ${text}`;
  const pcm = await ttsLong(env, msg), folder = PM(to);
  let fname;
  if (pcm) {
    fname = await nextName(env, folder, "wav");
    await ymUpload(env, `${folder}/${fname}`, pcmToWav(pcm));
  } else {
    await ensureDir(env, folder, false);
    fname = await nextName(env, folder, "tts");
    await ym(env, "UploadTextFile", { what: `ivr2:${folder}/${fname}`, contents: msg });
  }
  const snd = await kvGet(env, "pm_sender", {});
  snd[`${folder}/${fname}`] = sender;
  await env.KV.put("pm_sender", JSON.stringify(snd));
  await log(env, `${sender} \u05D4\u05E9\u05D0\u05D9\u05E8 \u05D3\u05E8\u05DA \u05D4\u05E2\u05D5\u05D6\u05E8 \u05D4\u05D5\u05D3\u05E2\u05D4 \u05D0\u05D9\u05E9\u05D9\u05EA \u05DC${nm[to] || to}: ${text}`).catch(() => {
  });
}
__name(tellFriend, "tellFriend");
var OWNER = "0534169095";
async function isAdminPhone(env, phone) {
  if (!phone) return false;
  if (phone === OWNER) return true;
  let a = await kvGet(env, "admins_cache", null);
  if (!a || Date.now() - a.t > 10 * 6e4) {
    try {
      a = { t: Date.now(), l: await listPhones(env, "admins") };
      await env.KV.put("admins_cache", JSON.stringify(a));
    } catch {
      a = a || { l: [] };
    }
  }
  return a.l.includes(phone);
}
__name(isAdminPhone, "isAdminPhone");
var ACTIONS_USER = `- \u05E4\u05E2\u05D5\u05DC\u05D5\u05EA: \u05D1\u05E9\u05D3\u05D4 do \u05D0\u05E4\u05E9\u05E8 \u05DC\u05D4\u05D7\u05D6\u05D9\u05E8 \u05E8\u05E9\u05D9\u05DE\u05EA \u05E4\u05E2\u05D5\u05DC\u05D5\u05EA. \u05D1\u05E8\u05D5\u05D1 \u05D4\u05EA\u05E9\u05D5\u05D1\u05D5\u05EA \u05D4\u05D9\u05D0 \u05E8\u05D9\u05E7\u05D4. \u05DE\u05D7\u05D6\u05D9\u05E8\u05D9\u05DD \u05E4\u05E2\u05D5\u05DC\u05D4 \u05E8\u05E7 \u05DB\u05E9\u05D4\u05DE\u05E9\u05EA\u05DE\u05E9 \u05D1\u05D0\u05DE\u05EA \u05D1\u05D9\u05E7\u05E9:
  {"type":"rsvp","value":"join"} \u05D0\u05D5 {"type":"rsvp","value":"cancel"}: \u05E8\u05D9\u05E9\u05D5\u05DD \u05E9\u05DC \u05D4\u05DE\u05D3\u05D1\u05E8 \u05DC\u05D0\u05D9\u05E8\u05D5\u05E2 \u05D4\u05E4\u05E2\u05D9\u05DC \u05D0\u05D5 \u05D1\u05D9\u05D8\u05D5\u05DC \u05D4\u05D4\u05E8\u05E9\u05DE\u05D4 \u05E9\u05DC\u05D5 (\u05E4\u05E8\u05D8\u05D9 \u05D4\u05D0\u05D9\u05E8\u05D5\u05E2 \u05DC\u05DE\u05D8\u05D4). \u05EA\u05D2\u05D9\u05D3 \u05DC\u05D5 \u05D1\u05EA\u05E9\u05D5\u05D1\u05D4 \u05E9\u05E0\u05E8\u05E9\u05DD \u05D0\u05D5 \u05E9\u05D1\u05D5\u05D8\u05DC.
  {"type":"remember","text":"..."}: \u05DE\u05E9\u05D4\u05D5 \u05D7\u05E9\u05D5\u05D1 \u05E2\u05DC \u05D4\u05DE\u05D3\u05D1\u05E8 \u05E9\u05DB\u05D3\u05D0\u05D9 \u05DC\u05D6\u05DB\u05D5\u05E8 \u05DC\u05E9\u05D9\u05D7\u05D5\u05EA \u05D4\u05D1\u05D0\u05D5\u05EA, \u05DC\u05DE\u05E9\u05DC \u05E9\u05D9\u05E9 \u05DC\u05D5 \u05DE\u05D1\u05D7\u05DF \u05D1\u05D9\u05D5\u05DD \u05E9\u05DC\u05D9\u05E9\u05D9 \u05D0\u05D5 \u05E9\u05D4\u05D5\u05D0 \u05DE\u05EA\u05DB\u05D5\u05E0\u05DF \u05DC\u05E0\u05E1\u05D9\u05E2\u05D4. \u05DC\u05D0 \u05D3\u05D1\u05E8\u05D9\u05DD \u05E1\u05EA\u05DE\u05D9\u05D9\u05DD, \u05D5\u05DC\u05D0 \u05DE\u05D4 \u05E9\u05DB\u05D1\u05E8 \u05D6\u05DB\u05D5\u05E8.
  {"type":"reminder","at":"YYYY-MM-DD HH:MM","text":"..."}: \u05EA\u05D6\u05DB\u05D5\u05E8\u05EA \u05E9\u05D1\u05D9\u05E7\u05E9. \u05D4\u05D6\u05DE\u05DF \u05DC\u05E4\u05D9 \u05E9\u05E2\u05D5\u05DF \u05D9\u05E9\u05E8\u05D0\u05DC, \u05D5\u05E8\u05E7 \u05D1\u05E2\u05EA\u05D9\u05D3. \u05D4\u05D9\u05D0 \u05EA\u05D7\u05DB\u05D4 \u05DC\u05D5 \u05D1\u05D6\u05DE\u05DF \u05D4\u05D6\u05D4 \u05DB\u05D4\u05D5\u05D3\u05E2\u05D4 \u05D0\u05D9\u05E9\u05D9\u05EA \u05D1\u05E7\u05D5 (0 \u05D5\u05D0\u05D6 1). \u05EA\u05D2\u05D9\u05D3 \u05DC\u05D5 \u05D0\u05EA \u05D6\u05D4, \u05D5\u05E9\u05D4\u05D8\u05DC\u05E4\u05D5\u05DF \u05DC\u05D0 \u05D9\u05E6\u05DC\u05E6\u05DC. \u05D1\u05E9\u05D1\u05EA \u05D5\u05D1\u05D7\u05D2 \u05D4\u05D9\u05D0 \u05EA\u05E6\u05D0 \u05E8\u05E7 \u05D1\u05DE\u05D5\u05E6\u05D0\u05D9 \u05E9\u05D1\u05EA \u05D0\u05D5 \u05D1\u05DE\u05D5\u05E6\u05D0\u05D9 \u05D4\u05D7\u05D2.
  {"type":"location","place":"\u05E9\u05DD \u05D4\u05DE\u05E7\u05D5\u05DD \u05D1\u05E2\u05D1\u05E8\u05D9\u05EA","lat":31.7,"lon":35.2}: \u05DB\u05E9\u05D4\u05D5\u05D0 \u05D0\u05D5\u05DE\u05E8 \u05E9\u05D4\u05D5\u05D0 \u05E0\u05DE\u05E6\u05D0 \u05D1\u05DE\u05E7\u05D5\u05DD \u05D0\u05D7\u05E8, \u05D0\u05D5 \u05DE\u05D1\u05E7\u05E9 \u05D6\u05DE\u05E0\u05D9\u05DD \u05D0\u05D5 \u05DE\u05D6\u05D2 \u05D0\u05D5\u05D5\u05D9\u05E8 \u05DC\u05DE\u05E7\u05D5\u05DD \u05D0\u05D7\u05E8. \u05EA\u05DF \u05D0\u05EA \u05D4\u05E7\u05D5\u05D0\u05D5\u05E8\u05D3\u05D9\u05E0\u05D8\u05D5\u05EA \u05D4\u05DB\u05D9 \u05DE\u05D3\u05D5\u05D9\u05E7\u05D5\u05EA \u05E9\u05D0\u05EA\u05D4 \u05D9\u05D5\u05D3\u05E2. \u05D4\u05DE\u05D9\u05E7\u05D5\u05DD \u05E0\u05E9\u05DE\u05E8 \u05DC\u05D5 \u05D2\u05DD \u05DC\u05E9\u05D9\u05D7\u05D5\u05EA \u05D4\u05D1\u05D0\u05D5\u05EA. \u05D1\u05EA\u05E9\u05D5\u05D1\u05D4 \u05E2\u05E6\u05DE\u05D4 \u05E8\u05E7 \u05EA\u05D0\u05E9\u05E8 \u05D0\u05EA \u05D4\u05DE\u05D9\u05E7\u05D5\u05DD \u05D4\u05D7\u05D3\u05E9, \u05DB\u05D9 \u05D4\u05D6\u05DE\u05E0\u05D9\u05DD \u05E9\u05DC\u05D5 \u05D9\u05D2\u05D9\u05E2\u05D5 \u05D0\u05D7\u05E8\u05D9 \u05D4\u05E2\u05D3\u05DB\u05D5\u05DF.
  {"type":"source","ref":"..."}: \u05DB\u05E9\u05D0\u05EA\u05D4 \u05DE\u05D1\u05D9\u05D0 \u05DE\u05E7\u05D5\u05E8 \u05DE\u05E4\u05D5\u05E8\u05E9 \u05D1\u05EA\u05D5\u05E8\u05D4, \u05D1\u05D2\u05DE\u05E8\u05D0, \u05D1\u05DE\u05E9\u05E0\u05D4, \u05D1\u05E8\u05DE\u05D1"\u05DD \u05D0\u05D5 \u05D1\u05E9\u05D5\u05DC\u05D7\u05DF \u05E2\u05E8\u05D5\u05DA. ref \u05D1\u05D0\u05E0\u05D2\u05DC\u05D9\u05EA, \u05D1\u05E4\u05D5\u05E8\u05DE\u05D8 \u05E9\u05DC \u05E1\u05E4\u05E8\u05D9\u05D0, \u05D1\u05E8\u05DE\u05D4 \u05E9\u05DC \u05E1\u05E2\u05D9\u05E3, \u05DE\u05E9\u05E0\u05D4 \u05D0\u05D5 \u05E7\u05D8\u05E2 \u05D0\u05D7\u05D3. \u05DC\u05DE\u05E9\u05DC "Shulchan Arukh, Orach Chayim 639:1", "Mishnah Sukkah 2:9", "Berakhot 2a:1", "Leviticus 23:42", "Mishneh Torah, Shofar, Sukkah and Lulav 6:1", "Mishnah Berurah 639:1". \u05D4\u05DE\u05E2\u05E8\u05DB\u05EA \u05EA\u05E7\u05E8\u05D9\u05D0 \u05D0\u05D7\u05E8\u05D9 \u05D4\u05EA\u05E9\u05D5\u05D1\u05D4 \u05E9\u05DC\u05DA \u05D0\u05EA \u05D4\u05DC\u05E9\u05D5\u05DF \u05D4\u05DE\u05D3\u05D5\u05D9\u05E7\u05EA \u05DE\u05D4\u05E1\u05E4\u05E8, \u05E2\u05DD \u05E9\u05DD \u05D4\u05E1\u05E4\u05E8 \u05D5\u05D4\u05E1\u05D9\u05DE\u05DF, \u05D0\u05D6 \u05D0\u05DC \u05EA\u05E6\u05D8\u05D8 \u05D0\u05EA \u05D4\u05DC\u05E9\u05D5\u05DF \u05D1\u05E2\u05E6\u05DE\u05DA \u05D5\u05D0\u05DC \u05EA\u05D2\u05D9\u05D3 \u05DE\u05E1\u05E4\u05E8\u05D9 \u05E1\u05D9\u05DE\u05E0\u05D9\u05DD \u05D0\u05D5 \u05E1\u05E2\u05D9\u05E4\u05D9\u05DD. \u05EA\u05D2\u05D9\u05D3 \u05D0\u05EA \u05D4\u05E2\u05D9\u05E7\u05E8 \u05D1\u05DE\u05D9\u05DC\u05D9\u05DD \u05E9\u05DC\u05DA. \u05E8\u05E7 \u05DB\u05E9\u05D0\u05EA\u05D4 \u05D1\u05D8\u05D5\u05D7 \u05D1\u05DE\u05E7\u05D5\u05DD \u05D4\u05DE\u05D3\u05D5\u05D9\u05E7. \u05D0\u05DD \u05D0\u05EA\u05D4 \u05DC\u05D0 \u05D1\u05D8\u05D5\u05D7, \u05D0\u05DC \u05EA\u05D7\u05D6\u05D9\u05E8 source.
  {"type":"learn","ref":"Mishnah Sukkah 1"}: \u05DB\u05E9\u05D4\u05D5\u05D0 \u05DE\u05D1\u05E7\u05E9 \u05DC\u05DC\u05DE\u05D5\u05D3 \u05D0\u05D9\u05EA\u05DA \u05D1\u05D7\u05D1\u05E8\u05D5\u05EA\u05D0, \u05E4\u05E8\u05E7 \u05DE\u05E9\u05E0\u05D4, \u05E1\u05D9\u05DE\u05DF \u05D0\u05D5 \u05D3\u05E3 (ref \u05D1\u05D0\u05E0\u05D2\u05DC\u05D9\u05EA \u05D1\u05E4\u05D5\u05E8\u05DE\u05D8 \u05E9\u05DC \u05E1\u05E4\u05E8\u05D9\u05D0, \u05D1\u05E8\u05DE\u05D4 \u05E9\u05DC \u05E4\u05E8\u05E7 \u05D0\u05D5 \u05D3\u05E3, \u05DC\u05DE\u05E9\u05DC "Mishnah Sukkah 1", "Sukkah 2a", "Shulchan Arukh, Orach Chayim 639"). \u05D4\u05DE\u05E2\u05E8\u05DB\u05EA \u05EA\u05E7\u05E8\u05D9\u05D0 \u05D0\u05EA \u05D4\u05E7\u05D8\u05E2 \u05D4\u05E8\u05D0\u05E9\u05D5\u05DF \u05D0\u05D7\u05E8\u05D9 \u05D4\u05EA\u05E9\u05D5\u05D1\u05D4 \u05E9\u05DC\u05DA. \u05D1\u05EA\u05E9\u05D5\u05D1\u05D4 \u05E8\u05E7 \u05EA\u05D2\u05D9\u05D3 \u05DE\u05E9\u05D4\u05D5 \u05E7\u05E6\u05E8 \u05DB\u05DE\u05D5 "\u05D9\u05D0\u05DC\u05DC\u05D4, \u05DC\u05D5\u05DE\u05D3\u05D9\u05DD \u05DE\u05E9\u05E0\u05D4 \u05E8\u05D0\u05E9\u05D5\u05E0\u05D4 \u05D1\u05E1\u05D5\u05DB\u05D4". \u05D0\u05DC \u05EA\u05EA\u05D0\u05E8 \u05DE\u05D4 \u05DB\u05EA\u05D5\u05D1 \u05D1\u05E7\u05D8\u05E2 \u05DC\u05E4\u05E0\u05D9 \u05E9\u05D4\u05D5\u05D0 \u05DE\u05D5\u05E7\u05E8\u05D0, \u05DB\u05D9 \u05D0\u05EA\u05D4 \u05E2\u05D5\u05D3 \u05DC\u05D0 \u05E8\u05D5\u05D0\u05D4 \u05D0\u05D5\u05EA\u05D5.
  {"type":"learn_next"}: \u05D1\u05DC\u05D9\u05DE\u05D5\u05D3 \u05D1\u05D7\u05D1\u05E8\u05D5\u05EA\u05D0, \u05DB\u05E9\u05D4\u05D5\u05D0 \u05D0\u05D5\u05DE\u05E8 "\u05D4\u05DC\u05D0\u05D4", "\u05EA\u05DE\u05E9\u05D9\u05DA" \u05D0\u05D5 "\u05E7\u05D8\u05E2 \u05D4\u05D1\u05D0". {"type":"learn_stop"}: \u05DB\u05E9\u05D4\u05D5\u05D0 \u05E8\u05D5\u05E6\u05D4 \u05DC\u05D4\u05E4\u05E1\u05D9\u05E7 \u05DC\u05DC\u05DE\u05D5\u05D3.
  {"type":"web","query":"...","query_en":"..."}: query_en \u05D4\u05D5\u05D0 \u05D0\u05D5\u05EA\u05D4 \u05E9\u05D0\u05DC\u05D4 \u05D1\u05D0\u05E0\u05D2\u05DC\u05D9\u05EA, \u05E7\u05E6\u05E8\u05D4, \u05DC\u05D7\u05D9\u05E4\u05D5\u05E9 \u05E0\u05D5\u05E1\u05E3. \u05D7\u05D5\u05D1\u05D4 \u05DC\u05D4\u05E9\u05EA\u05DE\u05E9 \u05D1\u05D6\u05D4 (\u05D5\u05DC\u05D0 \u05DC\u05E2\u05E0\u05D5\u05EA \u05DE\u05D4\u05D6\u05D9\u05DB\u05E8\u05D5\u05DF) \u05E2\u05DC \u05DB\u05DC \u05E9\u05D0\u05DC\u05D4 \u05E2\u05DC \u05DE\u05D9 \u05DE\u05DB\u05D4\u05DF \u05D4\u05D9\u05D5\u05DD \u05D1\u05EA\u05E4\u05E7\u05D9\u05D3 (\u05E8\u05D0\u05E9 \u05E2\u05D9\u05E8, \u05E9\u05E8, \u05E8\u05D1, \u05E8\u05D0\u05E9 \u05D9\u05E9\u05D9\u05D1\u05D4 \u05D5\u05DB\u05D5'), \u05D7\u05D3\u05E9\u05D5\u05EA, \u05DE\u05D7\u05D9\u05E8\u05D9\u05DD \u05D5\u05E9\u05E2\u05E8\u05D9\u05DD, \u05EA\u05D5\u05E6\u05D0\u05D5\u05EA, \u05D5\u05DE\u05D4 \u05E7\u05D5\u05E8\u05D4 \u05E2\u05DB\u05E9\u05D9\u05D5 \u05D1\u05E2\u05D5\u05DC\u05DD, \u05DB\u05D9 \u05D4\u05D9\u05D3\u05E2 \u05E9\u05DC\u05DA \u05D9\u05E9\u05DF \u05D5\u05E2\u05DC\u05D5\u05DC \u05DC\u05D4\u05D9\u05D5\u05EA \u05E9\u05D2\u05D5\u05D9. \u05D5\u05D2\u05DD \u05DB\u05E9\u05D4\u05E9\u05D0\u05DC\u05D4 \u05E6\u05E8\u05D9\u05DB\u05D4 \u05DE\u05D9\u05D3\u05E2 \u05DE\u05D4\u05D0\u05D9\u05E0\u05D8\u05E8\u05E0\u05D8 \u05E9\u05D0\u05D9\u05DF \u05DC\u05DA \u05DC\u05DE\u05D8\u05D4 \u05D5\u05E9\u05D0\u05EA\u05D4 \u05DC\u05D0 \u05D9\u05D5\u05D3\u05E2 \u05D1\u05D5\u05D5\u05D3\u05D0\u05D5\u05EA: \u05D7\u05D3\u05E9\u05D5\u05EA \u05D5\u05D0\u05D9\u05E8\u05D5\u05E2\u05D9\u05DD \u05E2\u05D3\u05DB\u05E0\u05D9\u05D9\u05DD, \u05DE\u05D7\u05D9\u05E8\u05D9\u05DD, \u05E9\u05E2\u05D5\u05EA \u05E4\u05EA\u05D9\u05D7\u05D4, \u05DE\u05D9\u05D3\u05E2 \u05E2\u05DC \u05DE\u05E7\u05D5\u05DE\u05D5\u05EA, \u05D0\u05E0\u05E9\u05D9\u05DD, \u05DE\u05D5\u05E6\u05E8\u05D9\u05DD, \u05EA\u05D5\u05E6\u05D0\u05D5\u05EA \u05D5\u05E2\u05D5\u05D3. query \u05D4\u05D9\u05D0 \u05D4\u05E9\u05D0\u05DC\u05D4 \u05D4\u05DE\u05DC\u05D0\u05D4 \u05D1\u05E2\u05D1\u05E8\u05D9\u05EA, \u05E2\u05DD \u05DB\u05DC \u05D4\u05E4\u05E8\u05D8\u05D9\u05DD \u05DE\u05D4\u05E9\u05D9\u05D7\u05D4. \u05D4\u05DE\u05E2\u05E8\u05DB\u05EA \u05EA\u05D7\u05E4\u05E9 \u05D1\u05D2\u05D5\u05D2\u05DC \u05D5\u05EA\u05E7\u05E8\u05D9\u05D0 \u05D0\u05EA \u05D4\u05EA\u05E9\u05D5\u05D1\u05D4 \u05E9\u05E0\u05DE\u05E6\u05D0\u05D4 \u05D1\u05DE\u05E7\u05D5\u05DD \u05D4\u05EA\u05E9\u05D5\u05D1\u05D4 \u05E9\u05DC\u05DA, \u05D0\u05D6 \u05D1\u05E9\u05D3\u05D4 answer \u05E8\u05E7 \u05EA\u05D2\u05D9\u05D3 \u05DE\u05E9\u05D4\u05D5 \u05E7\u05E6\u05E8 \u05DB\u05DE\u05D5 "\u05E9\u05E0\u05D9\u05D9\u05D4, \u05D1\u05D5\u05D3\u05E7". \u05DC\u05D0 \u05DC\u05D6\u05DE\u05E0\u05D9\u05DD, \u05DC\u05DE\u05D6\u05D2 \u05D4\u05D0\u05D5\u05D5\u05D9\u05E8 \u05D0\u05D5 \u05DC\u05D4\u05D5\u05D3\u05E2\u05D5\u05EA \u05E9\u05DC \u05D4\u05E7\u05D5, \u05DB\u05D9 \u05D0\u05D5\u05EA\u05DD \u05D9\u05E9 \u05DC\u05DA \u05DB\u05D1\u05E8.
  {"type":"tell","to":"05...","text":"..."}: \u05DB\u05E9\u05D4\u05DE\u05D3\u05D1\u05E8 \u05DE\u05D1\u05E7\u05E9 \u05DC\u05D4\u05E2\u05D1\u05D9\u05E8 \u05D4\u05D5\u05D3\u05E2\u05D4 \u05DC\u05D7\u05D1\u05E8 ("\u05EA\u05D2\u05D9\u05D3 \u05DC\u05D2\u05D3\u05D9 \u05E9..."). to \u05D4\u05D5\u05D0 \u05DE\u05E1\u05E4\u05E8 \u05D4\u05D8\u05DC\u05E4\u05D5\u05DF \u05E9\u05DC \u05D4\u05D7\u05D1\u05E8 \u05DE\u05D4\u05E8\u05E9\u05D9\u05DE\u05D4, text \u05D4\u05D5\u05D0 \u05D4\u05D4\u05D5\u05D3\u05E2\u05D4 \u05D1\u05D2\u05D5\u05E3 \u05E8\u05D0\u05E9\u05D5\u05DF \u05E9\u05DC \u05D4\u05DE\u05D3\u05D1\u05E8, \u05D1\u05D3\u05D9\u05D5\u05E7 \u05DC\u05E4\u05D9 \u05DE\u05D4 \u05E9\u05D1\u05D9\u05E7\u05E9. \u05D4\u05D4\u05D5\u05D3\u05E2\u05D4 \u05EA\u05D7\u05DB\u05D4 \u05DC\u05D7\u05D1\u05E8 \u05D1\u05EA\u05D9\u05D1\u05D4 \u05D4\u05D0\u05D9\u05E9\u05D9\u05EA \u05E9\u05DC\u05D5, \u05E2\u05DD \u05D4\u05E9\u05DD \u05E9\u05DC \u05D4\u05DE\u05D3\u05D1\u05E8. \u05EA\u05D2\u05D9\u05D3 \u05DC\u05D5 \u05E9\u05D4\u05E2\u05D1\u05E8\u05EA. \u05E8\u05E7 \u05DC\u05D7\u05D1\u05E8\u05D9 \u05D4\u05E7\u05D1\u05D5\u05E6\u05D4.
  {"type":"route","from":"\u05DE\u05E7\u05D5\u05DD \u05D4\u05D9\u05E6\u05D9\u05D0\u05D4","to":"\u05D4\u05D9\u05E2\u05D3","mode":"foot \u05D0\u05D5 car","from_lat":31.8,"from_lon":35.2,"to_lat":31.7,"to_lon":35.2}: \u05DB\u05E9\u05E9\u05D5\u05D0\u05DC\u05D9\u05DD \u05D0\u05D9\u05DA \u05DE\u05D2\u05D9\u05E2\u05D9\u05DD \u05DE\u05DE\u05E7\u05D5\u05DD \u05DC\u05DE\u05E7\u05D5\u05DD. from \u05D5-to \u05D1\u05E2\u05D1\u05E8\u05D9\u05EA, \u05DB\u05DE\u05D4 \u05E9\u05D9\u05D5\u05EA\u05E8 \u05DE\u05D3\u05D5\u05D9\u05E7 (\u05E8\u05D7\u05D5\u05D1, \u05E9\u05DB\u05D5\u05E0\u05D4 \u05D5\u05E2\u05D9\u05E8). \u05EA\u05DF \u05D2\u05DD \u05E7\u05D5\u05D0\u05D5\u05E8\u05D3\u05D9\u05E0\u05D8\u05D5\u05EA \u05DE\u05E9\u05D5\u05E2\u05E8\u05D5\u05EA \u05E9\u05DC \u05E9\u05E0\u05D9 \u05D4\u05DE\u05E7\u05D5\u05DE\u05D5\u05EA, \u05DB\u05D3\u05D9 \u05DC\u05E2\u05D6\u05D5\u05E8 \u05DC\u05DE\u05E6\u05D5\u05D0 \u05D0\u05D5\u05EA\u05DD. \u05D0\u05DD \u05DC\u05D0 \u05D0\u05DE\u05E8\u05D5 \u05DE\u05D0\u05D9\u05E4\u05D4 \u05D9\u05D5\u05E6\u05D0\u05D9\u05DD, \u05EA\u05E9\u05D0\u05DC \u05D0\u05D5\u05EA\u05D5 \u05E7\u05D5\u05D3\u05DD \u05D5\u05D0\u05DC \u05EA\u05D7\u05D6\u05D9\u05E8 route. \u05D4\u05DE\u05E2\u05E8\u05DB\u05EA \u05EA\u05D7\u05E9\u05D1 \u05DE\u05E1\u05DC\u05D5\u05DC \u05D0\u05DE\u05D9\u05EA\u05D9 \u05D1\u05DE\u05E4\u05D4 \u05D5\u05EA\u05E7\u05E8\u05D9\u05D0 \u05D0\u05D5\u05EA\u05D5 \u05D1\u05DE\u05E7\u05D5\u05DD \u05D4\u05EA\u05E9\u05D5\u05D1\u05D4 \u05E9\u05DC\u05DA, \u05D0\u05D6 \u05D1\u05E9\u05D3\u05D4 answer \u05E8\u05E7 "\u05E9\u05E0\u05D9\u05D9\u05D4, \u05D1\u05D5\u05D3\u05E7 \u05DE\u05E1\u05DC\u05D5\u05DC". \u05D0\u05E1\u05D5\u05E8 \u05DC\u05D4\u05DE\u05E6\u05D9\u05D0 \u05DE\u05E1\u05DC\u05D5\u05DC\u05D9\u05DD \u05D1\u05E2\u05E6\u05DE\u05DA.
  {"type":"news","topic":""}: \u05DB\u05E9\u05DE\u05D1\u05E7\u05E9\u05D9\u05DD \u05D7\u05D3\u05E9\u05D5\u05EA \u05D0\u05D5 "\u05DE\u05D4 \u05E7\u05D5\u05E8\u05D4 \u05D1\u05E2\u05D5\u05DC\u05DD". topic \u05E8\u05D9\u05E7, \u05D0\u05D5 \u05E0\u05D5\u05E9\u05D0 \u05D0\u05DD \u05D1\u05D9\u05E7\u05E9\u05D5 (\u05DC\u05DE\u05E9\u05DC "\u05DB\u05DC\u05DB\u05DC\u05D4"). \u05D4\u05DE\u05E2\u05E8\u05DB\u05EA \u05EA\u05E7\u05E8\u05D9\u05D0 \u05DE\u05D1\u05D6\u05E7 \u05DE\u05D4\u05D0\u05D9\u05E0\u05D8\u05E8\u05E0\u05D8 \u05D1\u05DE\u05E7\u05D5\u05DD \u05D4\u05EA\u05E9\u05D5\u05D1\u05D4 \u05E9\u05DC\u05DA, \u05D0\u05D6 \u05D1\u05E9\u05D3\u05D4 answer \u05E8\u05E7 "\u05E9\u05E0\u05D9\u05D9\u05D4, \u05D1\u05D5\u05D3\u05E7 \u05DE\u05D4 \u05D7\u05D3\u05E9".
  {"type":"speed","value":"slower"}, \u05D0\u05D5 "faster", \u05D0\u05D5 "normal": \u05DB\u05E9\u05D4\u05D5\u05D0 \u05DE\u05D1\u05E7\u05E9 \u05E9\u05EA\u05D3\u05D1\u05E8 \u05D9\u05D5\u05EA\u05E8 \u05DC\u05D0\u05D8, \u05D9\u05D5\u05EA\u05E8 \u05DE\u05D4\u05E8 \u05D0\u05D5 \u05E8\u05D2\u05D9\u05DC. \u05E0\u05E9\u05DE\u05E8 \u05DC\u05D5 \u05D2\u05DD \u05DC\u05E9\u05D9\u05D7\u05D5\u05EA \u05D4\u05D1\u05D0\u05D5\u05EA.`;
var ACTIONS_ADMIN = `- \u05E4\u05E2\u05D5\u05DC\u05D5\u05EA \u05E0\u05D9\u05D4\u05D5\u05DC (\u05DE\u05D5\u05EA\u05E8, \u05DB\u05D9 \u05D4\u05DE\u05E9\u05EA\u05DE\u05E9 \u05DE\u05E0\u05D4\u05DC). \u05DE\u05D7\u05D6\u05D9\u05E8\u05D9\u05DD \u05D1\u05E9\u05D3\u05D4 do \u05E8\u05E7 \u05DB\u05E9\u05D4\u05D5\u05D0 \u05D1\u05D9\u05E7\u05E9 \u05D1\u05DE\u05E4\u05D5\u05E8\u05E9. \u05D4\u05DE\u05E2\u05E8\u05DB\u05EA \u05EA\u05E7\u05E8\u05D9\u05D0 \u05DC\u05D5 \u05DE\u05D4 \u05E2\u05D5\u05DE\u05D3 \u05DC\u05D4\u05EA\u05D1\u05E6\u05E2 \u05D5\u05EA\u05D1\u05E7\u05E9 \u05D0\u05D9\u05E9\u05D5\u05E8 \u05D1\u05D4\u05E7\u05E9\u05D4, \u05D5\u05DC\u05DB\u05DF \u05D1\u05EA\u05E9\u05D5\u05D1\u05D4 \u05D0\u05DC \u05EA\u05D2\u05D9\u05D3 \u05E9\u05D6\u05D4 \u05DB\u05D1\u05E8 \u05D1\u05D5\u05E6\u05E2. \u05EA\u05D2\u05D9\u05D3 \u05D1\u05E7\u05E6\u05E8\u05D4 \u05DE\u05D4 \u05D4\u05D1\u05E0\u05EA:
  {"type":"delete","id":"1182"}: \u05DE\u05D7\u05D9\u05E7\u05EA \u05D4\u05D5\u05D3\u05E2\u05D4 \u05DE\u05D4\u05E7\u05D5 (\u05DC\u05E4\u05D9 \u05D4\u05DE\u05E1\u05E4\u05E8 \u05E9\u05DC\u05D4). {"type":"move","id":"1182","to":"important"} \u05D0\u05D5 "regular": \u05D4\u05E2\u05D1\u05E8\u05EA \u05D4\u05D5\u05D3\u05E2\u05D4 \u05DC\u05D4\u05D5\u05D3\u05E2\u05D5\u05EA \u05D4\u05D7\u05E9\u05D5\u05D1\u05D5\u05EA (\u05E2\u05DD \u05E6\u05D9\u05E0\u05EA\u05D5\u05E7 \u05DC\u05DB\u05D5\u05DC\u05DD) \u05D0\u05D5 \u05D4\u05D5\u05E6\u05D0\u05D4 \u05E9\u05DC\u05D4 \u05DE\u05D4\u05D7\u05E9\u05D5\u05D1\u05D5\u05EA.
  {"type":"schedule","at":"YYYY-MM-DD HH:MM","text":"...","important":true}: \u05D4\u05D5\u05D3\u05E2\u05D4 \u05DE\u05EA\u05D5\u05D6\u05DE\u05E0\u05EA, \u05D1\u05E0\u05D5\u05E1\u05D7 \u05D9\u05E4\u05D4 \u05D5\u05E7\u05E6\u05E8 \u05E9\u05DC\u05D5 \u05DC\u05D7\u05D1\u05E8'\u05D4. \u05D4\u05D9\u05D0 \u05D9\u05D5\u05E6\u05D0\u05EA \u05D1\u05E7\u05D5\u05DC \u05D4\u05E2\u05D5\u05D6\u05E8 \u05D5\u05E2\u05DD \u05E6\u05D9\u05E0\u05EA\u05D5\u05E7. \u05D1\u05E9\u05D1\u05EA \u05D5\u05D1\u05D7\u05D2 \u05D4\u05D9\u05D0 \u05EA\u05D7\u05DB\u05D4 \u05DC\u05DE\u05D5\u05E6\u05D0\u05D9 \u05E9\u05D1\u05EA.
  {"type":"event","title":"...","desc":"..."}: \u05E4\u05EA\u05D9\u05D7\u05EA \u05D4\u05E8\u05E9\u05DE\u05D4 \u05DC\u05D0\u05D9\u05E8\u05D5\u05E2 \u05D7\u05D3\u05E9 \u05D1\u05E9\u05DC\u05D5\u05D7\u05D4 9, \u05D1\u05DE\u05E7\u05D5\u05DD \u05D4\u05D0\u05D9\u05E8\u05D5\u05E2 \u05D4\u05E7\u05D5\u05D3\u05DD. desc \u05D4\u05D5\u05D0 \u05DE\u05EA\u05D9 \u05D5\u05D0\u05D9\u05E4\u05D4.
  {"type":"mute","phone":"05...","hours":24}: \u05D4\u05E9\u05EA\u05E7\u05D4 \u05D6\u05DE\u05E0\u05D9\u05EA \u05E9\u05DC \u05D7\u05D1\u05E8, \u05DB\u05DA \u05E9\u05D4\u05D4\u05D5\u05D3\u05E2\u05D5\u05EA \u05E9\u05DC\u05D5 \u05D9\u05D7\u05DB\u05D5 \u05DC\u05D0\u05D9\u05E9\u05D5\u05E8 \u05DE\u05E0\u05D4\u05DC. {"type":"unmute","phone":"05..."}: \u05D1\u05D9\u05D8\u05D5\u05DC \u05D4\u05E9\u05EA\u05E7\u05D4.
  {"type":"entry","text":"..."}: \u05D4\u05D7\u05DC\u05E4\u05EA \u05D4\u05D4\u05D5\u05D3\u05E2\u05D4 \u05E9\u05E0\u05E9\u05DE\u05E2\u05EA \u05DC\u05DB\u05D5\u05DC\u05DD \u05D1\u05DB\u05E0\u05D9\u05E1\u05D4 \u05DC\u05E7\u05D5. {"type":"entry_delete"}: \u05DE\u05D7\u05D9\u05E7\u05EA \u05D4\u05D4\u05D5\u05D3\u05E2\u05D4 \u05E9\u05D1\u05DB\u05E0\u05D9\u05E1\u05D4.
  {"type":"approve_join","phone":"05...","name":"\u05E9\u05DD \u05DE\u05DC\u05D0"}: \u05D0\u05D9\u05E9\u05D5\u05E8 \u05D1\u05E7\u05E9\u05EA \u05D4\u05E6\u05D8\u05E8\u05E4\u05D5\u05EA, \u05E2\u05DD \u05D4\u05E9\u05DD \u05E9\u05D4\u05DE\u05E0\u05D4\u05DC \u05D0\u05DE\u05E8. \u05DB\u05D3\u05D9 \u05E9\u05D9\u05E9\u05DE\u05E2 \u05D0\u05EA \u05D4\u05E9\u05DD \u05E9\u05D4\u05DE\u05D1\u05E7\u05E9 \u05D4\u05E7\u05DC\u05D9\u05D8, \u05D4\u05D7\u05D6\u05E8 \u05D1\u05E9\u05D3\u05D4 play \u05D0\u05EA "join:000" (\u05D4\u05DE\u05E1\u05E4\u05E8 \u05E9\u05DC \u05D4\u05D1\u05E7\u05E9\u05D4).
  {"type":"rule_add","text":"..."}: \u05DB\u05DC\u05DC \u05E7\u05D1\u05D5\u05E2 \u05D7\u05D3\u05E9 \u05DC\u05E2\u05D5\u05D6\u05E8. {"type":"rule_remove","n":2}: \u05DE\u05D7\u05D9\u05E7\u05EA \u05DB\u05DC\u05DC \u05DC\u05E4\u05D9 \u05D4\u05DE\u05E1\u05E4\u05E8 \u05E9\u05DC\u05D5 \u05D1\u05E8\u05E9\u05D9\u05DE\u05EA \u05D4\u05DB\u05DC\u05DC\u05D9\u05DD.
  {"type":"rename","phone":"05...","name":"..."}: \u05E9\u05D9\u05E0\u05D5\u05D9 \u05D4\u05E9\u05DD \u05E9\u05DC \u05D7\u05D1\u05E8 \u05D1\u05DB\u05DC \u05D4\u05E7\u05D5.
  {"type":"broadcast","text":"..."}: \u05D4\u05D5\u05D3\u05E2\u05D4 \u05D0\u05D9\u05E9\u05D9\u05EA \u05DC\u05DB\u05DC \u05D0\u05D7\u05D3 \u05DE\u05D4\u05D7\u05D1\u05E8\u05D9\u05DD, \u05D1\u05EA\u05D9\u05D1\u05D4 \u05D4\u05D0\u05D9\u05E9\u05D9\u05EA \u05E9\u05DC\u05D5 \u05D5\u05E2\u05DD \u05D4\u05E9\u05DD \u05E9\u05DC\u05D5 \u05D1\u05D4\u05EA\u05D7\u05DC\u05D4. \u05D4\u05E0\u05D5\u05E1\u05D7 \u05DE\u05DE\u05E9\u05D9\u05DA \u05D0\u05EA \u05D4\u05E9\u05DD, \u05DC\u05DE\u05E9\u05DC ", \u05E9\u05D9\u05DD \u05DC\u05D1, \u05DE\u05D7\u05E8 \u05D4\u05E9\u05D9\u05E2\u05D5\u05E8 \u05D1\u05E9\u05DE\u05D5\u05E0\u05D4".
  {"type":"undo"}: \u05D1\u05D9\u05D8\u05D5\u05DC \u05D4\u05E4\u05E2\u05D5\u05DC\u05D4 \u05D4\u05D0\u05D7\u05E8\u05D5\u05E0\u05D4 \u05E9\u05E0\u05E2\u05E9\u05EA\u05D4 \u05D3\u05E8\u05DB\u05DA.
  \u05E1\u05D8\u05D8\u05D9\u05E1\u05D8\u05D9\u05E7\u05D5\u05EA, \u05DE\u05D9 \u05DC\u05D0 \u05E0\u05E8\u05E9\u05DD, \u05D4\u05D5\u05D3\u05E2\u05D5\u05EA \u05E9\u05DE\u05DE\u05EA\u05D9\u05E0\u05D5\u05EA \u05DC\u05D0\u05D9\u05E9\u05D5\u05E8, \u05D1\u05E7\u05E9\u05D5\u05EA \u05D4\u05E6\u05D8\u05E8\u05E4\u05D5\u05EA \u05D5\u05E1\u05D9\u05DB\u05D5\u05DD \u05D4\u05E9\u05D9\u05D7\u05D5\u05EA \u05E2\u05DD \u05D4\u05E2\u05D5\u05D6\u05E8: \u05E4\u05E9\u05D5\u05D8 \u05EA\u05E2\u05E0\u05D4 \u05DE\u05D4\u05DE\u05D9\u05D3\u05E2 \u05DC\u05E0\u05D9\u05D4\u05D5\u05DC \u05E9\u05DC\u05DE\u05D8\u05D4.`;
async function extrasFor(env, phone, callId, isAdmin, line) {
  const nm = names(env), me = nm[phone];
  const [loc, mem, ev, rs, learn, rules, adm] = await Promise.all([
    callerLoc(env, phone),
    memText(env, phone, callId).catch(() => ""),
    curEvent(env),
    rsvpLoad(env).catch(() => ({})),
    phone ? kvGet(env, "learn:" + phone, null) : null,
    kvGet(env, "rules", []),
    isAdmin ? adminText(env, line).catch((e) => "\u05D4\u05DE\u05D9\u05D3\u05E2 \u05DC\u05E0\u05D9\u05D4\u05D5\u05DC \u05DC\u05D0 \u05D6\u05DE\u05D9\u05DF \u05DB\u05E8\u05D2\u05E2: " + e.message) : ""
  ]);
  const world = await worldText(env, loc).catch(() => "");
  const out = [];
  if (world) out.push(world + " \u05DB\u05E9\u05E2\u05D5\u05E0\u05D9\u05DD \u05E2\u05DC \u05D6\u05DE\u05E0\u05D9\u05DD \u05D0\u05D5 \u05E2\u05DC \u05DE\u05D6\u05D2 \u05D0\u05D5\u05D5\u05D9\u05E8, \u05EA\u05D2\u05D9\u05D3 \u05DC\u05E4\u05D9 \u05D0\u05D9\u05D6\u05D4 \u05DE\u05E7\u05D5\u05DD. \u05D0\u05DD \u05DC\u05D0 \u05D1\u05E8\u05D5\u05E8 \u05E9\u05D4\u05D5\u05D0 \u05E0\u05DE\u05E6\u05D0 \u05E9\u05DD, \u05EA\u05E6\u05D9\u05E2 \u05D1\u05E7\u05E6\u05E8\u05D4 \u05E9\u05D0\u05E4\u05E9\u05E8 \u05DC\u05D4\u05D2\u05D9\u05D3 \u05DC\u05DA \u05DE\u05E7\u05D5\u05DD \u05D0\u05D7\u05E8.");
  if (mem) out.push("[[H]]" + mem + "[[/H]]");
  const reg = Object.values(rs);
  out.push(`\u05D4\u05D0\u05D9\u05E8\u05D5\u05E2 \u05D4\u05E4\u05E2\u05D9\u05DC \u05DC\u05D4\u05E8\u05E9\u05DE\u05D4 (\u05E9\u05DC\u05D5\u05D7\u05D4 9): ${ev.title}${ev.desc ? ", " + ev.desc : ""}. \u05E0\u05E8\u05E9\u05DE\u05D5 ${reg.length}: ${reg.map((x) => x.n).join(", ") || "\u05D0\u05E3 \u05D0\u05D7\u05D3"}. ${phone && rs[phone] ? "\u05D4\u05DE\u05D3\u05D1\u05E8 \u05DB\u05D1\u05E8 \u05E8\u05E9\u05D5\u05DD." : "\u05D4\u05DE\u05D3\u05D1\u05E8 \u05E2\u05D3\u05D9\u05D9\u05DF \u05DC\u05D0 \u05E8\u05E9\u05D5\u05DD."}`);
  if (me) out.push("[[H]]\u05DE\u05E1\u05E4\u05E8\u05D9 \u05D4\u05D8\u05DC\u05E4\u05D5\u05DF \u05E9\u05DC \u05D4\u05D7\u05D1\u05E8\u05D9\u05DD (\u05DE\u05D5\u05EA\u05E8 \u05DC\u05DE\u05E1\u05D5\u05E8, \u05DB\u05D9 \u05D4\u05DE\u05D3\u05D1\u05E8 \u05D4\u05D5\u05D0 \u05D7\u05D1\u05E8 \u05D1\u05E7\u05D1\u05D5\u05E6\u05D4): " + Object.entries(nm).map(([p, n]) => `${n} ${p}`).join(", ") + ". \u05DB\u05E9\u05D0\u05EA\u05D4 \u05D0\u05D5\u05DE\u05E8 \u05DE\u05E1\u05E4\u05E8 \u05D8\u05DC\u05E4\u05D5\u05DF, \u05DB\u05EA\u05D5\u05D1 \u05D0\u05D5\u05EA\u05D5 \u05E1\u05E4\u05E8\u05D4 \u05D0\u05D7\u05E8\u05D9 \u05E1\u05E4\u05E8\u05D4 \u05E2\u05DD \u05E8\u05D5\u05D5\u05D7\u05D9\u05DD, \u05DC\u05DE\u05E9\u05DC 0 5 3 3 1 4 3 4 0 4.[[/H]]");
  else out.push("\u05D0\u05E1\u05D5\u05E8 \u05DC\u05DE\u05E1\u05D5\u05E8 \u05DE\u05E1\u05E4\u05E8\u05D9 \u05D8\u05DC\u05E4\u05D5\u05DF \u05E9\u05DC \u05D7\u05D1\u05E8\u05D9\u05DD \u05DC\u05DE\u05D9 \u05E9\u05D0\u05D9\u05E0\u05D5 \u05D7\u05D1\u05E8 \u05D1\u05E7\u05D1\u05D5\u05E6\u05D4.");
  if (me) {
    const pm = await personalNew(env, phone).catch(() => []);
    out.push(pm.length ? `\u05D4\u05D5\u05D3\u05E2\u05D5\u05EA \u05D0\u05D9\u05E9\u05D9\u05D5\u05EA \u05D7\u05D3\u05E9\u05D5\u05EA \u05E9\u05DE\u05D7\u05DB\u05D5\u05EA \u05DC\u05DE\u05D3\u05D1\u05E8 (${pm.length}): ` + pm.map((m) => `pm:${m.id} \u05DE\u05D0\u05EA ${m.from} (${m.d})`).join("; ") + `. \u05D0\u05DD \u05D4\u05D5\u05D0 \u05E9\u05D5\u05D0\u05DC \u05E2\u05DC \u05D4\u05D4\u05D5\u05D3\u05E2\u05D5\u05EA \u05D4\u05D0\u05D9\u05E9\u05D9\u05D5\u05EA \u05E9\u05DC\u05D5, \u05EA\u05D2\u05D9\u05D3 \u05DE\u05DE\u05D9 \u05D5\u05DE\u05EA\u05D9 (\u05D1\u05DC\u05D9 \u05DC\u05D4\u05E7\u05E8\u05D9\u05D0 \u05D0\u05EA \u05D4\u05DE\u05D6\u05D4\u05D9\u05DD), \u05D5\u05EA\u05E9\u05D0\u05DC \u05D0\u05DD \u05DC\u05D4\u05E9\u05DE\u05D9\u05E2. \u05DB\u05D3\u05D9 \u05DC\u05D4\u05E9\u05DE\u05D9\u05E2, \u05D4\u05D7\u05D6\u05E8 \u05D1\u05E9\u05D3\u05D4 play \u05D0\u05EA \u05D4\u05DE\u05D6\u05D4\u05D9\u05DD (\u05DC\u05DE\u05E9\u05DC "pm:${pm[0].id}"), \u05E2\u05D3 3 \u05D1\u05DB\u05DC \u05E4\u05E2\u05DD.` : "\u05D0\u05D9\u05DF \u05DC\u05DE\u05D3\u05D1\u05E8 \u05D4\u05D5\u05D3\u05E2\u05D5\u05EA \u05D0\u05D9\u05E9\u05D9\u05D5\u05EA \u05D7\u05D3\u05E9\u05D5\u05EA.");
  }
  if (learn && learn.segs) out.push(`\u05D0\u05EA\u05DD \u05D1\u05D0\u05DE\u05E6\u05E2 \u05DC\u05D9\u05DE\u05D5\u05D3 \u05D1\u05D7\u05D1\u05E8\u05D5\u05EA\u05D0 \u05E9\u05DC ${learn.he}, \u05E7\u05D8\u05E2 ${learn.i + 1} \u05DE\u05EA\u05D5\u05DA ${learn.segs.length}. \u05D4\u05DC\u05E9\u05D5\u05DF \u05E9\u05DC \u05D4\u05E7\u05D8\u05E2 \u05D4\u05E0\u05D5\u05DB\u05D7\u05D9: "${learn.segs[learn.i]}". \u05D1\u05D7\u05D1\u05E8\u05D5\u05EA\u05D0: \u05EA\u05E1\u05D1\u05D9\u05E8 \u05D1\u05E7\u05E6\u05E8\u05D4 \u05D5\u05D1\u05E4\u05E9\u05D8\u05D5\u05EA, \u05E9\u05D0\u05DC \u05D0\u05D5\u05EA\u05D5 \u05E9\u05D0\u05DC\u05D4 \u05D0\u05D7\u05EA \u05DC\u05D4\u05D1\u05E0\u05D4 \u05D5\u05D7\u05DB\u05D4 \u05DC\u05EA\u05E9\u05D5\u05D1\u05D4 \u05E9\u05DC\u05D5. \u05DB\u05E9\u05D4\u05D5\u05D0 \u05E2\u05D5\u05E0\u05D4, \u05EA\u05D2\u05D9\u05D1 \u05D5\u05EA\u05EA\u05E7\u05DF \u05D1\u05E2\u05D3\u05D9\u05E0\u05D5\u05EA. \u05DB\u05E9\u05D4\u05D5\u05D0 \u05E8\u05D5\u05E6\u05D4 \u05DC\u05D4\u05DE\u05E9\u05D9\u05DA, \u05D4\u05D7\u05D6\u05E8 learn_next. \u05D0\u05DD \u05D6\u05D5 \u05EA\u05D7\u05D9\u05DC\u05EA \u05E9\u05D9\u05D7\u05D4 \u05D7\u05D3\u05E9\u05D4, \u05EA\u05E6\u05D9\u05E2 \u05DC\u05D5 \u05DC\u05D4\u05DE\u05E9\u05D9\u05DA \u05DE\u05D0\u05D9\u05E4\u05D4 \u05E9\u05D4\u05E4\u05E1\u05E7\u05EA\u05DD.`);
  if (rules.length) out.push("\u05DB\u05DC\u05DC\u05D9\u05DD \u05E7\u05D1\u05D5\u05E2\u05D9\u05DD \u05E9\u05DE\u05E0\u05D4\u05DC \u05D4\u05E7\u05D1\u05D5\u05E6\u05D4 \u05E7\u05D1\u05E2 \u05DC\u05DA (\u05D7\u05D5\u05D1\u05D4 \u05DC\u05E4\u05E2\u05D5\u05DC \u05DC\u05E4\u05D9\u05D4\u05DD): " + rules.map((r, i) => `${i + 1}. ${r}`).join(" "));
  out.push("[[H]]" + ACTIONS_USER + "[[/H]]");
  out.push(`\u05DE\u05E1\u05DC\u05D5\u05DC\u05D9\u05DD: \u05DB\u05E9\u05E9\u05D5\u05D0\u05DC\u05D9\u05DD \u05D0\u05D9\u05DA \u05DE\u05D2\u05D9\u05E2\u05D9\u05DD \u05DE\u05DE\u05E7\u05D5\u05DD \u05DC\u05DE\u05E7\u05D5\u05DD, \u05D0\u05DC \u05EA\u05DE\u05E6\u05D9\u05D0 \u05DE\u05E1\u05DC\u05D5\u05DC. \u05D4\u05D7\u05D6\u05E8 \u05D1\u05E9\u05D3\u05D4 do \u05D0\u05EA [{"type":"route","from":"...","to":"...","mode":"foot"}] \u05D5\u05D1\u05E9\u05D3\u05D4 answer \u05E8\u05E7 "\u05E9\u05E0\u05D9\u05D9\u05D4, \u05D1\u05D5\u05D3\u05E7 \u05DE\u05E1\u05DC\u05D5\u05DC". \u05D0\u05DD \u05DC\u05D0 \u05D9\u05D3\u05D5\u05E2 \u05DE\u05D0\u05D9\u05E4\u05D4 \u05D9\u05D5\u05E6\u05D0\u05D9\u05DD, \u05EA\u05E9\u05D0\u05DC.`);
  out.push(`\u05D7\u05D3\u05E9\u05D5\u05EA: \u05DB\u05E9\u05DE\u05D1\u05E7\u05E9\u05D9\u05DD \u05D7\u05D3\u05E9\u05D5\u05EA, \u05D4\u05D7\u05D6\u05E8 \u05D1\u05E9\u05D3\u05D4 do \u05D0\u05EA [{"type":"news","topic":""}] \u05D5\u05D1\u05E9\u05D3\u05D4 answer \u05E8\u05E7 "\u05E9\u05E0\u05D9\u05D9\u05D4, \u05D1\u05D5\u05D3\u05E7 \u05DE\u05D4 \u05D7\u05D3\u05E9".`);
  out.push(`\u05D7\u05D9\u05E4\u05D5\u05E9 \u05D1\u05D0\u05D9\u05E0\u05D8\u05E8\u05E0\u05D8: \u05E2\u05DC \u05E9\u05D0\u05DC\u05D4 \u05E2\u05DC \u05DE\u05D9 \u05DE\u05DB\u05D4\u05DF \u05D4\u05D9\u05D5\u05DD \u05D1\u05EA\u05E4\u05E7\u05D9\u05D3, \u05D7\u05D3\u05E9\u05D5\u05EA, \u05DE\u05D7\u05D9\u05E8\u05D9\u05DD, \u05D0\u05D5 \u05DB\u05DC \u05DE\u05D9\u05D3\u05E2 \u05E2\u05D3\u05DB\u05E0\u05D9 \u05DE\u05D4\u05E2\u05D5\u05DC\u05DD, \u05D0\u05DC \u05EA\u05E2\u05E0\u05D4 \u05DE\u05D4\u05D6\u05D9\u05DB\u05E8\u05D5\u05DF. \u05D4\u05D7\u05D6\u05E8 \u05D1\u05E9\u05D3\u05D4 do \u05D0\u05EA [{"type":"web","query":"\u05D4\u05E9\u05D0\u05DC\u05D4 \u05D4\u05DE\u05DC\u05D0\u05D4"}] \u05D5\u05D1\u05E9\u05D3\u05D4 answer \u05E8\u05E7 "\u05E9\u05E0\u05D9\u05D9\u05D4, \u05D1\u05D5\u05D3\u05E7".`);
  out.push(isAdmin ? "[[H]]" + ACTIONS_ADMIN + "\n" + adm + "[[/H]]" : "- \u05E4\u05E2\u05D5\u05DC\u05D5\u05EA \u05E0\u05D9\u05D4\u05D5\u05DC \u05DE\u05D5\u05EA\u05E8\u05D5\u05EA \u05E8\u05E7 \u05DC\u05DE\u05E0\u05D4\u05DC\u05D9\u05DD. \u05D0\u05DD \u05D4\u05D5\u05D0 \u05DE\u05D1\u05E7\u05E9 \u05E4\u05E2\u05D5\u05DC\u05EA \u05E0\u05D9\u05D4\u05D5\u05DC, \u05EA\u05D2\u05D9\u05D3 \u05DC\u05D5 \u05D1\u05D7\u05D1\u05D9\u05D1\u05D5\u05EA \u05E9\u05E8\u05E7 \u05DE\u05E0\u05D4\u05DC\u05D9\u05DD \u05D9\u05DB\u05D5\u05DC\u05D9\u05DD.");
  return out.join("\n- ");
}
__name(extrasFor, "extrasFor");
async function answerWithCheck(env, input, history) {
  const line = await loadLine(env);
  const who = whoText(env, input.phone, line), me = names(env)[input.phone] || "";
  const isAdmin = await isAdminPhone(env, input.phone);
  const adminRule = isAdmin ? "\u05D4\u05DE\u05E9\u05EA\u05DE\u05E9 \u05D4\u05D5\u05D0 \u05DE\u05E0\u05D4\u05DC \u05D5\u05DC\u05DB\u05DF \u05DE\u05D5\u05EA\u05E8. \u05E0\u05E1\u05D7 \u05D0\u05EA \u05D4\u05D4\u05D5\u05D3\u05E2\u05D4 \u05D9\u05E4\u05D4 \u05D5\u05E7\u05E6\u05E8, \u05DB\u05D4\u05D5\u05D3\u05E2\u05D4 \u05DE\u05DE\u05E0\u05D5 \u05DC\u05D7\u05D1\u05E8'\u05D4, \u05D5\u05D4\u05D7\u05D6\u05E8 \u05D0\u05D5\u05EA\u05D4 \u05D1\u05E9\u05D3\u05D4 post. \u05D1\u05E9\u05D3\u05D4 important \u05D4\u05D7\u05D6\u05E8 true \u05E8\u05E7 \u05D0\u05DD \u05D4\u05D5\u05D0 \u05D1\u05D9\u05E7\u05E9 \u05D1\u05DE\u05E4\u05D5\u05E8\u05E9 \u05D4\u05D5\u05D3\u05E2\u05D4 \u05D7\u05E9\u05D5\u05D1\u05D4 \u05D0\u05D5 \u05D3\u05D7\u05D5\u05E4\u05D4. \u05D1\u05E9\u05D3\u05D4 answer \u05EA\u05D2\u05D9\u05D3 \u05DC\u05D5 \u05D1\u05E7\u05E6\u05E8\u05D4 \u05DE\u05D4 \u05D4\u05E0\u05D5\u05E1\u05D7, \u05D5\u05D4\u05DE\u05E2\u05E8\u05DB\u05EA \u05EA\u05D1\u05E7\u05E9 \u05DE\u05DE\u05E0\u05D5 \u05DC\u05D0\u05E9\u05E8 \u05D1\u05D4\u05E7\u05E9\u05D4." : "\u05E8\u05E7 \u05DE\u05E0\u05D4\u05DC\u05D9 \u05D4\u05E7\u05D1\u05D5\u05E6\u05D4 \u05D9\u05DB\u05D5\u05DC\u05D9\u05DD \u05DC\u05E4\u05E8\u05E1\u05DD \u05D4\u05D5\u05D3\u05E2\u05D5\u05EA \u05D3\u05E8\u05DB\u05DA. \u05D0\u05DE\u05D5\u05E8 \u05DC\u05D5 \u05D0\u05EA \u05D6\u05D4 \u05D1\u05D7\u05D1\u05D9\u05D1\u05D5\u05EA, \u05D4\u05E6\u05E2 \u05DC\u05D5 \u05DC\u05D4\u05E7\u05DC\u05D9\u05D8 \u05D4\u05D5\u05D3\u05E2\u05D4 \u05D1\u05E9\u05DC\u05D5\u05D7\u05D4 2, \u05D5\u05D4\u05E9\u05D0\u05E8 \u05D0\u05EA post \u05E8\u05D9\u05E7.";
  const extras = await extrasFor(env, input.phone, input.callId || "", isAdmin, line);
  const pkey = PERSONAS[input.persona] ? input.persona : "tzibtzer";
  const ex = /* @__PURE__ */ __name((e) => [who, extras, e].filter(Boolean).join("\n- ") + "{{PERSONA:" + pkey + "}}{{ADMINRULE:" + adminRule + "}}", "ex");
  const pack = /* @__PURE__ */ __name((r, transcript, via, v) => ({ transcript, answer: v.text, removed: v.removed, via, play: r.play, post: isAdmin ? r.post : "", important: !!r.important, persona: r.persona, do: Array.isArray(r.do) ? r.do : [], isAdmin }), "pack");
  let googleDown = false, out = null;
  if (input.audio) {
    try {
      if (force === "aai") throw new Error("forced");
      const r = await audioAnswer(env, input.audio, history, line, ex(""));
      let v = verifyQuotes(r.answer, line.corpus), rr = r;
      if (!v.text.trim()) {
        rr = await audioAnswer(env, input.audio, history, line, ex("\u05D1\u05EA\u05E9\u05D5\u05D1\u05D4 \u05D4\u05D6\u05D5 \u05D0\u05DC \u05EA\u05E6\u05D8\u05D8 \u05D9\u05E9\u05D9\u05E8\u05D5\u05EA \u05D0\u05E3 \u05D4\u05D5\u05D3\u05E2\u05D4."));
        v = verifyQuotes(rr.answer, line.corpus);
      }
      out = pack(rr, r.transcript || "", "gemini-audio", v);
    } catch (e) {
      aiTrace.push("gemini audio exhausted: " + e.message);
      googleDown = true;
    }
    if (!out) {
      let q = cleanupTranscript(await aaiSTT(env, input.audio).catch((e) => {
        aiTrace.push("aai " + e.message);
        return "";
      }));
      if (q) aiTrace.push("aai: " + q);
      if (!q || JUNK.has(q.trim())) {
        q = await groqSTT(env, input.audio).catch(() => "");
        if (!saneTranscript(q, input.audio) && env.AI)
          q = await env.AI.run("@cf/openai/whisper-large-v3-turbo", { audio: b64(input.audio), language: "he" }).then((r) => (r.text || "").trim()).catch(() => "");
        if (!saneTranscript(q, input.audio)) q = "";
      }
      if (!q) return { transcript: q, answer: "\u05DC\u05D0 \u05D4\u05E6\u05DC\u05D7\u05EA\u05D9 \u05DC\u05E9\u05DE\u05D5\u05E2 \u05D8\u05D5\u05D1. \u05D0\u05E4\u05E9\u05E8 \u05DC\u05D7\u05D6\u05D5\u05E8 \u05E2\u05DC \u05D4\u05E9\u05D0\u05DC\u05D4, \u05DC\u05D0\u05D8 \u05D5\u05D1\u05E7\u05D5\u05DC \u05D1\u05E8\u05D5\u05E8?", removed: 0, via: "unclear", do: [] };
      input = { ...input, text: q, audio: null };
    }
  }
  if (!out) {
    const question = input.text || "";
    const opts = googleDown ? { models: [] } : {};
    let res = await chatTurn(env, question, history, line, ex(""), { ...opts, me });
    let v = verifyQuotes(res.answer, line.corpus);
    if (!v.text.trim()) {
      res = await chatTurn(env, question, history, line, ex("\u05D1\u05EA\u05E9\u05D5\u05D1\u05D4 \u05D4\u05D6\u05D5 \u05D0\u05DC \u05EA\u05E6\u05D8\u05D8 \u05D9\u05E9\u05D9\u05E8\u05D5\u05EA \u05D0\u05E3 \u05D4\u05D5\u05D3\u05E2\u05D4."), { ...opts, me });
      v = verifyQuotes(res.answer, line.corpus);
    }
    out = pack(res, question, "text", v);
  }
  const locAct = out.do.find((a) => a && a.type === "location" && a.place);
  if (locAct && input.phone && out.transcript) {
    const g = await geocode(locAct.place, locAct.lat, locAct.lon);
    if (g) {
      await env.KV.put("loc:" + input.phone, JSON.stringify(g));
      const ex2 = /* @__PURE__ */ __name((e) => [who, `\u05D4\u05DE\u05D9\u05E7\u05D5\u05DD \u05E9\u05DC \u05D4\u05DE\u05D3\u05D1\u05E8 \u05E2\u05D5\u05D3\u05DB\u05DF \u05E2\u05DB\u05E9\u05D9\u05D5 \u05DC${g.name}. \u05EA\u05E2\u05E0\u05D4 \u05E2\u05DC \u05D4\u05E9\u05D0\u05DC\u05D4 \u05E9\u05DC\u05D5 \u05DC\u05E4\u05D9 \u05D4\u05DE\u05E7\u05D5\u05DD \u05D4\u05D6\u05D4.`, e].filter(Boolean).join("\n- "), "ex2");
      const extras2 = await extrasFor(env, input.phone, input.callId || "", isAdmin, line);
      try {
        const r2 = await chatTurn(env, out.transcript, history, line, ex2(extras2) + "{{PERSONA:" + pkey + "}}{{ADMINRULE:" + adminRule + "}}", { me });
        const v2 = verifyQuotes(r2.answer, line.corpus);
        if (v2.text.trim()) out.answer = v2.text;
      } catch (e) {
        aiTrace.push("relocate: " + e.message);
      }
    } else out.answer += " \u05DC\u05D0 \u05D4\u05E6\u05DC\u05D7\u05EA\u05D9 \u05DC\u05DE\u05E6\u05D5\u05D0 \u05D0\u05EA \u05D4\u05DE\u05E7\u05D5\u05DD \u05D4\u05D6\u05D4, \u05D0\u05D6 \u05E0\u05E9\u05D0\u05E8\u05EA\u05D9 \u05E2\u05DD \u05D4\u05DE\u05D9\u05E7\u05D5\u05DD \u05D4\u05E7\u05D5\u05D3\u05DD.";
    out.do = out.do.filter((a) => a !== locAct);
  }
  return out;
}
__name(answerWithCheck, "answerWithCheck");
async function applyActions(env, acts, { phone, callId, isAdmin }) {
  const nm = names(env), after = [], confirm = [];
  let replace = "";
  for (const a of acts.slice(0, 4)) {
    if (!a || typeof a.type !== "string") continue;
    try {
      if (a.type === "rsvp" && phone) {
        const list = await rsvpLoad(env);
        const was = !!list[phone];
        if (a.value === "cancel") delete list[phone];
        else list[phone] = { n: nm[phone] || phone, ts: list[phone]?.ts || nowIL() };
        await rsvpSave(env, list);
        await env.KV.delete("admintext");
        if (a.value !== "cancel" && !was) await announceRsvp(env, nm[phone] || "\u05D7\u05D1\u05E8 \u05D7\u05D3\u05E9", Object.keys(list).length).catch(() => {
        });
        await log(env, `${nm[phone] || phone} ${a.value === "cancel" ? "\u05D1\u05D9\u05D8\u05DC \u05D0\u05EA \u05D4\u05D4\u05E8\u05E9\u05DE\u05D4" : "\u05E0\u05E8\u05E9\u05DD"} \u05DC\u05D0\u05D9\u05E8\u05D5\u05E2 \u05D3\u05E8\u05DA \u05D4\u05E2\u05D5\u05D6\u05E8 \u05D4\u05D7\u05DB\u05DD`).catch(() => {
        });
      } else if (a.type === "remember" && a.text) await memSave(env, phone, callId, "", "", a.text);
      else if (a.type === "reminder" && phone && /^\d{4}-\d\d-\d\d \d\d:\d\d$/.test(a.at || "") && a.at > nowIL().slice(0, 16) && a.text) {
        const jobs = await kvGet(env, "scheduled", []);
        jobs.push({ id: "r" + Date.now().toString(36), at: a.at, type: "remind", phone, text: String(a.text).slice(0, 300) });
        await env.KV.put("scheduled", JSON.stringify(jobs));
      } else if (a.type === "speed" && phone) {
        const cur = +await env.KV.get("speed:" + phone) || 1;
        const nv = a.value === "slower" ? Math.max(0.7, cur - 0.15) : a.value === "faster" ? Math.min(1.45, cur + 0.15) : 1;
        await env.KV.put("speed:" + phone, String(Math.round(nv * 100) / 100));
      } else if (a.type === "source" && a.ref) {
        const s = await sefaria(a.ref);
        if (s) after.push(`\u05D5\u05D6\u05D4 \u05D4\u05DC\u05E9\u05D5\u05DF \u05D1${s.he}: ${cutText(s.segs.join(" "))}`);
      } else if (a.type === "learn" && a.ref && phone) {
        const s = await sefaria(a.ref);
        if (s) {
          await env.KV.put("learn:" + phone, JSON.stringify({ ref: a.ref, he: s.he, segs: s.segs.map((x) => cutText(x, 700)), i: 0 }), { expirationTtl: 60 * 86400 });
          after.push(`${s.he}. ${cutText(s.segs[0], 700)}. \u05E8\u05D5\u05E6\u05D4 \u05E9\u05D0\u05E1\u05D1\u05D9\u05E8? \u05EA\u05D2\u05D9\u05D3 \u05DC\u05D9. \u05D5\u05D0\u05DD \u05DC\u05D4\u05DE\u05E9\u05D9\u05DA, \u05EA\u05D2\u05D9\u05D3 \u05D4\u05DC\u05D0\u05D4.`);
        } else after.push("\u05DC\u05D0 \u05D4\u05E6\u05DC\u05D7\u05EA\u05D9 \u05DC\u05DE\u05E6\u05D5\u05D0 \u05D0\u05EA \u05D6\u05D4 \u05D1\u05E1\u05E4\u05E8\u05D9\u05D4. \u05D0\u05E4\u05E9\u05E8 \u05DC\u05E0\u05E1\u05D5\u05EA \u05DC\u05D4\u05D2\u05D9\u05D3 \u05D0\u05EA \u05D6\u05D4 \u05D0\u05D7\u05E8\u05EA.");
      } else if (a.type === "learn_next" && phone) {
        const L = await kvGet(env, "learn:" + phone, null);
        if (L) {
          L.i++;
          if (L.i < L.segs.length) {
            await env.KV.put("learn:" + phone, JSON.stringify(L), { expirationTtl: 60 * 86400 });
            after.push(`\u05E7\u05D8\u05E2 ${L.i + 1}. ${L.segs[L.i]}. \u05E8\u05D5\u05E6\u05D4 \u05E9\u05D0\u05E1\u05D1\u05D9\u05E8? \u05D5\u05D0\u05DD \u05DC\u05D4\u05DE\u05E9\u05D9\u05DA, \u05EA\u05D2\u05D9\u05D3 \u05D4\u05DC\u05D0\u05D4.`);
          } else {
            await env.KV.delete("learn:" + phone);
            after.push(`\u05E1\u05D9\u05D9\u05DE\u05E0\u05D5 \u05D0\u05EA ${L.he}. \u05D9\u05D9\u05E9\u05E8 \u05DB\u05D5\u05D7!`);
          }
        }
      } else if (a.type === "learn_stop" && phone) await env.KV.delete("learn:" + phone);
      else if (a.type === "tell" && phone && nm[phone] && a.text) {
        const to = String(a.to || "").replace(/\D/g, "");
        if (nm[to]) await tellFriend(env, phone, to, String(a.text).slice(0, 600));
        else after.push("\u05DC\u05D0 \u05DE\u05E6\u05D0\u05EA\u05D9 \u05D0\u05EA \u05D4\u05D7\u05D1\u05E8 \u05D4\u05D6\u05D4 \u05D1\u05E8\u05E9\u05D9\u05DE\u05D4, \u05D0\u05D6 \u05D4\u05D4\u05D5\u05D3\u05E2\u05D4 \u05DC\u05D0 \u05E0\u05E9\u05DC\u05D7\u05D4.");
      } else if (a.type === "route" && (a.from || a.to)) replace = await routeAnswer(a).catch(() => "") || "\u05DC\u05D0 \u05D4\u05E6\u05DC\u05D7\u05EA\u05D9 \u05DC\u05D7\u05E9\u05D1 \u05DE\u05E1\u05DC\u05D5\u05DC \u05DB\u05E8\u05D2\u05E2.";
      else if (a.type === "news") replace = await newsAnswer(env, String(a.topic || "").slice(0, 100), isAdmin) || "\u05DC\u05D0 \u05D4\u05E6\u05DC\u05D7\u05EA\u05D9 \u05DC\u05D4\u05D1\u05D9\u05D0 \u05D7\u05D3\u05E9\u05D5\u05EA \u05DB\u05E8\u05D2\u05E2. \u05D0\u05E4\u05E9\u05E8 \u05DC\u05E0\u05E1\u05D5\u05EA \u05E9\u05D5\u05D1 \u05E2\u05D5\u05D3 \u05DE\u05E2\u05D8.";
      else if (a.type === "web" && a.query) {
        replace = await webAnswer(env, String(a.query).slice(0, 500), "", String(a.query_en || "").slice(0, 300)) || "\u05DC\u05D0 \u05D4\u05E6\u05DC\u05D7\u05EA\u05D9 \u05DC\u05DE\u05E6\u05D5\u05D0 \u05D0\u05EA \u05D6\u05D4 \u05D1\u05D0\u05D9\u05E0\u05D8\u05E8\u05E0\u05D8 \u05DB\u05E8\u05D2\u05E2. \u05D0\u05E4\u05E9\u05E8 \u05DC\u05E0\u05E1\u05D5\u05EA \u05E9\u05D5\u05D1 \u05E2\u05D5\u05D3 \u05DE\u05E2\u05D8.";
      } else if (ADMIN_ACTS.has(a.type) && isAdmin) {
        if (a.phone) a.phone = String(a.phone).replace(/\D/g, "");
        confirm.push(a);
      }
    } catch (e) {
      aiTrace.push("act " + a.type + ": " + e.message);
    }
  }
  return { after: after.join(" "), confirm, replace };
}
__name(applyActions, "applyActions");
async function chat(env, u, ctx, persona = "tzibtzer") {
  const t0 = Date.now();
  const q = Object.fromEntries(u.searchParams);
  const callId = q.ApiCallId || "x", phone = q.ApiPhone || "";
  const saved = q.ApiCallId ? await env.KV.get("persona:" + callId) : null;
  let P2 = PERSONAS[saved] ? saved : PERSONAS[persona] ? persona : "tzibtzer", V = PERSONAS[P2].voice, EL = PERSONAS[P2].el;
  const turns = Object.keys(q).filter((k) => /^R\d+$/.test(k)).map((k) => +k.slice(1)).sort((a, b) => a - b);
  const ask = /* @__PURE__ */ __name(async (n2, prompt) => `read=${await speak(env, ctx, prompt, { cache: true, voice: V })}=R${n2},no,record,,,no,,,1,60`, "ask");
  const bye = /* @__PURE__ */ __name(async () => `id_list_message=${await speak(env, ctx, "\u05EA\u05D5\u05D3\u05D4 \u05D5\u05DC\u05D4\u05EA\u05E8\u05D0\u05D5\u05EA", { cache: true, voice: V })}&go_to_folder=/`, "bye");
  const more = "\u05DC\u05E9\u05D0\u05DC\u05D4 \u05E0\u05D5\u05E1\u05E4\u05EA \u05D3\u05D1\u05E8\u05D5 \u05D0\u05D7\u05E8\u05D9 \u05D4\u05E6\u05DC\u05D9\u05DC \u05D5\u05D1\u05E1\u05D9\u05D5\u05DD \u05D4\u05E7\u05D9\u05E9\u05D5 \u05E1\u05D5\u05DC\u05DE\u05D9\u05EA. \u05DC\u05D9\u05E6\u05D9\u05D0\u05D4 \u05D4\u05E7\u05D9\u05E9\u05D5 \u05E1\u05D5\u05DC\u05DE\u05D9\u05EA \u05D1\u05DC\u05D9 \u05DC\u05D5\u05DE\u05E8 \u05DB\u05DC\u05D5\u05DD";
  const moreShort = "\u05E2\u05D5\u05D3 \u05E9\u05D0\u05DC\u05D4? \u05D3\u05D1\u05E8\u05D5 \u05D0\u05D7\u05E8\u05D9 \u05D4\u05E6\u05DC\u05D9\u05DC, \u05D5\u05D1\u05E1\u05D5\u05E3 \u05E1\u05D5\u05DC\u05DE\u05D9\u05EA";
  const skip = await env.KV.get("skipmode") !== "off";
  if (!turns.length) {
    chats.set(callId, []);
    const first = (names(env)[phone] || "").split(" ")[0];
    const who = P2 === "tzibtzer" ? "\u05D0\u05E0\u05D9 \u05D4\u05E2\u05D5\u05D6\u05E8 \u05D4\u05D7\u05DB\u05DD \u05E9\u05DC \u05D4\u05E7\u05D1\u05D5\u05E6\u05D4" : `\u05DB\u05D0\u05DF ${PERSONAS[P2].name}`;
    return await ask(1, `\u05E9\u05DC\u05D5\u05DD${first ? " " + first : ""}, ${who}. \u05D0\u05DE\u05E8\u05D5 \u05D0\u05EA \u05D4\u05E9\u05D0\u05DC\u05D4 \u05E9\u05DC\u05DB\u05DD \u05D0\u05D7\u05E8\u05D9 \u05D4\u05E6\u05DC\u05D9\u05DC, \u05D5\u05D1\u05E1\u05D9\u05D5\u05DD \u05D4\u05E7\u05D9\u05E9\u05D5 \u05E1\u05D5\u05DC\u05DE\u05D9\u05EA. \u05DB\u05D3\u05D9 \u05DC\u05E6\u05D0\u05EA, \u05D4\u05E7\u05D9\u05E9\u05D5 \u05E1\u05D5\u05DC\u05DE\u05D9\u05EA \u05D1\u05DC\u05D9 \u05DC\u05D5\u05DE\u05E8 \u05DB\u05DC\u05D5\u05DD. \u05D0\u05E4\u05E9\u05E8 \u05D2\u05DD \u05DC\u05D1\u05E7\u05E9 \u05DE\u05DE\u05E0\u05D9 \u05DC\u05D3\u05D1\u05E8 \u05DB\u05DE\u05D5 \u05E8\u05D0\u05E9 \u05D9\u05E9\u05D9\u05D1\u05D4, \u05DE\u05E9\u05D2\u05D9\u05D7, \u05E2\u05D5\u05E7\u05E6\u05E0\u05D9 \u05D0\u05D5 \u05E4\u05E1\u05D9\u05DB\u05D5\u05DC\u05D5\u05D2.${skip ? " \u05DB\u05D3\u05D9 \u05DC\u05D3\u05DC\u05D2 \u05E2\u05DC \u05EA\u05E9\u05D5\u05D1\u05D4 \u05D0\u05E8\u05D5\u05DB\u05D4, \u05D4\u05E7\u05D9\u05E9\u05D5 \u05E2\u05DC \u05DE\u05E7\u05E9 \u05DB\u05DC\u05E9\u05D4\u05D5." : ""}`);
  }
  const n = turns[turns.length - 1];
  if (q["C" + n] !== void 0) {
    const key = "post:" + callId + ":" + n, p = await kvGet(env, key, null);
    const akey = "act:" + callId + ":" + n, acts = await kvGet(env, akey, null);
    let msg = acts ? "\u05D4\u05E4\u05E2\u05D5\u05DC\u05D4 \u05D1\u05D5\u05D8\u05DC\u05D4" : "\u05D4\u05D4\u05D5\u05D3\u05E2\u05D4 \u05DC\u05D0 \u05E4\u05D5\u05E8\u05E1\u05DE\u05D4";
    if (p && q["C" + n] === "1") {
      ctx.waitUntil((async () => {
        await postVoice(env, p.important ? [IMPORTANT, ALL] : [ALL], p.text);
        used = 0;
        await notify(env, p.important ? "important" : "regular").catch(() => {
        });
        await processFlags(env).catch(() => {
        });
      })().catch((e) => log(env, "\u05E9\u05D2\u05D9\u05D0\u05D4 \u05D1\u05E4\u05E8\u05E1\u05D5\u05DD: " + e.message)));
      await log(env, `\u05DE\u05E0\u05D4\u05DC ${phone} \u05E4\u05E8\u05E1\u05DD \u05D3\u05E8\u05DA \u05D4\u05E2\u05D5\u05D6\u05E8 \u05D4\u05D7\u05DB\u05DD \u05D4\u05D5\u05D3\u05E2\u05D4 ${p.important ? "\u05D7\u05E9\u05D5\u05D1\u05D4" : "\u05E8\u05D2\u05D9\u05DC\u05D4"}: ${p.text}`);
      msg = p.important ? "\u05D4\u05D4\u05D5\u05D3\u05E2\u05D4 \u05E4\u05D5\u05E8\u05E1\u05DE\u05D4 \u05DB\u05D4\u05D5\u05D3\u05E2\u05D4 \u05D7\u05E9\u05D5\u05D1\u05D4 \u05D5\u05E0\u05E9\u05DC\u05D7 \u05E6\u05D9\u05E0\u05EA\u05D5\u05E7 \u05DC\u05DB\u05DC \u05D4\u05D7\u05D1\u05E8\u05D9\u05DD" : "\u05D4\u05D4\u05D5\u05D3\u05E2\u05D4 \u05E4\u05D5\u05E8\u05E1\u05DE\u05D4 \u05D1\u05D4\u05D5\u05D3\u05E2\u05D5\u05EA \u05D4\u05E8\u05D2\u05D9\u05DC\u05D5\u05EA";
    }
    if (acts && q["C" + n] === "1" && await isAdminPhone(env, phone)) {
      const res2 = [];
      for (const a of acts) {
        used = 0;
        res2.push(await doAdmin(env, a, phone).catch((e) => {
          log(env, "\u05E9\u05D2\u05D9\u05D0\u05D4 \u05D1\u05E4\u05E2\u05D5\u05DC\u05EA \u05E0\u05D9\u05D4\u05D5\u05DC: " + e.message);
          return "\u05D4\u05D9\u05D9\u05EA\u05D4 \u05EA\u05E7\u05DC\u05D4 \u05D1\u05D1\u05D9\u05E6\u05D5\u05E2";
        }));
      }
      msg = res2.join(". ");
    }
    await env.KV.delete(key).catch(() => {
    });
    await env.KV.delete(akey).catch(() => {
    });
    return `id_list_message=${await speak(env, ctx, msg, acts ? { voice: V, budget: 6e3 } : { cache: true, voice: V })}&` + await ask(n + 1, moreShort);
  }
  if (q["K" + n] !== void 0) return await ask(n + 1, n === 1 ? more : moreShort);
  const path = q["R" + n];
  if (!path || path === "None" || path === "") return await bye();
  const history = chats.get(callId) || [];
  let answer, res = {};
  try {
    const audio = await ym(env, "DownloadFile", { path: "ivr2:" + path });
    if (audio.length < 3e3) return await bye();
    res = await answerWithCheck(env, { audio, phone, persona: P2, callId }, history);
    answer = String(res.answer || "").trim() || "\u05DC\u05D0 \u05D4\u05E6\u05DC\u05D7\u05EA\u05D9 \u05DC\u05D4\u05D1\u05D9\u05DF, \u05E0\u05E1\u05D5 \u05DC\u05E9\u05D0\u05D5\u05DC \u05E9\u05D5\u05D1";
    history.push([res.transcript, res.answer]);
    chats.set(callId, history);
    if (chats.size > 200) chats.delete(chats.keys().next().value);
  } catch (e) {
    answer = "\u05DE\u05E6\u05D8\u05E2\u05E8, \u05D4\u05D9\u05D9\u05EA\u05D4 \u05EA\u05E7\u05DC\u05D4, \u05E0\u05E1\u05D5 \u05DC\u05E9\u05D0\u05D5\u05DC \u05E9\u05D5\u05D1";
    res = { failed: true };
    aiTrace.push("chat: " + e.message);
  }
  if (res.persona && PERSONAS[res.persona] && res.persona !== P2) {
    P2 = res.persona;
    V = PERSONAS[P2].voice;
    EL = PERSONAS[P2].el;
    if (q.ApiCallId) await env.KV.put("persona:" + callId, P2, { expirationTtl: 3600 });
  }
  let acted = { after: "", confirm: [], replace: "" };
  if (!res.failed && (res.do || []).length) acted = await applyActions(env, res.do, { phone, callId, isAdmin: res.isAdmin });
  const base = acted.replace || answer;
  const full = acted.confirm.length ? "" : acted.after ? base + " " + acted.after : base;
  const rate = phone ? +await env.KV.get("speed:" + phone) || 1 : 1;
  const fixed = res.failed || !res.answer;
  const said = !full ? "" : await speak(env, ctx, full, fixed ? { cache: true, voice: V } : { voice: V, el: EL, rate, budget: Math.max(4e3, Math.min(acted.after ? 14e3 : 1e4, 22e3 - (Date.now() - t0))) });
  let plays = "";
  const reqs = (Array.isArray(res.play) ? res.play : []).map(String).slice(0, 3);
  const ids = reqs.filter((x) => !/^(join|pm)/.test(x)).map((x) => x.replace(/\D/g, "")).filter(Boolean).slice(0, 2);
  if (ids.length) {
    const a = await kvGet(env, "archive", {});
    plays = ids.filter((id) => a[id + ".wav"]).map((id) => `.f-${ALL}/${id}`).join("");
  }
  const pms = reqs.filter((x) => /^pm/.test(x)).map((x) => x.replace(/\D/g, "")).filter(Boolean).slice(0, 3);
  if (pms.length && phone) {
    const have = await personalNew(env, phone).catch(() => []);
    const ok = pms.map((id) => have.find((m) => m.id === id.padStart(3, "0"))).filter(Boolean);
    if (ok.length) {
      plays += ok.map((m) => `.f-${PM(phone)}/${m.id}`).join("");
      const l = await kvGet(env, "pmplayed", []);
      for (const m of ok) l.push({ path: `${PM(phone)}/${m.file}`, t: Date.now() });
      await env.KV.put("pmplayed", JSON.stringify(l));
    }
  }
  if (res.isAdmin) plays += reqs.filter((x) => /^join/.test(x)).map((x) => x.replace(/\D/g, "")).filter(Boolean).map((id) => `.f-/JoinRequests/${id.padStart(3, "0")}`).join("");
  if (!res.failed) ctx.waitUntil(Promise.all([
    convSave(env, { c: callId, p: phone, d: nowIL(), q: res.transcript || "", a: full || answer, qf: path, af: said || "" }),
    memSave(env, phone, callId, res.transcript || "", full || answer)
  ]).catch(() => {
  }));
  const post = typeof res.post === "string" ? res.post.trim() : "";
  if (post || acted.confirm.length) {
    let confirm;
    if (acted.confirm.length) {
      await env.KV.put("act:" + callId + ":" + n, JSON.stringify(acted.confirm), { expirationTtl: 1800 });
      confirm = `\u05DC\u05D0\u05D9\u05E9\u05D5\u05E8: ${acted.confirm.map((a) => describeAct(a, env)).join(". ")}. \u05DC\u05D1\u05D9\u05E6\u05D5\u05E2 \u05D4\u05E7\u05D9\u05E9\u05D5 1. \u05DC\u05D1\u05D9\u05D8\u05D5\u05DC \u05D4\u05E7\u05D9\u05E9\u05D5 2`;
    } else {
      await env.KV.put("post:" + callId + ":" + n, JSON.stringify({ text: post, important: !!res.important }), { expirationTtl: 1800 });
      confirm = `\u05D4\u05E0\u05D5\u05E1\u05D7 \u05E9\u05D9\u05E2\u05DC\u05D4 ${res.important ? "\u05DB\u05D4\u05D5\u05D3\u05E2\u05D4 \u05D7\u05E9\u05D5\u05D1\u05D4" : "\u05DB\u05D4\u05D5\u05D3\u05E2\u05D4 \u05E8\u05D2\u05D9\u05DC\u05D4"}: ${post}. \u05DC\u05E4\u05E8\u05E1\u05D5\u05DD \u05D4\u05E7\u05D9\u05E9\u05D5 1. \u05DC\u05D1\u05D9\u05D8\u05D5\u05DC \u05D4\u05E7\u05D9\u05E9\u05D5 2`;
    }
    const pre = full ? `id_list_message=${said}${plays}&` : "";
    return `${pre}read=${await speak(env, ctx, confirm, { budget: 7e3, voice: V })}=C${n},no,1,1,10,No,no,no,,1.2`;
  }
  if (skip) return `read=${said}${plays}=K${n},no,1,1,1,No,no,no,,,1,Ok,none`;
  return `id_list_message=${said}${plays}&` + await ask(n + 1, n === 1 ? more : moreShort);
}
__name(chat, "chat");
async function convosMenu(env, u, ctx) {
  const q = u.searchParams, nm = names(env);
  const log0 = await kvGet(env, "convlog", []);
  const by = /* @__PURE__ */ new Map();
  for (const e of log0) {
    if (!by.has(e.c)) by.set(e.c, []);
    by.get(e.c).push(e);
  }
  const sessions = [...by.values()].sort((a, b) => a[0].d < b[0].d ? 1 : -1).slice(0, 40);
  if (!sessions.length) return `id_list_message=${await sayC(env, ctx, "\u05E2\u05D3\u05D9\u05D9\u05DF \u05D0\u05D9\u05DF \u05E9\u05D9\u05D7\u05D5\u05EA \u05E9\u05DE\u05D5\u05E8\u05D5\u05EA \u05E2\u05DD \u05D4\u05E2\u05D5\u05D6\u05E8")}&go_to_folder=/7`;
  let i = 0, key = null, cnt = 0;
  for (const [k, v] of q.entries()) {
    const m = /^V(\d+)_(\d+)$/.exec(k);
    if (m && +m[2] > cnt) {
      cnt = +m[2];
      key = [+m[1], v];
    }
  }
  const vn = /* @__PURE__ */ __name((x) => `V${x}_${cnt + 1}`, "vn");
  if (key) {
    const [idx, d] = key;
    if (d === "0") return "go_to_folder=/7";
    if (d === "1") {
      const s2 = sessions[idx] || sessions[0];
      const items = s2.flatMap((e) => [e.qf ? "f-/" + String(e.qf).replace(/^\//, "").replace(/\.wav$/, "") : "", e.af && String(e.af).startsWith("f-") ? e.af : "t-" + clean(e.a).slice(0, 300)]).filter(Boolean);
      const menu = await sayC(env, ctx, "\u05DC\u05E9\u05DE\u05D9\u05E2\u05D4 \u05D7\u05D5\u05D6\u05E8\u05EA \u05D4\u05E7\u05D9\u05E9\u05D5 1. \u05DC\u05E9\u05D9\u05D7\u05D4 \u05D4\u05D1\u05D0\u05D4 2. \u05DC\u05E9\u05D9\u05D7\u05D4 \u05D4\u05E7\u05D5\u05D3\u05DE\u05EA 3. \u05DC\u05D9\u05E6\u05D9\u05D0\u05D4 \u05DB\u05D5\u05DB\u05D1\u05D9\u05EA");
      return `read=${items.join(".")}.${menu}=${vn(idx)},no,1,1,7,No,no,no,,1.2.3.0`;
    }
    i = d === "2" ? Math.min(sessions.length - 1, idx + 1) : d === "3" ? Math.max(0, idx - 1) : idx;
  }
  const s = sessions[i], d0 = s[0].d, who = nm[s[0].p] || (s[0].p ? "\u05DE\u05E1\u05E4\u05E8 " + digitsSay(s[0].p) : "\u05DE\u05E1\u05E4\u05E8 \u05DC\u05D0 \u05DE\u05D6\u05D5\u05D4\u05D4");
  const day = d0.slice(0, 10) === nowIL().slice(0, 10) ? "\u05D4\u05D9\u05D5\u05DD" : `\u05D1${+d0.slice(8, 10)} \u05DC${+d0.slice(5, 7)}`;
  const head = i === 0 && !key ? `\u05D9\u05E9 ${sessions.length} \u05E9\u05D9\u05D7\u05D5\u05EA \u05E9\u05DE\u05D5\u05E8\u05D5\u05EA, \u05DE\u05D4\u05D7\u05D3\u05E9\u05D4 \u05DC\u05D9\u05E9\u05E0\u05D4. ` : "";
  const text = `${head}\u05E9\u05D9\u05D7\u05D4 ${i + 1}: ${who}, ${day} \u05D1\u05E9\u05E2\u05D4 ${+d0.slice(11, 13)} \u05D5 ${+d0.slice(14, 16)} \u05D3\u05E7\u05D5\u05EA, ${s.length === 1 ? "\u05E9\u05D0\u05DC\u05D4 \u05D0\u05D7\u05EA" : s.length + " \u05E9\u05D0\u05DC\u05D5\u05EA"}. \u05DC\u05E9\u05DE\u05D9\u05E2\u05D4 \u05D4\u05E7\u05D9\u05E9\u05D5 1. \u05DC\u05E9\u05D9\u05D7\u05D4 \u05D4\u05D1\u05D0\u05D4 2. \u05DC\u05E9\u05D9\u05D7\u05D4 \u05D4\u05E7\u05D5\u05D3\u05DE\u05EA 3. \u05DC\u05D9\u05E6\u05D9\u05D0\u05D4 0`;
  return `read=${await speak(env, ctx, text, { budget: 5e3 })}=${vn(i)},no,1,1,7,No,no,no,,1.2.3.0`;
}
__name(convosMenu, "convosMenu");
var ilAt = /* @__PURE__ */ __name((ms) => new Date(ms).toLocaleString("sv-SE", { timeZone: "Asia/Jerusalem" }), "ilAt");
var DEFAULT_LOC = { name: "\u05D9\u05E8\u05D5\u05E9\u05DC\u05D9\u05DD", lat: 31.769, lon: 35.216 };
var inIsrael = /* @__PURE__ */ __name((lat, lon) => lat > 29 && lat < 33.6 && lon > 34 && lon < 36, "inIsrael");
async function callerLoc(env, phone) {
  return phone && await kvGet(env, "loc:" + phone, null) || DEFAULT_LOC;
}
__name(callerLoc, "callerLoc");
async function geocode(place, lat, lon) {
  try {
    const r = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(place)}&count=1&language=he&countryCode=IL`, { signal: AbortSignal.timeout(4e3) });
    const g = ((await r.json()).results || [])[0];
    if (g) return { name: place, lat: g.latitude, lon: g.longitude };
  } catch {
  }
  if (typeof lat === "number" && typeof lon === "number" && inIsrael(lat, lon)) return { name: place, lat, lon };
  return null;
}
__name(geocode, "geocode");
var WMO = { 0: "\u05D1\u05D4\u05D9\u05E8", 1: "\u05D1\u05D4\u05D9\u05E8 \u05D1\u05E8\u05D5\u05D1\u05D5", 2: "\u05DE\u05E2\u05D5\u05E0\u05DF \u05D7\u05DC\u05E7\u05D9\u05EA", 3: "\u05DE\u05E2\u05D5\u05E0\u05DF", 45: "\u05E2\u05E8\u05E4\u05DC", 48: "\u05E2\u05E8\u05E4\u05DC", 51: "\u05D8\u05E4\u05D8\u05D5\u05E3 \u05E7\u05DC", 53: "\u05D8\u05E4\u05D8\u05D5\u05E3", 55: "\u05D8\u05E4\u05D8\u05D5\u05E3 \u05D7\u05D6\u05E7", 61: "\u05D2\u05E9\u05DD \u05E7\u05DC", 63: "\u05D2\u05E9\u05DD", 65: "\u05D2\u05E9\u05DD \u05D7\u05D6\u05E7", 66: "\u05D2\u05E9\u05DD \u05E7\u05E8", 67: "\u05D2\u05E9\u05DD \u05E7\u05E8", 71: "\u05E9\u05DC\u05D2 \u05E7\u05DC", 73: "\u05E9\u05DC\u05D2", 75: "\u05E9\u05DC\u05D2 \u05DB\u05D1\u05D3", 80: "\u05DE\u05DE\u05D8\u05E8\u05D9\u05DD \u05E7\u05DC\u05D9\u05DD", 81: "\u05DE\u05DE\u05D8\u05E8\u05D9\u05DD", 82: "\u05DE\u05DE\u05D8\u05E8\u05D9\u05DD \u05D7\u05D6\u05E7\u05D9\u05DD", 95: "\u05E1\u05D5\u05E4\u05EA \u05E8\u05E2\u05DE\u05D9\u05DD", 96: "\u05E1\u05D5\u05E4\u05EA \u05E8\u05E2\u05DE\u05D9\u05DD \u05E2\u05DD \u05D1\u05E8\u05D3", 99: "\u05E1\u05D5\u05E4\u05EA \u05E8\u05E2\u05DE\u05D9\u05DD \u05E2\u05DD \u05D1\u05E8\u05D3" };
var DAYS = ["\u05E8\u05D0\u05E9\u05D5\u05DF", "\u05E9\u05E0\u05D9", "\u05E9\u05DC\u05D9\u05E9\u05D9", "\u05E8\u05D1\u05D9\u05E2\u05D9", "\u05D7\u05DE\u05D9\u05E9\u05D9", "\u05E9\u05D9\u05E9\u05D9", "\u05E9\u05D1\u05EA"];
var hhmm = /* @__PURE__ */ __name((s) => (/T(\d\d:\d\d)/.exec(s || "") || [])[1] || "", "hhmm");
async function worldText(env, loc) {
  const now = nowIL(), key = `world:${loc.lat.toFixed(2)},${loc.lon.toFixed(2)}:${now.slice(0, 13)}`;
  const c = await env.KV.get(key);
  if (c) return c;
  const day = now.slice(0, 10), tmr = new Date(Date.parse(day + "T12:00:00Z") + 864e5).toISOString().slice(0, 10);
  const end = new Date(Date.parse(day + "T12:00:00Z") + 12 * 864e5).toISOString().slice(0, 10);
  const geo = `latitude=${loc.lat}&longitude=${loc.lon}&tzid=Asia/Jerusalem`;
  const b = loc.name === "\u05D9\u05E8\u05D5\u05E9\u05DC\u05D9\u05DD" ? 40 : 20;
  const get = /* @__PURE__ */ __name((u) => fetch(u, { signal: AbortSignal.timeout(5e3) }).then((r) => r.json()).catch(() => null), "get");
  const [heb, zm, cal, wx] = await Promise.all([
    get(`https://www.hebcal.com/converter?cfg=json&date=${day}&g2h=1&strict=1`),
    get(`https://www.hebcal.com/zmanim?cfg=json&${geo}&start=${day}&end=${tmr}`),
    get(`https://www.hebcal.com/hebcal?v=1&cfg=json&maj=on&min=on&mod=on&nx=on&ss=on&mf=on&i=on&c=on&s=on&M=on&b=${b}&${geo}&start=${day}&end=${end}`),
    get(`https://api.open-meteo.com/v1/forecast?latitude=${loc.lat}&longitude=${loc.lon}&current=temperature_2m,weather_code,wind_speed_10m&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum,wind_speed_10m_max&timezone=Asia/Jerusalem&forecast_days=4`)
  ]);
  const wd = /* @__PURE__ */ __name((d) => DAYS[(/* @__PURE__ */ new Date(d + "T12:00:00Z")).getUTCDay()], "wd");
  let t = `\u05DE\u05D9\u05E7\u05D5\u05DD \u05DC\u05D6\u05DE\u05E0\u05D9\u05DD \u05D5\u05DC\u05DE\u05D6\u05D2 \u05D4\u05D0\u05D5\u05D5\u05D9\u05E8: ${loc.name}.`;
  t += ` \u05D4\u05D9\u05D5\u05DD \u05D9\u05D5\u05DD ${wd(day)}, ${day.split("-").reverse().join("/")}${heb && heb.hebrew ? ", " + heb.hebrew : ""}.`;
  if (zm && zm.times) {
    const Z = [["alotHaShachar", "\u05E2\u05DC\u05D5\u05EA \u05D4\u05E9\u05D7\u05E8"], ["misheyakir", "\u05DE\u05E9\u05D9\u05DB\u05D9\u05E8"], ["sunrise", "\u05D4\u05E0\u05E5 \u05D4\u05D7\u05DE\u05D4"], ["sofZmanShmaMGA", "\u05E1\u05D5\u05E3 \u05D6\u05DE\u05DF \u05E7\u05E8\u05D9\u05D0\u05EA \u05E9\u05DE\u05E2 \u05DE\u05D2\u05DF \u05D0\u05D1\u05E8\u05D4\u05DD"], ["sofZmanShma", '\u05E1\u05D5\u05E3 \u05D6\u05DE\u05DF \u05E7\u05E8\u05D9\u05D0\u05EA \u05E9\u05DE\u05E2 \u05D4\u05D2\u05E8"\u05D0'], ["sofZmanTfilla", '\u05E1\u05D5\u05E3 \u05D6\u05DE\u05DF \u05EA\u05E4\u05D9\u05DC\u05D4 \u05D4\u05D2\u05E8"\u05D0'], ["chatzot", "\u05D7\u05E6\u05D5\u05EA \u05D4\u05D9\u05D5\u05DD"], ["minchaGedola", "\u05DE\u05E0\u05D7\u05D4 \u05D2\u05D3\u05D5\u05DC\u05D4"], ["plagHaMincha", "\u05E4\u05DC\u05D2 \u05D4\u05DE\u05E0\u05D7\u05D4"], ["sunset", "\u05E9\u05E7\u05D9\u05E2\u05D4"], ["tzeit7083deg", "\u05E6\u05D0\u05EA \u05D4\u05DB\u05D5\u05DB\u05D1\u05D9\u05DD"]];
    for (const [d, label] of [[day, "\u05D4\u05D9\u05D5\u05DD"], [tmr, "\u05DE\u05D7\u05E8"]])
      t += ` \u05D6\u05DE\u05E0\u05D9\u05DD ${label} \u05D1${loc.name}: ` + Z.map(([k, n]) => zm.times[k] && zm.times[k][d] ? `${n} ${hhmm(zm.times[k][d])}` : "").filter(Boolean).join(", ") + ".";
  }
  if (cal && cal.items) {
    const ev = cal.items.filter((i) => ["holiday", "candles", "havdalah", "parashat", "roshchodesh", "fast", "omer"].includes(i.category)).slice(0, 14).map((i) => `${i.date.slice(0, 10).split("-").reverse().join("/")} (\u05D9\u05D5\u05DD ${wd(i.date.slice(0, 10))}): ${i.hebrew || i.title}${/T\d/.test(i.date) ? " " + hhmm(i.date) : ""}`);
    if (ev.length) t += ` \u05DC\u05D5\u05D7 \u05E7\u05E8\u05D5\u05D1 (\u05D4\u05D3\u05DC\u05E7\u05EA \u05E0\u05E8\u05D5\u05EA \u05DC\u05E4\u05D9 ${b} \u05D3\u05E7\u05D5\u05EA \u05DC\u05E4\u05E0\u05D9 \u05D4\u05E9\u05E7\u05D9\u05E2\u05D4): ${ev.join("; ")}.`;
  }
  if (wx && wx.daily) {
    const cur = wx.current ? `\u05E2\u05DB\u05E9\u05D9\u05D5 ${Math.round(wx.current.temperature_2m)} \u05DE\u05E2\u05DC\u05D5\u05EA, ${WMO[wx.current.weather_code] || ""}. ` : "";
    t += ` \u05DE\u05D6\u05D2 \u05D0\u05D5\u05D5\u05D9\u05E8 \u05D1${loc.name} (\u05EA\u05D7\u05D6\u05D9\u05EA \u05D0\u05DE\u05D9\u05EA\u05D9\u05EA): ${cur}` + wx.daily.time.map((d, i) => `\u05D9\u05D5\u05DD ${wd(d)}: ${WMO[wx.daily.weather_code[i]] || ""}, ${Math.round(wx.daily.temperature_2m_min[i])} \u05E2\u05D3 ${Math.round(wx.daily.temperature_2m_max[i])} \u05DE\u05E2\u05DC\u05D5\u05EA, \u05E1\u05D9\u05DB\u05D5\u05D9 \u05DC\u05D2\u05E9\u05DD ${wx.daily.precipitation_probability_max[i] ?? 0} \u05D0\u05D7\u05D5\u05D6${wx.daily.precipitation_sum[i] > 0.2 ? ` (${wx.daily.precipitation_sum[i]} \u05DE"\u05DE)` : ""}, \u05E8\u05D5\u05D7 \u05E2\u05D3 ${Math.round(wx.daily.wind_speed_10m_max[i])} \u05E7\u05DE"\u05E9`).join("; ") + ".";
  }
  await env.KV.put(key, t, { expirationTtl: 3600 });
  return t;
}
__name(worldText, "worldText");
async function memText(env, phone, callId) {
  if (!phone) return "";
  const m = await kvGet(env, "mem:" + phone, null);
  if (!m) return "";
  let t = "";
  if ((m.notes || []).length) t += "\u05DE\u05D4 \u05E9\u05D0\u05EA\u05D4 \u05D6\u05D5\u05DB\u05E8 \u05E2\u05DC\u05D9\u05D5 \u05DE\u05E9\u05D9\u05D7\u05D5\u05EA \u05E7\u05D5\u05D3\u05DE\u05D5\u05EA (\u05EA\u05E9\u05EA\u05DE\u05E9 \u05D1\u05D6\u05D4 \u05D1\u05D8\u05D1\u05E2\u05D9\u05D5\u05EA \u05DB\u05E9\u05D6\u05D4 \u05DE\u05EA\u05D0\u05D9\u05DD, \u05D1\u05DC\u05D9 \u05DC\u05D4\u05D2\u05D6\u05D9\u05DD): " + m.notes.map((n) => `[${n.d.slice(0, 10)}] ${n.t}`).join("; ") + ". ";
  const last = (m.last || []).filter((x) => x.c !== callId).slice(-6);
  if (last.length) t += "\u05E7\u05D8\u05E2\u05D9\u05DD \u05DE\u05D4\u05E9\u05D9\u05D7\u05D5\u05EA \u05D4\u05D0\u05D7\u05E8\u05D5\u05E0\u05D5\u05EA \u05E9\u05DC\u05D5 \u05D0\u05D9\u05EA\u05DA (\u05DE\u05D4\u05D9\u05E9\u05E0\u05D4 \u05DC\u05D7\u05D3\u05E9\u05D4): " + last.map((x) => `[${x.d.slice(0, 16)}] \u05D4\u05D5\u05D0: ${x.q.slice(0, 160)} | \u05D0\u05EA\u05D4: ${x.a.slice(0, 160)}`).join(" || ") + ".";
  return t;
}
__name(memText, "memText");
async function memSave(env, phone, callId, q, a, note) {
  if (!phone || !env.KV) return;
  const m = await kvGet(env, "mem:" + phone, { notes: [], last: [] });
  if (q || a) {
    m.last.push({ c: callId, d: nowIL(), q: q || "", a: a || "" });
    m.last = m.last.slice(-14);
  }
  if (note) {
    m.notes.push({ d: nowIL(), t: String(note).slice(0, 200) });
    m.notes = m.notes.slice(-20);
  }
  await env.KV.put("mem:" + phone, JSON.stringify(m), { expirationTtl: 180 * 86400 });
}
__name(memSave, "memSave");
async function convSave(env, e) {
  const l = await kvGet(env, "convlog", []);
  l.push(e);
  await env.KV.put("convlog", JSON.stringify(l.slice(-500)));
}
__name(convSave, "convSave");
var stripHtml = /* @__PURE__ */ __name((s) => String(s || "").replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&[a-z]+;/g, "").replace(/\s+/g, " ").trim(), "stripHtml");
async function sefaria(ref) {
  const r = await fetch(`https://www.sefaria.org/api/v3/texts/${encodeURIComponent(ref)}?version=hebrew&return_format=text_only`, { signal: AbortSignal.timeout(5e3) });
  if (!r.ok) return null;
  const j = await r.json(), v = (j.versions || [])[0];
  if (!v || !v.text) return null;
  const flat = /* @__PURE__ */ __name((x) => Array.isArray(x) ? x.flatMap(flat) : [stripHtml(x)], "flat");
  const segs = flat(v.text).filter(Boolean).map((x) => x.replace(/^[^.:]{0,60}\.\s*ובו [^:.]{1,20}(:|\.)\s*/, "")).filter(Boolean);
  const he = String(j.heRef || ref).replace(/:/g, ", ");
  return segs.length ? { he, segs } : null;
}
__name(sefaria, "sefaria");
function cutText(t, max = 450) {
  if (t.length <= max) return t;
  const c = t.slice(0, max), i = Math.max(c.lastIndexOf(". "), c.lastIndexOf(": "), c.lastIndexOf(", "));
  return (i > max * 0.5 ? c.slice(0, i + 1) : c.slice(0, c.lastIndexOf(" "))) + " \u05D5\u05DB\u05D5'";
}
__name(cutText, "cutText");
function to8k(pcm) {
  const x = new Int16Array(pcm.buffer, pcm.byteOffset, pcm.byteLength >> 1), n = Math.floor(x.length / 3), y = new Int16Array(n);
  for (let i = 0; i < n; i++) y[i] = (x[3 * i] + x[3 * i + 1] + x[3 * i + 2]) / 3;
  return y;
}
__name(to8k, "to8k");
function stretch(x, rate) {
  const N = 320, H = 160, tol = 64, Ha = Math.round(H * rate);
  const out = new Float32Array(Math.ceil(x.length / rate) + 2 * N), ws = new Float32Array(out.length);
  const w = new Float32Array(N);
  for (let i = 0; i < N; i++) w[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / N);
  let prev = 0, k = 0;
  for (; ; k++) {
    const nominal = k * Ha;
    if (nominal + N + tol >= x.length) break;
    let best = nominal;
    if (k > 0) {
      const ref = prev + H;
      let bc = -Infinity;
      for (let d = -tol; d <= tol; d += 3) {
        const p = nominal + d;
        if (p < 0 || p + N > x.length) continue;
        let c = 0;
        for (let i = 0; i < N; i += 6) c += x[p + i] * x[ref + i];
        if (c > bc) {
          bc = c;
          best = p;
        }
      }
    }
    const o = k * H;
    for (let i = 0; i < N; i++) {
      out[o + i] += x[best + i] * w[i];
      ws[o + i] += w[i];
    }
    prev = best;
  }
  const len = k * H + N, y = new Int16Array(len);
  for (let i = 0; i < len; i++) y[i] = Math.max(-32768, Math.min(32767, ws[i] > 1e-3 ? out[i] / ws[i] : 0));
  return y;
}
__name(stretch, "stretch");
function speedPcm(pcm24, rate) {
  const y = stretch(to8k(pcm24), rate);
  return { pcm: new Uint8Array(y.buffer), sr: 8e3 };
}
__name(speedPcm, "speedPcm");
function wavSamples(bytes) {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let o = 12, sr = 8e3, bits = 16, fmt = 1;
  while (o + 8 <= bytes.length) {
    const id = String.fromCharCode(...bytes.subarray(o, o + 4)), sz = v.getUint32(o + 4, true);
    if (id === "fmt ") {
      fmt = v.getUint16(o + 8, true);
      sr = v.getUint32(o + 12, true);
      bits = v.getUint16(o + 22, true);
    }
    if (id === "data") {
      if (fmt !== 1 || bits !== 16) return null;
      const b = bytes.slice(o + 8, o + 8 + sz);
      return { s: new Int16Array(b.buffer, 0, b.length >> 1), sr };
    }
    o += 8 + sz + (sz & 1);
  }
  return null;
}
__name(wavSamples, "wavSamples");
var DEFAULT_EVENT = { id: "shoeva", title: "\u05E9\u05DE\u05D7\u05EA \u05D1\u05D9\u05EA \u05D4\u05E9\u05D5\u05D0\u05D1\u05D4", desc: "\u05D1\u05D9\u05D5\u05DD \u05E8\u05D0\u05E9\u05D5\u05DF \u05D1\u05D1\u05D9\u05EA \u05E9\u05DC \u05E1\u05D8\u05E4\u05E0\u05E1\u05E7\u05D9", file: "ivr2:/9/\u05E8\u05E9\u05D9\u05DE\u05EA_\u05D4\u05DE\u05D2\u05D9\u05E2\u05D9\u05DD.txt" };
async function curEvent(env) {
  return await kvGet(env, "event", null) || DEFAULT_EVENT;
}
__name(curEvent, "curEvent");
var event9Menu = /* @__PURE__ */ __name((ev) => `${ev.title}${ev.desc ? ", " + ev.desc : ""}. \u05DC\u05D0\u05D9\u05E9\u05D5\u05E8 \u05D4\u05D2\u05E2\u05D4 \u05D0\u05D5 \u05DC\u05D1\u05D9\u05D8\u05D5\u05DC \u05D4\u05D2\u05E2\u05D4 \u05D4\u05E7\u05D9\u05E9\u05D5 1. \u05DC\u05E9\u05DE\u05D9\u05E2\u05EA \u05DE\u05E1\u05E4\u05E8 \u05D4\u05E0\u05E8\u05E9\u05DE\u05D9\u05DD \u05D5\u05DE\u05D9 \u05DE\u05D2\u05D9\u05E2 \u05D4\u05E7\u05D9\u05E9\u05D5 2. \u05DC\u05D7\u05D6\u05E8\u05D4 \u05DC\u05EA\u05E4\u05E8\u05D9\u05D8 \u05D4\u05E8\u05D0\u05E9\u05D9 \u05D4\u05E7\u05D9\u05E9\u05D5 \u05DB\u05D5\u05DB\u05D1\u05D9\u05EA.`, "event9Menu");
async function peopleList(env) {
  return await kvGet(env, "people", []);
}
__name(peopleList, "peopleList");
var spoken = /* @__PURE__ */ __name((p) => p.s || p.n, "spoken");
var DIG = ["\u05D0\u05E4\u05E1", "\u05D0\u05D7\u05EA", "\u05E9\u05EA\u05D9\u05D9\u05DD", "\u05E9\u05DC\u05D5\u05E9", "\u05D0\u05E8\u05D1\u05E2", "\u05D7\u05DE\u05E9", "\u05E9\u05E9", "\u05E9\u05D1\u05E2", "\u05E9\u05DE\u05D5\u05E0\u05D4", "\u05EA\u05E9\u05E2"];
var spell = /* @__PURE__ */ __name((c) => [...c].map((x) => DIG[+x]).join(" "), "spell");
function peopleTexts(people) {
  const byCode = [...people].sort((a, b) => a.c.localeCompare(b.c));
  const lst = "\u05E8\u05E9\u05D9\u05DE\u05EA \u05D7\u05D1\u05E8\u05D9 \u05D4\u05E7\u05D1\u05D5\u05E6\u05D4. " + byCode.map((p) => spoken(p) + (p.a ? ", \u05DE\u05E0\u05D4\u05DC" : "")).join(". ") + `. \u05E1\u05DA \u05D4\u05DB\u05D5\u05DC ${people.length} \u05D7\u05D1\u05E8\u05D9\u05DD.`;
  const menu = "\u05D4\u05D5\u05D3\u05E2\u05D4 \u05D0\u05D9\u05E9\u05D9\u05EA \u05DC\u05D7\u05D1\u05E8. \u05D1\u05D7\u05E8\u05D5 \u05D0\u05EA \u05DE\u05D9 \u05E9\u05D0\u05DC\u05D9\u05D5 \u05EA\u05E8\u05E6\u05D5 \u05DC\u05E9\u05DC\u05D5\u05D7, \u05D1\u05E9\u05EA\u05D9 \u05E1\u05E4\u05E8\u05D5\u05EA. " + byCode.map((p) => `\u05DC${spoken(p)} \u05D4\u05E7\u05D9\u05E9\u05D5 ${spell(p.c)}.`).join(" ") + " \u05DC\u05D4\u05E7\u05E9\u05EA \u05DE\u05E1\u05E4\u05E8 \u05D8\u05DC\u05E4\u05D5\u05DF \u05D0\u05D7\u05E8 \u05D4\u05E7\u05D9\u05E9\u05D5 \u05D0\u05E4\u05E1 \u05D0\u05E4\u05E1.";
  return { lst, menu };
}
__name(peopleTexts, "peopleTexts");
function peopleRegenSteps(people, changed = []) {
  const { lst, menu } = peopleTexts(people), steps = [
    { k: "tts", path: "/0/2", name: "M1000", text: menu },
    { k: "tts", path: "/0/4", name: "M1000", text: lst + " \u05DC\u05E9\u05DE\u05D9\u05E2\u05D4 \u05D7\u05D5\u05D6\u05E8\u05EA \u05D4\u05E7\u05D9\u05E9\u05D5 1. \u05DC\u05D7\u05D6\u05E8\u05D4 \u05DC\u05EA\u05E4\u05E8\u05D9\u05D8 \u05D4\u05E8\u05D0\u05E9\u05D9 \u05D4\u05E7\u05D9\u05E9\u05D5 \u05DB\u05D5\u05DB\u05D1\u05D9\u05EA." },
    { k: "tts", path: "/0/4/1", name: "M1000", text: lst + " \u05DC\u05D7\u05D6\u05E8\u05D4 \u05DC\u05EA\u05E4\u05E8\u05D9\u05D8 \u05D4\u05E8\u05D0\u05E9\u05D9 \u05D4\u05E7\u05D9\u05E9\u05D5 \u05DB\u05D5\u05DB\u05D1\u05D9\u05EA." },
    { k: "tts", path: "/5/3", name: "000", text: lst }
  ];
  for (const p of changed) steps.push(
    { k: "ini", path: `/0/2/${p.c}`, text: personalIni(p) },
    { k: "tts", path: `/0/2/${p.c}`, name: "M1000", text: `\u05D4\u05D5\u05D3\u05E2\u05D4 \u05D0\u05D9\u05E9\u05D9\u05EA \u05DC${spoken(p)}. \u05D4\u05E7\u05DC\u05D9\u05D8\u05D5 \u05D0\u05EA \u05D4\u05D4\u05D5\u05D3\u05E2\u05D4 \u05D0\u05D7\u05E8\u05D9 \u05D4\u05E6\u05DC\u05D9\u05DC, \u05D5\u05D1\u05E1\u05D9\u05D5\u05DD \u05D4\u05E7\u05D9\u05E9\u05D5 \u05E1\u05D5\u05DC\u05DE\u05D9\u05EA.` },
    { k: "tts", path: "/EnterIDRecord", name: `phone-${p.p}-Name`, text: spoken(p) }
  );
  return steps;
}
__name(peopleRegenSteps, "peopleRegenSteps");
var personalIni = /* @__PURE__ */ __name((p) => `type=record
title=\u05D4\u05D5\u05D3\u05E2\u05D4 \u05D0\u05D9\u05E9\u05D9\u05EA \u05DC${p.n}
folder_move=/personalMessages/Phone/${p.p}
;\u05DC\u05E9\u05DE\u05D9\u05E2\u05EA \u05D4\u05E7\u05DC\u05D8\u05D4 1, \u05DC\u05D0\u05D9\u05E9\u05D5\u05E8 \u05D5\u05E9\u05DC\u05D9\u05D7\u05EA \u05E6\u05E0\u05EA\u05D5\u05E7 2, \u05DC\u05D4\u05E7\u05DC\u05D8\u05D4 \u05DE\u05D7\u05D3\u05E9 3, \u05DC\u05D4\u05DE\u05E9\u05DA \u05D4\u05E7\u05DC\u05D8\u05D4 4, \u05DC\u05D0\u05D9\u05E9\u05D5\u05E8 \u05D4\u05E7\u05DC\u05D8\u05D4 \u05DC\u05DC\u05D0 \u05E6\u05E0\u05EA\u05D5\u05E7 5, \u05DC\u05D9\u05E6\u05D9\u05D0\u05D4 6
menu_record_options_2=record_ok_end_run_tzintuk_private
menu_record_options_3=record_again
menu_record_options_4=continue_recording
menu_record_options_5=record_ok
menu_record_options_6=record_cancel
menu_record_options_7=noop
menu_record_options_8=noop
say_record_number=no
say_record_menu=no
record_ok_end_run_tzintuk_private_list=members
record_no_save_if_time_little=2
record_cancel_goto=/0
record_end_goto=/0
`, "personalIni");
async function saveNames(env, people) {
  await env.KV.put("people", JSON.stringify(people));
  const over = {};
  for (const p of people) over[p.p] = p.n;
  await env.KV.put("names_over", JSON.stringify(over));
  NAMES_CACHE = { ...NAMES_CACHE, ...over };
}
__name(saveNames, "saveNames");
async function ensureDir(env, path, keepIni = true) {
  const d = await ym(env, "GetIVR2Dir", { path: "ivr2:" + path }).catch(() => ({}));
  if (d.responseStatus === "OK") return;
  await ym(env, "UpdateExtension", { path: "ivr2:" + path });
  if (!keepIni) await ym(env, "FileAction", { action: "delete", what: `ivr2:${path}/ext.ini` }).catch(() => {
  });
}
__name(ensureDir, "ensureDir");
async function bgAdd(env, steps) {
  const q = await kvGet(env, "bgjobs", []);
  q.push(...steps);
  await env.KV.put("bgjobs", JSON.stringify(q));
}
__name(bgAdd, "bgAdd");
async function ttsLong(env, text, voice = "Charon", budget = 25e3) {
  const parts = text.length > 240 ? chunkText(text) : [text], out = [];
  for (const p of parts) {
    const pcm = await geminiTTS(env, p, budget, voice);
    if (!pcm) return null;
    out.push(pcmTrim(pcm));
  }
  const gap = new Uint8Array(2 * Math.round(24e3 * 0.35)), total = out.reduce((s, b) => s + b.length, 0) + gap.length * (out.length - 1);
  const all = new Uint8Array(total);
  let o = 0;
  out.forEach((b, i) => {
    if (i) {
      all.set(gap, o);
      o += gap.length;
    }
    all.set(b, o);
    o += b.length;
  });
  return all;
}
__name(ttsLong, "ttsLong");
function chunkText(text, limit = 220) {
  const parts = text.trim().split(/(?<=[.!?])\s+/).filter(Boolean), out = [];
  let cur = "";
  for (const p of parts) {
    if (cur && cur.length + 1 + p.length > limit) {
      out.push(cur);
      cur = p;
    } else cur = (cur + " " + p).trim();
  }
  if (cur) out.push(cur);
  return out;
}
__name(chunkText, "chunkText");
function pcmTrim(pcm) {
  const w = pcmToWav(pcm);
  return w.subarray(44);
}
__name(pcmTrim, "pcmTrim");
async function runBg(env) {
  let q = await kvGet(env, "bgjobs", []);
  if (!q.length || await env.KV.get("bglock")) return;
  await env.KV.put("bglock", "1", { expirationTtl: 90 });
  const t0 = Date.now();
  try {
    while (q.length && used < 38 && Date.now() - t0 < 2e4) {
      const s = q[0];
      try {
        if (s.k === "tts") {
          const pcm = await ttsLong(env, s.text);
          if (pcm) {
            await ymUpload(env, `${s.path}/${s.name}.wav`, pcmToWav(pcm));
            await ym(env, "FileAction", { action: "delete", what: `ivr2:${s.path}/${s.name}.tts` }).catch(() => {
            });
          } else if ((s.tries = (s.tries || 0) + 1) < 4) {
            q.push(q.shift());
            break;
          } else {
            await ym(env, "UploadTextFile", { what: `ivr2:${s.path}/${s.name}.tts`, contents: s.text });
            await ym(env, "FileAction", { action: "delete", what: `ivr2:${s.path}/${s.name}.wav` }).catch(() => {
            });
          }
        } else if (s.k === "ini") {
          await ensureDir(env, s.path);
          await ym(env, "UploadTextFile", { what: `ivr2:${s.path}/ext.ini`, contents: s.text });
        } else if (s.k === "fa") await ym(env, "FileAction", { action: s.action, what: "ivr2:" + s.what, ...s.target ? { target: "ivr2:" + s.target } : {} });
        else if (s.k === "bc") await broadcastOne(env, s);
        else if (s.k === "log") await log(env, s.line);
      } catch (e) {
        aiTrace.push("bg " + s.k + ": " + e.message);
      }
      q.shift();
      await env.KV.put("bgjobs", JSON.stringify(q));
    }
    await env.KV.put("bgjobs", JSON.stringify(q));
  } finally {
    await env.KV.delete("bglock");
  }
}
__name(runBg, "runBg");
async function broadcastOne(env, s) {
  const msg = await env.KV.get("bc:" + s.id, "arrayBuffer");
  if (!msg) return;
  const m = new Int16Array(msg);
  let name = null;
  try {
    name = wavSamples(await ym(env, "DownloadFile", { path: `ivr2:/EnterIDRecord/phone-${s.p}-Name.wav` }));
  } catch {
  }
  const gap = new Int16Array(8e3 * 0.3), parts = name && name.sr === 8e3 ? [name.s, gap, m] : [m];
  const all = new Int16Array(parts.reduce((a, b) => a + b.length, 0));
  let o = 0;
  for (const p of parts) {
    all.set(p, o);
    o += p.length;
  }
  const folder = s.folder || "/personalMessages/Phone/" + s.p, fname = await nextName(env, folder, "wav");
  await ymUpload(env, `${folder}/${fname}`, pcmToWav(new Uint8Array(all.buffer), 8e3));
  const u = await kvGet(env, "bcfiles:" + s.id, []);
  u.push(`${folder}/${fname}`);
  await env.KV.put("bcfiles:" + s.id, JSON.stringify(u), { expirationTtl: 30 * 86400 });
}
__name(broadcastOne, "broadcastOne");
async function lineStats(env) {
  const c = await kvGet(env, "stats", null);
  if (c && Date.now() - c.t < 10 * 6e4) return c.text;
  const nm = names(env), month = nowIL().slice(0, 7), today = nowIL().slice(0, 10);
  const r = await ym(env, "GetTextFile", { what: `ivr2:/Log/LogFolderEnterExit-${month}.ymgr` });
  const calls = {}, last = {}, bot = /* @__PURE__ */ new Set(), heard = {};
  const imp = await ym(env, "GetIVR2Dir", { path: "ivr2:" + IMPORTANT }).catch(() => ({}));
  const lastImp = (imp.files || []).filter((f) => /^\d+\.wav$/.test(f.name)).map((f) => ({ f: f.name, t: sortable(f.mtime) })).sort((a, b) => a.t < b.t ? 1 : -1)[0];
  for (const line of (r && r.contents || "").split("\n")) {
    const d = Object.fromEntries(line.split("%").map((x) => x.split("#")));
    if (!d.Phone || !d.EnterDate) continue;
    const [dd, mm, yy] = d.EnterDate.split("/"), t = `${yy}-${mm}-${dd} ${d.EnterTime}`;
    if (!last[d.Phone] || last[d.Phone] < t) last[d.Phone] = t;
    if (t.startsWith(today)) {
      calls[d.CallId] = d.Phone;
      if (d.Folder === "8") bot.add(d.Phone);
    }
    if (lastImp && d.Folder === "1/1" && t >= lastImp.t) heard[d.Phone] = 1;
  }
  const who = /* @__PURE__ */ __name((p) => nm[p] || p, "who");
  const todayPh = [...new Set(Object.values(calls))];
  const weekAgo = ilAt(Date.now() - 7 * 864e5).slice(0, 16);
  const quiet = Object.keys(nm).filter((p) => !last[p] || last[p] < weekAgo).map(who);
  let text = `\u05E1\u05D8\u05D8\u05D9\u05E1\u05D8\u05D9\u05E7\u05D4 \u05DE\u05D4\u05D9\u05D5\u05DE\u05E0\u05D9\u05DD \u05E9\u05DC \u05D9\u05DE\u05D5\u05EA (\u05D4\u05D7\u05D5\u05D3\u05E9): \u05D4\u05D9\u05D5\u05DD \u05D4\u05D9\u05D5 ${Object.keys(calls).length} \u05E9\u05D9\u05D7\u05D5\u05EA \u05DE-${todayPh.length} \u05DE\u05EA\u05E7\u05E9\u05E8\u05D9\u05DD: ${todayPh.map(who).join(", ") || "\u05D0\u05E3 \u05D0\u05D7\u05D3"}. \u05D4\u05D9\u05D5\u05DD \u05D3\u05D9\u05D1\u05E8\u05D5 \u05E2\u05DD \u05D4\u05E2\u05D5\u05D6\u05E8: ${[...bot].map(who).join(", ") || "\u05D0\u05E3 \u05D0\u05D7\u05D3"}. \u05D7\u05D1\u05E8\u05D9\u05DD \u05E9\u05DC\u05D0 \u05E0\u05DB\u05E0\u05E1\u05D5 \u05DC\u05E7\u05D5 \u05D1\u05E9\u05D1\u05D5\u05E2 \u05D4\u05D0\u05D7\u05E8\u05D5\u05DF: ${quiet.join(", ") || "\u05D0\u05D9\u05DF"}.`;
  if (lastImp) text += ` \u05D4\u05D4\u05D5\u05D3\u05E2\u05D4 \u05D4\u05D7\u05E9\u05D5\u05D1\u05D4 \u05D4\u05D0\u05D7\u05E8\u05D5\u05E0\u05D4 (${lastImp.f}, ${lastImp.t}) \u05E0\u05E9\u05DE\u05E2\u05D4 \u05D1\u05E9\u05DC\u05D5\u05D7\u05EA \u05D4\u05D4\u05D5\u05D3\u05E2\u05D5\u05EA \u05D4\u05D7\u05E9\u05D5\u05D1\u05D5\u05EA \u05E2\u05DC \u05D9\u05D3\u05D9: ${Object.keys(heard).map(who).join(", ") || "\u05D0\u05E3 \u05D0\u05D7\u05D3 \u05E2\u05D3\u05D9\u05D9\u05DF"}.`;
  text += " \u05DB\u05E0\u05D9\u05E1\u05D4 \u05D0\u05D7\u05E8\u05D5\u05E0\u05D4 \u05E9\u05DC \u05DB\u05DC \u05D7\u05D1\u05E8: " + Object.keys(nm).map((p) => `${who(p)} ${last[p] ? last[p].slice(5, 16) : "\u05DC\u05D0 \u05E0\u05DB\u05E0\u05E1 \u05D4\u05D7\u05D5\u05D3\u05E9"}`).join(", ") + ".";
  await env.KV.put("stats", JSON.stringify({ t: Date.now(), text }));
  return text;
}
__name(lineStats, "lineStats");
async function adminText(env, line) {
  const c = await kvGet(env, "admintext", null);
  if (c && Date.now() - c.t < 9e4) return c.text;
  const nm = names(env), who = /* @__PURE__ */ __name((p) => nm[p] || p, "who");
  const [counts, joins, ev, rs, watch, jobs, stats, conv, undo] = await Promise.all([
    Promise.all(PENDING_ORDER.map((k) => pendingFiles(env, REVIEW[k].folder).then((f) => f.length).catch(() => 0))),
    pendingFiles(env, "/JoinRequests").catch(() => []),
    curEvent(env),
    rsvpLoad(env),
    kvGet(env, "watch", {}),
    kvGet(env, "scheduled", []),
    lineStats(env).catch((e) => "\u05D4\u05E1\u05D8\u05D8\u05D9\u05E1\u05D8\u05D9\u05E7\u05D4 \u05DC\u05D0 \u05D6\u05DE\u05D9\u05E0\u05D4 \u05DB\u05E8\u05D2\u05E2"),
    kvGet(env, "convlog", []),
    kvGet(env, "undo", [])
  ]);
  const jm = await kvGet(env, "joinmap", {});
  let t = "\u05DE\u05D9\u05D3\u05E2 \u05DC\u05E0\u05D9\u05D4\u05D5\u05DC (\u05E8\u05E7 \u05DC\u05DE\u05E0\u05D4\u05DC): ";
  t += "\u05D4\u05D5\u05D3\u05E2\u05D5\u05EA \u05E9\u05DE\u05DE\u05EA\u05D9\u05E0\u05D5\u05EA \u05DC\u05D0\u05D9\u05E9\u05D5\u05E8 \u05D1\u05E9\u05DC\u05D5\u05D7\u05D4 7-4: " + PENDING_ORDER.map((k, i) => `${REVIEW[k].name}: ${counts[i]}`).join("; ") + ". ";
  t += joins.length ? `\u05D1\u05E7\u05E9\u05D5\u05EA \u05D4\u05E6\u05D8\u05E8\u05E4\u05D5\u05EA (${joins.length}): ` + joins.map((f) => `join:${f.name.replace(".wav", "")} \u05DE\u05DE\u05E1\u05E4\u05E8 ${jm[f.name] || "\u05DC\u05D0 \u05D9\u05D3\u05D5\u05E2"} (${f.mtime || ""})`).join("; ") + ". " : "\u05D0\u05D9\u05DF \u05D1\u05E7\u05E9\u05D5\u05EA \u05D4\u05E6\u05D8\u05E8\u05E4\u05D5\u05EA. ";
  const reg = Object.keys(rs), notReg = Object.keys(nm).filter((p) => !rs[p]);
  t += `\u05D4\u05D0\u05D9\u05E8\u05D5\u05E2 \u05D4\u05E4\u05E2\u05D9\u05DC \u05D1\u05E9\u05DC\u05D5\u05D7\u05D4 9: ${ev.title}${ev.desc ? " (" + ev.desc + ")" : ""}. \u05E0\u05E8\u05E9\u05DE\u05D5 ${reg.length}: ${reg.map((p) => rs[p].n).join(", ") || "\u05D0\u05E3 \u05D0\u05D7\u05D3"}. \u05DC\u05D0 \u05E0\u05E8\u05E9\u05DE\u05D5: ${notReg.map(who).join(", ") || "\u05D0\u05D9\u05DF"}. `;
  const muted = Object.entries(watch).filter(([, w]) => w && w.hold && (!w.until || w.until > Date.now()));
  t += muted.length ? "\u05D7\u05D1\u05E8\u05D9\u05DD \u05DE\u05D5\u05E9\u05EA\u05E7\u05D9\u05DD (\u05D4\u05D4\u05D5\u05D3\u05E2\u05D5\u05EA \u05E9\u05DC\u05D4\u05DD \u05DE\u05D7\u05DB\u05D5\u05EA \u05DC\u05D0\u05D9\u05E9\u05D5\u05E8): " + muted.map(([p, w]) => `${who(p)}${w.until ? " \u05E2\u05D3 " + ilAt(w.until).slice(0, 16) : ""}`).join(", ") + ". " : "\u05D0\u05D9\u05DF \u05D7\u05D1\u05E8\u05D9\u05DD \u05DE\u05D5\u05E9\u05EA\u05E7\u05D9\u05DD. ";
  const pend = jobs.filter((j) => !j.done);
  t += pend.length ? "\u05DE\u05E9\u05D9\u05DE\u05D5\u05EA \u05DE\u05EA\u05D5\u05D6\u05DE\u05E0\u05D5\u05EA \u05E9\u05E2\u05D5\u05D3 \u05DC\u05D0 \u05D9\u05E6\u05D0\u05D5: " + pend.map((j) => `${j.at}: ${j.type === "post" ? (j.important ? "\u05D4\u05D5\u05D3\u05E2\u05D4 \u05D7\u05E9\u05D5\u05D1\u05D4" : "\u05D4\u05D5\u05D3\u05E2\u05D4 \u05E8\u05D2\u05D9\u05DC\u05D4") + ' "' + j.text + '"' : j.type === "remind" ? "\u05EA\u05D6\u05DB\u05D5\u05E8\u05EA \u05DC" + who(j.phone) : j.type === "shoeva" ? "\u05EA\u05D6\u05DB\u05D5\u05E8\u05EA \u05DC\u05D0\u05D9\u05E8\u05D5\u05E2" : j.type}`).join("; ") + ". " : "\u05D0\u05D9\u05DF \u05DE\u05E9\u05D9\u05DE\u05D5\u05EA \u05DE\u05EA\u05D5\u05D6\u05DE\u05E0\u05D5\u05EA. ";
  t += stats + " ";
  const since = ilAt(Date.now() - 48 * 36e5).slice(0, 16);
  const recent = conv.filter((e) => e.d >= since);
  if (recent.length) t += "\u05D4\u05E9\u05D9\u05D7\u05D5\u05EA \u05E2\u05DD \u05D4\u05E2\u05D5\u05D6\u05E8 \u05D1-48 \u05D4\u05E9\u05E2\u05D5\u05EA \u05D4\u05D0\u05D7\u05E8\u05D5\u05E0\u05D5\u05EA (\u05DB\u05D3\u05D9 \u05E9\u05EA\u05D5\u05DB\u05DC \u05DC\u05E1\u05DB\u05DD \u05DC\u05DE\u05E0\u05D4\u05DC \u05E2\u05DC \u05DE\u05D4 \u05D3\u05D9\u05D1\u05E8\u05D5): " + recent.slice(-60).map((e) => `[${e.d.slice(5, 16)} ${who(e.p)}] \u05E9\u05D0\u05DC: ${String(e.q).slice(0, 120)} | \u05E2\u05E0\u05D9\u05EA: ${String(e.a).slice(0, 120)}`).join(" || ") + ". ";
  t += undo.length ? `\u05D4\u05E4\u05E2\u05D5\u05DC\u05D4 \u05D4\u05D0\u05D7\u05E8\u05D5\u05E0\u05D4 \u05E9\u05D0\u05E4\u05E9\u05E8 \u05DC\u05D1\u05D8\u05DC: ${undo[undo.length - 1].desc}. ` : "\u05D0\u05D9\u05DF \u05E4\u05E2\u05D5\u05DC\u05D4 \u05DC\u05D1\u05D9\u05D8\u05D5\u05DC. ";
  await env.KV.put("admintext", JSON.stringify({ t: Date.now(), text: t }));
  return t;
}
__name(adminText, "adminText");
var ADMIN_ACTS = /* @__PURE__ */ new Set(["delete", "move", "schedule", "event", "mute", "unmute", "entry", "entry_delete", "approve_join", "rule_add", "rule_remove", "rename", "broadcast", "undo"]);
function describeAct(a, env) {
  const nm = names(env), who = /* @__PURE__ */ __name((p) => nm[p] || p, "who");
  switch (a.type) {
    case "delete":
      return `\u05DC\u05DE\u05D7\u05D5\u05E7 \u05DE\u05D4\u05E7\u05D5 \u05D0\u05EA \u05D4\u05D5\u05D3\u05E2\u05D4 ${a.id}`;
    case "move":
      return `\u05DC\u05D4\u05E2\u05D1\u05D9\u05E8 \u05D0\u05EA \u05D4\u05D5\u05D3\u05E2\u05D4 ${a.id} ${a.to === "important" ? "\u05DC\u05D4\u05D5\u05D3\u05E2\u05D5\u05EA \u05D4\u05D7\u05E9\u05D5\u05D1\u05D5\u05EA, \u05E2\u05DD \u05E6\u05D9\u05E0\u05EA\u05D5\u05E7 \u05DC\u05DB\u05D5\u05DC\u05DD" : "\u05D7\u05D6\u05E8\u05D4 \u05DC\u05D4\u05D5\u05D3\u05E2\u05D5\u05EA \u05D4\u05E8\u05D2\u05D9\u05DC\u05D5\u05EA \u05D1\u05DC\u05D1\u05D3"}`;
    case "schedule":
      return `\u05DC\u05E4\u05E8\u05E1\u05DD \u05D1-${a.at} ${a.important ? "\u05D4\u05D5\u05D3\u05E2\u05D4 \u05D7\u05E9\u05D5\u05D1\u05D4 \u05E2\u05DD \u05E6\u05D9\u05E0\u05EA\u05D5\u05E7 \u05DC\u05DB\u05D5\u05DC\u05DD" : "\u05D4\u05D5\u05D3\u05E2\u05D4 \u05E8\u05D2\u05D9\u05DC\u05D4"}: ${a.text}`;
    case "event":
      return `\u05DC\u05E4\u05EA\u05D5\u05D7 \u05D1\u05E9\u05DC\u05D5\u05D7\u05D4 9 \u05D4\u05E8\u05E9\u05DE\u05D4 \u05D7\u05D3\u05E9\u05D4 \u05DC\u05D0\u05D9\u05E8\u05D5\u05E2: ${a.title}${a.desc ? ", " + a.desc : ""}. \u05D4\u05E8\u05E9\u05D9\u05DE\u05D4 \u05D4\u05E7\u05D5\u05D3\u05DE\u05EA \u05E0\u05E9\u05DE\u05E8\u05EA`;
    case "mute":
      return `\u05DC\u05D4\u05E9\u05EA\u05D9\u05E7 \u05D0\u05EA ${who(a.phone)} \u05DC-${a.hours || 24} \u05E9\u05E2\u05D5\u05EA. \u05D1\u05D6\u05DE\u05DF \u05D4\u05D6\u05D4 \u05D4\u05D4\u05D5\u05D3\u05E2\u05D5\u05EA \u05E9\u05DC\u05D5 \u05D9\u05D7\u05DB\u05D5 \u05DC\u05D0\u05D9\u05E9\u05D5\u05E8`;
    case "unmute":
      return `\u05DC\u05D1\u05D8\u05DC \u05D0\u05EA \u05D4\u05D4\u05E9\u05EA\u05E7\u05D4 \u05E9\u05DC ${who(a.phone)}`;
    case "entry":
      return `\u05DC\u05D4\u05D7\u05DC\u05D9\u05E3 \u05D0\u05EA \u05D4\u05D4\u05D5\u05D3\u05E2\u05D4 \u05D1\u05DB\u05E0\u05D9\u05E1\u05D4 \u05DC\u05E7\u05D5 \u05DC: ${a.text}`;
    case "entry_delete":
      return "\u05DC\u05DE\u05D7\u05D5\u05E7 \u05D0\u05EA \u05D4\u05D4\u05D5\u05D3\u05E2\u05D4 \u05E9\u05D1\u05DB\u05E0\u05D9\u05E1\u05D4 \u05DC\u05E7\u05D5";
    case "approve_join":
      return `\u05DC\u05D0\u05E9\u05E8 \u05D0\u05EA ${a.name} \u05DE\u05DE\u05E1\u05E4\u05E8 ${digitsSay(a.phone)} \u05D5\u05DC\u05D4\u05D5\u05E1\u05D9\u05E3 \u05D0\u05D5\u05EA\u05D5 \u05DC\u05EA\u05E4\u05E8\u05D9\u05D8 \u05D4\u05D4\u05D5\u05D3\u05E2\u05D5\u05EA \u05D4\u05D0\u05D9\u05E9\u05D9\u05D5\u05EA`;
    case "rule_add":
      return `\u05DC\u05D4\u05D5\u05E1\u05D9\u05E3 \u05DC\u05E2\u05D5\u05D6\u05E8 \u05DB\u05DC\u05DC \u05E7\u05D1\u05D5\u05E2: ${a.text}`;
    case "rule_remove":
      return `\u05DC\u05DE\u05D7\u05D5\u05E7 \u05D0\u05EA \u05D4\u05DB\u05DC\u05DC: ${a.text || a.n}`;
    case "rename":
      return `\u05DC\u05E9\u05E0\u05D5\u05EA \u05D0\u05EA \u05D4\u05E9\u05DD \u05E9\u05DC ${who(a.phone)} \u05DC${a.name}`;
    case "broadcast":
      return `\u05DC\u05D4\u05E9\u05D0\u05D9\u05E8 \u05DC\u05DB\u05DC \u05D0\u05D7\u05D3 \u05DE\u05D4\u05D7\u05D1\u05E8\u05D9\u05DD \u05D4\u05D5\u05D3\u05E2\u05D4 \u05D0\u05D9\u05E9\u05D9\u05EA \u05E2\u05DD \u05D4\u05E9\u05DD \u05E9\u05DC\u05D5: ${a.text}`;
    case "undo":
      return "\u05DC\u05D1\u05D8\u05DC \u05D0\u05EA \u05D4\u05E4\u05E2\u05D5\u05DC\u05D4 \u05D4\u05D0\u05D7\u05E8\u05D5\u05E0\u05D4";
  }
  return "";
}
__name(describeAct, "describeAct");
async function pushUndo(env, desc, ops) {
  const u = await kvGet(env, "undo", []);
  u.push({ desc, ops, d: nowIL() });
  await env.KV.put("undo", JSON.stringify(u.slice(-15)));
  await env.KV.delete("admintext");
}
__name(pushUndo, "pushUndo");
async function findImportantCopy(env, id) {
  const [a, b] = await Promise.all([allFiles(env, ALL), ym(env, "GetIVR2Dir", { path: "ivr2:" + IMPORTANT })]);
  const f = (a.files || []).find((x) => x.name === id + ".wav");
  if (!f) return { exists: false };
  const same2 = (b.files || []).filter((x) => /^\d+\.wav$/.test(x.name) && x.size === f.size);
  return { exists: true, imp: same2.length ? same2[same2.length - 1].name : null };
}
__name(findImportantCopy, "findImportantCopy");
async function doAdmin(env, a, admin, via = "\u05D4\u05E2\u05D5\u05D6\u05E8") {
  const nm = names(env), who = /* @__PURE__ */ __name((p) => nm[p] || p, "who"), id = String(a.id || "").replace(/\D/g, "");
  const tag = `(\u05DE\u05E0\u05D4\u05DC ${who(admin)} \u05D3\u05E8\u05DA ${via})`;
  switch (a.type) {
    case "delete": {
      const f = await findImportantCopy(env, id);
      if (!f.exists) return "\u05DC\u05D0 \u05DE\u05E6\u05D0\u05EA\u05D9 \u05D0\u05EA \u05D4\u05D4\u05D5\u05D3\u05E2\u05D4 \u05D4\u05D6\u05D5 \u05D1\u05E7\u05D5";
      const ops = [];
      const n1 = await move(env, `${ALL}/${id}.wav`, "/DeletedByAdmin");
      ops.push({ mv: [`/DeletedByAdmin/${n1}`, `${ALL}/${id}.wav`] });
      if (f.imp) {
        const n2 = await move(env, `${IMPORTANT}/${f.imp}`, "/DeletedByAdmin");
        ops.push({ mv: [`/DeletedByAdmin/${n2}`, `${IMPORTANT}/${f.imp}`] });
      }
      const ar = await kvGet(env, "archive", {});
      if (ar[id + ".wav"]) {
        ops.push({ archive: [id + ".wav", ar[id + ".wav"]] });
        delete ar[id + ".wav"];
        await env.KV.put("archive", JSON.stringify(ar));
      }
      await pushUndo(env, `\u05DE\u05D7\u05D9\u05E7\u05EA \u05D4\u05D5\u05D3\u05E2\u05D4 ${id}`, ops);
      await log(env, `\u05D4\u05D5\u05D3\u05E2\u05D4 ${id} \u05E0\u05DE\u05D7\u05E7\u05D4 \u05DE\u05D4\u05E7\u05D5 ${tag}`);
      return `\u05D4\u05D5\u05D3\u05E2\u05D4 ${id} \u05E0\u05DE\u05D7\u05E7\u05D4${f.imp ? " \u05D2\u05DD \u05DE\u05D4\u05D4\u05D5\u05D3\u05E2\u05D5\u05EA \u05D4\u05D7\u05E9\u05D5\u05D1\u05D5\u05EA" : ""}`;
    }
    case "move": {
      const f = await findImportantCopy(env, id);
      if (!f.exists) return "\u05DC\u05D0 \u05DE\u05E6\u05D0\u05EA\u05D9 \u05D0\u05EA \u05D4\u05D4\u05D5\u05D3\u05E2\u05D4 \u05D4\u05D6\u05D5 \u05D1\u05E7\u05D5";
      if (a.to === "important") {
        if (f.imp) return "\u05D4\u05D4\u05D5\u05D3\u05E2\u05D4 \u05D4\u05D6\u05D5 \u05DB\u05D1\u05E8 \u05E0\u05DE\u05E6\u05D0\u05EA \u05D1\u05D4\u05D5\u05D3\u05E2\u05D5\u05EA \u05D4\u05D7\u05E9\u05D5\u05D1\u05D5\u05EA";
        const n2 = await move(env, `${ALL}/${id}.wav`, IMPORTANT, "copy");
        used = 0;
        await tzintuk(env, "members");
        await addFlags(env, await membersFor(env, "members"), "NImportant");
        await processFlags(env).catch(() => {
        });
        await pushUndo(env, `\u05D4\u05E2\u05D1\u05E8\u05EA \u05D4\u05D5\u05D3\u05E2\u05D4 ${id} \u05DC\u05D7\u05E9\u05D5\u05D1\u05D5\u05EA`, [{ mv: [`${IMPORTANT}/${n2}`, `/DeletedByAdmin/imp-${n2}`] }]);
        await log(env, `\u05D4\u05D5\u05D3\u05E2\u05D4 ${id} \u05D4\u05D5\u05E2\u05D1\u05E8\u05D4 \u05DC\u05D7\u05E9\u05D5\u05D1\u05D5\u05EA \u05D5\u05E0\u05E9\u05DC\u05D7 \u05E6\u05D9\u05E0\u05EA\u05D5\u05E7 ${tag}`);
        return "\u05D4\u05D4\u05D5\u05D3\u05E2\u05D4 \u05D4\u05D5\u05E2\u05D1\u05E8\u05D4 \u05DC\u05D4\u05D5\u05D3\u05E2\u05D5\u05EA \u05D4\u05D7\u05E9\u05D5\u05D1\u05D5\u05EA \u05D5\u05E0\u05E9\u05DC\u05D7 \u05E6\u05D9\u05E0\u05EA\u05D5\u05E7 \u05DC\u05DB\u05DC \u05D4\u05D7\u05D1\u05E8\u05D9\u05DD";
      }
      if (!f.imp) return "\u05D4\u05D4\u05D5\u05D3\u05E2\u05D4 \u05D4\u05D6\u05D5 \u05DC\u05D0 \u05E0\u05DE\u05E6\u05D0\u05EA \u05D1\u05D4\u05D5\u05D3\u05E2\u05D5\u05EA \u05D4\u05D7\u05E9\u05D5\u05D1\u05D5\u05EA";
      const n = await move(env, `${IMPORTANT}/${f.imp}`, "/DeletedByAdmin");
      await pushUndo(env, `\u05D4\u05D5\u05E6\u05D0\u05EA \u05D4\u05D5\u05D3\u05E2\u05D4 ${id} \u05DE\u05D4\u05D7\u05E9\u05D5\u05D1\u05D5\u05EA`, [{ mv: [`/DeletedByAdmin/${n}`, `${IMPORTANT}/${f.imp}`] }]);
      await log(env, `\u05D4\u05D5\u05D3\u05E2\u05D4 ${id} \u05D4\u05D5\u05E6\u05D0\u05D4 \u05DE\u05D4\u05D7\u05E9\u05D5\u05D1\u05D5\u05EA \u05D5\u05E0\u05E9\u05D0\u05E8\u05D4 \u05D1\u05E8\u05D2\u05D9\u05DC\u05D5\u05EA ${tag}`);
      return "\u05D4\u05D4\u05D5\u05D3\u05E2\u05D4 \u05D4\u05D5\u05E6\u05D0\u05D4 \u05DE\u05D4\u05D4\u05D5\u05D3\u05E2\u05D5\u05EA \u05D4\u05D7\u05E9\u05D5\u05D1\u05D5\u05EA \u05D5\u05E0\u05E9\u05D0\u05E8\u05D4 \u05D1\u05D4\u05D5\u05D3\u05E2\u05D5\u05EA \u05D4\u05E8\u05D2\u05D9\u05DC\u05D5\u05EA";
    }
    case "schedule": {
      const jobs = await kvGet(env, "scheduled", []), jid = "j" + Date.now().toString(36);
      jobs.push({ id: jid, at: a.at, type: "post", text: a.text, important: !!a.important, by: admin });
      await env.KV.put("scheduled", JSON.stringify(jobs));
      await pushUndo(env, `\u05D4\u05D5\u05D3\u05E2\u05D4 \u05DE\u05EA\u05D5\u05D6\u05DE\u05E0\u05EA \u05DC-${a.at}`, [{ unsched: jid }]);
      await log(env, `\u05E0\u05E7\u05D1\u05E2\u05D4 \u05D4\u05D5\u05D3\u05E2\u05D4 ${a.important ? "\u05D7\u05E9\u05D5\u05D1\u05D4" : "\u05E8\u05D2\u05D9\u05DC\u05D4"} \u05DC-${a.at}: ${a.text} ${tag}`);
      return `\u05D4\u05D4\u05D5\u05D3\u05E2\u05D4 \u05EA\u05E6\u05D0 \u05D1${+a.at.slice(8, 10)} \u05DC${+a.at.slice(5, 7)} \u05D1\u05E9\u05E2\u05D4 ${a.at.slice(11, 16)}`;
    }
    case "event": {
      const old = await curEvent(env), ev = { id: "e" + Date.now().toString(36), title: a.title, desc: a.desc || "", file: `ivr2:/9/\u05E8\u05E9\u05D9\u05DE\u05D4_${Date.now().toString(36)}.txt` };
      await env.KV.put("event", JSON.stringify(ev));
      await bgAdd(env, [{ k: "tts", path: "/9", name: "M1000", text: event9Menu(ev) }, { k: "ini", path: "/9", text: `type=menu
title=${ev.title}
` }]);
      await pushUndo(env, `\u05E4\u05EA\u05D9\u05D7\u05EA \u05D4\u05E8\u05E9\u05DE\u05D4 \u05DC${ev.title}`, [{ event: old }]);
      await log(env, `\u05E0\u05E4\u05EA\u05D7\u05D4 \u05D4\u05E8\u05E9\u05DE\u05D4 \u05D7\u05D3\u05E9\u05D4 \u05D1\u05E9\u05DC\u05D5\u05D7\u05D4 9: ${ev.title} ${ev.desc} ${tag}`);
      return `\u05E0\u05E4\u05EA\u05D7\u05D4 \u05D4\u05E8\u05E9\u05DE\u05D4 \u05DC${ev.title}. \u05D4\u05EA\u05E4\u05E8\u05D9\u05D8 \u05E9\u05DC \u05E9\u05DC\u05D5\u05D7\u05D4 9 \u05D9\u05EA\u05E2\u05D3\u05DB\u05DF \u05EA\u05D5\u05DA \u05DB\u05DE\u05D4 \u05D3\u05E7\u05D5\u05EA`;
    }
    case "mute":
    case "unmute": {
      const w = await kvGet(env, "watch", {}), prev = w[a.phone] || null;
      if (a.type === "mute") w[a.phone] = { hold: true, until: Date.now() + (a.hours || 24) * 36e5 };
      else delete w[a.phone];
      await env.KV.put("watch", JSON.stringify(w));
      await pushUndo(env, `${a.type === "mute" ? "\u05D4\u05E9\u05EA\u05E7\u05EA" : "\u05D1\u05D9\u05D8\u05D5\u05DC \u05D4\u05E9\u05EA\u05E7\u05D4 \u05E9\u05DC"} ${who(a.phone)}`, [{ watch: [a.phone, prev] }]);
      await log(env, `${a.type === "mute" ? "\u05D4\u05E9\u05EA\u05E7\u05D4 \u05DC-" + (a.hours || 24) + " \u05E9\u05E2\u05D5\u05EA \u05E9\u05DC" : "\u05D1\u05D9\u05D8\u05D5\u05DC \u05D4\u05E9\u05EA\u05E7\u05D4 \u05E9\u05DC"} ${who(a.phone)} ${tag}`);
      return a.type === "mute" ? `${who(a.phone)} \u05DE\u05D5\u05E9\u05EA\u05E7 \u05DC-${a.hours || 24} \u05E9\u05E2\u05D5\u05EA. \u05D4\u05D4\u05D5\u05D3\u05E2\u05D5\u05EA \u05E9\u05DC\u05D5 \u05D9\u05D7\u05DB\u05D5 \u05DC\u05D0\u05D9\u05E9\u05D5\u05E8 \u05D1\u05E9\u05DC\u05D5\u05D7\u05D4 7 4` : `\u05D4\u05D4\u05E9\u05EA\u05E7\u05D4 \u05E9\u05DC ${who(a.phone)} \u05D1\u05D5\u05D8\u05DC\u05D4`;
    }
    case "entry":
    case "entry_delete": {
      const bk = `/OldEntry/${Date.now().toString(36)}.wav`;
      const had = await ym(env, "FileAction", { action: "copy", what: "ivr2:/M0000-1.wav", target: "ivr2:" + bk }).then((r) => r.responseStatus === "OK").catch(() => false);
      if (a.type === "entry") {
        const pcm = await ttsLong(env, a.text);
        if (pcm) await ymUpload(env, "/M0000-1.wav", pcmToWav(pcm));
        else await bgAdd(env, [{ k: "tts", path: "", name: "M0000-1", text: a.text }]);
      } else await ym(env, "FileAction", { action: "delete", what: "ivr2:/M0000-1.wav" });
      await pushUndo(env, a.type === "entry" ? "\u05D4\u05D7\u05DC\u05E4\u05EA \u05D4\u05D4\u05D5\u05D3\u05E2\u05D4 \u05D1\u05DB\u05E0\u05D9\u05E1\u05D4" : "\u05DE\u05D7\u05D9\u05E7\u05EA \u05D4\u05D4\u05D5\u05D3\u05E2\u05D4 \u05D1\u05DB\u05E0\u05D9\u05E1\u05D4", [had ? { copy: [bk, "/M0000-1.wav"] } : { del: "/M0000-1.wav" }]);
      await log(env, (a.type === "entry" ? "\u05D4\u05D4\u05D5\u05D3\u05E2\u05D4 \u05D1\u05DB\u05E0\u05D9\u05E1\u05D4 \u05DC\u05E7\u05D5 \u05D4\u05D5\u05D7\u05DC\u05E4\u05D4 \u05DC: " + a.text : "\u05D4\u05D4\u05D5\u05D3\u05E2\u05D4 \u05D1\u05DB\u05E0\u05D9\u05E1\u05D4 \u05DC\u05E7\u05D5 \u05E0\u05DE\u05D7\u05E7\u05D4") + " " + tag);
      return a.type === "entry" ? "\u05D4\u05D4\u05D5\u05D3\u05E2\u05D4 \u05D1\u05DB\u05E0\u05D9\u05E1\u05D4 \u05DC\u05E7\u05D5 \u05D4\u05D5\u05D7\u05DC\u05E4\u05D4" : "\u05D4\u05D4\u05D5\u05D3\u05E2\u05D4 \u05D1\u05DB\u05E0\u05D9\u05E1\u05D4 \u05DC\u05E7\u05D5 \u05E0\u05DE\u05D7\u05E7\u05D4";
    }
    case "approve_join": {
      const phone = String(a.phone || "").replace(/\D/g, "");
      if (!/^0\d{8,9}$/.test(phone)) return "\u05DE\u05E1\u05E4\u05E8 \u05D4\u05D8\u05DC\u05E4\u05D5\u05DF \u05DC\u05D0 \u05EA\u05E7\u05D9\u05DF";
      const people = await peopleList(env);
      if (people.some((p) => p.p === phone)) {
        const jm0 = await kvGet(env, "joinmap", {}), rq = Object.keys(jm0).find((k) => jm0[k] === phone);
        const r = await approveJoin(env, phone, rq, admin);
        return `\u05D4\u05D1\u05E7\u05E9\u05D4 \u05E9\u05DC ${r.name} \u05D0\u05D5\u05E9\u05E8\u05D4. \u05D4\u05D5\u05D0 \u05D9\u05E6\u05D8\u05E8\u05E3 \u05DC\u05E7\u05D1\u05D5\u05E6\u05D4 \u05D0\u05D5\u05D8\u05D5\u05DE\u05D8\u05D9\u05EA \u05D1\u05E4\u05E2\u05DD \u05D4\u05D1\u05D0\u05D4 \u05E9\u05D4\u05D5\u05D0 \u05D9\u05EA\u05E7\u05E9\u05E8`;
      }
      const code = String(Math.max(0, ...people.map((p) => +p.c)) + 1).padStart(2, "0"), np = { n: a.name, p: phone, a: false, c: code };
      people.push(np);
      await saveNames(env, people);
      await bgAdd(env, peopleRegenSteps(people, [np]));
      const jm = await kvGet(env, "joinmap", {}), req = Object.keys(jm).find((k) => jm[k] === phone);
      if (req) await ym(env, "FileAction", { action: "move", what: "ivr2:/JoinRequests/" + req, target: "ivr2:/JoinRequestsDone/" + Date.now().toString(36) + ".wav" }).catch(() => {
      });
      await pushUndo(env, `\u05D4\u05E6\u05D8\u05E8\u05E4\u05D5\u05EA \u05E9\u05DC ${a.name}`, [{ unjoin: phone }]);
      await log(env, `${a.name} (${phone}) \u05D0\u05D5\u05E9\u05E8 \u05D5\u05D4\u05D5\u05E1\u05E3 \u05DC\u05E7\u05D1\u05D5\u05E6\u05D4 \u05D1\u05E7\u05D5\u05D3 ${code} ${tag}`);
      if (!a.fromJoin) {
        const ap = await kvGet(env, "approved", {});
        ap[phone] = { t: nowIL(), by: admin };
        await env.KV.put("approved", JSON.stringify(ap));
      }
      return `${a.name} \u05E0\u05D5\u05E1\u05E3 \u05DC\u05E7\u05D1\u05D5\u05E6\u05D4, \u05D1\u05E7\u05D5\u05D3 ${spell(code)} \u05D1\u05EA\u05E4\u05E8\u05D9\u05D8 \u05D4\u05D4\u05D5\u05D3\u05E2\u05D5\u05EA \u05D4\u05D0\u05D9\u05E9\u05D9\u05D5\u05EA. \u05D1\u05E4\u05E2\u05DD \u05D4\u05D1\u05D0\u05D4 \u05E9\u05D4\u05D5\u05D0 \u05D9\u05EA\u05E7\u05E9\u05E8 \u05D4\u05D5\u05D0 \u05D9\u05E6\u05D8\u05E8\u05E3 \u05D0\u05D5\u05D8\u05D5\u05DE\u05D8\u05D9\u05EA \u05DC\u05E8\u05E9\u05D9\u05DE\u05EA \u05D4\u05E6\u05D9\u05E0\u05EA\u05D5\u05E7\u05D9\u05DD`;
    }
    case "rule_add":
    case "rule_remove": {
      const rules = await kvGet(env, "rules", []), prev = [...rules];
      if (a.type === "rule_add") rules.push(String(a.text).slice(0, 300));
      else {
        const i = a.n ? a.n - 1 : rules.findIndex((r) => r === a.text);
        if (i < 0 || i >= rules.length) return "\u05DC\u05D0 \u05DE\u05E6\u05D0\u05EA\u05D9 \u05DB\u05DC\u05DC \u05DB\u05D6\u05D4";
        rules.splice(i, 1);
      }
      await env.KV.put("rules", JSON.stringify(rules));
      await pushUndo(env, a.type === "rule_add" ? "\u05D4\u05D5\u05E1\u05E4\u05EA \u05DB\u05DC\u05DC \u05DC\u05E2\u05D5\u05D6\u05E8" : "\u05DE\u05D7\u05D9\u05E7\u05EA \u05DB\u05DC\u05DC \u05E9\u05DC \u05D4\u05E2\u05D5\u05D6\u05E8", [{ rules: prev }]);
      await log(env, `${a.type === "rule_add" ? "\u05E0\u05D5\u05E1\u05E3 \u05DC\u05E2\u05D5\u05D6\u05E8 \u05DB\u05DC\u05DC" : "\u05E0\u05DE\u05D7\u05E7 \u05DB\u05DC\u05DC \u05E9\u05DC \u05D4\u05E2\u05D5\u05D6\u05E8"}: ${a.text || a.n} ${tag}`);
      return a.type === "rule_add" ? "\u05D4\u05DB\u05DC\u05DC \u05E0\u05E9\u05DE\u05E8, \u05D5\u05DE\u05E2\u05DB\u05E9\u05D9\u05D5 \u05D0\u05E0\u05D9 \u05E4\u05D5\u05E2\u05DC \u05DC\u05E4\u05D9\u05D5" : "\u05D4\u05DB\u05DC\u05DC \u05E0\u05DE\u05D7\u05E7";
    }
    case "rename": {
      const people = await peopleList(env), p = people.find((x) => x.p === a.phone);
      if (!p) return "\u05DC\u05D0 \u05DE\u05E6\u05D0\u05EA\u05D9 \u05D0\u05EA \u05D4\u05D7\u05D1\u05E8 \u05D4\u05D6\u05D4 \u05D1\u05E8\u05E9\u05D9\u05DE\u05D4";
      const old = { n: p.n, s: p.s };
      p.n = a.name;
      delete p.s;
      await saveNames(env, people);
      await bgAdd(env, peopleRegenSteps(people, [p]));
      await pushUndo(env, `\u05E9\u05D9\u05E0\u05D5\u05D9 \u05D4\u05E9\u05DD \u05E9\u05DC ${old.n}`, [{ rename: [p.p, old] }]);
      await log(env, `\u05D4\u05E9\u05DD \u05E9\u05DC ${old.n} (${p.p}) \u05E9\u05D5\u05E0\u05D4 \u05DC${a.name} ${tag}`);
      return `\u05D4\u05E9\u05DD \u05E9\u05D5\u05E0\u05D4 \u05DC${a.name}. \u05D4\u05D4\u05E7\u05DC\u05D8\u05D5\u05EA \u05D1\u05EA\u05E4\u05E8\u05D9\u05D8\u05D9\u05DD \u05D9\u05EA\u05E2\u05D3\u05DB\u05E0\u05D5 \u05EA\u05D5\u05DA \u05DB\u05DE\u05D4 \u05D3\u05E7\u05D5\u05EA`;
    }
    case "broadcast": {
      const pcm = await ttsLong(env, a.text);
      if (!pcm) return "\u05D4\u05E7\u05D5\u05DC \u05E9\u05DC \u05D4\u05E2\u05D5\u05D6\u05E8 \u05DC\u05D0 \u05D6\u05DE\u05D9\u05DF \u05DB\u05E8\u05D2\u05E2, \u05E0\u05E1\u05D4 \u05E9\u05D5\u05D1 \u05DE\u05D0\u05D5\u05D7\u05E8 \u05D9\u05D5\u05EA\u05E8";
      const bid = Date.now().toString(36), m8 = to8k(pcmTrim(pcm));
      await env.KV.put("bc:" + bid, m8.buffer, { expirationTtl: 3 * 86400 });
      const people = await peopleList(env);
      await bgAdd(env, [...people.map((p) => ({ k: "bc", id: bid, p: p.p })), { k: "log", line: `\u05D4\u05D4\u05D5\u05D3\u05E2\u05D4 \u05D4\u05D0\u05D9\u05E9\u05D9\u05EA \u05DC\u05DB\u05DC \u05D4\u05D7\u05D1\u05E8\u05D9\u05DD \u05D4\u05D5\u05E9\u05D0\u05E8\u05D4 \u05D0\u05E6\u05DC ${people.length} \u05D7\u05D1\u05E8\u05D9\u05DD ${tag}` }]);
      await pushUndo(env, "\u05D4\u05D5\u05D3\u05E2\u05D4 \u05D0\u05D9\u05E9\u05D9\u05EA \u05DC\u05DB\u05DC \u05D4\u05D7\u05D1\u05E8\u05D9\u05DD", [{ bcdel: bid }]);
      return `\u05D4\u05D4\u05D5\u05D3\u05E2\u05D4 \u05EA\u05D2\u05D9\u05E2 \u05DC\u05EA\u05D9\u05D1\u05D4 \u05D4\u05D0\u05D9\u05E9\u05D9\u05EA \u05E9\u05DC \u05DB\u05DC ${people.length} \u05D4\u05D7\u05D1\u05E8\u05D9\u05DD \u05D1\u05D3\u05E7\u05D5\u05EA \u05D4\u05E7\u05E8\u05D5\u05D1\u05D5\u05EA`;
    }
    case "undo": {
      const u = await kvGet(env, "undo", []), last = u.pop();
      if (!last) return "\u05D0\u05D9\u05DF \u05E4\u05E2\u05D5\u05DC\u05D4 \u05DC\u05D1\u05D8\u05DC";
      for (const op of last.ops) {
        if (op.mv) await ym(env, "FileAction", { action: "move", what: "ivr2:" + op.mv[0], target: "ivr2:" + op.mv[1] });
        if (op.copy) await ym(env, "FileAction", { action: "copy", what: "ivr2:" + op.copy[0], target: "ivr2:" + op.copy[1] });
        if (op.del) await ym(env, "FileAction", { action: "delete", what: "ivr2:" + op.del });
        if (op.archive) {
          const ar = await kvGet(env, "archive", {});
          ar[op.archive[0]] = op.archive[1];
          await env.KV.put("archive", JSON.stringify(ar));
        }
        if (op.unsched) {
          const j = await kvGet(env, "scheduled", []);
          await env.KV.put("scheduled", JSON.stringify(j.filter((x) => x.id !== op.unsched || x.done)));
        }
        if (op.event) {
          await env.KV.put("event", JSON.stringify(op.event));
          await bgAdd(env, [{ k: "tts", path: "/9", name: "M1000", text: event9Menu(op.event) }, { k: "ini", path: "/9", text: `type=menu
title=${op.event.title}
` }]);
        }
        if (op.watch) {
          const w = await kvGet(env, "watch", {});
          if (op.watch[1]) w[op.watch[0]] = op.watch[1];
          else delete w[op.watch[0]];
          await env.KV.put("watch", JSON.stringify(w));
        }
        if (op.rules) await env.KV.put("rules", JSON.stringify(op.rules));
        if (op.rename) {
          const people = await peopleList(env), p = people.find((x) => x.p === op.rename[0]);
          if (p) {
            p.n = op.rename[1].n;
            if (op.rename[1].s) p.s = op.rename[1].s;
            await saveNames(env, people);
            await bgAdd(env, peopleRegenSteps(people, [p]));
          }
        }
        if (op.unjoin) {
          const ap = await kvGet(env, "approved", {});
          delete ap[op.unjoin];
          await env.KV.put("approved", JSON.stringify(ap));
        }
        if (op.unjoin) {
          const people = (await peopleList(env)).filter((x) => x.p !== op.unjoin);
          await saveNames(env, people);
          const over = await kvGet(env, "names_over", {});
          delete over[op.unjoin];
          await env.KV.put("names_over", JSON.stringify(over));
          await bgAdd(env, peopleRegenSteps(people));
        }
        if (op.bcdel) {
          const q = (await kvGet(env, "bgjobs", [])).filter((s) => !(s.k === "bc" && s.id === op.bcdel));
          await env.KV.put("bgjobs", JSON.stringify(q));
          for (const f of await kvGet(env, "bcfiles:" + op.bcdel, [])) await ym(env, "FileAction", { action: "delete", what: "ivr2:" + f }).catch(() => {
          });
        }
      }
      await env.KV.put("undo", JSON.stringify(u));
      await env.KV.delete("admintext");
      await log(env, `\u05D1\u05D5\u05D8\u05DC\u05D4 \u05D4\u05E4\u05E2\u05D5\u05DC\u05D4: ${last.desc} ${tag}`);
      return `\u05D1\u05D5\u05D8\u05DC: ${last.desc}`;
    }
  }
  return "\u05DC\u05D0 \u05D4\u05D1\u05E0\u05EA\u05D9 \u05D0\u05D9\u05D6\u05D5 \u05E4\u05E2\u05D5\u05DC\u05D4 \u05DC\u05D1\u05E6\u05E2";
}
__name(doAdmin, "doAdmin");
var REVIEW = {
  problem: { folder: P.problem, name: "\u05D4\u05D5\u05D3\u05E2\u05D5\u05EA \u05D7\u05E9\u05D5\u05D1\u05D5\u05EA \u05E9\u05D4 AI \u05E2\u05E6\u05E8 \u05D1\u05D2\u05DC\u05DC \u05D7\u05E9\u05E9 \u05DC\u05EA\u05D5\u05DB\u05DF \u05D1\u05E2\u05D9\u05D9\u05EA\u05D9" },
  general: { folder: P.general, name: "\u05D4\u05D5\u05D3\u05E2\u05D5\u05EA \u05E8\u05D2\u05D9\u05DC\u05D5\u05EA \u05E9\u05D4 AI \u05E2\u05E6\u05E8 \u05D1\u05D2\u05DC\u05DC \u05D7\u05E9\u05E9 \u05DC\u05EA\u05D5\u05DB\u05DF \u05D1\u05E2\u05D9\u05D9\u05EA\u05D9" },
  demoted: { folder: P.demoted, name: "\u05D4\u05D5\u05D3\u05E2\u05D5\u05EA \u05E9\u05E1\u05D5\u05DE\u05E0\u05D5 \u05DB\u05D7\u05E9\u05D5\u05D1\u05D5\u05EA \u05D5\u05D4 AI \u05D4\u05E2\u05D1\u05D9\u05E8 \u05DC\u05E8\u05D2\u05D9\u05DC\u05D5\u05EA" },
  approval: { folder: "/PendingApproval", name: "\u05D4\u05D5\u05D3\u05E2\u05D5\u05EA \u05D7\u05E9\u05D5\u05D1\u05D5\u05EA \u05E9\u05D4\u05D5\u05E7\u05DC\u05D8\u05D5 \u05D1\u05D6\u05DE\u05DF \u05E0\u05E2\u05D9\u05DC\u05D4" },
  error: { folder: P.error, name: "\u05D4\u05D5\u05D3\u05E2\u05D5\u05EA \u05E9\u05D4\u05E9\u05E8\u05EA \u05DC\u05D0 \u05D4\u05E6\u05DC\u05D9\u05D7 \u05DC\u05D1\u05D3\u05D5\u05E7" },
  join: { folder: "/JoinRequests", name: "\u05D1\u05E7\u05E9\u05D5\u05EA \u05D4\u05E6\u05D8\u05E8\u05E4\u05D5\u05EA" }
};
var PENDING_ORDER = ["problem", "general", "demoted", "approval", "error"];
var MONTHS = ["\u05D9\u05E0\u05D5\u05D0\u05E8", "\u05E4\u05D1\u05E8\u05D5\u05D0\u05E8", "\u05DE\u05E8\u05E5", "\u05D0\u05E4\u05E8\u05D9\u05DC", "\u05DE\u05D0\u05D9", "\u05D9\u05D5\u05E0\u05D9", "\u05D9\u05D5\u05DC\u05D9", "\u05D0\u05D5\u05D2\u05D5\u05E1\u05D8", "\u05E1\u05E4\u05D8\u05DE\u05D1\u05E8", "\u05D0\u05D5\u05E7\u05D8\u05D5\u05D1\u05E8", "\u05E0\u05D5\u05D1\u05DE\u05D1\u05E8", "\u05D3\u05E6\u05DE\u05D1\u05E8"];
function sayDate(s) {
  const m = /(\d+)\/(\d+)\/(\d+) (\d+):(\d+)/.exec(s || "");
  return m ? `\u05E0\u05E9\u05DC\u05D7\u05D4 \u05D1 ${+m[1]} \u05D1${MONTHS[+m[2] - 1]} \u05D1\u05E9\u05E2\u05D4 ${+m[4]} \u05D5 ${+m[5]} \u05D3\u05E7\u05D5\u05EA` : "";
}
__name(sayDate, "sayDate");
var digitsSay = /* @__PURE__ */ __name((p) => (p || "").split("").join(" "), "digitsSay");
async function pendingFiles(env, folder) {
  const d = await ym(env, "GetIVR2Dir", { path: "ivr2:" + folder });
  return (d.files || []).filter((f) => /^\d+\.wav$/.test(f.name)).sort((a, b) => parseInt(a.name) - parseInt(b.name));
}
__name(pendingFiles, "pendingFiles");
var countSay = /* @__PURE__ */ __name((n) => n === 0 ? "\u05D0\u05D9\u05DF \u05D4\u05D5\u05D3\u05E2\u05D5\u05EA" : n === 1 ? "\u05D4\u05D5\u05D3\u05E2\u05D4 \u05D0\u05D7\u05EA" : `${n} \u05D4\u05D5\u05D3\u05E2\u05D5\u05EA`, "countSay");
async function pendingMenu(env, u, ctx) {
  const q = Object.fromEntries(u.searchParams);
  if (q.P) return q.P === "0" ? "go_to_folder=/7" : `go_to_folder=/7/4/${q.P}`;
  const counts = await Promise.all(PENDING_ORDER.map((k) => pendingFiles(env, REVIEW[k].folder).then((f) => f.length).catch(() => 0)));
  const total = counts.reduce((a, b) => a + b, 0);
  const parts = PENDING_ORDER.map((k, i) => `\u05DC${REVIEW[k].name}, ${countSay(counts[i])}, \u05D4\u05E7\u05D9\u05E9\u05D5 ${i + 1}`);
  const intro = total ? `\u05D4\u05D5\u05D3\u05E2\u05D5\u05EA \u05DE\u05DE\u05EA\u05D9\u05E0\u05D5\u05EA \u05DC\u05D0\u05D9\u05E9\u05D5\u05E8. \u05D1\u05E1\u05DA \u05D4\u05DB\u05D5\u05DC ${total === 1 ? "\u05D4\u05D5\u05D3\u05E2\u05D4 \u05D0\u05D7\u05EA \u05DE\u05DE\u05EA\u05D9\u05E0\u05D4" : total + " \u05D4\u05D5\u05D3\u05E2\u05D5\u05EA \u05DE\u05DE\u05EA\u05D9\u05E0\u05D5\u05EA"}.` : "\u05D0\u05D9\u05DF \u05DB\u05E8\u05D2\u05E2 \u05D4\u05D5\u05D3\u05E2\u05D5\u05EA \u05E9\u05DE\u05DE\u05EA\u05D9\u05E0\u05D5\u05EA \u05DC\u05D0\u05D9\u05E9\u05D5\u05E8.";
  return `read=${await sayC(env, ctx, intro + " " + parts.join(". ") + ". \u05DC\u05D7\u05D6\u05E8\u05D4 \u05DC\u05EA\u05E4\u05E8\u05D9\u05D8 \u05D4\u05E0\u05D9\u05D4\u05D5\u05DC \u05D4\u05E7\u05D9\u05E9\u05D5 \u05D0\u05E4\u05E1")}=P,no,1,1,10,No,no,no,,0.1.2.3.4.5`;
}
__name(pendingMenu, "pendingMenu");
async function applyReview(env, ctx, kind, f, act, admin, via = "") {
  const cfg = REVIEW[kind], adm = admin + via;
  const jmap = kind === "join" ? await kvGet(env, "joinmap", {}) : {};
  const phoneOf = /* @__PURE__ */ __name((x) => x.phone || jmap[x.name] || "", "phoneOf");
  const who = /* @__PURE__ */ __name((x) => {
    const p = phoneOf(x), nm = names(env)[p];
    return nm || (p ? "\u05DE\u05E1\u05E4\u05E8 " + digitsSay(p) : "\u05DE\u05E1\u05E4\u05E8 \u05DC\u05D0 \u05D9\u05D3\u05D5\u05E2");
  }, "who");
  const del = /* @__PURE__ */ __name(async (x) => {
    await ym(env, "FileAction", { action: "delete", what: "ivr2:" + cfg.folder + "/" + x.name });
  }, "del");
  const ring = /* @__PURE__ */ __name((type) => ctx.waitUntil((async () => {
    used = 0;
    await notify(env, type);
    await processFlags(env);
  })().catch((e) => log(env, "\u05E9\u05D2\u05D9\u05D0\u05D4 \u05D1\u05E6\u05D9\u05E0\u05EA\u05D5\u05E7: " + e.message))), "ring");
  if (kind === "join") {
    if (act === "1") {
      const p = phoneOf(f);
      if (!/^0\d{8,9}$/.test(p)) {
        await del(f);
        return "\u05DC\u05D0 \u05D9\u05D3\u05D5\u05E2 \u05DE\u05D0\u05D9\u05D6\u05D4 \u05DE\u05E1\u05E4\u05E8 \u05D4\u05D1\u05E7\u05E9\u05D4, \u05D5\u05DC\u05DB\u05DF \u05D4\u05D9\u05D0 \u05E0\u05DE\u05D7\u05E7\u05D4";
      }
      used = 0;
      const r = await approveJoin(env, p, f.name, admin);
      return `\u05D4\u05D1\u05E7\u05E9\u05D4 \u05D0\u05D5\u05E9\u05E8\u05D4. ${r.name} ${r.isNew ? "\u05E0\u05D5\u05E1\u05E3 \u05DC\u05E8\u05E9\u05D9\u05DE\u05D5\u05EA \u05E9\u05DC \u05D4\u05E7\u05D5, \u05D5" : ""}\u05D9\u05E6\u05D8\u05E8\u05E3 \u05DC\u05E7\u05D1\u05D5\u05E6\u05D4 \u05D0\u05D5\u05D8\u05D5\u05DE\u05D8\u05D9\u05EA \u05D1\u05E4\u05E2\u05DD \u05D4\u05D1\u05D0\u05D4 \u05E9\u05D4\u05D5\u05D0 \u05D9\u05EA\u05E7\u05E9\u05E8`;
    }
    if (act === "3") {
      await del(f);
      await log(env, `\u05DE\u05E0\u05D4\u05DC ${adm} \u05DE\u05D7\u05E7 \u05D1\u05E7\u05E9\u05EA \u05D4\u05E6\u05D8\u05E8\u05E4\u05D5\u05EA \u05E9\u05DC ${phoneOf(f)}`);
      return "\u05D4\u05D1\u05E7\u05E9\u05D4 \u05E0\u05DE\u05D7\u05E7\u05D4";
    }
    return "";
  }
  if (kind === "demoted") {
    const map = await kvGet(env, "demap", {});
    if (act === "1") {
      await move(env, cfg.folder + "/" + f.name, IMPORTANT);
      delete map[f.name];
      await env.KV.put("demap", JSON.stringify(map));
      ring("promoted");
      await log(env, `\u05DE\u05E0\u05D4\u05DC ${adm} \u05D4\u05E2\u05D1\u05D9\u05E8 \u05DC\u05D7\u05E9\u05D5\u05D1\u05D5\u05EA \u05D0\u05EA \u05D4\u05D4\u05D5\u05D3\u05E2\u05D4 \u05E9\u05DC ${who(f)}`);
      return "\u05D4\u05D4\u05D5\u05D3\u05E2\u05D4 \u05D4\u05D5\u05E2\u05D1\u05E8\u05D4 \u05DC\u05D4\u05D5\u05D3\u05E2\u05D5\u05EA \u05D4\u05D7\u05E9\u05D5\u05D1\u05D5\u05EA \u05D5\u05E0\u05E9\u05DC\u05D7 \u05E6\u05D9\u05E0\u05EA\u05D5\u05E7 \u05DC\u05D7\u05D1\u05E8\u05D9\u05DD";
    }
    if (act === "2") {
      await del(f);
      delete map[f.name];
      await env.KV.put("demap", JSON.stringify(map));
      return "\u05D4\u05D4\u05D5\u05D3\u05E2\u05D4 \u05E0\u05E9\u05D0\u05E8\u05EA \u05D1\u05D4\u05D5\u05D3\u05E2\u05D5\u05EA \u05D4\u05E8\u05D2\u05D9\u05DC\u05D5\u05EA";
    }
    if (act === "3") {
      let copy = map[f.name];
      if (!copy) {
        const d = await ym(env, "GetIVR2Dir", { path: "ivr2:" + ALL });
        const c = (d.files || []).filter((x) => /^\d+\.wav$/.test(x.name) && x.phone === f.phone && x.size === f.size).sort((a, b) => parseInt(b.name) - parseInt(a.name))[0];
        copy = c && c.name;
      }
      if (copy) await ym(env, "FileAction", { action: "delete", what: "ivr2:" + ALL + "/" + copy });
      await del(f);
      delete map[f.name];
      await env.KV.put("demap", JSON.stringify(map));
      if (copy) {
        const a = await kvGet(env, "archive", {});
        if (a[copy]) {
          delete a[copy];
          await env.KV.put("archive", JSON.stringify(a));
        }
      }
      await log(env, `\u05DE\u05E0\u05D4\u05DC ${adm} \u05DE\u05D7\u05E7 \u05DE\u05D4\u05E7\u05D5 \u05D0\u05EA \u05D4\u05D4\u05D5\u05D3\u05E2\u05D4 \u05E9\u05DC ${who(f)}${copy ? " (" + copy + " \u05D1\u05DB\u05DC \u05D4\u05D4\u05D5\u05D3\u05E2\u05D5\u05EA)" : ""}`);
      return copy ? "\u05D4\u05D4\u05D5\u05D3\u05E2\u05D4 \u05E0\u05DE\u05D7\u05E7\u05D4 \u05DE\u05D4\u05E7\u05D5 \u05DC\u05D2\u05DE\u05E8\u05D9" : "\u05D4\u05D4\u05D5\u05D3\u05E2\u05D4 \u05E0\u05DE\u05D7\u05E7\u05D4 \u05DE\u05D4\u05E8\u05E9\u05D9\u05DE\u05D4 \u05D4\u05D6\u05D5 \u05D0\u05D1\u05DC \u05DC\u05D0 \u05DE\u05E6\u05D0\u05EA\u05D9 \u05D0\u05D5\u05EA\u05D4 \u05D1\u05DB\u05DC \u05D4\u05D4\u05D5\u05D3\u05E2\u05D5\u05EA";
    }
    return "";
  }
  if (act === "1") {
    await move(env, cfg.folder + "/" + f.name, IMPORTANT);
    ring("important");
    await log(env, `\u05DE\u05E0\u05D4\u05DC ${adm} \u05D0\u05D9\u05E9\u05E8 \u05DB\u05D4\u05D5\u05D3\u05E2\u05D4 \u05D7\u05E9\u05D5\u05D1\u05D4 \u05D0\u05EA \u05D4\u05D4\u05D5\u05D3\u05E2\u05D4 \u05E9\u05DC ${who(f)} (${cfg.name})`);
    return "\u05D4\u05D4\u05D5\u05D3\u05E2\u05D4 \u05E4\u05D5\u05E8\u05E1\u05DE\u05D4 \u05DB\u05D4\u05D5\u05D3\u05E2\u05D4 \u05D7\u05E9\u05D5\u05D1\u05D4 \u05D5\u05E0\u05E9\u05DC\u05D7 \u05E6\u05D9\u05E0\u05EA\u05D5\u05E7 \u05DC\u05D7\u05D1\u05E8\u05D9\u05DD";
  }
  if (act === "2") {
    await move(env, cfg.folder + "/" + f.name, ALL);
    ring("regular");
    await log(env, `\u05DE\u05E0\u05D4\u05DC ${adm} \u05D0\u05D9\u05E9\u05E8 \u05DB\u05D4\u05D5\u05D3\u05E2\u05D4 \u05E8\u05D2\u05D9\u05DC\u05D4 \u05D0\u05EA \u05D4\u05D4\u05D5\u05D3\u05E2\u05D4 \u05E9\u05DC ${who(f)} (${cfg.name})`);
    return "\u05D4\u05D4\u05D5\u05D3\u05E2\u05D4 \u05E4\u05D5\u05E8\u05E1\u05DE\u05D4 \u05DB\u05D4\u05D5\u05D3\u05E2\u05D4 \u05E8\u05D2\u05D9\u05DC\u05D4";
  }
  if (act === "3") {
    await del(f);
    await log(env, `\u05DE\u05E0\u05D4\u05DC ${adm} \u05DE\u05D7\u05E7 \u05D0\u05EA \u05D4\u05D4\u05D5\u05D3\u05E2\u05D4 \u05E9\u05DC ${who(f)} (${cfg.name})`);
    return "\u05D4\u05D4\u05D5\u05D3\u05E2\u05D4 \u05E0\u05DE\u05D7\u05E7\u05D4";
  }
  return "";
}
__name(applyReview, "applyReview");
async function reviewPending(env, u, ctx, kind) {
  const cfg = REVIEW[kind], back = kind === "join" ? "/7" : "/7/4";
  const q = Object.fromEntries(u.searchParams), admin = q.ApiPhone || "";
  const steps = Object.keys(q).map((k) => /^A(\d+)_(\d+)$/.exec(k)).filter(Boolean).sort((a, b) => a[1] - b[1]);
  let files = await pendingFiles(env, cfg.folder), msg = "", n = 0, cur = null, after = null, replay = false;
  const jmap = kind === "join" ? await kvGet(env, "joinmap", {}) : {};
  const phoneOf = /* @__PURE__ */ __name((f) => f.phone || jmap[f.name] || "", "phoneOf");
  const who = /* @__PURE__ */ __name((f) => {
    const p = phoneOf(f), nm = names(env)[p];
    return nm || (p ? "\u05DE\u05E1\u05E4\u05E8 " + digitsSay(p) : "\u05DE\u05E1\u05E4\u05E8 \u05DC\u05D0 \u05D9\u05D3\u05D5\u05E2");
  }, "who");
  const del = /* @__PURE__ */ __name(async (f) => {
    await ym(env, "FileAction", { action: "delete", what: "ivr2:" + cfg.folder + "/" + f.name });
  }, "del");
  if (steps.length) {
    const last = steps[steps.length - 1];
    n = +last[1];
    const act = q[last[0]], num = last[2], f = files.find((x) => x.name === num + ".wav");
    if (!f) msg = "\u05D4\u05D4\u05D5\u05D3\u05E2\u05D4 \u05D4\u05D6\u05D5 \u05DB\u05D1\u05E8 \u05D8\u05D5\u05E4\u05DC\u05D4";
    else if (act === "4") {
      cur = f;
      msg = kind === "join" ? `\u05D1\u05E7\u05E9\u05D4 \u05DE\u05DE\u05E1\u05E4\u05E8 ${digitsSay(phoneOf(f))}. ${sayDate(f.date || f.mtime)}` : `\u05D4\u05D4\u05D5\u05D3\u05E2\u05D4 \u05E9\u05DC ${who(f)}${names(env)[phoneOf(f)] ? " \u05DE\u05DE\u05E1\u05E4\u05E8 " + digitsSay(phoneOf(f)) : ""}. ${sayDate(f.date || f.mtime)}`;
    } else if (act === "0") {
      cur = f;
      replay = true;
    } else if (act === "5") {
      after = num;
      msg = "";
    } else msg = await applyReview(env, ctx, kind, f, act, admin);
    if (!cur) files = await pendingFiles(env, cfg.folder);
  }
  let next = cur || (after ? files.find((x) => parseInt(x.name) > parseInt(after)) : files[0]);
  if (after && !next) msg = "\u05D6\u05D5 \u05D4\u05D9\u05D9\u05EA\u05D4 \u05D4\u05D4\u05D5\u05D3\u05E2\u05D4 \u05D4\u05D0\u05D7\u05E8\u05D5\u05E0\u05D4 \u05D1\u05E8\u05E9\u05D9\u05DE\u05D4";
  const head = msg ? await sayC(env, ctx, msg) + "." : "";
  if (!next) return `id_list_message=${after ? head.replace(/\.$/, "") : head + await sayC(env, ctx, steps.length ? "\u05D0\u05D9\u05DF \u05E2\u05D5\u05D3 \u05D4\u05D5\u05D3\u05E2\u05D5\u05EA \u05D1\u05E8\u05E9\u05D9\u05DE\u05D4 \u05D4\u05D6\u05D5" : "\u05D0\u05D9\u05DF \u05DB\u05E8\u05D2\u05E2 " + cfg.name)}&go_to_folder=${back}`;
  const idx = files.findIndex((x) => x.name === next.name) + 1;
  const label = kind === "join" ? "\u05D1\u05E7\u05E9\u05D4" : "\u05D4\u05D5\u05D3\u05E2\u05D4";
  const intro = replay ? "" : await sayC(env, ctx, `${label} ${idx} \u05DE\u05EA\u05D5\u05DA ${files.length}. ${kind === "join" ? "\u05DE\u05DE\u05E1\u05E4\u05E8 " + digitsSay(phoneOf(next)) : "\u05DE\u05D0\u05EA " + who(next)}`) + ".";
  const showDetails = cur && q[`A${n}_${next.name.split(".")[0]}`] === "4";
  const items = (head + (showDetails ? "" : intro + `f-${cfg.folder}/${next.name.replace(".wav", "")}`)).replace(/\.$/, "");
  const opts = kind === "join" ? ["\u05DC\u05D0\u05D9\u05E9\u05D5\u05E8 \u05D4\u05D1\u05E7\u05E9\u05D4 \u05D4\u05E7\u05D9\u05E9\u05D5 1", "\u05DC\u05DE\u05D7\u05D9\u05E7\u05EA \u05D4\u05D1\u05E7\u05E9\u05D4 \u05D4\u05E7\u05D9\u05E9\u05D5 3"] : kind === "demoted" ? ["\u05DC\u05D4\u05E2\u05D1\u05E8\u05D4 \u05DC\u05D4\u05D5\u05D3\u05E2\u05D5\u05EA \u05D4\u05D7\u05E9\u05D5\u05D1\u05D5\u05EA \u05E2\u05DD \u05E6\u05D9\u05E0\u05EA\u05D5\u05E7 \u05DC\u05D7\u05D1\u05E8\u05D9\u05DD \u05D4\u05E7\u05D9\u05E9\u05D5 1", "\u05DC\u05D4\u05E9\u05D0\u05D9\u05E8 \u05D0\u05D5\u05EA\u05D4 \u05DB\u05D4\u05D5\u05D3\u05E2\u05D4 \u05E8\u05D2\u05D9\u05DC\u05D4 \u05D4\u05E7\u05D9\u05E9\u05D5 2", "\u05DC\u05DE\u05D7\u05D9\u05E7\u05EA \u05D4\u05D4\u05D5\u05D3\u05E2\u05D4 \u05DE\u05D4\u05E7\u05D5 \u05DC\u05D2\u05DE\u05E8\u05D9 \u05D4\u05E7\u05D9\u05E9\u05D5 3"] : ["\u05DC\u05E4\u05E8\u05E1\u05D5\u05DD \u05DB\u05D4\u05D5\u05D3\u05E2\u05D4 \u05D7\u05E9\u05D5\u05D1\u05D4 \u05E2\u05DD \u05E6\u05D9\u05E0\u05EA\u05D5\u05E7 \u05DC\u05DB\u05DC \u05D4\u05D7\u05D1\u05E8\u05D9\u05DD \u05D4\u05E7\u05D9\u05E9\u05D5 1", "\u05DC\u05E4\u05E8\u05E1\u05D5\u05DD \u05DB\u05D4\u05D5\u05D3\u05E2\u05D4 \u05E8\u05D2\u05D9\u05DC\u05D4 \u05D4\u05E7\u05D9\u05E9\u05D5 2", "\u05DC\u05DE\u05D7\u05D9\u05E7\u05D4 \u05D4\u05E7\u05D9\u05E9\u05D5 3"];
  opts.push("\u05DC\u05E4\u05E8\u05D8\u05D9\u05DD \u05D4\u05E7\u05D9\u05E9\u05D5 4", "\u05DC\u05D3\u05D9\u05DC\u05D5\u05D2 \u05DC\u05D4\u05D5\u05D3\u05E2\u05D4 \u05D4\u05D1\u05D0\u05D4 \u05D4\u05E7\u05D9\u05E9\u05D5 5", "\u05DC\u05E9\u05DE\u05D9\u05E2\u05D4 \u05D7\u05D5\u05D6\u05E8\u05EA \u05D4\u05E7\u05D9\u05E9\u05D5 0");
  const valid = kind === "join" ? "0.1.3.4.5" : "0.1.2.3.4.5";
  return `${items ? "id_list_message=" + items + "&" : ""}read=${await sayC(env, ctx, opts.join(". "))}=A${n + 1}_${next.name.split(".")[0]},no,1,1,15,No,no,no,,${valid}`;
}
__name(reviewPending, "reviewPending");
async function nameFromRecording(env, file) {
  try {
    const wav = await ym(env, "DownloadFile", { path: "ivr2:/JoinRequests/" + file });
    let t = cleanupTranscript(await aaiSTT(env, wav, 15e3)) || "";
    t = t.replace(/[.,!?"'״׳-]/g, " ").replace(/^\s*(שלום|היי|הי)\s+/, "").replace(/^\s*(שמי|השם שלי|קוראים לי|אני|זה|מדבר|כאן)\s+/, "").trim();
    const skip = /* @__PURE__ */ new Set(["\u05EA\u05D5\u05D3\u05D4", "\u05E8\u05D1\u05D4", "\u05E9\u05DC\u05D5\u05DD", "\u05D1\u05D9\u05D9", "\u05DC\u05D4\u05EA\u05E8\u05D0\u05D5\u05EA", "\u05D0\u05E0\u05D9", "\u05E9\u05DE\u05D9", "\u05E8\u05D5\u05E6\u05D4", "\u05DC\u05D4\u05E6\u05D8\u05E8\u05E3", "\u05D1\u05D1\u05E7\u05E9\u05D4", "\u05D4\u05E7\u05D1\u05D5\u05E6\u05D4", "\u05DC\u05E7\u05D1\u05D5\u05E6\u05D4", "\u05DB\u05DF", "\u05D0\u05D5\u05E7\u05D9\u05D9"]);
    const w = t.split(/\s+/).filter((x) => /^[א-ת]+$/.test(x) && !skip.has(x)).slice(0, 3);
    return w.length ? w.join(" ") : "";
  } catch {
    return "";
  }
}
__name(nameFromRecording, "nameFromRecording");
async function approveJoin(env, phone, file, admin) {
  const people = await peopleList(env), nm = names(env);
  let name = (people.find((p) => p.p === phone) || {}).n || nm[phone] || "";
  const isNew = !people.some((p) => p.p === phone);
  if (isNew) {
    name = name || (file ? await nameFromRecording(env, file) : "") || "\u05D7\u05D1\u05E8 \u05D7\u05D3\u05E9 " + phone.slice(-4);
    await doAdmin(env, { type: "approve_join", phone, name, fromJoin: true }, admin);
  } else if (file) await ensureDir(env, "/JoinRequestsDone", false).then(() => ym(env, "FileAction", { action: "move", what: "ivr2:/JoinRequests/" + file, target: "ivr2:/JoinRequestsDone/" + Date.now().toString(36) + ".wav" })).catch(() => {
  });
  const ap = await kvGet(env, "approved", {});
  ap[phone] = { t: nowIL(), by: admin };
  await env.KV.put("approved", JSON.stringify(ap));
  await env.KV.delete("admintext");
  await log(env, `\u05DE\u05E0\u05D4\u05DC ${nm[admin] || admin} \u05D0\u05D9\u05E9\u05E8 \u05D0\u05EA \u05D4\u05D4\u05E6\u05D8\u05E8\u05E4\u05D5\u05EA \u05E9\u05DC ${name} (${phone}). \u05D4\u05D5\u05D0 \u05D9\u05E6\u05D8\u05E8\u05E3 \u05DC\u05E8\u05E9\u05D9\u05DE\u05EA \u05D4\u05E6\u05D9\u05E0\u05EA\u05D5\u05E7\u05D9\u05DD \u05D0\u05D5\u05D8\u05D5\u05DE\u05D8\u05D9\u05EA \u05DB\u05E9\u05D9\u05EA\u05E7\u05E9\u05E8`);
  return { name, isNew };
}
__name(approveJoin, "approveJoin");
async function joinGate(env, u, ctx) {
  const q = Object.fromEntries(u.searchParams), phone = q.ApiPhone || "\u05DC\u05D0 \u05DE\u05D6\u05D5\u05D4\u05D4";
  if ((await kvGet(env, "blocked", [])).includes(phone)) {
    await log(env, `\u05DE\u05E1\u05E4\u05E8 \u05D7\u05E1\u05D5\u05DD (${phone}) \u05E0\u05D9\u05E1\u05D4 \u05DC\u05D4\u05EA\u05E7\u05E9\u05E8 \u05DC\u05E7\u05D5 \u05D5\u05E0\u05D5\u05EA\u05E7`).catch(() => {
    });
    return "id_list_message=t-\u05D0\u05D9\u05DF \u05DB\u05E0\u05D9\u05E1\u05D4 \u05DC\u05DE\u05E1\u05E4\u05E8\u05D9\u05DD \u05E9\u05D0\u05D9\u05E0\u05DD \u05DE\u05D5\u05DB\u05E8\u05D9\u05DD&go_to_folder=hangup";
  }
  const ap = await kvGet(env, "approved", {});
  if (ap[phone]) {
    delete ap[phone];
    await env.KV.put("approved", JSON.stringify(ap));
    const first = (names(env)[phone] || "").split(" ")[0];
    await log(env, `${names(env)[phone] || phone} \u05D4\u05EA\u05E7\u05E9\u05E8 \u05D0\u05D7\u05E8\u05D9 \u05E9\u05D4\u05D1\u05E7\u05E9\u05D4 \u05E9\u05DC\u05D5 \u05D0\u05D5\u05E9\u05E8\u05D4, \u05D5\u05DE\u05E6\u05D8\u05E8\u05E3 \u05E2\u05DB\u05E9\u05D9\u05D5 \u05DC\u05E8\u05E9\u05D9\u05DE\u05EA \u05D4\u05E6\u05D9\u05E0\u05EA\u05D5\u05E7\u05D9\u05DD`).catch(() => {
    });
    return `id_list_message=${await sayC(env, ctx, `\u05E9\u05DC\u05D5\u05DD${first ? " " + first : ""}, \u05D4\u05D1\u05E7\u05E9\u05D4 \u05E9\u05DC\u05DA \u05D0\u05D5\u05E9\u05E8\u05D4. \u05D1\u05EA\u05E4\u05E8\u05D9\u05D8 \u05E9\u05D9\u05D9\u05E9\u05DE\u05E2 \u05E2\u05DB\u05E9\u05D9\u05D5, \u05DB\u05D3\u05D9 \u05DC\u05D4\u05E6\u05D8\u05E8\u05E3 \u05DC\u05E7\u05D1\u05D5\u05E6\u05D4 \u05D4\u05E7\u05D9\u05E9\u05D5 1`)}&go_to_folder=/JoinOK`;
  }
  if (!q.J && names(env)[phone]) {
    const k = "memberin:" + phone + ":" + nowIL().slice(0, 10);
    if (!await env.KV.get(k)) {
      await env.KV.put(k, "1", { expirationTtl: 86400 });
      await log(env, `${names(env)[phone]} \u05DC\u05D0 \u05D1\u05E8\u05E9\u05D9\u05DE\u05EA \u05D4\u05E6\u05D9\u05E0\u05EA\u05D5\u05E7\u05D9\u05DD, \u05D5\u05DC\u05DB\u05DF \u05E0\u05DB\u05E0\u05E1 \u05DC\u05E7\u05D5 \u05D3\u05E8\u05DA \u05D4\u05EA\u05E4\u05E8\u05D9\u05D8 \u05D4\u05E2\u05D5\u05E7\u05E3`).catch(() => {
      });
    }
    return "go_to_folder=/Main2";
  }
  if (!q.J) {
    await log(env, `\u05E9\u05D9\u05D7\u05D4 \u05DE\u05DE\u05E1\u05E4\u05E8 \u05E9\u05DC\u05D0 \u05E8\u05E9\u05D5\u05DD \u05D1\u05E7\u05D1\u05D5\u05E6\u05D4: ${phone}`).catch(() => {
    });
    const name = await nextName(env, "/JoinRequests", "wav");
    const prompt = "\u05E9\u05DC\u05D5\u05DD. \u05D4\u05DE\u05E1\u05E4\u05E8 \u05E9\u05DC\u05DA \u05E2\u05D3\u05D9\u05D9\u05DF \u05DC\u05D0 \u05E8\u05E9\u05D5\u05DD \u05D1\u05E7\u05D1\u05D5\u05E6\u05D4. \u05DB\u05D3\u05D9 \u05DC\u05D1\u05E7\u05E9 \u05DC\u05D4\u05E6\u05D8\u05E8\u05E3, \u05D0\u05DE\u05E8\u05D5 \u05D0\u05EA \u05D4\u05E9\u05DD \u05D4\u05DE\u05DC\u05D0 \u05E9\u05DC\u05DB\u05DD \u05D0\u05D7\u05E8\u05D9 \u05D4\u05E6\u05DC\u05D9\u05DC, \u05D5\u05D1\u05E1\u05D9\u05D5\u05DD \u05D4\u05E7\u05D9\u05E9\u05D5 \u05E1\u05D5\u05DC\u05DE\u05D9\u05EA. \u05D4\u05D1\u05E7\u05E9\u05D4 \u05EA\u05D9\u05E9\u05DC\u05D7 \u05DC\u05DE\u05E0\u05D4\u05DC\u05D9 \u05D4\u05E7\u05D1\u05D5\u05E6\u05D4";
    return `read=${await sayC(env, ctx, prompt)}=J,no,record,/JoinRequests,${name.replace(".wav", "")},no,yes,no,1,30`;
  }
  const fname = String(q.J).split("/").pop().replace(/\.wav$/, "") + ".wav";
  if (/^\d+\.wav$/.test(fname)) {
    const jm = await kvGet(env, "joinmap", {});
    jm[fname] = phone;
    await env.KV.put("joinmap", JSON.stringify(jm));
  }
  await ym(env, "RunTzintuk", { phones: "tzl:admins" }).catch(() => {
  });
  await log(env, `\u05D1\u05E7\u05E9\u05EA \u05D4\u05E6\u05D8\u05E8\u05E4\u05D5\u05EA \u05D7\u05D3\u05E9\u05D4 \u05DE-${phone} \u05E0\u05E9\u05DE\u05E8\u05D4 \u05D1\u05E9\u05DC\u05D5\u05D7\u05D4 7-0 \u05D5\u05E0\u05E9\u05DC\u05D7 \u05E6\u05D9\u05E0\u05EA\u05D5\u05E7 \u05DC\u05DE\u05E0\u05D4\u05DC\u05D9\u05DD`).catch(() => {
  });
  return `id_list_message=${await sayC(env, ctx, "\u05D4\u05D1\u05E7\u05E9\u05D4 \u05E9\u05DC\u05DA \u05E0\u05E9\u05DC\u05D7\u05D4 \u05DC\u05DE\u05E0\u05D4\u05DC\u05D9 \u05D4\u05E7\u05D1\u05D5\u05E6\u05D4. \u05D0\u05D7\u05E8\u05D9 \u05E9\u05D4\u05D9\u05D0 \u05EA\u05D0\u05D5\u05E9\u05E8 \u05EA\u05E7\u05D1\u05DC\u05D5 \u05D4\u05D6\u05DE\u05E0\u05D4 \u05DC\u05D4\u05E6\u05D8\u05E8\u05E3. \u05EA\u05D5\u05D3\u05D4 \u05D5\u05DC\u05D4\u05EA\u05E8\u05D0\u05D5\u05EA")}&go_to_folder=hangup`;
}
__name(joinGate, "joinGate");
async function rsvpLoad(env) {
  const list = {}, ev = await curEvent(env);
  try {
    const r = await ym(env, "GetTextFile", { what: ev.file });
    for (const line of (r.contents || "").split("\n")) {
      const m = /^(\d{9,10})\s*\|\s*(.*?)\s*\|\s*(.*)$/.exec(line.trim());
      if (m) list[m[1]] = { n: m[2], ts: m[3] };
    }
  } catch {
  }
  return list;
}
__name(rsvpLoad, "rsvpLoad");
async function rsvpSave(env, list) {
  const ev = await curEvent(env), rows = Object.entries(list).sort((a, b) => a[1].ts > b[1].ts ? 1 : -1);
  const txt = `\u05E8\u05E9\u05D5\u05DE\u05D9\u05DD \u05DC${ev.title}: ${rows.length} \u05D1\u05D7\u05D5\u05E8\u05D9\u05DD
` + rows.map(([p, x]) => `${p} | ${x.n} | ${x.ts}`).join("\n") + "\n";
  await ym(env, "UploadTextFile", { what: ev.file, contents: txt });
}
__name(rsvpSave, "rsvpSave");
async function announceRsvp(env, name, count) {
  const ev = await curEvent(env);
  await postVoice(env, [ALL], `${name} \u05E0\u05E8\u05E9\u05DD \u05DC${ev.title}. \u05E2\u05D3 \u05E2\u05DB\u05E9\u05D9\u05D5 \u05E0\u05E8\u05E9\u05DE\u05D5 ${count} \u05D1\u05D7\u05D5\u05E8\u05D9\u05DD.`);
  await log(env, `\u05E4\u05D5\u05E8\u05E1\u05DE\u05D4 \u05D1\u05D4\u05D5\u05D3\u05E2\u05D5\u05EA \u05D4\u05DB\u05DC\u05DC\u05D9\u05D5\u05EA \u05D4\u05D4\u05E8\u05E9\u05DE\u05D4 \u05E9\u05DC ${name} \u05DC${ev.title} (${count} \u05E0\u05E8\u05E9\u05DE\u05D9\u05DD)`);
}
__name(announceRsvp, "announceRsvp");
async function rsvp(env, u, ctx) {
  const q = Object.fromEntries(u.searchParams);
  const phone = q.ApiPhone || "", me = names(env)[phone] || "";
  const [list, ev] = await Promise.all([rsvpLoad(env), curEvent(env)]);
  const n = /* @__PURE__ */ __name(() => Object.keys(list).length, "n");
  if (!q.A) {
    const status = list[phone] ? "\u05D0\u05EA\u05D4 \u05DB\u05D1\u05E8 \u05E8\u05E9\u05D5\u05DD \u05E9\u05DE\u05D2\u05D9\u05E2" : "\u05E2\u05D3\u05D9\u05D9\u05DF \u05DC\u05D0 \u05D0\u05D9\u05E9\u05E8\u05EA \u05D4\u05D2\u05E2\u05D4";
    return `read=${await sayC(env, ctx, `\u05D4\u05E8\u05E9\u05DE\u05D4 \u05DC${ev.title}. ${status}. \u05DB\u05E8\u05D2\u05E2 \u05E8\u05E9\u05D5\u05DE\u05D9\u05DD ${n()} \u05D1\u05D7\u05D5\u05E8\u05D9\u05DD. \u05DC\u05D0\u05D9\u05E9\u05D5\u05E8 \u05D4\u05D2\u05E2\u05D4 \u05D4\u05E7\u05D9\u05E9\u05D5 1. \u05DC\u05D1\u05D9\u05D8\u05D5\u05DC \u05D4\u05D2\u05E2\u05D4 \u05D4\u05E7\u05D9\u05E9\u05D5 2`)}=A,no,1,1,7,No,no,no,,1.2`;
  }
  if (q.A === "1") {
    const was = !!list[phone];
    list[phone] = { n: me || phone, ts: list[phone]?.ts || nowIL() };
    await rsvpSave(env, list);
    if (!was) ctx.waitUntil(announceRsvp(env, me || "\u05D7\u05D1\u05E8 \u05D7\u05D3\u05E9", n()).catch((e) => log(env, "\u05E9\u05D2\u05D9\u05D0\u05D4 \u05D1\u05E4\u05E8\u05E1\u05D5\u05DD \u05D4\u05E8\u05E9\u05DE\u05D4: " + e.message)));
    return `id_list_message=${await sayC(env, ctx, `${was ? "\u05D0\u05EA\u05D4 \u05DB\u05D1\u05E8 \u05E8\u05E9\u05D5\u05DD" : "\u05E0\u05E8\u05E9\u05DE\u05EA \u05D1\u05D4\u05E6\u05DC\u05D7\u05D4"}${me ? " " + me : ""}. \u05DE\u05D7\u05DB\u05D9\u05DD \u05DC\u05DA \u05D1${ev.title}. \u05DB\u05E8\u05D2\u05E2 \u05E8\u05E9\u05D5\u05DE\u05D9\u05DD ${n()} \u05D1\u05D7\u05D5\u05E8\u05D9\u05DD`)}&go_to_folder=/9`;
  }
  if (q.A === "2") {
    delete list[phone];
    await rsvpSave(env, list);
    return `id_list_message=${await sayC(env, ctx, `\u05D4\u05D4\u05D2\u05E2\u05D4 \u05E9\u05DC\u05DA \u05D1\u05D5\u05D8\u05DC\u05D4. \u05DB\u05E8\u05D2\u05E2 \u05E8\u05E9\u05D5\u05DE\u05D9\u05DD ${n()} \u05D1\u05D7\u05D5\u05E8\u05D9\u05DD`)}&go_to_folder=/9`;
  }
  return "go_to_folder=/9";
}
__name(rsvp, "rsvp");
async function rsvpCount(env, ctx) {
  const list = await rsvpLoad(env);
  const ns = Object.values(list).sort((a, b) => a.ts > b.ts ? 1 : -1).map((x) => x.n);
  const ev = await curEvent(env);
  if (!ns.length) return `id_list_message=${await sayC(env, ctx, `\u05DC${ev.title} \u05E2\u05D3\u05D9\u05D9\u05DF \u05D0\u05E3 \u05D0\u05D7\u05D3 \u05DC\u05D0 \u05E0\u05E8\u05E9\u05DD. \u05DC\u05D4\u05E8\u05E9\u05DE\u05D4 \u05D4\u05E7\u05D9\u05E9\u05D5 1`)}&go_to_folder=/9`;
  const parts = (await Promise.all([`\u05DC${ev.title} \u05E8\u05E9\u05D5\u05DE\u05D9\u05DD \u05DB\u05E8\u05D2\u05E2 ${ns.length} \u05D1\u05D7\u05D5\u05E8\u05D9\u05DD. \u05D4\u05DE\u05D2\u05D9\u05E2\u05D9\u05DD \u05D4\u05DD`, ...ns, "\u05E1\u05D5\u05E3 \u05D4\u05E8\u05E9\u05D9\u05DE\u05D4"].filter((x) => clean(x)).map((x) => sayC(env, ctx, x)))).filter((x) => x.length > 2);
  return `id_list_message=${parts.join(".")}&go_to_folder=/9`;
}
__name(rsvpCount, "rsvpCount");
var reply = /* @__PURE__ */ __name((t) => new Response(t, { headers: { "Content-Type": "text/plain; charset=utf-8" } }), "reply");
var DASH = {
  ym,
  kvGet,
  names,
  log,
  nowIL,
  ilAt,
  sortable,
  isHoly,
  holyPeriods,
  onlineNow,
  listPhones,
  tzintuk,
  doAdmin,
  ADMIN_ACTS,
  describeAct,
  pendingFiles,
  REVIEW,
  PENDING_ORDER,
  applyReview,
  rsvpLoad,
  curEvent,
  peopleList,
  allFiles,
  nextFileNum,
  OWNER,
  LINE_PHONE,
  ALL,
  IMPORTANT,
  P,
  PM,
  WHERE,
  // לניהול המתקדם בדף הניהול (ספטמבר 2026): העלאות, קול, תזמונים, גיבוי, אירוע
  ymUpload,
  pcmToWav,
  to8k,
  pcmTrim,
  ttsLong,
  nextName,
  ensureDir,
  bgAdd,
  weeklySummary,
  rsvpSave,
  saveNames,
  peopleRegenSteps,
  postVoice,
  notify,
  processFlags,
  event9Menu,
  releaseDeferred,
  pushUndo,
  wavSamples,
  DEFAULT_EVENT,
  VOICE_DIR,
  aiText,
  loadLine,
  retrieveContext,
  adminText
};
var worker_default = {
  async scheduled(event, env, ctx) {
    NAMES_CACHE = {};
    await loadNames(env);
    ctx.waitUntil(cron(env).catch((e) => log(env, "\u05E9\u05D2\u05D9\u05D0\u05D4 \u05D1\u05E8\u05D9\u05E6\u05D4: " + e.message)));
  },
  async fetch(req, env, ctx) {
    NAMES_CACHE = {};
    await loadNames(env);
    const u = new URL(req.url), raw = decodeURIComponent(req.url);
    const param = /* @__PURE__ */ __name((n) => {
      const m = new RegExp("[?&/]" + n + "=([^&?/]*)").exec(raw);
      return m ? m[1] : "";
    }, "param");
    const parts = u.pathname.split("/").filter(Boolean);
    const key = parts[2] || param("key");
    if (parts[0] === "admin") return adminApp(req, env, ctx, u, parts.slice(1), DASH);
    if (parts[0] === "dash") return Response.redirect(new URL("/admin", u).href, 302);
    if (key !== env.RUN_KEY) return new Response("ok");
    if (u.searchParams.get("hangup") === "yes") return reply("");
    if (parts[0] === "ymx") {
      const m = u.searchParams.get("m");
      if (m !== "DownloadFile" && m !== "GetIVR2Dir") return reply("no");
      const q = {};
      for (const [k, v] of u.searchParams) if (k !== "m" && k !== "key") q[k] = v;
      const r = await ym(env, m, q);
      return m === "DownloadFile" ? new Response(r) : Response.json(r);
    }
    if (parts[0] === "check") {
      const kind = parts[1] === "general" ? "general" : "important", phone = param("ApiPhone");
      ctx.waitUntil(checkNow(env, phone, kind).catch((e) => log(env, "\u05E9\u05D2\u05D9\u05D0\u05D4 \u05D1\u05D1\u05D3\u05D9\u05E7\u05D4: " + e.message)));
      return reply(`id_list_message=${await sayC(env, ctx, kind === "general" ? "\u05D4\u05D4\u05D5\u05D3\u05E2\u05D4 \u05E9\u05DC\u05DA \u05E2\u05DC\u05EA\u05D4 \u05DC\u05E7\u05D5, \u05EA\u05D5\u05D3\u05D4." : "\u05D4\u05D4\u05D5\u05D3\u05E2\u05D4 \u05E0\u05E9\u05DC\u05D7\u05D4 \u05DC\u05D1\u05D3\u05D9\u05E7\u05D4 \u05E9\u05DC \u05E9\u05E8\u05EA \u05D4\u05D1\u05D9\u05E0\u05D4 \u05D4\u05DE\u05DC\u05D0\u05DB\u05D5\u05EA\u05D9\u05EA. \u05E0\u05D0 \u05D4\u05DE\u05EA\u05D9\u05E0\u05D5.")}&go_to_folder=/`);
    }
    if (parts[0] === "chat") return reply(await chat(env, u, ctx, parts[1]));
    if (parts[0] === "pending") {
      try {
        return reply(await pendingMenu(env, u, ctx));
      } catch (e) {
        return reply("go_to_folder=/7");
      }
    }
    if (parts[0] === "review") {
      const kind = REVIEW[parts[1]] ? parts[1] : "demoted";
      try {
        return reply(await reviewPending(env, u, ctx, kind));
      } catch (e) {
        await log(env, "\u05E9\u05D2\u05D9\u05D0\u05D4 \u05D1\u05D0\u05D9\u05E9\u05D5\u05E8 \u05D4\u05D5\u05D3\u05E2\u05D5\u05EA: " + (e.stack || e.message)).catch(() => {
        });
        return reply(u.searchParams.get("debug") ? String(e.stack || e) : "id_list_message=t-\u05D4\u05D9\u05D9\u05EA\u05D4 \u05EA\u05E7\u05DC\u05D4 \u05E0\u05E1\u05D5 \u05E9\u05D5\u05D1&go_to_folder=/7");
      }
    }
    if (parts[0] === "weekly") {
      aiTrace = [];
      try {
        return Response.json({ ...await weeklySummary(env, u.searchParams.get("go") !== "1"), trace: aiTrace });
      } catch (e) {
        return Response.json({ error: String(e.message), trace: aiTrace });
      }
    }
    if (parts[0] === "retortdry") {
      aiTrace = [];
      try {
        return Response.json({ reply: await maybeRetort(env, u.searchParams.get("p") || "", { snark: true, transcript: u.searchParams.get("t") || "" }, true), trace: aiTrace });
      } catch (e) {
        return Response.json({ error: e.message, trace: aiTrace });
      }
    }
    if (parts[0] === "ad") {
      try {
        return reply(await personalAd(env, u, ctx));
      } catch (e) {
        return reply("go_to_folder=/Main2");
      }
    }
    if (parts[0] === "speakel") {
      aiTrace = [];
      const t0 = Date.now();
      const pcm = await elevenTTS(env, u.searchParams.get("t") || "", 12e3, u.searchParams.get("v") || void 0);
      let r = null;
      if (pcm) {
        const name = "a" + Date.now().toString(36);
        await ymUpload(env, `${VOICE_DIR}/${name}.wav`, pcmToWav(pcm));
        r = `f-${VOICE_DIR}/${name}`;
      }
      return Response.json({ r, ms: Date.now() - t0, trace: aiTrace });
    }
    if (parts[0] === "speak") {
      aiTrace = [];
      const t0 = Date.now();
      const r = await speak(env, ctx, u.searchParams.get("t") || "", { cache: u.searchParams.get("cache") === "1", budget: 9e3, voice: u.searchParams.get("voice") || void 0 });
      return Response.json({ r, ms: Date.now() - t0, trace: aiTrace });
    }
    if (parts[0] === "online") {
      try {
        return reply(await whoOnline(env, u, ctx));
      } catch (e) {
        return reply("go_to_folder=/5");
      }
    }
    if (parts[0] === "incalls") return Response.json(await onlineNow(env));
    if (parts[0] === "holy") {
      const at = u.searchParams.get("at") ? Date.parse(u.searchParams.get("at")) : Date.now();
      return Response.json({ holy: await isHoly(env, at), at: new Date(at).toISOString(), periods: (await holyPeriods(env)).map(([a, b]) => [new Date(a).toLocaleString("sv-SE", { timeZone: "Asia/Jerusalem" }), new Date(b).toLocaleString("sv-SE", { timeZone: "Asia/Jerusalem" })]), deferred: await kvGet(env, "deferred_tz", []) });
    }
    if (parts[0] === "convos") {
      try {
        return reply(await convosMenu(env, u, ctx));
      } catch (e) {
        await log(env, "\u05E9\u05D2\u05D9\u05D0\u05D4 \u05D1\u05D4\u05D0\u05D6\u05E0\u05D4 \u05DC\u05E9\u05D9\u05D7\u05D5\u05EA: " + e.message).catch(() => {
        });
        return reply("go_to_folder=/7");
      }
    }
    if (parts[0] === "world") {
      const loc = u.searchParams.get("place") ? await geocode(u.searchParams.get("place"), +u.searchParams.get("lat"), +u.searchParams.get("lon")) : DEFAULT_LOC;
      return Response.json({ loc, text: loc ? await worldText(env, loc) : null });
    }
    if (parts[0] === "bgrun") {
      aiTrace = [];
      used = 0;
      await runBg(env);
      return Response.json({ left: await kvGet(env, "bgjobs", []), trace: aiTrace });
    }
    if (parts[0] === "stats") {
      await env.KV.delete("stats");
      await env.KV.delete("admintext");
      return Response.json({ stats: await lineStats(env), admin: await adminText(env, await loadLine(env)) });
    }
    if (parts[0] === "admintest") {
      aiTrace = [];
      used = 0;
      let r;
      try {
        r = await doAdmin(env, JSON.parse(u.searchParams.get("a")), u.searchParams.get("p") || "0534169095");
      } catch (e) {
        r = "ERR " + (e.stack || e.message);
      }
      return Response.json({ r, trace: aiTrace, undo: await kvGet(env, "undo", []) });
    }
    if (parts[0] === "bgadd") {
      await bgAdd(env, JSON.parse(u.searchParams.get("s")));
      return Response.json(await kvGet(env, "bgjobs", []));
    }
    if (parts[0] === "bctest") {
      aiTrace = [];
      const pcm = await ttsLong(env, "\u05D6\u05D5 \u05D1\u05D3\u05D9\u05E7\u05D4 \u05E9\u05DC \u05D4\u05D5\u05D3\u05E2\u05D4 \u05D0\u05D9\u05E9\u05D9\u05EA \u05DC\u05DB\u05D5\u05DC\u05DD.");
      const bid = "t" + Date.now().toString(36);
      await env.KV.put("bc:" + bid, to8k(pcmTrim(pcm)).buffer, { expirationTtl: 3600 });
      await broadcastOne(env, { id: bid, p: u.searchParams.get("p"), folder: "/TestBg" });
      return Response.json({ files: await kvGet(env, "bcfiles:" + bid, []), trace: aiTrace });
    }
    if (parts[0] === "route") {
      aiTrace = [];
      return Response.json({ r: await routeAnswer(JSON.parse(u.searchParams.get("a"))), trace: aiTrace });
    }
    if (parts[0] === "fetchtest_off") {
      const t0 = Date.now();
      try {
        const r = await fetch(u.searchParams.get("u"), { headers: UA, signal: AbortSignal.timeout(9e3) });
        const t = await r.text();
        return Response.json({ st: r.status, len: t.length, head: t.slice(0, 300), ms: Date.now() - t0 });
      } catch (e) {
        return Response.json({ err: e.message, ms: Date.now() - t0 });
      }
    }
    if (parts[0] === "news") {
      aiTrace = [];
      const t0 = Date.now();
      return Response.json({ r: await newsAnswer(env, u.searchParams.get("t") || "", u.searchParams.get("admin") === "1"), ms: Date.now() - t0, trace: aiTrace });
    }
    if (parts[0] === "snip") {
      aiTrace = [];
      const t0 = Date.now();
      return Response.json({ r: await snippetAnswer(env, u.searchParams.get("q") || "", u.searchParams.get("en") || ""), ms: Date.now() - t0, trace: aiTrace });
    }
    if (parts[0] === "web") {
      aiTrace = [];
      const t0 = Date.now();
      const r = await webAnswer(env, u.searchParams.get("q") || "");
      return Response.json({ r, ms: Date.now() - t0, trace: aiTrace });
    }
    if (parts[0] === "introtest") {
      aiTrace = [];
      let ok;
      try {
        ok = await addIntro(env, u.searchParams.get("p"), u.searchParams.get("f"));
      } catch (e) {
        ok = "ERR " + e.message;
      }
      return Response.json({ ok, trace: aiTrace });
    }
    if (parts[0] === "sef") return Response.json(await sefaria(u.searchParams.get("ref") || ""));
    if (parts[0] === "sched") return Response.json({ jobs: await kvGet(env, "scheduled", []), now: nowIL(), nextImportant: await nextFileNum(env, IMPORTANT), nextAll: await nextFileNum(env, ALL) });
    if (parts[0] === "join") return reply(await joinGate(env, u, ctx));
    if (parts[0] === "rsvp") return reply(await rsvp(env, u, ctx));
    if (parts[0] === "rsvpcount") return reply(await rsvpCount(env, ctx));
    if (parts[0] === "rsvplist") return Response.json(await rsvpLoad(env));
    if (parts[0] === "ask") {
      aiTrace = [];
      force = u.searchParams.get("force") || "";
      const t0 = Date.now();
      let r;
      try {
        r = await answerWithCheck(env, { text: u.searchParams.get("q") || "", phone: u.searchParams.get("phone") || "", persona: u.searchParams.get("persona") || "tzibtzer", callId: "test" }, []);
        if (u.searchParams.get("apply") === "1" && r.do && r.do.length) r.applied = await applyActions(env, r.do, { phone: u.searchParams.get("phone") || "", callId: "test", isAdmin: r.isAdmin });
      } catch (e) {
        r = { error: String(e.message || e) };
      }
      force = "";
      return Response.json({ ...r, ms: Date.now() - t0, trace: aiTrace });
    }
    if (parts[0] === "promo") {
      used = 0;
      const n = await releasePromo(env, parts[1]);
      ctx.waitUntil(processFlags(env));
      return Response.json({ flagged: n });
    }
    if (parts[0] === "hear") {
      aiTrace = [];
      force = u.searchParams.get("force") || "";
      const t0 = Date.now();
      let r;
      try {
        const audio = await ym(env, "DownloadFile", { path: "ivr2:" + u.searchParams.get("f") });
        r = await answerWithCheck(env, { audio }, []);
      } catch (e) {
        r = { error: String(e.message || e) };
      }
      force = "";
      return Response.json({ ...r, ms: Date.now() - t0, trace: aiTrace });
    }
    if (parts[0] === "prof") {
      aiTrace = [];
      used = 0;
      let n, err;
      try {
        n = await buildProfiles(env, 1);
      } catch (e) {
        err = String(e.message || e);
      }
      const p = await kvGet(env, "profiles", {});
      return Response.json({ n, err, trace: aiTrace, count: Object.keys(p).length, sample: Object.values(p).slice(-1) });
    }
    if (parts[0] === "cls") {
      aiTrace = [];
      used = 0;
      let r;
      try {
        r = await classify(env, await ym(env, "DownloadFile", { path: "ivr2:" + u.searchParams.get("f") }));
      } catch (e) {
        r = { error: String(e.message || e) };
      }
      return Response.json({ ...r, trace: aiTrace });
    }
    if (parts[0] === "cronnow") {
      aiTrace = [];
      const t0 = Date.now();
      let err = null;
      try {
        await cron(env);
      } catch (e) {
        err = String(e.stack || e);
      }
      return Response.json({ err, used, ms: Date.now() - t0, trace: aiTrace, promo: await env.KV.get("promo"), lock: await env.KV.get("cronlock") });
    }
    if (parts[0] === "migrate") {
      const a = await kvGet(env, "archive", {});
      const keys = Object.keys(a).sort((x, y) => parseInt(y) - parseInt(x));
      keys.forEach((k, i) => {
        if (!a[k].s) a[k].s = i < 150 && realText(a[k].t) ? "g" : "w";
      });
      await env.KV.put("archive", JSON.stringify(a));
      await env.KV.put("promo", "hold");
      return Response.json({ total: keys.length, gemini: keys.filter((k) => a[k].s === "g").length });
    }
    if (parts[0] === "tb") {
      used = 0;
      try {
        const r = await transcribeBatch(env, 3);
        return Response.json({ r, used, err: await env.KV.get("lastErr") });
      } catch (e) {
        return new Response(String(e.stack || e));
      }
    }
    if (parts[0] === "status") {
      const a = await kvGet(env, "archive", {}), p = await kvGet(env, "profiles", {});
      const bySrc = {};
      for (const e of Object.values(a)) bySrc[e.s || "?"] = (bySrc[e.s || "?"] || 0) + 1;
      const pend = await kvGet(env, "aai_pending", {});
      return Response.json({ bySrc, pending: Object.keys(pend).length, transcribed: Object.keys(a).length, profiles: Object.keys(p).length, sample: Object.entries(a).slice(0, 2), prof: Object.values(p).slice(0, 2) });
    }
    if (parts[0] === "notify") {
      ctx.waitUntil((async () => {
        used = 0;
        await notify(env, parts[1]);
        await processFlags(env);
      })().catch((e) => log(env, "\u05E9\u05D2\u05D9\u05D0\u05D4 \u05D1\u05E6\u05D9\u05E0\u05EA\u05D5\u05E7: " + e.message)));
      return reply(`id_list_message=${await sayC(env, ctx, "\u05E0\u05E9\u05DC\u05D7 \u05E6\u05D9\u05E0\u05EA\u05D5\u05E7.")}&go_to_folder=/7/4`);
    }
    ctx.waitUntil(cron(env));
    return reply("ok");
  }
};
export {
  worker_default as default
};
//# sourceMappingURL=worker.js.map