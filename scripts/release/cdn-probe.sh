#!/usr/bin/env bash
# Check the released web bundle sources; source this file to test without running main.
LANES=(1.11 2.0) # Released web lanes; edit when a lane is cut or frozen.
MANIFEST_PROBE_URL='https://cdn.wcpos.com/manifest?ref=2.0&plugin=2.0.0&worker=17.6.0' # Worker requires the current 2.0 plugin and worker values.
CURL_MAX_TIME=20 # Bound a slow edge so the scheduled job finishes within five minutes.
RETRY_DELAY=5 # Give a cold edge one chance to recover before alarming.

# Prints a diagnosis only on failure. An empty lane selects the manifest check.
probe_once() (
	local url="$1" lane="$2" tmpdir code status=0 version
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
	fi
)

probe_with_retry() {
	local what="$1" url="$2" lane="$3" attempt diagnosis
	for attempt in 1 2; do
		if diagnosis=$(probe_once "$url" "$lane"); then
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
	for lane in "${LANES[@]}" ''; do
		if [[ -n "$lane" ]]; then
			what="jsDelivr @$lane"
			url="https://cdn.jsdelivr.net/gh/wcpos/web-bundle@$lane/build/metadata.json"
		else
			what='cdn.wcpos.com manifest'
			url="$MANIFEST_PROBE_URL"
		fi
		if result=$(probe_with_retry "$what" "$url" "$lane"); then
			printf '%s\n' "$result"
		else
			printf '%s\n' "$result"
			failures+="$result"$'\n'
			verdict=1
		fi
	done
	if [[ -n "${GITHUB_REPOSITORY:-}" && -n "${GH_TOKEN:-}" ]]; then
		# A GitHub hiccup must never replace the probe verdict: warn and carry on.
		issue=$(gh issue list --repo "$GITHUB_REPOSITORY" --state open \
			--search 'in:title "CDN probe failing"' --json number,title |
			jq -r '[.[] | select(.title == "CDN probe failing")][0].number // empty') ||
			{ echo 'warning: gh issue list failed; no issue action this run' >&2; issue=''; }
		run_url="$GITHUB_SERVER_URL/$GITHUB_REPOSITORY/actions/runs/$GITHUB_RUN_ID"
		if [[ "$verdict" == 1 ]]; then
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
