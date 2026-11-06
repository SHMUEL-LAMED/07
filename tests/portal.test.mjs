import { test } from "node:test";
import assert from "node:assert/strict";
import { portal } from "../src/portal.js";

// KV מקומי (קו המקור) ו-KV של קווים אחרים דרך ה-API של Cloudflare – הכול בזיכרון, בלי רשת
function kvMem(init = {}) {
  const m = new Map(Object.entries(init));
  return {
    m,
    async get(k, t) { const v = m.has(k) ? m.get(k) : null; return v != null && t === "json" ? JSON.parse(v) : v; },
    async put(k, v) { m.set(k, String(v)); },
    async delete(k) { m.delete(k); },
    async list({ prefix }) { return { keys: [...m.keys()].filter(k => k.startsWith(prefix)).map(name => ({ name })), list_complete: true }; },
  };
}
function setup(remote = {}) {
  const token = "a".repeat(64), owner = "o@x.com";
  const KV = kvMem({
    ["portal_session:" + token]: JSON.stringify({ email: owner, exp: Date.now() + 1e6 }),
    factory_lines: JSON.stringify([{ slug: "bb", name: "קו ב", line: "0521234567", kv: "kvb", url: "https://yemot-line-bb.x.workers.dev" }]),
    ["portal_synced:" + owner + ":bb"]: "1",
  });
  const stores = { kvb: new Map(Object.entries(remote)), daatkv: new Map() }, puts = [];
  globalThis.fetch = async (url, init = {}) => {
    const u = new URL(url), method = init.method || "GET";
    if (u.pathname.endsWith("/workers/scripts/yemot-ai-daat/settings"))
      return new Response(JSON.stringify({ success: true, result: { bindings: [{ type: "kv_namespace", name: "KV", namespace_id: "daatkv" }] } }));
    const m = u.pathname.match(/\/storage\/kv\/namespaces\/([^/]+)\/values\/(.+)$/);
    if (!m) return new Response("{}", { status: 404 });
    const s = stores[m[1]], key = decodeURIComponent(m[2]);
    if (method === "GET") return s.has(key) ? new Response(s.get(key)) : new Response("", { status: 404 });
    if (method === "PUT") { s.set(key, String(init.body)); puts.push({ ns: m[1], key, ttl: u.searchParams.get("expiration_ttl") }); return new Response("{}"); }
    if (method === "DELETE") { s.delete(key); return new Response("{}"); }
  };
  const env = { KV, OWNER_EMAIL: owner, CF_FACTORY_TOKEN: "t", CF_ACCOUNT_ID: "acc" };
  const call = (action, body) => portal(new Request("https://w/admin/api/portal?action=" + action, body ? { method: "POST", body: JSON.stringify(body), headers: { authorization: "Bearer " + token } } : { headers: { authorization: "Bearer " + token } }), env, async () => owner).then(r => r.json());
  return { env, KV, stores, puts, call };
}

test("portal copy: בלי הודעות אישיות (pm/remind), שומר את האישיות של היעד, ולא מעתיק רשימות לפי טלפון", async () => {
  const src = [{ id: "1", type: "tz", at: "x" }, { id: "2", type: "pm", phones: ["0501111111"], text: "סוד" }, { id: "3", type: "remind", phone: "0502222222" }, { id: "4", type: "post", done: 1 }];
  const dst = [{ id: "9", type: "pm", phones: ["0523333333"], text: "של היעד" }];
  const t = setup({ scheduled: JSON.stringify(dst), strict: JSON.stringify(["0524444444"]) });
  await t.KV.put("scheduled", JSON.stringify(src));
  await t.KV.put("strict", JSON.stringify(["0501111111"]));
  const pre = await t.call("copy", { from: "shimchas", to: "bb", keys: ["scheduled", "strict", "event"] });
  assert.equal(pre.preview, true);
  assert.ok(pre.items.find(x => x.k === "strict").skip);
  assert.ok(pre.items.find(x => x.k === "event").skip);
  const r = await t.call("copy", { from: "shimchas", to: "bb", keys: ["scheduled", "strict", "event"], preview: false, confirm: "bb" });
  assert.equal(r.ok, true);
  const got = JSON.parse(t.stores.kvb.get("scheduled"));
  assert.deepEqual(got.map(j => j.id).sort(), ["1", "9"]);
  assert.deepEqual(JSON.parse(t.stores.kvb.get("strict")), ["0524444444"]);
  assert.equal(t.puts.find(p => p.key === "copybak:scheduled").ttl, String(7 * 86400));
});

test("portal access: הסרה לא יוצרת חסימה קבועה, וחשבון חסום שאינו מאושר מופיע ברשימה", async () => {
  const t = setup({ dash_emails: JSON.stringify([{ e: "c@x.com", role: "admin" }]) });
  await t.KV.put("portal_approved:c@x.com", "1");
  await t.KV.put("portal_memberships:c@x.com", JSON.stringify(["bb"]));
  await t.KV.put("portal_synced:c@x.com:bb", "1");
  await t.KV.put("portal_blocked:old@x.com", "1");
  const r = await t.call("access", { email: "c@x.com", approved: false });
  assert.equal(r.ok, true);
  assert.equal(await t.KV.get("portal_blocked:c@x.com"), null);
  assert.equal(await t.KV.get("portal_approved:c@x.com"), null);
  assert.deepEqual(JSON.parse(t.stores.kvb.get("dash_emails")), []);
  const me = await t.call("me");
  assert.deepEqual(me.clients.map(c => [c.email, c.blocked]), [["old@x.com", true]]);
  assert.equal(me.lines.find(l => l.slug === "bb").url, "/07/line/?l=bb");
});

test("portal assign: לא משנה תפקיד שמנהל הקו קבע, ובביטול לא מוחק אותו", async () => {
  const t = setup({ dash_emails: JSON.stringify([{ e: "v@x.com", role: "viewer" }]) });
  assert.equal((await t.call("assign", { email: "v@x.com", lines: ["bb"] })).ok, true);
  assert.deepEqual(JSON.parse(t.stores.kvb.get("dash_emails")), [{ e: "v@x.com", role: "viewer" }]);
  assert.equal((await t.call("assign", { email: "v@x.com", lines: [] })).ok, true);
  assert.deepEqual(JSON.parse(t.stores.kvb.get("dash_emails")), [{ e: "v@x.com", role: "viewer" }]);
});
