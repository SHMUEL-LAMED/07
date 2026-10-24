// מפעל הקווים: בונה קו חכם חדש (Worker נפרד ב-Cloudflare) מתוך טוקן של מערכת בימות המשיח.
// רק לבעל הקו (אסימון בעלים). כל שלב מחזיר תצוגה מקדימה, ושום דבר לא נכתב בלי בקשה מפורשת.
//
// מה צריך בקו המקור (שימחס) כדי שהמפעל יעבוד:
//   CF_FACTORY_TOKEN – סוד: טוקן Cloudflare עם Workers Scripts:Edit, Workers KV Storage:Edit, Account Settings:Read
//   CF_ACCOUNT_ID    – משתנה: מזהה החשבון ב-Cloudflare
//   FACTORY_TEMPLATE – משתנה (לא חובה): שם ה-Worker שממנו מעתיקים את הקוד. ברירת מחדל: yemot-ai
//
// שלבים:
//   status  – האם המפעל מוגדר, ורשימת הקווים שנבנו
//   check   – בדיקת טוקן ימות (קריאה בלבד): פרטי המערכת ותיקיות הבסיס
//   create  – יצירת הקו: KV, העתקת הקוד, משתנים וסודות, cron, כתובת workers.dev. הקו נוצר במצב בדיקה (TEST_MODE=1)
//   ivr_plan  – תצוגה מקדימה: אילו קובצי ext.ini יועתקו מקו המקור לקו החדש, אחרי החלפת הכתובת ומפתח ההרצה
//   ivr_apply – כתיבת קובצי ה-ext.ini שנבחרו למערכת החדשה (עם גיבוי של מה שהיה שם קודם)
//   forget  – הסרת קו מהרשימה בלבד (לא מוחק שום דבר ב-Cloudflare או בימות)

const YM_API = "https://www.call2all.co.il/ym/api/";
const CF_API = "https://api.cloudflare.com/client/v4";
const REG = "factory_lines";
// סודות ומשתנים של קו המקור שמועתקים לקו החדש (מפתחות ה-AI והקול). רק אם קיימים
const COPY_SECRETS = ["GEMINI_KEY", "GEMINI_KEYS", "GROQ_KEY", "AAI_KEY", "ELEVEN_KEY", "ELEVEN_KEYS", "AZURE_TTS_KEY", "AZURE_TTS_REGION", "PROVIDERS", "SERPER_KEY", "TAVILY_KEY", "BRIDGE_KEY"];
const COPY_VARS = ["GROQ_MODELS", "GOOGLE_CLIENT_ID"];
const MAX_DIRS = 200, MAX_DEPTH = 5;
// בשרת החינמי יש מגבלה של 50 פניות החוצה לכל הרצה. משאירים מרווח לבדיקת הטוקן, ל-KV וליומן
const BUDGET = 40;
const budget = () => ({ left: BUDGET, take(n = 1) { if (this.left < n) return false; this.left -= n; return true; } });
const sha = async t => [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(t)))].map(b => b.toString(16).padStart(2, "0")).join("");
// הטוקן של קו המקור עצמו אסור במפעל (כדי לא לבנות קו נוסף על אותה מערכת ולא לכתוב לשלוחות של המקור)
function notSource(env, token, D, phone) {
  if (env.YM_TOKEN && token === String(env.YM_TOKEN).trim()) throw new Error("זה הטוקן של הקו הזה עצמו – צריך טוקן של המערכת החדשה");
  if (phone && D && phone === D.LINE_PHONE) throw new Error("זה המספר של הקו הזה עצמו – צריך מערכת אחרת");
}

const rnd = n => { const b = crypto.getRandomValues(new Uint8Array(n)); return btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); };
const digits = v => String(v || "").replace(/\D/g, "");
const okPhone = p => /^0\d{8,9}$/.test(p);
const slugOk = s => /^[a-z0-9][a-z0-9-]{1,18}[a-z0-9]$/.test(s);
export const scriptName = slug => "yemot-line-" + slug;

