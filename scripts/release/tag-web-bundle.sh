#!/usr/bin/env bash
# Cut the next release tag on wcpos/web-bundle for a built bundle commit.
#
#   tag-web-bundle.sh <web-bundle-sha> [--dry-run] [--allow-frozen-lane]
#
# 1. Reads the bundle commit's message for the monorepo SHA it was built from
#    (`chore(release): build web bundle (@main from monorepo <sha>)`).
# 2. Reads apps/main/package.json at that SHA; its major.minor is the lane.
# 3. Runs check-worker-rxdb-lane.sh against the bundle's own build/opfs.worker.js
#    (RXDB_VERSION must match the lane's highest tag; frozen lanes refused). A
#    bundle with no OPFS worker (2.x, built from `next`) passes that comparison
#    vacuously; the frozen-lane refusal still applies.
# 4. Creates v<major.minor>.<N+1> (or .0 on a new lane) at the bundle commit.
# 5. Waits up to 5 minutes for jsDelivr @<major.minor> to resolve the new tag,
#    purges, and re-verifies.
# --dry-run stops after step 3 and prints the tag it would create.

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

# stdout: yes/no. A failed listing fails (exit 1), never reads as "no worker".
bundle_has_worker() { # $1 bundle sha
	local names
	names=$(gh api "repos/${WEB_BUNDLE_REPO}/contents/build?ref=$1" --jq '.[].name') || return 1
	if grep -qx "${WORKER_PATH_IN_BUNDLE#build/}" <<<"$names"; then echo yes; else echo no; fi
}

cdn_lane_version() { # $1 lane
	curl -sI "https://cdn.jsdelivr.net/gh/${WEB_BUNDLE_REPO}@$1/build/metadata.json" | jsd_version
}

wait_for_cdn() { # $1 lane, $2 expected version, $3 seconds
	local deadline=$((SECONDS + $3)) seen
	while :; do
		seen=$(cdn_lane_version "$1")
		echo "@$1 -> ${seen:-<none>} (want $2)"
		[[ "$seen" == "$2" ]] && return 0
		((SECONDS >= deadline)) && return 1
		sleep "$CDN_POLL_INTERVAL"
	done
}

purge_cdn() { # $1 lane
	local path code
	for path in "" /build/metadata.json /build/opfs.worker.js /build/index.html; do
		code=$(curl -s -o /dev/null -w '%{http_code}' "https://purge.jsdelivr.net/gh/${WEB_BUNDLE_REPO}@$1${path}" || echo 000)
		echo "purge @$1${path} -> HTTP ${code}"
	done
}

main() {
	local dry_run=false allow_frozen=false bundle_sha="" msg sha monorepo_sha version lane tags existing has_worker worker tag
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
	echo "bundle ${sha} <- monorepo ${monorepo_sha} (app ${version}, lane ${lane})"

	tags=$(list_bundle_tags)
	existing=$(gh api --paginate "repos/${WEB_BUNDLE_REPO}/tags" --jq ".[] | select(.commit.sha == \"${sha}\") | .name")
	if [[ -n "$existing" ]]; then
		echo "FAIL: ${sha} is already tagged (${existing//$'\n'/ }); nothing to cut" >&2
		return 1
	fi
	worker=$(mktemp)
	trap 'rm -f "$worker"' RETURN
	has_worker=$(bundle_has_worker "$sha") || { echo "FAIL: could not list build/ at ${sha}" >&2; return 1; }
	if [[ "$has_worker" == yes ]]; then
		fetch_bundle_worker "$sha" > "$worker" || { echo "FAIL: could not read ${WORKER_PATH_IN_BUNDLE} at ${sha}" >&2; return 1; }
	else
		rm -f "$worker"
	fi
	check_worker_lane "$worker" "$version" "$allow_frozen" true "$tags"

	tag=$(printf '%s\n' "$tags" | next_tag "$lane")
	if [[ "$dry_run" == true ]]; then
		echo "dry run: would tag ${tag} at ${sha}"
		return 0
	fi

	gh api "repos/${WEB_BUNDLE_REPO}/git/refs" -f "ref=refs/tags/${tag}" -f "sha=${sha}" --jq .ref
	echo "tagged ${tag} at ${sha}"

	wait_for_cdn "$lane" "${tag#v}" "$CDN_POLL_SECONDS" || echo "@${lane} has not resolved ${tag} yet; purging"
	purge_cdn "$lane"
	if ! wait_for_cdn "$lane" "${tag#v}" "$CDN_VERIFY_SECONDS"; then
		echo "FAIL: @${lane} still does not serve ${tag} after the purge; re-purge before shipping plugins" >&2
		return 1
	fi
	echo "LIVE: https://cdn.jsdelivr.net/gh/${WEB_BUNDLE_REPO}@${lane}/build/metadata.json serves ${tag}"
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
	set -euo pipefail
	main "$@"
fi
