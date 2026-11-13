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
// מספרי הקווים הוותיקים שלא נבנו במפעל (דעת תורה) – אסור לבנות עליהם קו נוסף
const LEGACY_PHONES = ["0794947582"];
function notSource(env, token, D, phone) {
  if (env.YM_TOKEN && token === String(env.YM_TOKEN).trim()) throw new Error("זה הטוקן של הקו הזה עצמו – צריך טוקן של המערכת החדשה");
  if (phone && D && phone === D.LINE_PHONE) throw new Error("זה המספר של הקו הזה עצמו – צריך מערכת אחרת");
  if (phone && LEGACY_PHONES.includes(phone)) throw new Error("זה המספר של קו דעת תורה – צריך מערכת אחרת");
}

const rnd = n => { const b = crypto.getRandomValues(new Uint8Array(n)); return btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); };
const digits = v => String(v || "").replace(/\D/g, "");
const okPhone = p => /^0\d{8,9}$/.test(p);
// שמות שתפוסים בידי הקווים הוותיקים ובכתובות האתר
const RESERVED_SLUGS = ["shimchas", "daat", "daattorah", "source", "line", "portal", "both"];
const slugOk = s => /^[a-z0-9][a-z0-9-]{1,18}[a-z0-9]$/.test(s) && !RESERVED_SLUGS.includes(s);
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
// הודעה ברורה כש-Cloudflare דוחה את הטוקן של המפעל (401) או כשחסרה לו הרשאה (403)
function cfAuthMsg(status) {
  if (status === 401) return "Cloudflare דחה את הטוקן של המפעל (CF_FACTORY_TOKEN): הוא לא תקין, בוטל או שפג תוקפו. צריך ליצור טוקן חדש ולעדכן את הסוד בקו המקור";
  if (status === 403) return "לטוקן של המפעל (CF_FACTORY_TOKEN) חסרה הרשאה, או שהוא שייך לחשבון אחר מ-CF_ACCOUNT_ID. דרושות: Workers Scripts:Edit, Workers KV Storage:Edit, Account Settings:Read";
  return "";
}
// בדיקה שהטוקן של המפעל עובד (קריאה בלבד): { ok } או { ok:false, status, msg }
async function cfAuth(env) {
  if (!cfReady(env)) return { ok: false, status: 0, msg: "חסרים CF_FACTORY_TOKEN / CF_ACCOUNT_ID בקו המקור" };
  const r = await cf(env, "GET", "/{acc}/workers/subdomain", undefined, true).catch(() => null);
  if (!r) return { ok: false, status: 0, msg: "אין חיבור ל-Cloudflare כרגע" };
  if (r.ok) return { ok: true };
  return { ok: false, status: r.status, msg: cfAuthMsg(r.status) || `Cloudflare החזיר שגיאה ${r.status}` };
}
async function cf(env, method, path, body, raw = false, rawBody) {
  const init = { method, headers: { Authorization: "Bearer " + env.CF_FACTORY_TOKEN } };
  if (rawBody !== undefined) { init.body = rawBody; init.headers["Content-Type"] = "text/plain"; }
  if (body instanceof FormData) init.body = body;
  else if (body !== undefined) { init.body = JSON.stringify(body); init.headers["Content-Type"] = "application/json"; }
  const r = await fetch(CF_API + path.replace("{acc}", "accounts/" + env.CF_ACCOUNT_ID), init);
  if (raw) return r;
  if (r.status === 401 || r.status === 403) throw new Error(cfAuthMsg(r.status));
  const j = await r.json().catch(() => ({}));
  if (!j.success) throw new Error("Cloudflare: " + ((j.errors || []).map(e => e.message).join("; ") || "שגיאה " + r.status));
  return j.result;
}

