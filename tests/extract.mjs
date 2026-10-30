// מוציא פונקציות וקבועים מקובץ השרת לפי שם, כדי לבדוק אותם ב-Node בלי לטעון את כל ה-Worker
import { readFileSync } from "node:fs";
export function extract(file, names, extra = "") {
  const lines = readFileSync(new URL("../" + file, import.meta.url), "utf8").split("\n");
  const out = [];
  for (const n of names) {
    const re = new RegExp(`^(?:async\\s+)?(?:function\\s+${n}\\b|(?:const|let)\\s+${n}\\s*=)`);
    const i = lines.findIndex(l => re.test(l));
    if (i < 0) throw new Error("לא נמצא " + n + " ב-" + file);
    let j = i + 1;
    while (j < lines.length && !/^(?:async |function |const |let |export |\/\/|import |$)/.test(lines[j])) j++;
    out.push(lines.slice(i, j).join("\n").replace(/^const /, "var ").replace(/^let /, "var "));
  }
  return new Function(extra + out.join("\n") + `\nreturn { ${names.join(", ")} };`)();
}
