#!/bin/sh
# דף הניהול הוא קובץ אחד: src/dash.html. הוא עובד גם ב-Worker (/admin) וגם ב-GitHub Pages.
# אחרי כל שינוי בו מריצים את הסקריפט, כדי ש-index.html ו-docs/index.html (GitHub Pages) יהיו זהים,
# ושדף הניהול של קו דעת תורה (docs/daattorah) ייבנה מאותו קובץ עם הגשר, המספר והשם שלו.
set -e
cd "$(dirname "$0")/.."
cp src/dash.html index.html
cp src/dash.html docs/index.html
sed -e 's#functions/v1/admin-netfree/#functions/v1/admin-netfree-daat/#' \
    -e 's#"adminToken"#"adminToken_daat"#g' \
    -e 's#073-351-2880#079-494-7582#g' \
    -e 's#07 / קו הקבוצה#קו דעת תורה#g' \
    -e 's#קו הקבוצה#קו דעת תורה#g' \
    src/dash.html > docs/daattorah/index.html
grep -q 'admin-netfree-daat/' docs/daattorah/index.html || { echo "שגיאה: הגשר של דעת תורה לא הוחלף"; exit 1; }
echo "index.html, docs/index.html ו-docs/daattorah/index.html עודכנו מ-src/dash.html"
