#!/usr/bin/env bash
set -euo pipefail
SPIKE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$SPIKE/../.." && pwd)"
BUILD="$SPIKE/.build"
BUILD_ONLY=false; BROWSERS="chrome firefox webkit"
while [ "$#" -gt 0 ]; do
  case "$1" in --build-only) BUILD_ONLY=true; shift;; --browser) BROWSERS="${2:?browser required}"; shift 2;; *) echo "Unknown argument: $1" >&2; exit 1;; esac
done
mkdir -p "$BUILD" "$SPIKE/.deps"
# Deliberately pinned to the brief's SQLite build, not the newest registry release.
if [ ! -d "$SPIKE/.deps/node_modules/@sqlite.org/sqlite-wasm" ]; then
  # Without its own package.json npm walks up to the repo root and installs THERE (CI run 35326895260).
  [ -f "$SPIKE/.deps/package.json" ] || printf '{"name":"spike-2143-deps","private":true}\n' > "$SPIKE/.deps/package.json"
  (cd "$SPIKE/.deps" && npm install --no-save --no-package-lock @sqlite.org/sqlite-wasm@3.53.4-build1)
fi
for ENTRY in worker-sqlite worker-indexeddb bench-entry; do
  OUTPUT="$ENTRY"; [ "$ENTRY" != bench-entry ] || OUTPUT=bench
  "$ROOT/node_modules/.bin/esbuild" "$SPIKE/$ENTRY.mjs" --bundle --format=esm --platform=browser --alias:@sqlite.org/sqlite-wasm="$SPIKE/.deps/node_modules/@sqlite.org/sqlite-wasm" --outfile="$BUILD/$OUTPUT.js"
done
cp "$SPIKE/.deps/node_modules/@sqlite.org/sqlite-wasm/dist/sqlite3.wasm" "$BUILD/"
cp "$ROOT/apps/main/public/opfs.worker.js" "$BUILD/"
node --input-type=module - "$ROOT" "$SPIKE" <<'JS'
import { readFileSync, writeFileSync } from 'node:fs';
const [root, spike] = process.argv.slice(2), versions = {};
for (const name of ['rxdb', 'rxdb-premium', 'esbuild', '@sqlite.org/sqlite-wasm']) versions[name] = JSON.parse(readFileSync(`${name.startsWith('@sqlite') ? spike + '/.deps' : root}/node_modules/${name}/package.json`)).version;
writeFileSync(`${spike}/.build/versions.json`, JSON.stringify(versions));
JS
for FILE in worker-sqlite.js worker-indexeddb.js bench.js sqlite3.wasm opfs.worker.js; do
  BYTES=$(wc -c < "$BUILD/$FILE"); [ "$BYTES" -gt 10000 ]; printf '%s: %s bytes\n' "$FILE" "$BYTES"
done
[ "$BUILD_ONLY" != true ] || exit 0
for BROWSER in $BROWSERS; do node "$SPIKE/bench.mjs" --browser "$BROWSER"; done
node "$SPIKE/report.mjs"
