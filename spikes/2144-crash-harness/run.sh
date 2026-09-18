#!/usr/bin/env bash
set -euo pipefail
SPIKE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$SPIKE/../.." && pwd)"
BUILD="$SPIKE/.build"
BUILD_ONLY=false; BROWSERS="chrome firefox webkit"; CELLS="A,B,E,F,C,D"
while [ "$#" -gt 0 ]; do
  case "$1" in
    --build-only) BUILD_ONLY=true; shift;;
    --browser) BROWSERS="${2:?browser required}"; shift 2;;
    --cells) CELLS="${2:?cells required}"; shift 2;;
    *) echo "Unknown argument: $1" >&2; exit 1;;
  esac
done
mkdir -p "$BUILD" "$SPIKE/.deps"
# Deliberately pinned to the brief's SQLite build, not the newest registry release.
if [ ! -d "$SPIKE/.deps/node_modules/@sqlite.org/sqlite-wasm" ]; then
  [ -f "$SPIKE/.deps/package.json" ] || printf '{"name":"spike-2144-deps","private":true}\n' > "$SPIKE/.deps/package.json"
  (cd "$SPIKE/.deps" && npm install --no-save --no-package-lock @sqlite.org/sqlite-wasm@3.53.4-build1)
fi
for ENTRY in worker-sqlite-crash handle-ceiling-worker terminate-probe-worker harness-entry control-observer; do
  "$ROOT/node_modules/.bin/esbuild" "$SPIKE/$ENTRY.mjs" --bundle --format=esm --platform=browser \
    --alias:@sqlite.org/sqlite-wasm="$SPIKE/.deps/node_modules/@sqlite.org/sqlite-wasm" --outfile="$BUILD/$ENTRY.js"
done
cp "$SPIKE/.deps/node_modules/@sqlite.org/sqlite-wasm/dist/sqlite3.wasm" "$BUILD/"
cp "$ROOT/apps/main/public/opfs.worker.js" "$BUILD/"
printf '<!doctype html><meta charset="utf-8"><title>Spike 2144</title><body><script type="module" src="/harness-entry.js"></script>\n' > "$BUILD/index.html"
node --input-type=module - "$ROOT" "$SPIKE" <<'JS'
import { readFileSync, writeFileSync } from 'node:fs';
const [root, spike] = process.argv.slice(2), versions = {};
for (const name of ['rxdb', 'rxdb-premium', 'esbuild', 'playwright', '@sqlite.org/sqlite-wasm']) versions[name] = JSON.parse(readFileSync(`${name.startsWith('@sqlite') ? spike + '/.deps' : root}/node_modules/${name}/package.json`)).version;
writeFileSync(`${spike}/.build/versions.json`, JSON.stringify(versions));
JS
for FILE in worker-sqlite-crash.js harness-entry.js sqlite3.wasm opfs.worker.js; do
  BYTES=$(wc -c < "$BUILD/$FILE"); [ "$BYTES" -gt 10000 ]; printf '%s: %s bytes\n' "$FILE" "$BYTES"
done
# These dependency-free utility workers are genuinely small; do not pad them to a fake 10 KB.
for FILE in handle-ceiling-worker.js terminate-probe-worker.js control-observer.js; do
  BYTES=$(wc -c < "$BUILD/$FILE"); [ "$BYTES" -gt 0 ]; printf '%s: %s bytes\n' "$FILE" "$BYTES"
done
cmp "$ROOT/apps/main/public/opfs.worker.js" "$BUILD/opfs.worker.js"
[ "$BUILD_ONLY" != true ] || exit 0
for BROWSER in $BROWSERS; do node "$SPIKE/drive.mjs" --browser "$BROWSER" --cells "$CELLS"; done
node "$SPIKE/report.mjs"
