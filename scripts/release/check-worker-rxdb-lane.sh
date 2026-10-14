#!/usr/bin/env bash
# Release gate: may this OPFS worker ship on the web-bundle lane its app version names?
#
#   check-worker-rxdb-lane.sh <worker-file> <app-version> [--allow-frozen-lane] [--worker-optional]
#                             [--bundle-rxdb <version>]
#
# The web POS pairs the jsDelivr bundle at @<plugin major.minor> (the highest
# v<major.minor>.N tag on wcpos/web-bundle) with the OPFS worker the PLUGIN
# vendors. rxdb's storage-remote refuses any RXDB_VERSION mismatch (RM1), and
# plugins already in the field keep their old worker while loading the newest
# tag on their lane. So a worker whose RXDB_VERSION changed may never be tagged
# onto a lane that already has tags: it needs a new minor. (2026-10-14: a 17.6.0
# worker tagged v1.10.41 on a 17.4.0 lane broke every web POS on an older plugin.)
#
# Fails when:
#   - the worker's RXDB_VERSION is unreadable or ambiguous (fail closed);
#   - the lane's highest tag carries a worker with a different RXDB_VERSION;
#   - a higher lane already has tags (this lane is frozen), unless --allow-frozen-lane;
#   - --bundle-rxdb names the rxdb the main thread was built with and the worker
#     differs (rxdb bumped, worker not rebuilt: the lane check alone would pass).
# A lane with no tags passes ("new lane"). --worker-optional passes the RXDB
# comparison vacuously when <worker-file> does not exist (lanes with no OPFS worker).
#
# Sourcing this file defines the pure functions (stdin in, stdout out) and runs nothing.

WEB_BUNDLE_REPO="wcpos/web-bundle"
WORKER_PATH_IN_BUNDLE="build/opfs.worker.js"

# stdin: worker source. stdout: its single RXDB version.
# The shipped worker is minified, so RXDB_VERSION is inlined as `var Xe="17.6.0";`
# (rxdb core and rxdb-premium each carry one). Accept that shape and the
# unminified `RXDB_VERSION = '17.6.0'`; refuse zero or more than one distinct value.
worker_rxdb_version() {
	local versions count
	versions=$({ grep -oE "(RXDB_VERSION|var [A-Za-z_\$][A-Za-z0-9_\$]*) *= *[\"'][0-9]+\.[0-9]+\.[0-9]+[\"']" || true; } \
		| grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | sort -u)
	count=$(printf '%s' "$versions" | grep -c . || true)
	if [[ "$count" -eq 0 ]]; then
		echo "no RXDB_VERSION found in the worker" >&2
		return 1
	fi
	if [[ "$count" -gt 1 ]]; then
		echo "more than one RXDB_VERSION candidate in the worker: ${versions//$'\n'/ }" >&2
		return 1
	fi
	printf '%s\n' "$versions"
}

# $1: app version (x.y.z). stdout: lane (x.y).
lane_of_version() {
	if [[ ! "$1" =~ ^([0-9]+)\.([0-9]+)\.[0-9]+$ ]]; then
		echo "app version '$1' is not x.y.z" >&2
		return 1
	fi
	printf '%s.%s\n' "${BASH_REMATCH[1]}" "${BASH_REMATCH[2]}"
}

# stdin: tag names. $1: lane. stdout: highest N among v<lane>.N, or nothing.
highest_patch_on_lane() {
	local lane="${1//./\\.}"
	{ grep -E "^v${lane}\.[0-9]+$" || true; } | sed -E 's/^.*\.//' | sort -n | tail -1
}

# stdin: tag names. $1: lane. stdout: the lanes above it that have tags, ascending.
higher_lanes() {
	local major="${1%%.*}" minor="${1#*.}"
	{ grep -E '^v[0-9]+\.[0-9]+\.[0-9]+$' || true; } | sed -E 's/^v([0-9]+)\.([0-9]+)\..*/\1 \2/' | sort -u -n -k1,1 -k2,2 \
		| awk -v M="$major" -v m="$minor" '($1 > M) || ($1 == M && $2 > m) { print $1 "." $2 }'
}

# stdin: tag names. $1: lane. stdout: the next tag on the lane.
next_tag() {
	local n
	n=$(highest_patch_on_lane "$1")
	if [[ -z "$n" ]]; then printf 'v%s.0\n' "$1"; else printf 'v%s.%s\n' "$1" "$((n + 1))"; fi
}

