// דחיית צינתוקים בזמן שבת וחג: בודקים את ym עם KV מדומה, בלי פנייה לימות
import { test } from "node:test";
import assert from "node:assert/strict";
import { extract } from "./extract.mjs";

const mkEnv = () => { const m = new Map(); return { YM_TOKEN: "x", KV: { get: async (k, t) => (m.has(k) ? (t === "json" ? JSON.parse(m.get(k)) : m.get(k)) : null), put: async (k, v) => m.set(k, v), delete: async k => m.delete(k) }, _m: m }; };
function load(holy, ymResult) {
  const calls = globalThis.__ymCalls = [];
  const fns = extract("src/worker.js", ["YM", "kvGet", "nowIL", "tzRetryAdd", "ym", "ymRaw"],
    `var used = 0, LINE_PHONE = "0733512880"; var isHoly = async () => ${holy}; var alert = async () => {};
     var fetch = async u => { globalThis.__ymCalls.push(String(u)); return { ok: true, json: async () => (${JSON.stringify(ymResult)}) }; };`);
  return { ...fns, calls };
}
test("צינתוק בשבת נשמר ולא נשלח", async () => {
  const f = load(true, { responseStatus: "OK" }), env = mkEnv();
  const r = await f.ym(env, "RunTzintuk", { phones: "tzl:members" });
  assert.equal(r.deferred, true);
  assert.equal(f.calls.length, 0);
  assert.deepEqual(JSON.parse(env._m.get("deferred_tz")), ["tzl:members"]);
});
test("צינתוק עם force יוצא גם בשבת", async () => {
  const f = load(true, { responseStatus: "OK" }), env = mkEnv();
  await f.ym(env, "RunTzintuk", { phones: "tzl:admins", force: 1 });
  assert.equal(f.calls.length, 1);
  assert.ok(!f.calls[0].includes("force"));
});
test("צינתוק שנכשל נכנס לתור הניסיונות החוזרים", async () => {
  const f = load(false, { responseStatus: "ERROR", message: "busy" }), env = mkEnv();
  await f.ym(env, "RunTzintuk", { phones: "tzl:members" });
  const q = JSON.parse(env._m.get("tz_retry"));
  assert.equal(q.length, 1); assert.equal(q[0].phones, "tzl:members"); assert.equal(q[0].n, 0);
});
test("צינתוק שהצליח לא נכנס לתור", async () => {
  const f = load(false, { responseStatus: "OK" }), env = mkEnv();
  await f.ym(env, "RunTzintuk", { phones: "tzl:members" });
  assert.equal(env._m.has("tz_retry"), false);
});
