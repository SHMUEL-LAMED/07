import { test } from "node:test";
import assert from "node:assert/strict";
import { extract } from "./extract.mjs";

const w = extract("src/worker.js", ["WHERE", "LINE_PHONE", "phonesIn", "callPhone", "callWhere"]);
const d = extract("src/dash.js", ["same"]);

test("callPhone: מספר המתקשר מהפורמט של ימות", () => {
  assert.equal(w.callPhone({ phone: "0554004249 זיהוי 0554004249 " }), "0554004249");
});
test("callPhone: מדלג על מספר הקו גם כשהוא ראשון", () => {
  assert.equal(w.callPhone({ phone: "0733512880 0554004249" }), "0554004249");
});
test("callPhone: בלי מספר מחזיר מחרוזת ריקה", () => {
  assert.equal(w.callPhone({ phone: "חסוי" }), "");
  assert.equal(w.callPhone(null), "");
});
test("callPhone: לא לוקח מספר משדה של מיקום", () => {
  assert.equal(w.callPhone({ path: "שלוחה 0554004249" }), "");
});
test("callWhere: הפורמטים החדשים של ימות", () => {
  assert.equal(w.callWhere({ path: "2 הקלטת הודעה" }), "מקליט הודעה");
  assert.equal(w.callWhere({ path: "שלוחה 1/2 כל ההודעות קובץ 1251" }), "שומע הודעות");
  assert.equal(w.callWhere({ path: " שלוחה ראשית" }), "בתפריט הראשי");
  assert.equal(w.callWhere({ path: "ivr2:/8/1" }), "מדבר עם העוזר החכם");
});
test("same: השוואה בזמן קבוע", () => {
  assert.equal(d.same("abc", "abc"), true);
  assert.equal(d.same("abc", "abd"), false);
  assert.equal(d.same("abc", "abcd"), false);
});