// ---------- ימות המשיח עם טוקן של מערכת אחרת ----------
async function ymT(token, method, params = {}) {
  if (method === "UploadTextFile") {
    const r = await fetch(YM_API + method, { method: "POST", body: new URLSearchParams({ token, ...params }) });
    return r.json();
  }
  const u = new URL(YM_API + method);
  u.searchParams.set("token", token);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  return (await fetch(u)).json();
}
const ymOk = r => r && (r.responseStatus === "OK" || r.responseStatus === "ok");

// ---------- Cloudflare ----------
function cfReady(env) { return !!(env.CF_FACTORY_TOKEN && env.CF_ACCOUNT_ID); }
async function cf(env, method, path, body, raw = false) {
  const init = { method, headers: { Authorization: "Bearer " + env.CF_FACTORY_TOKEN } };
  if (body instanceof FormData) init.body = body;
  else if (body !== undefined) { init.body = JSON.stringify(body); init.headers["Content-Type"] = "application/json"; }
  const r = await fetch(CF_API + path.replace("{acc}", "accounts/" + env.CF_ACCOUNT_ID), init);
  if (raw) return r;
  const j = await r.json().catch(() => ({}));
  if (!j.success) throw new Error("Cloudflare: " + ((j.errors || []).map(e => e.message).join("; ") || "שגיאה " + r.status));
  return j.result;
}

// קוד קו המקור: כל המודולים (worker.js + דף הניהול) כפי שהם רצים עכשיו
async function templateModules(env) {
  const tpl = env.FACTORY_TEMPLATE || "yemot-ai";
  const r = await cf(env, "GET", `/{acc}/workers/scripts/${tpl}/content/v2`, undefined, true);
  if (!r.ok) throw new Error(`לא ניתן לקרוא את הקוד של ${tpl} (${r.status})`);
  const ct = r.headers.get("content-type") || "";
  if (!ct.includes("multipart")) return { main: "worker.js", parts: [{ name: "worker.js", type: "application/javascript+module", data: await r.arrayBuffer() }] };
  const form = await new Response(await r.arrayBuffer(), { headers: { "content-type": ct } }).formData();
  const parts = [];
  for (const [name, v] of form.entries()) {
    if (typeof v === "string") continue;
    const js = /\.m?js$/.test(name);
    parts.push({ name, type: js ? "application/javascript+module" : name.endsWith(".wasm") ? "application/wasm" : "text/plain", data: await v.arrayBuffer() });
  }
  const main = (r.headers.get("cf-entrypoint")) || (parts.find(p => p.name === "worker.js") || parts.find(p => p.type.includes("javascript")) || {}).name;
  if (!main) throw new Error("לא נמצא מודול ראשי בקוד המקור");
  return { main, parts };
}

const loadReg = async env => { try { return (await env.KV.get(REG, "json")) || []; } catch { return []; } };
const saveReg = (env, list) => env.KV.put(REG, JSON.stringify(list));
const view = l => ({ slug: l.slug, script: l.script, url: l.url, name: l.name, line: l.line, owner: l.owner, created: l.created, ivr: l.ivr || null, test: l.test !== false });

// ---------- בדיקת טוקן ----------
async function checkToken(token) {
  token = String(token || "").trim();
  if (!token || token.length < 6 || /\s/.test(token)) throw new Error("טוקן לא תקין");
  const s = await ymT(token, "GetSession").catch(() => null);
  if (!ymOk(s)) throw new Error("ימות המשיח לא אישרו את הטוקן" + (s && s.message ? `: ${s.message}` : ""));
  const root = await ymT(token, "GetIVR2Dir", { path: "ivr2:/" }).catch(() => ({}));
  const pick = {};
  for (const k of ["name", "username", "customerName", "phone", "mainDid", "did", "units", "email", "organization", "contactName"]) if (s[k] != null && typeof s[k] !== "object") pick[k] = String(s[k]);
  const guess = digits(pick.mainDid || pick.did || pick.phone || pick.username || token.split(":")[0]);
  return {
    session: pick,
    linePhone: okPhone(guess) ? guess : "",
    folders: (root.dirs || []).map(d => String(d.name || d.what || "").replace(/^ivr2:\/?/, "")).filter(Boolean).slice(0, 60),
    files: (root.files || []).length,
  };
}

