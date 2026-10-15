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
	*purge.jsdelivr.net*) printf '{}' > "$body"; printf 200 ;;
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
cat > "$tmpdir/gh" <<'MOCK'
#!/usr/bin/env bash
args="$*"
ref="${args##*ref=}"; ref="${ref%% *}"
case "$args" in
	'api repos/wcpos/web-bundle/git/trees/v1.11.1?recursive=1') cat "$MOCK_TREE"; exit "${MOCK_GH_EXIT:-0}" ;;
	*"git/refs"*) echo "dry run must not create a ref" >&2; exit 99 ;;
	*"repos/wcpos/web-bundle/commits/"*" --jq .sha") echo bundlesha ;;
	*"repos/wcpos/web-bundle/commits/"*" --jq .commit.message") printf '%s\n' "$MOCK_MSG" ;;
	*"repos/wcpos/monorepo/contents/package.json?ref="*) printf '{"dependencies":{"rxdb":"%s"}}\n' "$MOCK_PIN" ;;
	*"repos/wcpos/monorepo/contents/apps/main/package.json"*) printf '{"version":"%s"}\n' "$MOCK_VERSION" ;;
	*"/tags --jq .[] | select"*) printf '%s\n' "${MOCK_TAGGED_AS:-}" ;;
	*"/tags"*) printf '%s\n' "$MOCK_TAGS" ;;
	*"contents/build?ref="*)
		[[ "${MOCK_LIST_FAIL:-}" != "$ref" && -d "$MOCK_DIR/ref-$ref" ]] || exit 1
		ls "$MOCK_DIR/ref-$ref"; echo metadata.json ;;
	*"contents/build/"*"?ref="*)
		name="${args##*contents/build/}"; name="${name%%\?*}"
		cat "$MOCK_DIR/ref-$ref/$name" 2>/dev/null || { echo '{"message":"Not Found"}'; exit 1; } ;;
	*) echo "unexpected gh $args" >&2; exit 64 ;;
esac
MOCK
chmod +x "$tmpdir/gh"
export MOCK_COUNT="$tmpdir/count" MOCK_LOG="$tmpdir/requests" MOCK_TREE="$tmpdir/tree"
good_sha=$(printf good | git hash-object --stdin)
entry='_expo/static/js/web/[orderId]-abc.js'
cdn() { (PATH="$tmpdir/cdn:$tmpdir:$PATH" CDN_POLL_INTERVAL=0 "$@"); }
expect_eq "version lookup disables URL globbing" 1.11.1 "$(cdn cdn_version 1.11 "$entry")"
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
expect_eq "exact failing path purged twice" \
	"$(printf 'https://purge.jsdelivr.net/gh/wcpos/web-bundle@1.11/build/%s\n' "$entry" "$entry")" \
	"$(grep 'purge.jsdelivr.net' "$MOCK_LOG")"
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
phase() { (CDN_HASHED_DEADLINE_SECONDS=0; CDN_UNHASHED_DEADLINE_SECONDS=5; CDN_VERIFY_SECONDS=0; verify_lane_live 1.11 v1.11.1); }
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

# --- tag_action ---
all=$'v1.10.40\nv1.11.0\nv1.11.1'
expect_eq "untagged commit: create the next tag" "create v1.11.2" "$(tag_action 1.11 "" <<<"$all")"
expect_eq "commit holds the lane's newest tag: resume" "resume v1.11.1" "$(tag_action 1.11 v1.11.1 <<<"$all")"
expect_status "commit holds an older tag: refuse" fail tag_action 1.11 v1.11.0 <<<"$all"
expect_status "commit holds another lane's tag: refuse" fail tag_action 1.11 v1.10.40 <<<"$all"

# --- --dry-run end to end ---
# A ref's build/ is the directory $MOCK_DIR/ref-<ref>; the bundle commit is `bundlesha`.
# at <ref> <name>=<rxdb>...: that ref's build/ holds exactly those workers.
at() {
	local d="$tmpdir/ref-$1" spec
	shift
	rm -rf "$d"; mkdir -p "$d"
	for spec in "$@"; do printf 'var Ze="%s";' "${spec#*=}" > "$d/${spec%%=*}"; done
}
run() { env PATH="$tmpdir:$PATH" MOCK_DIR="$tmpdir" MOCK_MSG="chore(release): build web bundle (@main from monorepo $msha)" "$@"; }
tags=$'v1.10.40\nv1.11.0\nv1.11.1'
tags20=$'v1.11.1\nv2.0.0'
at v1.10.40 opfs.worker.js=17.4.0 indexeddb.worker.js=16.21.1
at v1.11.1 opfs.worker.js=17.6.0 indexeddb.worker.js=16.21.1
at v2.0.0 sqlite.worker.js=17.6.0 indexeddb.worker.js=16.21.1

