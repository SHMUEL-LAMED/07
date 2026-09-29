# GitHub Pages – 07

דף הניהול הוא קובץ אחד: `src/dash.html`. אותו קובץ נטען גם ב-Worker (`/admin`, עם cookie) וגם ב-GitHub Pages (דרך Supabase, עם אסימון) – הוא מזהה לבד איפה הוא רץ.
`index.html` ו-`docs/index.html` הם עותקים זהים שלו. אחרי כל שינוי מריצים `scripts/sync-pages.sh`.

כתובת היעד: https://shmuel-lamed.github.io/07/

הדף הסטטי לא מכיל סיסמה, API key או סוד אחר. הכניסה מתבצעת מול ה-Cloudflare Worker, שמחזיר אסימון חתום זמני.

## הנתיב דרך נטפרי
נטפרי חוסם את workers.dev, ולכן הדפדפן לא פונה ל-Worker ישירות אלא דרך Supabase Edge Function:

GitHub Pages → `https://ydcfafijktzasrkkxyux.supabase.co/functions/v1/admin-netfree/<route>` → `https://yemot-ai.smwlyqswkwt232.workers.dev/admin/api/<route>`

- קוד הגשר: `supabase/functions/admin-netfree/index.ts` (פריסה: `supabase functions deploy admin-netfree --no-verify-jwt`).
- הדפדפן שולח את האסימון בפרמטר `token` (בלי כותרת Authorization ובלי preflight); הגשר ממיר אותו לכותרת `Authorization: Bearer` מול ה-Worker ומוסיף `X-Requested-With: dash` ל-POST.
- הגשר מעביר רק את נתיבי ה-API של דף הניהול, ומחזיר CORS למקור `https://shmuel-lamed.github.io` בלבד.

## קישור לצפייה בלבד
בלשונית "מערכת" אפשר ליצור קישור (`.../07/#t=...`) למנהל נוסף שרק צריך לראות. האסימון חתום ומסומן `ro`, וה-Worker דוחה כל POST שמגיע איתו. הקישור פג אחרי הזמן שנבחר או כשמשנים את `ADMIN_PASS`.

## עוזר ה-AI בדף
הכפתור ✦ פותח עוזר שעונה על שאלות מתוך מצב הקו ומציע פעולות. העוזר רק מציע: כל פעולה עוברת בדיקה ברשימה סגורה ב-`src/dash.js` (`aiCheck`), ומתבצעת רק אחרי אישור בדפדפן, דרך אותם נתיבי API. ההנחיה שלו (`DASH_AI_SYSTEM`) נפרדת מהעוזר הקולי של הקו.
