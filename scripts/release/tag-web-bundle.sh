#!/usr/bin/env bash
# Cut the next release tag on wcpos/web-bundle for a built bundle commit.
#
#   tag-web-bundle.sh <web-bundle-sha> [--dry-run] [--allow-frozen-lane]
#
# 1. Reads the bundle commit's message for the monorepo SHA it was built from
#    (`chore(release): build web bundle (@main from monorepo <sha>)`).
# 2. Reads apps/main/package.json at that SHA; its major.minor is the lane.
# 3. Runs check-worker-rxdb-lane.sh against the bundle's own build/opfs.worker.js
#    (RXDB_VERSION must match the rxdb pinned at that SHA and the lane's highest
#    tag; frozen lanes refused).
# 4. Creates v<major.minor>.<N+1> (or .0 on a new lane) at the bundle commit.
# 5. Waits up to 5 minutes for jsDelivr @<major.minor> to resolve the new tag,
#    purges, and re-verifies.
# --dry-run stops after step 3 and prints the tag it would create.
# Re-running on a commit that already holds its lane's newest tag (a previous run
# tagged it, then timed out on the CDN) skips step 4 and resumes at step 5.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=check-worker-rxdb-lane.sh
source "$SCRIPT_DIR/check-worker-rxdb-lane.sh"

MONOREPO_REPO="wcpos/monorepo"
CDN_POLL_SECONDS=300 # jsDelivr re-resolved @1.10 about 4 minutes after v1.10.41 (2026-10-14)
CDN_POLL_INTERVAL=20
CDN_VERIFY_SECONDS=120

# stdin: bundle commit message. stdout: the monorepo SHA. Only @main builds are released.
monorepo_sha_from_message() {
	local first ref re
	IFS= read -r first || true
	# `next`'s workflow appends `, ref <input ref>` after the SHA.
	re='^chore\(release\): build web bundle \(@([^ ]+) from monorepo ([^ ,)]+)(, ref [^)]*)?\)$'
	if [[ ! "$first" =~ $re ]]; then
		echo "not a web-bundle build commit: '$first'" >&2
		return 1
	fi
	if [[ "${BASH_REMATCH[1]}" != main ]]; then
		echo "bundle was built for @${BASH_REMATCH[1]}, not @main; release tags come from web-bundle main" >&2
		return 1
	fi
	ref="${BASH_REMATCH[2]}"
	if [[ ! "$ref" =~ ^[0-9a-f]{7,40}$ ]]; then
		echo "bundle was built from monorepo ref '$ref', not a SHA; the app version cannot be pinned" >&2
		return 1
	fi
	printf '%s\n' "$ref"
}

# stdin: HTTP response headers. stdout: the x-jsd-version value.
jsd_version() {
	{ grep -i '^x-jsd-version:' || true; } | head -1 | sed -E 's/^[^:]*: *//' | tr -d '\r'
}

# stdin: all tag names. $1 lane, $2 tags already on the commit (newline list).
# stdout: `create <tag>`, or `resume <tag>` when the commit already holds the
# lane's newest tag. Fails when it holds any other tag.
tag_action() {
	local all highest
	all=$(cat)
	if [[ -z "$2" ]]; then
		echo "create $(printf '%s\n' "$all" | next_tag "$1")"
		return 0
	fi
	highest="v$1.$(printf '%s\n' "$all" | highest_patch_on_lane "$1")"
	if grep -qx "$highest" <<<"$2"; then
		echo "resume $highest"
		return 0
	fi
	echo "already tagged (${2//$'\n'/ }), and not as lane $1's newest tag; nothing to cut" >&2
	return 1
}

# A 404/5xx (jsDelivr can carry x-jsd-version on one), a timeout or a dropped
# connection reads as no version, so the caller's poll retries until its deadline.
cdn_version() { # $1 lane, $2 path under build/
	local headers
	headers=$(curl -sI --fail --connect-timeout 10 --max-time 30 "https://cdn.jsdelivr.net/gh/${WEB_BUNDLE_REPO}@$1/build/$2") || return 0
	jsd_version <<<"$headers"
}

