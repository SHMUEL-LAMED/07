import { test } from "node:test";
import assert from "node:assert/strict";
import { factory } from "../src/factory.js";

// ימות מדומה של הקו החדש: תיקיות וקבצים בזיכרון, ו-FileAction move שמעביר באמת
function fakeYemot(tree) {
  const calls = [];
  globalThis.fetch = async (input, init) => {
    const u = new URL(typeof input === "string" || input instanceof URL ? String(input) : input.url);
    const method = u.pathname.split("/").pop();
    const q = Object.fromEntries(u.searchParams);
    if (init && init.body instanceof URLSearchParams) Object.assign(q, Object.fromEntries(init.body));
    calls.push({ method, q });
    const json = o => new Response(JSON.stringify(o));
    if (method === "GetSession") return json({ responseStatus: "OK", username: "0771111111" });
    if (method === "GetIVR2Dir") {
      const p = q.path.replace(/^ivr2:/, "") || "/";
      if (!(p in tree)) return json({ responseStatus: "ERROR", message: "not found" });
      const kids = Object.keys(tree).filter(k => k !== p && k.startsWith(p === "/" ? "/" : p + "/") && !k.slice(p === "/" ? 1 : p.length + 1).includes("/"));
      return json({ responseStatus: "OK", dirs: kids.map(k => ({ name: k.split("/").pop() })), files: tree[p].map(name => ({ name })) });
    }
    if (method === "UpdateExtension") { tree[q.path.replace(/^ivr2:/, "")] = ["ext.ini"]; return json({ responseStatus: "OK" }); }
    if (method === "FileAction") {
      const what = q.what.replace(/^ivr2:/, ""), dir = what.slice(0, what.lastIndexOf("/")), name = what.split("/").pop();
      if (q.action === "delete") {
        if (what in tree) { for (const k of Object.keys(tree)) if (k === what || k.startsWith(what + "/")) delete tree[k]; return json({ responseStatus: "OK" }); }
        if (!(tree[dir] || []).includes(name)) return json({ responseStatus: "ERROR", message: "not found" });
        tree[dir] = tree[dir].filter(n => n !== name); return json({ responseStatus: "OK" });
      }
      const to = q.target.replace(/^ivr2:/, ""), tdir = to.slice(0, to.lastIndexOf("/"));
      if (!(tree[dir] || []).includes(name)) return json({ responseStatus: "ERROR", message: "no file" });
      tree[dir] = tree[dir].filter(n => n !== name); tree[tdir].push(to.split("/").pop());
      return json({ responseStatus: "OK" });
    }
    return json({ responseStatus: "OK" });
  };
  return calls;
}
function env(m0) {
  const m = m0 || new Map([["factory_lines", JSON.stringify([{ slug: "nn", name: "קו חדש", line: "0771111111", url: "https://yemot-line-nn.x.workers.dev" }])]]);
  return { KV: { async get(k, t) { const v = m.get(k) ?? null; return v && t === "json" ? JSON.parse(v) : v; }, async put(k, v) { m.set(k, v); }, async delete(k) { m.delete(k); }, async list({ prefix }) { return { keys: [...m.keys()].filter(k => k.startsWith(prefix)).map(name => ({ name })), list_complete: true }; } } };
}
const D = { log: async () => {}, LINE_PHONE: "0733512880" };
const req = { method: "POST" };

test("הודעות שהיו בשלוחה 1 עוברות לסוף 1/2 לפי הסדר, בלי מחיקה", async () => {
  const tree = { "/1": ["ext.ini", "000.wav", "000.txt", "001.wav", "M1000.wav"], "/1/2": ["ext.ini", "000.wav", "001.wav", "002.wav"] };
  fakeYemot(tree);
  const r = await factory(req, env(), { op: "preserve", slug: "nn", ymToken: "0771111111:1234" }, D, "https://yemot-ai.x.workers.dev");
  assert.equal(r.moved, 2);
  assert.equal(r.left, 0);
  assert.deepEqual(r.failed, []);
  assert.deepEqual(tree["/1"].sort(), ["M1000.wav", "ext.ini"]); // הקריינות וההגדרות נשארות
  assert.deepEqual(tree["/1/2"].sort(), ["000.wav", "001.wav", "002.wav", "003.txt", "003.wav", "004.wav", "ext.ini"]);
});

test("אין 1/2 – נוצרת (בלי ext.ini) וההודעות עוברות אליה מ-000", async () => {
  const tree = { "/1": ["005.wav"] };
  fakeYemot(tree);
  const r = await factory(req, env(), { op: "preserve", slug: "nn", ymToken: "0771111111:1234" }, D, "https://yemot-ai.x.workers.dev");
  assert.equal(r.moved, 1);
  assert.deepEqual(tree["/1"], []);
  assert.deepEqual(tree["/1/2"], ["000.wav"]);
});

