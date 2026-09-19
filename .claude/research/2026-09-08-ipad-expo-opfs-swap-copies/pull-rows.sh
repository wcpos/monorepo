#!/bin/bash
# Pull the dev client's .expo-opfs directory off the iPad and print the timing rows.
set -euo pipefail
DEVICE_ID=${1:?usage: pull-rows.sh <device-id> [output-directory]}
SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
OUT=${2:-$(mktemp -d "${TMPDIR:-/tmp}/wcpos-ipad-pull.XXXXXX")}
mkdir -p "$OUT"
xcrun devicectl device copy from --device "$DEVICE_ID" \
  --domain-type appDataContainer --domain-identifier com.wcpos.main.dev \
  --source Documents/.expo-opfs --destination "$OUT/expo-opfs" 2>&1 | tail -3
echo "pulled to $OUT"
for f in "$OUT"/expo-opfs/*logs*/documents.json; do
  [ -f "$f" ] && echo "== $f" && python3 "$SCRIPT_DIR/read-timing-rows.py" "$f"
done
find "$OUT/expo-opfs" -mindepth 1 -maxdepth 1 -exec du -sh {} + 2>/dev/null | sort -h | tail -8
