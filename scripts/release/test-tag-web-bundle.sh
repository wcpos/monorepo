#!/usr/bin/env bash
# Tests for tag-web-bundle.sh. No network: `gh` is a mock on PATH; only --dry-run runs end to end.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TAG="$SCRIPT_DIR/tag-web-bundle.sh"
# shellcheck source=scripts/release/tag-web-bundle.sh
source "$TAG"

tmpdir="$(mktemp -d)"
trap 'rm -rf "$tmpdir"' EXIT
failures=0

expect_eq() {
	if [[ "$2" == "$3" ]]; then echo "ok - $1"; else echo "not ok - $1: expected '$2', got '$3'"; failures=$((failures + 1)); fi
}
expect_status() {
	local name="$1" want="$2" status
	shift 2
	set +e
	"$@" >"$tmpdir/out" 2>&1
	status=$?
	set -e
	if { [[ "$want" == pass ]] && [[ $status -eq 0 ]]; } || { [[ "$want" == fail ]] && [[ $status -ne 0 ]]; }; then
		echo "ok - $name"
	else
		echo "not ok - $name (exit $status)"; sed 's/^/    /' "$tmpdir/out"; failures=$((failures + 1))
	fi
}

msha=6cbe28e97ec9ed4f085f853bd795944aa962b7c5

# --- monorepo_sha_from_message ---
expect_eq "parses the build commit message" "$msha" \
	"$(printf 'chore(release): build web bundle (@main from monorepo %s)\n' "$msha" | monorepo_sha_from_message)"
expect_eq "parses a short SHA" eea33c50 \
	"$(printf 'chore(release): build web bundle (@main from monorepo eea33c50)\n\nbody' | monorepo_sha_from_message)"
expect_eq "parses next's message shape (SHA, then the input ref)" "$msha" \
	"$(printf 'chore(release): build web bundle (@main from monorepo %s, ref release/2.0.1)\n' "$msha" | monorepo_sha_from_message)"
expect_status "refuses a branch-name ref" fail monorepo_sha_from_message <<<'chore(release): build web bundle (@main from monorepo main)'
expect_status "refuses a @next build" fail monorepo_sha_from_message <<<"chore(release): build web bundle (@next from monorepo $msha)"
expect_status "refuses an unrelated commit" fail monorepo_sha_from_message <<<'docs: readme'

# --- jsd_version ---
expect_eq "reads x-jsd-version" 1.11.1 "$(printf 'HTTP/2 200\r\nx-jsd-version: 1.11.1\r\nx-jsd-version-type: version\r\n' | jsd_version)"
expect_eq "no header, no version" "" "$(printf 'HTTP/2 404\r\n' | jsd_version)"

# --- cdn_version ---
mkdir -p "$tmpdir/curl404"
printf '#!/usr/bin/env bash\nprintf "HTTP/2 404\\r\\nx-jsd-version: 1.11.1\\r\\n"; exit 22\n' > "$tmpdir/curl404/curl"
chmod +x "$tmpdir/curl404/curl"
expect_eq "a failed CDN response reads as no version, without aborting" "" \
	"$(set -euo pipefail; PATH="$tmpdir/curl404:$PATH" cdn_version 1.11 index.html)"

# --- content verification: status-only checks must reject cached error bodies ---
mkdir -p "$tmpdir/cdn"
cat > "$tmpdir/cdn/curl" <<'MOCK'
#!/usr/bin/env bash
globoff=false; head=false
while [[ $# -gt 0 ]]; do
	case "$1" in
		-g) globoff=true ;;
		-I) head=true ;;
		-o) shift; body="$1" ;;
		https://*) url="$1" ;;
	esac
	shift
