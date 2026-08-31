#!/usr/bin/env bash
# FIFO turnstile for the native E2E device jobs.
#
# One device job per (platform, device class) may run at a time across the
# whole repository: every device job logs a cashier in and syncs the store
# against dev-pro, whose php-fpm stays at 4 workers by design (owner ruling
# 2026-08-19), and overlapping runs put the order-pay page at 83–108 s and
# flow 04 at 21 min (PR #1690, runs 33274650949 / 33280466971).
#
# Why a script and not a job-level `concurrency` group: GitHub groups are not
# a queue. A group holds ONE running and ONE pending job; a newer pending job
# CANCELS the older pending one regardless of `cancel-in-progress`. With PRs
# and hourly main merges all sharing `native-device-<platform>-<device>`,
# main's device jobs were cancelled while pending every time on 2026-08-30
# (runs 33302213932, 33306547305 …) and PR jobs went red as "cancelled" with
# nothing to re-run (run 33315563479, Android phone). This script waits
# instead: strictly first-come-first-served by attempt start time (run ID
# breaks ties), bounded, and a run that is still queued when the budget ends
# fails with a message naming what it waited on — never a silent cancel.
#
# Blocking rule, evaluated against every EARLIER attempt of this workflow that
# is not completed:
#   - a job with our exact name exists → block while it is not completed;
#   - no job with our name yet, but a job of our platform exists → block while
#     any of them is not completed (max-parallel: 1 creates the tablet job
#     only when the phone job finishes), and for SIBLING_GRACE_SECONDS after
#     one completes (the next matrix job appears ~1 s later; a poll can land
#     inside that window);
#   - no job of our platform at all → block until the run's build job has been
#     completed for SIBLING_GRACE_SECONDS (device jobs are created when the
#     build resolves; a platform-only dispatch never creates ours).
# Newer runs are ignored: they wait on us. The REST jobs list carries only
# matrix jobs that have been expanded, which is why the sibling inference is
# needed at all (checked against run 33317998775 on 2026-08-30).
#
# Inputs (environment):
#   GH_TOKEN, GITHUB_REPOSITORY, GITHUB_RUN_ID   — from the workflow
#   SLOT_JOB          exact job name, e.g. "🍎 iOS (phone)"
#   PLATFORM_PREFIX   the platform's job-name prefix, e.g. "🍎 iOS ("
#   BUILD_JOB         the build job's name (default: 📦 Resolve dev-client build)
#   WORKFLOW_FILE     workflow file name (default: e2e-native.yml)
#   WAIT_BUDGET_SECONDS   give up after this long (default 9000 = 150 min:
#                     three queued Android suites ahead of us, worst observed)
#   POLL_SECONDS      poll interval (default 120: five waiting jobs × ~5 API
#                     calls per poll stays well under the 1000/h token limit)
#   SIBLING_GRACE_SECONDS   see the rule above (default 180)
set -euo pipefail

: "${GITHUB_REPOSITORY:?}" "${GITHUB_RUN_ID:?}" "${SLOT_JOB:?}" "${PLATFORM_PREFIX:?}"
BUILD_JOB="${BUILD_JOB:-📦 Resolve dev-client build}"
WORKFLOW_FILE="${WORKFLOW_FILE:-e2e-native.yml}"
WAIT_BUDGET_SECONDS="${WAIT_BUDGET_SECONDS:-9000}"
POLL_SECONDS="${POLL_SECONDS:-120}"
SIBLING_GRACE_SECONDS="${SIBLING_GRACE_SECONDS:-180}"

started_at="$(date +%s)"
api_failures=0

