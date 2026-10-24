#!/bin/sh
# דף הניהול הוא קובץ אחד: src/dash.html. הוא עובד גם ב-Worker (/admin) וגם ב-GitHub Pages.
# דף הכניסה הראשי הוא מרכז הקווים; ניהול הקו המקורי נשמר ב-/source/.
set -e
cd "$(dirname "$0")/.."
cat > index.html <<'EOF'
<!doctype html><html lang="he" dir="rtl"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="refresh" content="0;url=./docs/portal/"><title>מרכז הקווים</title><a href="./docs/portal/">מעבר למרכז הקווים</a></html>
EOF
cat > docs/index.html <<'EOF'
<!doctype html><html lang="he" dir="rtl"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="refresh" content="0;url=./portal/"><title>מרכז הקווים</title><a href="./portal/">מעבר למרכז הקווים</a></html>
EOF
mkdir -p docs/source && cp src/dash.html docs/source/index.html
mkdir -p docs/line && cp src/dash.html docs/line/index.html   # קווים שנבנו במפעל: /07/line/?l=<שם קצר>
sed -e 's#functions/v1/admin-netfree/#functions/v1/admin-netfree-daat/#' \
    -e 's#"adminToken"#"adminToken_daat"#g' \
    -e 's#073-351-2880#079-494-7582#g' \
    -e 's#07 / קו הקבוצה#קו דעת תורה#g' \
    -e 's#קו הקבוצה#קו דעת תורה#g' \
    src/dash.html > docs/daattorah/index.html
cp docs/daattorah/index.html live/daat/6afe19a4abb4a11d64497ab9fafcf1234aea92f1-dash.html # הדף שה-Worker של דעת תורה מגיש ב-/admin
grep -q 'admin-netfree-daat/' docs/daattorah/index.html || { echo "שגיאה: הגשר של דעת תורה לא הוחלף"; exit 1; }
echo "דף הכניסה מנותב למרכז הקווים; docs/source, docs/line, docs/daattorah ו-live/daat עודכנו מ-src/dash.html"
