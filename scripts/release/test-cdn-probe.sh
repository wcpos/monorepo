#!/usr/bin/env bash
# No network: curl serves fixtures and gh records issue operations.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROBE="$SCRIPT_DIR/cdn-probe.sh"
tmpdir="$(mktemp -d)"
trap 'rm -rf "$tmpdir"' EXIT
failures=0

expect_eq() {
	if [[ "$2" == "$3" ]]; then echo "ok - $1"; else echo "not ok - $1: expected '$2', got '$3'"; failures=$((failures + 1)); fi
}
contains() { expect_eq "$1" 1 "$(grep -Fc -- "$2" "$3" || true)"; }

mkdir -p "$tmpdir/bin"
cat > "$tmpdir/bin/curl" <<'MOCK'
#!/usr/bin/env bash
set -euo pipefail
while [[ $# -gt 0 ]]; do
	case "$1" in
		-o) shift; body="$1" ;;
		-D) shift; headers="$1" ;;
		--max-time) shift; [[ "$1" == 20 ]] || exit 64 ;;
		-w) shift; [[ "$1" == '%{http_code}' ]] || exit 64 ;;
		-sS|-g) ;;
		https://*) url="$1" ;;
		*) exit 64 ;;
	esac
	shift
done
case "$url" in
	https://cdn.jsdelivr.net/gh/wcpos/web-bundle@1.11/build/metadata.json) key=1.11 ;;
	https://cdn.jsdelivr.net/gh/wcpos/web-bundle@2.0/build/metadata.json) key=2.0 ;;
	'https://cdn.wcpos.com/manifest?ref=2.0&plugin=2.0.0&worker=17.6.0') key=manifest ;;
	*) exit 64 ;;
esac
printf '%s\n' "$url" >> "$MOCK_DIR/requests"
d="$MOCK_DIR/$key"
n=$(( $(cat "$d/count" 2>/dev/null || echo 0) + 1 )); echo "$n" > "$d/count"
fixture="$d/1"
if [[ "$n" -gt 1 && -d "$d/2" ]]; then fixture="$d/2"; fi
cat "$fixture/body" > "$body"
cat "$fixture/headers" > "$headers"
cat "$fixture/status"
exit "$(cat "$fixture/exit")"
MOCK
cat > "$tmpdir/bin/gh" <<'MOCK'
#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$*" >> "$MOCK_DIR/gh-calls"
if [[ "$1 $2" == 'issue list' ]]; then cat "$MOCK_DIR/issues"; fi
MOCK
chmod +x "$tmpdir/bin/"*
export MOCK_DIR="$tmpdir/fixtures"

reset_case() {
	rm -rf "$MOCK_DIR"; mkdir -p "$MOCK_DIR"
	local key
	for key in 1.11 2.0 manifest; do
		mkdir -p "$MOCK_DIR/$key/1"
		printf 200 > "$MOCK_DIR/$key/1/status"
		printf 0 > "$MOCK_DIR/$key/1/exit"
		printf 'HTTP/2 200\r\nX-Jsd-Version: %s.9\r\n\r\n' "$key" > "$MOCK_DIR/$key/1/headers"
		printf '{"build_id":"build-123"}' > "$MOCK_DIR/$key/1/body"
	done
	printf '[]' > "$MOCK_DIR/issues"
	: > "$MOCK_DIR/gh-calls"
	: > "$MOCK_DIR/requests"
}
run_probe() {
	local want="$1" mode="${2:-local}" status=0
	(
		unset GITHUB_REPOSITORY GH_TOKEN
		if [[ "$mode" == actions ]]; then
			export GITHUB_REPOSITORY=wcpos/monorepo GH_TOKEN=test-token
			export GITHUB_SERVER_URL=https://github.com GITHUB_RUN_ID=123
		fi
		export PATH="$tmpdir/bin:$PATH"
		if [[ "$mode" == standalone ]]; then
			bash "$PROBE"
		else
			bash -euo pipefail -c 'source "$1"; RETRY_DELAY=0; main' _ "$PROBE"
		fi
	) > "$tmpdir/out" 2> "$tmpdir/err" || status=$?
	expect_eq "probe exit status" "$want" "$status"
	expect_eq "probe writes only the expected stderr" "${EXPECT_STDERR:-}" "$(cat "$tmpdir/err")"
	expect_eq "one verdict per URL" 3 "$(grep -Ec '^(OK|FAIL) ' "$tmpdir/out" || true)"
}
size_failure() {
	printf 403 > "$MOCK_DIR/1.11/1/status"
	printf 'Package size exceeded the configured limit of 50 MB' > "$MOCK_DIR/1.11/1/body"
}
open_issue() {
	printf '[{"number":6,"title":"CDN probe failing elsewhere"},{"number":7,"title":"CDN probe failing"}]' > "$MOCK_DIR/issues"
}

