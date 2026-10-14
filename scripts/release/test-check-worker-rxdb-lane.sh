#!/usr/bin/env bash
# Tests for check-worker-rxdb-lane.sh. No network: `gh` is a mock on PATH.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CHECK="$SCRIPT_DIR/check-worker-rxdb-lane.sh"
REAL_WORKER="$SCRIPT_DIR/../../apps/main/public/sqlite.worker.js"
# shellcheck source=check-worker-rxdb-lane.sh
source "$CHECK"

tmpdir="$(mktemp -d)"
trap 'rm -rf "$tmpdir"' EXIT
failures=0

expect_eq() { # name, expected, actual
	if [[ "$2" == "$3" ]]; then echo "ok - $1"; else echo "not ok - $1: expected '$2', got '$3'"; failures=$((failures + 1)); fi
}
expect_status() { # name, pass|fail, command...
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

# Minified shape, as shipped (core + premium each inline one copy).
minified() { printf 'var Wn={bufferSize:1};var Ze="%s";var jn=new WeakMap;throw z("CI2")}var Pt="%s";var Is=!0;' "$1" "${2:-$1}"; }
minified 17.4.0 > "$tmpdir/w-174.js"
minified 17.6.0 > "$tmpdir/w-176.js"

# --- worker_rxdb_version ---
expect_eq "reads the minified version" 17.4.0 "$(worker_rxdb_version < "$tmpdir/w-174.js")"
expect_eq "reads the unminified RXDB_VERSION" 17.6.0 "$(printf "const RXDB_VERSION = '17.6.0';\n" | worker_rxdb_version)"
expect_status "no version fails closed" fail worker_rxdb_version < <(printf 'var a=1;')
expect_eq "reads a declaration list (the indexeddb worker's shape)" 16.21.1 "$(printf 'new WeakMap;var Ut="16.21.1",Wt="16.21.1";function' | worker_rxdb_version)"
expect_status "a declaration list with two versions fails closed" fail worker_rxdb_version < <(printf 'var Ut="16.21.1",Wt="17.6.0";')
expect_status "two distinct versions fail closed" fail worker_rxdb_version < <(minified 17.4.0 17.6.0)
if [[ -f "$REAL_WORKER" ]]; then
	expect_status "reads exactly one version from the repo's real worker" pass worker_rxdb_version < "$REAL_WORKER"
fi

# --- pinned_rxdb ---
expect_eq "reads an exact rxdb pin" 17.6.0 "$(pinned_rxdb <<<'{"dependencies":{"rxdb":"17.6.0"}}')"
expect_status "a range is not a pin" fail pinned_rxdb <<<'{"dependencies":{"rxdb":"^17.6.0"}}'
expect_status "no rxdb fails closed" fail pinned_rxdb <<<'{"dependencies":{}}'
expect_eq "the repo's root package.json pins rxdb" 1 "$(pinned_rxdb < "$SCRIPT_DIR/../../package.json" | grep -cE '^[0-9]+\.[0-9]+\.[0-9]+$')"

# --- lane_of_version ---
expect_eq "lane of 1.10.31" 1.10 "$(lane_of_version 1.10.31)"
expect_status "lane of 1.10 fails closed" fail lane_of_version 1.10
expect_status "lane of 1.11.0-beta.1 fails closed" fail lane_of_version 1.11.0-beta.1

# --- tag arithmetic ---
tags=$'v1.9.7\nv1.10.9\nv1.10.40\nv1.10.39\nv1.11.0\nv1.11.1\nv1.100.2\nnot-a-tag'
expect_eq "highest patch is numeric, not lexical" 40 "$(highest_patch_on_lane 1.10 <<<"$tags")"
expect_eq "no tags on a new lane" "" "$(highest_patch_on_lane 1.12 <<<"$tags")"
expect_eq "next tag on a lane" v1.11.2 "$(next_tag 1.11 <<<"$tags")"
expect_eq "next tag on a new lane" v2.0.0 "$(next_tag 2.0 <<<"$tags")"
expect_eq "lane dot is literal (1.1 does not match 1.10)" v1.1.0 "$(next_tag 1.1 <<<"$tags")"
expect_eq "higher lanes above 1.10" $'1.11\n1.100' "$(higher_lanes 1.10 <<<"$tags")"
expect_eq "no higher lane above 1.100" "" "$(higher_lanes 1.100 <<<"$tags")"
expect_eq "major outranks minor" "" "$(higher_lanes 2.0 <<<"$tags")"

# --- end to end with a mocked gh ---
# A tag's build/ is the directory $MOCK_DIR/tag-<tag>; MOCK_LIST_FAIL breaks the listing.
cat > "$tmpdir/gh" <<'MOCK'
#!/usr/bin/env bash
args="$*"
ref="${args##*ref=}"; ref="${ref%% *}"
case "$args" in
	*"/tags"*) printf '%s\n' "$MOCK_TAGS" ;;
	*"contents/build?ref="*)
		[[ -z "${MOCK_LIST_FAIL:-}" && -d "$MOCK_DIR/tag-$ref" ]] || exit 1
		ls "$MOCK_DIR/tag-$ref"; echo metadata.json ;;
	*"contents/build/"*"?ref="*)
		name="${args##*contents/build/}"; name="${name%%\?*}"
		cat "$MOCK_DIR/tag-$ref/$name" 2>/dev/null || { echo '{"message":"Not Found"}'; exit 1; } ;;
	*) echo "unexpected gh $args" >&2; exit 64 ;;