done
[[ "$globoff" == true ]] || exit 64
printf '%s\n' "$url" >> "$MOCK_LOG"
case "$url" in
	*purge.jsdelivr.net*)
		if [[ -n "${MOCK_PURGE_BODY:-}" ]]; then printf '%s' "$MOCK_PURGE_BODY"; else printf '{}'; fi > "$body"
		printf 200 ;;
	*)
		n=$(( $(cat "$MOCK_COUNT" 2>/dev/null || echo 0) + 1 )); echo "$n" > "$MOCK_COUNT"
		if [[ "$n" -ge "${MOCK_OK_AT:-1}" || "$url" == */ready.js ]] && [[ "$url" != */"${MOCK_BAD_PATH:-__none__}" ]]; then
			printf good > "$body"
		else
			printf '429: Too Many Requests' > "$body"
		fi
		if [[ "$head" == true ]]; then printf 'x-jsd-version: %s\r\n' "${MOCK_VERSION:-1.11.1}" > "$body"; fi
		printf '%s' "${MOCK_HTTP:-200}"
		exit "${MOCK_EXIT:-0}" ;;
esac
MOCK
chmod +x "$tmpdir/cdn/curl"
cat > "$tmpdir/cdn/gh" <<'MOCK'
#!/usr/bin/env bash
[[ "$*" == 'api repos/wcpos/web-bundle/git/trees/v1.11.1?recursive=1' ]] || exit 64
cat "$MOCK_TREE"
exit "${MOCK_GH_EXIT:-0}"
MOCK
chmod +x "$tmpdir/cdn/gh"
export MOCK_COUNT="$tmpdir/count" MOCK_LOG="$tmpdir/requests" MOCK_TREE="$tmpdir/tree"
good_sha=$(printf good | git hash-object --stdin)
entry='_expo/static/js/web/[orderId]-abc.js'
mkdir -p "$tmpdir/build/_expo/static/js/web"
printf good > "$tmpdir/build/$entry"
printf metadata > "$tmpdir/build/metadata.json"
expect_eq "directory hashes and sorts relative paths" \
	"$(printf '%s %s\n%s metadata.json' "$good_sha" "$entry" "$(git hash-object "$tmpdir/build/metadata.json")")" \
	"$(expected_from_dir "$tmpdir/build")"
cat > "$MOCK_TREE" <<JSON
{"truncated":false,"tree":[
{"type":"blob","path":"build/metadata.json","sha":"$good_sha"},
{"type":"blob","path":"build/index.html","sha":"$good_sha"},
{"type":"blob","path":"build/opfs.worker.js","sha":"$good_sha"},
{"type":"blob","path":"build/sqlite.worker.js","sha":"$good_sha"},
{"type":"tree","path":"build/_expo","sha":"ignored"},
{"type":"blob","path":"README.md","sha":"ignored"},
{"type":"blob","path":"build/$entry","sha":"$good_sha"}]}
JSON
cdn() { (PATH="$tmpdir/cdn:$PATH" CDN_POLL_INTERVAL=0 "$@"); }
expect_eq "tree keeps only build blobs, sorted and prefix stripped" \
	"$(printf '%s %s\n' "$good_sha" "$entry" "$good_sha" index.html "$good_sha" metadata.json "$good_sha" opfs.worker.js "$good_sha" sqlite.worker.js)" \
	"$(cdn expected_from_tree v1.11.1)"
for path in metadata.json index.html opfs.worker.js sqlite.worker.js; do
	expect_status "unhashed: $path" pass is_unhashed_path "$path"
done
for path in "$entry" _expo/static/js/web/entry-abc.js _expo/static/css/global-abc.css nested/opfs.worker.js; do
	expect_status "hashed: $path" fail is_unhashed_path "$path"
