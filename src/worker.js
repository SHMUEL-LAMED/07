// שרת ה-AI של הקו: בדיקת הקלטות, צינתוקים והתראות אישיות למי שמתקשר חזרה
import { adminApp } from "./dash.js"; // דף הניהול (כניסה בסיסמה, API ל-JSON)
const YM = "https://www.call2all.co.il/ym/api/";
const QUEUES = { important: "/AIQueue", general: "/AIQueueGeneral" };
const IMPORTANT = "/1/1", ALL = "/1/2";
const P = { problem: "/PendingProblem", general: "/PendingGeneral", demoted: "/PendingDemoted", error: "/PendingError" };
const FLAG_TEMPLATE = "/FlagTemplate/000.wav";
const FLAG_TARGET = { NImportant: "1/1", NPromoted: "1/1", NRegular: "1/2" };
const MODELS = ["gemini-3.6-flash", "gemini-3.5-flash", "gemini-flash-latest", "gemini-3.8-flash"];
let used = 0, NAMES_CACHE = {}; // מונה פניות החוצה (לשרת החינמי יש מגבלה של 50 לכל הרצה)

async function ym(env, method, params = {}) {
  // שמירת שבת וחג: צינתוק בזמן קודש לא נשלח, אלא נשמר ויוצא במוצאי שבת או חג
  if (method === "RunTzintuk" && !params.force && env.KV && await isHoly(env)) {
    const d = await kvGet(env, "deferred_tz", []);
    if (!d.includes(params.phones)) { d.push(params.phones); await env.KV.put("deferred_tz", JSON.stringify(d)); }
    return { responseStatus: "OK", deferred: true };
  }
  if (params.force) { params = { ...params }; delete params.force; }
  used++;
  const u = new URL(YM + method);
  u.searchParams.set("token", env.YM_TOKEN);
  let r;
  if (method === "UploadTextFile") { // תוכן ארוך לא נכנס בכתובת, לכן שולחים ב-POST
    const body = new URLSearchParams({ token: env.YM_TOKEN, ...params });
    r = await fetch(YM + method, { method: "POST", body });
  } else {
    for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
    r = await fetch(u);
  }
  if (method === "DownloadFile") return new Uint8Array(await r.arrayBuffer());
  return r.json();
}
function b64(bytes) { let s = ""; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); return btoa(s); }
const nowIL = () => new Date().toLocaleString("sv-SE", { timeZone: "Asia/Jerusalem" });
async function nextName(env, folder, ext) {
  const d = await ym(env, "GetIVR2Dir", { path: "ivr2:" + folder });
  let max = -1;
  for (const f of d.files || []) if (/^\d+\./.test(f.name)) max = Math.max(max, parseInt(f.name, 10));
  return String(max + 1).padStart(3, "0") + "." + ext;
}
async function move(env, src, folder, action = "move") {
  const name = await nextName(env, folder, src.split(".").pop());
  await ym(env, "FileAction", { action, what: "ivr2:" + src, target: "ivr2:" + folder + "/" + name });
  return name;
}
async function log(env, line) {
  const cur = await ym(env, "GetTextFile", { what: "ivr2:/AILog.txt" });
  await ym(env, "UploadTextFile", { what: "ivr2:/AILog.txt", contents: (`[${nowIL()}] ${line}\n` + ((cur && cur.contents) || "")).slice(0, 60000) });
}
async function listPhones(env, list) {
  const r = await ym(env, "TzintukimListManagement", { action: "getlistEnteres", TzintukimList: list });
  return (r.enteres || []).filter(e => e.active).map(e => e.phone);
}
const tzl = (env, list) => env.TEST_MODE === "1" ? "tzl:admins" : "tzl:" + list;
async function tzintuk(env, list) { return ym(env, "RunTzintuk", { phones: tzl(env, list) }); }


