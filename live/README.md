# הקוד החי של שני הקווים

עותק של הקוד שרץ בפועל ב-Cloudflare, כפי שהוא פרוס כרגע (קובץ אחד מאוחד לכל קו).

| תיקייה | Worker | קו |
|---|---|---|
| `shimchas/` | `yemot-ai` | שימחס 073-351-2880 |
| `daat/` | `yemot-ai-daat` | דעת תורה 079-494-7582 |

בכל תיקייה: `worker.js` (השרת) וקובץ ה-html של דף הניהול (נטען כטקסט).

אין כאן שום מפתח או סיסמה. הסודות שמורים רק ב-Cloudflare:
`YM_TOKEN`, `RUN_KEY`, `ADMIN_PASS`, `GEMINI_KEY`, `GEMINI_KEYS`, `GROQ_KEY`, `AAI_KEY`,
`ELEVEN_KEY`, `ELEVEN_KEYS`, `AZURE_TTS_KEY`, `AZURE_TTS_REGION`, `PROVIDERS` (בשימחס).
שמות החברים במשתנה `NAMES` וב-KV.

שינויים שנוספו מעבר לקוד ב-`src/`:
- גיבוי אוטומטי בין כמה מפתחות ElevenLabs (`ELEVEN_KEYS`).
- קריינות גיבוי של Azure (קול גברי he-IL-AvriNeural) כשהמכסה של Gemini נגמרת.
- תמלול הודעות ogg ולא רק wav, 24 שעות ביממה.
- פרופיל משותף לחבר עם כמה מספרים (דעת תורה).
- הודעה "אין כניסה למספרים שאינם מוכרים" לחסומים (דעת תורה).