// קוד קו המקור: כל המודולים (worker.js + דף הניהול) כפי שהם רצים עכשיו
async function templateModules(env) {
  const tpl = env.FACTORY_TEMPLATE || "yemot-ai";
  const r = await cf(env, "GET", `/{acc}/workers/scripts/${tpl}/content/v2`, undefined, true);
  if (!r.ok) throw new Error(cfAuthMsg(r.status) || `לא ניתן לקרוא את הקוד של ${tpl} (${r.status})`);
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

// KV של קו אחר (לפי מזהה) דרך ה-API של Cloudflare
const CRON = "*/1 * * * *";
export async function kvGetRemote(env, id, key) {
  const r = await cf(env, "GET", `/{acc}/storage/kv/namespaces/${id}/values/${encodeURIComponent(key)}`, undefined, true);
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`Cloudflare KV (${r.status})`);
  return r.text();
}
export async function kvPut(env, id, key, value, opts) {
  const ttl = opts && opts.expirationTtl ? "?expiration_ttl=" + Math.max(60, Math.floor(opts.expirationTtl)) : "";
  const r = await cf(env, "PUT", `/{acc}/storage/kv/namespaces/${id}/values/${encodeURIComponent(key)}${ttl}`, undefined, true, value);
  if (!r.ok) throw new Error(`לא ניתן לכתוב ל-KV של הקו (${r.status})`);
}
// השהיה ושחזור של קו: הסוד SUSPENDED=1 (השרת עונה "הקו מושהה" ולא מריץ משימות) + ביטול התזמון.
// הקוד, ההגדרות והנתונים נשמרים. רק לקווים שנבנו במפעל
export async function setSuspended(env, slug, on, log) {
  if (!cfReady(env)) throw new Error("המפעל לא מוגדר: חסרים CF_FACTORY_TOKEN / CF_ACCOUNT_ID");
  const line = (await loadReg(env)).find(l => l.slug === slug);
  if (!line) throw new Error("הקו לא נמצא ברשימה");
  const mark = () => patchReg(env, slug, l => { l.enabled = !on; l.suspendedAt = on ? Date.now() : null; });
  let warning;
  if (on) {
    await cf(env, "PUT", `/{acc}/workers/scripts/${line.script}/secrets`, { name: "SUSPENDED", text: "1", type: "secret_text" });
    // מכאן הקו כבר מושהה (לא עונה ולא מריץ משימות) – הרשימה מתעדכנת מיד, גם אם ביטול התזמון ייכשל
    await mark();
    try { await cf(env, "PUT", `/{acc}/workers/scripts/${line.script}/schedules`, []); }
    catch (e) { warning = "הקו הושהה, אבל ביטול התזמון נכשל (" + e.message + "). הקו המושהה לא מריץ משימות בכל מקרה"; }
  } else {
    const r = await cf(env, "DELETE", `/{acc}/workers/scripts/${line.script}/secrets/SUSPENDED`, undefined, true);
    if (!r.ok && r.status !== 404) throw new Error(`לא ניתן להחזיר את הקו (${r.status})`);
    // נרשם כפעיל רק אחרי שגם התזמון חזר, כדי שאפשר יהיה ללחוץ שוב על "החזרה" אם הוא נכשל
    await cf(env, "PUT", `/{acc}/workers/scripts/${line.script}/schedules`, [{ cron: CRON }]);
    await mark();
  }
  if (log) await log(`מרכז הקווים: הקו "${line.name}" ${on ? "הושהה" : "הוחזר לפעולה"}${warning ? " – " + warning : ""}`).catch(() => {});
  return { ok: true, slug, enabled: !on, ...(warning ? { warning } : {}) };
}
const loadReg = async env => { try { return (await env.KV.get(REG, "json")) || []; } catch { return []; } };
const saveReg = (env, list) => env.KV.put(REG, JSON.stringify(list));
// עדכון רשומה אחת מתוך הרשימה העדכנית – לא מעותק שנקרא לפני פעולה ארוכה (שהייתה דורסת שינויים שנעשו בינתיים)
async function patchReg(env, slug, fn) {
  const reg = await loadReg(env), l = reg.find(x => x.slug === slug);
  if (!l) return null;
  fn(l); await saveReg(env, reg); return l;
}
const view = l => ({ slug: l.slug, script: l.script, url: l.url, name: l.name, line: l.line, owner: l.owner, manager: l.ownerEmail || "", created: l.created, ivr: l.ivr || null, test: l.test !== false, enabled: l.enabled !== false });

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
  if (!slugOk(slug)) throw new Error(RESERVED_SLUGS.includes(slug) ? "השם הקצר הזה שמור לקווים הוותיקים – צריך שם אחר" : "שם קצר לא תקין: 3–20 אותיות באנגלית קטנות, ספרות ומקף");
  const token = String(body.ymToken || "").trim();
  const info = await checkToken(token);
  const linePhone = digits(body.linePhone) || info.linePhone;
  if (!okPhone(linePhone)) throw new Error("מספר הקו לא תקין");
  // המספרים של המערכת: מה שהוקלד וגם מה שימות החזירו (המספר שהוקלד לבד לא מספיק כדי לזהות מערכת שכבר יש עליה קו)
  const phones = [...new Set([linePhone, info.linePhone, ...["mainDid", "did", "username"].map(k => digits(info.session[k]))].filter(okPhone))];
  for (const p of phones) notSource(env, token, D, p);
  const ownerPhone = digits(body.ownerPhone);
  if (ownerPhone && !okPhone(ownerPhone)) throw new Error("מספר הטלפון של בעל הקו לא תקין");
  // מנהל הקו (הלקוח): נכנס לדף הניהול של הקו ולמרכז הקווים, ויכול להוסיף מנהלים בעצמו.
  // בעל השירות (OWNER_EMAIL של קו המקור) הוא תמיד הבעלים של כל קו חדש
  const ownerEmail = String(body.ownerEmail || "").trim().toLowerCase();
  if (ownerEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ownerEmail)) throw new Error("מייל מנהל הקו לא תקין");
  const superEmail = String(env.OWNER_EMAIL || "").trim().toLowerCase();
  const name = String(body.name || "").trim().slice(0, 40) || "קו " + linePhone;
  const script = scriptName(slug), reg = await loadReg(env);
  if (reg.some(l => l.slug === slug)) throw new Error("כבר קיים קו בשם הזה");
  const tokHash = await sha(token);
  const twinOf = list => list.find(l => l.tokHash === tokHash || [l.line, ...(l.phones || [])].some(p => phones.includes(p)));
  const twin = twinOf(reg);
  if (twin) throw new Error(`על המערכת הזו כבר נבנה הקו "${twin.name}" (${twin.slug})`);
  const exists = await cf(env, "GET", `/{acc}/workers/scripts/${script}/settings`, undefined, true);
  if (exists.ok) throw new Error(`כבר קיים Worker בשם ${script} ב-Cloudflare`);
  if (exists.status !== 404) throw new Error(cfAuthMsg(exists.status) || `Cloudflare לא אישר את הבדיקה אם ${script} קיים (${exists.status})`);

  const steps = [], created = { kv: null, script: false };
  const step = t => steps.push(t);
  try {
    const tpl = await templateModules(env); step("הקוד של קו המקור הועתק");
    const kv = await cf(env, "POST", "/{acc}/storage/kv/namespaces", { title: script }); created.kv = kv.id; step("נוצר אחסון נתונים לקו");
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
    if (superEmail) bindings.push({ type: "secret_text", name: "OWNER_EMAIL", text: superEmail });
    for (const k of COPY_SECRETS) if (env[k]) bindings.push({ type: "secret_text", name: k, text: String(env[k]) });
    for (const k of COPY_VARS) if (env[k]) bindings.push({ type: "plain_text", name: k, text: String(env[k]) });
    const form = new FormData();
    form.append("metadata", new Blob([JSON.stringify({ main_module: tpl.main, compatibility_date: "2025-09-01", bindings })], { type: "application/json" }));
    for (const p of tpl.parts) form.append(p.name, new Blob([p.data], { type: p.type }), p.name);
    await cf(env, "PUT", `/{acc}/workers/scripts/${script}`, form); created.script = true; step("השרת החדש הועלה עם ההגדרות והמפתחות");
    if (ownerEmail && ownerEmail !== superEmail) { await kvPut(env, kv.id, "dash_emails", JSON.stringify([{ e: ownerEmail, role: "admin" }])); step(`${ownerEmail} נוסף כמנהל הקו`); }
    await cf(env, "PUT", `/{acc}/workers/scripts/${script}/schedules`, [{ cron: CRON }]); step("הופעלה בדיקה אוטומטית כל דקה");
    await cf(env, "POST", `/{acc}/workers/scripts/${script}/subdomain`, { enabled: true, previews_enabled: false }); step("הופעלה הכתובת של הקו");
    const sub = (await cf(env, "GET", "/{acc}/workers/subdomain")).subdomain;
    const url = `https://${script}.${sub}.workers.dev`;
    const line = { slug, script, url, name, line: linePhone, phones, owner: ownerPhone, ownerEmail, created: Date.now(), runKey, tokHash, kv: kv.id, template: origin, test: true };
    // הבנייה לוקחת זמן: קוראים שוב את הרשימה, בודקים שוב שלא נבנה בינתיים קו באותו שם או על אותה מערכת, ומוסיפים לרשימה העדכנית
    const cur = await loadReg(env), clash = cur.find(l => l.slug === slug) || twinOf(cur);
    if (clash) throw new Error(`בינתיים נבנה הקו "${clash.name}" (${clash.slug}) באותו שם או על אותה מערכת`);
    await saveReg(env, [...cur, line]);
    await D.log(env, `מפעל הקווים: נבנה קו חדש "${name}" (${linePhone}) – ${script}`).catch(() => {});
    return { ok: true, steps, line: view(line), adminPass, adminUrl: url + "/admin", note: "הסיסמה מוצגת פעם אחת. הקו נוצר במצב בדיקה: צינתוקים יוצאים רק למנהלים, עד שמעבירים אותו לפעולה רגילה." };
  } catch (e) {
    // ביטול חלקי: מוחקים רק מה שנוצר בהרצה הזאת
    if (created.script) await cf(env, "DELETE", `/{acc}/workers/scripts/${script}?force=true`).catch(() => {});
    if (created.kv) await cf(env, "DELETE", `/{acc}/storage/kv/namespaces/${created.kv}`).catch(() => {});
    throw new Error(`${e.message} (בוטל: ${steps.length ? steps.join(" ← ") : "לא נוצר כלום"})`);
  }
}

