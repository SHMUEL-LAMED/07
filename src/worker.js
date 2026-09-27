// בסיס לפיתוח מקומי בלבד. אינו מחליף את הקוד החי של yemot-ai.
// קוד הייצור לא הוכנס למאגר הציבורי בגלל פרטים אישיים והרשאות.
export default {
  async fetch() {
    return new Response('קו 07 — סביבת פיתוח בלבד', {
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    });
  },
};
