#!/usr/bin/env bash
# Release gate: may this bundle's storage workers ship on the web-bundle lane its app version names?
#
#   check-worker-rxdb-lane.sh <build-dir> <app-version> [--allow-frozen-lane] [--worker-optional]
#                             [--bundle-rxdb <version>]
#
# The web POS pairs the jsDelivr bundle at @<plugin major.minor> (the highest
# v<major.minor>.N tag on wcpos/web-bundle) with the storage workers the PLUGIN
# vendors (assets/js/: sqlite.worker.js and indexeddb.worker.js on 2.x,
# opfs.worker.js on 1.x). rxdb's storage-remote refuses any RXDB_VERSION
# mismatch (RM1), and plugins already in the field keep their old workers while
# loading the newest tag on their lane. So a worker whose RXDB_VERSION changed
# may never be tagged onto a lane that already has tags: it needs a new minor.
# (2026-10-14: a 17.6.0 worker tagged v1.10.41 on a 17.4.0 lane broke every web
# POS on an older plugin.)
#
# Every vendored worker in <build-dir> is compared with the same file at the
# lane's highest tag. Fails when:
#   - a worker's RXDB_VERSION is unreadable or ambiguous (fail closed);
#   - a worker's RXDB_VERSION differs from the same worker at the lane's highest tag;
#   - a worker exists on one side only (added or dropped on a tagged lane);
#   - a higher lane already has tags (this lane is frozen), unless --allow-frozen-lane;
#   - --bundle-rxdb names the rxdb the main thread was built with and a worker
#     built from it differs (rxdb bumped, worker not rebuilt).
# A worker absent on both sides is skipped; a lane with no tags passes ("new
# lane"); --worker-optional passes a bundle that carries no vendored worker at all.
#
# Sourcing this file defines the pure functions (stdin in, stdout out) and runs nothing.

WEB_BUNDLE_REPO="wcpos/web-bundle"
# Every worker a plugin vendors from the bundle, on any lane.
VENDORED_WORKERS=(opfs.worker.js sqlite.worker.js indexeddb.worker.js)
# The ones built from this monorepo's rxdb. indexeddb.worker.js is a legacy
# worker web-bundle's build.js preserves byte for byte (PRESERVED_BUILD_FILES),
# so it carries its own pinned rxdb, not the bundle's.
BUILT_WORKERS=(opfs.worker.js sqlite.worker.js)

