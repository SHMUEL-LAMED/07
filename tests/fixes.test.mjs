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
test("nameLike: תחילית לפני שם של שלוש אותיות (למשה, לכהן, הלוי, ומשה)", () => {
  const n = extract("src/worker.js", ["SOUND", "soundKey", "editDist", "nameLike"]);
  for (const [w, p] of [["למשה", "משה"], ["לכהן", "כהן"], ["הלוי", "לוי"], ["ומשה", "משה"], ["שלמשה", "משה"], ["לאברהם", "אברהם"]]) assert.equal(n.nameLike(w, p), true, w);
  assert.equal(n.nameLike("שולחן", "משה"), false);
});
test("csvCell: תא שמתחיל בסימן נוסחה מקבל גרש, ומספרים וטלפונים נשארים כמו שהם", () => {
  const { csvCell } = extract("src/dash.js", ["csvCell"]);
  assert.equal(csvCell('=HYPERLINK("http://x","y")'), `"'=HYPERLINK(""http://x"",""y"")"`);
  assert.equal(csvCell("@cmd"), "'@cmd");
  assert.equal(csvCell("-ברוך הבא"), "'-ברוך הבא");
  assert.equal(csvCell("+972501234567"), "+972501234567");
  assert.equal(csvCell("-5"), "-5");
  assert.equal(csvCell("0501234567"), "0501234567");
  assert.equal(csvCell("שלום, עולם"), '"שלום, עולם"');
});
test("unxml: HTML מקודד בתיאור RSS לא משאיר שאריות של תגים", () => {
  const { unxml } = extract("src/worker.js", ["unxml"]);
  assert.equal(unxml("&lt;p&gt;hello&lt;/p&gt;"), "hello");
  assert.equal(unxml("<![CDATA[a &amp; b]]>"), "a & b");
});
