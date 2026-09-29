#!/bin/sh
# דף הניהול הוא קובץ אחד: src/dash.html. הוא עובד גם ב-Worker (/admin) וגם ב-GitHub Pages.
# אחרי כל שינוי בו מריצים את הסקריפט, כדי ש-index.html ו-docs/index.html (GitHub Pages) יהיו זהים.
set -e
cd "$(dirname "$0")/.."
cp src/dash.html index.html
cp src/dash.html docs/index.html
echo "index.html ו-docs/index.html עודכנו מ-src/dash.html"
