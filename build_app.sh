#!/bin/bash
set -e

echo "🚀 Сборка Transkribator..."

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"
cd "$DIR"

echo "📦 Запуск сборки в toolbx-контейнере (asr)..."
toolbox run -c asr -- bash -c "
    set -e
    cd /var/home/user/Projects/Segmenta
    npm install
    npm run tauri build
"

echo ""
echo "✅ Сборка завершена!"
echo "📂 Установочные файлы:"
find src-tauri/target/release/bundle -type f \( -name '*.AppImage' -o -name '*.deb' -o -name '*.rpm' \) 2>/dev/null | while read f; do
    echo "   → $f ($(du -sh "$f" | cut -f1))"
done
