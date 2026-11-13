# מייל פלוס

סביבת עבודה בעברית ל-Gmail, משימות בענן ותבניות תשובה.

כתובת האתר: https://shmuel-lamed.github.io/07/mail-plus/

## מבנה

- GitHub Pages: דף הכניסה ויישום React, ללא סודות או אסימונים קבועים.
- Supabase Edge Function `mail-plus-bridge`: גשר עם רשימת נתיבים סגורה ו-CORS עבור GitHub בלבד.
- Cloudflare Worker `mail-plus-cloud`: אימות נוסף ל-Google ו-API למשימות וכתיבה.
- D1: נתוני משימות והעדפות, משויכים לחשבון הבעלים.

המשתמש נכנס עם Google. אסימון הזהות נשמר בזיכרון העמוד בלבד ומאומת מול מפתחות החתימה של Google, קהל היעד, המנפיק, התוקף והחשבון המורשה. כניסה עם חשבון אחר נדחית. בנתיבי הגשר יש אימות ייעודי במקום שער Cloudflare Access; שאר האתר ב-Cloudflare ממשיך להשתמש ב-Access.

אין העברת אסימונים בפרמטרי כתובת, ואין פרוקסי לכתובות שהלקוח בוחר. נתיבי הגשר הם config, me, work, ai בלבד. שדות ואורכי בקשות נבדקים בצד השרת.

## הרצה ובנייה

בתיקיית mail-plus: `npm ci`, `npm run build`, `node frontend/build.mjs`, `node cloudflare/build.mjs`.
העתק את docs/mail-plus לתיקיית docs/mail-plus בשורש המאגר לאחר בניית הלקוח. הפונקציה ב-supabase/functions/mail-plus-bridge כוללת אימות משלה ולכן verify_jwt של Supabase כבוי עבורה בלבד.

בדיקות: `npx tsc --noEmit`, `node tests/api-check.cjs`, `node tests/google-auth-check.mjs`.

## יכולות ומגבלות

משימות בענן, תזכורות בתוך האתר, תבניות, חיפוש וקריאה ב-Gmail וכלי Gemini. אישור קריאת Gmail מתקבל בנפרד מתוך היישום. Gemini דורש מפתח משתמש הנשמר בזיכרון עד רענון. אין שליחת מיילים אוטומטית, התראות כשהאתר סגור או מיון אוטומטי. חיבורי Gmail ו-AI דורשים בדיקה עם חשבון חי; פריסה מוצלחת אינה הוכחה להפעלתם.