// ---------- העתקת מבנה השלוחות (ext.ini) ----------
// ---------- יומן ביטול: כל מה שנעשה במערכת של קו, כדי שבהסרה היא תחזור להיות כמו לפני החיבור ----------
// ini {path, before} · dir {path, maybe} · mv {from, to} · file {path}. בביטול עוברים מהסוף להתחלה
const undoKey = slug => "factory_undo:" + slug;
async function journal(env, slug, items) {
  if (!items.length) return;
  const cur = await env.KV.get(undoKey(slug), "json").catch(() => null) || [];
  cur.push(...items);
  await env.KV.put(undoKey(slug), JSON.stringify(cur));
}
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
// start: מאיפה להמשיך את הסריקה (תור שנשמר בסבב הקודם). שומרים פנייה לכל קובץ שנמצא, כדי שיהיה תקציב להשוות אותו ליעד.
// next: מה שנשאר לסרוק; deep: תיקיות עמוקות מ-MAX_DEPTH שלא נסרקו
async function templateTree(env, D, bud, start) {
  const out = [], dirs = [], queue = Array.isArray(start) && start.length ? start.slice() : [["/", 0]], seen = new Set(), deep = [];
  let cut = false;
  while (queue.length && out.length < MAX_DIRS) {
    if (bud.left < 2 + out.length || !bud.take(2)) break; // התקציב נגמר – ממשיכים בסבב הבא מ-next
    const [path, depth] = queue.shift();
    if (seen.has(path)) continue; seen.add(path);
    const d = await D.ym(env, "GetIVR2Dir", { path: "ivr2:" + path }).catch(() => null);
    if (!d || !Array.isArray(d.dirs) && !ymOk(d)) { cut = true; continue; } // לא ידוע מה יש מתחת – לא להעמיד פנים שהעץ שלם
    const ini = await readIni(() => D.ym(env, "GetTextFile", { what: iniPath(path) }));
    if (!ini.ok) cut = true;
    else if (ini.text.trim()) out.push({ path, contents: ini.text });
    else if (path !== "/") dirs.push(path); // תיקייה בלי הגדרות (למשל תיקיית אחסון) – נוצרת גם בקו החדש, ריקה
    for (const s of d.dirs || []) {
      const n = String(s.name || s.what || "").replace(/^ivr2:/, "").split("/").filter(Boolean).pop();
      // תיקיות אישיות (Phone – לפי מספרי טלפון) ויומנים לא נסרקים: הם תוכן, לא תבנית
      if (!n || /^(personalMessages|Log|ApiLog|Sounds?|Phone|\.)/i.test(n)) continue;
      const sub = (path === "/" ? "" : path) + "/" + n;
      if (depth >= MAX_DEPTH) deep.push(sub); else queue.push([sub, depth + 1]);
    }
  }
  // תיקיות עמוקות לא נחשבות "רק חלק": לחיצה נוספת לא תסרוק אותן (הן מסומנות כאזהרה בשורה של התיקייה שמעליהן)
  return { files: out, dirs, truncated: cut || queue.length > 0, next: queue, deep };
}
// המשך סריקת העץ בין לחיצות על "חיבור שלוחות": start – מאיפה הסבב הנוכחי התחיל, next – מאיפה הסבב הבא יתחיל.
// מתקדמים רק אחרי כתיבה שלמה (או כשאין בסבב מה לכתוב), כדי שלחיצה חוזרת אחרי "ממתינות" תציג את אותן שלוחות
const planKey = slug => "factory_plan:" + slug;
const cursorOk = q => Array.isArray(q) && q.length <= 20000 && q.every(x => Array.isArray(x) && typeof x[0] === "string" && x[0].startsWith("/") && !x[0].includes("..") && Number.isInteger(x[1]) && x[1] >= 0 && x[1] <= MAX_DEPTH);
async function planCursor(env, slug) {
  const c = await env.KV.get(planKey(slug), "json").catch(() => null);
  return c && typeof c === "object" ? { start: cursorOk(c.start) ? c.start : null, next: cursorOk(c.next) ? c.next : [] } : { start: null, next: [] };
}
async function savePlanCursor(env, slug, start, next) {
  if ((!start || !start.length) && (!next || !next.length)) return env.KV.delete(planKey(slug));
  return env.KV.put(planKey(slug), JSON.stringify({ start: start && start.length ? start : null, next: next || [] }), { expirationTtl: 7 * 86400 });
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
  const cur0 = body.restart === true ? { start: null, next: [] } : await planCursor(env, line.slug);
  const start = cursorOk(body.from) && body.from.length ? body.from : cur0.start;
  const { files, dirs, truncated: treeCut, next, deep } = await templateTree(env, D, bud, start);
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
  // תיקיות עמוקות מדי לא נסרקות – מסמנים בשורה של התיקייה שמעליהן (אם יש לה ext.ini)
  for (const p of deep) {
    // השורה של התיקייה הקרובה ביותר מעליה שיש לה ext.ini (ואם אין – השורה הראשונה), כדי שהאזהרה לא תיעלם
    let parent = p, row;
    while (!row && parent !== "/") { parent = parent.slice(0, parent.lastIndexOf("/")) || "/"; row = plan.find(x => x.path === parent); }
    row = row || plan[0];
    if (row) row.warn = [...row.warn, `תת-שלוחה עמוקה שלא נסרקה ולא תועתק: ${p}`];
  }
  // אין בסבב הזה מה לכתוב – מתקדמים מיד לסבב הבא (ובסוף העץ חוזרים להתחלה); אחרת מתקדמים רק אחרי הכתיבה
  if (plan.every(p => p.same)) await savePlanCursor(env, line.slug, next, []);
  else await savePlanCursor(env, line.slug, start, next);
  return { slug: line.slug, url: line.url, count: plan.length, truncated, plan, dirs, next, deep, resumed: !!(start && start.length) };
}
// כתיבה: רק לשלוחות שנבחרו. קוראים מחדש את המקור ואת היעד של כל אחת (בלי לסרוק את כל העץ),
// לא כותבים על קובץ שלא הצלחנו לקרוא, ושומרים גיבוי של מה שהיה לפני כל כתיבה
async function ivrApply(env, body, origin, D) {
  const { line, token } = await lineToken(env, body, D);
  if (String(body.confirm || "") !== line.slug) throw new Error("לאישור הכתיבה יש להקליד את השם הקצר של הקו");
  // אותם שמות תיקיות שהסריקה מציגה (כולל עברית ורווח). נתיב שנדחה מדווח ב-failed ולא נעלם בשקט
  const okPath = p => /^\/[\w\/.\- \u0590-\u05FF]*$/.test(p) && !p.includes("..") && !p.includes("//");
  const asked = [...new Set((Array.isArray(body.paths) ? body.paths : []).map(String))];
  const want = asked.filter(okPath), bad = asked.filter(p => !okPath(p));
  if (!want.length) throw new Error(bad.length ? "השלוחות שנבחרו לא נתמכות: " + bad.join(", ") : "לא נבחרו שלוחות");
  const from = { host: new URL(origin).host, runKey: env.RUN_KEY || "" }, to = { host: new URL(line.url).host, runKey: line.runKey };
  const bud = budget(), ready = [], failed = bad.map(p => `${p}: שם תיקייה לא נתמך – לא נכתב`), skipped = [];
  for (const path of want) {
    if (!bud.take(4)) { skipped.push(path); continue; }
    const src = await readIni(() => D.ym(env, "GetTextFile", { what: iniPath(path) }));
    if (!src.ok || !src.text.trim()) { failed.push(`${path}: לא נקרא מקו המקור`); continue; }
    const after = rewriteIni(src.text, from, to);
    const cur = await readIni(() => ymT(token, "GetTextFile", { what: iniPath(path) }), () => bud.take() ? ymT(token, "GetIVR2Dir", { path: dirOf(path) }) : null);
    if (!cur.ok) { failed.push(`${path}: לא ניתן לקרוא את הקיים – לא נכתב`); continue; }
    if (cur.text.trim() !== after.trim()) ready.push({ path, after, before: cur.text, fresh: !cur.text.trim() });
  }
  const backup = { at: Date.now(), files: ready.map(p => ({ path: p.path, before: p.before })) };
  if (ready.length) await env.KV.put(`factory_backup:${line.slug}:${backup.at}`, JSON.stringify(backup), { expirationTtl: 90 * 86400 });
  const done = [], undo = [];
  for (const p of ready) {
    // שלוחה חדשה: קודם יוצרים את התיקייה (כתיבת ext.ini לתיקייה שלא קיימת עלולה להיכשל)
    if (p.fresh && p.path !== "/") await ymT(token, "UpdateExtension", { path: dirOf(p.path) }).catch(() => null);
    const r = await ymT(token, "UploadTextFile", { what: iniPath(p.path), contents: p.after }).catch(e => ({ message: e.message }));
    if (ymOk(r)) { done.push(p.path); undo.push(...(p.fresh && p.path !== "/" ? [{ t: "dir", path: p.path, maybe: true }] : []), { t: "ini", path: p.path, before: p.before || "" }); }
    else failed.push(`${p.path}: ${r && r.message || "שגיאה"}`);
  }
  await journal(env, line.slug, undo);
  // הסבב נכתב במלואו – לחיצה הבאה על "חיבור שלוחות" ממשיכה מהמקום שבו הסריקה נעצרה (ובסוף העץ חוזרת להתחלה)
  if (!skipped.length) { const c = await planCursor(env, line.slug); await savePlanCursor(env, line.slug, c.next, []); }
  await patchReg(env, line.slug, l => { l.ivr = { at: Date.now(), written: (l.ivr && l.ivr.written || 0) + done.length, backup: ready.length ? backup.at : (l.ivr && l.ivr.backup) || null }; });
  await D.log(env, `מפעל הקווים: נכתבו ${done.length} קובצי שלוחות לקו "${line.name}"${failed.length ? ` (${failed.length} נכשלו)` : ""}${skipped.length ? ` (${skipped.length} ממתינים לסבב נוסף)` : ""}`).catch(() => {});
  return { ok: !failed.length && !skipped.length, done, failed, skipped, backup: ready.length ? backup.at : null };
}

