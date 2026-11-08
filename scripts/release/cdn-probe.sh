#!/usr/bin/env bash
# Check the released web bundle sources; source this file to test without running main.
LANES=(1.11 2.0) # Released web lanes; edit when a lane is cut or frozen.
MANIFEST_PROBE_URL='https://cdn.wcpos.com/manifest?ref=2.0&plugin=2.0.0&worker=17.6.0' # Worker requires the current 2.0 plugin and worker values.
MIRROR_PROBE_URL='https://updates.wcpos.com/web-bundle/2.0/bundle.json' # Released 2.0 web-bundle mirror.
VERSIONS_URL='https://cdn.wcpos.com/versions.json' # Current and previous builds allow for mirror sync lag.
CURL_MAX_TIME=20 # Bound a slow edge so the scheduled job finishes within five minutes.
RETRY_DELAY=5 # Give a cold edge one chance to recover before alarming.

# Prints a diagnosis only on failure. An empty lane selects a JSON build check.
probe_once() (
	local url="$1" lane="$2" tmpdir code status=0 version
	local what="${3:-}" allowed="${4:-}" build_id
	tmpdir=$(mktemp -d) || { echo 'could not create temp directory'; return 1; }
	trap 'rm -rf "$tmpdir"' EXIT
	code=$(curl -g -sS --max-time "$CURL_MAX_TIME" -D "$tmpdir/headers" \
		-o "$tmpdir/body" -w '%{http_code}' "$url" 2> "$tmpdir/error") || status=$?
	if [[ "$status" != 0 ]]; then
		echo "request failed: curl exit $status"
		return 1
	fi
	if [[ "$code" != 200 ]]; then
		if [[ -n "$lane" && "$code" == 403 ]] && grep -q 'Package size exceeded' "$tmpdir/body"; then
			echo 'jsDelivr refuses the version: tree over 50 MB'
		else
			echo "HTTP ${code:-000} (expected 200)"
		fi
		return 1
	fi
	if [[ -n "$lane" ]]; then
		version=$(awk 'tolower($0) ~ /^x-jsd-version:/ {
			sub(/^[^:]*:[ \t]*/, ""); sub(/[ \t\r]+$/, ""); print; exit
		}' "$tmpdir/headers")
		[[ "$version" == "$lane."* ]] || { echo "x-jsd-version ${version:-missing} (expected $lane.*)"; return 1; }
	else
		jq -e '.build_id | type == "string" and length > 0' "$tmpdir/body" >/dev/null 2>&1 || {
			echo 'invalid JSON or missing non-empty build_id'; return 1;
		}
		if [[ "$what" == 'mirror 2.0' && "$allowed" != skip ]]; then
			build_id=$(jq -r '.build_id' "$tmpdir/body")
			local id match=false
			for id in $allowed; do [[ "$id" == "$build_id" ]] && match=true; done
			if [[ "$match" == false ]]; then
				echo "build_id $build_id is neither current nor previous of lane 2.0 (${allowed:-versions.json names no builds})"
				return 1
			fi
		fi
	fi
)

probe_with_retry() {
	local what="$1" url="$2" lane="$3" attempt diagnosis
	for attempt in 1 2; do
		if diagnosis=$(probe_once "$url" "$lane" "$what" "${4:-}"); then
			echo "OK $what"
			return 0
		fi
		if [[ "$attempt" == 1 ]]; then sleep "$RETRY_DELAY"; fi
	done
	echo "FAIL $what: $diagnosis"
	return 1
}

main() {
	local lane what url result failures="" verdict=0 issue run_url body
	# `skip` = the lane pointer could not be read (the manifest line already alarms for that);
	# a 200 that names no builds is a real finding and leaves the list empty, which fails the mirror line.
	local allowed=skip tmpdir code
	if tmpdir=$(mktemp -d); then
		if code=$(curl -g -sS --max-time "$CURL_MAX_TIME" -D "$tmpdir/headers" \
			-o "$tmpdir/body" -w '%{http_code}' "$VERSIONS_URL" 2> "$tmpdir/error") && [[ "$code" == 200 ]]; then
			allowed=$(jq -r '[.lanes["2.0"]? | .current?, .previous? | strings] | join(" ")' \
				"$tmpdir/body" 2>/dev/null) || allowed=''
		fi
		rm -rf "$tmpdir"
	fi
	for lane in "${LANES[@]}" '' mirror; do
		if [[ "$lane" == mirror ]]; then
			what='mirror 2.0'
			url="$MIRROR_PROBE_URL"
			lane=''
		elif [[ -n "$lane" ]]; then
			what="jsDelivr @$lane"
			url="https://cdn.jsdelivr.net/gh/wcpos/web-bundle@$lane/build/metadata.json"
		else
			what='cdn.wcpos.com manifest'
			url="$MANIFEST_PROBE_URL"
		fi
		if result=$(probe_with_retry "$what" "$url" "$lane" "$allowed"); then
			printf '%s\n' "$result"
		else
			printf '%s\n' "$result"
			failures+="$result"$'\n'
			verdict=1
		fi
	done
	if [[ -n "${GITHUB_REPOSITORY:-}" && -n "${GH_TOKEN:-}" ]]; then
		# A GitHub hiccup must never replace the probe verdict: warn and carry on.
		# A failed lookup also skips every issue action, or an outage with an open
		# issue would get a duplicate on the next tick.
		lookup_ok=true
		issue=$(gh issue list --repo "$GITHUB_REPOSITORY" --state open \
			--search 'in:title "CDN probe failing"' --json number,title |
			jq -r '[.[] | select(.title == "CDN probe failing")][0].number // empty') ||
			{ echo 'warning: gh issue list failed; no issue action this run' >&2; lookup_ok=false; issue=''; }
		run_url="$GITHUB_SERVER_URL/$GITHUB_REPOSITORY/actions/runs/$GITHUB_RUN_ID"
		if [[ "$lookup_ok" == false ]]; then
			:
		elif [[ "$verdict" == 1 ]]; then
			body="${failures}"$'\n'"Run: $run_url"
			if [[ -n "$issue" ]]; then
				gh issue comment "$issue" --repo "$GITHUB_REPOSITORY" --body "$body" || echo 'warning: gh issue comment failed' >&2
			else
				gh issue create --repo "$GITHUB_REPOSITORY" --title 'CDN probe failing' --body "$body" || echo 'warning: gh issue create failed' >&2
			fi
		elif [[ -n "$issue" ]]; then
			gh issue comment "$issue" --repo "$GITHUB_REPOSITORY" --body "Recovered: every probe OK (run $run_url)" || echo 'warning: gh issue comment failed' >&2
			gh issue close "$issue" --repo "$GITHUB_REPOSITORY" || echo 'warning: gh issue close failed' >&2
		fi
	fi
	return "$verdict"
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
	set -euo pipefail
	main "$@"
fi
