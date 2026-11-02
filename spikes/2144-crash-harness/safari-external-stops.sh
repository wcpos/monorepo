#!/usr/bin/env bash
# Real-Safari process stops. Requires `node serve.mjs` running in this directory. For each trial the
# page streams transactions and persists its acked set; this script ends Safari with signal 9 at a
# random moment, relaunches it on the same URL, and the page recovers and posts results.safari-process.json.
# It quits and kills Safari repeatedly: run it only on a machine whose Safari session you can disturb.
set -euo pipefail
SPIKE="$(cd "$(dirname "$0")" && pwd)"
URL="http://localhost:18998/?cell=H&browser=safari"
TRIALS="${1:-10}"
count() { python3 -c 'import json,sys;print(len(json.load(open(sys.argv[1]))["trials"]))' "$SPIKE/results.safari-process.json" 2>/dev/null || echo 0; }
osascript -e 'quit app "Safari"' >/dev/null 2>&1 || true; sleep 2
for MODE in WAL DELETE control; do
  for TRIAL in $(seq 1 "$TRIALS"); do
    BEFORE=$(count)
    open -a Safari "$URL&mode=$MODE&trial=$TRIAL"
    sleep "$((2 + RANDOM % 3)).$((RANDOM % 10))"
    pkill -9 -x Safari || true; sleep 1.5
    open -a Safari "$URL&mode=$MODE&trial=$TRIAL"
    for _ in $(seq 1 90); do sleep 1; [ "$(count)" -gt "$BEFORE" ] && break; done
    [ "$(count)" -gt "$BEFORE" ] || echo "trial $MODE/$TRIAL did not post a result" >&2
    osascript -e 'quit app "Safari"' >/dev/null 2>&1 || true; sleep 2
  done
done
echo "results.safari-process.json: $(count) trials"