// ---------- יצירת קו ----------
async function createLine(env, body, origin, D) {
  if (!cfReady(env)) throw new Error("המפעל לא מוגדר: חסרים CF_FACTORY_TOKEN / CF_ACCOUNT_ID בקו המקור");
  const slug = String(body.slug || "").trim().toLowerCase();
  if (!slugOk(slug)) throw new Error("שם קצר לא תקין: 3–20 אותיות באנגלית קטנות, ספרות ומקף");
  const token = String(body.ymToken || "").trim();
  const info = await checkToken(token);
  const linePhone = digits(body.linePhone) || info.linePhone;
  if (!okPhone(linePhone)) throw new Error("מספר הקו לא תקין");
  notSource(env, token, D, linePhone);
  const ownerPhone = digits(body.ownerPhone);
  if (ownerPhone && !okPhone(ownerPhone)) throw new Error("מספר הטלפון של בעל הקו לא תקין");
  const ownerEmail = String(body.ownerEmail || env.OWNER_EMAIL || "").trim().toLowerCase();
  const name = String(body.name || "").trim().slice(0, 40) || "קו " + linePhone;
  const script = scriptName(slug), reg = await loadReg(env);
  if (reg.some(l => l.slug === slug)) throw new Error("כבר קיים קו בשם הזה");
  const tokHash = await sha(token), twin = reg.find(l => l.tokHash === tokHash || l.line === linePhone);
  if (twin) throw new Error(`על המערכת הזו כבר נבנה הקו "${twin.name}" (${twin.slug})`);
  const exists = await cf(env, "GET", `/{acc}/workers/scripts/${script}/settings`, undefined, true);
  if (exists.status !== 404) throw new Error(`כבר קיים Worker בשם ${script} ב-Cloudflare`);

  const steps = [], created = { kv: null, script: false };
  const step = t => steps.push(t);
  try {
    const tpl = await templateModules(env); step(`הקוד הועתק מ-${env.FACTORY_TEMPLATE || "yemot-ai"} (${tpl.parts.length} קבצים)`);
    const kv = await cf(env, "POST", "/{acc}/storage/kv/namespaces", { title: script }); created.kv = kv.id; step("נוצר אחסון KV");
    const adminPass = rnd(12), runKey = rnd(18);
    const bindings = [
      { type: "kv_namespace", name: "KV", namespace_id: kv.id },
      { type: "ai", name: "AI" },
      { type: "plain_text", name: "LINE_PHONE", text: linePhone },
      { type: "plain_text", name: "LINE_NAME", text: name },
      { type: "plain_text", name: "TEST_MODE", text: "1" },
      { type: "secret_text", name: "YM_TOKEN", text: token },
      { type: "secret_text", name: "ADMIN_PASS", text: adminPass },
      { type: "secret_text", name: "RUN_KEY", text: runKey },
    ];
    if (ownerPhone) bindings.push({ type: "plain_text", name: "OWNER_PHONE", text: ownerPhone });
    if (ownerEmail) bindings.push({ type: "secret_text", name: "OWNER_EMAIL", text: ownerEmail });
    for (const k of COPY_SECRETS) if (env[k]) bindings.push({ type: "secret_text", name: k, text: String(env[k]) });
    for (const k of COPY_VARS) if (env[k]) bindings.push({ type: "plain_text", name: k, text: String(env[k]) });
    const form = new FormData();
    form.append("metadata", new Blob([JSON.stringify({ main_module: tpl.main, compatibility_date: "2025-09-01", bindings })], { type: "application/json" }));
    for (const p of tpl.parts) form.append(p.name, new Blob([p.data], { type: p.type }), p.name);
    await cf(env, "PUT", `/{acc}/workers/scripts/${script}`, form); created.script = true; step("השרת החדש הועלה עם המשתנים והסודות");
    await cf(env, "PUT", `/{acc}/workers/scripts/${script}/schedules`, [{ cron: "*/1 * * * *" }]); step("הוגדר תזמון כל דקה");
    await cf(env, "POST", `/{acc}/workers/scripts/${script}/subdomain`, { enabled: true, previews_enabled: false }); step("הופעלה כתובת workers.dev");
    const sub = (await cf(env, "GET", "/{acc}/workers/subdomain")).subdomain;
    const url = `https://${script}.${sub}.workers.dev`;
    const line = { slug, script, url, name, line: linePhone, owner: ownerPhone, ownerEmail, created: Date.now(), runKey, tokHash, kv: kv.id, template: origin, test: true };
    await saveReg(env, [...reg, line]);
    await D.log(env, `מפעל הקווים: נבנה קו חדש "${name}" (${linePhone}) – ${script}`).catch(() => {});
    return { ok: true, steps, line: view(line), adminPass, adminUrl: url + "/admin", note: "הסיסמה מוצגת פעם אחת. הקו נוצר במצב בדיקה (TEST_MODE=1): צינתוקים יוצאים רק למנהלים עד שתשנו ל-0." };
  } catch (e) {
    // ביטול חלקי: מוחקים רק מה שנוצר בהרצה הזאת
    if (created.script) await cf(env, "DELETE", `/{acc}/workers/scripts/${script}?force=true`).catch(() => {});
    if (created.kv) await cf(env, "DELETE", `/{acc}/storage/kv/namespaces/${created.kv}`).catch(() => {});
    throw new Error(`${e.message} (בוטל: ${steps.length ? steps.join(" ← ") : "לא נוצר כלום"})`);
  }
}

