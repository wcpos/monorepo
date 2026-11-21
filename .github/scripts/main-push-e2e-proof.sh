#!/usr/bin/env bash
set -o pipefail
proof='' reason='pushed tree unavailable'
trap 'if [ -z "$proof" ]; then printf "No web E2E proof: %s\n" "$reason"; fi; printf "e2e_proof=%s\n" "$proof" >> "$GITHUB_OUTPUT"; exit 0' EXIT
tree=$(gh api "repos/$GITHUB_REPOSITORY/git/commits/$SHA" | jq -er '.tree.sha | select(type == "string" and length > 0)') || exit 0
reason='PR metadata unavailable'
prs=$(gh api "repos/$GITHUB_REPOSITORY/commits/$SHA/pulls" | jq -ce 'if type == "array" and all(.[]; has("merged_at") and (.number | type == "number") and ([.base.ref, .head.sha] | all(.[]; type == "string" and length > 0))) then map(select(.merged_at != null and .base.ref == "main")) else error("missing PR fields") end') || exit 0
while IFS=$'\t' read -r number head; do
  reason='PR head tree unavailable'
  head_tree=$(gh api "repos/$GITHUB_REPOSITORY/git/commits/$head" | jq -er '.tree.sha | select(type == "string" and length > 0)') || exit 0
  [ "$head_tree" = "$tree" ] || continue
  reason='PR runs unavailable'
  runs=$(gh api "repos/$GITHUB_REPOSITORY/actions/workflows/deploy.yml/runs?head_sha=$head&event=pull_request&status=completed&per_page=10" | jq -ce '.workflow_runs | if type == "array" and all(.[]; (.id | type == "number") and ([.created_at, .html_url] | all(.[]; type == "string" and length > 0))) then sort_by(.created_at) | reverse else error("missing run fields") end') || exit 0
  while IFS=$'\t' read -r run url; do
    reason='run jobs unavailable'
    jobs=$(gh api "repos/$GITHUB_REPOSITORY/actions/runs/$run/jobs?per_page=100" | jq -ce '.jobs | if type == "array" and all(.[]; [.name, .conclusion] | all(.[]; type == "string" and length > 0)) then . else error("missing job fields") end') || exit 0
    jq -e '. as $jobs | any(.[]; .name == "🎭 E2E Tests" and .conclusion == "success") and all(range(1; 7); . as $n | any($jobs[]; .name == "🎭 E2E Tests (\($n)/6)" and .conclusion == "success"))' <<< "$jobs" > /dev/null || continue
    message="Web E2E skipped on this main push: tree $tree equals PR #$number head $head, which passed all 6 web E2E shards in $url"
    printf '%s\n' "$message"
    printf '%s\n' "$message" >> "$GITHUB_STEP_SUMMARY" || exit 0
    proof=$url
    exit 0
  done < <(jq -r '.[] | [.id, .html_url] | @tsv' <<< "$runs")
done < <(jq -r '.[] | [.number, .head.sha] | @tsv' <<< "$prs")
reason='no matching PR run passed all 6 web E2E shards'
