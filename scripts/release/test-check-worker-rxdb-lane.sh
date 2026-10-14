#!/usr/bin/env bash
# Tests for check-worker-rxdb-lane.sh. No network: `gh` is a mock on PATH.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CHECK="$SCRIPT_DIR/check-worker-rxdb-lane.sh"
REAL_WORKER="$SCRIPT_DIR/../../apps/main/public/opfs.worker.js"
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
expect_status "two distinct versions fail closed" fail worker_rxdb_version < <(minified 17.4.0 17.6.0)
if [[ -f "$REAL_WORKER" ]]; then
	expect_status "reads exactly one version from the repo's real worker" pass worker_rxdb_version < "$REAL_WORKER"
fi

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
cat > "$tmpdir/gh" <<'MOCK'
#!/usr/bin/env bash
case "$*" in
	*"/tags"*) printf '%s\n' "$MOCK_TAGS" ;;
	*"contents/build/opfs.worker.js?ref="*)
		args="$*"; ref="${args##*ref=}"; ref="${ref%% *}"
		f="$MOCK_DIR/worker-$ref.js"
		[[ -f "$f" ]] && cat "$f" || { echo '{"message":"Not Found"}'; exit 1; } ;;
	*) echo "unexpected gh $*" >&2; exit 64 ;;
esac
MOCK
chmod +x "$tmpdir/gh"
cp "$tmpdir/w-174.js" "$tmpdir/worker-v1.10.40.js"
cp "$tmpdir/w-176.js" "$tmpdir/worker-v1.11.1.js"
run() { env PATH="$tmpdir:$PATH" MOCK_DIR="$tmpdir" "$@"; }
lane110=$'v1.10.39\nv1.10.40'
both=$'v1.10.40\nv1.11.0\nv1.11.1'

# The 2026-10-14 incident: a 17.6.0 worker onto the 17.4.0 lane.
expect_status "17.6.0 worker on a 17.4.0 lane fails" fail run MOCK_TAGS="$lane110" "$CHECK" "$tmpdir/w-176.js" 1.10.31
expect_eq "the failure names both versions and the tag" 1 "$(grep -c '17.6.0 != 17.4.0 on v1.10.40' "$tmpdir/out")"
expect_status "equal versions pass" pass run MOCK_TAGS="$lane110" "$CHECK" "$tmpdir/w-174.js" 1.10.31
expect_status "new lane passes" pass run MOCK_TAGS="$lane110" "$CHECK" "$tmpdir/w-176.js" 1.11.0
expect_eq "new lane says so" 1 "$(grep -c 'new lane 1.11' "$tmpdir/out")"
expect_status "frozen lane fails even with equal versions" fail run MOCK_TAGS="$both" "$CHECK" "$tmpdir/w-174.js" 1.10.31
expect_status "frozen lane passes with --allow-frozen-lane" pass run MOCK_TAGS="$both" "$CHECK" "$tmpdir/w-174.js" 1.10.31 --allow-frozen-lane
expect_status "--allow-frozen-lane still enforces RXDB_VERSION" fail run MOCK_TAGS="$both" "$CHECK" "$tmpdir/w-176.js" 1.10.31 --allow-frozen-lane
expect_status "newest lane with equal versions passes" pass run MOCK_TAGS="$both" "$CHECK" "$tmpdir/w-176.js" 1.11.1
expect_status "missing worker fails closed" fail run MOCK_TAGS="$lane110" "$CHECK" "$tmpdir/absent.js" 1.10.31
expect_status "missing worker passes with --worker-optional" pass run MOCK_TAGS="$lane110" "$CHECK" "$tmpdir/absent.js" 1.10.31 --worker-optional
expect_status "--worker-optional keeps the frozen-lane refusal" fail run MOCK_TAGS="$both" "$CHECK" "$tmpdir/absent.js" 1.10.31 --worker-optional
expect_status "unreadable lane worker fails closed" fail run MOCK_TAGS=$'v1.12.0' "$CHECK" "$tmpdir/w-176.js" 1.12.3
expect_status "bad app version fails closed" fail run MOCK_TAGS="$lane110" "$CHECK" "$tmpdir/w-174.js" 1.10

expect_status "worker matching the bundle's rxdb passes" pass run MOCK_TAGS="$lane110" "$CHECK" "$tmpdir/w-174.js" 1.10.31 --bundle-rxdb 17.4.0
expect_status "rxdb bumped but worker not rebuilt fails" fail run MOCK_TAGS="$lane110" "$CHECK" "$tmpdir/w-174.js" 1.10.31 --bundle-rxdb 17.6.0
expect_eq "and says to rebuild the worker" 1 "$(grep -c 'rebuild the worker' "$tmpdir/out")"

if [[ $failures -gt 0 ]]; then echo "$failures check-worker-rxdb-lane test(s) failed" >&2; exit 1; fi
echo "All check-worker-rxdb-lane tests passed."