// ---------- העתקת מבנה השלוחות (ext.ini) ----------
const iniPath = path => "ivr2:" + (path === "/" ? "" : path) + "/ext.ini";
// קריאת ext.ini: { ok, text } כשנקרא (ריק = אין קובץ), או { ok:false } כשלא ידוע מה יש שם
const NOT_FOUND = /not.?found|לא נמצא|לא קיים|אינו קיים|does not exist|no such/i;
// כשהקריאה נכשלת: בודקים ברשימת התיקייה (dirCall, אם יש תקציב) אם יש בה ext.ini. אין קובץ או אין תיקייה = ריק
async function readIni(call, dirCall) {
  const r = await call().catch(() => null);
  if (ymOk(r) || r && typeof r.contents === "string") return { ok: true, text: typeof r.contents === "string" ? r.contents : "" };
  if (r && NOT_FOUND.test(String(r.message || ""))) return { ok: true, text: "" };
  const d = dirCall ? await dirCall().catch(() => null) : null;
  if (d && (ymOk(d) || Array.isArray(d.files))) {
    const has = (d.files || []).some(f => /(^|\/)ext\.ini$/i.test(String(f.name || f.what || "")));
    return has ? { ok: false, text: "" } : { ok: true, text: "" };
  }
  if (d && NOT_FOUND.test(String(d.message || ""))) return { ok: true, text: "" };
  return { ok: false, text: "" };
}
const dirOf = path => "ivr2:" + path;
async function templateTree(env, D, bud) {
  const out = [], queue = [["/", 0]], seen = new Set();
  let cut = false;
  while (queue.length && out.length < MAX_DIRS) {
    if (!bud.take(2)) { cut = true; break; }
    const [path, depth] = queue.shift();
    if (seen.has(path)) continue; seen.add(path);
    const d = await D.ym(env, "GetIVR2Dir", { path: "ivr2:" + path }).catch(() => null);
    if (!d || !Array.isArray(d.dirs) && !ymOk(d)) { cut = true; continue; } // לא ידוע מה יש מתחת – לא להעמיד פנים שהעץ שלם
    const ini = await readIni(() => D.ym(env, "GetTextFile", { what: iniPath(path) }));
    if (!ini.ok) cut = true;
    else if (ini.text.trim()) out.push({ path, contents: ini.text });
    if (depth >= MAX_DEPTH) continue;
    for (const s of d.dirs || []) {
      const n = String(s.name || s.what || "").replace(/^ivr2:/, "").split("/").filter(Boolean).pop();
      if (!n || /^(personalMessages|Log|ApiLog|Sounds?|\.)/i.test(n)) continue;
      queue.push([(path === "/" ? "" : path) + "/" + n, depth + 1]);
    }
  }
  return { files: out, truncated: cut || queue.length > 0 };
}
function rewriteIni(text, from, to) {
  let t = text;
  if (from.host && to.host) t = t.split(from.host).join(to.host);
  if (from.runKey && to.runKey) t = t.split(from.runKey).join(to.runKey);
  return t;
}
// הטוקן חייב להיות של המערכת שהקו נבנה עליה (נשמרה טביעת SHA-256 שלו ביצירה), ולא של קו המקור
async function lineToken(env, body, D) {
  const reg = await loadReg(env), line = reg.find(l => l.slug === body.slug);
  if (!line) throw new Error("הקו לא נמצא ברשימה");
  const token = String(body.ymToken || "").trim();
  notSource(env, token, D);
  const info = await checkToken(token);
  if (line.tokHash ? (await sha(token)) !== line.tokHash : info.linePhone !== line.line)
    throw new Error(`הטוקן הזה לא שייך לקו "${line.name}" (${line.line}). צריך את הטוקן של המערכת שהקו נבנה עליה`);
  return { reg, line, token };
}
async function ivrPlan(env, body, origin, D) {
  const { line, token } = await lineToken(env, body, D);
  const bud = budget();
  const { files, truncated: treeCut } = await templateTree(env, D, bud);
  const from = { host: new URL(origin).host, runKey: env.RUN_KEY || "" }, to = { host: new URL(line.url).host, runKey: line.runKey };
  const flagPhones = [D.LINE_PHONE, D.OWNER].filter(Boolean);
  const plan = [];
  let truncated = treeCut;
  for (const f of files) {
    const after = rewriteIni(f.contents, from, to);
    const base = { path: f.path, after, api: /api_link|type\s*=\s*api/i.test(after), warn: flagPhones.filter(p => after.includes(p)).map(p => `מכיל את המספר ${p} של קו המקור`) };
    if (!bud.take()) { truncated = true; plan.push({ ...base, before: "", unknown: true, same: false }); continue; }
    const cur = await readIni(() => ymT(token, "GetTextFile", { what: iniPath(f.path) }), () => bud.take() ? ymT(token, "GetIVR2Dir", { path: dirOf(f.path) }) : null);
    plan.push({ ...base, before: cur.text, unknown: !cur.ok, same: cur.ok && cur.text.trim() === after.trim() });
  }
  return { slug: line.slug, url: line.url, count: plan.length, truncated, plan };
}
// כתיבה: רק לשלוחות שנבחרו. קוראים מחדש את המקור ואת היעד של כל אחת (בלי לסרוק את כל העץ),
// לא כותבים על קובץ שלא הצלחנו לקרוא, ושומרים גיבוי של מה שהיה לפני כל כתיבה
async function ivrApply(env, body, origin, D) {
  const { reg, line, token } = await lineToken(env, body, D);
  if (String(body.confirm || "") !== line.slug) throw new Error("לאישור הכתיבה יש להקליד את השם הקצר של הקו");
  const want = [...new Set((body.paths || []).map(String))].filter(p => /^\/[\w\/.-]*$/.test(p) && !p.includes(".."));
  if (!want.length) throw new Error("לא נבחרו שלוחות");
  const from = { host: new URL(origin).host, runKey: env.RUN_KEY || "" }, to = { host: new URL(line.url).host, runKey: line.runKey };
  const bud = budget(), ready = [], failed = [], skipped = [];
  for (const path of want) {
    if (!bud.take(3)) { skipped.push(path); continue; }
    const src = await readIni(() => D.ym(env, "GetTextFile", { what: iniPath(path) }));
    if (!src.ok || !src.text.trim()) { failed.push(`${path}: לא נקרא מקו המקור`); continue; }
    const after = rewriteIni(src.text, from, to);
    const cur = await readIni(() => ymT(token, "GetTextFile", { what: iniPath(path) }), () => bud.take() ? ymT(token, "GetIVR2Dir", { path: dirOf(path) }) : null);
    if (!cur.ok) { failed.push(`${path}: לא ניתן לקרוא את הקיים – לא נכתב`); continue; }
    if (cur.text.trim() !== after.trim()) ready.push({ path, after, before: cur.text });
  }
  const backup = { at: Date.now(), files: ready.map(p => ({ path: p.path, before: p.before })) };
  if (ready.length) await env.KV.put(`factory_backup:${line.slug}:${backup.at}`, JSON.stringify(backup), { expirationTtl: 90 * 86400 });
  const done = [];
  for (const p of ready) {
    const r = await ymT(token, "UploadTextFile", { what: iniPath(p.path), contents: p.after }).catch(e => ({ message: e.message }));
    if (ymOk(r)) done.push(p.path); else failed.push(`${p.path}: ${r && r.message || "שגיאה"}`);
  }
  line.ivr = { at: Date.now(), written: (line.ivr && line.ivr.written || 0) + done.length, backup: ready.length ? backup.at : (line.ivr && line.ivr.backup) || null };
  await saveReg(env, reg);
  await D.log(env, `מפעל הקווים: נכתבו ${done.length} קובצי שלוחות לקו "${line.name}"${failed.length ? ` (${failed.length} נכשלו)` : ""}${skipped.length ? ` (${skipped.length} ממתינים לסבב נוסף)` : ""}`).catch(() => {});
  return { ok: !failed.length && !skipped.length, done, failed, skipped, backup: ready.length ? backup.at : null };
}

