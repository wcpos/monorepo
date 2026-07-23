#!/usr/bin/env bash
set -euo pipefail

# Trusted-base merge gate for wcpos/monorepo — executed from the DEFAULT
# branch's checkout by merge-gate.yml (pull_request_target), so a PR cannot
# edit the policy that judges it. Ported from wcpos/woocommerce-pos (see
# wcpos/woocommerce-pos#1312) with monorepo semantics: no translation/POT
# allowlist, and SKIPPED required checks count as PASS because test.yml's
# paths-filter legitimately skips Lint/Unit Tests when no code changed.

: "${GITHUB_REPOSITORY:?GITHUB_REPOSITORY is required}"
: "${PR_NUMBER:?PR_NUMBER is required}"
: "${MERGE_GATE_REQUIRED_CHECKS:?MERGE_GATE_REQUIRED_CHECKS is required}"

MAX_ATTEMPTS="${MERGE_GATE_MAX_ATTEMPTS:-80}"
SLEEP_SECONDS="${MERGE_GATE_SLEEP_SECONDS:-30}"
MERGE_STATE_MAX_ATTEMPTS="${MERGE_GATE_MERGE_STATE_MAX_ATTEMPTS:-5}"
FIX_BOT_AUTHORS="|${MERGE_GATE_FIX_BOT_AUTHORS:-wcpos-agents[bot]}|"

log() {
  printf '%s\n' "$*"
}

pr_merge_state() {
  gh pr view "$PR_NUMBER" --repo "$GITHUB_REPOSITORY" --json mergeStateStatus --jq '.mergeStateStatus'
}

pr_commits() {
  gh api "repos/${GITHUB_REPOSITORY}/pulls/${PR_NUMBER}/commits" --paginate \
    --jq '.[] | [.sha, (.author.login // .commit.author.name // "unknown")] | @tsv'
}

commit_files() {
  # status<TAB>filename — a REMOVED test must not satisfy the pinning-test
  # requirement, so callers need the status.
  gh api "repos/${GITHUB_REPOSITORY}/commits/$1" --jq '.files[] | [.status, .filename] | @tsv'
}

commit_message() {
  gh api "repos/${GITHUB_REPOSITORY}/commits/$1" --jq '.commit.message'
}

is_test_path() {
  case "$1" in
    tests/*|*/tests/*|e2e/*|*/e2e/*|*.test.*|*.spec.*|*/test-*.sh|test-*.sh) return 0 ;;
    *) return 1 ;;
  esac
}

is_source_path() {
  is_test_path "$1" && return 1
  case "$1" in
    *.ts|*.tsx|*.js|*.jsx|*.mjs|*.cjs|*.mts|*.cts|*.php) return 0 ;;
    .github/scripts/*.sh|scripts/*.sh) return 0 ;;
    *) return 1 ;;
  esac
}

# Config that steers CI or dependency resolution: a same-commit pinning test
# usually has no meaningful form here (what test pins a version bump?), but
# the change still needs proof the suite ran — mirror requires_php_tests:
# config-class bot commits require the Tested: trailer, not a new test.
is_config_path() {
  case "$1" in
    .github/workflows/*|.github/*.json|.github/dependabot.yml|.github/dependabot.yaml) return 0 ;;
    package.json|*/package.json|composer.json|*/composer.json) return 0 ;;
    pnpm-workspace.yaml|*/pnpm-workspace.yaml|turbo.json|*/turbo.json) return 0 ;;
    tsconfig*.json|*/tsconfig*.json|app.json|*/app.json|eas.json|*/eas.json|.npmrc|*/.npmrc) return 0 ;;
    composer.lock|*/composer.lock|pnpm-lock.yaml|*/pnpm-lock.yaml) return 0 ;;
    package-lock.json|*/package-lock.json|npm-shrinkwrap.json|*/npm-shrinkwrap.json) return 0 ;;
    yarn.lock|*/yarn.lock|bun.lock|*/bun.lock|bun.lockb|*/bun.lockb) return 0 ;;
    *) return 1 ;;
  esac
}

# Fix-bot commits must carry their own proof: a bot-authored commit that
# changes source must (a) touch a test in the SAME commit and (b) record a
# local suite run as a `Tested:` trailer. Mechanical backstop for the fleet's
# Pinning-Test Discipline (wcpos-openclaw#1534); humans are unaffected.
enforce_bot_fix_discipline() {
  local commits sha author files msg has_source has_test failed=0
  if ! commits="$(pr_commits)"; then
    log "Could not list PR commits for the fix-bot discipline check; failing closed."
    return 1
  fi
  while IFS=$'\t' read -r sha author; do
    [[ -n "$sha" ]] || continue
    [[ "$FIX_BOT_AUTHORS" == *"|${author}|"* ]] || continue
    if ! files="$(commit_files "$sha")"; then
      log "Could not read files for fix-bot commit ${sha:0:8}; failing closed."
      return 1
    fi
    # GitHub truncates the single-commit files array at 300 entries — beyond
    # that the list can hide sources or tests in either direction. A fix-bot
    # commit that large violates the small-directed-fix contract regardless,
    # so fail closed rather than judge a partial list.
    if [[ "$(wc -l <<< "$files" | tr -d ' ')" -ge 300 ]]; then
      log "✗ Fix-bot commit ${sha:0:8} ($author) touches 300+ files — too large to verify (the files API truncates at 300) and far beyond a small, directed fix. Split it."
      failed=1
      continue
    fi
    has_source=false
    has_test=false
    has_config=false
    while IFS=$'\t' read -r fstatus file; do
      [[ -n "$file" ]] || continue
      if is_test_path "$file"; then
        # Deleting a test is not pinning one.
        [[ "$fstatus" != "removed" ]] && has_test=true
      elif is_source_path "$file"; then
        has_source=true
      elif is_config_path "$file"; then
        has_config=true
      fi
    done <<< "$files"
    [[ "$has_source" == "true" || "$has_config" == "true" ]] || continue
    if [[ "$has_source" == "true" && "$has_test" != "true" ]]; then
      log "✗ Fix-bot commit ${sha:0:8} ($author) changes source without touching any test. A fix is not a fix until a test pins it — ship the pinning test in the same commit."
      failed=1
    fi
    if ! msg="$(commit_message "$sha")"; then
      log "Could not read the message for fix-bot commit ${sha:0:8}; failing closed."
      return 1
    fi
    if ! trailer_block_has_tested "$msg"; then
      log "✗ Fix-bot commit ${sha:0:8} ($author) has no 'Tested:' trailer. Run the touched suite locally and record the literal result line."
      failed=1
    fi
  done <<< "$commits"
  return "$failed"
}