reset_case
run_probe 0
expect_eq "all probes OK" 3 "$(grep -c '^OK ' "$tmpdir/out")"
expect_eq "no gh outside Actions" "" "$(cat "$MOCK_DIR/gh-calls")"
expect_eq "one request per healthy URL" 3 "$(wc -l < "$MOCK_DIR/requests" | tr -d ' ')"

reset_case
run_probe 0 standalone

reset_case
printf 'x-jsd-version:1.11.9\r\n' > "$MOCK_DIR/1.11/1/headers"
run_probe 0

reset_case; size_failure
run_probe 1
contains "size refusal diagnosis" 'FAIL jsDelivr @1.11: jsDelivr refuses the version: tree over 50 MB' "$tmpdir/out"
expect_eq "failed URL gets exactly two attempts" 2 "$(cat "$MOCK_DIR/1.11/count")"
expect_eq "healthy URL is not retried" 1 "$(cat "$MOCK_DIR/2.0/count")"
expect_eq "failed local run never calls gh" "" "$(cat "$MOCK_DIR/gh-calls")"

reset_case
: > "$MOCK_DIR/1.11/1/headers"
run_probe 1
contains "missing version header fails" 'FAIL jsDelivr @1.11:' "$tmpdir/out"

reset_case
printf 'x-jsd-version: 2.0.9\r\n' > "$MOCK_DIR/1.11/1/headers"
run_probe 1
contains "wrong lane fails" 'FAIL jsDelivr @1.11:' "$tmpdir/out"

for body in '{}' '{"build_id":""}' 'not json'; do
	reset_case
	printf '%s' "$body" > "$MOCK_DIR/manifest/1/body"
	run_probe 1
	contains "missing/empty/invalid manifest fails" 'FAIL cdn.wcpos.com manifest:' "$tmpdir/out"
	expect_eq "manifest failure retried once" 2 "$(cat "$MOCK_DIR/manifest/count")"
done

reset_case
printf 28 > "$MOCK_DIR/2.0/1/exit"
run_probe 1
contains "transport failure cannot pass with HTTP 200" 'FAIL jsDelivr @2.0:' "$tmpdir/out"

reset_case
cp -R "$MOCK_DIR/1.11/1" "$MOCK_DIR/1.11/2"
size_failure
run_probe 0
contains "cold edge recovers" 'OK jsDelivr @1.11' "$tmpdir/out"
expect_eq "recovery takes two attempts" 2 "$(cat "$MOCK_DIR/1.11/count")"

reset_case; size_failure
run_probe 1 actions
contains "creates an outage issue" 'issue create --repo wcpos/monorepo --title CDN probe failing' "$MOCK_DIR/gh-calls"
contains "issue includes FAIL lines" 'FAIL jsDelivr @1.11:' "$MOCK_DIR/gh-calls"
contains "issue links run" 'https://github.com/wcpos/monorepo/actions/runs/123' "$MOCK_DIR/gh-calls"
contains "searches open issues by title" '--state open --search in:title "CDN probe failing" --json number,title' "$MOCK_DIR/gh-calls"

reset_case; size_failure; open_issue
run_probe 1 actions
contains "comments on exact title match" 'issue comment 7 --repo wcpos/monorepo --body FAIL jsDelivr @1.11:' "$MOCK_DIR/gh-calls"
expect_eq "no duplicate issue" 0 "$(grep -c 'issue create' "$MOCK_DIR/gh-calls" || true)"

reset_case; open_issue
run_probe 0 actions
contains "recovery comment" 'Recovered: every probe OK (run https://github.com/wcpos/monorepo/actions/runs/123)' "$MOCK_DIR/gh-calls"
contains "closes recovered issue" 'issue close 7 --repo wcpos/monorepo' "$MOCK_DIR/gh-calls"

reset_case; size_failure
cat > "$tmpdir/bin/gh" <<'MOCK'
#!/usr/bin/env bash
printf '%s\n' "$*" >> "$MOCK_DIR/gh-calls"
exit 1
MOCK
EXPECT_STDERR='warning: gh issue list failed; no issue action this run' run_probe 1 actions
expect_eq "a failed lookup skips every issue action" 1 "$(wc -l < "$MOCK_DIR/gh-calls" | tr -d ' ')"
expect_eq "a failed lookup still reports the probe" 1 "$(grep -c '^FAIL jsDelivr @1.11:' "$tmpdir/out")"
cat > "$tmpdir/bin/gh" <<'MOCK'
#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$*" >> "$MOCK_DIR/gh-calls"
if [[ "$1 $2" == 'issue list' ]]; then cat "$MOCK_DIR/issues"; fi
MOCK

reset_case
run_probe 0 actions
expect_eq "healthy run without open issue only lists" 1 "$(wc -l < "$MOCK_DIR/gh-calls" | tr -d ' ')"

if [[ $failures -gt 0 ]]; then echo "$failures cdn-probe test(s) failed" >&2; exit 1; fi
echo 'All cdn-probe tests passed.'
