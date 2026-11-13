import { test } from "node:test";
import assert from "node:assert/strict";
import { extract } from "./extract.mjs";

const w = extract("src/worker.js", ["JUNK", "realText", "profileGroups"]);

test("שני מספרים עם אותו שם בקו – פרופיל אחד עם כל ההודעות", () => {
  const archive = {
    "001.wav": { p: "0501111111", t: "הודעה ראשונה של יוסי", s: "g" },
    "002.wav": { p: "0502222222", t: "הודעה מהטלפון השני של יוסי", s: "g" },
    "003.wav": { p: "0503333333", t: "הודעה של דוד", s: "g" },
    "004.wav": { p: "0504444444", t: "בלי שם", s: "a" },
    "005.wav": { p: "0501111111", t: "תודה", s: "g" }, // לא נחשב (JUNK)
  };
  const nm = { "0501111111": "יוסי כהן", "0502222222": "יוסי כהן ", "0503333333": "דוד" };
  const g = w.profileGroups(archive, nm);
  assert.deepEqual(Object.keys(g).sort(), ["0501111111", "0503333333", "0504444444"]);
  assert.deepEqual(g["0501111111"].phones, ["0501111111", "0502222222"]);
  assert.equal(g["0501111111"].msgs.length, 2);
  assert.deepEqual(g["0504444444"].phones, ["0504444444"]);
});