// ---------- שמירת הודעות שכבר היו בקו החדש ----------
// לפני שהתבנית נכתבת, שלוחה 1 הופכת לתפריט (1/1 חשובות, 1/2 כל ההודעות). הודעות שהיו בה ישירות היו נעלמות מהשמיעה,
// ולכן מעבירים אותן לסוף 1/2 לפי הסדר (כל הקבצים של אותו מספר יחד – wav, txt...). שום קובץ לא נמחק
const MSG_FILE = /^(\d+)\.([\w-]+)$/;
async function dirFiles(token, path, bud) {
  const all = []; let ok = false;
  for (let from = 0; from < 10000; from += 1000) {
    if (!bud.take()) return { ok, files: all, cut: true };
    const d = await ymT(token, "GetIVR2Dir", from ? { path: dirOf(path), filesFrom: from } : { path: dirOf(path) }).catch(() => null);
    if (!d || !ymOk(d)) return { ok, files: all };
    ok = true;
    const f = (d.files || []).map(fileName);
    all.push(...f);
    if (f.length < 1000) break;
  }
  return { ok, files: all };
}
async function preserveStep(env, body, origin, D) {
  const { line, token } = await lineToken(env, body, D);
  const FROM = "/1", TO = "/1/2", bud = budget();
  const src = await dirFiles(token, FROM, bud);
  if (!src.ok) return { moved: 0, left: 0, failed: [] }; // אין שלוחה 1 – אין מה להעביר
  const groups = new Map();
  for (const n of src.files) { const m = n.match(MSG_FILE); if (m) (groups.get(m[1]) || groups.set(m[1], []).get(m[1])).push(n); }
  const nums = [...groups.keys()].sort((a, b) => +a - +b);
  if (!nums.length) return { moved: 0, left: 0, failed: [] };
  let dst = await dirFiles(token, TO, bud);
  if (dst.cut) return { moved: 0, left: nums.length, failed: [] };
  if (!dst.ok) {
    const r = await ymT(token, "UpdateExtension", { path: dirOf(TO) }).catch(e => ({ message: e.message })); bud.take();
    if (!ymOk(r)) return { moved: 0, left: nums.length, failed: [`${TO}: לא נוצרה – ההודעות נשארו בשלוחה 1`] };
    await ymT(token, "FileAction", { action: "delete", what: iniPath(TO) }).catch(() => null); bud.take();
    dst = { ok: true, files: [] };
    await journal(env, line.slug, [{ t: "dir", path: TO }]);
  }
  let next = dst.files.reduce((mx, n) => { const m = n.match(MSG_FILE); return m ? Math.max(mx, +m[1]) : mx; }, -1);
  const moved = [], failed = [], undo = [];
  for (const num of nums) {
    const fs = groups.get(num);
    if (!bud.take(fs.length)) break;
    const to = String(++next).padStart(3, "0");
    let ok = true;
    for (const n of fs) {
      const ext = n.slice(n.indexOf(".") + 1);
      const r = await ymT(token, "FileAction", { action: "move", what: `ivr2:${FROM}/${n}`, target: `ivr2:${TO}/${to}.${ext}` }).catch(e => ({ message: e.message }));
      if (!ymOk(r)) { ok = false; failed.push(`${FROM}/${n}: ${(r && r.message) || "לא הועבר"}`); }
      else undo.push({ t: "mv", from: `${FROM}/${n}`, to: `${TO}/${to}.${ext}` });
    }
    if (ok) moved.push(num);
  }
  await journal(env, line.slug, undo);
  const left = nums.length - moved.length - new Set(failed.map(f => (f.match(/\/(\d+)\./) || [])[1])).size;
  if (moved.length) await D.log(env, `מפעל הקווים: ${moved.length} הודעות שהיו בשלוחה 1 בקו "${line.name}" הועברו ל-${TO}`).catch(() => {});
  return { moved: moved.length, left: Math.max(0, left), failed };
}