esac
MOCK
chmod +x "$tmpdir/gh"
# bundle <dir> <name>=<rxdb>...: a build directory holding those workers.
bundle() {
	local d="$tmpdir/$1" spec
	shift
	mkdir -p "$d"
	for spec in "$@"; do minified "${spec#*=}" > "$d/${spec%%=*}"; done
}
bundle tag-v1.10.40 opfs.worker.js=17.4.0 indexeddb.worker.js=16.21.1
bundle tag-v1.11.1 opfs.worker.js=17.6.0 indexeddb.worker.js=16.21.1
bundle tag-v2.0.3 sqlite.worker.js=17.6.0 indexeddb.worker.js=16.21.1
bundle b-110-incident opfs.worker.js=17.6.0 indexeddb.worker.js=16.21.1
bundle b-110-same opfs.worker.js=17.4.0 indexeddb.worker.js=16.21.1
bundle b-111 opfs.worker.js=17.6.0 indexeddb.worker.js=16.21.1
bundle b-20-same sqlite.worker.js=17.6.0 indexeddb.worker.js=16.21.1
bundle b-20-sqlite-moved sqlite.worker.js=17.7.0 indexeddb.worker.js=16.21.1
bundle b-20-idb-moved sqlite.worker.js=17.6.0 indexeddb.worker.js=17.6.0
bundle b-20-both-moved sqlite.worker.js=17.7.0 indexeddb.worker.js=17.6.0
bundle b-20-idb-dropped sqlite.worker.js=17.6.0
bundle b-20-opfs-added opfs.worker.js=17.6.0 sqlite.worker.js=17.6.0 indexeddb.worker.js=16.21.1
bundle b-empty
run() { env PATH="$tmpdir:$PATH" MOCK_DIR="$tmpdir" "$@"; }
lane110=$'v1.10.39\nv1.10.40'
both=$'v1.10.40\nv1.11.0\nv1.11.1'
lane20=$'v1.10.40\nv1.11.1\nv2.0.2\nv2.0.3'

# The 2026-10-14 incident: a 17.6.0 OPFS worker onto the 17.4.0 lane.
expect_status "17.6.0 worker on a 17.4.0 lane fails" fail run MOCK_TAGS="$lane110" "$CHECK" "$tmpdir/b-110-incident" 1.10.31 --allow-frozen-lane
expect_eq "the failure names the worker, both versions and the tag" 1 "$(grep -c 'opfs.worker.js RXDB_VERSION 17.6.0 != 17.4.0 on v1.10.40' "$tmpdir/out")"
expect_status "equal versions pass" pass run MOCK_TAGS="$lane110" "$CHECK" "$tmpdir/b-110-same" 1.10.31
expect_status "new lane passes" pass run MOCK_TAGS="$lane110" "$CHECK" "$tmpdir/b-111" 1.11.0
expect_eq "new lane says so for each worker" 2 "$(grep -c 'new lane 1.11' "$tmpdir/out")"
expect_status "frozen lane fails even with equal versions" fail run MOCK_TAGS="$both" "$CHECK" "$tmpdir/b-110-same" 1.10.31
expect_status "frozen lane passes with --allow-frozen-lane" pass run MOCK_TAGS="$both" "$CHECK" "$tmpdir/b-110-same" 1.10.31 --allow-frozen-lane
expect_status "--allow-frozen-lane still enforces RXDB_VERSION" fail run MOCK_TAGS="$both" "$CHECK" "$tmpdir/b-110-incident" 1.10.31 --allow-frozen-lane
expect_status "newest lane with equal versions passes" pass run MOCK_TAGS="$both" "$CHECK" "$tmpdir/b-111" 1.11.1

