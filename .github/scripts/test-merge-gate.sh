#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MERGE_GATE_SCRIPT="$SCRIPT_DIR/merge-gate.sh"

tmpdir="$(mktemp -d)"
trap 'rm -rf "$tmpdir"' EXIT

cat > "$tmpdir/gh" <<'MOCK_GH'
#!/usr/bin/env bash
set -euo pipefail
args="$*"

if [[ "$args" == pr\ view* ]]; then
  if [[ "${MOCK_MERGE_STATE_FAIL:-false}" == "true" ]]; then
    echo "mock: merge-state lookup unavailable" >&2
    exit 1
  fi
  printf '%s\n' "${MOCK_MERGE_STATE:-CLEAN}"
  exit 0
fi

if [[ "$args" == api\ repos/*/pulls/*/commits* ]]; then
  printf '%s\n' "${MOCK_PR_COMMITS:-}"
  exit 0
fi

if [[ "$args" == api\ repos/*/commits/* ]]; then
  sha="$(printf '%s' "$args" | sed -n 's|.*repos/[^ ]*/commits/\([^ ]*\).*|\1|p' | cut -d' ' -f1)"
  files_var="MOCK_COMMIT_FILES_${sha}"
  msg_var="MOCK_COMMIT_MSG_${sha}"
  if [[ "$args" == *files* ]]; then
    printf '%s\n' "${!files_var:-}"
  else
    printf '%s\n' "${!msg_var:-}"
  fi
  exit 0
fi

if [[ "$args" == pr\ checks* ]]; then
  check_name="$(printf '%s' "$args" | sed -n 's/.*select(.name == "\([^"]*\)").*/\1/p')"
  if [[ -z "$check_name" ]]; then
    exit 0
  fi
  if [[ "${MOCK_FAIL_CHECK:-}" == "$check_name" ]]; then
    printf 'fail\tFAILURE\n'
    exit 0
  fi
  if [[ "${MOCK_SKIP_CHECK:-}" == "$check_name" ]]; then
    printf 'skipping\tSKIPPED\n'
    exit 0
  fi
  printf 'pass\tSUCCESS\n'
  exit 0
fi

echo "Unexpected gh invocation: $args" >&2
exit 64
MOCK_GH
chmod +x "$tmpdir/gh"

run_case() {
  local name="$1" expected="$2"
  shift 2
  echo "Running $name"
  set +e
  env \
    PATH="$tmpdir:$PATH" \
    GITHUB_REPOSITORY="wcpos/test" \
    PR_NUMBER="123" \
    MERGE_GATE_REQUIRED_CHECKS="🧹 Lint|🧪 Unit Tests" \
    MERGE_GATE_MAX_ATTEMPTS="1" \
    MERGE_GATE_SLEEP_SECONDS="0" \
    "$@" \
    "$MERGE_GATE_SCRIPT" >"$tmpdir/out" 2>&1
  local status=$?
  set -e
  cat "$tmpdir/out"
  if [[ "$expected" == "pass" && "$status" -ne 0 ]]; then
    echo "Expected $name to pass, got exit $status" >&2
    return 1
  fi
  if [[ "$expected" == "fail" && "$status" -eq 0 ]]; then
    echo "Expected $name to fail, got exit 0" >&2
    return 1
  fi
}

bot_commits=$'c1\twcpos-agents[bot]'
mixed_commits=$'h1\tkilbot\nc1\twcpos-agents[bot]'

run_case "clean human PR with green checks passes" pass \
  MOCK_PR_COMMITS=$'h1\tkilbot' \
  MOCK_COMMIT_FILES_h1=$'modified\tpackages/core/src/foo.ts' \
  MOCK_COMMIT_MSG_h1="fix: human change, exempt from bot rule"

run_case "conflicted PR fails closed" fail \
  MOCK_MERGE_STATE="DIRTY" \
  MOCK_PR_COMMITS=""

run_case "merge-state lookup failure fails closed" fail \
  MOCK_MERGE_STATE_FAIL=true \
  MOCK_PR_COMMITS=""

run_case "fix-bot source commit without test fails" fail \
  MOCK_PR_COMMITS="$bot_commits" \
  MOCK_COMMIT_FILES_c1=$'modified\tpackages/core/src/screens/main/orders/refund/use-refund-mutation.ts' \
  MOCK_COMMIT_MSG_c1="fix: change behavior"

run_case "fix-bot commit with test but no Tested trailer fails" fail \
  MOCK_PR_COMMITS="$bot_commits" \
  MOCK_COMMIT_FILES_c1=$'modified\tpackages/core/src/foo.ts\nadded\tpackages/core/src/foo.test.ts' \
  MOCK_COMMIT_MSG_c1="fix: change behavior"

run_case "fix-bot commit with pinning test and Tested trailer passes" pass \
  MOCK_PR_COMMITS="$mixed_commits" \
  MOCK_COMMIT_FILES_h1=$'modified\tpackages/core/src/bar.ts' \
  MOCK_COMMIT_MSG_h1="fix: human commit" \
  MOCK_COMMIT_FILES_c1=$'modified\tpackages/core/src/foo.ts\nadded\tpackages/core/src/foo.test.ts' \
  MOCK_COMMIT_MSG_c1=$'fix: change behavior\n\nTested: 8/8 green — jest use-refund-mutation'

run_case "fix-bot docs-only commit is exempt" pass \
  MOCK_PR_COMMITS="$bot_commits" \
  MOCK_COMMIT_FILES_c1=$'modified\tREADME.md' \
  MOCK_COMMIT_MSG_c1="docs: tweak"

run_case "skipped required checks count as pass (paths-filter)" pass \
  MOCK_PR_COMMITS="" \
  MOCK_SKIP_CHECK="🧪 Unit Tests"

run_case "failed required check fails the gate" fail \
  MOCK_PR_COMMITS="" \
  MOCK_FAIL_CHECK="🧹 Lint"

run_case "fix-bot Tested line outside the trailer block fails" fail \
  MOCK_PR_COMMITS="$bot_commits" \
  MOCK_COMMIT_FILES_c1=$'modified\tpackages/core/src/foo.ts\nadded\tpackages/core/src/foo.test.ts' \
  MOCK_COMMIT_MSG_c1=$'fix: change behavior\n\nThe contract says every commit needs a\nTested: trailer, which this prose merely mentions.\n\nSigned-off-by: bot'

run_case "fix-bot deleting a test does not satisfy the pin" fail \
  MOCK_PR_COMMITS="$bot_commits" \
  MOCK_COMMIT_FILES_c1=$'modified\tpackages/core/src/foo.ts\nremoved\tpackages/core/src/foo.test.ts' \
  MOCK_COMMIT_MSG_c1=$'fix: change behavior\n\nTested: 8/8 green — jest'

run_case "fix-bot mjs source counts as source" fail \
  MOCK_PR_COMMITS="$bot_commits" \
  MOCK_COMMIT_FILES_c1=$'modified\tscripts/start-dev.mjs' \
  MOCK_COMMIT_MSG_c1="fix: change behavior"

run_case "UNKNOWN merge state fails closed after retries" fail \
  MOCK_MERGE_STATE="UNKNOWN" \
  MERGE_GATE_MERGE_STATE_MAX_ATTEMPTS="2" \
  MOCK_PR_COMMITS=""

run_case "fix-bot meaningless Tested trailer fails" fail \
  PR_AUTHOR="kilbot" PR_TITLE="fix: x" MOCK_CHANGED_FILES="x" MOCK_PATCH="" \
  MOCK_PR_COMMITS="$bot_commits" \
  MOCK_COMMIT_FILES_c1=$'modified\tpackages/core/src/x.ts\nadded\tpackages/core/src/x.test.ts' \
  MOCK_COMMIT_MSG_c1=$'fix: x\n\nTested: N/A'

run_case "fix-bot gate-script edit needs its harness touched" fail \
  PR_AUTHOR="kilbot" PR_TITLE="fix: x" MOCK_CHANGED_FILES="x" MOCK_PATCH="" \
  MOCK_PR_COMMITS="$bot_commits" \
  MOCK_COMMIT_FILES_c1=$'modified\t.github/scripts/merge-gate.sh' \
  MOCK_COMMIT_MSG_c1=$'fix: x\n\nTested: 9/9 cases'

run_case "fix-bot gate-script edit with harness passes" pass \
  PR_AUTHOR="kilbot" PR_TITLE="fix: x" MOCK_CHANGED_FILES="x" MOCK_PATCH="" \
  MOCK_PR_COMMITS="$bot_commits" \
  MOCK_COMMIT_FILES_c1=$'modified\t.github/scripts/merge-gate.sh\nmodified\t.github/scripts/test-merge-gate.sh' \
  MOCK_COMMIT_MSG_c1=$'fix: x\n\nTested: 12/12 cases pass — local harness'

echo "All merge-gate tests passed."
