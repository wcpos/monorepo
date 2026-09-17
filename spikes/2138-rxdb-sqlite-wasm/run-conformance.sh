#!/usr/bin/env bash
set -eu
SPIKE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$SPIKE/../.." && pwd)"
# The rxdb checkout is gitignored; recreate it at the pinned tag on a fresh clone.
RXDB_TAG=17.4.0
if [ ! -d "$SPIKE/.rxdb-src" ]; then
  git clone --depth 1 --branch "$RXDB_TAG" https://github.com/pubkey/rxdb.git "$SPIKE/.rxdb-src"
fi
cd "$SPIKE/.rxdb-src"
# Keep npm's cache/logs and temporary output within the spike.
export npm_config_cache="$PWD/.npm-cache"
# Leave TMPDIR alone: broadcast-channel's Node backend listens on a Unix socket under it,
# and a path inside this clone exceeds macOS's 104-byte socket path limit (EINVAL).
export NODE_OPTIONS=--max-old-space-size=2048
# Usage: run-conformance.sh [node|browser|both]   (MOCHA_GREP narrows both suites)
SUITE="${1:-both}"
[ "$SUITE" != "browser" ] && printf 'NOT RUN: setup has not completed.\n' > "$SPIKE/node.log"
[ "$SUITE" != "node" ] && printf 'NOT RUN: setup has not completed.\n' > "$SPIKE/browser.log"
setup() {
  node --version
  npm --version
  git describe --tags --always
  npm view @sqlite.org/sqlite-wasm version || return $?
  npm view esbuild version || return $?
  if [ ! -d node_modules ]; then
    # The 17.4.0 tag ships no lockfile, so a clean install is the only option.
    npm install --no-audit --no-fund
    code=$?
    printf 'npm install exit code: %s\n' "$code"
    [ "$code" -eq 0 ] || return "$code"
  fi
  npm i --no-save @sqlite.org/sqlite-wasm@3.53.4-build1 esbuild || return $?
  if [ ! -d dist/esm ]; then npm run build || return $?; fi
  if [ ! -e node_modules/rxdb ]; then ln -s .. node_modules/rxdb || return $?; fi
  # A real copy resolves premium's imports against this clone, not the pnpm store.
  if [ ! -d node_modules/rxdb-premium ]; then
    cp -RL "$ROOT/node_modules/rxdb-premium" node_modules/rxdb-premium || return $?
  fi
  node --input-type=module -e "console.info(import.meta.resolve('rxdb/plugins/core')); console.info(import.meta.resolve('rxjs')); await import('rxdb-premium/plugins/storage-sqlite')" || return $?
  # The static server serves docs-src/static/files. Never put the bundle under test/:
  # the transpile step babel-compiles everything there and chokes on the bundle's
  # private class fields.
  mkdir -p spike-2138 docs-src/static/files/spike-2138
  cp "$SPIKE/sqlite-basics-oo1.mjs" "$SPIKE/sqlite-worker-entry.mjs" spike-2138/ || return $?
  cp "$SPIKE/custom-storage.ts" test/unit/custom-storage.ts || return $?
  ./node_modules/.bin/esbuild spike-2138/sqlite-worker-entry.mjs --bundle --format=esm --platform=browser --outfile=docs-src/static/files/spike-2138/sqlite-worker.js || return $?
  cp node_modules/@sqlite.org/sqlite-wasm/dist/sqlite3.wasm docs-src/static/files/spike-2138/ || return $?
  # The Playwright page probe (page-probe.mjs) drives the same worker outside karma.
  cp "$SPIKE/page-probe-entry.mjs" spike-2138/ || return $?
  ./node_modules/.bin/esbuild spike-2138/page-probe-entry.mjs --bundle --format=esm --platform=browser --outfile=docs-src/static/files/spike-2138/page-probe.js || return $?
}
set +e
setup > "$SPIKE/setup.log" 2>&1
setup_code=$?
printf '\nSetup exit code: %s\n' "$setup_code" >> "$SPIKE/setup.log"
if [ "$setup_code" -ne 0 ]; then
  printf 'NOT RUN: setup failed with exit code %s; see setup.log.\n' "$setup_code" > "$SPIKE/node.log"
  cp "$SPIKE/node.log" "$SPIKE/browser.log"
  exit "$setup_code"
fi
# Run serially. The operator must stop any individual suite after 40 minutes.
# Usage: run-conformance.sh [node|browser|both]   (MOCHA_GREP narrows both suites)
SUITE="${1:-both}"
node_code=0
browser_code=0
if [ "$SUITE" != "browser" ]; then
  # MOCHA_INVERT=1 turns MOCHA_GREP into an exclusion (Node only; karma has no invert).
  npm run test:node:custom -- ${MOCHA_GREP:+--grep "$MOCHA_GREP"} ${MOCHA_INVERT:+--invert} > "$SPIKE/node.log" 2>&1
  node_code=$?
  printf '\nNode suite exit code: %s\n' "$node_code" >> "$SPIKE/node.log"
  # Refresh the tracked evidence artifact from this run (the full log is gitignored).
  {
    echo "# Node conformance run summary (rxdb $RXDB_TAG unit suite, DEFAULT_STORAGE=custom${MOCHA_GREP:+, grep '$MOCHA_GREP'${MOCHA_INVERT:+ inverted}})"
    echo
    sed -n 1,12p "$SPIKE/node.log"
    echo "..."
    grep -E '^  [a-z-]+\.(test\.)?(ts|js)' "$SPIKE/node.log" | sed 's/^ *//' | tr '\n' ';'
    echo
    echo
    echo "conformance block ticks: $(awk '/rx-storage-implementations.test.ts/{f=1} /rx-storage-query-correctness.test.ts/{f=0} f' "$SPIKE/node.log" | grep -c '✔')"
    echo "journal_mode lines: $(grep 'journal_mode requested' "$SPIKE/node.log" | sort | uniq -c | sed 's/^ *//')"
    echo
    grep -E '^\s+[0-9]+ (passing|failing|pending)|Node suite exit code' "$SPIKE/node.log"
  } > "$SPIKE/node-conformance-summary.log"
fi
if [ "$SUITE" != "node" ]; then
  /Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome --version > "$SPIKE/browser.log" 2>&1
  npm run test:browser:custom -- --browsers Chrome >> "$SPIKE/browser.log" 2>&1
  browser_code=$?
  printf '\nBrowser suite exit code: %s\n' "$browser_code" >> "$SPIKE/browser.log"
  # Refresh the tracked evidence artifact from this run.
  cp "$SPIKE/browser.log" "$SPIKE/browser-conformance.log"
fi
[ "$node_code" -eq 0 ] && [ "$browser_code" -eq 0 ]
