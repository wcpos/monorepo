#!/usr/bin/env bash
# Cut the next release tag on wcpos/web-bundle for a built bundle commit.
#
#   tag-web-bundle.sh <web-bundle-sha> [--dry-run] [--allow-frozen-lane]
#
# 1. Reads the bundle commit's message for the monorepo SHA it was built from
#    (`chore(release): build web bundle (@main from monorepo <sha>)`, or @<major>.<minor>.x).
# 2. Reads apps/main/package.json at that SHA; its major.minor is the lane,
#    which must match a lane-branch build's branch.
# 3. Gates the build/ tree size below jsDelivr's limit, including in --dry-run.
# 4. Runs check-worker-rxdb-lane.sh against every vendored worker the bundle
#    commit carries (opfs, sqlite, indexeddb): each must match the same worker at
#    the lane's highest tag, the built ones must match the rxdb pinned at that
#    SHA, and frozen lanes are refused.
# 5. Creates v<major.minor>.<N+1> (or .0 on a new lane) at the bundle commit.
# 6. Refreshes the lane ref and verifies every hashed file by content before
#    purging metadata. Then purges and verifies metadata, index and workers
#    by content and version header; any failure stops the release.
# --dry-run stops after step 4 and prints the tag it would create.
# Re-running on a commit that already holds its lane's newest tag (a previous run
# tagged it, then timed out on the CDN) skips step 5 and resumes at step 6.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=scripts/release/check-worker-rxdb-lane.sh
source "$SCRIPT_DIR/check-worker-rxdb-lane.sh"
# shellcheck source=scripts/release/cdn-verify.sh
source "$SCRIPT_DIR/cdn-verify.sh"

MONOREPO_REPO="wcpos/monorepo"
CDN_VERIFY_SECONDS=120

# stdin: bundle commit message. stdout: the monorepo SHA. Release @main or lane branches.
monorepo_sha_from_message() {
	local first ref branch re
	IFS= read -r first || true
	# `next`'s workflow appends `, ref <input ref>` after the SHA.
	re='^chore\(release\): build web bundle \(@([^ ]+) from monorepo ([^ ,)]+)(, ref [^)]*)?\)$'
	if [[ ! "$first" =~ $re ]]; then
		echo "not a web-bundle build commit: '$first'" >&2
		return 1
	fi
	branch="${BASH_REMATCH[1]}"; ref="${BASH_REMATCH[2]}"
	if [[ "$branch" != main && ! "$branch" =~ ^[0-9]+\.[0-9]+\.x$ ]]; then
		echo "bundle was built for @${branch}, not @main or a @<major>.<minor>.x lane branch; release tags come from those" >&2
		return 1
	fi
	if [[ ! "$ref" =~ ^[0-9a-f]{7,40}$ ]]; then
		echo "bundle was built from monorepo ref '$ref', not a SHA; the app version cannot be pinned" >&2
		return 1
	fi
	printf '%s\n' "$ref"
}