# stdin: worker source. stdout: its single RXDB version.
# The shipped worker is minified, so RXDB_VERSION is inlined as `var Xe="17.6.0";`
# or inside a declaration list, `var Ut="16.21.1",Wt="16.21.1"` (rxdb core and
# rxdb-premium each carry one). Accept those shapes and the unminified
# `RXDB_VERSION = '17.6.0'`; refuse zero or more than one distinct value.
worker_rxdb_version() {
	local versions count
	versions=$({ grep -oE "(RXDB_VERSION|(var |,)[A-Za-z_\$][A-Za-z0-9_\$]*) *= *[\"'][0-9]+\.[0-9]+\.[0-9]+[\"']" || true; } \
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

# stdin: a package.json. stdout: its exact rxdb pin; fails on a range or none.
pinned_rxdb() {
	local v
	v=$(jq -r '.dependencies.rxdb // .devDependencies.rxdb // empty')
	if [[ ! "$v" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
		echo "rxdb is not pinned to an exact x.y.z ('${v}')" >&2
		return 1
	fi
	printf '%s\n' "$v"
}

# $1 build dir, $2 the rxdb the main thread was built with. Checks each BUILT
# worker present: rxdb bumped but a worker not rebuilt would pass the lane check.
check_bundle_rxdb() {
	local name mine
	for name in "${BUILT_WORKERS[@]}"; do
		[[ -f "$1/$name" ]] || continue
		mine=$(worker_rxdb_version < "$1/$name") || { echo "FAIL: $1/$name" >&2; return 1; }
		if [[ "$mine" != "$2" ]]; then
			echo "FAIL: ${name} RXDB_VERSION ${mine} != the bundle's rxdb $2; rebuild the worker" >&2
			return 1
		fi
	done
}

# --- network (isolated so tests can mock `gh`) ---
list_bundle_tags() {
	gh api --paginate "repos/${WEB_BUNDLE_REPO}/tags" --jq '.[].name'
}

list_bundle_build() { # $1: ref. stdout: the names under build/
	gh api "repos/${WEB_BUNDLE_REPO}/contents/build?ref=$1" --jq '.[].name'
}

fetch_bundle_file() { # $1: ref, $2: name under build/
	gh api "repos/${WEB_BUNDLE_REPO}/contents/build/$2?ref=$1" -H 'Accept: application/vnd.github.raw'
}

# $1 build dir, $2 app version, $3 allow frozen (true/false), $4 worker optional (true/false), $5 tags (newline list)
check_worker_lane() {
	local dir="$1" version="$2" allow_frozen="$3" optional="$4" tags="$5"
	local lane higher n tag name mine theirs at_tag present=() failed=0
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

	[[ -d "$dir" ]] || { echo "FAIL: build directory ${dir} not found" >&2; return 1; }
	for name in "${VENDORED_WORKERS[@]}"; do [[ -f "$dir/$name" ]] && present+=("$name"); done
	if [[ ${#present[@]} -eq 0 ]]; then
		if [[ "$optional" == true ]]; then
			echo "PASS: no vendored worker in ${dir}; nothing to pair on lane ${lane}"
			return 0
		fi
		echo "FAIL: no vendored worker (${VENDORED_WORKERS[*]}) in ${dir}" >&2
		return 1
	fi

	n=$(printf '%s\n' "$tags" | highest_patch_on_lane "$lane")
	if [[ -z "$n" ]]; then
		for name in "${present[@]}"; do
			mine=$(worker_rxdb_version < "$dir/$name") || { echo "FAIL: ${dir}/${name}" >&2; return 1; }
			echo "PASS: new lane ${lane} (no v${lane}.N tags); ${name} RXDB_VERSION ${mine}"
		done
		return 0
	fi
	tag="v${lane}.${n}"
	at_tag=$(list_bundle_build "$tag") || { echo "FAIL: could not list build/ at ${WEB_BUNDLE_REPO}@${tag}" >&2; return 1; }

	for name in "${VENDORED_WORKERS[@]}"; do
		local here=false there=false
		[[ -f "$dir/$name" ]] && here=true
		grep -qx "$name" <<<"$at_tag" && there=true
		if [[ "$here" == false && "$there" == false ]]; then
			continue
		elif [[ "$there" == false ]]; then
			echo "FAIL: ${name} is in this bundle but not in ${tag}; plugins on lane ${lane} vendor no such worker. A new worker needs a NEW minor." >&2
			failed=1; continue
		elif [[ "$here" == false ]]; then
			echo "FAIL: ${name} is in ${tag} but not in this bundle; plugins on lane ${lane} still vendor it. Dropping a worker needs a NEW minor." >&2
			failed=1; continue
		fi
		mine=$(worker_rxdb_version < "$dir/$name") || { echo "FAIL: ${dir}/${name}" >&2; return 1; }
		theirs=$(fetch_bundle_file "$tag" "$name" | worker_rxdb_version) || {
			echo "FAIL: could not read RXDB_VERSION from ${WEB_BUNDLE_REPO}@${tag}/build/${name}" >&2
			return 1
		}
		if [[ "$mine" != "$theirs" ]]; then
			echo "FAIL: ${name} RXDB_VERSION ${mine} != ${theirs} on ${tag}. Plugins in the field keep their ${theirs} worker and would load this bundle from @${lane} (RM1). An RXDB_VERSION change needs a NEW minor (new plugin minor and bundle lane), never a patch tag on ${lane}." >&2
			failed=1; continue
		fi
		echo "PASS: ${name} RXDB_VERSION ${mine} matches ${tag} on lane ${lane}"
	done
	return "$failed"
}

main() {
	local allow_frozen=false optional=false bundle_rxdb="" args=() tags
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
		echo "usage: $0 <build-dir> <app-version> [--allow-frozen-lane] [--worker-optional] [--bundle-rxdb <version>]" >&2
		return 2
	fi
	if [[ -n "$bundle_rxdb" ]]; then check_bundle_rxdb "${args[0]}" "$bundle_rxdb" || return 1; fi
	tags=$(list_bundle_tags) || { echo "FAIL: could not list ${WEB_BUNDLE_REPO} tags" >&2; return 1; }
	check_worker_lane "${args[0]}" "${args[1]}" "$allow_frozen" "$optional" "$tags"
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
	set -euo pipefail
	main "$@"
fi
