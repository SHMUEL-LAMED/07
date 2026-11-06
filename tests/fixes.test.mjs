import { test } from "node:test";
import assert from "node:assert/strict";
import { extract } from "./extract.mjs";

const w = extract("src/worker.js", ["forceEnv", "personalIni"]);

test("forceEnv: force נשמר רק על env של הבקשה ולא דולף ל-env המקורי", () => {
  const env = { KV: { x: 1 }, RUN_KEY: "k" };
  const e = w.forceEnv(env, "cf");
  assert.equal(e._force, "cf");
  assert.equal(e.KV, env.KV);
  assert.equal(e.RUN_KEY, "k");
  assert.equal(env._force, undefined);
  assert.equal(w.forceEnv(env, null)._force, "");
});
test("personalIni: ירידת שורה בשם לא מוסיפה הגדרות ל-ext.ini", () => {
  const ini = w.personalIni({ n: "דני\ntype=api\r\napi_link=https://x", p: "0501234567", c: "12" });
  assert.ok(!/^type=api/m.test(ini));
  assert.ok(!/^api_link=/m.test(ini));
  assert.match(ini, /^title=הודעה אישית לדני type=api api_link=https:\/\/x$/m);
});
