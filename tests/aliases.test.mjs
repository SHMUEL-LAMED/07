import { test } from "node:test";
import assert from "node:assert/strict";
import { extract } from "./extract.mjs";

// מספר נוסף של חבר: מקבל את השם שלו, ולא נספר כחבר נפרד
const W = extract("src/worker.js", ["names0", "names", "kvGet", "saveNames", "loadNames", "memberNames"],
  "var NAMES_CACHE = {}, ALIASES = {};");
const kv = init => { const m = new Map(Object.entries(init)); return { m, get: async (k, t) => { const v = m.get(k); return v == null ? null : t === "json" ? JSON.parse(v) : v; }, put: async (k, v) => { m.set(k, v); } }; };

test("מספר נוסף מקבל את שם החבר ולא נספר כחבר", async () => {
  const env = { KV: kv({ aliases: JSON.stringify({ "0522222222": "0521111111" }) }) };
  await W.saveNames(env, [{ p: "0521111111", n: "משה", c: "01" }]);
  const over = JSON.parse(env.KV.m.get("names_over"));
  assert.equal(over["0522222222"], "משה");
  await W.loadNames(env);
  assert.equal(W.names(env)["0522222222"], "משה");
  assert.deepEqual(Object.keys(W.memberNames(env)), ["0521111111"]);
});

test("מספר נוסף שהפך לחבר – הקישור נמחק", async () => {
  const env = { KV: kv({ aliases: JSON.stringify({ "0522222222": "0521111111" }) }) };
  await W.saveNames(env, [{ p: "0521111111", n: "משה", c: "01" }, { p: "0522222222", n: "יוסף", c: "02" }]);
  assert.deepEqual(JSON.parse(env.KV.m.get("aliases")), {});
  assert.equal(W.names(env)["0522222222"], "יוסף");
});

test("חבר שהוסר – הקישור נשמר אבל לא חל", async () => {
  const env = { KV: kv({ aliases: JSON.stringify({ "0522222222": "0521111111" }) }) };
  await W.saveNames(env, []);
  assert.deepEqual(JSON.parse(env.KV.m.get("aliases")), { "0522222222": "0521111111" });
  assert.equal(W.names(env)["0522222222"], undefined);
});
