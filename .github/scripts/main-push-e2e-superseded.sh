#!/usr/bin/env bash
set -o pipefail
head=$(gh api "repos/$GITHUB_REPOSITORY/commits/main" --jq .sha) || exit 0
if [ -z "$head" ] || [ "$head" = "$GITHUB_SHA" ]; then exit 0; fi
run=$(gh api "repos/$GITHUB_REPOSITORY/actions/workflows/deploy.yml/runs?event=push&branch=main&head_sha=$head" --jq '.workflow_runs[0].id // empty') || exit 0
[ -n "$run" ] || exit 0
deploy=$(gh api "repos/$GITHUB_REPOSITORY/actions/runs/$run/jobs?per_page=100" --jq '[.jobs[] | select(.name == "🚀 Deploy")][0] | if . == null then "absent" else (.conclusion // "running") end') || exit 0
# A skipped deploy (docs-only head) runs no E2E, so it never supersedes.
case "$deploy" in
  success|running)
    { echo "superseded=true"; echo "head=$head"; } >> "$GITHUB_OUTPUT"
    if [ -n "${1:-}" ]; then
      echo "superseded_$1=true" >> "$GITHUB_OUTPUT"
      echo "⏭️ Web E2E shard $1 skipped: superseded by main@$head" >> "$GITHUB_STEP_SUMMARY"
    fi
    echo "::notice title=E2E coalesced::Superseded by main@$head (run $run); its run verifies this commit as an ancestor."
    ;;
esac
exit 0
