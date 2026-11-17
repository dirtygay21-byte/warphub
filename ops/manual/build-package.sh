#!/bin/bash
# Сборка пакета обновления на сервере — когда GitHub Actions недоступен (17.11.2026: закончились минуты).
# Делает то же, что задание «Test and package» в .github/workflows/deploy.yml: тесты, сборка Mini App с боевым
# .env клиента (файл на сервере, не печатается), пакет в формате warphub-deploy. Ничего не устанавливает.
#
#   bash ops/manual/build-package.sh [parts]     parts = client,backend (по умолчанию), можно добавить data
#
# Затем:  warphub-deploy dry-run <parts> yes|no < /root/warphub-package-<commit>.tgz
#         warphub-deploy apply   <parts> yes|no < /root/warphub-package-<commit>.tgz
set -euo pipefail
for d in /root/.bun/bin /root/.nvm/versions/node/*/bin /usr/local/bin /usr/bin; do [ -d "$d" ] && PATH="$d:$PATH"; done
export PATH
SRC=$(cd "$(dirname "$0")/../.." && pwd)
PARTS=${1:-client,backend}
[[ "$PARTS" =~ ^(data|client|backend)(,(data|client|backend)){0,2}$ ]] || { echo "parts: comma list of data, client, backend"; exit 1; }
CLIENT_ENV_FILE=${CLIENT_ENV_FILE:-/root/warphub-client-src-b79b94f/.env}
COMMIT=$(cat "$SRC/COMMIT" 2>/dev/null | tr -dc '0-9a-f' | cut -c1-40)
[ -n "$COMMIT" ] || { echo "no COMMIT file in $SRC"; exit 1; }
has() { [[ ",$PARTS," == *",$1,"* ]]; }
OUT=/root/warphub-package-${COMMIT:0:7}.tgz
PKG=$(mktemp -d)
trap 'rm -rf "$PKG"; rm -f "$SRC/client/.env"' EXIT

echo "== WarpHub package ${COMMIT:0:7}, parts=$PARTS"
if has data; then
  echo "== roster data tests"
  (cd "$SRC/tools/roster-data" && bun test tests/ && node scripts/repair-aos-data.mjs --check)
  cp -a "$SRC/backend/roster-data" "$PKG/roster-data"
fi
if has backend; then
  echo "== backend: install and unit tests"
  (cd "$SRC/backend" && bun install --frozen-lockfile && env -i PATH="$PATH" HOME="$HOME" bun test tests)
  mkdir -p "$PKG/backend"
  for x in src drizzle package.json bun.lock tsconfig.json drizzle.config.ts env.d.ts; do cp -a "$SRC/backend/$x" "$PKG/backend/"; done
fi
if has client; then
  echo "== client: type check, lint, build"
  [ -f "$CLIENT_ENV_FILE" ] || { echo "client .env not found: $CLIENT_ENV_FILE"; exit 1; }
  cp "$CLIENT_ENV_FILE" "$SRC/client/.env"
  grep -qx 'VITE_EXECUTION_CONFIG=production' "$SRC/client/.env" || { echo "client .env must contain VITE_EXECUTION_CONFIG=production"; exit 1; }
  (cd "$SRC/client" && bun install --frozen-lockfile && bunx tsc -p tsconfig.app.json --noEmit && bun run lint && bun run build)
  rm -f "$SRC/client/.env"
  cp -a "$SRC/client/dist" "$PKG/client-dist"
fi
(
  cd "$PKG"
  { echo "commit=$COMMIT"; echo "parts=$PARTS"; echo "created=$(date -u +%FT%TZ)"; echo "built=manual"; } > manifest.txt
  find . -type f ! -name SHA256SUMS | sort | xargs sha256sum > SHA256SUMS
  tar -czf "$OUT" .
)
echo "== package: $OUT ($(du -h "$OUT" | cut -f1))"
echo "next:  warphub-deploy dry-run $PARTS <yes|no> < $OUT"