at bundlesha opfs.worker.js=17.6.0 indexeddb.worker.js=16.21.1
expect_status "dry run on the newest lane passes" pass run MOCK_VERSION=1.11.2 MOCK_TAGS="$tags" MOCK_PIN=17.6.0 "$TAG" bundlesha --dry-run
expect_eq "dry run prints the next patch tag" 1 "$(grep -c 'would tag v1.11.2 at bundlesha' "$tmpdir/out")"
expect_status "refuses a commit that carries an older tag" fail run MOCK_VERSION=1.11.1 MOCK_TAGS="$tags" MOCK_PIN=17.6.0 MOCK_TAGGED_AS=v1.11.0 "$TAG" bundlesha --dry-run
expect_status "a commit holding the lane's newest tag resumes" pass run MOCK_VERSION=1.11.1 MOCK_TAGS="$tags" MOCK_PIN=17.6.0 MOCK_TAGGED_AS=v1.11.1 "$TAG" bundlesha --dry-run
expect_eq "and says it would resume" 1 "$(grep -c 'already v1.11.1; would resume' "$tmpdir/out")"
expect_status "a stale worker (rxdb bumped, worker not rebuilt) is refused" fail run MOCK_VERSION=1.11.2 MOCK_TAGS="$tags" MOCK_PIN=17.7.0 "$TAG" bundlesha --dry-run
expect_eq "and says to rebuild the worker" 1 "$(grep -c 'rebuild the worker' "$tmpdir/out")"
expect_status "a failed build/ listing of the bundle fails closed" fail run MOCK_VERSION=1.11.2 MOCK_TAGS="$tags" MOCK_PIN=17.6.0 MOCK_LIST_FAIL=bundlesha "$TAG" bundlesha --dry-run

at bundlesha opfs.worker.js=17.7.0 indexeddb.worker.js=16.21.1
expect_status "dry run refuses an RXDB_VERSION change on a tagged lane" fail run MOCK_VERSION=1.11.2 MOCK_TAGS="$tags" MOCK_PIN=17.7.0 "$TAG" bundlesha --dry-run
expect_status "dry run on a new lane passes" pass run MOCK_VERSION=1.12.0 MOCK_TAGS="$tags" MOCK_PIN=17.7.0 "$TAG" bundlesha --dry-run
expect_eq "new lane starts at .0" 1 "$(grep -c 'would tag v1.12.0 at' "$tmpdir/out")"

at bundlesha opfs.worker.js=17.4.0 indexeddb.worker.js=16.21.1
expect_status "dry run refuses a frozen lane" fail run MOCK_VERSION=1.10.32 MOCK_TAGS="$tags" MOCK_PIN=17.4.0 "$TAG" bundlesha --dry-run

# 2.x: the bundle carries sqlite + indexeddb and no OPFS worker.
at bundlesha sqlite.worker.js=17.6.0 indexeddb.worker.js=16.21.1
expect_status "2.x bundle matching its lane passes (no OPFS worker on either side)" pass run MOCK_VERSION=2.0.1 MOCK_TAGS="$tags20" MOCK_PIN=17.6.0 "$TAG" bundlesha --dry-run
expect_eq "and checks both of its workers" 2 "$(grep -c 'matches v2.0.0 on lane 2.0' "$tmpdir/out")"
expect_status "2.x bundle is still refused on a frozen lane" fail run MOCK_VERSION=1.11.2 MOCK_TAGS="$tags20" MOCK_PIN=17.6.0 "$TAG" bundlesha --dry-run
at bundlesha sqlite.worker.js=17.7.0 indexeddb.worker.js=16.21.1
expect_status "2.x: a moved sqlite worker is refused" fail run MOCK_VERSION=2.0.1 MOCK_TAGS="$tags20" MOCK_PIN=17.7.0 "$TAG" bundlesha --dry-run
at bundlesha sqlite.worker.js=17.6.0 indexeddb.worker.js=17.6.0
expect_status "2.x: a moved indexeddb worker is refused" fail run MOCK_VERSION=2.0.1 MOCK_TAGS="$tags20" MOCK_PIN=17.6.0 "$TAG" bundlesha --dry-run
at bundlesha sqlite.worker.js=17.6.0
expect_status "2.x: a dropped indexeddb worker is refused" fail run MOCK_VERSION=2.0.1 MOCK_TAGS="$tags20" MOCK_PIN=17.6.0 "$TAG" bundlesha --dry-run
at bundlesha
expect_status "a bundle with no vendored worker is refused" fail run MOCK_VERSION=2.1.0 MOCK_TAGS="$tags20" MOCK_PIN=17.6.0 "$TAG" bundlesha --dry-run

if [[ $failures -gt 0 ]]; then echo "$failures tag-web-bundle test(s) failed" >&2; exit 1; fi
echo "All tag-web-bundle tests passed."
