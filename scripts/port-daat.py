#!/usr/bin/env python3
# מעביר את אזור דף הניהול מ-src/dash.js לשרת של דעת תורה (live/daat/worker.js, קובץ מאוחד):
# עזרי גוגל/מפתחות/מנהלים, adminApp, והנתיבים keys..emails. שאר הקוד של דעת תורה לא נוגע.
# הרצה: python3 scripts/port-daat.py  (ואז לבדוק ולפרוס דרך Actions ← "פריסה לדעת תורה")
import os, sys
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
src = open(os.path.join(root, 'src/dash.js'), encoding='utf-8').read()
path = os.path.join(root, 'live/daat/worker.js')
b = open(path, encoding='utf-8').read()

def cut(text, start, end, start_from=0):
    i = text.index(start, start_from); j = text.index(end, i)
    return i, j

# 1) עזרים (מ"כניסה עם גוגל" ועד adminApp)
i, j = cut(src, '// כניסה עם גוגל: הדפדפן', 'export async function adminApp')
helpers = src[i:j]
# 2) adminApp
k = src.index('// יומני הכניסה לשלוחות', j)
app = src[j:k].replace('export async function adminApp', 'async function adminApp', 1).rstrip() + '\n'
# 3) הנתיבים החדשים, מותאמים לדעת תורה
ci, ce = cut(src, '    case "keys": {', '    case "whoami":')
cases = (src[ci:ce]
  .replace('API של דף הניהול של קו 073-351-2880', 'API של דף הניהול של קו דעת תורה 079-494-7582')
  .replace('worker: "https://yemot-ai.smwlyqswkwt232.workers.dev/admin/api/"', 'worker: u.origin + "/admin/api/"')
  .replace('functions/v1/admin-netfree/"', 'functions/v1/admin-netfree-daat/"'))

if '// כניסה עם גוגל: הדפדפן' in b:  # כבר הועבר בעבר – מחליפים
    hi, hj = cut(b, '// כניסה עם גוגל: הדפדפן', 'async function adminApp(req, env, ctx, u, parts, D) {')
    b = b[:hi] + b[hj:]
ai, aj = cut(b, 'async function adminApp(req, env, ctx, u, parts, D) {', '__name(adminApp, "adminApp");')
b = b[:ai] + helpers + app + b[aj:]
if '    case "keys": {' in b:
    ki, kj = cut(b, '    case "keys": {', '    case "whoami":')
    b = b[:ki] + b[kj:]
assert b.count('    case "whoami":') == 1
b = b.replace('    case "whoami":', cases + '    case "whoami":')
open(path, 'w', encoding='utf-8').write(b)
print('live/daat/worker.js עודכן מ-src/dash.js')