test("אין שלוחה 1 – לא קורה כלום", async () => {
  const tree = {};
  const calls = fakeYemot(tree);
  const r = await factory(req, env(), { op: "preserve", slug: "nn", ymToken: "0771111111:1234" }, D, "https://yemot-ai.x.workers.dev");
  assert.deepEqual(r, { moved: 0, left: 0, failed: [] });
  assert.equal(calls.filter(c => c.method === "FileAction").length, 0);
});

test("הסרה: אחרי העברת הודעות ויצירת תיקיות, המערכת חוזרת בדיוק למה שהייתה", async () => {
  const tree = { "/": ["ext.ini"], "/1": ["ext.ini", "000.wav", "001.wav", "001.txt"], "/3": ["ext.ini"] };
  const before = JSON.parse(JSON.stringify(tree));
  fakeYemot(tree);
  const E = env();
  const tok = { slug: "nn", ymToken: "0771111111:1234" };
  await factory(req, E, { op: "preserve", ...tok }, D, "https://yemot-ai.x.workers.dev");
  for (let i = 0, r = { left: [1] }; i < 10 && (i === 0 || r.left.length); i++) r = await factory(req, E, { op: "structure", ...tok, paths: i ? r.left : [], required: i === 0 }, D, "https://yemot-ai.x.workers.dev");
  assert.ok(tree["/1/1"] && tree["/AIQueue"], "התיקיות נוצרו");
  assert.deepEqual(tree["/1/2"].sort(), ["000.wav", "001.txt", "001.wav"]);
  let r;
  for (let i = 0; i < 20; i++) { r = await factory(req, E, { op: "restore", ...tok }, D, "https://yemot-ai.x.workers.dev"); if (!r.left) break; }
  assert.equal(r.left, 0);
  assert.deepEqual(r.notes, []);
  const norm = t => Object.fromEntries(Object.entries(t).map(([k, v]) => [k, [...v].sort()]).sort());
  assert.deepEqual(norm(tree), norm(before));
});

test("הסרה: תיקייה שנוספו בה הודעות אחרי החיבור נשארת", async () => {
  const tree = { "/": ["ext.ini"] };
  fakeYemot(tree);
  const E = env();
  const tok = { slug: "nn", ymToken: "0771111111:1234" };
  for (let i = 0, r = { left: [1] }; i < 10 && (i === 0 || r.left.length); i++) r = await factory(req, E, { op: "structure", ...tok, paths: i ? r.left : [], required: i === 0 }, D, "https://yemot-ai.x.workers.dev");
  tree["/1/1"].push("000.wav"); // הודעה חשובה שהוקלטה בקו החדש
  let r;
  for (let i = 0; i < 20; i++) { r = await factory(req, E, { op: "restore", ...tok }, D, "https://yemot-ai.x.workers.dev"); if (!r.left) break; }
  assert.ok(tree["/1/1"].includes("000.wav"), "ההודעה לא נמחקה");
  assert.ok(r.notes.some(n => n.startsWith("/1/1")) || r.notes.some(n => n.startsWith("/1")));
  assert.equal(tree["/AIQueue"], undefined, "תיקייה ריקה נמחקה");
});

test("סנכרון שמות: רק מספרים שבקו החדש, בלי לדרוס שם קיים", async () => {
  const remote = { kvn: { names_over: JSON.stringify({ "0501111111": "שם קיים בקו החדש" }) }, kvo: { names_over: JSON.stringify({ "0502222222": "יוסי מקו אחר" }) } };
  globalThis.fetch = async (input, init) => {
    const u = new URL(String(input instanceof Request ? input.url : input));
    const json = o => new Response(JSON.stringify(o));
    if (u.host === "api.cloudflare.com") {
      const m = u.pathname.match(/namespaces\/([^/]+)\/values\/(.+)$/), id = m[1], key = decodeURIComponent(m[2]);
      if ((init && init.method) === "PUT") { (remote[id] = remote[id] || {})[key] = String(init.body); return json({ success: true }); }
      const v = remote[id] && remote[id][key];
      return v == null ? new Response("", { status: 404 }) : new Response(v);
    }
    const method = u.pathname.split("/").pop();
    if (method === "GetSession") return json({ responseStatus: "OK", username: "0771111111" });
    if (method === "TzintukimListManagement") return json({ responseStatus: "OK", enteres: u.searchParams.get("TzintukimList") === "members" ? [{ phone: "0501111111" }, { phone: "0502222222" }, { phone: "0503333333" }] : [] });
    return json({ responseStatus: "OK" });
  };
  const m = new Map([
    ["factory_lines", JSON.stringify([{ slug: "nn", name: "קו חדש", line: "0771111111", kv: "kvn", url: "https://a.b" }, { slug: "oo", name: "קו אחר", line: "0772222222", kv: "kvo", url: "https://c.d" }])],
    ["names_over", JSON.stringify({ "0501111111": "שם מקו המקור", "0503333333": "דוד מקו המקור", "0509999999": "לא בקו החדש" })],
  ]);
  const E = { CF_FACTORY_TOKEN: "t", CF_ACCOUNT_ID: "acc", KV: { async get(k, t) { const v = m.get(k) ?? null; return v && t === "json" ? JSON.parse(v) : v; }, async put(k, v) { m.set(k, v); }, async delete(k) { m.delete(k); } } };
  const r = await factory({ method: "POST" }, E, { op: "names", slug: "nn", ymToken: "0771111111:1234" }, { log: async () => {} }, "https://x.y");
  assert.equal(r.phones, 3);
  assert.equal(r.added, 2);
  const out = JSON.parse(remote.kvn.names_over);
  assert.deepEqual(out, { "0501111111": "שם קיים בקו החדש", "0502222222": "יוסי מקו אחר", "0503333333": "דוד מקו המקור" });
});

