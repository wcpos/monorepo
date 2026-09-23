#!/usr/bin/env bash
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
SPIKE="$(cd "$HERE/.." && pwd)"
ROOT="$(cd "$SPIKE/../.." && pwd)"
RXDB_TAG=17.4.0
export NODE_OPTIONS=--max-old-space-size=2048
printf 'NOT RUN: setup has not completed.\n' > "$HERE/node.log"
# Pins are the brief's verification targets, deliberately not latest.
setup() {
  if [ ! -d "$HERE/.rxdb-src" ]; then
    git clone --depth 1 --branch "$RXDB_TAG" https://github.com/pubkey/rxdb.git "$HERE/.rxdb-src" || return $?
  fi
  cd "$HERE/.rxdb-src" || return $?
  export npm_config_cache="$PWD/.npm-cache"
  if [ ! -d node_modules ]; then npm install --no-audit --no-fund || return $?; fi
  if [ ! -d dist/esm ]; then npm run build || return $?; fi
  if [ ! -e node_modules/rxdb ]; then ln -s .. node_modules/rxdb || return $?; fi
  # Refresh from the installed, patched premium; imports resolve to the clone's one rxdb/rxjs.
  rm -rf node_modules/rxdb-premium
  cp -RL "$ROOT/node_modules/rxdb-premium" node_modules/rxdb-premium || return $?
  cp "$HERE/custom-storage.ts" test/unit/custom-storage.ts || return $?
  if [ ! -d "$SPIKE/.deps/node_modules/electron/dist" ]; then
    mkdir -p "$SPIKE/.deps" || return $?
    printf '{"name":"spike-2210-deps","private":true}\n' > "$SPIKE/.deps/package.json"
    (cd "$SPIKE/.deps" && npm install --no-save --no-package-lock electron@43.4.0) || return $?
    # npm on this machine has ignore-scripts=true, so electron's binary postinstall never ran.
    if [ ! -d "$SPIKE/.deps/node_modules/electron/dist" ]; then
      (cd "$SPIKE/.deps/node_modules/electron" && node install.js) || return $?
    fi
  fi
  # Only transpilation uses npm. The suite itself must NOT inherit npm's host-node executable.
  npm run transpile || return $?
}
set +e
setup >> "$HERE/node.log" 2>&1
setup_code=$?
set -e
if [ "$setup_code" -ne 0 ]; then
  printf 'NOT RUN: setup failed with exit code %s; see node.log.\n' "$setup_code" > "$HERE/node-conformance-summary.log"
  exit "$setup_code"
fi
cd "$HERE/.rxdb-src"
ELECTRON="$(node -p "require('$SPIKE/.deps/node_modules/electron')")"
# Read the pinned script rather than assuming its mocha arguments. It has one cross-env setting.
MOCHA_COMMAND="$(node -e 'const s=require("./package.json").scripts["test:node:custom"]; if(!s.includes("cross-env DEFAULT_STORAGE=custom mocha ")) throw Error(s); console.log(s.split(" mocha ")[1]);')"
read -r -a MOCHA_ARGS <<< "$MOCHA_COMMAND"
if [ -n "${MOCHA_GREP:-}" ]; then MOCHA_ARGS+=(--grep "$MOCHA_GREP"); fi
# plugin.test.ts spawns `mocha` from PATH (npm run would have put node_modules/.bin there), and
# that mocha runs `node` from PATH: a shim makes both resolve to Electron's Node, not the Mac's.
SHIM="$SPIKE/.deps/electron-node"
mkdir -p "$SHIM"
printf '#!/bin/sh\nELECTRON_RUN_AS_NODE=1 exec "%s" "$@"\n' "$ELECTRON" > "$SHIM/node"
chmod +x "$SHIM/node"
set +e
PATH="$SHIM:$PWD/node_modules/.bin:$PATH" ELECTRON_RUN_AS_NODE=1 DEFAULT_STORAGE=custom "$ELECTRON" node_modules/.bin/mocha "${MOCHA_ARGS[@]}" >> "$HERE/node.log" 2>&1
node_code=$?
set -e
printf '\nNode suite exit code: %s\n' "$node_code" >> "$HERE/node.log"
runtime_code=0
grep -q 'spike-2210 runtime: electron=43\.4\.0 node=.* journal_mode=wal' "$HERE/node.log" || runtime_code=1
{
  echo "# Node conformance summary (rxdb $RXDB_TAG, DEFAULT_STORAGE=custom${MOCHA_GREP:+, grep '$MOCHA_GREP'})"
  grep 'spike-2210 runtime:' "$HERE/node.log" || true
  grep -E '^  [a-z-]+\.(test\.)?(ts|js)' "$HERE/node.log" | sed 's/^ *//' | tr '\n' ';' || true
  echo
  ticks=$(awk '/rx-storage-implementations.test.ts/{f=1} /rx-storage-query-correctness.test.ts/{f=0} f && /✔/{n++} END{print n+0}' "$HERE/node.log")
  echo "conformance block ticks: $ticks"
  grep -E '^[[:space:]]+[0-9]+ (passing|failing|pending)|Node suite exit code' "$HERE/node.log" || true
  echo "Electron runtime evidence check exit code: $runtime_code"
  if [ "$node_code" -ne 0 ]; then
    echo 'First failure (verbatim from the bail log):'
    if grep -qE '^[[:space:]]*[0-9]+ failing' "$HERE/node.log"; then
      sed -n '/^[[:space:]]*[0-9][0-9]* failing/,$p' "$HERE/node.log"
    else cat "$HERE/node.log"; fi
    echo 'Leg 1 failed: select better-sqlite3 per the brief.'
  fi
} > "$HERE/node-conformance-summary.log"
cat "$HERE/node-conformance-summary.log"
[ "$node_code" -eq 0 ] && [ "$runtime_code" -eq 0 ]