done
expect_status "matching bytes pass (bracket URL needs globoff)" pass cdn verify_cdn_path 1.11 "$entry" "$good_sha"
rm -f "$MOCK_COUNT"
MOCK_OK_AT=999 expect_status "HTTP 200 with a cached 429 body fails" fail cdn verify_cdn_path 1.11 "$entry" "$good_sha"
cp "$tmpdir/out" "$tmpdir/diagnosis"
expect_status "diagnosis includes cached error text" pass grep -q '429: Too Many Requests' "$tmpdir/diagnosis"
expect_status "diagnosis includes byte count" pass grep -q '22 bytes' "$tmpdir/diagnosis"
MOCK_HTTP=404 expect_status "404 fails even with matching bytes" fail cdn verify_cdn_path 1.11 "$entry" "$good_sha"
MOCK_EXIT=16 expect_status "transport failure fails even with matching bytes" fail cdn verify_cdn_path 1.11 "$entry" "$good_sha"
rm -f "$MOCK_COUNT" "$MOCK_LOG"
MOCK_OK_AT=3 expect_status "wrong twice then correct passes" pass cdn verify_cdn_paths 1.11 5 <<<"$good_sha $entry"
expect_eq "polling never purges (a re-purge extends jsDelivr's throttle)" 0 "$(grep -c 'purge.jsdelivr.net' "$MOCK_LOG" || true)"
rm -f "$MOCK_COUNT" "$MOCK_LOG"
MOCK_OK_AT=4 expect_status "verified paths are not fetched again" pass cdn verify_cdn_paths 1.11 5 \
	<<<"$(printf '%s ready.js\n%s %s' "$good_sha" "$good_sha" "$entry")"
expect_eq "ready path fetched only once" 1 "$(grep -c '/ready.js' "$MOCK_LOG")"
MOCK_OK_AT=999 expect_status "wrong path fails at deadline" fail cdn verify_cdn_paths 1.11 0 <<<"$good_sha $entry"
expect_eq "deadline failure names remaining path" 1 "$(grep -Fc "FAIL: @1.11/build/$entry" "$tmpdir/out")"
expect_status "empty inventory cannot pass" fail cdn verify_cdn_paths 1.11 0 </dev/null
MOCK_GH_EXIT=1 expect_status "tree API error cannot pass" fail cdn expected_from_tree v1.11.1
sed 's/"truncated":false/"truncated":true/' "$MOCK_TREE" > "$tmpdir/truncated-tree"
MOCK_TREE="$tmpdir/truncated-tree" expect_status "truncated tree cannot pass" fail cdn expected_from_tree v1.11.1
# Unhashed deadline 2, not 1: SECONDS ticks on wall-clock seconds, so a 1 s deadline can expire mid-pass.
phase() { (CDN_HASHED_DEADLINE_SECONDS=0; CDN_UNHASHED_DEADLINE_SECONDS=2; CDN_VERIFY_SECONDS=0; verify_lane_live 1.11 v1.11.1); }
rm -f "$MOCK_COUNT" "$MOCK_LOG"
MOCK_OK_AT=999 expect_status "phase A fails on cached error body" fail cdn phase
expect_eq "phase A never purges metadata" 0 "$(grep -c 'purge.jsdelivr.net.*/metadata.json' "$MOCK_LOG" || true)"
expect_status "both phases verify successfully" pass cdn phase
expect_eq "LIVE includes all verified counts" 1 "$(grep -c '1 hashed files and 4 unhashed files' "$tmpdir/out")"
expect_eq "phase B purges metadata" 1 "$(grep -c 'purge.jsdelivr.net.*/metadata.json' "$MOCK_LOG")"
for path in index.html opfs.worker.js sqlite.worker.js; do
	expect_eq "phase B purges $path" 1 "$(grep -c "purge.jsdelivr.net.*/$path" "$MOCK_LOG")"
done
MOCK_BAD_PATH=metadata.json expect_status "wrong unhashed bytes fail phase B" fail cdn phase
MOCK_VERSION=1.11.0 expect_status "matching bytes but stale version fails phase B" fail cdn phase
expect_status "library can run standalone" pass cdn bash "$SCRIPT_DIR/cdn-verify.sh" 1.11 0 <<<"$good_sha $entry"

# --- purge throttling: logged, recorded, and named on failure ---
throttled_body() { printf '{"id":"x","status":"finished","paths":{"/gh/wcpos/web-bundle@1.11/build/%s":{"throttled":true,"throttlingReset":%s}}}' "$1" "$2"; }
# Run under $(...): the throttle globals start fresh for each call.
purge_state() { for b in "$@"; do MOCK_PURGE_BODY="$b" PATH="$tmpdir/cdn:$PATH" purge_cdn_path 1.11 metadata.json; done
	echo "state ${CDN_PURGE_THROTTLED:-none} ${CDN_PURGE_THROTTLE_RESET}"; }