# stdin: a message already validated by monorepo_sha_from_message. stdout: its branch.
bundle_branch_from_message() {
	sed -nE '1s/^chore\(release\): build web bundle \(@([^ ]+) .*/\1/p'
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
	local headers code status=0
	headers=$(mktemp) || return 0
	code=$(curl -g -sS -I --connect-timeout 10 --max-time 120 -o "$headers" -w '%{http_code}' \
		"https://cdn.jsdelivr.net/gh/${WEB_BUNDLE_REPO}@$1/build/$2") || status=$?
	if [[ "$status" == 0 && "$code" == 200 ]]; then jsd_version < "$headers"; fi
	rm -f "$headers"
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

# stdin: all tag names. $1 lane, $2 this tag. stdout: the lane's newest tag below $2, or nothing.
previous_lane_tag() {
	local patch="${2##*.}"
	grep -E "^v${1//./\\.}\.[0-9]+$" | awk -F. -v p="$patch" '$3 + 0 < p + 0' | sort -t. -k3,3n | tail -1
}

# Expo names a chunk by a hash taken BEFORE the Sentry release banner is stamped into it, so
# a chunk keeps its name across patch tags while its bytes change by the version string, and
# jsDelivr caches @<lane>/<path> by path: without a purge the lane serves the previous tag's
# bytes for every such chunk (v1.11.12, 2026-11-06: 72 of them, and the verification of the
# previous train is what had seeded the edge). stdin: this tag's "<sha> <path>" hashed lines;
# $1 lane, $2 the previous tag. Purges every path both tags carry with different bytes.
# Runs in the calling shell (no pipeline): a throttled purge must reach the throttle state the
# failure advice reads.
purge_changed_hashed() {
	local prev cur path
	prev=$(expected_from_tree "$2") || return 1
	cur=$(cat)
	while read -r path; do
		purge_cdn_path "$1" "$path"
	done < <(join -1 2 -2 2 <(sort -k2 <<<"$cur") <(sort -k2 <<<"$prev") | awk '$2 != $3 { print $1 }')
}

verify_lane_live() { # $1 lane, $2 tag, $3 the lane's previous tag ("" on a new lane)
	local lane="$1" tag="$2" expected sha path hashed="" unhashed="" n=0 m=0 paths=()
	purge_cdn_root "$lane"
	expected=$(expected_from_tree "$tag") || return 1
	while read -r sha path; do
		if is_unhashed_path "$path"; then
			unhashed+="$sha $path"$'\n'; paths+=("$path"); m=$((m + 1))
		else
			hashed+="$sha $path"$'\n'; n=$((n + 1))
		fi
	done <<< "$expected"
	if [[ -n "${3:-}" ]]; then
		purge_changed_hashed "$lane" "$3" <<<"$hashed" || return 1
	fi
	if ! printf '%s' "$hashed" | verify_cdn_paths "$lane" "$CDN_HASHED_DEADLINE_SECONDS"; then
		echo "FAIL: @${lane} does not serve the bytes of ${tag}'s hashed files; metadata.json was NOT purged, so stores still load the previous tag. $(cdn_refresh_advice "as ${tag}")" >&2
		return 1
	fi
	while read -r sha path; do
		[[ -z "$path" ]] || purge_cdn_path "$lane" "$path"
	done <<< "$unhashed"
	if ! printf '%s' "$unhashed" | verify_cdn_paths "$lane" "$CDN_UNHASHED_DEADLINE_SECONDS" ||
		! wait_for_cdn "$lane" "${tag#v}" "$CDN_VERIFY_SECONDS" "${paths[@]}"; then
		echo "FAIL: @${lane} does not serve ${tag}'s metadata.json/index.html/workers after the purge. $(cdn_refresh_advice "as ${tag}")" >&2
		return 1
	fi
	echo "LIVE: @${lane} serves ${tag}: ${n} hashed files and ${m} unhashed files verified by content"
}

main() {
	local dry_run=false allow_frozen=false bundle_sha="" msg sha monorepo_sha branch version lane bundle_rxdb tags existing names name dir action tag workers=()
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
	branch=$(printf '%s\n' "$msg" | bundle_branch_from_message)
	if [[ "$branch" != main && "${branch%.x}" != "$lane" ]]; then
		echo "bundle was built for @${branch} but the app at ${monorepo_sha} is on lane ${lane}" >&2
		return 1
	fi
	bundle_rxdb=$(gh api "repos/${MONOREPO_REPO}/contents/package.json?ref=${monorepo_sha}" \
		-H 'Accept: application/vnd.github.raw' | pinned_rxdb)
	echo "bundle ${sha} <- monorepo ${monorepo_sha} (app ${version}, lane ${lane})"

	tags=$(list_bundle_tags)
	existing=$(gh api --paginate "repos/${WEB_BUNDLE_REPO}/tags" --jq ".[] | select(.commit.sha == \"${sha}\") | .name")
	action=$(printf '%s\n' "$tags" | tag_action "$lane" "$existing")
	check_tree_size "$sha" || return 1
	# A failed listing fails closed; it never reads as "no workers".
	names=$(list_bundle_build "$sha") || { echo "FAIL: could not list build/ at ${sha}" >&2; return 1; }
	dir=$(mktemp -d)
	trap 'rm -rf "$dir"' RETURN
	for name in "${VENDORED_WORKERS[@]}"; do
		grep -qx "$name" <<<"$names" || continue
		fetch_bundle_file "$sha" "$name" > "$dir/$name" || { echo "FAIL: could not read build/${name} at ${sha}" >&2; return 1; }
		workers+=("$name")
	done
	check_bundle_rxdb "$dir" "$bundle_rxdb"
	check_worker_lane "$dir" "$version" "$allow_frozen" false "$tags"

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

	verify_lane_live "$lane" "$tag" "$(printf '%s\n' "$tags" | previous_lane_tag "$lane" "$tag")"
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
	set -euo pipefail
	main "$@"
fi