// ---------- תיקיות שהשרת של הקו צריך (גם בלי הגדרות) ----------
// מהקוד של worker.js: חלוקת שלוחה 1 (1/1 חשובות, 1/2 כל ההודעות), תורי הבדיקה, ממתינות, מחוקות, בקשות הצטרפות,
// הקלטות שם, הודעות אישיות, דגלים והקול של העוזר. בלעדיהן הקו החדש לא יעבוד כמו קו המקור
const REQUIRED_DIRS = ["/0", "/1", "/1/1", "/1/2", "/2", "/3", "/4", "/5", "/7", "/8", "/8/voice", "/9",
  "/AIQueue", "/AIQueueGeneral", "/PendingApproval", "/PendingProblem", "/PendingGeneral", "/PendingError", "/PendingDemoted",
  "/DeletedByAdmin", "/JoinRequests", "/JoinRequestsDone", "/EnterIDRecord", "/personalMessages", "/personalMessages/Phone", "/FlagTemplate"];
async function structureStep(env, body, origin, D) {
  const { line, token } = await lineToken(env, body, D);
  const okPath = p => /^\/[\w\/.\- ֐-׿]+$/.test(p) && !p.includes("..") && !p.includes("//");
  const asked = (Array.isArray(body.paths) ? body.paths : []).map(String);
  const paths = [...new Set([...(body.required ? REQUIRED_DIRS : []), ...asked])].filter(okPath)
    .sort((a, b) => a.split("/").length - b.split("/").length).slice(0, 300); // הורים לפני ילדים
  const bud = budget(), made = [], failed = [], left = [];
  for (let i = 0; i < paths.length; i++) {
    const path = paths[i];
    if (!bud.take(3)) { left.push(...paths.slice(i)); break; }
    const d = await ymT(token, "GetIVR2Dir", { path: dirOf(path) }).catch(() => null);
    if (d && ymOk(d)) continue; // כבר קיימת
    const r = await ymT(token, "UpdateExtension", { path: dirOf(path) }).catch(e => ({ message: e.message }));
    if (!ymOk(r)) { failed.push(`${path}: ${(r && r.message) || "לא נוצרה"}`); continue; }
    // תיקייה בלי הגדרות במקור – גם בקו החדש בלי ext.ini (אחרת היא נשמעת כשלוחה)
    await ymT(token, "FileAction", { action: "delete", what: iniPath(path) }).catch(() => null);
    made.push(path);
  }
  await journal(env, line.slug, made.map(path => ({ t: "dir", path })));
  if (made.length) await D.log(env, `מפעל הקווים: נוצרו ${made.length} תיקיות בקו "${line.name}"`).catch(() => {});
  return { made, failed, left };
}

