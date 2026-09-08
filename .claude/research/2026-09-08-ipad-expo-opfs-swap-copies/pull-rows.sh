#!/bin/bash
# Pull the dev client's .expo-opfs directory off the iPad and print the timing rows.
set -u
OUT=/private/tmp/claude-501/-Users-kilbot-Projects-monorepo-v2/28b47b03-af85-4d5f-845b-36c1a4dc53ab/scratchpad/ipad/pull-$(date +%H%M%S)
mkdir -p "$OUT"
xcrun devicectl device copy from --device 96D11509-CE68-5507-9AA5-713657C0B14A \
  --domain-type appDataContainer --domain-identifier com.wcpos.main.dev \
  --source Documents/.expo-opfs --destination "$OUT/expo-opfs" 2>&1 | tail -3
echo "pulled to $OUT"
for f in "$OUT"/expo-opfs/*logs*/documents.json; do
  [ -f "$f" ] && echo "== $f" && python3 /private/tmp/claude-501/-Users-kilbot-Projects-monorepo-v2/28b47b03-af85-4d5f-845b-36c1a4dc53ab/scratchpad/ipad/read-timing-rows.py "$f"
done
du -sh "$OUT"/expo-opfs/* 2>/dev/null | sort -h | tail -8