# The Tested: line must sit in the message's FINAL paragraph (the git trailer
# block) — prose that merely mentions "Tested:" mid-body does not count.
trailer_block_has_tested() {
  # The trailer value must be result-shaped: a real suite result quotes counts,
  # so require at least one digit and a minimally substantive value — bare
  # "Tested:", "Tested: N/A", or a command with no result do not count.
  printf '%s\n' "$1" | awk '
    BEGIN { block = "" }
    /^[[:space:]]*$/ { block = ""; next }
    { block = block $0 "\n" }
    END {
      if (match(block, /(^|\n)Tested:[^\n]*/) == 0) exit 1
      value = substr(block, RSTART, RLENGTH)
      sub(/(^|\n)Tested:[[:space:]]*/, "", value)
      exit (length(value) >= 8 && value ~ /[0-9]/) ? 0 : 1
    }
  '
}

check_bucket() {
  local check_name="$1"
  gh pr checks "$PR_NUMBER" --repo "$GITHUB_REPOSITORY" --json name,bucket,state \
    --jq ".[] | select(.name == \"${check_name}\") | [.bucket, .state] | @tsv" 2>/dev/null | head -n 1 || true
}

bucket_is_pass() {
  local bucket="$1" state="$2"
  # SKIPPED counts as PASS here: test.yml's paths-filter skips Lint/Unit Tests
  # when no code changed, and the old aggregator accepted 'skipped' the same way.
  [[ "$bucket" == "pass" || "$state" == "SUCCESS" || "$state" == "success" ]] && return 0
  [[ "$bucket" == "skipping" || "$state" == "SKIPPED" || "$state" == "skipped" ]] && return 0
  return 1
}

bucket_is_failure() {
  local bucket="$1" state="$2"
  [[ "$bucket" == "fail" || "$bucket" == "cancel" || "$state" == "FAILURE" || "$state" == "ERROR" || "$state" == "failure" || "$state" == "error" || "$state" == "CANCELLED" || "$state" == "cancelled" ]]
}

wait_for_checks() {
  local attempt raw bucket state check all_pass any_failed
  IFS='|' read -r -a required_checks <<< "$MERGE_GATE_REQUIRED_CHECKS"

  for (( attempt=1; attempt<=MAX_ATTEMPTS; attempt++ )); do
    all_pass=true
    any_failed=false

    for check in "${required_checks[@]}"; do
      [[ -n "$check" ]] || continue
      raw="$(check_bucket "$check")"
      bucket="${raw%%$'\t'*}"
      state="${raw#*$'\t'}"
      if [[ -z "$raw" ]]; then
        bucket="missing"
        state="missing"
      fi

      if bucket_is_pass "$bucket" "$state"; then
        log "✓ $check passed (or was skipped by paths-filter)"
      elif bucket_is_failure "$bucket" "$state"; then
        log "✗ $check failed ($bucket/$state)"
        any_failed=true
        all_pass=false
      else
        log "… $check pending ($bucket/$state)"
        all_pass=false
      fi
    done

    if [[ "$any_failed" == "true" ]]; then
      return 1
    fi
    if [[ "$all_pass" == "true" ]]; then
      return 0
    fi

    if [[ "$attempt" -lt "$MAX_ATTEMPTS" ]]; then
      sleep "$SLEEP_SECONDS"
    fi
  done

  log "Timed out waiting for required checks."
  return 1
}

main() {
  # Conflicts block every PR. A failed or empty lookup fails closed: an
  # unknown merge state must never be treated as "not conflicted".
  local merge_state attempt
  for (( attempt=1; attempt<=MERGE_STATE_MAX_ATTEMPTS; attempt++ )); do
    if ! merge_state="$(pr_merge_state)" || [[ -z "$merge_state" ]]; then
      log "Could not determine the PR merge state; failing closed."
      return 1
    fi
    [[ "$merge_state" == "UNKNOWN" ]] || break
    if [[ "$attempt" -lt "$MERGE_STATE_MAX_ATTEMPTS" ]]; then
      log "… merge state still computing (UNKNOWN), retrying"
      sleep "$SLEEP_SECONDS"
    fi
  done
  if [[ "$merge_state" == "UNKNOWN" ]]; then
    log "Merge state stayed UNKNOWN after ${MERGE_STATE_MAX_ATTEMPTS} attempts; failing closed."
    return 1
  fi
  if [[ "$merge_state" == "DIRTY" ]]; then
    log "Resolve the merge conflicts and update the PR branch before CI can run."
    return 1
  fi

  if ! enforce_bot_fix_discipline; then
    return 1
  fi

  wait_for_checks
}

main "$@"
