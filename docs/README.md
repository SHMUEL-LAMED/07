# GitHub Pages – 07

הדף הציבורי של ממשק הניהול נמצא ב-docs/index.html (ועותק זהה ב-index.html בשורש).

כתובת היעד: https://shmuel-lamed.github.io/07/

הדף הסטטי לא מכיל סיסמה, API key או סוד אחר. הכניסה מתבצעת מול ה-Cloudflare Worker, שמחזיר אסימון חתום זמני.

## הנתיב דרך נטפרי
נטפרי חוסם את workers.dev, ולכן הדפדפן לא פונה ל-Worker ישירות אלא דרך Supabase Edge Function:

GitHub Pages → `https://ydcfafijktzasrkkxyux.supabase.co/functions/v1/admin-netfree/<route>` → `https://yemot-ai.smwlyqswkwt232.workers.dev/admin/api/<route>`

- קוד הגשר: `supabase/functions/admin-netfree/index.ts` (פריסה: `supabase functions deploy admin-netfree --no-verify-jwt`).
- הדפדפן שולח את האסימון בפרמטר `token` (בלי כותרת Authorization ובלי preflight); הגשר ממיר אותו לכותרת `Authorization: Bearer` מול ה-Worker ומוסיף `X-Requested-With: dash` ל-POST.
- הגשר מעביר רק את נתיבי ה-API של דף הניהול, ומחזיר CORS למקור `https://shmuel-lamed.github.io` בלבד.