// ---------- קריינות: העתקת קבצי הפתיח של השלוחות + יצירה בקול העוזר למה שאין לו קריינות ----------
// קבצי פתיח וקריינות של שלוחה (M1000.wav וכד'). קבצים ממוספרים (000.wav...) הם תוכן – הודעות, השמעות – ולא מועתקים
const VOICE_FILE = /^(M\d{4}(-\d+)?|PlayfileMessageCheck[-\w]*)\.(wav|mp3|tts)$/i;
// קבצים ממוספרים שהם חלק מהתבנית ולא תוכן (הצליל של הדגלים מועתק לכל מספר שמסומן)
const TEMPLATE_FILES = { "/FlagTemplate": ["000.wav"] };
const fileName = f => String((f && (f.name || f.what)) || "").split("/").pop();
async function ymUploadT(token, path, bytes, name) {
  const fd = new FormData();
  fd.append("token", token); fd.append("path", "ivr2:" + path); fd.append("convertAudio", "1");
  fd.append("file", new Blob([bytes], { type: /\.mp3$/i.test(name) ? "audio/mpeg" : "audio/wav" }), name);
  const r = await fetch(YM_API + "UploadFile", { method: "POST", body: fd });
  return r.json().catch(() => ({}));
}
const iniVal = (ini, k) => { const m = String(ini || "").match(new RegExp("^\\s*" + k + "\\s*=\\s*(.*)$", "mi")); return m ? m[1].trim() : ""; };
// טקסט לפתיח בקול העוזר: כותרת השלוחה, ובתפריט – גם האפשרויות (לפי הכותרות של תתי השלוחות)
function voiceText(ini, dirs) {
  const title = iniVal(ini, "title").replace(/[()]/g, " ").replace(/\s+/g, " ").trim();
  const type = iniVal(ini, "type").toLowerCase();
  if (!title || type === "api") return "";
  if (type !== "menu") return title + ".";
  const opts = (dirs || []).map(d => ({ n: fileName(d), t: String(d.extTitle || d.title || "").replace(/[()]/g, " ").replace(/\s+/g, " ").trim() }))
    .filter(o => /^\d$/.test(o.n) && o.t).sort((a, b) => a.n - b.n).map(o => `ל${o.t} הקישו ${o.n}.`);
  return [title + ".", ...opts].join(" ");
}
async function audioStep(env, body, origin, D) {
  const { line, token } = await lineToken(env, body, D);
  const okPath = p => /^\/[\w\/.\- ֐-׿]*$/.test(p) && !p.includes("..") && !p.includes("//");
  const paths = [...new Set((Array.isArray(body.paths) ? body.paths : []).map(String))].filter(okPath).slice(0, 300);
  const bud = budget(), copied = [], failed = [], left = [], tts = [];
  for (let i = 0; i < paths.length; i++) {
    const path = paths[i];
    if (!bud.take(3)) { left.push(...paths.slice(i)); break; }
    const [src, dst] = await Promise.all([
      D.ym(env, "GetIVR2Dir", { path: dirOf(path) }).catch(() => null),
      ymT(token, "GetIVR2Dir", { path: dirOf(path) }).catch(() => null),
    ]);
    if (!src || !Array.isArray(src.files)) { failed.push(`${path}: לא נקרא מקו המקור`); continue; }
    const have = new Set(((dst && dst.files) || []).map(f => fileName(f).toLowerCase()));
    const voice = src.files.map(fileName).filter(n => VOICE_FILE.test(n) || (TEMPLATE_FILES[path] || []).includes(n));
    let cut = false;
    for (const n of voice.filter(n => !have.has(n.toLowerCase()))) {
      if (!bud.take(2)) { cut = true; break; }
      try {
        if (/\.tts$/i.test(n)) {
          const t = await D.ym(env, "GetTextFile", { what: "ivr2:" + path + "/" + n });
          const r = await ymT(token, "UploadTextFile", { what: "ivr2:" + path + "/" + n, contents: (t && t.contents) || "" });
          if (ymOk(r)) copied.push(path + "/" + n); else failed.push(`${path}/${n}: ${(r && r.message) || "שגיאה"}`);
        } else {
          const bytes = await D.ym(env, "DownloadFile", { path: "ivr2:" + path + "/" + n });
          const r = await ymUploadT(token, path, bytes, n);
          if (ymOk(r)) copied.push(path + "/" + n); else failed.push(`${path}/${n}: ${(r && r.message) || "שגיאה"}`);
        }
      } catch (e) { failed.push(`${path}/${n}: ${e.message}`); }
    }
    if (cut) { left.push(...paths.slice(i)); break; }
    // אין קריינות בכלל – לא במקור ולא בקו החדש: יוצרים פתיח בקול העוזר (רץ ברקע בשרת של הקו החדש)
    const hasVoice = voice.some(n => /^M1000\./i.test(n)) || [...have].some(n => /^m1000\./.test(n));
    if (!hasVoice) {
      const ini = await readIni(() => D.ym(env, "GetTextFile", { what: iniPath(path) }));
      const text = ini.ok ? voiceText(ini.text, src.dirs) : "";
      if (text) tts.push({ k: "tts", path: path === "/" ? "" : path, name: "M1000", text, id2: Date.now().toString(36) + Math.random().toString(36).slice(2, 8) });
    }
  }
  await journal(env, line.slug, [...copied.map(path => ({ t: "file", path })),
    ...tts.flatMap(t => ["wav", "tts"].map(e => ({ t: "file", path: `${t.path}/M1000.${e}` })))]);
  if (tts.length && line.kv) {
    const cur = JSON.parse(await kvGetRemote(env, line.kv, "bgjobs").catch(() => null) || "[]");
    const fresh = tts.filter(t => !cur.some(c => c && c.k === "tts" && c.path === t.path && c.name === t.name));
    if (fresh.length) await kvPut(env, line.kv, "bgjobs", JSON.stringify([...cur, ...fresh]));
  }
  if (copied.length || tts.length) await D.log(env, `מפעל הקווים: קריינות לקו "${line.name}" – הועתקו ${copied.length}, נוצרים בקול העוזר ${tts.length}`).catch(() => {});
  return { copied, failed, left, tts: tts.length };
}