# --- network (isolated so tests can mock `gh`) ---
list_bundle_tags() {
	gh api --paginate "repos/${WEB_BUNDLE_REPO}/tags" --jq '.[].name'
}

fetch_bundle_worker() { # $1: ref
	gh api "repos/${WEB_BUNDLE_REPO}/contents/${WORKER_PATH_IN_BUNDLE}?ref=$1" -H 'Accept: application/vnd.github.raw'
}

# $1 worker file, $2 app version, $3 allow frozen (true/false), $4 worker optional (true/false), $5 tags (newline list)
check_worker_lane() {
	local worker="$1" version="$2" allow_frozen="$3" optional="$4" tags="$5"
	local lane higher n tag mine theirs
	lane=$(lane_of_version "$version") || return 1

	higher=$(printf '%s\n' "$tags" | higher_lanes "$lane")
	if [[ -n "$higher" ]]; then
		if [[ "$allow_frozen" == true ]]; then
			echo "warning: lane ${lane} is frozen (higher lanes have tags: ${higher//$'\n'/ }); --allow-frozen-lane given" >&2
		else
			echo "FAIL: lane ${lane} is frozen: higher lanes already have tags (${higher//$'\n'/ }). Bump apps/main to the newest lane's minor, or pass --allow-frozen-lane for a deliberate patch to old plugins." >&2
			return 1
		fi
	fi

	if [[ ! -f "$worker" ]]; then
		if [[ "$optional" == true ]]; then
			echo "PASS: no worker at ${worker}; nothing to pair on lane ${lane}"
			return 0
		fi
		echo "FAIL: worker file ${worker} not found" >&2
		return 1
	fi
	mine=$(worker_rxdb_version < "$worker") || { echo "FAIL: ${worker}" >&2; return 1; }

	n=$(printf '%s\n' "$tags" | highest_patch_on_lane "$lane")
	if [[ -z "$n" ]]; then
		echo "PASS: new lane ${lane} (no v${lane}.N tags); worker RXDB_VERSION ${mine}"
		return 0
	fi
	tag="v${lane}.${n}"
	theirs=$(fetch_bundle_worker "$tag" | worker_rxdb_version) || {
		echo "FAIL: could not read RXDB_VERSION from ${WEB_BUNDLE_REPO}@${tag}/${WORKER_PATH_IN_BUNDLE}" >&2
		return 1
	}
	if [[ "$mine" != "$theirs" ]]; then
		echo "FAIL: worker RXDB_VERSION ${mine} != ${theirs} on ${tag}. Plugins in the field keep their ${theirs} worker and would load this bundle from @${lane} (RM1). An RXDB_VERSION change needs a NEW minor (new plugin minor and bundle lane), never a patch tag on ${lane}." >&2
		return 1
	fi
	echo "PASS: worker RXDB_VERSION ${mine} matches ${tag} on lane ${lane}"
}

main() {
	local allow_frozen=false optional=false bundle_rxdb="" args=() tags mine
	while [[ $# -gt 0 ]]; do
		case "$1" in
			--allow-frozen-lane) allow_frozen=true ;;
			--worker-optional) optional=true ;;
			--bundle-rxdb) bundle_rxdb="${2:-}"; shift ;;
			-*) echo "unknown option $1" >&2; return 2 ;;
			*) args+=("$1") ;;
		esac
		shift
	done
	if [[ ${#args[@]} -ne 2 ]]; then
		echo "usage: $0 <worker-file> <app-version> [--allow-frozen-lane] [--worker-optional] [--bundle-rxdb <version>]" >&2
		return 2
	fi
	if [[ -n "$bundle_rxdb" && -f "${args[0]}" ]]; then
		mine=$(worker_rxdb_version < "${args[0]}") || { echo "FAIL: ${args[0]}" >&2; return 1; }
		if [[ "$mine" != "$bundle_rxdb" ]]; then
			echo "FAIL: worker RXDB_VERSION ${mine} != the bundle's rxdb ${bundle_rxdb}; rebuild the worker (pnpm build:opfs-worker)" >&2
			return 1
		fi
	fi
	tags=$(list_bundle_tags) || { echo "FAIL: could not list ${WEB_BUNDLE_REPO} tags" >&2; return 1; }
	check_worker_lane "${args[0]}" "${args[1]}" "$allow_frozen" "$optional" "$tags"
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
	set -euo pipefail
	main "$@"
fi
