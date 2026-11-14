#!/usr/bin/env bash
set -euo pipefail
SPIKE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$SPIKE/../.." && pwd)"
BUILD="$SPIKE/.build"
BUILD_ONLY=false; LEGS=2,3; TRIALS=30; SCALE=both
while [ "$#" -gt 0 ]; do
  case "$1" in
    --build-only) BUILD_ONLY=true; shift;;
    --legs) LEGS="${2:?legs required}"; shift 2;;
    --trials) TRIALS="${2:?trials required}"; shift 2;;
    --scale) SCALE="${2:?scale required}"; shift 2;;
    *) echo "Unknown argument: $1" >&2; exit 1;;
  esac
done
[[ "$LEGS" =~ ^[23](,[23])?$ ]] || { echo 'Only legs 2 and 3 run here' >&2; exit 1; }
mkdir -p "$BUILD"
printf '{"type":"module"}\n' > "$BUILD/package.json"
# Keep imported engine modules in every artifact, including the coordination-only driver.
# The brief requires each self-contained library bundle to exceed 10 KB.
for ENTRY in bench-node crash-node crash-child; do
  "$ROOT/node_modules/.bin/esbuild" "$SPIKE/$ENTRY.mjs" --bundle --format=esm --platform=node --target=node24 --tree-shaking=false \
    --banner:js='import { createRequire as __createRequire } from "node:module"; const require = __createRequire(import.meta.url);' \
    --outfile="$BUILD/$ENTRY.js"
done
node --input-type=module - "$ROOT" "$BUILD" <<'JS'
import { readFileSync, writeFileSync } from 'node:fs';
const [root, build] = process.argv.slice(2), versions = {};
for (const name of ['rxdb', 'rxdb-premium', 'esbuild']) versions[name] = JSON.parse(readFileSync(`${root}/node_modules/${name}/package.json`)).version;
// The seven install-time patches mark the files they rewrite with `__wcpos…` identifiers; count
// the marked LINES across the abstract-filesystem plugin (cleanup, bulk-write, helpers, changelog,
// task-queue, index-state — index.js itself carries none). 0 means an unpatched premium.
const { readdirSync } = await import('node:fs');
const plugin = `${root}/node_modules/rxdb-premium/dist/esm/plugins/storage-abstract-filesystem`;
versions.premiumPatchMarkerCount = readdirSync(plugin).filter(f => f.endsWith('.js'))
  .reduce((n, f) => n + readFileSync(`${plugin}/${f}`, 'utf8').split('\n').filter(line => line.includes('__wcpos')).length, 0);
writeFileSync(`${build}/versions.json`, JSON.stringify(versions, null, 2) + '\n');
JS
for FILE in bench-node.js crash-node.js crash-child.js; do
  BYTES=$(wc -c < "$BUILD/$FILE"); [ "$BYTES" -gt 10000 ]; printf '%s: %s bytes\n' "$FILE" "$BYTES"
done
[ "$BUILD_ONLY" != true ] || exit 0
export NODE_OPTIONS=--max-old-space-size=2048
case ",$LEGS," in *,3,*) node "$BUILD/bench-node.js" --scale "$SCALE" --out "$SPIKE/results.mac.json";; esac
case ",$LEGS," in *,2,*) node "$BUILD/crash-node.js" --trials "$TRIALS" --out "$SPIKE/crash.mac.json";; esac
node "$SPIKE/report.mjs"
