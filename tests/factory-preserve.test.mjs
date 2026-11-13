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
      return json({ responseStatus: "OK", dirs: [], files: tree[p].map(name => ({ name })) });
    }
    if (method === "UpdateExtension") { tree[q.path.replace(/^ivr2:/, "")] = ["ext.ini"]; return json({ responseStatus: "OK" }); }
    if (method === "FileAction") {
      const what = q.what.replace(/^ivr2:/, ""), dir = what.slice(0, what.lastIndexOf("/")), name = what.split("/").pop();
      if (q.action === "delete") { tree[dir] = (tree[dir] || []).filter(n => n !== name); return json({ responseStatus: "OK" }); }
      const to = q.target.replace(/^ivr2:/, ""), tdir = to.slice(0, to.lastIndexOf("/"));
      if (!(tree[dir] || []).includes(name)) return json({ responseStatus: "ERROR", message: "no file" });
      tree[dir] = tree[dir].filter(n => n !== name); tree[tdir].push(to.split("/").pop());
      return json({ responseStatus: "OK" });
    }
    return json({ responseStatus: "OK" });
  };
  return calls;
}
function env() {
  const m = new Map([["factory_lines", JSON.stringify([{ slug: "nn", name: "קו חדש", line: "0771111111", url: "https://yemot-line-nn.x.workers.dev" }])]]);
  return { KV: { async get(k, t) { const v = m.get(k) ?? null; return v && t === "json" ? JSON.parse(v) : v; }, async put(k, v) { m.set(k, v); }, async delete(k) { m.delete(k); } } };
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