out=$(purge_state "$(throttled_body metadata.json 100)" "$(throttled_body metadata.json 2861)" "$(throttled_body metadata.json 50)")
expect_eq "a throttled purge is logged as THROTTLED" 1 "$(grep -c 'metadata.json -> HTTP 200, THROTTLED (reset in 2861s)' <<<"$out")"
expect_eq "a throttled purge records the largest reset" "state 1 2861" "$(tail -1 <<<"$out")"
out=$(purge_state '{"status":"finished","paths":{"/gh/wcpos/web-bundle@1.11/build/metadata.json":{"throttled":false,"providers":{"CF":true}}}}')
expect_eq "an accepted purge is logged and leaves no throttle" "$(printf 'purge @1.11/build/metadata.json -> HTTP 200, accepted\nstate none 0')" "$out"
out=$(purge_state 'not json' '{"paths":{}}')
expect_eq "an unreadable purge body is unknown, not throttled" 2 "$(grep -c -- '-> HTTP 200, unknown' <<<"$out")"
expect_eq "and leaves no throttle" "state none 0" "$(tail -1 <<<"$out")"
rm -f "$MOCK_COUNT" "$MOCK_LOG"
MOCK_PURGE_BODY="$(throttled_body metadata.json 2861)" MOCK_BAD_PATH=metadata.json expect_status "throttled phase B fails" fail cdn phase
expect_eq "each unhashed path is purged once, never while polling" 4 "$(grep -c 'purge.jsdelivr.net.*/build/' "$MOCK_LOG")"
expect_eq "the failure names the throttle and when it resets" 1 "$(grep -c 'jsDelivr throttled the purge.*resets in about 48 min' "$tmpdir/out")"
expect_eq "and does not say re-run to retry" 0 "$(grep -ci 're-run this command' "$tmpdir/out" || true)"
MOCK_BAD_PATH=metadata.json expect_status "unthrottled phase B fails" fail cdn phase
expect_eq "the failure says jsDelivr did not refresh" 1 "$(grep -c 'IS published as v1.11.1, but jsDelivr did not refresh within the deadline' "$tmpdir/out")"
expect_eq "and does not claim a throttle" 0 "$(grep -c 'throttled' "$tmpdir/out" || true)"

# --- tag_action ---
all=$'v1.10.40\nv1.11.0\nv1.11.1'
expect_eq "untagged commit: create the next tag" "create v1.11.2" "$(tag_action 1.11 "" <<<"$all")"
expect_eq "commit holds the lane's newest tag: resume" "resume v1.11.1" "$(tag_action 1.11 v1.11.1 <<<"$all")"
expect_status "commit holds an older tag: refuse" fail tag_action 1.11 v1.11.0 <<<"$all"
expect_status "commit holds another lane's tag: refuse" fail tag_action 1.11 v1.10.40 <<<"$all"

# --- --dry-run end to end ---
cat > "$tmpdir/gh" <<'MOCK'
#!/usr/bin/env bash
args="$*"
case "$args" in
	*"git/refs"*) echo "dry run must not create a ref" >&2; exit 99 ;;
	*"repos/wcpos/web-bundle/commits/"*" --jq .sha") echo bundlesha0000000000000000000000000000000 ;;
	*"repos/wcpos/web-bundle/commits/"*" --jq .commit.message") printf '%s\n' "$MOCK_MSG" ;;
	*"repos/wcpos/monorepo/contents/package.json?ref="*)
		printf '{"dependencies":{"rxdb":"%s"}}\n' "${MOCK_PIN:-${MOCK_RXDB_bundlesha0000000000000000000000000000000:-}}" ;;
	*"repos/wcpos/monorepo/contents/apps/main/package.json"*) printf '{"version":"%s"}\n' "$MOCK_VERSION" ;;
	*"/tags --jq .[] | select"*) printf '%s\n' "${MOCK_TAGGED_AS:-}" ;;
	*"/tags"*) printf '%s\n' "$MOCK_TAGS" ;;
	*"contents/build/opfs.worker.js?ref="*)
		ref="${args##*ref=}"; ref="${ref%% *}"
		v="MOCK_RXDB_${ref//[.-]/_}"; printf 'var Ze="%s";' "${!v:-}" ;;
	*) echo "unexpected gh $args" >&2; exit 64 ;;
