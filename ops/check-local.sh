#!/usr/bin/env bash
# Local checks before a push (saves GitHub Actions minutes). Same commands as the ci-*.yml workflows.
# Usage: ops/check-local.sh [client] [backend] [roster]   (no arguments = all available)
set -u
cd "$(dirname "$0")/.."
parts="${*:-client backend roster}"
fail=0
run() { echo "== $1"; shift; if (cd "$1" && shift && "$@"); then echo "   ok"; else echo "   FAILED"; fail=1; fi; }
for p in $parts; do
  case "$p" in
    backend) run "backend unit tests" backend bun test tests ;;
    roster)
      run "roster data tests" tools/roster-data bun test tests/
      run "AoS repair stability" tools/roster-data node scripts/repair-aos-data.mjs --check ;;
    client)
      if [ -d client/node_modules ]; then
        run "client type check" client bunx tsc -p tsconfig.app.json --noEmit
        run "client lint" client bunx eslint src
      else
        echo "== client: skipped (no client/node_modules; run 'bun install' in client/ first) — CI will check it"
      fi ;;
    *) echo "unknown part: $p"; fail=1 ;;
  esac
done
exit $fail
