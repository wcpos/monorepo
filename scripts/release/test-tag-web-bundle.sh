#!/usr/bin/env bash
# Tests for tag-web-bundle.sh. No network: `gh` is a mock on PATH; only --dry-run runs end to end.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TAG="$SCRIPT_DIR/tag-web-bundle.sh"
# shellcheck source=tag-web-bundle.sh
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
		printf '{"dependencies":{"rxdb":"%s"}}\n' "${MOCK_PIN:-${MOCK_RXDB_bundlesha0000000000000000000000000000000:-17.6.0}}" ;;
	*"repos/wcpos/monorepo/contents/apps/main/package.json"*) printf '{"version":"%s"}\n' "$MOCK_VERSION" ;;
	*"/tags --jq .[] | select"*) printf '%s\n' "${MOCK_TAGGED_AS:-}" ;;
	*"contents/build?ref="*)
		[[ -z "${MOCK_LIST_FAIL:-}" ]] || exit 1
		[[ -n "${MOCK_NO_WORKER:-}" ]] || echo opfs.worker.js; echo metadata.json ;;
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

expect_status "a bundle with no OPFS worker passes vacuously" pass run MOCK_VERSION=2.0.0 MOCK_TAGS="$tags" MOCK_NO_WORKER=1 "$TAG" bundlesha --dry-run
expect_eq "and still names the tag" 1 "$(grep -c 'would tag v2.0.0 at' "$tmpdir/out")"
expect_status "a bundle with no OPFS worker is still refused on a frozen lane" fail run MOCK_VERSION=1.10.32 MOCK_TAGS="$tags" MOCK_NO_WORKER=1 "$TAG" bundlesha --dry-run
expect_status "a failed build/ listing fails closed, never reads as no worker" fail run MOCK_VERSION=1.11.2 MOCK_TAGS="$tags" MOCK_LIST_FAIL=1 "$TAG" bundlesha --dry-run

expect_status "a stale worker (rxdb bumped, worker not rebuilt) is refused" fail run MOCK_VERSION=1.11.2 MOCK_TAGS="$tags" MOCK_PIN=17.7.0 \
	MOCK_RXDB_bundlesha0000000000000000000000000000000=17.6.0 MOCK_RXDB_v1_11_1=17.6.0 "$TAG" bundlesha --dry-run
expect_eq "and says to rebuild the worker" 1 "$(grep -c 'rebuild the worker' "$tmpdir/out")"

if [[ $failures -gt 0 ]]; then echo "$failures tag-web-bundle test(s) failed" >&2; exit 1; fi
echo "All tag-web-bundle tests passed."