# Prints one line per blocking job in RUN_JSON's jobs list, or nothing.
# $1 = jobs JSON, $2 = run html_url, $3 = branch. Exit 0 = blocked.
blocking_jobs() {
	jq -r \
		--arg slot "$SLOT_JOB" \
		--arg prefix "$PLATFORM_PREFIX" \
		--arg build "$BUILD_JOB" \
		--argjson grace "$SIBLING_GRACE_SECONDS" \
		--arg url "$2" \
		--arg branch "$3" '
		def recent: (.completed_at != null) and ((now - (.completed_at | sub("\\.[0-9]+Z$"; "Z") | fromdateiso8601)) < $grace);
		def describe: "\($url) (\($branch)) — \(.name): \(.status)";
		(.jobs // []) as $jobs
		| ($jobs | map(select(.name == $slot))) as $slot_jobs
		| ($jobs | map(select(.name | startswith($prefix)))) as $platform_jobs
		| ($jobs | map(select(.name == $build))) as $build_jobs
		| if ($slot_jobs | length) > 0 then
			$slot_jobs | map(select(.status != "completed")) | .[] | describe
		  elif ($platform_jobs | length) > 0 then
			($platform_jobs | map(select(.status != "completed" or recent))
			 | .[] | "\(describe) (\($slot) follows it)")
		  elif ($build_jobs | length) == 0 or ($build_jobs | any(.status != "completed" or recent)) then
			"\($url) (\($branch)) — device jobs not created yet"
		  else empty
		  end
	' <<< "$1"
}

polls=0
while :; do
	now="$(date +%s)"
	waited=$((now - started_at))
	# The budget applies only after at least one poll: a job must never give up —
	# or pass — on the clock alone. (The test suite drives this with a 1 s budget,
	# and on a slow runner the first `date` tick could land past it before any
	# blocker had been looked up; the Lint job then failed on main-bound PRs with
	# "Gave up waiting … after 1s" and no blocker named, run 33328330299.)
	if [ "$polls" -gt 0 ] && [ "$waited" -ge "$WAIT_BUDGET_SECONDS" ]; then
		echo "::error::Gave up waiting for the ${SLOT_JOB} device slot after ${waited}s (budget ${WAIT_BUDGET_SECONDS}s). Still ahead of this run:"
		printf '%s\n' "${last_blockers:-<unknown>}"
		echo "Re-run this job once the queue drains; nothing was cancelled."
		exit 1
	fi

	# ONE page of 100, never --paginate: this workflow has thousands of runs, and a
	# waiting job polls every 2 min — paging the whole history would be ~30 requests per
	# poll per job and exhaust the token's 1000/h limit for every run in flight. 100 runs
	# is more than a day at the busiest rate seen (2026-08-30), and a device job cannot
	# still be alive after 250 min, so any older run that matters is on the first page.
	if ! runs_json="$(gh api "repos/${GITHUB_REPOSITORY}/actions/workflows/${WORKFLOW_FILE}/runs?per_page=100" 2>/tmp/turnstile-api.err)"; then
		api_failures=$((api_failures + 1))
		polls=$((polls + 1))
		echo "::warning::Could not list workflow runs (attempt ${api_failures}): $(tr -d '\n' < /tmp/turnstile-api.err)"
		sleep "$POLL_SECONDS"
		continue
	fi

	older_runs="$(jq -c --argjson me "$GITHUB_RUN_ID" '
		def epoch: sub("\\.[0-9]+Z$"; "Z") | fromdateiso8601;
		([.workflow_runs[] | select(.id == $me)][0]) as $current
		# This run is normally on the page it just fetched. If 100 newer runs have
		# piled up while it waited (a long queue on a busy day), treat it as the
		# newest — wait on every live run — rather than let a null start time turn
		# into a jq error, an empty blocker list and a silent pass through the gate.
		| (if $current == null then now
		   else (($current.run_started_at // $current.created_at) | epoch) end) as $me_started
		| [.workflow_runs[]
			| ((.run_started_at // .created_at) | epoch) as $started
			| select(.id != $me and .status != "completed"
				and ($started < $me_started or ($started == $me_started and .id < $me)))
			| {id, html_url, head_branch, turn_started: $started}]
		| sort_by(.turn_started, .id) | .[] | {id, html_url, head_branch}
	' <<< "$runs_json")"

	blockers=""
	while IFS= read -r run; do
		[ -n "$run" ] || continue
		run_id="$(jq -r '.id' <<< "$run")"
		run_url="$(jq -r '.html_url' <<< "$run")"
		run_branch="$(jq -r '.head_branch' <<< "$run")"
		if ! jobs_json="$(gh api "repos/${GITHUB_REPOSITORY}/actions/runs/${run_id}/jobs?per_page=100" 2>/tmp/turnstile-api.err)"; then
			echo "::warning::Could not list jobs of run ${run_id}: $(tr -d '\n' < /tmp/turnstile-api.err)"
			# An unreadable older run is treated as blocking: waiting is cheap,
			# overlapping a live suite is what this script exists to prevent.
			blockers+="${run_url} (${run_branch}) — jobs unreadable"$'\n'
			continue
		fi
		found="$(blocking_jobs "$jobs_json" "$run_url" "$run_branch")"
		[ -z "$found" ] || blockers+="${found}"$'\n'
	done <<< "$older_runs"
	polls=$((polls + 1))

	if [ -z "$blockers" ]; then
		echo "✅ ${SLOT_JOB} device slot is free after ${waited}s"
		exit 0
	fi

	last_blockers="$blockers"
	echo "⏳ ${SLOT_JOB}: waited ${waited}s, queued behind:"
	printf '%s' "$blockers" | sed 's/^/   /'
	sleep "$POLL_SECONDS"
done
