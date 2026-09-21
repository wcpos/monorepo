#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."
backup=$(mktemp)
cp package.json "$backup"
trap 'cp "$backup" package.json; rm -f "$backup"' EXIT
cli=$(node -p "require.resolve('expo-updates/bin/cli')")
result=0

for platform in ios android; do
  cp "$backup" package.json
  before=$(EAS_BUILD_PROFILE=production node "$cli" runtimeversion:resolve --platform "$platform" | jq -er '.runtimeVersion')
  node <<'NODE'
const fs = require('node:fs');
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
// An unshipped patch version exercises the release train's version-only change.
const [major, minor, patch] = pkg.version.split('.');
pkg.version = `${major}.${minor}.${Number(patch) + 1}`;
fs.writeFileSync('package.json', JSON.stringify(pkg, null, '\t'));
NODE
  after=$(EAS_BUILD_PROFILE=production node "$cli" runtimeversion:resolve --platform "$platform" | jq -er '.runtimeVersion')
  printf '%s before: %s\n%s after:  %s\n' "$platform" "$before" "$platform" "$after"
  if [[ "$before" == "$after" ]]; then
    printf '%s PASS: runtime version unchanged\n' "$platform"
  else
    printf '%s FAIL: runtime version changed\n' "$platform"
    result=1
  fi
done

exit "$result"