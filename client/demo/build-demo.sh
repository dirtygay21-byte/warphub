#!/bin/bash
# Сборка демо-версии для GitHub Pages: ./demo/build-demo.sh <папка-вывода> [базовый-путь]
# Пример: ./demo/build-demo.sh ../warphub-demo /warphub-demo/
set -e
OUT=${1:?output dir}; BASE=${2:-/warphub-demo/}
ESBUILD=${ESBUILD:-npx esbuild}
cd "$(dirname "$0")/.."
mkdir -p "$OUT"
find "$OUT" -mindepth 1 -maxdepth 1 ! -name .git -exec rm -rf {} +
$ESBUILD demo/entry.ts --bundle --minify --outfile="$OUT/app.js" --format=esm --jsx=automatic \
  --tsconfig=tsconfig.app.json --loader:.css=empty \
  --define:import.meta.env.VITE_BACKEND_API_URL="\"${BASE}api\"" \
  --define:import.meta.env.VITE_S3_BASE_URL="\"${BASE%/}/s3\"" \
  --define:import.meta.env.VITE_S3_BUCKET_NAME='"warphub"' \
  --define:import.meta.env.VITE_EXECUTION_CONFIG='"development"' \
  --define:import.meta.env.VITE_EXECUTION_DEVELOPMENT_TOKEN='"demo"' \
  --define:import.meta.env.BASE_URL="\"${BASE}\"" \
  --define:process.env.NODE_ENV='"production"' --log-level=warning
node node_modules/tailwindcss/lib/cli.js -i src/global.css -o "$OUT/app.css" --minify 2>/dev/null
cat node_modules/react-loading-skeleton/dist/skeleton.css >> "$OUT/app.css"
cp -r public/. "$OUT/"
mkdir -p "$OUT/s3/warphub/services" "$OUT/s3/warphub/disciplines"
cp public/img/services/*.webp "$OUT/s3/warphub/services/"
cp public/icons/*.webp "$OUT/s3/warphub/disciplines/"
cp public/logo.png "$OUT/s3/warphub/logo.png"
cat > "$OUT/index.html" <<HTML
<!doctype html>
<html lang="ru" class="h-full antialiased">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="robots" content="noindex" />
    <title>WarpHub — демо</title>
    <link rel="icon" type="image/svg+xml" href="${BASE}favicon.svg" />
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter+Tight:wght@400;500;600;700&family=Oswald:wght@400;500;600;700&display=swap&subset=cyrillic" />
    <link rel="stylesheet" href="${BASE}app.css" />
    <script src="https://telegram.org/js/telegram-web-app.js"></script>
  </head>
  <body class="flex flex-col h-full">
    <div id="root"></div>
    <script type="module" src="${BASE}app.js"></script>
  </body>
</html>
HTML
cp "$OUT/index.html" "$OUT/404.html"   # прямые ссылки вида /warphub-demo/reservations
touch "$OUT/.nojekyll"
cat > "$OUT/README.md" <<'MD'
# WarpHub — демо

Демо-версия Telegram Mini App клуба Warp Hub с образцовыми данными.
Записи не сохраняются и уведомления не отправляются.
Собрано из закрытого репозитория `warphub` скриптом `client/demo/build-demo.sh`.
MD
echo "Demo built into $OUT"