# 2.x: the plugin vendors sqlite.worker.js and indexeddb.worker.js.
expect_status "2.x: sqlite and indexeddb equal to the lane pass" pass run MOCK_TAGS="$lane20" "$CHECK" "$tmpdir/b-20-same" 2.0.4
expect_eq "and both are compared" 2 "$(grep -c 'matches v2.0.3 on lane 2.0' "$tmpdir/out")"
expect_eq "a worker absent on both sides (opfs) is skipped" 0 "$(grep -c 'opfs' "$tmpdir/out")"
expect_status "2.x: sqlite RXDB_VERSION moved fails" fail run MOCK_TAGS="$lane20" "$CHECK" "$tmpdir/b-20-sqlite-moved" 2.0.4
expect_eq "naming sqlite.worker.js" 1 "$(grep -c 'sqlite.worker.js RXDB_VERSION 17.7.0 != 17.6.0 on v2.0.3' "$tmpdir/out")"
expect_status "2.x: indexeddb RXDB_VERSION moved fails" fail run MOCK_TAGS="$lane20" "$CHECK" "$tmpdir/b-20-idb-moved" 2.0.4
expect_eq "naming indexeddb.worker.js" 1 "$(grep -c 'indexeddb.worker.js RXDB_VERSION 17.6.0 != 16.21.1 on v2.0.3' "$tmpdir/out")"
expect_status "2.x: two moved workers fail" fail run MOCK_TAGS="$lane20" "$CHECK" "$tmpdir/b-20-both-moved" 2.0.4
expect_eq "and both are reported" 2 "$(grep -c ' != ' "$tmpdir/out")"
expect_status "a worker the lane's tag carries but the bundle dropped fails" fail run MOCK_TAGS="$lane20" "$CHECK" "$tmpdir/b-20-idb-dropped" 2.0.4
expect_eq "naming the dropped worker" 1 "$(grep -c 'indexeddb.worker.js is in v2.0.3 but not in this bundle' "$tmpdir/out")"
expect_status "a worker the bundle added on a tagged lane fails" fail run MOCK_TAGS="$lane20" "$CHECK" "$tmpdir/b-20-opfs-added" 2.0.4
expect_eq "naming the added worker" 1 "$(grep -c 'opfs.worker.js is in this bundle but not in v2.0.3' "$tmpdir/out")"
expect_status "a failed listing of the tag's build/ fails closed" fail run MOCK_TAGS="$lane20" MOCK_LIST_FAIL=1 "$CHECK" "$tmpdir/b-20-same" 2.0.4

expect_status "no vendored worker fails closed" fail run MOCK_TAGS="$lane110" "$CHECK" "$tmpdir/b-empty" 1.10.31
expect_status "no vendored worker passes with --worker-optional" pass run MOCK_TAGS="$lane110" "$CHECK" "$tmpdir/b-empty" 1.10.31 --worker-optional
expect_status "--worker-optional keeps the frozen-lane refusal" fail run MOCK_TAGS="$both" "$CHECK" "$tmpdir/b-empty" 1.10.31 --worker-optional
expect_status "a missing build directory fails closed" fail run MOCK_TAGS="$lane110" "$CHECK" "$tmpdir/absent" 1.10.31 --worker-optional
expect_status "unreadable lane worker fails closed" fail run MOCK_TAGS=$'v1.12.0' "$CHECK" "$tmpdir/b-111" 1.12.3
expect_status "bad app version fails closed" fail run MOCK_TAGS="$lane110" "$CHECK" "$tmpdir/b-110-same" 1.10

# --bundle-rxdb covers the workers built from the monorepo's rxdb, not the pinned legacy indexeddb.
expect_status "built workers matching the bundle's rxdb pass (legacy indexeddb ignored)" pass run MOCK_TAGS="$lane20" "$CHECK" "$tmpdir/b-20-same" 2.0.4 --bundle-rxdb 17.6.0
expect_status "rxdb bumped but sqlite worker not rebuilt fails" fail run MOCK_TAGS="$lane20" "$CHECK" "$tmpdir/b-20-same" 2.0.4 --bundle-rxdb 17.7.0
expect_eq "and says to rebuild the worker" 1 "$(grep -c 'sqlite.worker.js RXDB_VERSION 17.6.0 != the bundle.s rxdb 17.7.0; rebuild' "$tmpdir/out")"
expect_status "rxdb bumped but opfs worker not rebuilt fails" fail run MOCK_TAGS="$lane110" "$CHECK" "$tmpdir/b-110-same" 1.10.31 --bundle-rxdb 17.6.0

if [[ $failures -gt 0 ]]; then echo "$failures check-worker-rxdb-lane test(s) failed" >&2; exit 1; fi
echo "All check-worker-rxdb-lane tests passed."