// ---------- נקודת הכניסה מ-dash.js ----------
export async function factory(req, env, body, D, origin) {
  const op = req.method === "POST" ? String(body.op || "") : "status";
  if (op === "status") {
    const reg = await loadReg(env);
    return { ready: cfReady(env), template: env.FACTORY_TEMPLATE || "yemot-ai", copies: COPY_SECRETS.filter(k => env[k]).length, lines: reg.map(view) };
  }
  if (op === "check") return await checkToken(body.ymToken);
  if (op === "create") return await createLine(env, body, origin, D);
  if (op === "ivr_plan") return await ivrPlan(env, body, origin, D);
  if (op === "ivr_apply") return await ivrApply(env, body, origin, D);
  if (op === "forget") {
    const reg = await loadReg(env), l = reg.find(x => x.slug === body.slug);
    if (!l) throw new Error("הקו לא נמצא");
    if (String(body.confirm || "") !== l.slug) throw new Error("להסרה מהרשימה יש להקליד את השם הקצר");
    await saveReg(env, reg.filter(x => x.slug !== l.slug));
    await D.log(env, `מפעל הקווים: הקו "${l.name}" הוסר מהרשימה (ה-Worker עצמו לא נמחק)`).catch(() => {});
    return { ok: true };
  }
  throw new Error("פעולה לא מוכרת");
}