// ---------- ביטול: החזרת המערכת של הקו למה שהייתה לפני החיבור ----------
// קווים שחוברו לפני שהיה יומן: משחזרים לפחות את ההגדרות מהגיבויים של חיבור השלוחות
async function undoFromBackups(env, slug) {
  const items = [];
  let cursor;
  do {
    const l = await env.KV.list({ prefix: `factory_backup:${slug}:`, cursor });
    for (const k of l.keys.sort((a, b) => +a.name.split(":").pop() - +b.name.split(":").pop())) {
      const b = await env.KV.get(k.name, "json").catch(() => null);
      for (const f of (b && b.files) || []) items.push({ t: "ini", path: f.path, before: f.before || "" });
    }
    cursor = l.list_complete ? null : l.cursor;
  } while (cursor);
  return items;
}
// תיקייה שנוצרה בחיבור נמחקת רק אם אין בה תוכן (רק הגדרות או קריינות שהעתקנו). אחרת היא נשארת – לא מוחקים הודעות
const removableFile = (n, path) => /^ext\.ini$/i.test(n) || VOICE_FILE.test(n) || (TEMPLATE_FILES[path] || []).includes(n);
async function restoreStep(env, body, origin, D) {
  const { line, token } = await lineToken(env, body, D);
  let j = await env.KV.get(undoKey(line.slug), "json").catch(() => null);
  const legacy = !j;
  if (!j) j = await undoFromBackups(env, line.slug);
  const bud = budget(), notes = [];
  let done = 0;
  const del = what => ymT(token, "FileAction", { action: "delete", what }).catch(e => ({ message: e.message }));
  while (j.length) {
    const it = j[j.length - 1];
    if (!bud.take(it.t === "dir" ? 2 : 1)) break;
    if (it.t === "file") await del("ivr2:" + it.path);
    else if (it.t === "ini") {
      const r = String(it.before || "").trim()
        ? await ymT(token, "UploadTextFile", { what: iniPath(it.path), contents: it.before }).catch(e => ({ message: e.message }))
        : await del(iniPath(it.path));
      if (String(it.before || "").trim() && !ymOk(r)) notes.push(`${it.path}: ההגדרות הקודמות לא הוחזרו (${(r && r.message) || "שגיאה"})`);
    } else if (it.t === "mv") {
      const r = await ymT(token, "FileAction", { action: "move", what: "ivr2:" + it.to, target: "ivr2:" + it.from }).catch(e => ({ message: e.message }));
      if (!ymOk(r)) notes.push(`${it.to}: לא הוחזר ל-${it.from} (${(r && r.message) || "שגיאה"})`);
    } else if (it.t === "dir") {
      const d = await ymT(token, "GetIVR2Dir", { path: dirOf(it.path) }).catch(() => null);
      if (d && ymOk(d)) {
        const extra = (d.files || []).map(fileName).filter(n => !removableFile(n, it.path));
        if (extra.length || (d.dirs || []).length) { if (!it.maybe) notes.push(`${it.path}: נשארה, כי יש בה תוכן שנוסף אחרי החיבור`); }
        else { const r = await del(dirOf(it.path)); if (!ymOk(r) && !it.maybe) notes.push(`${it.path}: לא נמחקה (${(r && r.message) || "שגיאה"})`); }
      }
    }
    j.pop(); done++;
  }
  if (j.length) await env.KV.put(undoKey(line.slug), JSON.stringify(j));
  else await env.KV.delete(undoKey(line.slug));
  if (done) await D.log(env, `מפעל הקווים: המערכת של "${line.name}" מוחזרת למה שהייתה לפני החיבור – ${done} פעולות בוטלו${j.length ? `, נשארו ${j.length}` : ""}`).catch(() => {});
  return { done, left: j.length, notes, legacy };
}