esac
MOCK
chmod +x "$tmpdir/gh"
run() { env PATH="$tmpdir:$PATH" MOCK_MSG="chore(release): build web bundle (@main from monorepo $msha)" "$@"; }
tags=$'v1.10.40\nv1.11.0\nv1.11.1'

expect_status "dry run on the newest lane passes" pass run MOCK_VERSION=1.11.2 MOCK_TAGS="$tags" \
	MOCK_RXDB_bundlesha0000000000000000000000000000000=17.6.0 MOCK_RXDB_v1_11_1=17.6.0 "$TAG" bundlesha --dry-run
expect_eq "dry run prints the next patch tag" 1 "$(grep -c 'would tag v1.11.2 at bundlesha' "$tmpdir/out")"
expect_status "dry run refuses an RXDB_VERSION change on a tagged lane" fail run MOCK_VERSION=1.11.2 MOCK_TAGS="$tags" \
	MOCK_RXDB_bundlesha0000000000000000000000000000000=17.7.0 MOCK_RXDB_v1_11_1=17.6.0 "$TAG" bundlesha --dry-run
expect_status "dry run refuses a frozen lane" fail run MOCK_VERSION=1.10.32 MOCK_TAGS="$tags" \
	MOCK_RXDB_bundlesha0000000000000000000000000000000=17.4.0 MOCK_RXDB_v1_10_40=17.4.0 "$TAG" bundlesha --dry-run
expect_status "dry run on a new lane passes" pass run MOCK_VERSION=1.12.0 MOCK_TAGS="$tags" \
	MOCK_RXDB_bundlesha0000000000000000000000000000000=17.7.0 "$TAG" bundlesha --dry-run
expect_eq "new lane starts at .0" 1 "$(grep -c 'would tag v1.12.0 at' "$tmpdir/out")"
expect_status "refuses a commit that carries an older tag" fail run MOCK_VERSION=1.11.1 MOCK_TAGS="$tags" MOCK_TAGGED_AS=v1.11.0 \
	MOCK_RXDB_bundlesha0000000000000000000000000000000=17.6.0 MOCK_RXDB_v1_11_1=17.6.0 "$TAG" bundlesha --dry-run

expect_status "a commit holding the lane's newest tag resumes" pass run MOCK_VERSION=1.11.1 MOCK_TAGS="$tags" MOCK_TAGGED_AS=v1.11.1 \
	MOCK_RXDB_bundlesha0000000000000000000000000000000=17.6.0 MOCK_RXDB_v1_11_1=17.6.0 "$TAG" bundlesha --dry-run
expect_eq "and says it would resume" 1 "$(grep -c 'already v1.11.1; would resume' "$tmpdir/out")"

expect_status "a stale worker (rxdb bumped, worker not rebuilt) is refused" fail run MOCK_VERSION=1.11.2 MOCK_TAGS="$tags" MOCK_PIN=17.7.0 \
	MOCK_RXDB_bundlesha0000000000000000000000000000000=17.6.0 MOCK_RXDB_v1_11_1=17.6.0 "$TAG" bundlesha --dry-run
expect_eq "and says to rebuild the worker" 1 "$(grep -c 'rebuild the worker' "$tmpdir/out")"

if [[ $failures -gt 0 ]]; then echo "$failures tag-web-bundle test(s) failed" >&2; exit 1; fi
echo "All tag-web-bundle tests passed."
