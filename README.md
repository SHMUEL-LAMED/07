# yemot-ai

השרת של קו ימות המשיח 073-351-2880: עוזר חכם בקול, בדיקת הודעות, צינתוקים, תזכורות, הרשמה לאירועים ועוד.
רץ כ-Cloudflare Worker (עם KV, Workers AI ו-cron של כל דקה).

## מבנה
- `src/worker.js` – כל קוד השרת.
- `wrangler.toml` – הגדרות ה-Worker (KV, AI, cron).
- `.dev.vars.example` – רשימת הסודות והמשתנים שצריך להגדיר. **אין בריפו שום מפתח.**
- `docs/configuration.md` – פירוט הסודות, המשתנים וה-bindings.
- `CLAUDE.md` – הנחיות עבודה ל-Claude Code.

## פריסה
```bash
npm i -g wrangler
wrangler login
wrangler secret put YM_TOKEN   # וכך לכל סוד ברשימה
wrangler deploy
```
לפני פריסה מהריפו לוודא שהקוד כאן מעודכן לגרסה החיה, אחרת הפריסה תדרוס שינויים.
אין פריסה אוטומטית מהריפו לקו.

## עקרונות
- סודות רק ב-Worker Secrets של Cloudflare, לעולם לא בקוד או בהיסטוריית Git.
- הקלטות, תמלולים ונתוני מתקשרים נשמרים מחוץ לריפו.
- שינויים בהתנהגות ה-AI של הקו דורשים אישור מנהל לפני פריסה.