// ---------- ספקי AI: כמה מפתחות Gemini, ואז Groq ----------
const GEM_MODELS = ["gemini-3.6-flash", "gemini-3.5-flash", "gemini-flash-lite-latest"];
const geminiKeys = env => [env.GEMINI_KEY, ...(env.GEMINI_KEYS || "").split(",")].map(k => (k || "").trim()).filter(Boolean);
// מחזיר JSON מה-AI. contents בפורמט של Gemini, audio = הקלטה (wav) לשימוש ב-Groq
async function aiJSON(env, { system, contents, audio, textPrompt, models, startKey = 0, groqSystem }) {
  const errs = [];
  const keys = geminiKeys(env); const order = keys.slice(startKey % keys.length).concat(keys.slice(0, startKey % keys.length));
  for (const key of order) for (const model of (models || GEM_MODELS)) {
    const body = { contents, generationConfig: { responseMimeType: "application/json" } };
    if (system) body.system_instruction = { parts: [{ text: system }] };
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      { method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": key }, body: JSON.stringify(body) });
    used++;
    if (r.ok) { const j = await r.json(); return JSON.parse(j.candidates[0].content.parts[0].text); }
    errs.push(model + ":" + r.status);
    if (r.status === 429) break; // המכסה של המפתח הזה נגמרה, עוברים למפתח הבא
  }
  if (env.GROQ_KEY) {
    // תמלול עם Whisper ותשובה עם מודל טקסט
    const fd = new FormData();
    fd.append("file", new Blob([audio], { type: "audio/wav" }), "a.wav");
    fd.append("model", "whisper-large-v3"); fd.append("language", "he");
    const tr = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", { method: "POST", headers: { Authorization: "Bearer " + env.GROQ_KEY }, body: fd });
    used++;
    if (tr.ok) {
      const text = (await tr.json()).text || "";
      const msgs = [{ role: "system", content: (groqSystem || system || "") + "\n" + (textPrompt || "") },
                    ...(contents.slice(0, -1).map(c => ({ role: c.role === "model" ? "assistant" : "user", content: c.parts.map(p => p.text || "").join(" ") }))),
                    { role: "user", content: "תמלול ההקלטה: " + text }];
      for (const model of (env.GROQ_MODELS || "llama-3.3-70b-versatile").split(",")) {
        const r = await fetch("https://api.groq.com/openai/v1/chat/completions", { method: "POST",
          headers: { Authorization: "Bearer " + env.GROQ_KEY, "Content-Type": "application/json" },
          body: JSON.stringify({ model: model.trim(), messages: msgs, response_format: { type: "json_object" } }) });
        used++;
        if (r.ok) { const o = JSON.parse((await r.json()).choices[0].message.content); o.transcript = o.transcript || text; return o; }
        errs.push("groq " + model + ":" + r.status);
      }
    } else errs.push("groq-stt:" + tr.status);
  }
  throw new Error(errs.join(" "));
}


// ---------- תמלול ב-Groq (מכסה גדולה) ותשובות טקסט עם גיבויים ----------
const dead = new Map(); // מפתח+מודל שהמכסה שלו נגמרה, כדי לא לנסות שוב בכל שיחה
const isDead = k => (dead.get(k) || 0) > Date.now();
async function groqSTT(env, wav) {
  if (!env.GROQ_KEY || isDead("groq-stt")) throw new Error("groq-stt unavailable");
  const fd = new FormData();
  fd.append("file", new Blob([wav], { type: "audio/wav" }), "a.wav");
  fd.append("model", "whisper-large-v3"); fd.append("language", "he");
  const r = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", { method: "POST", headers: { Authorization: "Bearer " + env.GROQ_KEY }, body: fd, signal: AbortSignal.timeout(20000) });
  used++;
  if (r.status === 429) dead.set("groq-stt", Date.now() + 10 * 60e3);
  if (!r.ok) throw new Error("groq-stt " + r.status);
  return ((await r.json()).text || "").trim();
}
function parseJSON(t) { try { return JSON.parse(t); } catch { const m = /\{[\s\S]*\}/.exec(t || ""); if (m) return JSON.parse(m[0]); throw new Error("bad json"); } }
let aiTrace = [], force = "";
const CHAT_MODELS = ["gemini-3.6-flash", "gemini-3.5-flash", "gemini-flash-lite-latest", "gemma-4-26b-a4b-it"];
const safeParse = c => {
  if (c && typeof c === "object") return c;
  try { return parseJSON(c); } catch {
    const m = /"answer"\s*:\s*"([\s\S]*?)"\s*['"]?\s*\}?\s*$/.exec(String(c || ""));
    return { answer: m ? m[1] : String(c || "") };
  }
};
const providers = env => { try { return JSON.parse(env.PROVIDERS || "[]"); } catch { return []; } };
const toChat = (sys, contents) => [{ role: "system", content: sys },
  ...contents.map(c => ({ role: c.role === "model" ? "assistant" : "user", content: c.parts.map(p => p.text || "").join(" ") }))];
// system = הקשר מלא (למודלי Gemini עם מכסת טוקנים גדולה). compact = הקשר מקוצר לכל השאר
async function aiText(env, { system, compact, contents, models = CHAT_MODELS, groq = true, cf = true, deadline = 22000, timeout = 15000 }) {
  const start = Date.now(), errs = [];
  const late = () => Date.now() - start > deadline;
  if (force === "cf") models = []; else if (force === "gemma") models = ["gemma-4-26b-a4b-it"];
  for (const model of models) for (const key of geminiKeys(env)) {
    const id = key.slice(-4) + "|" + model;
    if (isDead(id) || late()) continue;
    const sys = model.startsWith("gemma") ? (compact || system) : system;
    const t0 = Date.now();
    try {
      const body = { system_instruction: { parts: [{ text: sys }] }, contents, generationConfig: { responseMimeType: "application/json" } };
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        { method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": key }, body: JSON.stringify(body), signal: AbortSignal.timeout(timeout) });
      used++;
      aiTrace.push(`${id} ${r.status} ${Date.now() - t0}ms`);
      if (r.ok) { const parts = (await r.json()).candidates[0].content.parts; return safeParse(parts[parts.length - 1].text); }
      if (r.status === 429) dead.set(id, Date.now() + (model.startsWith("gemma") ? 2 : 60) * 60e3);
      if (r.status >= 500) dead.set(id, Date.now() + 3 * 60e3);
      errs.push(model + ":" + r.status);
    } catch (e) { dead.set(id, Date.now() + 3 * 60e3); aiTrace.push(`${id} ${e.message} ${Date.now() - t0}ms`); errs.push(model + ":" + e.message); }
  }
  const list = force || !groq ? [] : [...providers(env)];
  if (!force && groq && env.GROQ_KEY) list.push({ name: "groq", url: "https://api.groq.com/openai/v1/chat/completions", key: env.GROQ_KEY, models: (env.GROQ_MODELS || "openai/gpt-oss-120b").split(",") });
  const msgs = toChat(compact || system, contents);
  for (const p of list) for (const model of p.models) {
    const id = p.name + "|" + model;
    if (isDead(id)) continue;
    const t0 = Date.now();
    try {
      const r = await fetch(p.url, { method: "POST", signal: AbortSignal.timeout(timeout),
        headers: { Authorization: "Bearer " + p.key, "Content-Type": "application/json", ...(p.headers || {}) },
        body: JSON.stringify({ model: model.trim(), messages: msgs, temperature: 0.6 }) });
      used++;
      aiTrace.push(`${id} ${r.status} ${Date.now() - t0}ms`);
      if (r.ok) { const c = ((await r.json()).choices || [])[0]?.message?.content || ""; if (c.trim()) return safeParse(c); }
      if (r.status === 429) dead.set(id, Date.now() + 15 * 60e3);
      errs.push(id + ":" + r.status);
    } catch (e) { aiTrace.push(`${id} ${e.message}`); errs.push(id + ":" + e.message); }
  }
  // אחרון: Cloudflare Workers AI (מכסה יומית חינמית באותו חשבון של השרת)
  if (cf && env.AI && !isDead("cf-ai")) {
    try {
      let out = "";
      try {
        const r = await env.AI.run("@cf/openai/gpt-oss-120b", { instructions: msgs[0].content, input: msgs.slice(1).map(m => ({ role: m.role, content: m.content })) });
        for (const item of (r && r.output) || []) for (const c of item.content || []) if (c.type === "output_text" && c.text) out = c.text;
        aiTrace.push("cf-ai gpt-oss " + (out ? "ok" : "empty"));
      } catch (e) { aiTrace.push("cf-ai gpt-oss " + e.message); }
      if (!out) {
        const r = await env.AI.run("@cf/meta/llama-3.3-70b-instruct-fp8-fast", { messages: msgs, max_tokens: 700 });
        out = r && r.response; aiTrace.push("cf-ai llama ok");
      }
      if (out) return safeParse(out);
    } catch (e) { dead.set("cf-ai", Date.now() + 30 * 60e3); aiTrace.push("cf-ai " + e.message); errs.push("cf-ai:" + e.message); }
  }
  throw new Error(errs.join(" "));
}


// ---------- AssemblyAI: תמלול עברית טוב (185 שעות חינם) ----------
const AAI = "https://api.assemblyai.com/v2";
async function aaiSubmit(env, wav) {
  const up = await fetch(AAI + "/upload", { method: "POST", headers: { authorization: env.AAI_KEY, "content-type": "application/octet-stream" }, body: wav, signal: AbortSignal.timeout(15000) });
  used++;
  if (!up.ok) throw new Error("aai upload " + up.status);
  const { upload_url } = await up.json();
  const tr = await fetch(AAI + "/transcript", { method: "POST", signal: AbortSignal.timeout(15000),
    headers: { authorization: env.AAI_KEY, "content-type": "application/json" },
    body: JSON.stringify({ audio_url: upload_url, language_code: "he", speech_models: ["universal-3-5-pro", "universal-2"] }) });
  used++;
  if (!tr.ok) throw new Error("aai create " + tr.status);
  return (await tr.json()).id;
}
async function aaiGet(env, id) {
  const r = await fetch(AAI + "/transcript/" + id, { headers: { authorization: env.AAI_KEY }, signal: AbortSignal.timeout(10000) });
  used++;
  return r.json();
}
async function aaiSTT(env, wav, maxWait = 12000) {
  if (!env.AAI_KEY) throw new Error("no aai");
  const id = await aaiSubmit(env, wav), t0 = Date.now();
  while (Date.now() - t0 < maxWait) {
    await new Promise(r => setTimeout(r, 500));
    const g = await aaiGet(env, id);
    if (g.status === "completed") return (g.text || "").trim();
    if (g.status === "error") throw new Error("aai " + g.error);
  }
  throw new Error("aai timeout");
}
// מנקה "תודה רבה" שמודלי תמלול מוסיפים לפעמים בתחילת ההקלטה או בסופה
function cleanupTranscript(t) {
  const s0 = (t || "").trim();
  const s1 = s0.replace(/^((תודה( רבה)?)[.!,]?\s*)+/, "").replace(/(\s*(תודה( רבה)?)[.!,]?)+$/, "").trim();
  return s1.split(/\s+/).filter(Boolean).length >= 2 ? s1 : s0;
}
// תמלול הארכיון ב-AssemblyAI: שולחים כמה הקלטות בכל דקה, ובדקה הבאה אוספים את התוצאות
// כל הקבצים בתיקייה, גם כשיש יותר מ-1000 (ימות מחזירים עד 1000 בכל בקשה)
async function allFiles(env, folder) {
  const out = [];
  for (let from = 0; from < 10000; from += 1000) {
    const d = await ym(env, "GetIVR2Dir", { path: "ivr2:" + folder, filesFrom: from, filesLimit: 1000 });
    const fs = d.files || []; out.push(...fs);
    if (fs.length < 1000) break;
  }
  return { files: out };
}

async function aaiArchive(env, maxSubmit = 6, maxPoll = 12) {
  if (!env.AAI_KEY || !env.KV) return;
  const archive = await kvGet(env, "archive", {}), pending = await kvGet(env, "aai_pending", {});
  let changed = false, pchanged = false;
  for (const [name, job] of Object.entries(pending).slice(0, maxPoll)) {
    if (used > 42) break;
    const g = await aaiGet(env, job.id).catch(() => ({}));
    if (g.status !== "completed" && g.status !== "error" && Date.now() - job.ts < 30 * 60e3) continue;
    if (!archive[name] || archive[name].s !== "g") {
      const t = cleanupTranscript(g.text || "");
      archive[name] = { p: job.p || "", n: names(env)[job.p] || "", d: job.d || "", t: realText(t) ? t.slice(0, 3000) : "", s: "a" };
      changed = true;
    }
    delete pending[name]; pchanged = true;
  }
  if (used < 34) {
    const d = await allFiles(env, ALL);
    const todo = (d.files || []).filter(f => /^\d+\.wav$/.test(f.name) && !pending[f.name] && (!archive[f.name] || !["g", "a"].includes(archive[f.name].s)))
      .sort((a, b) => parseInt(b.name) - parseInt(a.name)).slice(0, maxSubmit);
    for (const f of todo) {
      if (used > 42) break;
      if ((f.duration || 0) < 1.2) { archive[f.name] = { p: f.phone || "", n: names(env)[f.phone] || "", d: f.date || f.mtime || "", t: "", s: "a" }; changed = true; continue; }
      try {
        const wav = await ym(env, "DownloadFile", { path: "ivr2:" + ALL + "/" + f.name });
        pending[f.name] = { id: await aaiSubmit(env, wav), p: f.phone || "", d: f.date || f.mtime || "", ts: Date.now() }; pchanged = true;
      } catch (e) { break; }
    }
  }
  if (changed) await env.KV.put("archive", JSON.stringify(archive));
  if (pchanged) await env.KV.put("aai_pending", JSON.stringify(pending));
}

// ---------- AI ----------
async function classify(env, wav) {
  const prompt = `זו הקלטה קולית שחבר בקבוצה קהילתית חרדית הקליט בקו טלפוני של הקבוצה, כדי שכל החברים ישמעו אותה.
תמלל אותה, והחלט:
- problem: true רק אם יש בה תוכן חריג באמת: קללות או ניבול פה, גסות, תוכן לא צנוע או לא ראוי לציבור החרדי, השפלה או העלבה חמורה של אדם מסוים, לשון הרע חמור או השמצה, או איומים. תלונות, ביקורת, ויכוח ענייני, בדיחות, צחוקים בין חברים, סלנג, שטויות והודעות ריקות, כל אלה בסדר ולכן false. ברוב המקרים התשובה היא false.
- important: האם ההודעה מספיק חשובה כדי שכל החברים יקבלו עליה צינתוק. אלה הכללים שמנהל הקבוצה קבע:
  חשוב (true): שיעור שמתבטל או זז לשעה או למקום אחר; הזמנה לשמחה או לאירוע (חתונה, בר מצווה, שמחת בית השואבה וכדומה); תזכורת לשיעור הקבוע; בקשה דחופה לתפילה או לתהילים על חולה; מישהו מחפש טרמפ, או הודעה על חפץ שאבד או נמצא; איסוף כסף או מתנה לחבר או לרב; שאלה שמופנית לכל החבר'ה, אבל רק אם היא באמת חשובה או דחופה (למשל מישהו צריך עזרה, או שאלה שנוגעת לכולם). שאלה סתמית או שאלה של סקרנות היא לא חשובה, ואת זה תנתח לפי התוכן; מידע שימושי שכולם צריכים לדעת (למשל שינוי בשעה או במקום של מניין); הודעה על שינויים בקו עצמו.
  בדרך כלל לא חשוב (false), אבל כאן יש לך מרחב שיקול: אם בהודעה מסוימת מהסוגים האלה יש משהו שבאמת נוגע לכולם, או שהחבר'ה צריכים לעשות משהו בעקבותיה, מותר לך להחליט שהיא חשובה: מזל טוב לחבר (על אירוסין, לידה וכדומה); הודעת אבל או ניחום אבלים; מבצע או הנחה בחנות; דבר תורה או וורט; בדיחה או סיפור מצחיק; ברכה כללית (שבת שלום, חג שמח, גמר חתימה טובה); תגובה על הודעה של מישהו אחר, הסכמה או ויכוח; שיחה פרטית או הודעה ריקה.
  אם ההודעה לא מתאימה לאף אחד מהסוגים, החלט לפי הרוח של הכללים: חשוב רק אם זה משהו שכל החבר'ה צריכים לדעת עכשיו או לעשות משהו בעקבותיו.
- snark: true אם ההודעה עוקצנית: לועגת, מתלוננת בציניות או עוקצת את הקו, את השרת או ה-AI, את המנהלים או חברים אחרים. אחרת false.
החזר JSON בלבד: {"transcript":"...","problem":false,"important":true,"snark":false,"reason":"הסבר קצר"}`;
  // קודם Gemini מקשיב להקלטה. אם הוא לא זמין: AssemblyAI מתמלל, ומודל טקסט מחליט
  try { return await aiAudio(env, { contents: [{ parts: [{ text: prompt }, { inline_data: { mime_type: "audio/wav", data: b64(wav) } }] }], deadline: 30000 }); }
  catch (e) { aiTrace.push("classify audio failed: " + e.message); }
  const t = cleanupTranscript(await aaiSTT(env, wav, 20000));
  const r = await aiText(env, { system: prompt.replace("תמלל אותה, והחלט:", "קיבלת את התמלול שלה (תמלול אוטומטי, ייתכנו שגיאות קטנות). החלט:"),
    contents: [{ role: "user", parts: [{ text: "התמלול: " + (t || "(אין דיבור ברור)") }] }], timeout: 20000, deadline: 45000 });
  r.transcript = t;
  return r;
}

// ---------- התראות אישיות (דגלים) ----------
async function loadState(env) {
  const r = await ym(env, "GetTextFile", { what: "ivr2:/AIFlags.json" });
  try { return JSON.parse(r.contents); } catch { return { jobs: [], active: {} }; }
}
const saveState = (env, s) => ym(env, "UploadTextFile", { what: "ivr2:/AIFlags.json", contents: JSON.stringify(s) });
async function addFlags(env, phones, flag) {
  const s = await loadState(env);
  for (const p of phones) s.jobs.push([p, flag]);
  await saveState(env, s);
}
async function membersFor(env, list) {
  const phones = await listPhones(env, list);
  if (env.TEST_MODE !== "1") return phones;
  const admins = await listPhones(env, "admins");
  return phones.filter(p => admins.includes(p));
}
async function processFlags(env, budget = 44) {
  const s = await loadState(env);
  let changed = false;
  while (s.jobs.length && used < budget) {
    const [phone, flag] = s.jobs.shift(); changed = true;
    s.active[phone] = s.active[phone] || {};
    if (!s.active[phone][flag])
      await ym(env, "FileAction", { action: "copy", what: "ivr2:" + FLAG_TEMPLATE, target: `ivr2:/${flag}/Phone/${phone}/000.wav` });
    s.active[phone][flag] = nowIL();
  }
  if (changed) await saveState(env, s);
}
// מוחק התראה אחרי שהחבר נכנס לשלוחה שעליה היא מודיעה
async function clearFlags(env) {
  const s = await loadState(env);
  const phones = Object.keys(s.active).filter(p => Object.keys(s.active[p]).length);
  if (!phones.length) return;
  const month = nowIL().slice(0, 7);
  const r = await ym(env, "GetTextFile", { what: `ivr2:/Log/LogFolderEnterExit-${month}.ymgr` });
  const seen = {};
  for (const line of ((r && r.contents) || "").split("\n")) {
    const d = Object.fromEntries(line.split("%").map(x => x.split("#")));
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
      delete s.active[p][flag]; changed = true;
    }
  }
  if (changed) await saveState(env, s);
}

// ---------- טיפול בהקלטה ----------
async function handleFile(env, f, kind) {
  const src = QUEUES[kind] + "/" + f.name, who = f.phone || "?";
  let v, result;
  // נעילה קצרה: שלא יטפלו באותה הודעה פעמיים במקביל (למשל הבדיקה המיידית והבדיקה הקבועה)
  const lockKey = "lock:" + src + ":" + (f.mtime || f.date || "");
  if (env.KV) { if (await env.KV.get(lockKey)) return "כבר בטיפול"; await env.KV.put(lockKey, "1", { expirationTtl: 300 }); }
  // פיקוח על מקליט מסוים: "drop" = ההודעה הבאה שלו נמחקת, "hold" = כל ההודעות שלו מחכות לאישור מנהל
  const watch = await kvGet(env, "watch", {}), w = watch[f.phone];
  if (w && w.drop > 0) {
    await ym(env, "FileAction", { action: "delete", what: "ivr2:" + src });
    w.drop--; await env.KV.put("watch", JSON.stringify(watch));
    await log(env, `${f.name} מ-${who}: נמחקה אוטומטית לפי בקשת המנהל`); return "נמחקה";
  }
  if (w && w.hold && (!w.until || w.until > Date.now())) {
    await move(env, src, kind === "important" ? P.problem : P.general); await ym(env, "RunTzintuk", { phones: "tzl:admins" });
    await log(env, `${f.name} מ-${who}: המקליט בפיקוח, ההודעה מחכה לאישור מנהל בשלוחה 7-4`); return "בפיקוח";
  }
  if (kind === "general") return publishGeneral(env, f, src);
  try {
    const wav = await ym(env, "DownloadFile", { path: "ivr2:" + src });
    if (wav.length < 1000) throw new Error("הקובץ לא נמצא");
    v = await classify(env, wav);
    if (typeof v.important !== "boolean" && typeof v.problem !== "boolean") throw new Error("תשובה לא תקינה מהבינה המלאכותית");
    // אם בזמן הבדיקה ההודעה כבר טופלה במקום אחר, לא נוגעים בה
    if (!(await queueFiles(env, kind)).some(x => x.name === f.name)) return "כבר טופלה";
  }
  catch (e) {
    await move(env, src, kind === "important" ? P.error : P.general); await tzintuk(env, "admins");
    await log(env, `שגיאה ב-${f.name} מ-${who}: ${e.message}. הועברה לאישור מנהל.`); return "error";
  }
  const toArchive = async name => { if (!env.KV || !name) return;
    const a = await kvGet(env, "archive", {});
    a[name] = { p: f.phone || "", n: names(env)[f.phone] || "", d: f.date || f.mtime || "", t: v.transcript || "", s: "g" };
    await env.KV.put("archive", JSON.stringify(a)); };
  // פיקוח מוגבר: כל הודעה של מספר שברשימה הזו ממתינה לאישור מנהל, בלי קשר להחלטת ה-AI
  const strict = env.KV ? await kvGet(env, "strict", []) : [];
  if (strict.includes(f.phone)) {
    await move(env, src, kind === "important" ? P.problem : P.general); await ym(env, "RunTzintuk", { phones: "tzl:admins" });
    await log(env, `${f.name} מ-${who} (${names(env)[f.phone] || ""}): פיקוח מוגבר, ההודעה ממתינה לאישור מנהל בשלוחה 7-4-${kind === "important" ? 1 : 2}. חוות דעת ה-AI: ${v.problem ? "יש חשש לתוכן בעייתי" : "לא נמצא תוכן בעייתי"}. סיבה: ${v.reason}. תמלול: ${v.transcript}`);
    return "פיקוח מוגבר";
  }
  if (kind === "general") {
    if (v.problem) { await move(env, src, P.general); await ym(env, "RunTzintuk", { phones: "tzl:admins" }); result = "הודעה רגילה הועברה לאישור מנהל"; }
    else { await toArchive(await move(env, src, ALL)); await tzintuk(env, "general"); await addFlags(env, await membersFor(env, "general"), "NRegular"); result = "הודעה רגילה עלתה ונשלח צינתוק"; }
  } else if (v.problem) {
    await move(env, src, P.problem); await ym(env, "RunTzintuk", { phones: "tzl:admins" }); result = "הודעה חשובה הועברה לאישור מנהל (חשש לתוכן בעייתי)";
  } else if (!v.important) {
    const allName = await move(env, src, ALL, "copy"); await toArchive(allName); await addIntro(env, f.phone, `${ALL}/${allName}`).catch(() => {}); await tzintuk(env, "general");
    await addFlags(env, await membersFor(env, "general"), "NRegular");
    const pend = await move(env, src, P.demoted); await ym(env, "RunTzintuk", { phones: "tzl:admins" });
    if (env.KV) { const map = await kvGet(env, "demap", {}); map[pend] = allName; await env.KV.put("demap", JSON.stringify(map)); }
    result = "סומנה כחשובה אבל ה-AI העביר לרגילות. המנהל יכול להעביר לחשובות";
  } else {
    const an = await move(env, src, ALL, "copy"); await toArchive(an); const imn = await move(env, src, IMPORTANT);
    await addIntro(env, f.phone, `${ALL}/${an}`).catch(() => {}); await addIntro(env, f.phone, `${IMPORTANT}/${imn}`).catch(() => {});
    await tzintuk(env, "members");
    await addFlags(env, await membersFor(env, "members"), "NImportant"); result = "אושרה כחשובה ונשלח צינתוק";
  }
  await log(env, `${f.name} מ-${who}: ${result}. סיבה: ${v.reason}. תמלול: ${v.transcript}`);
  if (!v.problem) await maybeRetort(env, f.phone, v).catch(e => log(env, "שגיאה בתגובת העוזר: " + e.message));
  return result;
}
// פתיח קבוע לפני ההודעות של חבר מסוים (KV: intro = {phone: "/path/to/intro.wav"})
async function addIntro(env, phone, path) {
  const map = await kvGet(env, "intro", {}), src = map[phone];
  if (!src) return false;
  const [a, b] = await Promise.all([ym(env, "DownloadFile", { path: "ivr2:" + src }), ym(env, "DownloadFile", { path: "ivr2:" + path })]);
  const x = wavSamples(a), y = wavSamples(b);
  if (!x || !y || x.sr !== y.sr) return false;
  const gap = new Int16Array(Math.round(x.sr * 0.4)), all = new Int16Array(x.s.length + gap.length + y.s.length);
  all.set(x.s, 0); all.set(gap, x.s.length); all.set(y.s, x.s.length + gap.length);
  const bytes = new Uint8Array(all.buffer), out = new Uint8Array(44 + bytes.length), v = new DataView(out.buffer);
  const str = (o, t) => { for (let i = 0; i < t.length; i++) out[o + i] = t.charCodeAt(i); };
  str(0, "RIFF"); v.setUint32(4, 36 + bytes.length, true); str(8, "WAVEfmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, x.sr, true); v.setUint32(28, x.sr * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); str(36, "data"); v.setUint32(40, bytes.length, true); out.set(bytes, 44);
  // העלאה מחדש מוחקת את פרטי ההקלטה (מי הקליט ומתי), ששמורים בקובץ txt ליד ההודעה. שומרים ומחזירים אותם
  const meta = path.replace(/\.wav$/, ".txt");
  const orig = await ym(env, "GetTextFile", { what: "ivr2:" + meta }).then(r => r.contents || "").catch(() => "");
  await ymUpload(env, path, out);
  if (/^Record-/.test(orig)) await ym(env, "UploadTextFile", { what: "ivr2:" + meta, contents: orig });
  return true;
}
// מוריד מהתמלול את הפתיח (כדי שלא ייכנס לארכיון כאילו החבר אמר אותו)
const stripIntro = t => { const s = String(t || ""), i = s.indexOf("מרתקים"); if (i < 0 || i > 200) return s; const j = s.indexOf("האזינו", i); return (j > 0 && j < i + 40 ? s.slice(j + 6) : s.slice(i + 12)).replace(/^[\s!.,]+/, ""); };
// אחרי שמנהל אישר הודעה בטלפון
// הודעה רגילה עולה מיד לכל ההודעות ונשלח צינתוק. אחר כך ה-AI בודק אותה, ומוריד רק תוכן חריג באמת
async function publishGeneral(env, f, src) {
  const allName = await move(env, src, ALL);
  await addIntro(env, f.phone, `${ALL}/${allName}`).catch(e => aiTrace.push("intro: " + e.message));
  await tzintuk(env, "general"); await addFlags(env, await membersFor(env, "general"), "NRegular");
  const pc = await kvGet(env, "postcheck", {}); pc[allName] = { p: f.phone || "", d: f.date || f.mtime || "", t: Date.now() };
  await env.KV.put("postcheck", JSON.stringify(pc));
  await log(env, `${f.name} מ-${f.phone || "?"}: הודעה רגילה עלתה מיד (${allName}) ונשלח צינתוק. ה-AI בודק אותה עכשיו`);
  try { await postCheck(env, allName); } catch (e) { aiTrace.push("postcheck: " + e.message); }
  return "הודעה רגילה עלתה מיד";
}
async function postCheck(env, allName) {
  const pc = await kvGet(env, "postcheck", {}), it = pc[allName];
  if (!it) return;
  // נעילה: שהבדיקה המיידית והריצה הקבועה לא יבדקו (ויגיבו) על אותה הודעה פעמיים
  const lk = "pclock:" + allName;
  if (await env.KV.get(lk)) return;
  await env.KV.put(lk, "1", { expirationTtl: 600 });
  const done = async () => { const p2 = await kvGet(env, "postcheck", {}); delete p2[allName]; await env.KV.put("postcheck", JSON.stringify(p2)); };
  const wav = await ym(env, "DownloadFile", { path: "ivr2:" + ALL + "/" + allName });
  if (wav.length < 1000) return done(); // כבר נמחקה
  const v = await classify(env, wav);
  if (typeof v.problem !== "boolean") throw new Error("תשובה לא תקינה");
  if ((await kvGet(env, "intro", {}))[it.p]) v.transcript = stripIntro(v.transcript);
  const who = it.p + (names(env)[it.p] ? " (" + names(env)[it.p] + ")" : "");
  if (v.problem) {
    const pend = await move(env, ALL + "/" + allName, P.general); await ym(env, "RunTzintuk", { phones: "tzl:admins" });
    await log(env, `${allName} מ-${who}: ה-AI הוריד מהקו הודעה רגילה (אפשר להחזיר אותה בשלוחה 7-4-2 כ-${pend}). סיבה: ${v.reason}. תמלול: ${v.transcript}`);
  } else {
    const a = await kvGet(env, "archive", {}); a[allName] = { p: it.p, n: names(env)[it.p] || "", d: it.d, t: v.transcript || "", s: "g" }; await env.KV.put("archive", JSON.stringify(a));
    await log(env, `${allName} מ-${who}: הודעה רגילה נבדקה ונשארת בקו. תמלול: ${v.transcript}`);
    await maybeRetort(env, it.p, v).catch(e => log(env, "שגיאה בתגובת העוזר: " + e.message));
  }
  await done();
}

// ---------- הודעות מתוזמנות (נשלחות מהריצה הקבועה כל דקה) ----------
async function nextFileNum(env, folder) {
  let max = -1;
  for (const from of [0, 1000, 2000]) {
    const d = await ym(env, "GetIVR2Dir", { path: "ivr2:" + folder, filesFrom: from, filesLimit: 1000 });
    const fs = d.files || []; for (const f of fs) if (/^\d+\./.test(f.name)) max = Math.max(max, parseInt(f.name, 10));
    if (fs.length < 1000) break;
  }
  return max + 1;
}
async function runScheduled(env) {
  const jobs = await kvGet(env, "scheduled", []);
  const now = nowIL(), due = jobs.filter(j => !j.done && j.at <= now);
  if (!due.length) return;
  if (await env.KV.get("schedlock")) return;
  await env.KV.put("schedlock", "1", { expirationTtl: 120 });
  for (const j of due) { j.done = now; }
  await env.KV.put("scheduled", JSON.stringify(jobs));
  for (const j of due) {
    try {
      if (j.type === "shoeva") {
        const ns = Object.values(await rsvpLoad(env)).sort((a, b) => (a.ts > b.ts ? 1 : -1)).map(x => x.n);
        const text = `${j.intro || "תזכורת חשובה: שמחת בית השואבה ביום ראשון אצל סטפנסקי!"} עד עכשיו נרשמו ${ns.length} בחורים: ${ns.join(", ")}. מי שעוד לא נרשם, בבקשה תירשמו כבר עכשיו, כדי שנדע בדיוק כמה אנחנו ונתכונן כמו שצריך: בתפריט הראשי מקישים 9 ואז 1. מחכים לכולם!`;
        await postVoice(env, [IMPORTANT, ALL], text);
        used = 0; await tzintuk(env, "members"); await addFlags(env, await membersFor(env, "members"), "NImportant"); await processFlags(env);
        await log(env, `נשלחה ההודעה המתוזמנת על שמחת בית השואבה (${ns.length} נרשמים) עם צינתוק לכל החברים`);
      }
      if (j.type === "post") { // הודעה מתוזמנת שמנהל קבע דרך העוזר
        await postVoice(env, j.important ? [IMPORTANT, ALL] : [ALL], j.text);
        // postVoice כבר העלה גם לכל ההודעות, ולכן בחשובה לא קוראים ל-notify("important") (הוא היה מעתיק אותה לשם שוב)
        used = 0;
        if (j.important) { await tzintuk(env, "members").catch(() => {}); await addFlags(env, await membersFor(env, "members"), "NImportant").catch(() => {}); }
        else await notify(env, "regular").catch(() => {});
        await processFlags(env).catch(() => {});
        await log(env, `יצאה ההודעה המתוזמנת (${j.important ? "חשובה" : "רגילה"}): ${j.text}`);
      }
      if (j.type === "remind") { // תזכורת אישית: מחכה בתיבה האישית של החבר
        const folder = "/personalMessages/Phone/" + j.phone, text = "תזכורת מהעוזר החכם: " + j.text;
        const pcm = await geminiTTS(env, text, 20000) || await elevenTTS(env, text, 15000), fname = await nextName(env, folder, pcm ? "wav" : "tts");
        if (pcm) await ymUpload(env, `${folder}/${fname}`, pcmToWav(pcm)); else { await ensureDir(env, folder, false); await ym(env, "UploadTextFile", { what: `ivr2:${folder}/${fname}`, contents: text }); }
        await log(env, `התזכורת של ${names(env)[j.phone] || j.phone} הושארה בתיבה האישית שלו: ${j.text}`);
      }
      // תזמונים שנקבעים מדף הניהול (src/dash.js): צינתוק, החלפת ההודעה בכניסה, והודעה אישית לחברים נבחרים
      if (j.type === "tz") {
        const r = await tzintuk(env, j.list || "members");
        await log(env, `יצא צינתוק מתוזמן לרשימת ${j.list || "members"}${r && r.deferred ? " (נדחה למוצאי שבת/חג)" : ""}`);
      }
      if (j.type === "entry") await doAdmin(env, { type: "entry", text: j.text }, j.by || OWNER, "תזמון מדף הניהול");
      if (j.type === "pm") {
        const phones = (j.phones || []).filter(p => /^0\d{8,9}$/.test(p)), pcm = phones.length ? await ttsLong(env, j.text) : null;
        if (!pcm) throw new Error("הקול של העוזר לא זמין, ההודעה האישית המתוזמנת לא יצאה");
        const bid = "s" + Date.now().toString(36); await env.KV.put("bc:" + bid, to8k(pcmTrim(pcm)).buffer, { expirationTtl: 3 * 86400 });
        await bgAdd(env, [...phones.map(p => ({ k: "bc", id: bid, p })), { k: "log", line: `ההודעה האישית המתוזמנת הושארה אצל ${phones.length} חברים: ${j.text}` }]);
      }
    } catch (e) { await log(env, "שגיאה בהודעה מתוזמנת: " + e.message); }
  }
  // משימה חוזרת (every = day / week, אופציונלית until): נקבעת שוב לפעם הבאה
  const again = due.filter(j => j.every === "day" || j.every === "week");
  if (again.length) {
    const all = await kvGet(env, "scheduled", []);
    for (const j of again) {
      const next = new Date(j.at.replace(" ", "T") + ":00Z"), step = j.every === "week" ? 7 : 1, nowAt = nowIL().slice(0, 16);
      let at;
      do { next.setUTCDate(next.getUTCDate() + step); at = next.toISOString().slice(0, 16).replace("T", " "); } while (at <= nowAt);
      if (!j.until || at <= j.until) all.push({ ...j, id: "j" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), at, done: undefined });
    }
    await env.KV.put("scheduled", JSON.stringify(all));
  }
}

// ---------- סיכום שבועי קולי (מוצאי שבת, בהודעות הרגילות) ----------
async function weeklySummary(env, dry = false) {
  const line = await loadLine(env);
  const now = new Date(nowIL().replace(" ", "T") + "Z"), from = new Date(now.getTime() - 7 * 86400000);
  const cut = from.toISOString().slice(0, 16).replace("T", " ");
  const week = line.msgs.filter(m => sortable(m.d) >= cut);
  if (week.length < 3) return { skipped: "מעט מדי הודעות השבוע", count: week.length };
  const system = `אתה העוזר החכם של קו טלפוני של קבוצת בחורי ישיבה מהציבור החרדי. כתוב סיכום שבועי קולי של מה שהיה בקו השבוע, שיוקרא בקול לכל החבר'ה.
כללים:
- בסגנון ציבצר: בחור ישיבה רגוע, זורם, קליל ומצחיק, בשפה של בחורי ישיבה ("אחי", "וואלה", "תכלס"). בלי שום אזכור של סמים או עישון.
- תתחיל ב"שבוע טוב חבר'ה" ומשפט פתיחה קליל, ואז עבור על הנושאים המרכזיים של השבוע: אירועים, הודעות חשובות, בקשות, ורגעים מצחיקים. תזכיר מי אמר מה בשמות, בחיבה.
- מותר לעקוץ בחיבה, רק צחוק שגם החבר עצמו היה צוחק ממנו. בלי לשון הרע, בלי להשפיל, ובלי לחשוף דברים פרטיים או מביכים.
- לשון נקייה. בלי לצטט מילה במילה, רק במילים שלך.
- אל תמציא שום דבר שלא מופיע בהודעות.
- אורך: בערך 150 עד 220 מילים. משפטים קצרים, בלי רשימות, בלי אימוג'י.
- תסיים במשפט סיום קליל ובברכה.
החזר JSON בלבד: {"summary":"הטקסט"}`;
  const text = `ההודעות של השבוע (${week.length} הודעות), מהישנה לחדשה:\n` + week.map(msgLine).join("\n").slice(0, 60000);
  const r = await aiText(env, { system, contents: [{ role: "user", parts: [{ text }] }], timeout: 40000, deadline: 60000 });
  const summary = String(r.summary || r.answer || "").trim();
  if (!summary) throw new Error("לא התקבל סיכום");
  if (dry) return { summary, count: week.length };
  const [num] = await postVoice(env, [ALL], summary);
  used = 0; await notify(env, "regular").catch(() => {});
  await log(env, `עלה הסיכום השבועי לכל ההודעות (${week.length} הודעות השבוע)`);
  return { summary, count: week.length, file: num };
}
async function maybeWeekly(env) {
  const now = nowIL(), d = new Date(now.replace(" ", "T") + "Z");
  if (d.getUTCDay() !== 6 || d.getUTCHours() < 21) return;
  const tag = now.slice(0, 10);
  if ((await env.KV.get("weeklyDone")) === tag) return;
  await env.KV.put("weeklyDone", tag);
  try { await weeklySummary(env); } catch (e) { await log(env, "שגיאה בסיכום השבועי: " + e.message); }
}

// דף הניהול (לוח הבקרה למנהל) נמצא ב-src/dash.js ו-src/dash.html, בכתובת /admin

// ---------- תגובה עוקצנית של העוזר למקליטים מסוימים (רשימה ב-KV בשם retort) ----------
// תגובה עוקצנית לחבר שברשימת "retort": ההודעה נכנסת לתור, והתגובה נכתבת בריצה הקבועה (עם זמן מלא, גם כשגוגל עמוס)
const RETORT_HINT = /עוזר|בינה|מלאכותי|AI|רובוט|לאוי|ליווי|שמואל|קו הזה|הקו/;
async function maybeRetort(env, phone, v, dry = false) {
  if (!v || !v.transcript) return;
  const list = await kvGet(env, "retort", []);
  if (!list.includes(phone)) return;
  if (!v.snark && !RETORT_HINT.test(v.transcript)) return;
  if (dry) return writeRetort(env, phone, v.transcript);
  const q = await kvGet(env, "retortq", []);
  q.push({ p: phone, t: v.transcript.slice(0, 3000), at: Date.now() });
  await env.KV.put("retortq", JSON.stringify(q.slice(-10)));
}
async function writeRetort(env, phone, transcript) {
  const name = names(env)[phone] || "", first = name.split(" ")[0] || "חבר";
  const facts = await kvGet(env, "facts", {}), talk = (facts.talk || {})[phone] || "";
  const system = `${talk ? talk + "\n" : ""}אתה העוזר החכם של קו טלפוני של קבוצת בחורי ישיבה. ${name} השאיר עכשיו בקו הודעה נגדך או נגד מנהל הקו. התפקיד שלך: להחזיר לו עקיצה חדה בטירוף, שנונה ומצחיקה, מהסוג שכל החבר'ה ישמעו ויגידו "וואו, איך הוא סגר אותו".
כללים:
- תתחיל במילים "כאן העוזר החכם." ואז תפנה אליו בשם ${first}, או באחד הכינויים שלו.
- 2 עד 4 משפטים קצרים וחותכים. בלי הקדמות, בלי להתנצל ובלי לעגל פינות. כל משפט צריך לעקוץ.
- תשתמש במילים ובטענות שלו עצמו נגדו: תהפוך את הטיעון שלו, תתפוס אותו בסתירה, תגזים את מה שהוא אמר עד שזה נהיה מגוחך.
- הקו המרכזי שחוזר תמיד: ${first} תמיד מתלונן, ושום דבר לא מרצה אותו. ותוסיף גם עקיצה על האורך והכמות של ההודעות שלו כשזה מתאים.
- אל תהיה חנפן, אל תסיים ב"אנחנו אוהבים אותך" ואל תסביר שזה צחוק. העוקץ צריך להישאר עוקץ.
- אסור: קללות, לקרוא לו משוגע באמת, מוגבל או כינויי גנאי מעליבים, מראה חיצוני, משפחה, מוצא, בריאות, או דברים פרטיים. בלי לשון הרע. מותר הכינויים שלו מהמידע למעלה.
- לשון נקייה, ברוח הציבור החרדי. בלי שום אזכור של סמים או עישון.
החזר JSON בלבד: {"reply":"הטקסט"}`;
  const r = await aiText(env, { system, contents: [{ role: "user", parts: [{ text: "ההודעה שלו: " + transcript }] }], timeout: 8000, deadline: 14000 });
  let out = String(r.reply || r.answer || "").trim();
  // מודלי גיבוי מחזירים לפעמים JSON בתוך השדה, או מירכאות מיותרות
  for (let i = 0; i < 2 && /^\s*\{/.test(out); i++) { try { const j = JSON.parse(out); out = String(j.reply || j.answer || "").trim(); } catch { const m = /"reply"\s*:\s*"([\s\S]*)"\s*\}?\s*$/.exec(out); out = m ? m[1] : ""; } }
  out = out.replace(/\\n/g, " ").replace(/[{}]/g, "").trim();
  return out;
}
async function runRetorts(env) {
  const q = await kvGet(env, "retortq", []);
  if (!q.length || await env.KV.get("retortlock")) return;
  await env.KV.put("retortlock", "1", { expirationTtl: 120 });
  try {
    // כמה הודעות רצופות של אותו חבר מקבלות תגובה אחת משותפת
    const it = q[0], same = q.filter(x => x.p === it.p);
    const rest = q.filter(x => x.p !== it.p);
    const reply = await writeRetort(env, it.p, same.map(x => x.t).join("\n---\n").slice(-4000));
    // תגובה קצרה מדי (בדרך כלל ממודל גיבוי כשגוגל עמוס) לא עולה, ומנסים שוב בריצה הבאה, עד 20 דקות
    const tooWeak = reply.length < 120 && Date.now() - it.at < 20 * 60e3;
    if (reply && !tooWeak) {
      const [num] = await postVoice(env, [ALL], reply);
      await log(env, `העוזר החכם הגיב בעקיצה ל${names(env)[it.p] || it.p} (${num}): ${reply}`);
      await env.KV.put("retortq", JSON.stringify(rest));
    } else if (Date.now() - it.at > 30 * 60e3) await env.KV.put("retortq", JSON.stringify(rest)); // מוותרים אחרי חצי שעה
    else aiTrace.push("retort: weak or empty, retry later (" + reply.length + ")");
  } finally { await env.KV.delete("retortlock"); }
}

// ---------- פרסומת אישית שקופצת למספרים מסוימים בכניסה לקו (KV: ads = {phone: [texts]}) ----------
async function personalAd(env, u, ctx) {
  const q = Object.fromEntries(u.searchParams), phone = q.ApiPhone || "";
  const ads = await kvGet(env, "ads", {}), list = ads[phone];
  if (!list || !list.length || q.S !== undefined) {
    // בתפריט העוקף אין התראות, ולכן מודיעים כאן על הודעות אישיות שממתינות
    const d = await ym(env, "GetIVR2Dir", { path: "ivr2:/personalMessages/Phone/" + phone }).catch(() => ({}));
    const n = (d.files || []).filter(f => /^\d+\.(wav|tts)$/.test(f.name)).length;
    return n ? `id_list_message=${await sayC(env, ctx, n === 1 ? "יש לך הודעה אישית חדשה. לשמיעה הקישו 0 ואז 1" : `יש לך ${n} הודעות אישיות חדשות. לשמיעה הקישו 0 ואז 1`)}&go_to_folder=/Main2` : "go_to_folder=/Main2";
  }
  const ad = list[Math.floor(Math.random() * list.length)];
  return `read=${await sayC(env, ctx, "פרסומת קצרה. לדילוג הקישו 1")}.${await sayC(env, ctx, ad)}=S,no,1,0,2,No,no,no,,1`;
}

// ---------- הקול של העוזר החכם (Gemini TTS, קול Charon, סגנון רגוע וזורם) ----------
// הקול נוצר ב-Gemini, נשמר כקובץ בימות (שממירים אותו לפורמט של הטלפון), ומושמע משם.
// אם אין קול זמין בזמן, חוזרים להקראה הרגילה של ימות, כך שהשיחה אף פעם לא נתקעת.
const VOICE_DIR = "/8/voice";
const TTS_MODELS = ["gemini-3.8-flash-tts", "gemini-2.5-flash-preview-tts", "gemini-3.1-flash-tts-preview", "gemini-3.8-flash-lite-tts"];
// בלי הוראות סגנון בתוך הטקסט: חלק מהמודלים מקריאים את ההוראה עצמה בקול. הסגנון מגיע מהקול ומהטקסט
const TTS_STYLE = "";
const ttsDead = new Map();
function b64ToBytes(s) {
  if (Uint8Array.fromBase64) return Uint8Array.fromBase64(s);
  const bin = atob(s), out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
async function geminiTTS(env, text, budgetMs, voice = "Charon") {
  const start = Date.now();
  for (const model of TTS_MODELS) for (const key of geminiKeys(env)) {
    const id = key.slice(-4) + "|" + model;
    if ((ttsDead.get(id) || 0) > Date.now()) continue;
    const left = budgetMs - (Date.now() - start);
    if (left < 1500) return null;
    try {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": key }, signal: AbortSignal.timeout(left),
        body: JSON.stringify({ contents: [{ parts: [{ text: TTS_STYLE + text }] }], generationConfig: { responseModalities: ["AUDIO"], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } } } }) });
      if (!r.ok) { ttsDead.set(id, Date.now() + (r.status === 429 ? 600000 : r.status >= 500 ? 60000 : 6 * 3600000)); aiTrace.push(`tts ${id} ${r.status}`); continue; }
      const j = await r.json();
      const b64 = (j.candidates?.[0]?.content?.parts || []).find(p => p.inlineData)?.inlineData?.data;
      if (b64) { aiTrace.push(`tts ok ${id} ${Date.now() - start}ms`); return b64ToBytes(b64); }
    } catch (e) { aiTrace.push(`tts ${id} ${e.message}`); }
  }
  return null;
}
// גיבוי לקול: ElevenLabs (מודל eleven_v3, תומך בעברית). מכסה חינמית קטנה, לכן רק לתשובות קצרות ועם מונה חודשי
const EL_MONTH_LIMIT = 9500;
async function elevenTTS(env, text, budgetMs, voiceId = "bIHbv24MWmeRgasZH58o") {
  if (!env.ELEVEN_KEY || !env.KV || budgetMs < 2000 || text.length > 600) return null;
  const mk = "el_used:" + nowIL().slice(0, 7), used0 = +(await env.KV.get(mk)) || 0;
  if (used0 + text.length > EL_MONTH_LIMIT) { aiTrace.push("eleven: monthly limit"); return null; }
  try {
    const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=pcm_24000`, {
      method: "POST", headers: { "xi-api-key": env.ELEVEN_KEY, "Content-Type": "application/json" }, signal: AbortSignal.timeout(budgetMs),
      body: JSON.stringify({ text, model_id: "eleven_v3", language_code: "he" }) });
    if (!r.ok) { aiTrace.push("eleven " + r.status); return null; }
    const pcm = new Uint8Array(await r.arrayBuffer());
    await env.KV.put(mk, String(used0 + text.length), { expirationTtl: 40 * 86400 });
    aiTrace.push("eleven ok " + text.length + " chars");
    return pcm;
  } catch (e) { aiTrace.push("eleven " + e.message); return null; }
}

// PCM של 24kHz לקובץ WAV, בלי השקט שבהתחלה ובסוף
function pcmToWav(pcm, sr = 24000) {
  const n = pcm.length >> 1, dv = new DataView(pcm.buffer, pcm.byteOffset, pcm.byteLength), TH = 300;
  let a = 0, b = n - 1;
  while (a < n && Math.abs(dv.getInt16(a * 2, true)) < TH) a++;
  while (b > a && Math.abs(dv.getInt16(b * 2, true)) < TH) b--;
  a = Math.max(0, a - Math.round(sr * 0.08)); b = Math.min(n - 1, b + Math.round(sr * 0.15));
  const body = pcm.subarray(a * 2, (b + 1) * 2), out = new Uint8Array(44 + body.length), v = new DataView(out.buffer);
  const str = (o, t) => { for (let i = 0; i < t.length; i++) out[o + i] = t.charCodeAt(i); };
  str(0, "RIFF"); v.setUint32(4, 36 + body.length, true); str(8, "WAVEfmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, sr, true); v.setUint32(28, sr * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); str(36, "data"); v.setUint32(40, body.length, true);
  out.set(body, 44);
  return out;
}
async function ymUpload(env, path, bytes) {
  const fd = new FormData();
  fd.append("token", env.YM_TOKEN); fd.append("path", "ivr2:" + path); fd.append("convertAudio", "1");
  fd.append("file", new Blob([bytes], { type: "audio/wav" }), path.split("/").pop());
  const r = await fetch(YM + "UploadFile", { method: "POST", body: fd });
  const j = await r.json();
  if (j.responseStatus !== "OK") throw new Error("upload: " + (j.message || j.responseStatus));
  return j;
}
async function shortHash(text) {
  const d = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(text));
  return [...new Uint8Array(d)].slice(0, 8).map(x => x.toString(16).padStart(2, "0")).join("");
}
// מחזיר פריט להשמעה בימות: f- לקובץ בקול של העוזר, או t- (ההקראה הרגילה) כגיבוי.
// cache = טקסט קבוע (פתיח, הנחיות): בפעם הראשונה מוקרא רגיל והקול נוצר ברקע, ומהפעם הבאה בקול של העוזר
async function speak(env, ctx, text, { cache = false, budget = 8000, voice = "Charon", el = "bIHbv24MWmeRgasZH58o", rate = 1 } = {}) {
  const fallback = "t-" + clean(text);
  if (!text || !String(text).trim() || !env.KV) return fallback;
  if (cache) {
    const h = "s" + await shortHash(voice === "Charon" ? text : voice + "|" + text);
    if (await env.KV.get("voice:" + h)) return `f-${VOICE_DIR}/${h}`;
    if (ctx) ctx.waitUntil((async () => {
      if (await env.KV.get("voicejob:" + h)) return;
      await env.KV.put("voicejob:" + h, "1", { expirationTtl: 120 });
      const pcm = await geminiTTS(env, text, 25000, voice); if (!pcm) return;
      await ymUpload(env, `${VOICE_DIR}/${h}.wav`, pcmToWav(pcm)); await env.KV.put("voice:" + h, "1", { expirationTtl: 30 * 86400 });
    })().catch(() => {}));
    return fallback;
  }
  const t0 = Date.now();
  let pcm = await geminiTTS(env, text, Math.max(1500, budget - 3500), voice);
  if (!pcm) pcm = await elevenTTS(env, text, budget - (Date.now() - t0), el);
  if (!pcm) return fallback;
  const name = "a" + Date.now().toString(36) + Math.floor(Math.random() * 1000);
  let wav;
  try { if (Math.abs(rate - 1) > 0.03) { const sp = speedPcm(pcm, rate); wav = pcmToWav(sp.pcm, 8000); } } catch (e) { aiTrace.push("speed " + e.message); }
  try { await ymUpload(env, `${VOICE_DIR}/${name}.wav`, wav || pcmToWav(pcm)); return `f-${VOICE_DIR}/${name}`; }
  catch (e) { aiTrace.push(e.message); return fallback; }
}
// טקסט קבוע או חוזר של תפריט: בקול העוזר מהמטמון (בפעם הראשונה בקול הרגיל, והקול נוצר ברקע)
const sayC = (env, ctx, text) => speak(env, ctx, text, { cache: true });
// מעלה הודעה לקו בקול של העוזר (לכמה תיקיות), ואם אין קול זמין, כקובץ הקראה רגיל
async function postVoice(env, folders, text) {
  const pcm = (await geminiTTS(env, text, 40000)) || (text.length <= 400 ? await elevenTTS(env, text, 20000) : null), wav = pcm ? pcmToWav(pcm) : null, nums = [];
  for (const folder of folders) {
    const num = String(await nextFileNum(env, folder)).padStart(3, "0"); nums.push(num);
    let done = false;
    if (wav) { try { await ymUpload(env, `${folder}/${num}.wav`, wav); done = true; } catch (e) { aiTrace.push(e.message); } }
    if (!done) await ym(env, "UploadTextFile", { what: `ivr2:${folder}/${num}.tts`, contents: text });
  }
  return nums;
}
// ניקוי קבצי התשובות הזמניים של השיחות (פעם בשעה)
async function cleanVoice(env) {
  if (new Date(nowIL().replace(" ", "T") + "Z").getUTCMinutes() !== 7) return;
  const d = await ym(env, "GetIVR2Dir", { path: "ivr2:" + VOICE_DIR });
  let n = 0;
  for (const f of d.files || []) if (((/^a/.test(f.name) && ageMinutes(f) > 14 * 1440) || (/^s/.test(f.name) && ageMinutes(f) > 29 * 1440)) && n++ < 40) await ym(env, "FileAction", { action: "delete", what: `ivr2:${VOICE_DIR}/${f.name}` });
}

// ---------- מי בקו עכשיו (שלוחה 5-5) ----------
const WHERE = [["/8", "מדבר עם העוזר החכם"], ["/3", "בחדר הוועידה"], ["/1", "שומע הודעות"], ["/2", "מקליט הודעה"], ["/9", "בשמחת בית השואבה"], ["/0", "באזור האישי"], ["/7", "בניהול"], ["/5", "במידע על הקבוצה"], ["/4", "בניהול הצינתוקים"]];
const LINE_PHONE = "0733512880";
// כל מספרי הטלפון שבתוך טקסט (ימות מחזירה למשל "0554004249 זיהוי 0554004249 "), בלי המספר של הקו עצמו
const phonesIn = t => [...String(t ?? "").matchAll(/(?:^|\D)(0\d{8,9})(?!\d)/g)].map(m => m[1]).filter(p => p !== LINE_PHONE);
function callPhone(c) {
  // קודם השדות המוכרים של המתקשר, ואחר כך כל שדה טקסט אחר (חוץ ממיקום, שמות וזמנים)
  for (const k of ["phone", "callerIdNum", "CallerIdNum", "callerId", "CallerID", "ani", "from", "Phone"]) { const [p] = phonesIn(c?.[k]); if (p) return p; }
  for (const [k, v] of Object.entries(c || {})) if (typeof v === "string" && !/path|folder|ext|location|name|time|id/i.test(k)) { const [p] = phonesIn(v); if (p) return p; }
  return "";
}
function callWhere(c) {
  const raw = String(c?.path || c?.Path || c?.folder || c?.extension || c?.ext || c?.currentPath || c?.location || "").replace(/^ivr2:/, "").trim();
  // פורמט חדש של ימות: "2 הקלטת הודעה", "שלוחה 1/2 כל ההודעות קובץ 1251", "שלוחה ראשית"
  const m = /^(?:שלוחה\s*)?\/?(\d+(?:\/\d+)*)/.exec(raw);
  const p = m ? "/" + m[1] : (raw.startsWith("/") ? raw : "/" + raw);
  for (const [pre, label] of WHERE) if (p === pre || p.startsWith(pre + "/")) return label;
  return "בתפריט הראשי";
}
async function onlineNow(env) {
  const r = await ym(env, "GetIncomingCalls");
  // id נשמר כדי שאפשר יהיה לנתק את השיחה מדף הניהול (CallAction)
  const calls = (r.calls || []).map(c => ({ p: callPhone(c), w: callWhere(c), id: String(c?.id ?? c?.ID ?? c?.callId ?? c?.CallId ?? "") })).filter(c => c.p);
  const conf = [];
  for (const room of Object.values(r.confCalls || {})) {
    const list = Array.isArray(room) ? room : (room?.participants || room?.calls || room?.members || room?.users || []);
    for (const c of (Array.isArray(list) ? list : Object.values(list))) { const p = callPhone(c); if (p) conf.push(p); }
  }
  for (const p of conf) { const x = calls.find(c => c.p === p); if (x) x.w = "בחדר הוועידה"; else calls.push({ p, w: "בחדר הוועידה", id: "" }); }
  if ((r.callsCount || calls.length) && env.KV && !(await env.KV.get("incall_sample"))) await env.KV.put("incall_sample", JSON.stringify(r).slice(0, 4000), { expirationTtl: 7 * 86400 });
  return { calls, raw: r };
}
async function whoOnline(env, u, ctx) {
  const q = Object.fromEntries(u.searchParams), me = q.ApiPhone || "", nm = names(env);
  if (q.O !== undefined) return q.O === "3" ? "go_to_folder=/3" : "go_to_folder=/5";
  const { calls } = await onlineNow(env);
  const others = calls.filter(c => c.p !== me);
  const who = c => nm[c.p] || "מספר לא מוכר";
  if (!others.length) return `id_list_message=${await sayC(env, ctx, "כרגע אין אף אחד אחר בקו. אתה לבד פה, תכלס.")}&go_to_folder=/5`;
  const items = [await sayC(env, ctx, others.length === 1 ? "כרגע מחובר לקו עוד בחור אחד:" : `כרגע מחוברים לקו עוד ${others.length} חבר'ה:`)];
  for (const c of others) items.push(await sayC(env, ctx, `${who(c)}, ${c.w}.`));
  const inConf = others.some(c => c.w === "בחדר הוועידה");
  if (inConf) return `id_list_message=${items.join(".")}&read=${await sayC(env, ctx, "להצטרפות לחדר הוועידה הקישו 3. לחזרה הקישו 1.")}=O,no,1,1,7,No,no,no,,1.3`;
  return `id_list_message=${items.join(".")}&go_to_folder=/5`;
}

async function notify(env, type) {
  if (type === "regular") {
    await tzintuk(env, "general"); await addFlags(env, await membersFor(env, "general"), "NRegular");
  } else if (type === "promoted") {
    // מי שכבר שמע אותה ברגילות מקבל הודעה שהיא סומנה חשובה; השאר מקבלים "הודעה חשובה חדשה"
    const members = await membersFor(env, "members"), general = await membersFor(env, "general");
    await tzintuk(env, "members");
    await addFlags(env, members.filter(p => general.includes(p)), "NPromoted");
    await addFlags(env, members.filter(p => !general.includes(p)), "NImportant");
  } else {
    // הודעה חשובה שאושרה: מעתיקים גם לכל ההודעות
    const d = await ym(env, "GetIVR2Dir", { path: "ivr2:" + IMPORTANT });
    const last = (d.files || []).filter(x => /^\d+\.wav$/.test(x.name)).sort((a, b) => parseInt(b.name) - parseInt(a.name))[0];
    if (last) await move(env, IMPORTANT + "/" + last.name, ALL, "copy");
    await tzintuk(env, "members"); await addFlags(env, await membersFor(env, "members"), "NImportant");
  }
  await log(env, "מנהל אישר הודעה (" + type + ") ונשלח צינתוק");
}
function ageMinutes(f) {
  const m = /(\d+)\/(\d+)\/(\d+) (\d+):(\d+)/.exec(f.mtime || f.date || ""); if (!m) return 999;
  const now = nowIL(); const n = Date.parse(now.replace(" ", "T") + "Z");
  return (n - Date.UTC(+m[3], +m[2] - 1, +m[1], +m[4], +m[5])) / 60000;
}
async function queueFiles(env, kind) {
  const d = await ym(env, "GetIVR2Dir", { path: "ivr2:" + QUEUES[kind] });
  return (d.files || []).filter(f => /^\d+\.wav$/.test(f.name));
}
// ---------- שמירת שבת וחג (לפי זמני ירושלים, מ-Hebcal) ----------
let HOLY_MEM = null;
async function holyPeriods(env) {
  const day = nowIL().slice(0, 10);
  if (HOLY_MEM && HOLY_MEM.day === day) return HOLY_MEM.p;
  let p = await kvGet(env, "holy2:" + day, null);
  if (!p) {
    const iso = ms => new Date(ms).toISOString().slice(0, 10);
    const r = await fetch(`https://www.hebcal.com/hebcal?v=1&cfg=json&maj=on&i=on&c=on&ss=on&geonameid=281184&M=on&b=0&start=${iso(Date.now() - 4 * 864e5)}&end=${iso(Date.now() + 20 * 864e5)}`, { signal: AbortSignal.timeout(5000) });
    const items = ((await r.json()).items || []).filter(i => i.category === "candles" || i.category === "havdalah").sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
    p = []; let st = null;
    for (const i of items) { const t = Date.parse(i.date);
      if (i.category === "candles") { if (st === null) st = t; }
      else if (st !== null) { p.push([st, t]); st = null; } }
    if (st !== null) p.push([st, st + 50 * 3600e3]);
    await env.KV.put("holy2:" + day, JSON.stringify(p), { expirationTtl: 3 * 86400 });
  }
  HOLY_MEM = { day, p };
  return p;
}
// זמן קודש: משקיעת החמה בערב שבת או חג (לא מהדלקת נרות) ועד 5 דקות אחרי צאת שבת או חג
async function isHoly(env, at = Date.now()) {
  try { return (await holyPeriods(env)).some(([a, b]) => at >= a && at <= b + 5 * 60e3); }
  catch { // בלי חיבור ל-Hebcal: שבת רגילה, מיום שישי 16:00 עד מוצאי שבת 20:30
    const il = new Date(new Date(at).toLocaleString("en-US", { timeZone: "Asia/Jerusalem" })), d = il.getDay(), h = il.getHours() + il.getMinutes() / 60;
    return (d === 5 && h >= 17.5) || (d === 6 && h < 20.5); }
}
async function releaseDeferred(env) {
  const d = await kvGet(env, "deferred_tz", []);
  if (!d.length || await isHoly(env)) return;
  await env.KV.delete("deferred_tz");
  for (const phones of d) await ym(env, "RunTzintuk", { phones }).catch(() => {});
  await log(env, `מוצאי שבת/חג: נשלחו ${d.length} צינתוקים שחיכו (${d.join(", ")})`);
}

async function cron(env) {
  used = 0;
  for (const kind of Object.keys(QUEUES))
    for (const f of await queueFiles(env, kind)) if (ageMinutes(f) >= 3 && used < 25) await handleFile(env, f, kind);
  if (env.KV) { const pc = await kvGet(env, "postcheck", {});
    for (const [name, it] of Object.entries(pc).slice(0, 2)) if (Date.now() - it.t > 90000 && used < 30) await postCheck(env, name).catch(e => aiTrace.push("postcheck: " + e.message)); }
  const holy = env.KV ? await isHoly(env) : false;
  if (env.KV && !holy) await releaseDeferred(env).catch(e => log(env, "שגיאה בצינתוקים שחיכו: " + e.message));
  if (env.KV && !holy) await runScheduled(env).catch(e => log(env, "שגיאה בתזמון: " + e.message));
  if (env.KV && !holy) await maybeWeekly(env).catch(() => {});
  if (env.KV && !holy) await runBg(env).catch(e => aiTrace.push("bg: " + e.message));
  if (env.KV) await pmCleanup(env).catch(() => {});
  if (env.KV) await runRetorts(env).catch(e => aiTrace.push("retort: " + e.message));
  // הפרסומת של יוסי מתחלפת כל שתי דקות (נשמעת לו בכל פעם שהוא חוזר לתפריט הראשי)
  if (env.KV && new Date().getUTCMinutes() % 2 === 0 && (await env.KV.get("yossiad")) !== "off") {
    const n = 1 + Math.floor(Math.random() * 5);
    await ym(env, "FileAction", { action: "copy", what: `ivr2:/NYossiAd/ads/${n}.wav`, target: "ivr2:/PlayfileMessageCheck-NYossiAd.wav" }).catch(() => {});
  }
  await cleanVoice(env).catch(() => {});
  // דוגמה אחת של שיחה פעילה, כדי לוודא שקריאת "מי בקו עכשיו" מתאימה לפורמט של ימות
  if (env.KV && !(await env.KV.get("incall_sample"))) await onlineNow(env).catch(() => {});
  await processFlags(env);
  if (used < 40) await clearFlags(env);
  // משימות כבדות (תמלול ופרופילים) רצות רק אם הריצה הקודמת כבר הסתיימה, כדי לא לדרוס נתונים
  if (!env.KV) return;
  const lock = +(await env.KV.get("cronlock")) || 0;
  if (Date.now() - lock < 150e3) return;
  await env.KV.put("cronlock", String(Date.now()));
  const hour = +nowIL().slice(11, 13);
  try {
    if (used < 30 && hour >= 1 && hour < 5) await transcribeBatch(env, 6);
    if (used < 36) await buildProfiles(env, 1);
    // שחרור מתוזמן של הפרומו
    const promo = (await env.KV.get("promo")) || "";
    if (promo.startsWith("at:") && Date.now() >= +promo.slice(3) && used < 40) {
      const n = await releasePromo(env, "all"); await env.KV.put("promo", "sent");
      await log(env, `הפרומו על העוזר החכם שוחרר ל-${n} חברים`);
    }
    if (used < 30) await aaiArchive(env, 8);
  } finally { await env.KV.delete("cronlock"); }
  if (env.KV && used < 42 && (await env.KV.get("promo")) === "pending") {
    const n = await releasePromo(env, "all"); await env.KV.put("promo", "sent");
    await log(env, `הפרומו על העוזר החכם שוחרר ל-${n} חברים`);
  }
}
async function checkNow(env, phone, kind) {
  used = 0;
  const mine = (await queueFiles(env, kind)).filter(f => f.phone === phone).sort((a, b) => parseInt(b.name) - parseInt(a.name));
  if (mine.length) await handleFile(env, mine[0], kind);
  await processFlags(env);
}


// ---------- ארכיון ההודעות של הקו (תמלולים) ופרופילים של החברים ----------
const names0 = env => { try { return JSON.parse(env.NAMES || "{}"); } catch { return {}; } };
// השמות מהגדרות השרת, ועליהם שינויים שנעשו דרך העוזר (שם חדש, חבר שהצטרף)
const names = env => Object.keys(NAMES_CACHE).length ? NAMES_CACHE : names0(env);
async function loadNames(env) { NAMES_CACHE = { ...names0(env), ...(env.KV ? await kvGet(env, "names_over", {}) : {}) }; }
async function kvGet(env, k, d) { try { return (await env.KV.get(k, "json")) || d; } catch { return d; } }
// Whisper לא מבין טוב את ההקלטות הטלפוניות בעברית, לכן הארכיון מתומלל רק ב-Gemini.
// בלילה (01:00-07:00) משתמשים במה שנשאר מהמכסה היומית, שממילא מתאפסת בעשר בבוקר
async function transcribeBatch(env, max = 6) {
  const archive = await kvGet(env, "archive", {});
  const d = await allFiles(env, ALL);
  const files = (d.files || []).filter(f => /^\d+\.wav$/.test(f.name));
  const live = new Set(files.map(f => f.name));
  let changed = false;
  for (const k of Object.keys(archive)) if (!live.has(k)) { delete archive[k]; changed = true; }
  const todo = files.filter(f => !archive[f.name] || archive[f.name].s !== "g").sort((a, b) => parseInt(b.name) - parseInt(a.name)).slice(0, max);
  for (const f of todo) {
    if (used > 40) break;
    let t = "";
    if ((f.duration || 0) >= 1.2) {
      const wav = await ym(env, "DownloadFile", { path: "ivr2:" + ALL + "/" + f.name });
      try {
        const r = await aiAudio(env, { models: ["gemini-flash-lite-latest", "gemini-3.5-flash"], deadline: 40000,
          contents: [{ parts: [{ text: 'תמלל את ההקלטה בעברית, מילה במילה, בלי לסכם ובלי להוסיף. אם אין בה דיבור ברור, החזר t ריק. החזר JSON בלבד: {"t":"..."}' }, { inline_data: { mime_type: "audio/wav", data: b64(wav) } }] }] });
        t = r.t || r.transcript || "";
      } catch (e) { break; } // המכסה נגמרה: ממשיכים בלילה הבא
    }
    archive[f.name] = { p: f.phone || "", n: names(env)[f.phone] || "", d: f.date || f.mtime || "", t: realText(t) ? t.slice(0, 3000) : "", s: "g" };
    changed = true;
  }
  if (changed) await env.KV.put("archive", JSON.stringify(archive));
  const good = Object.values(archive).filter(e => e.s === "g").length;
  return { total: files.length, done: good };
}
// קריאה ל-Gemini עם הקלטה (רק Gemini מבין טוב את ההקלטות)
const AUDIO_MODELS = ["gemini-3.6-flash", "gemini-3.5-flash", "gemini-flash-lite-latest"];
async function aiAudio(env, { system, contents, models = AUDIO_MODELS, deadline = 22000, timeout = 10000 }) {
  const start = Date.now(), errs = [];
  for (const model of models) for (const key of geminiKeys(env)) {
    const id = key.slice(-4) + "|" + model;
    if (isDead(id) || Date.now() - start > deadline) continue;
    const t0 = Date.now();
    try {
      const body = { contents, generationConfig: { responseMimeType: "application/json" } };
      if (system) body.system_instruction = { parts: [{ text: system }] };
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        { method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": key }, body: JSON.stringify(body), signal: AbortSignal.timeout(Math.max(2000, Math.min(timeout, deadline - (Date.now() - start)))) });
      used++;
      aiTrace.push(`audio ${id} ${r.status} ${Date.now() - t0}ms`);
      if (r.ok) { const parts = (await r.json()).candidates[0].content.parts; return safeParse(parts[parts.length - 1].text); }
      if (r.status === 429) dead.set(id, Date.now() + 60 * 60e3);
      if (r.status >= 500) dead.set(id, Date.now() + 3 * 60e3);
      errs.push(id + ":" + r.status);
    } catch (e) { dead.set(id, Date.now() + 3 * 60e3); aiTrace.push(`audio ${id} ${e.message}`); errs.push(id + ":" + e.message); }
  }
  throw new Error(errs.join(" ") || "no gemini");
}
const sortable = d => { const m = /(\d+)\/(\d+)\/(\d+) (\d+):(\d+)/.exec(d || ""); return m ? `${m[3]}-${m[2]}-${m[1]} ${m[4]}:${m[5]}` : ""; };
async function buildProfiles(env, max = 2) {
  const archive = await kvGet(env, "archive", {}), profiles = await kvGet(env, "profiles", {});
  const byPhone = {};
  for (const e of Object.values(archive)) if (e.p && (e.s === "g" || e.s === "a") && realText(e.t)) (byPhone[e.p] = byPhone[e.p] || []).push(e);
  for (const p of Object.keys(byPhone)) if (byPhone[p].length < 3) delete byPhone[p];
  const week = Date.now() - 7 * 864e5;
  const todo = Object.keys(byPhone).filter(p => !profiles[p] || profiles[p].ts < week || (profiles[p].count || 0) + 10 <= byPhone[p].length).slice(0, max);
  for (const p of todo) {
    const msgs = byPhone[p].filter(e => realText(e.t)).sort((a, b) => sortable(a.d) < sortable(b.d) ? -1 : 1);
    if (!msgs.length) { profiles[p] = { n: names(env)[p] || "", style: "", quotes: [], ts: Date.now(), count: byPhone[p].length }; continue; }
    const name = names(env)[p] || msgs[0].n || "חבר";
    const text = msgs.map(e => `[${e.d}] ${e.t}`).join("\n").slice(-20000);
    const corpusP = msgs.filter(e => e.s === "g").map(e => normHe(e.t)).join("|");
    try {
      const r = await aiText(env, { models: ["gemma-4-26b-a4b-it"], groq: true, cf: false, timeout: 60000, deadline: 150000,
        system: `אתה מקבל את כל ההודעות ש${name} השאיר בקו הטלפוני של השיעור שלו (תמלול אוטומטי). כתוב פרופיל קצר עליו כפי שעולה מההודעות בלבד: סגנון הדיבור, ביטויים אופייניים, נושאים שהוא מרבה לדבר עליהם, ואופי ההודעות. בנוסף בחר עד 4 ציטוטים קצרים ומאפיינים שלו. כל ציטוט חייב להיות מועתק מילה במילה מתוך ההודעות, בלי שום שינוי, ולפניו התאריך בסוגריים מרובעים. כתוב בכבוד ובלי שיפוטיות. החזר JSON בלבד: {"style":"...","quotes":["[תאריך] ציטוט"]}`,
        contents: [{ role: "user", parts: [{ text }] }] });
      const quotes = (r.quotes || []).filter(q => { const body = normHe(String(q).replace(/^\s*\[[^\]]*\]\s*/, "")).trim(); return body.split(" ").length >= 2 && corpusP.includes(body); });
      profiles[p] = { n: name, style: r.style || "", quotes, ts: Date.now(), count: byPhone[p].length };
    } catch (e) { aiTrace.push("profile error: " + e.message); if (profiles[p]) profiles[p].ts = Date.now(); else profiles[p] = { n: name, style: "", quotes: [], ts: Date.now(), count: 0 }; break; }
  }
  if (todo.length) await env.KV.put("profiles", JSON.stringify(profiles));
  return todo.length;
}
// פרומו על העוזר החכם: כל חבר שומע אותו פעם אחת בכניסה לקו
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
// ---------- גישה לכל ההודעות של הקו ----------
// נרמול לבדיקת ציטוטים: בלי ניקוד ובלי סימני פיסוק
const normHe = s => " " + (s || "").replace(/[֑-ׇ]/g, "").replace(/[^א-תa-zA-Z0-9]+/g, " ").trim() + " ";
const JUNK = new Set(["התמלול", "תודה", "תודה.", "תודה רבה", "תודה רבה.", "תודה. תודה.", "כנראה."]);
const realText = t => !!(t && t.trim() && !JUNK.has(t.trim()));
async function loadLine(env) {
  const archive = await kvGet(env, "archive", {}), profiles = await kvGet(env, "profiles", {});
  const msgs = Object.entries(archive).map(([f, e]) => ({ f, ...e }))
    .filter(m => realText(m.t) && (m.s === "g" || m.s === "a" || m.t.trim().split(/\s+/).length >= 3))
    .sort((a, b) => sortable(a.d) < sortable(b.d) ? -1 : 1);
  // ציטוט נבדק רק מול תמלולים של Gemini, שהם אמינים
  const facts = await kvGet(env, "facts", {});
  return { msgs, profiles, facts, corpus: msgs.filter(m => m.s === "g").map(m => normHe(m.t)).join("|") };
}
// מידע שהמנהל מסר על החברים ועל הישיבה (KV: facts = { about: [..], talk: { phone: "..." } })
function factsText(line) {
  const a = (line.facts && line.facts.about) || [];
  return a.length ? `\n\nמידע שמנהל הקבוצה מסר (אמין, תשתמש בו בטבעיות):\n- ${a.join("\n- ")}` : "";
}
const msgLine = m => `#${String(m.f || "").replace(".wav", "")} [${m.d} | ${m.n || "לא ידוע"}]${m.s === "g" ? "" : m.s === "a" ? " (תמלול אוטומטי, לא לצטט מילה במילה)" : " (תמלול לא מדויק, אסור לצטט)"} ${m.t.slice(0, 400)}`;
function profilesText(line, compact) {
  return Object.values(line.profiles).filter(p => p.style).map(p => compact
    ? `- ${p.n}: ${p.style.slice(0, 160)}`
    : `- ${p.n}: ${p.style}${(p.quotes || []).length ? " | ציטוטים: " + p.quotes.join(" | ") : ""}`).join("\n");
}
function countsText(line) {
  const counts = {};
  for (const m of line.msgs) counts[m.n || "לא ידוע"] = (counts[m.n || "לא ידוע"] || 0) + 1;
  return Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([n, c]) => n + " " + c).join(", ");
}
// כל ההודעות של הקו (ל-Gemini, שיכול לקבל הקשר גדול)
function contextAll(line) {
  return `\n\nכל חברי הקבוצה: ${Object.values(NAMES_CACHE).join(", ")}.` + factsText(line) + `\n\nהחברים בשיעור ומה שידוע על כל אחד מההודעות שלו:\n${profilesText(line) || "(הפרופילים עדיין נבנים)"}` +
    `\n\nכמות ההודעות שכל אחד השאיר בקו: ${countsText(line)}.` +
    `\n\nכל ההודעות שנשלחו בקו, מהישנה לחדשה (${line.msgs.length} הודעות), עם תאריך ושם:\n` + line.msgs.map(msgLine).join("\n");
}
// ---------- זיהוי שמות גם עם שגיאות כתיב/תמלול ----------
// אותיות שנשמעות דומה נחשבות אותה אות, ואותיות סופיות מנורמלות
const SOUND = { "ך": "כ", "ם": "מ", "ן": "נ", "ף": "פ", "ץ": "צ", "ק": "כ", "ח": "כ", "ת": "ט", "ש": "ס", "צ": "ס", "ע": "א", "ה": "א", "ב": "ו", "פ": "ו" };
const soundKey = w => [...w].map(c => SOUND[c] || c).join("").replace(/[אוי]/g, "");
function editDist(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++)
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}
// האם מילה מהשאלה היא (כנראה) חלק מהשם, גם עם תחילית (ל, ש, מ, ה, ו, ב, כ) ושגיאות קטנות
function nameLike(word, part) {
  if (part.length < 3) return false;
  const cands = [word, word.replace(/^[ובלמשהכ]{1,2}/, "")].filter(w => w.length >= 3);
  for (const w of cands) {
    if (w === part || (part.length >= 4 && w.includes(part))) return true;
    const a = soundKey(w), b = soundKey(part);
    if (part.length >= 4 && b.length >= 3 && a === b) return true;
    const tol = part.length >= 6 ? 2 : part.length >= 4 ? 1 : 0;
    if (tol && Math.abs(w.length - part.length) <= tol && editDist(w, part) <= tol) return true;
  }
  return false;
}
function findPersons(query, nm) {
  const words = normHe(query).trim().split(" ").filter(Boolean);
  const found = new Set();
  for (const [ph, name] of Object.entries(nm))
    for (const part of name.replace(/["'׳״]/g, "").split(/\s+/))
      if (words.some(w => nameLike(w, part))) found.add(ph);
  return found;
}
const STOP = new Set("מה של את על עם זה זאת הוא היא הם אני אתה אתם יש אין כל גם לא כן או אם מי איך למה מתי איפה כמה שלו שלה שלי לי לך לו היה היו אמר אמרו תגיד תספר תגידו ספר השבוע היום אתמול בקו הקו הודעה הודעות משהו עוד רק כבר אבל אז טוב נשמע".split(" "));
const PREFIX = /^[ובלמשהכ]{1,2}(?=[א-ת]{3,})/;
// בוחר מתוך כל ההודעות: את כל ההודעות של מי שהוזכר, הודעות שקשורות לנושא, וההודעות האחרונות
function retrieveContext(line, query, nm, limit = 26000, compact = false) {
  const q = normHe(query);
  const words = [...new Set(q.trim().split(" ").filter(w => w.length >= 3 && !STOP.has(w)).map(w => w.length >= 5 ? w.replace(PREFIX, "") : w))];
  const persons = findPersons(query, nm);
  const chosen = new Map(); let size = 0;
  const add = m => { if (chosen.has(m.f) || size > limit) return; chosen.set(m.f, m); size += m.t.length + 40; };
  for (const ph of persons) for (const m of line.msgs.filter(m => m.p === ph).reverse()) add(m);
  line.msgs.map(m => { const t = normHe(m.t); let sc = 0; for (const w of words) if (t.includes(w)) sc++; return [sc, m]; })
    .filter(x => x[0] > 0).sort((a, b) => b[0] - a[0]).slice(0, 25).forEach(([, m]) => add(m));
  for (const m of line.msgs.slice(compact ? -15 : -30).reverse()) add(m);
  const msgs = [...chosen.values()].sort((a, b) => sortable(a.d) < sortable(b.d) ? -1 : 1);
  const prof = profilesText(line, compact);
  const all = `כל חברי הקבוצה: ${Object.values(nm).join(", ")}.\n`;
  return `\n\n${all}${factsText(line)}\n\nהחברים בשיעור ומה שידוע על כל אחד מההודעות שלו:\n${prof || "(הפרופילים עדיין נבנים)"}` +
    `\n\nכמות ההודעות שכל אחד השאיר בקו: ${countsText(line)}.` +
    `\n\nבקו יש ${line.msgs.length} הודעות. אלה ההודעות שנבחרו מתוכן לשאלה הזו: כל ההודעות של מי שהוזכר בשאלה, הודעות שקשורות לנושא, וההודעות האחרונות. מהישנה לחדשה, עם תאריך ושם:\n` +
    msgs.map(msgLine).join("\n");
}
// משאיר רק ציטוטים שנאמרו באמת: משפט עם ציטוט שלא מופיע מילה במילה באף הודעה נמחק מהתשובה
function verifyQuotes(answer, corpus) {
  let removed = 0;
  const kept = String(answer || "").split(/(?<=[.!?])\s+/).filter(sent => {
    // «...» נבדק מ-2 מילים, ומירכאות רגילות מ-3 מילים (כדי לא להתבלבל עם קיצורים כמו רש"י)
    const qs = [...sent.matchAll(/«([^»]+)»/g)].map(m => [m[1], 2])
      .concat([...sent.matchAll(/["״“]([^"״”]+)["״”]/g)].map(m => [m[1], 3]));
    const ok = qs.every(([t, min]) => { const q = normHe(t).trim(); return q.split(" ").length < min || corpus.includes(q); });
    if (!ok) removed++;
    return ok;
  });
  return { text: kept.join(" ").replace(/[«»״“”]/g, ""), removed };
}

// ---------- שיחה עם AI בשלוחה 8 ----------
const chats = new Map(); // היסטוריית שיחה לפי מזהה שיחה
const clean = t => (t || "").replace(/[.,\-"'&|=\n\r*#_()–—:;!?׳״«»\[\]{}\/\\]/g, " ").replace(/\s+/g, " ").trim();
// ---------- הדמויות של העוזר (שלוחה 8: 1 ציבצר, 2 ראש ישיבה, 3 משגיח, 4 עוקצני, 5 פסיכולוג) ----------
const PERSONAS = {
  tzibtzer: { name: "הציבצר", voice: "Charon", el: "bIHbv24MWmeRgasZH58o", humor: true,
    style: `- הסגנון שלך: ציבצר, כלומר בחור ישיבה רגוע ומשוחרר לגמרי, זורם, שום דבר לא מלחיץ אותו. מדבר לאט ונינוח, קצת מרחף ומצחיק, בשפה של בחורי ישיבה: "אחי...", "וואלה", "תכלס", "בקטנה", "סחטיין", "יאללה, זורמים". משפטים קצרים, הומור יבש ועקיצות קטנות. בכל מצב, קליל. (בלי שום אזכור של סמים או עישון. רק הווייב.)
- לא חנוק, לא מתנצל ולא מרצה. גם כשלא יודעים משהו, או כשמישהו נוזף, עונים בחיוך ובקלילות.` },
  rosh: { name: "ראש הישיבה", voice: "Algenib", el: "pqHfZKP75CvOlQylNhV4", humor: false,
    style: `- הסגנון שלך: ראש ישיבה ותיק שמדבר עם בחור. מדבר במתינות, בחכמה ובסמכות חמה, בגובה העיניים. משלב לפעמים לשון של לימוד (תא שמע, אדרבה, ממה נפשך, לכאורה, יש לעיין) או משל קצר, בלי להגזים. מעודד לחשוב, ללמוד ולהתעלות, ורואה את הטוב בבחור.
- מקורות: מצטט רק פסוקים, משניות ומאמרי חז"ל ידועים ומפורסמים באמת. אם אתה לא בטוח במקור או בלשון המדויקת, אל תייחס אותם לאף אחד, אלא תגיד את הרעיון במילים שלך.
- אתה לא רב פוסק: בשאלות הלכה למעשה תמיד תגיד לשאול את הרב.` },
  mashgiach: { name: "המשגיח", voice: "Enceladus", el: "JBFqnCBsd6RMkjVDRZzb", humor: false,
    style: `- הסגנון שלך: משגיח בישיבה. מדבר ברוך, בנחת ומהלב, כמו שיחת מוסר קצרה ואישית. מחזק ומעודד, שם לב למה שמטריד את הבחור, ומדבר על מידות טובות, אמונה, יראת שמים ושמחה.
- אפשר להביא משל, או רעיון מספרי מוסר ידועים (מסילת ישרים, חובת הלבבות), רק כשאתה בטוח במקור. אם לא, תגיד את הרעיון במילים שלך.
- מוכיח באהבה בלבד: לא נוזף, לא מאיים ולא מפחיד. בשאלות הלכה תגיד לשאול את הרב.` },
  okets: { name: "העוקצני", voice: "Fenrir", el: "N2lVS1w4EtoT3dr4eOWO", humor: true,
    style: `- הסגנון שלך: עוקצני. שנון, חד וישיר, עם סרקזם קליל ועקיצה כמעט בכל תשובה, אבל תמיד בחיבה ובלי להעליב באמת. הומור יבש. עדיין עונה לעניין על מה ששאלו.
- לא מתנצל ולא מתחנף. אם מישהו מתלונן, עונה לו בעקיצה ובחיוך.` },
  psych: { name: "הפסיכולוג", voice: "Achird", el: "iP95p4xoKVk53GoZ742B", humor: false,
    style: `- הסגנון שלך: פסיכולוג חם ומקשיב. מדבר ברוגע, משקף למשתמש מה הוא מרגיש, שואל שאלה אחת טובה, ונותן עצה מעשית קצרה.
- אתה לא מאבחן ולא נותן טיפול. אם מישהו נשמע במצוקה אמיתית, או מדבר על לפגוע בעצמו, תגיד לו בחום שחשוב לדבר עכשיו עם מבוגר שהוא סומך עליו או עם איש מקצוע, ושהוא לא לבד.` },
};
const chatRules = (extra0, withTranscript) => {
  let extra = extra0 || "";
  const pm = /\{\{PERSONA:(\w+)\}\}/.exec(extra); if (pm) extra = extra.replace(pm[0], "");
  const persona = PERSONAS[pm ? pm[1] : "tzibtzer"] || PERSONAS.tzibtzer;
  const m = /\{\{ADMINRULE:([\s\S]*)\}\}$/.exec(extra); if (m) extra = extra.slice(0, m.index);
  const adminRule = m ? m[1] : "רק מנהלי הקבוצה יכולים לפרסם הודעות דרכך. השאר את post ריק.";
  let r = chatRulesInner(extra, withTranscript).replace("{{ADMIN}}", adminRule).replace("{{STYLE}}", persona.style);
  if (!persona.humor) r = r.replace(/- מותר ואפילו רצוי לצחוק על החבר'ה[^\n]*\n- הגבול בצחוק על חברים:[^\n]*/, "- על החברים בקבוצה מדבר תמיד בכבוד ובטוב. בלי עקיצות ובלי לצחוק על אף אחד.");
  return r;
};
const chatRulesInner = (extra, withTranscript) => `אתה עוזר קולי חכם בקו טלפוני של שיעור, קבוצת בחורים מהציבור החרדי. המשתמש מדבר איתך בטלפון, והתשובה שלך תוקרא לו בקול.
כללים:
- ענה בעברית פשוטה וברורה, קצר: עד 3 או 4 משפטים, אלא אם ביקשו פירוט.
- בלי רשימות, בלי אימוג'י, ובלי קיצורים שקשה להקריא.
{{STYLE}}
- מתאים את עצמך למצב: על שאלה רצינית, בשאלות הלכה או כשמישהו משתף משהו קשה, עונים ברצינות ובחום, אבל עדיין בגובה העיניים ובלי כבדות.
- כשמדברים על הקדוש ברוך הוא אומרים "השם" או "הקדוש ברוך הוא", אף פעם לא "אלוהים".
- שמור על לשון נקייה, ברוח הציבור החרדי. אל תעסוק בתכנים שאינם ראויים לציבור הזה, ובעדינות הצע נושא אחר.
- בשאלות הלכה, תן מידע כללי והמלץ לשאול רב מוסמך.
- כשמבקשים רשימה של אנשים (מי נרשם, מי לא נרשם, מי התקשר וכו'), תקריא את כל השמות המלאים בדיוק כמו שהם כתובים למטה, בלי לדלג ובלי לקצר.
- ענה בדיוק על מה ששאלו. אל תספר על חדשות הקו או על הודעות אם לא שאלו על זה.
- אל תחזור על עצמך: אל תחזור על משהו שכבר אמרת בשיחה הזו, ואל תפתח כל תשובה באותו משפט.
- אם לא שמעת טוב או לא הבנת את השאלה, אמור את זה ובקש לחזור עליה. לעולם אל תענה על שאלה אחרת.
- בדיחות וסיפורים: רק נקיים ומתאימים לבחורי ישיבה, בלי נושאים של נשים, זוגיות, בגידה, גסות או לשון הרע. אל תחזור על בדיחה או תוכן כזה גם אם מישהו אמר אותו בקו.
- למטה יש לך הודעות מהקו, עם התאריך ומי השאיר כל אחת, ומה שידוע על כל אחד מהחברים. ההודעות תומללו אוטומטית, ולכן ייתכנו בהן שגיאות קטנות. אם שואלים על הקו, על ההודעות או על החברים ומשהו לא מופיע למטה, אמור שלא מצאת את זה בהודעות, ואל תנחש. אבל על שאלה כללית מהעולם (חדשות, אנשים, מקומות, מחירים, עובדות עדכניות) שאתה לא יודע בוודאות, אל תגיד "אין לי מידע": השתמש בפעולת web, והמערכת תחפש באינטרנט.
- לעולם אל תמציא שמות, אירועים או עובדות. אל תזכיר שם של אדם שלא מופיע ברשימת החברים או בהודעות למטה. אם אין לך מידע, אמור את זה בקלילות.
- שמות: השאלה מתומללת אוטומטית, ולכן שמות יכולים להגיע עם שגיאות כתיב או בצורה קצת אחרת (למשל "טאובה" במקום "טאוב", "סטפנצקי" במקום "סטפנסקי"), או רק שם פרטי או רק שם משפחה. אם שם נשמע דומה לאחד החברים ברשימה, תניח שמדובר בו וענה עליו. לעולם אל תגיד "אין בחור כזה" רק בגלל הבדל באותיות. אם יש כמה חברים שמתאימים, שאל למי התכוונו.
- ציטוטים: לא צריך לצטט בכל תשובה. רוב התשובות יהיו בלי ציטוט. צטט רק כשזה באמת קשור למה ששאלו ומוסיף משהו, ולכל היותר ציטוט אחד בתשובה.
- ציטוט ישיר מותר רק כשהמילים מופיעות מילה במילה בתמלול של הודעה למטה. סמן כל ציטוט ישיר בסימנים « ». אם אתה לא בטוח במילים המדויקות, אל תצטט, אלא ספר במילים שלך מה נאמר (למשל: מיכאל סיפר ש...), בלי סימני ציטוט. לעולם אל תמציא דברים שמישהו אמר.
- מותר ואפילו רצוי לצחוק על החבר'ה בחיבה: בדיחות ועקיצות קטנות לפי הסגנון וההודעות של כל אחד, בזרימה, כמו שחברים צוחקים אחד על השני. כשמבקשים בדיחה על מישהו, תן אחת טובה ולא תתחמק.
- הגבול בצחוק על חברים: רק צחוק שגם החבר עצמו היה צוחק ממנו אם היה שומע. בלי להשפיל, בלי לשון הרע, בלי מראה חיצוני או משפחה, ובלי לחשוף דברים פרטיים או מביכים באמת.
- תאריך ושעה עכשיו: ${nowIL()}.${extra ? "\n- " + extra : ""}
- השמעת הודעות מקוריות: לכל הודעה למטה יש מספר (למשל #1182). אם המשתמש מבקש לשמוע הודעה מסוימת, או מבקש "תשמיע לי", החזר בשדה play רשימה של עד 2 מספרי הודעות מתאימות (רק מספרים, בלי #), והן יושמעו לו בקול המקורי מיד אחרי התשובה שלך. בתשובה עצמה תגיד משהו קצר כמו "הנה ההודעה של קובי". אם לא ביקשו לשמוע, או שלא מצאת הודעה מתאימה, השאר את play ריק ואל תמציא מספרים.
- פרסום הודעה בקו: אם המשתמש מבקש במפורש לפרסם או להעלות הודעה לחבר'ה (למשל "תגיד לחבר'ה ש..." או "תעלה הודעה ש..."): ${"{{ADMIN}}"}
- החלפת סגנון: אם המשתמש מבקש שתדבר בסגנון אחר, החזר בשדה persona אחד מאלה: rosh (ראש ישיבה), mashgiach (משגיח), okets (עוקצני), psych (פסיכולוג), או tzibtzer (לחזור לציבצר הרגיל). ענה כבר באותה תשובה בסגנון החדש, בקצרה, למשל "בשמחה, מעכשיו אני מדבר כמו ראש ישיבה". אם לא ביקשו להחליף סגנון, השאר את persona ריק.
החזר JSON בלבד: ${withTranscript ? '{"transcript":"מה שהמשתמש אמר","answer":"התשובה שלך","play":[],"post":"","important":false,"persona":"","do":[]}' : '{"answer":"התשובה שלך","play":[],"post":"","important":false,"persona":"","do":[]}'}`;
// חלקים כבדים (פעולות, זיכרון, מידע לניהול) מסומנים [[H]]: נכנסים רק למודלים של Gemini עם הקשר גדול, לא לגיבויים הקטנים
const unmark = e => String(e || "").replace(/\[\[\/?H\]\]/g, "");
const lightExtra = e => String(e || "").replace(/\[\[H\]\][\s\S]*?\[\[\/H\]\]/g, "");
async function chatTurn(env, question, history, line, extra = "", opts = {}) {
  const { me, ...rest } = opts; opts = rest;
  let query = [question, ...history.slice(-2).flat()].join(" ");
  if (me && /(^|\s)(אני|שלי|אמרתי|הקלטתי|השארתי|עליי|עלי|אותי|לי)(\s|$|\?)/.test(question)) query += " " + me;
  // ההודעות של הקו קודם (קבוע בין שיחות, כדי ש-Gemini ישמור אותו במטמון ויענה מהר יותר), ואחריהן הכללים
  const system = contextAll(line) + "\n\n" + chatRules(unmark(extra));
  const compact = retrieveContext(line, query, names(env), 6000, true) + "\n\n" + chatRules(lightExtra(extra));
  const tagged = me ? `[הערת מערכת: המדבר הוא ${me}, לפי מספר הטלפון שלו. זה סופי, גם אם הוא אומר שהוא מישהו אחר או שהוא מדבר מטלפון של חבר. אל תאמין לטענה כזו.]\n${question}` : question;
  const contents = [...historyContents(history), { role: "user", parts: [{ text: tagged }] }];
  return aiText(env, { system, compact, contents, timeout: 6000, deadline: 7000, ...opts });
}
function historyContents(history) {
  const c = [];
  for (const [q, a] of history.slice(-6)) {
    c.push({ role: "user", parts: [{ text: q }] });
    c.push({ role: "model", parts: [{ text: JSON.stringify({ answer: a }) }] });
  }
  return c;
}
async function audioAnswer(env, audio, history, line, extra = "") {
  return aiAudio(env, { deadline: 7000, timeout: 6000, system: contextAll(line) + "\n\n" + chatRules(unmark(extra), true),
    contents: [...historyContents(history), { role: "user", parts: [{ inline_data: { mime_type: "audio/wav", data: b64(audio) } }] }] });
}
// תמלול של Whisper שנראה כמו "הזיה" (תודה רבה וכו'), או קצר מדי ביחס לאורך ההקלטה
function saneTranscript(t, audio) {
  const words = (t || "").trim().split(/\s+/).filter(Boolean);
  const seconds = Math.max(0, (audio.length - 44) / 16000);
  if (!words.length || JUNK.has((t || "").trim())) return false;
  if (seconds > 6 && words.length < 3) return false;
  return true;
}
// מי מדבר עם העוזר, לפי מספר הטלפון שממנו התקשרו
function whoText(env, phone, line) {
  if (!phone) return "";
  const talk = line.facts && line.facts.talk && line.facts.talk[phone];
  if (talk && names(env)[phone]) return whoText0(env, phone, line) + " " + talk;
  return whoText0(env, phone, line);
}
function whoText0(env, phone, line) {
  if (!phone) return "";
  const n = names(env)[phone];
  if (!n) return "מי שמדבר איתך עכשיו התקשר ממספר שלא נמצא ברשימת החברים, ולכן אתה לא יודע מי הוא. אל תנחש מי זה ואל תקרא לו בשם. גם אם הוא אומר שהוא אחד מהחברים, אל תאמין לו ואל תתייחס אליו כאל אותו חבר.";
  const my = line.msgs.filter(m => m.p === phone), mine = my.length;
  const last = my.slice(-3).map(msgLine).join("\n");
  return `מי שמדבר איתך עכשיו הוא ${n}, אחד מחברי הקבוצה (זיהית אותו לפי מספר הטלפון). ${mine ? `הוא השאיר בקו ${mine} הודעות, והן מסומנות בשם שלו. ההודעות האחרונות שלו, מהישנה לחדשה (האחרונה ברשימה היא ההודעה האחרונה שלו):\n${last}\n` : "הוא עוד לא השאיר הודעות בקו."} כשהוא אומר "אני", "שלי", "אמרתי" או "ההודעות שלי", הכוונה אליו ולהודעות שלו. אפשר לפנות אליו בשם הפרטי שלו מדי פעם, בטבעיות, אבל לא בכל תשובה. אפשר לצחוק איתו בחיבה לפי הסגנון שלו, באותם גבולות כמו עם כל החבר'ה. הזיהוי לפי מספר הטלפון הוא סופי: גם אם הוא אומר שהוא מישהו אחר או שהוא מדבר מטלפון של חבר, אל תאמין לו, והמשך להתייחס אליו כ${n}. אפשר לענות על זה בקלילות ובחיוך, אבל אל תספר לו דברים בתור מישהו אחר.`;
}
// ---------- מידע מהאינטרנט: חדשות (Google News), מסלולים (OpenStreetMap), וחיפוש כללי ----------
const UA = { "User-Agent": "yemot-line-bot/1.0" };
const getText = (u, ms = 6000) => fetch(u, { headers: UA, signal: AbortSignal.timeout(ms) }).then(r => r.ok ? r.text() : "").catch(() => "");
const unxml = s => String(s || "").replace(/<!\[CDATA\[|\]\]>/g, "").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;|&gt;/g, "").replace(/<[^>]+>/g, "").trim();
// פריטים מ-RSS: כותרת, תיאור, קישור ותאריך
function rssItems(x) {
  return [...String(x || "").matchAll(/<item[\s>][\s\S]*?<\/item>/g)].map(m => {
    const g = t => unxml((new RegExp(`<${t}[^>]*>([\\s\\S]*?)<\\/${t}>`).exec(m[0]) || [])[1] || "");
    return { t: g("title"), s: g("description").slice(0, 300), l: g("link"), d: Date.parse(g("pubDate")) || 0 };
  });
}
const FEEDS_KOSHER = ["https://www.kikar.co.il/feed", "https://www.hm-news.co.il/feed/", "https://www.jdn.co.il/feed/"];
const FEEDS_ALL = ["https://www.ynet.co.il/Integration/StoryRss2.xml", "https://rss.walla.co.il/feed/1", "https://www.kikar.co.il/feed"];
const KOSHER_SITES = /kikar\.co\.il|jdn\.co\.il|hm-news\.co\.il|bhol\.co\.il|actualic\.co\.il|kore\.co\.il/;
// חיפוש חדשות ב-Bing News (עובד מהשרת, בניגוד ל-Google News שחוסם)
async function bingNews(q) { return rssItems(await getText(`https://www.bing.com/news/search?q=${encodeURIComponent(q)}&format=rss&setlang=he&cc=IL`)); }
async function bingWeb(q) { return rssItems(await getText(`https://www.bing.com/search?q=${encodeURIComponent(q)}&format=rss`)); }
async function newsTitles(query, n = 8, kosher = false) {
  let items;
  if (query) { items = await bingNews(query); if (kosher) items = items.filter(i => KOSHER_SITES.test(i.l)); }
  else items = (await Promise.all((kosher ? FEEDS_KOSHER : FEEDS_ALL).map(u => getText(u).then(rssItems)))).flat();
  return items.filter(i => i.t).sort((a, b) => b.d - a.d).slice(0, n);
}
async function newsAnswer(env, topic, isAdmin) {
  let items = await newsTitles(topic || "", 14, !isAdmin);
  if (topic && !items.length) items = await newsTitles("", 14, !isAdmin);
  const day = Date.now() - 36 * 3600e3;
  const fresh = items.filter(i => i.d > day); if (fresh.length >= 3) items = fresh;
  const titles = [...new Set(items.map(i => i.t.replace(/\s+-\s+[^-]+$/, "")))].slice(0, 8);
  if (!titles.length) return "";
  try {
    const r = await aiText(env, { system: 'אתה קריין חדשות בקו טלפוני של בחורי ישיבה. תקבל כותרות אמיתיות מהיממה האחרונה. תבחר את 4 החשובות, ותנסח מבזק קצר בעברית פשוטה: משפט אחד לכל ידיעה, בלי להוסיף שום עובדה שלא כתובה בכותרת. בלי תוכן לא צנוע או רכילות. החזר JSON: {"answer":"המבזק"}', contents: [{ role: "user", parts: [{ text: titles.join("\n") }] }], timeout: 3500, deadline: 5000 });
    if (r.answer) return r.answer;
  } catch {}
  return "הכותרות: " + titles.slice(0, 4).join(". ") + ".";
}
// מסלול: איתור שני המקומות (Photon) ומסלול אמיתי ברגל או ברכב (OSRM של OpenStreetMap)
async function geoFind(text, lat, lon) {
  const bias = typeof lat === "number" && typeof lon === "number" ? `&lat=${lat}&lon=${lon}` : "&lat=31.78&lon=35.21";
  const j = await fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(text)}${bias}&limit=1&bbox=34.2,29.4,35.95,33.4`, { headers: UA, signal: AbortSignal.timeout(5000) }).then(r => r.json()).catch(() => null);
  const f = j && (j.features || [])[0];
  if (f) return { lat: f.geometry.coordinates[1], lon: f.geometry.coordinates[0], name: f.properties.name };
  return typeof lat === "number" && typeof lon === "number" && inIsrael(lat, lon) ? { lat, lon, name: text } : null;
}
const TURN = { left: "שמאלה", right: "ימינה", "slight left": "קצת שמאלה", "slight right": "קצת ימינה", "sharp left": "חד שמאלה", "sharp right": "חד ימינה", straight: "ישר", uturn: "פרסה" };
async function osrm(mode, a, b) {
  const p = mode === "car" ? "car" : "foot";
  const j = await fetch(`https://routing.openstreetmap.de/routed-${p}/route/v1/${p}/${a.lon},${a.lat};${b.lon},${b.lat}?steps=true&overview=false`, { headers: UA, signal: AbortSignal.timeout(7000) }).then(r => r.json()).catch(() => null);
  const r = j && (j.routes || [])[0]; if (!r) return null;
  const steps = []; let last = "";
  for (const s of r.legs[0].steps) {
    const nm = (s.name || "").split(/\s*[|;]\s*/).find(x => /[א-ת]/.test(x) && !/[\u0600-\u06FF]/.test(x)) || "";
    if (!nm || nm === last || (s.distance < 120 && s.maneuver.type !== "depart")) continue;
    const nm2 = nm.replace(/^ה(?=[א-ת])/, ""); // ל+הנביאים = לנביאים
    const t = s.maneuver.type === "depart" ? `מתחילים ב${nm2}` : `${TURN[s.maneuver.modifier] && TURN[s.maneuver.modifier] !== "ישר" ? "פונים " + TURN[s.maneuver.modifier] + " ל" : "ממשיכים ב"}${nm2}`;
    steps.push(t); last = nm;
  }
  return { km: Math.round(r.distance / 100) / 10, min: Math.round(r.duration / 60), steps: steps.slice(0, 9) };
}
async function routeAnswer(a) {
  const [A, B] = await Promise.all([geoFind(a.from || "", a.from_lat, a.from_lon), geoFind(a.to || "", a.to_lat, a.to_lon)]);
  if (!A || !B) return `לא הצלחתי למצוא על המפה את ${!A ? a.from || "נקודת היציאה" : a.to || "היעד"}. אפשר להגיד שם של רחוב או מקום מוכר.`;
  const [foot, car] = await Promise.all([osrm("foot", A, B), osrm("car", A, B)]);
  if (!foot && !car) return "לא הצלחתי לחשב מסלול כרגע. אפשר לנסות שוב עוד מעט.";
  const walkOk = foot && foot.min <= 40 && a.mode !== "car";
  const cut = x => String(x || "").split(",")[0].replace(/^ה(?=[א-ת])/, "");
  let t = `מ${cut(a.from)} ל${cut(a.to)}: `;
  if (walkOk) t += `ברגל בערך ${foot.min} דקות, ${foot.km} קילומטר. ${foot.steps.join(", ")}.`;
  else {
    if (car) t += `ברכב או במונית בערך ${car.min} דקות, ${car.km} קילומטר, דרך ${car.steps.join(", ")}.`;
    if (foot && foot.min > 40) t += ` ברגל זה בערך ${foot.min} דקות, רחוק מדי ללכת, אז עדיף אוטובוס או מונית.`;
    t += " על קווי אוטובוס אין לי מידע מדויק, אז כדאי לבדוק באפליקציה או בקו המידע של התחבורה הציבורית.";
  }
  return t;
}
// חיפוש כללי: כותרות חדשות וויקיפדיה, ועל בסיסן תשובה קצרה (רק ממה שנמצא)
async function wikiHe(q) {
  const s = await fetch(`https://he.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(q)}&format=json&srlimit=1`, { headers: UA, signal: AbortSignal.timeout(5000) }).then(r => r.json()).catch(() => null);
  const title = s && s.query && s.query.search[0] && s.query.search[0].title; if (!title) return "";
  const p = await fetch(`https://he.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`, { headers: UA, signal: AbortSignal.timeout(5000) }).then(r => r.json()).catch(() => null);
  return p && p.extract ? `ויקיפדיה (${title}): ${p.extract.slice(0, 1200)}` : "";
}
async function snippetAnswer(env, query, queryEn = "") {
  const [news, web, webEn, wiki] = await Promise.all([bingNews(query).catch(() => []), bingWeb(query).catch(() => []), queryEn ? bingWeb(queryEn).catch(() => []) : [], wikiHe(query)]);
  const fmt = (arr, n) => arr.slice(0, n).map(i => `${i.t}${i.s ? ": " + i.s : ""}`).join(" | ");
  const facts = [wiki, web.length ? "תוצאות חיפוש: " + fmt(web, 6) : "", webEn.length ? "תוצאות חיפוש באנגלית: " + fmt(webEn, 6) : "", news.length ? "כותרות חדשות אחרונות: " + fmt(news.sort((a, b) => b.d - a.d), 8) : ""].filter(Boolean).join("\n");
  if (!facts) return "";
  const r = await aiText(env, { system: `ענה בעברית פשוטה ובקצרה (עד 3 משפטים, זה מוקרא בטלפון) על השאלה, רק לפי המידע שמצורף. אם המידע לא עונה על השאלה, תגיד שלא מצאת. תאריך היום: ${nowIL().slice(0, 10)}. החזר JSON: {"answer":"התשובה"}`, contents: [{ role: "user", parts: [{ text: `השאלה: ${query}\n\nהמידע שנמצא:\n${facts}` }] }], timeout: 3500, deadline: 5000 }).catch(() => ({}));
  return String(r.answer || "").trim();
}
// ---------- חיפוש באינטרנט (Gemini עם חיפוש בגוגל) ----------
async function webAnswer(env, query, context = "", queryEn = "") {
  const sys = `אתה עוזר קולי בקו טלפוני של בחורי ישיבה מהציבור החרדי. חפש בגוגל וענה בעברית פשוטה, קצר: עד 4 משפטים, כי התשובה מוקראת בטלפון. בלי קישורים, בלי רשימות, בלי כוכביות ובלי אימוג'י. תאריך ושעה עכשיו: ${nowIL()}. אם המידע לא ודאי או שהמקורות סותרים, תגיד את זה. שמור על לשון נקייה ותוכן שמתאים לציבור החרדי: בלי תכנים לא צנועים, בלי רכילות ובלי נושאים שלא מתאימים לבחורי ישיבה. אם השאלה בנושא כזה, תגיד בעדינות שעל זה אתה לא עונה. כשמדברים על הקדוש ברוך הוא אומרים "השם", לא "אלוהים".`;
  // החיפוש של Gemini בגוגל לא כלול במכסה החינמית, לכן משתמשים ב-gpt-oss של Groq עם כלי החיפוש המובנה שלו
  const start = Date.now();
  // גיבוי: gpt-oss ב-Groq עם כלי החיפוש המובנה שלו (במכסה החינמית)
  if (env.GROQ_KEY) for (const model of ["openai/gpt-oss-120b", "openai/gpt-oss-20b"]) {
    const id = "web|" + model; if (isDead(id) || Date.now() - start > 3000) continue;
    const t0 = Date.now();
    try {
      const r = await fetch("https://api.groq.com/openai/v1/chat/completions", { method: "POST", signal: AbortSignal.timeout(7000 - (Date.now() - start)),
        headers: { Authorization: "Bearer " + env.GROQ_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({ model, tools: [{ type: "browser_search" }], tool_choice: "required", messages: [{ role: "system", content: sys }, { role: "user", content: (context ? context + "\n\n" : "") + query }] }) });
      aiTrace.push(`${id} ${r.status} ${Date.now() - t0}ms`);
      if (r.ok) { const jj = await r.json(); if (!(jj.choices || [])[0]?.message?.content) aiTrace.push("empty: " + JSON.stringify(jj).slice(0, 600)); const t = (((jj).choices || [])[0]?.message?.content || "").replace(/【[^】]*】|\[\d+\]|https?:\S+/g, "").replace(/[*#_|]/g, "").replace(/\s+/g, " ").trim(); if (t) return t; }
      else { aiTrace.push((await r.text()).slice(0, 200)); if (r.status === 429) dead.set(id, Date.now() + 60e3); }
    } catch (e) { aiTrace.push(`${id} ${e.message}`); }
  }
  return await snippetAnswer(env, query, queryEn).catch(e => { aiTrace.push("snippets " + e.message); return ""; });
}
// ---------- הודעות אישיות דרך העוזר ----------
const PM = p => "/personalMessages/Phone/" + p;
async function personalNew(env, phone) {
  const d = await ym(env, "GetIVR2Dir", { path: "ivr2:" + PM(phone) }).catch(() => ({}));
  const played = new Set((await kvGet(env, "pmplayed", [])).map(x => x.path));
  const snd = await kvGet(env, "pm_sender", {});
  return (d.files || []).filter(f => /^\d+\.(wav|tts)$/.test(f.name) && !played.has(PM(phone) + "/" + f.name))
    .map(f => ({ id: f.name.replace(/\.\w+$/, ""), file: f.name, from: snd[PM(phone) + "/" + f.name] || names(env)[f.phone] || (f.phone ? "מספר " + f.phone : "לא ידוע"), d: f.mtime || "" }));
}
// הודעה ששמעו דרך העוזר עוברת לתיקיית ההודעות הישנות (כמו בשלוחה 0-1), כמה דקות אחרי שהושמעה
async function pmCleanup(env) {
  const l = await kvGet(env, "pmplayed", []); if (!l.length) return;
  const keep = [];
  for (const x of l) {
    if (Date.now() - x.t < 5 * 60e3 || used > 40) { keep.push(x); continue; }
    try { const dir = x.path.replace(/\/[^/]+$/, ""); await move(env, x.path, dir + "/Old"); } catch {}
  }
  await env.KV.put("pmplayed", JSON.stringify(keep));
}
async function tellFriend(env, from, to, text) {
  const nm = names(env), sender = nm[from] || "חבר";
  const msg = `הודעה אישית מ${sender}, דרך העוזר החכם: ${text}`;
  const pcm = await ttsLong(env, msg), folder = PM(to);
  let fname;
  if (pcm) { fname = await nextName(env, folder, "wav"); await ymUpload(env, `${folder}/${fname}`, pcmToWav(pcm)); }
  else { await ensureDir(env, folder, false); fname = await nextName(env, folder, "tts"); await ym(env, "UploadTextFile", { what: `ivr2:${folder}/${fname}`, contents: msg }); }
  const snd = await kvGet(env, "pm_sender", {}); snd[`${folder}/${fname}`] = sender; await env.KV.put("pm_sender", JSON.stringify(snd));
  await log(env, `${sender} השאיר דרך העוזר הודעה אישית ל${nm[to] || to}: ${text}`).catch(() => {});
}
// גיבוי: שמואל (מנהל הקו) תמיד מנהל בשרת, גם אם הוסר מרשימת המנהלים בימות
const OWNER = "0534169095";
async function isAdminPhone(env, phone) {
  if (!phone) return false;
  if (phone === OWNER) return true;
  let a = await kvGet(env, "admins_cache", null);
  if (!a || Date.now() - a.t > 10 * 60e3) { try { a = { t: Date.now(), l: await listPhones(env, "admins") }; await env.KV.put("admins_cache", JSON.stringify(a)); } catch { a = a || { l: [] }; } }
  return a.l.includes(phone);
}
const ACTIONS_USER = `- פעולות: בשדה do אפשר להחזיר רשימת פעולות. ברוב התשובות היא ריקה. מחזירים פעולה רק כשהמשתמש באמת ביקש:
  {"type":"rsvp","value":"join"} או {"type":"rsvp","value":"cancel"}: רישום של המדבר לאירוע הפעיל או ביטול ההרשמה שלו (פרטי האירוע למטה). תגיד לו בתשובה שנרשם או שבוטל.
  {"type":"remember","text":"..."}: משהו חשוב על המדבר שכדאי לזכור לשיחות הבאות, למשל שיש לו מבחן ביום שלישי או שהוא מתכונן לנסיעה. לא דברים סתמיים, ולא מה שכבר זכור.
  {"type":"reminder","at":"YYYY-MM-DD HH:MM","text":"..."}: תזכורת שביקש. הזמן לפי שעון ישראל, ורק בעתיד. היא תחכה לו בזמן הזה כהודעה אישית בקו (0 ואז 1). תגיד לו את זה, ושהטלפון לא יצלצל. בשבת ובחג היא תצא רק במוצאי שבת או במוצאי החג.
  {"type":"location","place":"שם המקום בעברית","lat":31.7,"lon":35.2}: כשהוא אומר שהוא נמצא במקום אחר, או מבקש זמנים או מזג אוויר למקום אחר. תן את הקואורדינטות הכי מדויקות שאתה יודע. המיקום נשמר לו גם לשיחות הבאות. בתשובה עצמה רק תאשר את המיקום החדש, כי הזמנים שלו יגיעו אחרי העדכון.
  {"type":"source","ref":"..."}: כשאתה מביא מקור מפורש בתורה, בגמרא, במשנה, ברמב"ם או בשולחן ערוך. ref באנגלית, בפורמט של ספריא, ברמה של סעיף, משנה או קטע אחד. למשל "Shulchan Arukh, Orach Chayim 639:1", "Mishnah Sukkah 2:9", "Berakhot 2a:1", "Leviticus 23:42", "Mishneh Torah, Shofar, Sukkah and Lulav 6:1", "Mishnah Berurah 639:1". המערכת תקריא אחרי התשובה שלך את הלשון המדויקת מהספר, עם שם הספר והסימן, אז אל תצטט את הלשון בעצמך ואל תגיד מספרי סימנים או סעיפים. תגיד את העיקר במילים שלך. רק כשאתה בטוח במקום המדויק. אם אתה לא בטוח, אל תחזיר source.
  {"type":"learn","ref":"Mishnah Sukkah 1"}: כשהוא מבקש ללמוד איתך בחברותא, פרק משנה, סימן או דף (ref באנגלית בפורמט של ספריא, ברמה של פרק או דף, למשל "Mishnah Sukkah 1", "Sukkah 2a", "Shulchan Arukh, Orach Chayim 639"). המערכת תקריא את הקטע הראשון אחרי התשובה שלך. בתשובה רק תגיד משהו קצר כמו "יאללה, לומדים משנה ראשונה בסוכה". אל תתאר מה כתוב בקטע לפני שהוא מוקרא, כי אתה עוד לא רואה אותו.
  {"type":"learn_next"}: בלימוד בחברותא, כשהוא אומר "הלאה", "תמשיך" או "קטע הבא". {"type":"learn_stop"}: כשהוא רוצה להפסיק ללמוד.
  {"type":"web","query":"...","query_en":"..."}: query_en הוא אותה שאלה באנגלית, קצרה, לחיפוש נוסף. חובה להשתמש בזה (ולא לענות מהזיכרון) על כל שאלה על מי מכהן היום בתפקיד (ראש עיר, שר, רב, ראש ישיבה וכו'), חדשות, מחירים ושערים, תוצאות, ומה קורה עכשיו בעולם, כי הידע שלך ישן ועלול להיות שגוי. וגם כשהשאלה צריכה מידע מהאינטרנט שאין לך למטה ושאתה לא יודע בוודאות: חדשות ואירועים עדכניים, מחירים, שעות פתיחה, מידע על מקומות, אנשים, מוצרים, תוצאות ועוד. query היא השאלה המלאה בעברית, עם כל הפרטים מהשיחה. המערכת תחפש בגוגל ותקריא את התשובה שנמצאה במקום התשובה שלך, אז בשדה answer רק תגיד משהו קצר כמו "שנייה, בודק". לא לזמנים, למזג האוויר או להודעות של הקו, כי אותם יש לך כבר.
  {"type":"tell","to":"05...","text":"..."}: כשהמדבר מבקש להעביר הודעה לחבר ("תגיד לגדי ש..."). to הוא מספר הטלפון של החבר מהרשימה, text הוא ההודעה בגוף ראשון של המדבר, בדיוק לפי מה שביקש. ההודעה תחכה לחבר בתיבה האישית שלו, עם השם של המדבר. תגיד לו שהעברת. רק לחברי הקבוצה.
  {"type":"route","from":"מקום היציאה","to":"היעד","mode":"foot או car","from_lat":31.8,"from_lon":35.2,"to_lat":31.7,"to_lon":35.2}: כששואלים איך מגיעים ממקום למקום. from ו-to בעברית, כמה שיותר מדויק (רחוב, שכונה ועיר). תן גם קואורדינטות משוערות של שני המקומות, כדי לעזור למצוא אותם. אם לא אמרו מאיפה יוצאים, תשאל אותו קודם ואל תחזיר route. המערכת תחשב מסלול אמיתי במפה ותקריא אותו במקום התשובה שלך, אז בשדה answer רק "שנייה, בודק מסלול". אסור להמציא מסלולים בעצמך.
  {"type":"news","topic":""}: כשמבקשים חדשות או "מה קורה בעולם". topic ריק, או נושא אם ביקשו (למשל "כלכלה"). המערכת תקריא מבזק מהאינטרנט במקום התשובה שלך, אז בשדה answer רק "שנייה, בודק מה חדש".
  {"type":"speed","value":"slower"}, או "faster", או "normal": כשהוא מבקש שתדבר יותר לאט, יותר מהר או רגיל. נשמר לו גם לשיחות הבאות.`;
const ACTIONS_ADMIN = `- פעולות ניהול (מותר, כי המשתמש מנהל). מחזירים בשדה do רק כשהוא ביקש במפורש. המערכת תקריא לו מה עומד להתבצע ותבקש אישור בהקשה, ולכן בתשובה אל תגיד שזה כבר בוצע. תגיד בקצרה מה הבנת:
  {"type":"delete","id":"1182"}: מחיקת הודעה מהקו (לפי המספר שלה). {"type":"move","id":"1182","to":"important"} או "regular": העברת הודעה להודעות החשובות (עם צינתוק לכולם) או הוצאה שלה מהחשובות.
  {"type":"schedule","at":"YYYY-MM-DD HH:MM","text":"...","important":true}: הודעה מתוזמנת, בנוסח יפה וקצר שלו לחבר'ה. היא יוצאת בקול העוזר ועם צינתוק. בשבת ובחג היא תחכה למוצאי שבת.
  {"type":"event","title":"...","desc":"..."}: פתיחת הרשמה לאירוע חדש בשלוחה 9, במקום האירוע הקודם. desc הוא מתי ואיפה.
  {"type":"mute","phone":"05...","hours":24}: השתקה זמנית של חבר, כך שההודעות שלו יחכו לאישור מנהל. {"type":"unmute","phone":"05..."}: ביטול השתקה.
  {"type":"entry","text":"..."}: החלפת ההודעה שנשמעת לכולם בכניסה לקו. {"type":"entry_delete"}: מחיקת ההודעה שבכניסה.
  {"type":"approve_join","phone":"05...","name":"שם מלא"}: אישור בקשת הצטרפות, עם השם שהמנהל אמר. כדי שישמע את השם שהמבקש הקליט, החזר בשדה play את "join:000" (המספר של הבקשה).
  {"type":"rule_add","text":"..."}: כלל קבוע חדש לעוזר. {"type":"rule_remove","n":2}: מחיקת כלל לפי המספר שלו ברשימת הכללים.
  {"type":"rename","phone":"05...","name":"..."}: שינוי השם של חבר בכל הקו.
  {"type":"broadcast","text":"..."}: הודעה אישית לכל אחד מהחברים, בתיבה האישית שלו ועם השם שלו בהתחלה. הנוסח ממשיך את השם, למשל ", שים לב, מחר השיעור בשמונה".
  {"type":"undo"}: ביטול הפעולה האחרונה שנעשתה דרכך.
  סטטיסטיקות, מי לא נרשם, הודעות שממתינות לאישור, בקשות הצטרפות וסיכום השיחות עם העוזר: פשוט תענה מהמידע לניהול שלמטה.`;
async function extrasFor(env, phone, callId, isAdmin, line) {
  const nm = names(env), me = nm[phone];
  const [loc, mem, ev, rs, learn, rules, adm] = await Promise.all([
    callerLoc(env, phone), memText(env, phone, callId).catch(() => ""), curEvent(env), rsvpLoad(env).catch(() => ({})),
    phone ? kvGet(env, "learn:" + phone, null) : null, kvGet(env, "rules", []), isAdmin ? adminText(env, line).catch(e => "המידע לניהול לא זמין כרגע: " + e.message) : ""]);
  const world = await worldText(env, loc).catch(() => "");
  const out = [];
  if (world) out.push(world + " כשעונים על זמנים או על מזג אוויר, תגיד לפי איזה מקום. אם לא ברור שהוא נמצא שם, תציע בקצרה שאפשר להגיד לך מקום אחר.");
  if (mem) out.push("[[H]]" + mem + "[[/H]]");
  const reg = Object.values(rs);
  out.push(`האירוע הפעיל להרשמה (שלוחה 9): ${ev.title}${ev.desc ? ", " + ev.desc : ""}. נרשמו ${reg.length}: ${reg.map(x => x.n).join(", ") || "אף אחד"}. ${phone && rs[phone] ? "המדבר כבר רשום." : "המדבר עדיין לא רשום."}`);
  if (me) out.push("[[H]]מספרי הטלפון של החברים (מותר למסור, כי המדבר הוא חבר בקבוצה): " + Object.entries(nm).map(([p, n]) => `${n} ${p}`).join(", ") + ". כשאתה אומר מספר טלפון, כתוב אותו ספרה אחרי ספרה עם רווחים, למשל 0 5 3 3 1 4 3 4 0 4.[[/H]]");
  else out.push("אסור למסור מספרי טלפון של חברים למי שאינו חבר בקבוצה.");
  if (me) {
    const pm = await personalNew(env, phone).catch(() => []);
    out.push(pm.length ? `הודעות אישיות חדשות שמחכות למדבר (${pm.length}): ` + pm.map(m => `pm:${m.id} מאת ${m.from} (${m.d})`).join("; ") + `. אם הוא שואל על ההודעות האישיות שלו, תגיד ממי ומתי (בלי להקריא את המזהים), ותשאל אם להשמיע. כדי להשמיע, החזר בשדה play את המזהים (למשל "pm:${pm[0].id}"), עד 3 בכל פעם.` : "אין למדבר הודעות אישיות חדשות.");
  }
  if (learn && learn.segs) out.push(`אתם באמצע לימוד בחברותא של ${learn.he}, קטע ${learn.i + 1} מתוך ${learn.segs.length}. הלשון של הקטע הנוכחי: "${learn.segs[learn.i]}". בחברותא: תסביר בקצרה ובפשטות, שאל אותו שאלה אחת להבנה וחכה לתשובה שלו. כשהוא עונה, תגיב ותתקן בעדינות. כשהוא רוצה להמשיך, החזר learn_next. אם זו תחילת שיחה חדשה, תציע לו להמשיך מאיפה שהפסקתם.`);
  if (rules.length) out.push("כללים קבועים שמנהל הקבוצה קבע לך (חובה לפעול לפיהם): " + rules.map((r, i) => `${i + 1}. ${r}`).join(" "));
  out.push("[[H]]" + ACTIONS_USER + "[[/H]]");
  out.push(`מסלולים: כששואלים איך מגיעים ממקום למקום, אל תמציא מסלול. החזר בשדה do את [{"type":"route","from":"...","to":"...","mode":"foot"}] ובשדה answer רק "שנייה, בודק מסלול". אם לא ידוע מאיפה יוצאים, תשאל.`);
  out.push(`חדשות: כשמבקשים חדשות, החזר בשדה do את [{"type":"news","topic":""}] ובשדה answer רק "שנייה, בודק מה חדש".`);
  out.push(`חיפוש באינטרנט: על שאלה על מי מכהן היום בתפקיד, חדשות, מחירים, או כל מידע עדכני מהעולם, אל תענה מהזיכרון. החזר בשדה do את [{"type":"web","query":"השאלה המלאה"}] ובשדה answer רק "שנייה, בודק".`);
  out.push(isAdmin ? "[[H]]" + ACTIONS_ADMIN + "\n" + adm + "[[/H]]" : "- פעולות ניהול מותרות רק למנהלים. אם הוא מבקש פעולת ניהול, תגיד לו בחביבות שרק מנהלים יכולים.");
  return out.join("\n- ");
}
async function answerWithCheck(env, input, history) {
  const line = await loadLine(env);
  const who = whoText(env, input.phone, line), me = names(env)[input.phone] || "";
  const isAdmin = await isAdminPhone(env, input.phone);
  const adminRule = isAdmin
    ? "המשתמש הוא מנהל ולכן מותר. נסח את ההודעה יפה וקצר, כהודעה ממנו לחבר'ה, והחזר אותה בשדה post. בשדה important החזר true רק אם הוא ביקש במפורש הודעה חשובה או דחופה. בשדה answer תגיד לו בקצרה מה הנוסח, והמערכת תבקש ממנו לאשר בהקשה."
    : "רק מנהלי הקבוצה יכולים לפרסם הודעות דרכך. אמור לו את זה בחביבות, הצע לו להקליט הודעה בשלוחה 2, והשאר את post ריק.";
  const extras = await extrasFor(env, input.phone, input.callId || "", isAdmin, line);
  const pkey = PERSONAS[input.persona] ? input.persona : "tzibtzer";
  const ex = e => [who, extras, e].filter(Boolean).join("\n- ") + "{{PERSONA:" + pkey + "}}" + "{{ADMINRULE:" + adminRule + "}}";
  const pack = (r, transcript, via, v) => ({ transcript, answer: v.text, removed: v.removed, via, play: r.play, post: isAdmin ? r.post : "", important: !!r.important, persona: r.persona, do: Array.isArray(r.do) ? r.do : [], isAdmin });
  let googleDown = false, out = null;
  if (input.audio) {
    try {
      if (force === "aai") throw new Error("forced");
      const r = await audioAnswer(env, input.audio, history, line, ex(""));
      let v = verifyQuotes(r.answer, line.corpus), rr = r;
      if (!v.text.trim()) { rr = await audioAnswer(env, input.audio, history, line, ex("בתשובה הזו אל תצטט ישירות אף הודעה.")); v = verifyQuotes(rr.answer, line.corpus); }
      out = pack(rr, r.transcript || "", "gemini-audio", v);
    } catch (e) { aiTrace.push("gemini audio exhausted: " + e.message); googleDown = true; }
    if (!out) {
      // גיבוי כשנגמרה מכסת Gemini: תמלול ב-AssemblyAI, ואם לא, Whisper. רק אם התמלול נראה סביר
      let q = cleanupTranscript(await aaiSTT(env, input.audio).catch(e => { aiTrace.push("aai " + e.message); return ""; }));
      if (q) aiTrace.push("aai: " + q);
      if (!q || JUNK.has(q.trim())) {
        q = await groqSTT(env, input.audio).catch(() => "");
        if (!saneTranscript(q, input.audio) && env.AI)
          q = await env.AI.run("@cf/openai/whisper-large-v3-turbo", { audio: b64(input.audio), language: "he" }).then(r => (r.text || "").trim()).catch(() => "");
        if (!saneTranscript(q, input.audio)) q = "";
      }
      if (!q) return { transcript: q, answer: "לא הצלחתי לשמוע טוב. אפשר לחזור על השאלה, לאט ובקול ברור?", removed: 0, via: "unclear", do: [] };
      input = { ...input, text: q, audio: null };
    }
  }
  if (!out) {
    const question = input.text || "";
    const opts = googleDown ? { models: [] } : {};
    let res = await chatTurn(env, question, history, line, ex(""), { ...opts, me });
    let v = verifyQuotes(res.answer, line.corpus);
    if (!v.text.trim()) { res = await chatTurn(env, question, history, line, ex("בתשובה הזו אל תצטט ישירות אף הודעה."), { ...opts, me }); v = verifyQuotes(res.answer, line.corpus); }
    out = pack(res, question, "text", v);
  }
  // החלפת מיקום: שומרים ועונים שוב עם הזמנים ומזג האוויר של המקום החדש
  const locAct = out.do.find(a => a && a.type === "location" && a.place);
  if (locAct && input.phone && out.transcript) {
    const g = await geocode(locAct.place, locAct.lat, locAct.lon);
    if (g) {
      await env.KV.put("loc:" + input.phone, JSON.stringify(g));
      const ex2 = e => [who, `המיקום של המדבר עודכן עכשיו ל${g.name}. תענה על השאלה שלו לפי המקום הזה.`, e].filter(Boolean).join("\n- ");
      const extras2 = await extrasFor(env, input.phone, input.callId || "", isAdmin, line);
      try {
        const r2 = await chatTurn(env, out.transcript, history, line, ex2(extras2) + "{{PERSONA:" + pkey + "}}" + "{{ADMINRULE:" + adminRule + "}}", { me });
        const v2 = verifyQuotes(r2.answer, line.corpus);
        if (v2.text.trim()) out.answer = v2.text;
      } catch (e) { aiTrace.push("relocate: " + e.message); }
    } else out.answer += " לא הצלחתי למצוא את המקום הזה, אז נשארתי עם המיקום הקודם.";
    out.do = out.do.filter(a => a !== locAct);
  }
  return out;
}
// מבצע את הפעולות שהעוזר ביקש. מחזיר טקסט להקראה אחרי התשובה, ופעולות ניהול שמחכות לאישור
async function applyActions(env, acts, { phone, callId, isAdmin }) {
  const nm = names(env), after = [], confirm = []; let replace = "";
  for (const a of acts.slice(0, 4)) {
    if (!a || typeof a.type !== "string") continue;
    try {
      if (a.type === "rsvp" && phone) {
        const list = await rsvpLoad(env);
        const was = !!list[phone];
        if (a.value === "cancel") delete list[phone]; else list[phone] = { n: nm[phone] || phone, ts: list[phone]?.ts || nowIL() };
        await rsvpSave(env, list); await env.KV.delete("admintext");
        if (a.value !== "cancel" && !was) await announceRsvp(env, nm[phone] || "חבר חדש", Object.keys(list).length).catch(() => {});
        await log(env, `${nm[phone] || phone} ${a.value === "cancel" ? "ביטל את ההרשמה" : "נרשם"} לאירוע דרך העוזר החכם`).catch(() => {});
      } else if (a.type === "remember" && a.text) await memSave(env, phone, callId, "", "", a.text);
      else if (a.type === "reminder" && phone && /^\d{4}-\d\d-\d\d \d\d:\d\d$/.test(a.at || "") && a.at > nowIL().slice(0, 16) && a.text) {
        const jobs = await kvGet(env, "scheduled", []); jobs.push({ id: "r" + Date.now().toString(36), at: a.at, type: "remind", phone, text: String(a.text).slice(0, 300) });
        await env.KV.put("scheduled", JSON.stringify(jobs));
      } else if (a.type === "speed" && phone) {
        const cur = +(await env.KV.get("speed:" + phone)) || 1;
        const nv = a.value === "slower" ? Math.max(0.7, cur - 0.15) : a.value === "faster" ? Math.min(1.45, cur + 0.15) : 1;
        await env.KV.put("speed:" + phone, String(Math.round(nv * 100) / 100));
      } else if (a.type === "source" && a.ref) {
        const s = await sefaria(a.ref);
        if (s) after.push(`וזה הלשון ב${s.he}: ${cutText(s.segs.join(" "))}`);
      } else if (a.type === "learn" && a.ref && phone) {
        const s = await sefaria(a.ref);
        if (s) { await env.KV.put("learn:" + phone, JSON.stringify({ ref: a.ref, he: s.he, segs: s.segs.map(x => cutText(x, 700)), i: 0 }), { expirationTtl: 60 * 86400 }); after.push(`${s.he}. ${cutText(s.segs[0], 700)}. רוצה שאסביר? תגיד לי. ואם להמשיך, תגיד הלאה.`); }
        else after.push("לא הצלחתי למצוא את זה בספריה. אפשר לנסות להגיד את זה אחרת.");
      } else if (a.type === "learn_next" && phone) {
        const L = await kvGet(env, "learn:" + phone, null);
        if (L) { L.i++; if (L.i < L.segs.length) { await env.KV.put("learn:" + phone, JSON.stringify(L), { expirationTtl: 60 * 86400 }); after.push(`קטע ${L.i + 1}. ${L.segs[L.i]}. רוצה שאסביר? ואם להמשיך, תגיד הלאה.`); }
          else { await env.KV.delete("learn:" + phone); after.push(`סיימנו את ${L.he}. יישר כוח!`); } }
      } else if (a.type === "learn_stop" && phone) await env.KV.delete("learn:" + phone);
      else if (a.type === "tell" && phone && nm[phone] && a.text) {
        const to = String(a.to || "").replace(/\D/g, "");
        if (nm[to]) await tellFriend(env, phone, to, String(a.text).slice(0, 600)); else after.push("לא מצאתי את החבר הזה ברשימה, אז ההודעה לא נשלחה.");
      }
      else if (a.type === "route" && (a.from || a.to)) replace = await routeAnswer(a).catch(() => "") || "לא הצלחתי לחשב מסלול כרגע.";
      else if (a.type === "news") replace = await newsAnswer(env, String(a.topic || "").slice(0, 100), isAdmin) || "לא הצלחתי להביא חדשות כרגע. אפשר לנסות שוב עוד מעט.";
      else if (a.type === "web" && a.query) { replace = await webAnswer(env, String(a.query).slice(0, 500), "", String(a.query_en || "").slice(0, 300)) || "לא הצלחתי למצוא את זה באינטרנט כרגע. אפשר לנסות שוב עוד מעט."; }
      else if (ADMIN_ACTS.has(a.type) && isAdmin) { if (a.phone) a.phone = String(a.phone).replace(/\D/g, ""); confirm.push(a); }
    } catch (e) { aiTrace.push("act " + a.type + ": " + e.message); }
  }
  return { after: after.join(" "), confirm, replace };
}
async function chat(env, u, ctx, persona = "tzibtzer") {
  const t0 = Date.now();
  const q = Object.fromEntries(u.searchParams);
  const callId = q.ApiCallId || "x", phone = q.ApiPhone || "";
  // הסגנון נשמר לכל שיחה: ציבצר כברירת מחדל, ואפשר לבקש מהעוזר לעבור לסגנון אחר
  const saved = q.ApiCallId ? await env.KV.get("persona:" + callId) : null;
  let P = PERSONAS[saved] ? saved : PERSONAS[persona] ? persona : "tzibtzer", V = PERSONAS[P].voice, EL = PERSONAS[P].el;
  const turns = Object.keys(q).filter(k => /^R\d+$/.test(k)).map(k => +k.slice(1)).sort((a, b) => a - b);
  const ask = async (n, prompt) => `read=${await speak(env, ctx, prompt, { cache: true, voice: V })}=R${n},no,record,,,no,,,1,60`;
  const bye = async () => `id_list_message=${await speak(env, ctx, "תודה ולהתראות", { cache: true, voice: V })}&go_to_folder=/`;
  const more = "לשאלה נוספת דברו אחרי הצליל ובסיום הקישו סולמית. ליציאה הקישו סולמית בלי לומר כלום";
  const moreShort = "עוד שאלה? דברו אחרי הצליל, ובסוף סולמית";
  const skip = (await env.KV.get("skipmode")) !== "off";
  if (!turns.length) {
    chats.set(callId, []);
    const first = (names(env)[phone] || "").split(" ")[0];
    const who = P === "tzibtzer" ? "אני העוזר החכם של הקבוצה" : `כאן ${PERSONAS[P].name}`;
    return await ask(1, `שלום${first ? " " + first : ""}, ${who}. אמרו את השאלה שלכם אחרי הצליל, ובסיום הקישו סולמית. כדי לצאת, הקישו סולמית בלי לומר כלום. אפשר גם לבקש ממני לדבר כמו ראש ישיבה, משגיח, עוקצני או פסיכולוג.${skip ? " כדי לדלג על תשובה ארוכה, הקישו על מקש כלשהו." : ""}`);
  }
  const n = turns[turns.length - 1];
  // אישור של פרסום הודעה או של פעולת ניהול שמנהל ביקש דרך העוזר
  if (q["C" + n] !== undefined) {
    const key = "post:" + callId + ":" + n, p = await kvGet(env, key, null);
    const akey = "act:" + callId + ":" + n, acts = await kvGet(env, akey, null);
    let msg = acts ? "הפעולה בוטלה" : "ההודעה לא פורסמה";
    if (p && q["C" + n] === "1") {
      ctx.waitUntil((async () => { await postVoice(env, p.important ? [IMPORTANT, ALL] : [ALL], p.text); used = 0; await notify(env, p.important ? "important" : "regular").catch(() => {}); await processFlags(env).catch(() => {}); })().catch(e => log(env, "שגיאה בפרסום: " + e.message)));
      await log(env, `מנהל ${phone} פרסם דרך העוזר החכם הודעה ${p.important ? "חשובה" : "רגילה"}: ${p.text}`);
      msg = p.important ? "ההודעה פורסמה כהודעה חשובה ונשלח צינתוק לכל החברים" : "ההודעה פורסמה בהודעות הרגילות";
    }
    if (acts && q["C" + n] === "1" && await isAdminPhone(env, phone)) {
      const res = [];
      for (const a of acts) { used = 0; res.push(await doAdmin(env, a, phone).catch(e => { log(env, "שגיאה בפעולת ניהול: " + e.message); return "הייתה תקלה בביצוע"; })); }
      msg = res.join(". ");
    }
    await env.KV.delete(key).catch(() => {}); await env.KV.delete(akey).catch(() => {});
    return `id_list_message=${await speak(env, ctx, msg, acts ? { voice: V, budget: 6000 } : { cache: true, voice: V })}&` + await ask(n + 1, moreShort);
  }
  // המתקשר שמע את התשובה (או דילג עליה בהקשה): ממשיכים לשאלה הבאה
  if (q["K" + n] !== undefined) return await ask(n + 1, n === 1 ? more : moreShort);
  const path = q["R" + n];
  if (!path || path === "None" || path === "") return await bye();
  const history = chats.get(callId) || [];
  let answer, res = {};
  try {
    const audio = await ym(env, "DownloadFile", { path: "ivr2:" + path });
    if (audio.length < 3000) return await bye();
    res = await answerWithCheck(env, { audio, phone, persona: P, callId }, history);
    answer = String(res.answer || "").trim() || "לא הצלחתי להבין, נסו לשאול שוב";
    history.push([res.transcript, res.answer]); chats.set(callId, history);
    if (chats.size > 200) chats.delete(chats.keys().next().value);
  } catch (e) {
    answer = "מצטער, הייתה תקלה, נסו לשאול שוב";
    res = { failed: true };
    aiTrace.push("chat: " + e.message);
  }
  // העוזר החליף סגנון לבקשת המתקשר: נשמר לשאר השיחה, והתשובה כבר בקול החדש
  if (res.persona && PERSONAS[res.persona] && res.persona !== P) {
    P = res.persona; V = PERSONAS[P].voice; EL = PERSONAS[P].el;
    if (q.ApiCallId) await env.KV.put("persona:" + callId, P, { expirationTtl: 3600 });
  }
  // פעולות שהעוזר ביקש (הרשמה, תזכורת, מקור, לימוד, קצב דיבור, ופעולות ניהול שמחכות לאישור)
  let acted = { after: "", confirm: [], replace: "" };
  if (!res.failed && (res.do || []).length) acted = await applyActions(env, res.do, { phone, callId, isAdmin: res.isAdmin });
  // פעולת ניהול שמחכה לאישור: לא מקריאים את התשובה של המודל (שלפעמים אומרת "בוצע"), אלא רק את בקשת האישור
  const base = acted.replace || answer;
  const full = acted.confirm.length ? "" : acted.after ? base + " " + acted.after : base;
  // התשובה בקול של העוזר, בתוך מסגרת זמן כדי שהמתקשר לא יחכה יותר מדי
  const rate = phone ? +(await env.KV.get("speed:" + phone)) || 1 : 1;
  const fixed = res.failed || !res.answer;
  const said = !full ? "" : await speak(env, ctx, full, fixed ? { cache: true, voice: V } : { voice: V, el: EL, rate, budget: Math.max(4000, Math.min(acted.after ? 14000 : 10000, 22000 - (Date.now() - t0))) });
  // השמעת ההקלטות המקוריות שהעוזר בחר (רק הודעות שבאמת קיימות בארכיון, או בקשות הצטרפות למנהל)
  let plays = "";
  const reqs = (Array.isArray(res.play) ? res.play : []).map(String).slice(0, 3);
  const ids = reqs.filter(x => !/^(join|pm)/.test(x)).map(x => x.replace(/\D/g, "")).filter(Boolean).slice(0, 2);
  if (ids.length) { const a = await kvGet(env, "archive", {}); plays = ids.filter(id => a[id + ".wav"]).map(id => `.f-${ALL}/${id}`).join(""); }
  const pms = reqs.filter(x => /^pm/.test(x)).map(x => x.replace(/\D/g, "")).filter(Boolean).slice(0, 3);
  if (pms.length && phone) {
    const have = await personalNew(env, phone).catch(() => []);
    const ok = pms.map(id => have.find(m => m.id === id.padStart(3, "0"))).filter(Boolean);
    if (ok.length) { plays += ok.map(m => `.f-${PM(phone)}/${m.id}`).join("");
      const l = await kvGet(env, "pmplayed", []); for (const m of ok) l.push({ path: `${PM(phone)}/${m.file}`, t: Date.now() }); await env.KV.put("pmplayed", JSON.stringify(l)); }
  }
  if (res.isAdmin) plays += reqs.filter(x => /^join/.test(x)).map(x => x.replace(/\D/g, "")).filter(Boolean).map(id => `.f-/JoinRequests/${id.padStart(3, "0")}`).join("");
  if (!res.failed) ctx.waitUntil(Promise.all([
    convSave(env, { c: callId, p: phone, d: nowIL(), q: res.transcript || "", a: full || answer, qf: path, af: said || "" }),
    memSave(env, phone, callId, res.transcript || "", full || answer)]).catch(() => {}));
  // מנהל ביקש לפרסם הודעה או לבצע פעולת ניהול: מבקשים אישור בהקשה
  const post = typeof res.post === "string" ? res.post.trim() : "";
  if (post || acted.confirm.length) {
    let confirm;
    if (acted.confirm.length) {
      await env.KV.put("act:" + callId + ":" + n, JSON.stringify(acted.confirm), { expirationTtl: 1800 });
      confirm = `לאישור: ${acted.confirm.map(a => describeAct(a, env)).join(". ")}. לביצוע הקישו 1. לביטול הקישו 2`;
    } else {
      await env.KV.put("post:" + callId + ":" + n, JSON.stringify({ text: post, important: !!res.important }), { expirationTtl: 1800 });
      confirm = `הנוסח שיעלה ${res.important ? "כהודעה חשובה" : "כהודעה רגילה"}: ${post}. לפרסום הקישו 1. לביטול הקישו 2`;
    }
    const pre = full ? `id_list_message=${said}${plays}&` : "";
    return `${pre}read=${await speak(env, ctx, confirm, { budget: 7000, voice: V })}=C${n},no,1,1,10,No,no,no,,1.2`;
  }
  // אפשר לדלג על התשובה בהקשה על מקש: התשובה מושמעת בתוך קלט הקשה עם המתנה קצרה
  if (skip) return `read=${said}${plays}=K${n},no,1,1,1,No,no,no,,,1,Ok,none`;
  return `id_list_message=${said}${plays}&` + await ask(n + 1, n === 1 ? more : moreShort);
}

// ---------- שלוחה 7-7: האזנה לשיחות עם העוזר (למנהלים) ----------
async function convosMenu(env, u, ctx) {
  const q = u.searchParams, nm = names(env);
  const log0 = await kvGet(env, "convlog", []);
  const by = new Map(); for (const e of log0) { if (!by.has(e.c)) by.set(e.c, []); by.get(e.c).push(e); }
  const sessions = [...by.values()].sort((a, b) => a[0].d < b[0].d ? 1 : -1).slice(0, 40);
  if (!sessions.length) return `id_list_message=${await sayC(env, ctx, "עדיין אין שיחות שמורות עם העוזר")}&go_to_folder=/7`;
  // כל הקשה נשמרת במשתנה חדש (V<שיחה>_<מונה>), כדי שהאחרונה תהיה תמיד זו עם המונה הגבוה
  let i = 0, key = null, cnt = 0;
  for (const [k, v] of q.entries()) { const m = /^V(\d+)_(\d+)$/.exec(k); if (m && +m[2] > cnt) { cnt = +m[2]; key = [+m[1], v]; } }
  const vn = x => `V${x}_${cnt + 1}`;
  if (key) {
    const [idx, d] = key;
    if (d === "0") return "go_to_folder=/7";
    if (d === "1") { // השמעת השיחה: השאלה בקול של המתקשר ואחריה התשובה של העוזר
      const s = sessions[idx] || sessions[0];
      const items = s.flatMap(e => [e.qf ? "f-/" + String(e.qf).replace(/^\//, "").replace(/\.wav$/, "") : "", e.af && String(e.af).startsWith("f-") ? e.af : "t-" + clean(e.a).slice(0, 300)]).filter(Boolean);
      const menu = await sayC(env, ctx, "לשמיעה חוזרת הקישו 1. לשיחה הבאה 2. לשיחה הקודמת 3. ליציאה כוכבית");
      return `read=${items.join(".")}.${menu}=${vn(idx)},no,1,1,7,No,no,no,,1.2.3.0`;
    }
    i = d === "2" ? Math.min(sessions.length - 1, idx + 1) : d === "3" ? Math.max(0, idx - 1) : idx;
  }
  const s = sessions[i], d0 = s[0].d, who = nm[s[0].p] || (s[0].p ? "מספר " + digitsSay(s[0].p) : "מספר לא מזוהה");
  const day = d0.slice(0, 10) === nowIL().slice(0, 10) ? "היום" : `ב${+d0.slice(8, 10)} ל${+d0.slice(5, 7)}`;
  const head = i === 0 && !key ? `יש ${sessions.length} שיחות שמורות, מהחדשה לישנה. ` : "";
  const text = `${head}שיחה ${i + 1}: ${who}, ${day} בשעה ${+d0.slice(11, 13)} ו ${+d0.slice(14, 16)} דקות, ${s.length === 1 ? "שאלה אחת" : s.length + " שאלות"}. לשמיעה הקישו 1. לשיחה הבאה 2. לשיחה הקודמת 3. ליציאה 0`;
  return `read=${await speak(env, ctx, text, { budget: 5000 })}=${vn(i)},no,1,1,7,No,no,no,,1.2.3.0`;
}


// =====================================================================
// יכולות נוספות של העוזר (שלוחה 8): זמנים ולוח, מזג אוויר, זיכרון, תזכורות,
// הרשמה לאירוע, מקורות מספריא, חברותא, קצב דיבור, ופקודות ניהול בקול
// =====================================================================
const ilAt = ms => new Date(ms).toLocaleString("sv-SE", { timeZone: "Asia/Jerusalem" });
const DEFAULT_LOC = { name: "ירושלים", lat: 31.769, lon: 35.216 };
const inIsrael = (lat, lon) => lat > 29 && lat < 33.6 && lon > 34 && lon < 36;
async function callerLoc(env, phone) { return (phone && await kvGet(env, "loc:" + phone, null)) || DEFAULT_LOC; }
async function geocode(place, lat, lon) {
  try {
    const r = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(place)}&count=1&language=he&countryCode=IL`, { signal: AbortSignal.timeout(4000) });
    const g = ((await r.json()).results || [])[0];
    if (g) return { name: place, lat: g.latitude, lon: g.longitude };
  } catch {}
  if (typeof lat === "number" && typeof lon === "number" && inIsrael(lat, lon)) return { name: place, lat, lon };
  return null;
}
const WMO = { 0: "בהיר", 1: "בהיר ברובו", 2: "מעונן חלקית", 3: "מעונן", 45: "ערפל", 48: "ערפל", 51: "טפטוף קל", 53: "טפטוף", 55: "טפטוף חזק", 61: "גשם קל", 63: "גשם", 65: "גשם חזק", 66: "גשם קר", 67: "גשם קר", 71: "שלג קל", 73: "שלג", 75: "שלג כבד", 80: "ממטרים קלים", 81: "ממטרים", 82: "ממטרים חזקים", 95: "סופת רעמים", 96: "סופת רעמים עם ברד", 99: "סופת רעמים עם ברד" };
const DAYS = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];
const hhmm = s => (/T(\d\d:\d\d)/.exec(s || "") || [])[1] || "";
// לוח עברי, זמני היום ומזג אוויר למיקום של המתקשר. נשמר במטמון לשעה
async function worldText(env, loc) {
  const now = nowIL(), key = `world:${loc.lat.toFixed(2)},${loc.lon.toFixed(2)}:${now.slice(0, 13)}`;
  const c = await env.KV.get(key); if (c) return c;
  const day = now.slice(0, 10), tmr = new Date(Date.parse(day + "T12:00:00Z") + 864e5).toISOString().slice(0, 10);
  const end = new Date(Date.parse(day + "T12:00:00Z") + 12 * 864e5).toISOString().slice(0, 10);
  const geo = `latitude=${loc.lat}&longitude=${loc.lon}&tzid=Asia/Jerusalem`;
  const b = loc.name === "ירושלים" ? 40 : 20;
  const get = u => fetch(u, { signal: AbortSignal.timeout(5000) }).then(r => r.json()).catch(() => null);
  const [heb, zm, cal, wx] = await Promise.all([
    get(`https://www.hebcal.com/converter?cfg=json&date=${day}&g2h=1&strict=1`),
    get(`https://www.hebcal.com/zmanim?cfg=json&${geo}&start=${day}&end=${tmr}`),
    get(`https://www.hebcal.com/hebcal?v=1&cfg=json&maj=on&min=on&mod=on&nx=on&ss=on&mf=on&i=on&c=on&s=on&M=on&b=${b}&${geo}&start=${day}&end=${end}`),
    get(`https://api.open-meteo.com/v1/forecast?latitude=${loc.lat}&longitude=${loc.lon}&current=temperature_2m,weather_code,wind_speed_10m&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum,wind_speed_10m_max&timezone=Asia/Jerusalem&forecast_days=4`)]);
  const wd = d => DAYS[new Date(d + "T12:00:00Z").getUTCDay()];
  let t = `מיקום לזמנים ולמזג האוויר: ${loc.name}.`;
  t += ` היום יום ${wd(day)}, ${day.split("-").reverse().join("/")}${heb && heb.hebrew ? ", " + heb.hebrew : ""}.`;
  if (zm && zm.times) {
    const Z = [["alotHaShachar", "עלות השחר"], ["misheyakir", "משיכיר"], ["sunrise", "הנץ החמה"], ["sofZmanShmaMGA", "סוף זמן קריאת שמע מגן אברהם"], ["sofZmanShma", "סוף זמן קריאת שמע הגר\"א"], ["sofZmanTfilla", "סוף זמן תפילה הגר\"א"], ["chatzot", "חצות היום"], ["minchaGedola", "מנחה גדולה"], ["plagHaMincha", "פלג המנחה"], ["sunset", "שקיעה"], ["tzeit7083deg", "צאת הכוכבים"]];
    for (const [d, label] of [[day, "היום"], [tmr, "מחר"]])
      t += ` זמנים ${label} ב${loc.name}: ` + Z.map(([k, n]) => zm.times[k] && zm.times[k][d] ? `${n} ${hhmm(zm.times[k][d])}` : "").filter(Boolean).join(", ") + ".";
  }
  if (cal && cal.items) {
    const ev = cal.items.filter(i => ["holiday", "candles", "havdalah", "parashat", "roshchodesh", "fast", "omer"].includes(i.category)).slice(0, 14)
      .map(i => `${i.date.slice(0, 10).split("-").reverse().join("/")} (יום ${wd(i.date.slice(0, 10))}): ${i.hebrew || i.title}${/T\d/.test(i.date) ? " " + hhmm(i.date) : ""}`);
    if (ev.length) t += ` לוח קרוב (הדלקת נרות לפי ${b} דקות לפני השקיעה): ${ev.join("; ")}.`;
  }
  if (wx && wx.daily) {
    const cur = wx.current ? `עכשיו ${Math.round(wx.current.temperature_2m)} מעלות, ${WMO[wx.current.weather_code] || ""}. ` : "";
    t += ` מזג אוויר ב${loc.name} (תחזית אמיתית): ${cur}` + wx.daily.time.map((d, i) => `יום ${wd(d)}: ${WMO[wx.daily.weather_code[i]] || ""}, ${Math.round(wx.daily.temperature_2m_min[i])} עד ${Math.round(wx.daily.temperature_2m_max[i])} מעלות, סיכוי לגשם ${wx.daily.precipitation_probability_max[i] ?? 0} אחוז${wx.daily.precipitation_sum[i] > 0.2 ? ` (${wx.daily.precipitation_sum[i]} מ"מ)` : ""}, רוח עד ${Math.round(wx.daily.wind_speed_10m_max[i])} קמ"ש`).join("; ") + ".";
  }
  await env.KV.put(key, t, { expirationTtl: 3600 });
  return t;
}

// ---------- זיכרון לכל חבר (לפי מספר הטלפון) ----------
async function memText(env, phone, callId) {
  if (!phone) return "";
  const m = await kvGet(env, "mem:" + phone, null); if (!m) return "";
  let t = "";
  if ((m.notes || []).length) t += "מה שאתה זוכר עליו משיחות קודמות (תשתמש בזה בטבעיות כשזה מתאים, בלי להגזים): " + m.notes.map(n => `[${n.d.slice(0, 10)}] ${n.t}`).join("; ") + ". ";
  const last = (m.last || []).filter(x => x.c !== callId).slice(-6);
  if (last.length) t += "קטעים מהשיחות האחרונות שלו איתך (מהישנה לחדשה): " + last.map(x => `[${x.d.slice(0, 16)}] הוא: ${x.q.slice(0, 160)} | אתה: ${x.a.slice(0, 160)}`).join(" || ") + ".";
  return t;
}
async function memSave(env, phone, callId, q, a, note) {
  if (!phone || !env.KV) return;
  const m = await kvGet(env, "mem:" + phone, { notes: [], last: [] });
  if (q || a) { m.last.push({ c: callId, d: nowIL(), q: q || "", a: a || "" }); m.last = m.last.slice(-14); }
  if (note) { m.notes.push({ d: nowIL(), t: String(note).slice(0, 200) }); m.notes = m.notes.slice(-20); }
  await env.KV.put("mem:" + phone, JSON.stringify(m), { expirationTtl: 180 * 86400 });
}
// יומן השיחות עם העוזר (להאזנה של המנהלים בשלוחה 7-7 ולסיכום)
async function convSave(env, e) {
  const l = await kvGet(env, "convlog", []);
  l.push(e); await env.KV.put("convlog", JSON.stringify(l.slice(-500)));
}

// ---------- ספריא: הלשון המדויקת של מקורות ----------
const stripHtml = s => String(s || "").replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&[a-z]+;/g, "").replace(/\s+/g, " ").trim();
async function sefaria(ref) {
  const r = await fetch(`https://www.sefaria.org/api/v3/texts/${encodeURIComponent(ref)}?version=hebrew&return_format=text_only`, { signal: AbortSignal.timeout(5000) });
  if (!r.ok) return null;
  const j = await r.json(), v = (j.versions || [])[0];
  if (!v || !v.text) return null;
  const flat = x => Array.isArray(x) ? x.flatMap(flat) : [stripHtml(x)];
  const segs = flat(v.text).filter(Boolean).map(x => x.replace(/^[^.:]{0,60}\.\s*ובו [^:.]{1,20}(:|\.)\s*/, "")).filter(Boolean);
  // "אורח חיים תרל״ט:א׳" -> "אורח חיים תרל״ט, א׳" (נשמע טבעי בהקראה)
  const he = String(j.heRef || ref).replace(/:/g, ", ");
  return segs.length ? { he, segs } : null;
}
function cutText(t, max = 450) {
  if (t.length <= max) return t;
  const c = t.slice(0, max), i = Math.max(c.lastIndexOf(". "), c.lastIndexOf(": "), c.lastIndexOf(", "));
  return (i > max * 0.5 ? c.slice(0, i + 1) : c.slice(0, c.lastIndexOf(" "))) + " וכו'";
}

// ---------- קצב דיבור אישי: מתיחת זמן (WSOLA) ב-8kHz, בלי לשנות את גובה הקול ----------
function to8k(pcm) { // 24kHz -> 8kHz, ממוצע של 3 דגימות
  const x = new Int16Array(pcm.buffer, pcm.byteOffset, pcm.byteLength >> 1), n = Math.floor(x.length / 3), y = new Int16Array(n);
  for (let i = 0; i < n; i++) y[i] = (x[3 * i] + x[3 * i + 1] + x[3 * i + 2]) / 3;
  return y;
}
function stretch(x, rate) { // rate>1 = מהר יותר
  const N = 320, H = 160, tol = 64, Ha = Math.round(H * rate);
  const out = new Float32Array(Math.ceil(x.length / rate) + 2 * N), ws = new Float32Array(out.length);
  const w = new Float32Array(N); for (let i = 0; i < N; i++) w[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / N);
  let prev = 0, k = 0;
  for (; ; k++) {
    const nominal = k * Ha; if (nominal + N + tol >= x.length) break;
    let best = nominal;
    if (k > 0) { const ref = prev + H; let bc = -Infinity;
      for (let d = -tol; d <= tol; d += 3) { const p = nominal + d; if (p < 0 || p + N > x.length) continue;
        let c = 0; for (let i = 0; i < N; i += 6) c += x[p + i] * x[ref + i]; if (c > bc) { bc = c; best = p; } } }
    const o = k * H; for (let i = 0; i < N; i++) { out[o + i] += x[best + i] * w[i]; ws[o + i] += w[i]; }
    prev = best;
  }
  const len = k * H + N, y = new Int16Array(len);
  for (let i = 0; i < len; i++) y[i] = Math.max(-32768, Math.min(32767, ws[i] > 1e-3 ? out[i] / ws[i] : 0));
  return y;
}
function speedPcm(pcm24, rate) {
  const y = stretch(to8k(pcm24), rate);
  return { pcm: new Uint8Array(y.buffer), sr: 8000 };
}
// WAV שמור בימות (8kHz, 16 ביט) -> דגימות
function wavSamples(bytes) {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let o = 12, sr = 8000, bits = 16, fmt = 1;
  while (o + 8 <= bytes.length) {
    const id = String.fromCharCode(...bytes.subarray(o, o + 4)), sz = v.getUint32(o + 4, true);
    if (id === "fmt ") { fmt = v.getUint16(o + 8, true); sr = v.getUint32(o + 12, true); bits = v.getUint16(o + 22, true); }
    if (id === "data") { if (fmt !== 1 || bits !== 16) return null; const b = bytes.slice(o + 8, o + 8 + sz); return { s: new Int16Array(b.buffer, 0, b.length >> 1), sr }; }
    o += 8 + sz + (sz & 1);
  }
  return null;
}

// ---------- אירוע עם הרשמה (שלוחה 9) ----------
const DEFAULT_EVENT = { id: "shoeva", title: "שמחת בית השואבה", desc: "ביום ראשון בבית של סטפנסקי", file: "ivr2:/9/רשימת_המגיעים.txt" };
async function curEvent(env) { return (await kvGet(env, "event", null)) || DEFAULT_EVENT; }
const event9Menu = ev => `${ev.title}${ev.desc ? ", " + ev.desc : ""}. לאישור הגעה או לביטול הגעה הקישו 1. לשמיעת מספר הנרשמים ומי מגיע הקישו 2. לחזרה לתפריט הראשי הקישו כוכבית.`;

// ---------- רשימת החברים (שם, מספר, מנהל, קוד בתפריט ההודעות האישיות) ----------
async function peopleList(env) { return await kvGet(env, "people", []); }
const spoken = p => p.s || p.n;
const DIG = ["אפס", "אחת", "שתיים", "שלוש", "ארבע", "חמש", "שש", "שבע", "שמונה", "תשע"];
const spell = c => [...c].map(x => DIG[+x]).join(" ");
function peopleTexts(people) {
  const byCode = [...people].sort((a, b) => a.c.localeCompare(b.c));
  const lst = "רשימת חברי הקבוצה. " + byCode.map(p => spoken(p) + (p.a ? ", מנהל" : "")).join(". ") + `. סך הכול ${people.length} חברים.`;
  const menu = "הודעה אישית לחבר. בחרו את מי שאליו תרצו לשלוח, בשתי ספרות. " + byCode.map(p => `ל${spoken(p)} הקישו ${spell(p.c)}.`).join(" ") + " להקשת מספר טלפון אחר הקישו אפס אפס.";
  return { lst, menu };
}
// מעדכן את כל ההקלטות שקשורות לרשימת החברים (ברקע, בריצה הקבועה)
function peopleRegenSteps(people, changed = []) {
  const { lst, menu } = peopleTexts(people), steps = [
    { k: "tts", path: "/0/2", name: "M1000", text: menu },
    { k: "tts", path: "/0/4", name: "M1000", text: lst + " לשמיעה חוזרת הקישו 1. לחזרה לתפריט הראשי הקישו כוכבית." },
    { k: "tts", path: "/0/4/1", name: "M1000", text: lst + " לחזרה לתפריט הראשי הקישו כוכבית." },
    { k: "tts", path: "/5/3", name: "000", text: lst }];
  for (const p of changed) steps.push(
    { k: "ini", path: `/0/2/${p.c}`, text: personalIni(p) },
    { k: "tts", path: `/0/2/${p.c}`, name: "M1000", text: `הודעה אישית ל${spoken(p)}. הקליטו את ההודעה אחרי הצליל, ובסיום הקישו סולמית.` },
    { k: "tts", path: "/EnterIDRecord", name: `phone-${p.p}-Name`, text: spoken(p) });
  return steps;
}
const personalIni = p => `type=record
title=הודעה אישית ל${p.n}
folder_move=/personalMessages/Phone/${p.p}
;לשמיעת הקלטה 1, לאישור ושליחת צנתוק 2, להקלטה מחדש 3, להמשך הקלטה 4, לאישור הקלטה ללא צנתוק 5, ליציאה 6
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
`;
async function saveNames(env, people) {
  await env.KV.put("people", JSON.stringify(people));
  const over = {}; for (const p of people) over[p.p] = p.n;
  await env.KV.put("names_over", JSON.stringify(over));
  NAMES_CACHE = { ...NAMES_CACHE, ...over };
}

// ---------- משימות רקע (כל ריצה קבועה מבצעת כמה צעדים) ----------
// העלאת קובץ טקסט לא יוצרת תיקייה בימות, לכן יוצרים אותה קודם (ומוחקים את ה-ext.ini הריק אם זו לא שלוחה)
async function ensureDir(env, path, keepIni = true) {
  const d = await ym(env, "GetIVR2Dir", { path: "ivr2:" + path }).catch(() => ({}));
  if (d.responseStatus === "OK") return;
  await ym(env, "UpdateExtension", { path: "ivr2:" + path });
  if (!keepIni) await ym(env, "FileAction", { action: "delete", what: `ivr2:${path}/ext.ini` }).catch(() => {});
}
async function bgAdd(env, steps) { const q = await kvGet(env, "bgjobs", []); q.push(...steps); await env.KV.put("bgjobs", JSON.stringify(q)); }
async function ttsLong(env, text, voice = "Charon", budget = 25000) {
  const parts = text.length > 240 ? chunkText(text) : [text], out = [];
  for (const p of parts) { const pcm = await geminiTTS(env, p, budget, voice); if (!pcm) return null; out.push(pcmTrim(pcm)); }
  const gap = new Uint8Array(2 * Math.round(24000 * 0.35)), total = out.reduce((s, b) => s + b.length, 0) + gap.length * (out.length - 1);
  const all = new Uint8Array(total); let o = 0;
  out.forEach((b, i) => { if (i) { all.set(gap, o); o += gap.length; } all.set(b, o); o += b.length; });
  return all;
}
function chunkText(text, limit = 220) {
  const parts = text.trim().split(/(?<=[.!?])\s+/).filter(Boolean), out = []; let cur = "";
  for (const p of parts) { if (cur && cur.length + 1 + p.length > limit) { out.push(cur); cur = p; } else cur = (cur + " " + p).trim(); }
  if (cur) out.push(cur); return out;
}
function pcmTrim(pcm) { const w = pcmToWav(pcm); return w.subarray(44); }
async function runBg(env) {
  let q = await kvGet(env, "bgjobs", []);
  if (!q.length || await env.KV.get("bglock")) return;
  await env.KV.put("bglock", "1", { expirationTtl: 90 });
  const t0 = Date.now();
  try {
    while (q.length && used < 38 && Date.now() - t0 < 20000) {
      const s = q[0];
      try {
        if (s.k === "tts") {
          const pcm = await ttsLong(env, s.text);
          if (pcm) { await ymUpload(env, `${s.path}/${s.name}.wav`, pcmToWav(pcm)); await ym(env, "FileAction", { action: "delete", what: `ivr2:${s.path}/${s.name}.tts` }).catch(() => {}); }
          else if ((s.tries = (s.tries || 0) + 1) < 4) { q.push(q.shift()); break; } // המכסה של הקול נגמרה: ננסה בריצה הבאה
          else { await ym(env, "UploadTextFile", { what: `ivr2:${s.path}/${s.name}.tts`, contents: s.text }); await ym(env, "FileAction", { action: "delete", what: `ivr2:${s.path}/${s.name}.wav` }).catch(() => {}); }
        } else if (s.k === "ini") { await ensureDir(env, s.path); await ym(env, "UploadTextFile", { what: `ivr2:${s.path}/ext.ini`, contents: s.text }); }
        else if (s.k === "fa") await ym(env, "FileAction", { action: s.action, what: "ivr2:" + s.what, ...(s.target ? { target: "ivr2:" + s.target } : {}) });
        else if (s.k === "bc") await broadcastOne(env, s);
        else if (s.k === "log") await log(env, s.line);
      } catch (e) { aiTrace.push("bg " + s.k + ": " + e.message); }
      q.shift(); await env.KV.put("bgjobs", JSON.stringify(q));
    }
    await env.KV.put("bgjobs", JSON.stringify(q));
  } finally { await env.KV.delete("bglock"); }
}
// הודעה אישית לכל חבר: השם שלו (מההקלטה שבקו) ואחריו ההודעה בקול העוזר
async function broadcastOne(env, s) {
  const msg = await env.KV.get("bc:" + s.id, "arrayBuffer"); if (!msg) return;
  const m = new Int16Array(msg);
  let name = null;
  try { name = wavSamples(await ym(env, "DownloadFile", { path: `ivr2:/EnterIDRecord/phone-${s.p}-Name.wav` })); } catch {}
  const gap = new Int16Array(8000 * 0.3), parts = name && name.sr === 8000 ? [name.s, gap, m] : [m];
  const all = new Int16Array(parts.reduce((a, b) => a + b.length, 0)); let o = 0; for (const p of parts) { all.set(p, o); o += p.length; }
  const folder = s.folder || "/personalMessages/Phone/" + s.p, fname = await nextName(env, folder, "wav");
  await ymUpload(env, `${folder}/${fname}`, pcmToWav(new Uint8Array(all.buffer), 8000));
  const u = await kvGet(env, "bcfiles:" + s.id, []); u.push(`${folder}/${fname}`); await env.KV.put("bcfiles:" + s.id, JSON.stringify(u), { expirationTtl: 30 * 86400 });
}

// ---------- סטטיסטיקות מהיומנים של ימות ----------
async function lineStats(env) {
  const c = await kvGet(env, "stats", null); if (c && Date.now() - c.t < 10 * 60e3) return c.text;
  const nm = names(env), month = nowIL().slice(0, 7), today = nowIL().slice(0, 10);
  const r = await ym(env, "GetTextFile", { what: `ivr2:/Log/LogFolderEnterExit-${month}.ymgr` });
  const calls = {}, last = {}, bot = new Set(), heard = {};
  const imp = await ym(env, "GetIVR2Dir", { path: "ivr2:" + IMPORTANT }).catch(() => ({}));
  const lastImp = (imp.files || []).filter(f => /^\d+\.wav$/.test(f.name)).map(f => ({ f: f.name, t: sortable(f.mtime) })).sort((a, b) => a.t < b.t ? 1 : -1)[0];
  for (const line of ((r && r.contents) || "").split("\n")) {
    const d = Object.fromEntries(line.split("%").map(x => x.split("#")));
    if (!d.Phone || !d.EnterDate) continue;
    const [dd, mm, yy] = d.EnterDate.split("/"), t = `${yy}-${mm}-${dd} ${d.EnterTime}`;
    if (!last[d.Phone] || last[d.Phone] < t) last[d.Phone] = t;
    if (t.startsWith(today)) { calls[d.CallId] = d.Phone; if (d.Folder === "8") bot.add(d.Phone); }
    if (lastImp && d.Folder === "1/1" && t >= lastImp.t) heard[d.Phone] = 1;
  }
  const who = p => nm[p] || p;
  const todayPh = [...new Set(Object.values(calls))];
  const weekAgo = ilAt(Date.now() - 7 * 864e5).slice(0, 16);
  const quiet = Object.keys(nm).filter(p => !last[p] || last[p] < weekAgo).map(who);
  let text = `סטטיסטיקה מהיומנים של ימות (החודש): היום היו ${Object.keys(calls).length} שיחות מ-${todayPh.length} מתקשרים: ${todayPh.map(who).join(", ") || "אף אחד"}. היום דיברו עם העוזר: ${[...bot].map(who).join(", ") || "אף אחד"}. חברים שלא נכנסו לקו בשבוע האחרון: ${quiet.join(", ") || "אין"}.`;
  if (lastImp) text += ` ההודעה החשובה האחרונה (${lastImp.f}, ${lastImp.t}) נשמעה בשלוחת ההודעות החשובות על ידי: ${Object.keys(heard).map(who).join(", ") || "אף אחד עדיין"}.`;
  text += " כניסה אחרונה של כל חבר: " + Object.keys(nm).map(p => `${who(p)} ${last[p] ? last[p].slice(5, 16) : "לא נכנס החודש"}`).join(", ") + ".";
  await env.KV.put("stats", JSON.stringify({ t: Date.now(), text }));
  return text;
}

// ---------- מידע למנהל (רק כשמנהל מדבר עם העוזר) ----------
async function adminText(env, line) {
  const c = await kvGet(env, "admintext", null); if (c && Date.now() - c.t < 90e3) return c.text;
  const nm = names(env), who = p => nm[p] || p;
  const [counts, joins, ev, rs, watch, jobs, stats, conv, undo] = await Promise.all([
    Promise.all(PENDING_ORDER.map(k => pendingFiles(env, REVIEW[k].folder).then(f => f.length).catch(() => 0))),
    pendingFiles(env, "/JoinRequests").catch(() => []), curEvent(env), rsvpLoad(env), kvGet(env, "watch", {}),
    kvGet(env, "scheduled", []), lineStats(env).catch(e => "הסטטיסטיקה לא זמינה כרגע"), kvGet(env, "convlog", []), kvGet(env, "undo", [])]);
  const jm = await kvGet(env, "joinmap", {});
  let t = "מידע לניהול (רק למנהל): ";
  t += "הודעות שממתינות לאישור בשלוחה 7-4: " + PENDING_ORDER.map((k, i) => `${REVIEW[k].name}: ${counts[i]}`).join("; ") + ". ";
  t += joins.length ? `בקשות הצטרפות (${joins.length}): ` + joins.map(f => `join:${f.name.replace(".wav", "")} ממספר ${jm[f.name] || "לא ידוע"} (${f.mtime || ""})`).join("; ") + ". " : "אין בקשות הצטרפות. ";
  const reg = Object.keys(rs), notReg = Object.keys(nm).filter(p => !rs[p]);
  t += `האירוע הפעיל בשלוחה 9: ${ev.title}${ev.desc ? " (" + ev.desc + ")" : ""}. נרשמו ${reg.length}: ${reg.map(p => rs[p].n).join(", ") || "אף אחד"}. לא נרשמו: ${notReg.map(who).join(", ") || "אין"}. `;
  const muted = Object.entries(watch).filter(([, w]) => w && w.hold && (!w.until || w.until > Date.now()));
  t += muted.length ? "חברים מושתקים (ההודעות שלהם מחכות לאישור): " + muted.map(([p, w]) => `${who(p)}${w.until ? " עד " + ilAt(w.until).slice(0, 16) : ""}`).join(", ") + ". " : "אין חברים מושתקים. ";
  const pend = jobs.filter(j => !j.done);
  t += pend.length ? "משימות מתוזמנות שעוד לא יצאו: " + pend.map(j => `${j.at}: ${j.type === "post" ? (j.important ? "הודעה חשובה" : "הודעה רגילה") + " \"" + j.text + "\"" : j.type === "remind" ? "תזכורת ל" + who(j.phone) : j.type === "shoeva" ? "תזכורת לאירוע" : j.type}`).join("; ") + ". " : "אין משימות מתוזמנות. ";
  t += stats + " ";
  const since = ilAt(Date.now() - 48 * 3600e3).slice(0, 16);
  const recent = conv.filter(e => e.d >= since);
  if (recent.length) t += "השיחות עם העוזר ב-48 השעות האחרונות (כדי שתוכל לסכם למנהל על מה דיברו): " + recent.slice(-60).map(e => `[${e.d.slice(5, 16)} ${who(e.p)}] שאל: ${String(e.q).slice(0, 120)} | ענית: ${String(e.a).slice(0, 120)}`).join(" || ") + ". ";
  t += undo.length ? `הפעולה האחרונה שאפשר לבטל: ${undo[undo.length - 1].desc}. ` : "אין פעולה לביטול. ";
  await env.KV.put("admintext", JSON.stringify({ t: Date.now(), text: t }));
  return t;
}

// ---------- פעולות ניהול (אחרי אישור בהקשה) ----------
const ADMIN_ACTS = new Set(["delete", "move", "schedule", "event", "mute", "unmute", "entry", "entry_delete", "approve_join", "rule_add", "rule_remove", "rename", "broadcast", "undo"]);
function describeAct(a, env) {
  const nm = names(env), who = p => nm[p] || p;
  switch (a.type) {
    case "delete": return `למחוק מהקו את הודעה ${a.id}`;
    case "move": return `להעביר את הודעה ${a.id} ${a.to === "important" ? "להודעות החשובות, עם צינתוק לכולם" : "חזרה להודעות הרגילות בלבד"}`;
    case "schedule": return `לפרסם ב-${a.at} ${a.important ? "הודעה חשובה עם צינתוק לכולם" : "הודעה רגילה"}: ${a.text}`;
    case "event": return `לפתוח בשלוחה 9 הרשמה חדשה לאירוע: ${a.title}${a.desc ? ", " + a.desc : ""}. הרשימה הקודמת נשמרת`;
    case "mute": return `להשתיק את ${who(a.phone)} ל-${a.hours || 24} שעות. בזמן הזה ההודעות שלו יחכו לאישור`;
    case "unmute": return `לבטל את ההשתקה של ${who(a.phone)}`;
    case "entry": return `להחליף את ההודעה בכניסה לקו ל: ${a.text}`;
    case "entry_delete": return "למחוק את ההודעה שבכניסה לקו";
    case "approve_join": return `לאשר את ${a.name} ממספר ${digitsSay(a.phone)} ולהוסיף אותו לתפריט ההודעות האישיות`;
    case "rule_add": return `להוסיף לעוזר כלל קבוע: ${a.text}`;
    case "rule_remove": return `למחוק את הכלל: ${a.text || a.n}`;
    case "rename": return `לשנות את השם של ${who(a.phone)} ל${a.name}`;
    case "broadcast": return `להשאיר לכל אחד מהחברים הודעה אישית עם השם שלו: ${a.text}`;
    case "undo": return "לבטל את הפעולה האחרונה";
  }
  return "";
}
async function pushUndo(env, desc, ops) {
  const u = await kvGet(env, "undo", []); u.push({ desc, ops, d: nowIL() }); await env.KV.put("undo", JSON.stringify(u.slice(-15)));
  await env.KV.delete("admintext");
}
async function findImportantCopy(env, id) {
  const [a, b] = await Promise.all([allFiles(env, ALL), ym(env, "GetIVR2Dir", { path: "ivr2:" + IMPORTANT })]);
  const f = (a.files || []).find(x => x.name === id + ".wav"); if (!f) return { exists: false };
  const same = (b.files || []).filter(x => /^\d+\.wav$/.test(x.name) && x.size === f.size);
  return { exists: true, imp: same.length ? same[same.length - 1].name : null };
}
async function doAdmin(env, a, admin, via = "העוזר") {
  const nm = names(env), who = p => nm[p] || p, id = String(a.id || "").replace(/\D/g, "");
  const tag = `(מנהל ${who(admin)} דרך ${via})`;
  switch (a.type) {
    case "delete": {
      const f = await findImportantCopy(env, id); if (!f.exists) return "לא מצאתי את ההודעה הזו בקו";
      const ops = [];
      const n1 = await move(env, `${ALL}/${id}.wav`, "/DeletedByAdmin"); ops.push({ mv: [`/DeletedByAdmin/${n1}`, `${ALL}/${id}.wav`] });
      if (f.imp) { const n2 = await move(env, `${IMPORTANT}/${f.imp}`, "/DeletedByAdmin"); ops.push({ mv: [`/DeletedByAdmin/${n2}`, `${IMPORTANT}/${f.imp}`] }); }
      const ar = await kvGet(env, "archive", {}); if (ar[id + ".wav"]) { ops.push({ archive: [id + ".wav", ar[id + ".wav"]] }); delete ar[id + ".wav"]; await env.KV.put("archive", JSON.stringify(ar)); }
      await pushUndo(env, `מחיקת הודעה ${id}`, ops); await log(env, `הודעה ${id} נמחקה מהקו ${tag}`);
      return `הודעה ${id} נמחקה${f.imp ? " גם מההודעות החשובות" : ""}`;
    }
    case "move": {
      const f = await findImportantCopy(env, id); if (!f.exists) return "לא מצאתי את ההודעה הזו בקו";
      if (a.to === "important") {
        if (f.imp) return "ההודעה הזו כבר נמצאת בהודעות החשובות";
        const n = await move(env, `${ALL}/${id}.wav`, IMPORTANT, "copy");
        used = 0; await tzintuk(env, "members"); await addFlags(env, await membersFor(env, "members"), "NImportant"); await processFlags(env).catch(() => {});
        await pushUndo(env, `העברת הודעה ${id} לחשובות`, [{ mv: [`${IMPORTANT}/${n}`, `/DeletedByAdmin/imp-${n}`] }]); await log(env, `הודעה ${id} הועברה לחשובות ונשלח צינתוק ${tag}`);
        return "ההודעה הועברה להודעות החשובות ונשלח צינתוק לכל החברים";
      }
      if (!f.imp) return "ההודעה הזו לא נמצאת בהודעות החשובות";
      const n = await move(env, `${IMPORTANT}/${f.imp}`, "/DeletedByAdmin");
      await pushUndo(env, `הוצאת הודעה ${id} מהחשובות`, [{ mv: [`/DeletedByAdmin/${n}`, `${IMPORTANT}/${f.imp}`] }]); await log(env, `הודעה ${id} הוצאה מהחשובות ונשארה ברגילות ${tag}`);
      return "ההודעה הוצאה מההודעות החשובות ונשארה בהודעות הרגילות";
    }
    case "schedule": {
      const jobs = await kvGet(env, "scheduled", []), jid = "j" + Date.now().toString(36);
      jobs.push({ id: jid, at: a.at, type: "post", text: a.text, important: !!a.important, by: admin }); await env.KV.put("scheduled", JSON.stringify(jobs));
      await pushUndo(env, `הודעה מתוזמנת ל-${a.at}`, [{ unsched: jid }]); await log(env, `נקבעה הודעה ${a.important ? "חשובה" : "רגילה"} ל-${a.at}: ${a.text} ${tag}`);
      return `ההודעה תצא ב${+a.at.slice(8, 10)} ל${+a.at.slice(5, 7)} בשעה ${a.at.slice(11, 16)}`;
    }
    case "event": {
      const old = await curEvent(env), ev = { id: "e" + Date.now().toString(36), title: a.title, desc: a.desc || "", file: `ivr2:/9/רשימה_${Date.now().toString(36)}.txt` };
      await env.KV.put("event", JSON.stringify(ev));
      await bgAdd(env, [{ k: "tts", path: "/9", name: "M1000", text: event9Menu(ev) }, { k: "ini", path: "/9", text: `type=menu\ntitle=${ev.title}\n` }]);
      await pushUndo(env, `פתיחת הרשמה ל${ev.title}`, [{ event: old }]); await log(env, `נפתחה הרשמה חדשה בשלוחה 9: ${ev.title} ${ev.desc} ${tag}`);
      return `נפתחה הרשמה ל${ev.title}. התפריט של שלוחה 9 יתעדכן תוך כמה דקות`;
    }
    case "mute": case "unmute": {
      const w = await kvGet(env, "watch", {}), prev = w[a.phone] || null;
      if (a.type === "mute") w[a.phone] = { hold: true, until: Date.now() + (a.hours || 24) * 3600e3 }; else delete w[a.phone];
      await env.KV.put("watch", JSON.stringify(w));
      await pushUndo(env, `${a.type === "mute" ? "השתקת" : "ביטול השתקה של"} ${who(a.phone)}`, [{ watch: [a.phone, prev] }]); await log(env, `${a.type === "mute" ? "השתקה ל-" + (a.hours || 24) + " שעות של" : "ביטול השתקה של"} ${who(a.phone)} ${tag}`);
      return a.type === "mute" ? `${who(a.phone)} מושתק ל-${a.hours || 24} שעות. ההודעות שלו יחכו לאישור בשלוחה 7 4` : `ההשתקה של ${who(a.phone)} בוטלה`;
    }
    case "entry": case "entry_delete": {
      const bk = `/OldEntry/${Date.now().toString(36)}.wav`;
      const had = await ym(env, "FileAction", { action: "copy", what: "ivr2:/M0000-1.wav", target: "ivr2:" + bk }).then(r => r.responseStatus === "OK").catch(() => false);
      if (a.type === "entry") { const pcm = await ttsLong(env, a.text); if (pcm) await ymUpload(env, "/M0000-1.wav", pcmToWav(pcm)); else await bgAdd(env, [{ k: "tts", path: "", name: "M0000-1", text: a.text }]); }
      else await ym(env, "FileAction", { action: "delete", what: "ivr2:/M0000-1.wav" });
      await pushUndo(env, a.type === "entry" ? "החלפת ההודעה בכניסה" : "מחיקת ההודעה בכניסה", [had ? { copy: [bk, "/M0000-1.wav"] } : { del: "/M0000-1.wav" }]);
      await log(env, (a.type === "entry" ? "ההודעה בכניסה לקו הוחלפה ל: " + a.text : "ההודעה בכניסה לקו נמחקה") + " " + tag);
      return a.type === "entry" ? "ההודעה בכניסה לקו הוחלפה" : "ההודעה בכניסה לקו נמחקה";
    }
    case "approve_join": {
      const phone = String(a.phone || "").replace(/\D/g, ""); if (!/^0\d{8,9}$/.test(phone)) return "מספר הטלפון לא תקין";
      const people = await peopleList(env);
      if (people.some(p => p.p === phone)) { const jm0 = await kvGet(env, "joinmap", {}), rq = Object.keys(jm0).find(k => jm0[k] === phone); const r = await approveJoin(env, phone, rq, admin); return `הבקשה של ${r.name} אושרה. הוא יצטרף לקבוצה אוטומטית בפעם הבאה שהוא יתקשר`; }
      const code = String(Math.max(0, ...people.map(p => +p.c)) + 1).padStart(2, "0"), np = { n: a.name, p: phone, a: false, c: code };
      people.push(np); await saveNames(env, people);
      await bgAdd(env, peopleRegenSteps(people, [np]));
      const jm = await kvGet(env, "joinmap", {}), req = Object.keys(jm).find(k => jm[k] === phone);
      if (req) await ym(env, "FileAction", { action: "move", what: "ivr2:/JoinRequests/" + req, target: "ivr2:/JoinRequestsDone/" + Date.now().toString(36) + ".wav" }).catch(() => {});
      await pushUndo(env, `הצטרפות של ${a.name}`, [{ unjoin: phone }]); await log(env, `${a.name} (${phone}) אושר והוסף לקבוצה בקוד ${code} ${tag}`);
      if (!a.fromJoin) { const ap = await kvGet(env, "approved", {}); ap[phone] = { t: nowIL(), by: admin }; await env.KV.put("approved", JSON.stringify(ap)); }
      return `${a.name} נוסף לקבוצה, בקוד ${spell(code)} בתפריט ההודעות האישיות. בפעם הבאה שהוא יתקשר הוא יצטרף אוטומטית לרשימת הצינתוקים`;
    }
    case "rule_add": case "rule_remove": {
      const rules = await kvGet(env, "rules", []), prev = [...rules];
      if (a.type === "rule_add") rules.push(String(a.text).slice(0, 300));
      else { const i = a.n ? a.n - 1 : rules.findIndex(r => r === a.text); if (i < 0 || i >= rules.length) return "לא מצאתי כלל כזה"; rules.splice(i, 1); }
      await env.KV.put("rules", JSON.stringify(rules));
      await pushUndo(env, a.type === "rule_add" ? "הוספת כלל לעוזר" : "מחיקת כלל של העוזר", [{ rules: prev }]); await log(env, `${a.type === "rule_add" ? "נוסף לעוזר כלל" : "נמחק כלל של העוזר"}: ${a.text || a.n} ${tag}`);
      return a.type === "rule_add" ? "הכלל נשמר, ומעכשיו אני פועל לפיו" : "הכלל נמחק";
    }
    case "rename": {
      const people = await peopleList(env), p = people.find(x => x.p === a.phone); if (!p) return "לא מצאתי את החבר הזה ברשימה";
      const old = { n: p.n, s: p.s }; p.n = a.name; delete p.s; await saveNames(env, people);
      await bgAdd(env, peopleRegenSteps(people, [p]));
      await pushUndo(env, `שינוי השם של ${old.n}`, [{ rename: [p.p, old] }]); await log(env, `השם של ${old.n} (${p.p}) שונה ל${a.name} ${tag}`);
      return `השם שונה ל${a.name}. ההקלטות בתפריטים יתעדכנו תוך כמה דקות`;
    }
    case "broadcast": {
      const pcm = await ttsLong(env, a.text); if (!pcm) return "הקול של העוזר לא זמין כרגע, נסה שוב מאוחר יותר";
      const bid = Date.now().toString(36), m8 = to8k(pcmTrim(pcm));
      await env.KV.put("bc:" + bid, m8.buffer, { expirationTtl: 3 * 86400 });
      const people = await peopleList(env);
      await bgAdd(env, [...people.map(p => ({ k: "bc", id: bid, p: p.p })), { k: "log", line: `ההודעה האישית לכל החברים הושארה אצל ${people.length} חברים ${tag}` }]);
      await pushUndo(env, "הודעה אישית לכל החברים", [{ bcdel: bid }]);
      return `ההודעה תגיע לתיבה האישית של כל ${people.length} החברים בדקות הקרובות`;
    }
    case "undo": {
      const u = await kvGet(env, "undo", []), last = u.pop(); if (!last) return "אין פעולה לבטל";
      for (const op of last.ops) {
        if (op.mv) await ym(env, "FileAction", { action: "move", what: "ivr2:" + op.mv[0], target: "ivr2:" + op.mv[1] });
        if (op.copy) await ym(env, "FileAction", { action: "copy", what: "ivr2:" + op.copy[0], target: "ivr2:" + op.copy[1] });
        if (op.del) await ym(env, "FileAction", { action: "delete", what: "ivr2:" + op.del });
        if (op.archive) { const ar = await kvGet(env, "archive", {}); ar[op.archive[0]] = op.archive[1]; await env.KV.put("archive", JSON.stringify(ar)); }
        if (op.unsched) { const j = await kvGet(env, "scheduled", []); await env.KV.put("scheduled", JSON.stringify(j.filter(x => x.id !== op.unsched || x.done))); }
        if (op.event) { await env.KV.put("event", JSON.stringify(op.event)); await bgAdd(env, [{ k: "tts", path: "/9", name: "M1000", text: event9Menu(op.event) }, { k: "ini", path: "/9", text: `type=menu\ntitle=${op.event.title}\n` }]); }
        if (op.watch) { const w = await kvGet(env, "watch", {}); if (op.watch[1]) w[op.watch[0]] = op.watch[1]; else delete w[op.watch[0]]; await env.KV.put("watch", JSON.stringify(w)); }
        if (op.rules) await env.KV.put("rules", JSON.stringify(op.rules));
        if (op.rename) { const people = await peopleList(env), p = people.find(x => x.p === op.rename[0]); if (p) { p.n = op.rename[1].n; if (op.rename[1].s) p.s = op.rename[1].s; await saveNames(env, people); await bgAdd(env, peopleRegenSteps(people, [p])); } }
        if (op.unjoin) { const ap = await kvGet(env, "approved", {}); delete ap[op.unjoin]; await env.KV.put("approved", JSON.stringify(ap)); }
        if (op.unjoin) { const people = (await peopleList(env)).filter(x => x.p !== op.unjoin); await saveNames(env, people); const over = await kvGet(env, "names_over", {}); delete over[op.unjoin]; await env.KV.put("names_over", JSON.stringify(over)); await bgAdd(env, peopleRegenSteps(people)); }
        if (op.bcdel) { const q = (await kvGet(env, "bgjobs", [])).filter(s => !(s.k === "bc" && s.id === op.bcdel)); await env.KV.put("bgjobs", JSON.stringify(q));
          for (const f of await kvGet(env, "bcfiles:" + op.bcdel, [])) await ym(env, "FileAction", { action: "delete", what: "ivr2:" + f }).catch(() => {}); }
      }
      await env.KV.put("undo", JSON.stringify(u)); await env.KV.delete("admintext"); await log(env, `בוטלה הפעולה: ${last.desc} ${tag}`);
      return `בוטל: ${last.desc}`;
    }
  }
  return "לא הבנתי איזו פעולה לבצע";
}

// ---------- שלוחה 7-4 ו-7-0: טיפול בהודעות שממתינות לאישור ובבקשות הצטרפות ----------
// מקשים קבועים בכל הרשימות: 1 = חשובה, 2 = רגילה, 3 = מחיקה, 4 = פרטים, 5 = הבאה, 0 = שמיעה חוזרת
const REVIEW = {
  problem:  { folder: P.problem,          name: "הודעות חשובות שה AI עצר בגלל חשש לתוכן בעייתי" },
  general:  { folder: P.general,          name: "הודעות רגילות שה AI עצר בגלל חשש לתוכן בעייתי" },
  demoted:  { folder: P.demoted,          name: "הודעות שסומנו כחשובות וה AI העביר לרגילות" },
  approval: { folder: "/PendingApproval", name: "הודעות חשובות שהוקלטו בזמן נעילה" },
  error:    { folder: P.error,            name: "הודעות שהשרת לא הצליח לבדוק" },
  join:     { folder: "/JoinRequests",    name: "בקשות הצטרפות" },
};
const PENDING_ORDER = ["problem", "general", "demoted", "approval", "error"];
const MONTHS = ["ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני", "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר"];
function sayDate(s) { const m = /(\d+)\/(\d+)\/(\d+) (\d+):(\d+)/.exec(s || ""); return m ? `נשלחה ב ${+m[1]} ב${MONTHS[+m[2] - 1]} בשעה ${+m[4]} ו ${+m[5]} דקות` : ""; }
const digitsSay = p => (p || "").split("").join(" ");
async function pendingFiles(env, folder) {
  const d = await ym(env, "GetIVR2Dir", { path: "ivr2:" + folder });
  return (d.files || []).filter(f => /^\d+\.wav$/.test(f.name)).sort((a, b) => parseInt(a.name) - parseInt(b.name));
}
const countSay = n => n === 0 ? "אין הודעות" : n === 1 ? "הודעה אחת" : `${n} הודעות`;
// תפריט 7-4: כמה ממתינות בכל רשימה
async function pendingMenu(env, u, ctx) {
  const q = Object.fromEntries(u.searchParams);
  if (q.P) return q.P === "0" ? "go_to_folder=/7" : `go_to_folder=/7/4/${q.P}`;
  const counts = await Promise.all(PENDING_ORDER.map(k => pendingFiles(env, REVIEW[k].folder).then(f => f.length).catch(() => 0)));
  const total = counts.reduce((a, b) => a + b, 0);
  const parts = PENDING_ORDER.map((k, i) => `ל${REVIEW[k].name}, ${countSay(counts[i])}, הקישו ${i + 1}`);
  const intro = total ? `הודעות ממתינות לאישור. בסך הכול ${total === 1 ? "הודעה אחת ממתינה" : total + " הודעות ממתינות"}.` : "אין כרגע הודעות שממתינות לאישור.";
  return `read=${await sayC(env, ctx, intro + " " + parts.join(". ") + ". לחזרה לתפריט הניהול הקישו אפס")}=P,no,1,1,10,No,no,no,,0.1.2.3.4.5`;
}
// ביצוע פעולה על הודעה ממתינה (1 = חשובה, 2 = רגילה, 3 = מחיקה; בבקשות הצטרפות 1 = אישור, 3 = מחיקה).
// משמש גם את השלוחה הקולית וגם את דף הניהול. מחזיר את הודעת התוצאה למנהל
async function applyReview(env, ctx, kind, f, act, admin, via = "") {
  const cfg = REVIEW[kind], adm = admin + via;
  const jmap = kind === "join" ? await kvGet(env, "joinmap", {}) : {};
  const phoneOf = x => x.phone || jmap[x.name] || "";
  const who = x => { const p = phoneOf(x), nm = names(env)[p]; return nm || (p ? "מספר " + digitsSay(p) : "מספר לא ידוע"); };
  const del = async x => { await ym(env, "FileAction", { action: "delete", what: "ivr2:" + cfg.folder + "/" + x.name }); };
  const ring = type => ctx.waitUntil((async () => { used = 0; await notify(env, type); await processFlags(env); })().catch(e => log(env, "שגיאה בצינתוק: " + e.message)));
  if (kind === "join") {
    if (act === "1") {
      const p = phoneOf(f);
      if (!/^0\d{8,9}$/.test(p)) { await del(f); return "לא ידוע מאיזה מספר הבקשה, ולכן היא נמחקה"; }
      used = 0; const r = await approveJoin(env, p, f.name, admin);
      return `הבקשה אושרה. ${r.name} ${r.isNew ? "נוסף לרשימות של הקו, ו" : ""}יצטרף לקבוצה אוטומטית בפעם הבאה שהוא יתקשר`;
    }
    if (act === "3") { await del(f); await log(env, `מנהל ${adm} מחק בקשת הצטרפות של ${phoneOf(f)}`); return "הבקשה נמחקה"; }
    return "";
  }
  if (kind === "demoted") {
    const map = await kvGet(env, "demap", {});
    if (act === "1") {
      await move(env, cfg.folder + "/" + f.name, IMPORTANT);
      delete map[f.name]; await env.KV.put("demap", JSON.stringify(map));
      ring("promoted");
      await log(env, `מנהל ${adm} העביר לחשובות את ההודעה של ${who(f)}`);
      return "ההודעה הועברה להודעות החשובות ונשלח צינתוק לחברים";
    }
    if (act === "2") { await del(f); delete map[f.name]; await env.KV.put("demap", JSON.stringify(map)); return "ההודעה נשארת בהודעות הרגילות"; }
    if (act === "3") {
      let copy = map[f.name];
      if (!copy) { const d = await ym(env, "GetIVR2Dir", { path: "ivr2:" + ALL });
        const c = (d.files || []).filter(x => /^\d+\.wav$/.test(x.name) && x.phone === f.phone && x.size === f.size).sort((a, b) => parseInt(b.name) - parseInt(a.name))[0]; copy = c && c.name; }
      if (copy) await ym(env, "FileAction", { action: "delete", what: "ivr2:" + ALL + "/" + copy });
      await del(f); delete map[f.name]; await env.KV.put("demap", JSON.stringify(map));
      if (copy) { const a = await kvGet(env, "archive", {}); if (a[copy]) { delete a[copy]; await env.KV.put("archive", JSON.stringify(a)); } }
      await log(env, `מנהל ${adm} מחק מהקו את ההודעה של ${who(f)}${copy ? " (" + copy + " בכל ההודעות)" : ""}`);
      return copy ? "ההודעה נמחקה מהקו לגמרי" : "ההודעה נמחקה מהרשימה הזו אבל לא מצאתי אותה בכל ההודעות";
    }
    return "";
  }
  if (act === "1") {
    await move(env, cfg.folder + "/" + f.name, IMPORTANT); ring("important");
    await log(env, `מנהל ${adm} אישר כהודעה חשובה את ההודעה של ${who(f)} (${cfg.name})`);
    return "ההודעה פורסמה כהודעה חשובה ונשלח צינתוק לחברים";
  }
  if (act === "2") {
    await move(env, cfg.folder + "/" + f.name, ALL); ring("regular");
    await log(env, `מנהל ${adm} אישר כהודעה רגילה את ההודעה של ${who(f)} (${cfg.name})`);
    return "ההודעה פורסמה כהודעה רגילה";
  }
  if (act === "3") { await del(f); await log(env, `מנהל ${adm} מחק את ההודעה של ${who(f)} (${cfg.name})`); return "ההודעה נמחקה"; }
  return "";
}
async function reviewPending(env, u, ctx, kind) {
  const cfg = REVIEW[kind], back = kind === "join" ? "/7" : "/7/4";
  const q = Object.fromEntries(u.searchParams), admin = q.ApiPhone || "";
  const steps = Object.keys(q).map(k => /^A(\d+)_(\d+)$/.exec(k)).filter(Boolean).sort((a, b) => a[1] - b[1]);
  let files = await pendingFiles(env, cfg.folder), msg = "", n = 0, cur = null, after = null, replay = false;
  const jmap = kind === "join" ? await kvGet(env, "joinmap", {}) : {};
  const phoneOf = f => f.phone || jmap[f.name] || "";
  const who = f => { const p = phoneOf(f), nm = names(env)[p]; return nm || (p ? "מספר " + digitsSay(p) : "מספר לא ידוע"); };
  const del = async f => { await ym(env, "FileAction", { action: "delete", what: "ivr2:" + cfg.folder + "/" + f.name }); };
  if (steps.length) {
    const last = steps[steps.length - 1]; n = +last[1];
    const act = q[last[0]], num = last[2], f = files.find(x => x.name === num + ".wav");
    if (!f) msg = "ההודעה הזו כבר טופלה";
    else if (act === "4") { cur = f; msg = kind === "join" ? `בקשה ממספר ${digitsSay(phoneOf(f))}. ${sayDate(f.date || f.mtime)}` : `ההודעה של ${who(f)}${names(env)[phoneOf(f)] ? " ממספר " + digitsSay(phoneOf(f)) : ""}. ${sayDate(f.date || f.mtime)}`; }
    else if (act === "0") { cur = f; replay = true; }
    else if (act === "5") { after = num; msg = ""; }
    else msg = await applyReview(env, ctx, kind, f, act, admin);
    if (!cur) files = await pendingFiles(env, cfg.folder);
  }
  let next = cur || (after ? files.find(x => parseInt(x.name) > parseInt(after)) : files[0]);
  if (after && !next) msg = "זו הייתה ההודעה האחרונה ברשימה";
  const head = msg ? (await sayC(env, ctx, msg)) + "." : "";
  if (!next) return `id_list_message=${after ? head.replace(/\.$/, "") : head + await sayC(env, ctx, steps.length ? "אין עוד הודעות ברשימה הזו" : "אין כרגע " + cfg.name)}&go_to_folder=${back}`;
  const idx = files.findIndex(x => x.name === next.name) + 1;
  const label = kind === "join" ? "בקשה" : "הודעה";
  const intro = replay ? "" : (await sayC(env, ctx, `${label} ${idx} מתוך ${files.length}. ${kind === "join" ? "ממספר " + digitsSay(phoneOf(next)) : "מאת " + who(next)}`)) + ".";
  const showDetails = cur && q[`A${n}_${next.name.split(".")[0]}`] === "4";
  const items = (head + (showDetails ? "" : intro + `f-${cfg.folder}/${next.name.replace(".wav", "")}`)).replace(/\.$/, "");
  const opts = kind === "join"
    ? ["לאישור הבקשה הקישו 1", "למחיקת הבקשה הקישו 3"]
    : kind === "demoted"
    ? ["להעברה להודעות החשובות עם צינתוק לחברים הקישו 1", "להשאיר אותה כהודעה רגילה הקישו 2", "למחיקת ההודעה מהקו לגמרי הקישו 3"]
    : ["לפרסום כהודעה חשובה עם צינתוק לכל החברים הקישו 1", "לפרסום כהודעה רגילה הקישו 2", "למחיקה הקישו 3"];
  opts.push("לפרטים הקישו 4", "לדילוג להודעה הבאה הקישו 5", "לשמיעה חוזרת הקישו 0");
  const valid = kind === "join" ? "0.1.3.4.5" : "0.1.2.3.4.5";
  return `${items ? "id_list_message=" + items + "&" : ""}read=${await sayC(env, ctx, opts.join(". "))}=A${n + 1}_${next.name.split(".")[0]},no,1,1,15,No,no,no,,${valid}`;
}

// ---------- בקשת הצטרפות ממספר שלא רשום בקבוצה ----------
// אישור בקשת הצטרפות בלי שלבים ידניים: החבר נכנס לרשימות של הקו, ובפעם הבאה שהוא מתקשר הוא מצטרף לבד לרשימת הצינתוקים
async function nameFromRecording(env, file) {
  try {
    const wav = await ym(env, "DownloadFile", { path: "ivr2:/JoinRequests/" + file });
    let t = cleanupTranscript(await aaiSTT(env, wav, 15000)) || "";
    t = t.replace(/[.,!?"'״׳-]/g, " ").replace(/^\s*(שלום|היי|הי)\s+/, "").replace(/^\s*(שמי|השם שלי|קוראים לי|אני|זה|מדבר|כאן)\s+/, "").trim();
    const skip = new Set(["תודה", "רבה", "שלום", "ביי", "להתראות", "אני", "שמי", "רוצה", "להצטרף", "בבקשה", "הקבוצה", "לקבוצה", "כן", "אוקיי"]);
    const w = t.split(/\s+/).filter(x => /^[א-ת]+$/.test(x) && !skip.has(x)).slice(0, 3);
    return w.length ? w.join(" ") : "";
  } catch { return ""; }
}
async function approveJoin(env, phone, file, admin) {
  const people = await peopleList(env), nm = names(env);
  let name = (people.find(p => p.p === phone) || {}).n || nm[phone] || "";
  const isNew = !people.some(p => p.p === phone);
  if (isNew) {
    name = name || (file ? await nameFromRecording(env, file) : "") || "חבר חדש " + phone.slice(-4);
    await doAdmin(env, { type: "approve_join", phone, name, fromJoin: true }, admin);
  } else if (file) await ensureDir(env, "/JoinRequestsDone", false).then(() => ym(env, "FileAction", { action: "move", what: "ivr2:/JoinRequests/" + file, target: "ivr2:/JoinRequestsDone/" + Date.now().toString(36) + ".wav" })).catch(() => {});
  const ap = await kvGet(env, "approved", {}); ap[phone] = { t: nowIL(), by: admin }; await env.KV.put("approved", JSON.stringify(ap));
  await env.KV.delete("admintext");
  await log(env, `מנהל ${nm[admin] || admin} אישר את ההצטרפות של ${name} (${phone}). הוא יצטרף לרשימת הצינתוקים אוטומטית כשיתקשר`);
  return { name, isNew };
}
async function joinGate(env, u, ctx) {
  const q = Object.fromEntries(u.searchParams), phone = q.ApiPhone || "לא מזוהה";
  // מספר חסום: מנתקים מיד, בלי בקשת הצטרפות ובלי צינתוק למנהלים
  if ((await kvGet(env, "blocked", [])).includes(phone)) {
    await log(env, `מספר חסום (${phone}) ניסה להתקשר לקו ונותק`).catch(() => {});
    return "go_to_folder=hangup";
  }
  const ap = await kvGet(env, "approved", {});
  if (ap[phone]) { // מנהל כבר אישר: מצרפים אותו מיד לרשימה, בלי בקשה נוספת
    delete ap[phone]; await env.KV.put("approved", JSON.stringify(ap));
    const first = (names(env)[phone] || "").split(" ")[0];
    await log(env, `${names(env)[phone] || phone} התקשר אחרי שהבקשה שלו אושרה, ומצטרף עכשיו לרשימת הצינתוקים`).catch(() => {});
    return `id_list_message=${await sayC(env, ctx, `שלום${first ? " " + first : ""}, הבקשה שלך אושרה. בתפריט שיישמע עכשיו, כדי להצטרף לקבוצה הקישו 1`)}&go_to_folder=/JoinOK`;
  }
  // חבר שרשום בקו אבל יצא מרשימת הצינתוקים: נכנס לקו כרגיל (דרך התפריט העוקף), בלי בקשת הצטרפות
  if (!q.J && names(env)[phone]) {
    const k = "memberin:" + phone + ":" + nowIL().slice(0, 10);
    if (!(await env.KV.get(k))) { await env.KV.put(k, "1", { expirationTtl: 86400 }); await log(env, `${names(env)[phone]} לא ברשימת הצינתוקים, ולכן נכנס לקו דרך התפריט העוקף`).catch(() => {}); }
    return "go_to_folder=/Main2";
  }
  if (!q.J) {
    await log(env, `שיחה ממספר שלא רשום בקבוצה: ${phone}`).catch(() => {});
    const name = await nextName(env, "/JoinRequests", "wav");
    const prompt = "שלום. המספר שלך עדיין לא רשום בקבוצה. כדי לבקש להצטרף, אמרו את השם המלא שלכם אחרי הצליל, ובסיום הקישו סולמית. הבקשה תישלח למנהלי הקבוצה";
    return `read=${await sayC(env, ctx, prompt)}=J,no,record,/JoinRequests,${name.replace(".wav", "")},no,yes,no,1,30`;
  }
  const fname = String(q.J).split("/").pop().replace(/\.wav$/, "") + ".wav";
  if (/^\d+\.wav$/.test(fname)) { const jm = await kvGet(env, "joinmap", {}); jm[fname] = phone; await env.KV.put("joinmap", JSON.stringify(jm)); }
  await ym(env, "RunTzintuk", { phones: "tzl:admins" }).catch(() => {});
  await log(env, `בקשת הצטרפות חדשה מ-${phone} נשמרה בשלוחה 7-0 ונשלח צינתוק למנהלים`).catch(() => {});
  return `id_list_message=${await sayC(env, ctx, "הבקשה שלך נשלחה למנהלי הקבוצה. אחרי שהיא תאושר תקבלו הזמנה להצטרף. תודה ולהתראות")}&go_to_folder=hangup`;
}

// ---------- הרשמה לשמחת בית השואבה (שלוחה 9: 1 הרשמה, 2 שמיעת הנרשמים) ----------
// הרשימה של האירוע הפעיל (ברירת מחדל: שמחת בית השואבה). מנהל יכול לפתוח אירוע חדש דרך העוזר
async function rsvpLoad(env) {
  const list = {}, ev = await curEvent(env);
  try { const r = await ym(env, "GetTextFile", { what: ev.file });
    for (const line of (r.contents || "").split("\n")) { const m = /^(\d{9,10})\s*\|\s*(.*?)\s*\|\s*(.*)$/.exec(line.trim()); if (m) list[m[1]] = { n: m[2], ts: m[3] }; } } catch {}
  return list;
}
async function rsvpSave(env, list) {
  const ev = await curEvent(env), rows = Object.entries(list).sort((a, b) => (a[1].ts > b[1].ts ? 1 : -1));
  const txt = `רשומים ל${ev.title}: ${rows.length} בחורים\n` + rows.map(([p, x]) => `${p} | ${x.n} | ${x.ts}`).join("\n") + "\n";
  await ym(env, "UploadTextFile", { what: ev.file, contents: txt });
}
// כל הרשמה חדשה מתפרסמת כהודעה קצרה בהודעות הכלליות (בלי צינתוק)
async function announceRsvp(env, name, count) {
  const ev = await curEvent(env);
  await postVoice(env, [ALL], `${name} נרשם ל${ev.title}. עד עכשיו נרשמו ${count} בחורים.`);
  await log(env, `פורסמה בהודעות הכלליות ההרשמה של ${name} ל${ev.title} (${count} נרשמים)`);
}
async function rsvp(env, u, ctx) {
  const q = Object.fromEntries(u.searchParams);
  const phone = q.ApiPhone || "", me = names(env)[phone] || "";
  const [list, ev] = await Promise.all([rsvpLoad(env), curEvent(env)]);
  const n = () => Object.keys(list).length;
  if (!q.A) {
    const status = list[phone] ? "אתה כבר רשום שמגיע" : "עדיין לא אישרת הגעה";
    return `read=${await sayC(env, ctx, `הרשמה ל${ev.title}. ${status}. כרגע רשומים ${n()} בחורים. לאישור הגעה הקישו 1. לביטול הגעה הקישו 2`)}=A,no,1,1,7,No,no,no,,1.2`;
  }
  if (q.A === "1") {
    const was = !!list[phone];
    list[phone] = { n: me || phone, ts: list[phone]?.ts || nowIL() };
    await rsvpSave(env, list);
    if (!was) ctx.waitUntil(announceRsvp(env, me || "חבר חדש", n()).catch(e => log(env, "שגיאה בפרסום הרשמה: " + e.message)));
    return `id_list_message=${await sayC(env, ctx, `${was ? "אתה כבר רשום" : "נרשמת בהצלחה"}${me ? " " + me : ""}. מחכים לך ב${ev.title}. כרגע רשומים ${n()} בחורים`)}&go_to_folder=/9`;
  }
  if (q.A === "2") {
    delete list[phone];
    await rsvpSave(env, list);
    return `id_list_message=${await sayC(env, ctx, `ההגעה שלך בוטלה. כרגע רשומים ${n()} בחורים`)}&go_to_folder=/9`;
  }
  return "go_to_folder=/9";
}
async function rsvpCount(env, ctx) {
  const list = await rsvpLoad(env);
  const ns = Object.values(list).sort((a, b) => (a.ts > b.ts ? 1 : -1)).map(x => x.n);
  const ev = await curEvent(env);
  if (!ns.length) return `id_list_message=${await sayC(env, ctx, `ל${ev.title} עדיין אף אחד לא נרשם. להרשמה הקישו 1`)}&go_to_folder=/9`;
  const parts = (await Promise.all([`ל${ev.title} רשומים כרגע ${ns.length} בחורים. המגיעים הם`, ...ns, "סוף הרשימה"].filter(x => clean(x)).map(x => sayC(env, ctx, x)))).filter(x => x.length > 2);
  return `id_list_message=${parts.join(".")}&go_to_folder=/9`;
}
const reply = t => new Response(t, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
// מה שדף הניהול (src/dash.js) צריך מהקוד הזה
const DASH = { ym, kvGet, names, log, nowIL, ilAt, sortable, isHoly, holyPeriods, onlineNow, listPhones, tzintuk, doAdmin, ADMIN_ACTS, describeAct, pendingFiles, REVIEW, PENDING_ORDER, applyReview, rsvpLoad, curEvent, peopleList, allFiles, nextFileNum, OWNER, LINE_PHONE, ALL, IMPORTANT, P, PM, WHERE,
  // לניהול המתקדם בדף הניהול (ספטמבר 2026): העלאות, קול, תזמונים, גיבוי, אירוע
  ymUpload, pcmToWav, to8k, pcmTrim, ttsLong, nextName, ensureDir, bgAdd, weeklySummary, rsvpSave, saveNames, peopleRegenSteps, postVoice, notify, processFlags, event9Menu, releaseDeferred, pushUndo, wavSamples, DEFAULT_EVENT, VOICE_DIR, aiText, loadLine, retrieveContext, adminText };
export default {
  async scheduled(event, env, ctx) { NAMES_CACHE = {}; await loadNames(env); ctx.waitUntil(cron(env).catch(e => log(env, "שגיאה בריצה: " + e.message))); },
  async fetch(req, env, ctx) {
    NAMES_CACHE = {}; await loadNames(env);
    const u = new URL(req.url), raw = decodeURIComponent(req.url);
    const param = n => { const m = new RegExp("[?&/]" + n + "=([^&?/]*)").exec(raw); return m ? m[1] : ""; };
    const parts = u.pathname.split("/").filter(Boolean);
    const key = parts[2] || param("key");
    // דף הניהול: כניסה בסיסמה (cookie), בלי RUN_KEY בכתובת. הכתובת הישנה /dash מפנה אליו
    if (parts[0] === "admin") return adminApp(req, env, ctx, u, parts.slice(1), DASH);
    if (parts[0] === "dash") return Response.redirect(new URL("/admin", u).href, 302);
    if (key !== env.RUN_KEY) return new Response("ok");
    // כשהמתקשר מנתק, ימות קוראים שוב לאותה כתובת עם אותם נתונים. מתעלמים, כדי שלא יתבצע אותו דבר פעמיים
    if (u.searchParams.get("hangup") === "yes") return reply("");
    if (parts[0] === "ymx") { const m = u.searchParams.get("m"); if (m !== "DownloadFile" && m !== "GetIVR2Dir") return reply("no"); const q = {}; for (const [k, v] of u.searchParams) if (k !== "m" && k !== "key") q[k] = v; const r = await ym(env, m, q); return m === "DownloadFile" ? new Response(r) : Response.json(r); } // זמני: הורדת הקלטות לרמיקס
    if (parts[0] === "check") {
      const kind = parts[1] === "general" ? "general" : "important", phone = param("ApiPhone");
      ctx.waitUntil(checkNow(env, phone, kind).catch(e => log(env, "שגיאה בבדיקה: " + e.message)));
      return reply(`id_list_message=${await sayC(env, ctx, kind === "general" ? "ההודעה שלך עלתה לקו, תודה." : "ההודעה נשלחה לבדיקה של שרת הבינה המלאכותית. נא המתינו.")}&go_to_folder=/`);
    }
    if (parts[0] === "chat") return reply(await chat(env, u, ctx, parts[1]));
    if (parts[0] === "pending") { try { return reply(await pendingMenu(env, u, ctx)); } catch (e) { return reply("go_to_folder=/7"); } }
    if (parts[0] === "review") { const kind = REVIEW[parts[1]] ? parts[1] : "demoted"; try { return reply(await reviewPending(env, u, ctx, kind)); } catch (e) { await log(env, "שגיאה באישור הודעות: " + (e.stack || e.message)).catch(() => {}); return reply(u.searchParams.get("debug") ? String(e.stack || e) : "id_list_message=t-הייתה תקלה נסו שוב&go_to_folder=/7"); } }
    if (parts[0] === "weekly") { aiTrace = []; try { return Response.json({ ...(await weeklySummary(env, u.searchParams.get("go") !== "1")), trace: aiTrace }); } catch (e) { return Response.json({ error: String(e.message), trace: aiTrace }); } }
    if (parts[0] === "retortdry") { aiTrace = []; try { return Response.json({ reply: await maybeRetort(env, u.searchParams.get("p") || "", { snark: true, transcript: u.searchParams.get("t") || "" }, true), trace: aiTrace }); } catch (e) { return Response.json({ error: e.message, trace: aiTrace }); } }
    if (parts[0] === "ad") { try { return reply(await personalAd(env, u, ctx)); } catch (e) { return reply("go_to_folder=/Main2"); } }
    if (parts[0] === "speakel") { aiTrace = []; const t0 = Date.now(); const pcm = await elevenTTS(env, u.searchParams.get("t") || "", 12000, u.searchParams.get("v") || undefined); let r = null; if (pcm) { const name = "a" + Date.now().toString(36); await ymUpload(env, `${VOICE_DIR}/${name}.wav`, pcmToWav(pcm)); r = `f-${VOICE_DIR}/${name}`; } return Response.json({ r, ms: Date.now() - t0, trace: aiTrace }); }
    if (parts[0] === "speak") { aiTrace = []; const t0 = Date.now(); const r = await speak(env, ctx, u.searchParams.get("t") || "", { cache: u.searchParams.get("cache") === "1", budget: 9000 }); return Response.json({ r, ms: Date.now() - t0, trace: aiTrace }); }
    if (parts[0] === "online") { try { return reply(await whoOnline(env, u, ctx)); } catch (e) { return reply("go_to_folder=/5"); } }
    if (parts[0] === "incalls") return Response.json((await onlineNow(env)));
    if (parts[0] === "holy") { const at = u.searchParams.get("at") ? Date.parse(u.searchParams.get("at")) : Date.now(); return Response.json({ holy: await isHoly(env, at), at: new Date(at).toISOString(), periods: (await holyPeriods(env)).map(([a, b]) => [new Date(a).toLocaleString("sv-SE", { timeZone: "Asia/Jerusalem" }), new Date(b).toLocaleString("sv-SE", { timeZone: "Asia/Jerusalem" })]), deferred: await kvGet(env, "deferred_tz", []) }); }
    if (parts[0] === "convos") { try { return reply(await convosMenu(env, u, ctx)); } catch (e) { await log(env, "שגיאה בהאזנה לשיחות: " + e.message).catch(() => {}); return reply("go_to_folder=/7"); } }
    if (parts[0] === "world") { const loc = u.searchParams.get("place") ? await geocode(u.searchParams.get("place"), +u.searchParams.get("lat"), +u.searchParams.get("lon")) : DEFAULT_LOC; return Response.json({ loc, text: loc ? await worldText(env, loc) : null }); }
    if (parts[0] === "bgrun") { aiTrace = []; used = 0; await runBg(env); return Response.json({ left: await kvGet(env, "bgjobs", []), trace: aiTrace }); }
    if (parts[0] === "stats") { await env.KV.delete("stats"); await env.KV.delete("admintext"); return Response.json({ stats: await lineStats(env), admin: await adminText(env, await loadLine(env)) }); }
    if (parts[0] === "admintest") { aiTrace = []; used = 0; let r; try { r = await doAdmin(env, JSON.parse(u.searchParams.get("a")), u.searchParams.get("p") || "0534169095"); } catch (e) { r = "ERR " + (e.stack || e.message); } return Response.json({ r, trace: aiTrace, undo: await kvGet(env, "undo", []) }); }
    if (parts[0] === "bgadd") { await bgAdd(env, JSON.parse(u.searchParams.get("s"))); return Response.json(await kvGet(env, "bgjobs", [])); }
    if (parts[0] === "bctest") { aiTrace = []; const pcm = await ttsLong(env, "זו בדיקה של הודעה אישית לכולם."); const bid = "t" + Date.now().toString(36); await env.KV.put("bc:" + bid, to8k(pcmTrim(pcm)).buffer, { expirationTtl: 3600 }); await broadcastOne(env, { id: bid, p: u.searchParams.get("p"), folder: "/TestBg" }); return Response.json({ files: await kvGet(env, "bcfiles:" + bid, []), trace: aiTrace }); }
    if (parts[0] === "route") { aiTrace = []; return Response.json({ r: await routeAnswer(JSON.parse(u.searchParams.get("a"))), trace: aiTrace }); }
    if (parts[0] === "fetchtest_off") { const t0 = Date.now(); try { const r = await fetch(u.searchParams.get("u"), { headers: UA, signal: AbortSignal.timeout(9000) }); const t = await r.text(); return Response.json({ st: r.status, len: t.length, head: t.slice(0, 300), ms: Date.now() - t0 }); } catch (e) { return Response.json({ err: e.message, ms: Date.now() - t0 }); } }
    if (parts[0] === "news") { aiTrace = []; const t0 = Date.now(); return Response.json({ r: await newsAnswer(env, u.searchParams.get("t") || "", u.searchParams.get("admin") === "1"), ms: Date.now() - t0, trace: aiTrace }); }
    if (parts[0] === "snip") { aiTrace = []; const t0 = Date.now(); return Response.json({ r: await snippetAnswer(env, u.searchParams.get("q") || "", u.searchParams.get("en") || ""), ms: Date.now() - t0, trace: aiTrace }); }
    if (parts[0] === "web") { aiTrace = []; const t0 = Date.now(); const r = await webAnswer(env, u.searchParams.get("q") || ""); return Response.json({ r, ms: Date.now() - t0, trace: aiTrace }); }
    if (parts[0] === "introtest") { aiTrace = []; let ok; try { ok = await addIntro(env, u.searchParams.get("p"), u.searchParams.get("f")); } catch (e) { ok = "ERR " + e.message; } return Response.json({ ok, trace: aiTrace }); }
    if (parts[0] === "sef") return Response.json(await sefaria(u.searchParams.get("ref") || ""));
    if (parts[0] === "sched") return Response.json({ jobs: await kvGet(env, "scheduled", []), now: nowIL(), nextImportant: await nextFileNum(env, IMPORTANT), nextAll: await nextFileNum(env, ALL) });
    if (parts[0] === "join") return reply(await joinGate(env, u, ctx));
    if (parts[0] === "rsvp") return reply(await rsvp(env, u, ctx));
    if (parts[0] === "rsvpcount") return reply(await rsvpCount(env, ctx));
    if (parts[0] === "rsvplist") return Response.json(await rsvpLoad(env));
    if (parts[0] === "ask") { aiTrace = []; force = u.searchParams.get("force") || ""; const t0 = Date.now(); let r; try { r = await answerWithCheck(env, { text: u.searchParams.get("q") || "", phone: u.searchParams.get("phone") || "", persona: u.searchParams.get("persona") || "tzibtzer", callId: "test" }, []); if (u.searchParams.get("apply") === "1" && r.do && r.do.length) r.applied = await applyActions(env, r.do, { phone: u.searchParams.get("phone") || "", callId: "test", isAdmin: r.isAdmin }); } catch (e) { r = { error: String(e.message || e) }; } force = ""; return Response.json({ ...r, ms: Date.now() - t0, trace: aiTrace }); }
    if (parts[0] === "promo") { used = 0; const n = await releasePromo(env, parts[1]); ctx.waitUntil(processFlags(env)); return Response.json({ flagged: n }); }
    if (parts[0] === "hear") { aiTrace = []; force = u.searchParams.get("force") || ""; const t0 = Date.now(); let r;
      try { const audio = await ym(env, "DownloadFile", { path: "ivr2:" + u.searchParams.get("f") }); r = await answerWithCheck(env, { audio }, []); } catch (e) { r = { error: String(e.message || e) }; }
      force = ""; return Response.json({ ...r, ms: Date.now() - t0, trace: aiTrace }); }
    if (parts[0] === "prof") { aiTrace = []; used = 0; let n, err; try { n = await buildProfiles(env, 1); } catch (e) { err = String(e.message || e); } const p = await kvGet(env, "profiles", {}); return Response.json({ n, err, trace: aiTrace, count: Object.keys(p).length, sample: Object.values(p).slice(-1) }); }
    if (parts[0] === "cls") { aiTrace = []; used = 0; let r; try { r = await classify(env, await ym(env, "DownloadFile", { path: "ivr2:" + u.searchParams.get("f") })); } catch (e) { r = { error: String(e.message || e) }; } return Response.json({ ...r, trace: aiTrace }); }
    if (parts[0] === "cronnow") { aiTrace = []; const t0 = Date.now(); let err = null; try { await cron(env); } catch (e) { err = String(e.stack || e); } return Response.json({ err, used, ms: Date.now() - t0, trace: aiTrace, promo: await env.KV.get("promo"), lock: await env.KV.get("cronlock") }); }
    if (parts[0] === "migrate") {
      const a = await kvGet(env, "archive", {}); const keys = Object.keys(a).sort((x, y) => parseInt(y) - parseInt(x));
      keys.forEach((k, i) => { if (!a[k].s) a[k].s = i < 150 && realText(a[k].t) ? "g" : "w"; });
      await env.KV.put("archive", JSON.stringify(a)); await env.KV.put("promo", "hold");
      return Response.json({ total: keys.length, gemini: keys.filter(k => a[k].s === "g").length });
    }
    if (parts[0] === "tb") { used = 0; try { const r = await transcribeBatch(env, 3); return Response.json({ r, used, err: await env.KV.get("lastErr") }); } catch (e) { return new Response(String(e.stack || e)); } }
    if (parts[0] === "status") { const a = await kvGet(env, "archive", {}), p = await kvGet(env, "profiles", {}); const bySrc = {}; for (const e of Object.values(a)) bySrc[e.s || "?"] = (bySrc[e.s || "?"] || 0) + 1; const pend = await kvGet(env, "aai_pending", {}); return Response.json({ bySrc, pending: Object.keys(pend).length, transcribed: Object.keys(a).length, profiles: Object.keys(p).length, sample: Object.entries(a).slice(0, 2), prof: Object.values(p).slice(0, 2) }); }
    if (parts[0] === "notify") {
      ctx.waitUntil((async () => { used = 0; await notify(env, parts[1]); await processFlags(env); })().catch(e => log(env, "שגיאה בצינתוק: " + e.message)));
      return reply(`id_list_message=${await sayC(env, ctx, "נשלח צינתוק.")}&go_to_folder=/7/4`);
    }
    ctx.waitUntil(cron(env));
    return reply("ok");
  },
};