# Polls until every path in $4.. serves version $2 on lane $1, or $3 seconds pass.
wait_for_cdn() {
	local lane="$1" want="$2" deadline=$((SECONDS + $3)) path seen ok
	shift 3
	while :; do
		ok=true
		for path in "$@"; do
			seen=$(cdn_version "$lane" "$path")
			echo "@${lane}/build/${path} -> ${seen:-<none>} (want ${want})"
			[[ "$seen" == "$want" ]] || ok=false
		done
		[[ "$ok" == true ]] && return 0
		((SECONDS >= deadline)) && return 1
		sleep "$CDN_POLL_INTERVAL"
	done
}

purge_cdn() { # $1 lane
	local path code
	for path in "" /build/metadata.json /build/opfs.worker.js /build/index.html; do
		code=$(curl -s --connect-timeout 10 --max-time 60 -o /dev/null -w '%{http_code}' "https://purge.jsdelivr.net/gh/${WEB_BUNDLE_REPO}@$1${path}" || echo 000)
		echo "purge @$1${path} -> HTTP ${code}"
	done
}

main() {
	local dry_run=false allow_frozen=false bundle_sha="" msg sha monorepo_sha version lane bundle_rxdb tags existing worker action tag
	while [[ $# -gt 0 ]]; do
		case "$1" in
			--dry-run) dry_run=true ;;
			--allow-frozen-lane) allow_frozen=true ;;
			-*) echo "unknown option $1" >&2; return 2 ;;
			*) bundle_sha="$1" ;;
		esac
		shift
	done
	[[ -n "$bundle_sha" ]] || { echo "usage: $0 <web-bundle-sha> [--dry-run] [--allow-frozen-lane]" >&2; return 2; }

	sha=$(gh api "repos/${WEB_BUNDLE_REPO}/commits/${bundle_sha}" --jq .sha)
	msg=$(gh api "repos/${WEB_BUNDLE_REPO}/commits/${sha}" --jq .commit.message)
	monorepo_sha=$(printf '%s\n' "$msg" | monorepo_sha_from_message)
	version=$(gh api "repos/${MONOREPO_REPO}/contents/apps/main/package.json?ref=${monorepo_sha}" \
		-H 'Accept: application/vnd.github.raw' | jq -er .version)
	lane=$(lane_of_version "$version")
	bundle_rxdb=$(gh api "repos/${MONOREPO_REPO}/contents/package.json?ref=${monorepo_sha}" \
		-H 'Accept: application/vnd.github.raw' | pinned_rxdb)
	echo "bundle ${sha} <- monorepo ${monorepo_sha} (app ${version}, lane ${lane})"

	tags=$(list_bundle_tags)
	existing=$(gh api --paginate "repos/${WEB_BUNDLE_REPO}/tags" --jq ".[] | select(.commit.sha == \"${sha}\") | .name")
	action=$(printf '%s\n' "$tags" | tag_action "$lane" "$existing")
	worker=$(mktemp)
	trap 'rm -f "$worker"' RETURN
	fetch_bundle_worker "$sha" > "$worker" || { echo "FAIL: could not read ${WORKER_PATH_IN_BUNDLE} at ${sha}" >&2; return 1; }
	check_bundle_rxdb "$worker" "$bundle_rxdb"
	check_worker_lane "$worker" "$version" "$allow_frozen" false "$tags"

	tag="${action#* }"
	if [[ "$dry_run" == true ]]; then
		if [[ "$action" == create* ]]; then echo "dry run: would tag ${tag} at ${sha}"; else echo "dry run: ${sha} is already ${tag}; would resume CDN verification"; fi
		return 0
	fi

	if [[ "$action" == create* ]]; then
		gh api "repos/${WEB_BUNDLE_REPO}/git/refs" -f "ref=refs/tags/${tag}" -f "sha=${sha}" --jq .ref
		echo "tagged ${tag} at ${sha}"
	else
		echo "${sha} is already ${tag}; resuming CDN verification"
	fi

	wait_for_cdn "$lane" "${tag#v}" "$CDN_POLL_SECONDS" metadata.json || echo "@${lane} has not resolved ${tag} yet; purging"
	purge_cdn "$lane"
	if ! wait_for_cdn "$lane" "${tag#v}" "$CDN_VERIFY_SECONDS" metadata.json opfs.worker.js index.html; then
		echo "FAIL: @${lane} does not serve ${tag} on every path after the purge; re-run this command to purge and verify again" >&2
		return 1
	fi
	echo "LIVE: @${lane} serves ${tag} (metadata.json, opfs.worker.js, index.html)"
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
	set -euo pipefail
	main "$@"
fi
