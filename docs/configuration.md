# הגדרות וסודות

הקוד רץ כ-Cloudflare Worker בשם `yemot-ai`. ה-bindings וה-cron מוגדרים ב-`wrangler.toml`; הסודות והמשתנים – ב-Cloudflare בלבד, לא בריפו.

| סוג | שמות | טיפול |
|---|---|---|
| סודות | `YM_TOKEN`, `RUN_KEY`, `GEMINI_KEY`, `GEMINI_KEYS`, `GROQ_KEY`, `AAI_KEY`, `ELEVEN_KEY`, `PROVIDERS` | `npx wrangler secret put <NAME>`; אין להכניס ערכים לריפו |
| משתנים | `NAMES` (שמות החברים, JSON), `GROQ_MODELS` | בלוח הבקרה של Cloudflare (Variables); לא בריפו |
| תצורה | `TEST_MODE` | ב-`wrangler.toml`: `"0"` בייצור, `"1"` = צינתוקים רק למנהלים (לבדיקות) |
| Bindings | `KV` (מזהה ה-namespace ב-`wrangler.toml`), `AI` (Workers AI) | |

הרשימה המלאה של השמות נמצאת גם ב-`.dev.vars.example`. לפיתוח מקומי (`wrangler dev`) מעתיקים אותו ל-`.dev.vars`, שלא נכנס לריפו.

## הערת אבטחה

מסלולי הניהול והבדיקה (למשל `/dash`, `/sched`, `/incalls`) מזוהים היום דרך `RUN_KEY` בנתיב או בכתובת. מפתח כזה עלול להופיע ביומנים ובהיסטוריית דפדפן. מומלץ להעביר את דף הניהול לאימות נפרד (סיסמה ו-cookie) ולסגור מסלולי בדיקה שמפעילים פעולות או מחזירים נתונים אישיים. זהו שינוי שדורש בדיקה ואישור לפני פריסה.
