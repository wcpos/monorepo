#!/usr/bin/env bash
# Byte verification shared by release tags and branch publishing.
: "${WEB_BUNDLE_REPO:=wcpos/web-bundle}"
: "${CDN_POLL_INTERVAL:=20}" # Give jsDelivr time to refresh after each purge.
# shellcheck disable=SC2034 # Used by the sourcing release script/workflow.
CDN_HASHED_DEADLINE_SECONDS=600 # Origin rate limiting lasted minutes on 2026-10-14; then ask a human.
# shellcheck disable=SC2034 # Used by the sourcing release script/workflow.
# Mutable files are purged once, then only polled: jsDelivr throttles a path purged too
# often within the hour, and each purge inside the window extends it (2026-10-18). Ten
# minutes covers a normal refresh without a purge storm.
CDN_UNHASHED_DEADLINE_SECONDS=600
# Set by purge_cdn_path when jsDelivr answers a purge with "throttled": true; the reset is
# the largest throttlingReset (seconds) seen. Read by cdn_refresh_advice.
CDN_PURGE_THROTTLED=""
CDN_PURGE_THROTTLE_RESET=0

expected_from_dir() (
	set -o pipefail
	cd "$1" || return 1
	find . -type f -print0 | LC_ALL=C sort -z | while IFS= read -r -d '' path; do
		sha=$(git hash-object --no-filters "$path") || exit 1
		printf '%s %s\n' "$sha" "${path#./}"
	done
)

expected_from_tree() (
	set -o pipefail
	gh api "repos/${WEB_BUNDLE_REPO}/git/trees/$1?recursive=1" | jq -er '
		if .truncated then error("incomplete bundle tree") else
		.tree | sort_by(.path)[] | select(.type == "blob" and (.path | startswith("build/"))) |
		"\(.sha) \(.path | ltrimstr("build/"))" end'
)

is_unhashed_path() {
	case "$1" in
		metadata.json|index.html) return 0 ;;
		*/*) return 1 ;;
		*.worker.js) return 0 ;;
		*) return 1 ;;
	esac
}

verify_cdn_path() {
	local body code status=0 sha
	body=$(mktemp) || { echo 'HTTP 000, 0 bytes: could not create temp file'; return 1; }
	code=$(curl -g -sS --connect-timeout 10 --max-time 120 -o "$body" -w '%{http_code}' \
		"https://cdn.jsdelivr.net/gh/${WEB_BUNDLE_REPO}@$1/build/$2") || status=$?
	sha=$(git hash-object --no-filters "$body") || status=1
	if [[ "$status" == 0 && "$code" == 200 && "$sha" == "$3" ]]; then rm -f "$body"; return 0; fi
	printf 'HTTP %s, %s bytes, curl exit %s: %s\n' "${code:-000}" "$(wc -c < "$body" | tr -d ' ')" "$status" \
		"$(LC_ALL=C tr -cd '[:print:]' < "$body" | cut -c1-60)"
	rm -f "$body"
	return 1
}

# A throttled purge still answers 200 "finished" but purges nothing; it returns 0 (just
# poll) and records the throttle. A body that is not JSON, or lacks the path, is "unknown".
purge_cdn_path() {
	local suffix="${2:+build/$2}" body code entry="" throttled="" reset=0
	body=$(mktemp) || { echo "purge @$1/${suffix} -> HTTP 000, unknown"; return 0; }
	code=$(curl -g -sS --connect-timeout 10 --max-time 120 -o "$body" -w '%{http_code}' \
		"https://purge.jsdelivr.net/gh/${WEB_BUNDLE_REPO}@$1/${suffix}") || true
	entry=$(jq -r --arg k "/gh/${WEB_BUNDLE_REPO}@$1/${suffix}" '(.paths[$k] // first(.paths[]?)) |
		select(type == "object") | "\(.throttled == true) \(.throttlingReset // 0 | tonumber? // 0 | floor)"' \
		"$body" 2>/dev/null) || entry=""
	rm -f "$body"
	read -r throttled reset <<< "$entry" || true
	if [[ "$throttled" == true ]]; then
		CDN_PURGE_THROTTLED=1
		if ((reset > CDN_PURGE_THROTTLE_RESET)); then CDN_PURGE_THROTTLE_RESET=$reset; fi
		echo "purge @$1/${suffix} -> HTTP ${code:-000}, THROTTLED (reset in ${reset}s)"
	elif [[ "$throttled" == false ]]; then
		echo "purge @$1/${suffix} -> HTTP ${code:-000}, accepted"
	else
		echo "purge @$1/${suffix} -> HTTP ${code:-000}, unknown"
	fi
}

purge_cdn_root() { purge_cdn_path "$1" ""; }

# $1 where the bundle is published ("on the @next branch", "as v1.11.2"). What to do when
# the CDN has not caught up. Never "re-run now": a purge inside the throttle window extends it.
cdn_refresh_advice() {
	if [[ -n "$CDN_PURGE_THROTTLED" ]]; then
		echo "The bundle IS published $1, but jsDelivr throttled the purge for these paths (purged too often within the hour). The CDN refreshes when the throttle resets in about $(((CDN_PURGE_THROTTLE_RESET + 59) / 60)) min, or when its 12-hour cache expires. Re-running or re-dispatching inside that window extends the throttle: wait for the reset, then publish once."
	else
		echo "The bundle IS published $1, but jsDelivr did not refresh within the deadline. Wait, then verify or re-run once."
	fi
}

# stdin: sorted "<blob SHA> <relative path>" lines. The caller purges once beforehand; this
# only polls by content (re-purging would extend jsDelivr's throttle). Only retry outstanding paths.
verify_cdn_paths() {
	local ref="$1" deadline=$((SECONDS + $2)) sha path i diagnosis remaining=0
	local paths=() shas=() diagnoses=()
	while read -r sha path; do
		[[ -n "$sha" && -n "$path" ]] || continue
		paths+=("$path"); shas+=("$sha"); diagnoses+=("not attempted before deadline")
		remaining=$((remaining + 1))
	done
	[[ "$remaining" -gt 0 ]] || { echo 'FAIL: no CDN paths to verify'; return 1; }
	while :; do
		for i in "${!paths[@]}"; do
			path="${paths[i]}"
			if diagnosis=$(verify_cdn_path "$ref" "$path" "${shas[i]}"); then
				echo "@${ref}/build/${path} -> verified by content"
				unset 'paths[i]'
				remaining=$((remaining - 1))
			else
				diagnoses[i]="$diagnosis"
				echo "@${ref}/build/${path} -> $diagnosis"
			fi
			[[ "$remaining" == 0 ]] && return 0
			((SECONDS >= deadline)) && break
		done
		((SECONDS >= deadline)) && break
		sleep "$CDN_POLL_INTERVAL"
		((SECONDS >= deadline)) && break
	done
	for i in "${!paths[@]}"; do echo "FAIL: @${ref}/build/${paths[i]} -> ${diagnoses[i]}"; done
	return 1
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
	set -euo pipefail
	[[ $# == 2 ]] || { echo "usage: $0 <ref> <deadline-seconds> (SHA/path list on stdin)" >&2; exit 2; }
	verify_cdn_paths "$@"
fi