// ---------- נקודת הכניסה מ-dash.js ----------
export async function factory(req, env, body, D, origin) {
  const op = req.method === "POST" ? String(body.op || "") : "status";
  if (op === "status") {
    const reg = await loadReg(env);
    return { ready: cfReady(env), cf: cfReady(env) ? await cfAuth(env) : null, template: env.FACTORY_TEMPLATE || "yemot-ai", copies: COPY_SECRETS.filter(k => env[k]).length, lines: reg.map(view) };
  }
  if (op === "check") return await checkToken(body.ymToken);
  if (op === "create") return await createLine(env, body, origin, D);
  if (op === "ivr_plan") return await ivrPlan(env, body, origin, D);
  if (op === "ivr_apply") return await ivrApply(env, body, origin, D);
  if (op === "audio") return await audioStep(env, body, origin, D);
  if (op === "structure") return await structureStep(env, body, origin, D);
  if (op === "preserve") return await preserveStep(env, body, origin, D);
  if (op === "restore") return await restoreStep(env, body, origin, D);
  if (op === "suspend" || op === "resume") {
    const l = (await loadReg(env)).find(x => x.slug === body.slug);
    if (op === "suspend" && (!l || String(body.confirm || "") !== l.slug)) throw new Error("להשהיית הקו יש להקליד את השם הקצר");
    return await setSuspended(env, String(body.slug || ""), op === "suspend", m => D.log(env, m));
  }
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
