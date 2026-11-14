#!/usr/bin/env bash
set -euo pipefail
SPIKE="$(cd "$(dirname "$0")" && pwd)"
DEPS="$(cd "$SPIKE/../2138-rxdb-sqlite-wasm/.rxdb-src/node_modules" && pwd)"
BUILD="$SPIKE/.rxdb-src"
FILES="$BUILD/docs-src/static/files/spike-2145"
# Reuse the built clone read-only; all generated files stay inside this spike.
mkdir -p "$BUILD/spike-2145" "$FILES"
[ -L "$BUILD/node_modules" ] || ln -s "$DEPS" "$BUILD/node_modules"
cp "$SPIKE/sqlite-basics-oo1.mjs" "$SPIKE/sqlite-worker-entry.mjs" "$SPIKE/bench-entry.mjs" "$BUILD/spike-2145/"
for MODE in fallback modifier; do
  FLAG=false; [ "$MODE" != modifier ] || FLAG=true
  "$DEPS/.bin/esbuild" "$BUILD/spike-2145/sqlite-worker-entry.mjs" --bundle --format=esm --platform=browser --define:MODIFIER="$FLAG" --outfile="$FILES/worker-$MODE.js"
done
"$DEPS/.bin/esbuild" "$BUILD/spike-2145/bench-entry.mjs" --bundle --format=esm --platform=browser --outfile="$FILES/bench.js"
cp "$DEPS/@sqlite.org/sqlite-wasm/dist/sqlite3.wasm" "$FILES/"
for FILE in worker-fallback.js worker-modifier.js bench.js sqlite3.wasm; do
  BYTES=$(wc -c < "$FILES/$FILE"); [ "$BYTES" -gt 10000 ]; printf '%s: %s bytes\n' "$FILE" "$BYTES"
done
[ "${1:-}" != --build-only ] || exit 0
node "$SPIKE/bench.mjs"
node "$SPIKE/report.mjs"