test("קריינות בשלוחה הראשית: נתיב בלי // כפול", async () => {
  const uploads = [];
  globalThis.fetch = async (input, init) => {
    const u = new URL(String(input instanceof Request ? input.url : input));
    const method = u.pathname.split("/").pop();
    const json = o => new Response(JSON.stringify(o));
    if (method === "GetSession") return json({ responseStatus: "OK", username: "0771111111" });
    if (method === "GetIVR2Dir") return json({ responseStatus: "OK", dirs: [], files: [{ name: "ext.ini" }] });
    if (method === "UploadFile") { uploads.push(init.body.get("path")); return json({ responseStatus: "OK" }); }
    return json({ responseStatus: "OK" });
  };
  const downloads = [];
  const Dsrc = { log: async () => {}, ym: async (env, method, q) => {
    if (method === "GetIVR2Dir") return { responseStatus: "OK", dirs: [], files: [{ name: "M1000.wav" }, { name: "PlayfileMessageCheck-NImportant.wav" }, { name: "000.wav" }] };
    if (method === "DownloadFile") { downloads.push(q.path); return new Uint8Array([1, 2, 3]); }
    return { responseStatus: "OK", contents: "" };
  } };
  const r = await factory({ method: "POST" }, env(), { op: "audio", slug: "nn", ymToken: "0771111111:1234", paths: ["/"] }, Dsrc, "https://x.y");
  assert.deepEqual(r.failed, []);
  assert.deepEqual(r.copied.sort(), ["/M1000.wav", "/PlayfileMessageCheck-NImportant.wav"]);
  assert.deepEqual(downloads.sort(), ["ivr2:/M1000.wav", "ivr2:/PlayfileMessageCheck-NImportant.wav"]);
  assert.deepEqual(uploads.sort(), ["ivr2:/M1000.wav", "ivr2:/PlayfileMessageCheck-NImportant.wav"]);
});

test("טוקן: נשמר מוצפן בפעם הראשונה, ואחר כך לא צריך לשלוח אותו", async () => {
  const tree = { "/1": ["ext.ini"] };
  fakeYemot(tree);
  const E = env(); E.RUN_KEY = "secret-run-key";
  await assert.rejects(factory(req, E, { op: "tokcheck", slug: "nn", ymToken: "" }, D, "https://x.y"), /פעם אחת/);
  await factory(req, E, { op: "tokcheck", slug: "nn", ymToken: "0771111111:1234" }, D, "https://x.y");
  const reg = JSON.parse(await E.KV.get("factory_lines"));
  assert.ok(reg[0].tokEnc && !reg[0].tokEnc.includes("0771111111"), "נשמר מוצפן");
  const r = await factory(req, E, { op: "tokcheck", slug: "nn", ymToken: "" }, D, "https://x.y");
  assert.equal(r.ok, true);
  // מפתח אחר (RUN_KEY הוחלף) – השמור לא נפתח ומבקשים שוב
  E.RUN_KEY = "other";
  await assert.rejects(factory(req, E, { op: "tokcheck", slug: "nn", ymToken: "" }, D, "https://x.y"), /פעם אחת/);
  // טוקן של מערכת אחרת נדחה
  E.RUN_KEY = "secret-run-key";
  await assert.rejects(factory(req, E, { op: "tokcheck", slug: "nn", ymToken: "0779999999:1" }, D, "https://x.y"), /לא שייך/);
});
