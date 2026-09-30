#!/usr/bin/env bash
# Fill ~/e2e-store/plugins with the plugins the store runs:
#   - WooCommerce, latest stable from wordpress.org;
#   - woocommerce-pos and woocommerce-pos-pro, from each repo's newest `next`
#     CI `deployment-package` artefact: the same built bits dev-next runs.
#
# Read-only against GitHub (`gh api` GETs). Nothing is built here: no composer,
# no pnpm. A repo without a `next` deployment-package is reported and skipped,
# and seed.sh activates whatever is present, so re-running this script and then
# seed.sh later picks the plugin up without rebuilding the stack.
#
# The WordPress container mounts ~/e2e-store/plugins read-only, so replacing a
# plugin here takes effect on the next request (restart php to clear opcache).

# shellcheck source=lib.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

PLUGINS_DIR="$E2E_STORE_HOME/plugins"
ARTIFACTS_DIR="$E2E_STORE_HOME/artifacts"
# The CI artefact every deploy workflow uploads; dev-next installs the same one.
ARTIFACT_NAME="deployment-package"
ARTIFACT_BRANCH="next"
MARKER=".e2e-artefact"

mkdir -p "$PLUGINS_DIR" "$ARTIFACTS_DIR"

# Replace $PLUGINS_DIR/<slug> with the plugin tree found under <src>.
install_tree() {
	local slug="$1" src="$2" main root
	main="$(find "$src" -maxdepth 3 -name "$slug.php" -type f | head -n 1)"
	if [ -z "$main" ]; then
		log "$slug: no $slug.php inside the unpacked package"
		return 1
	fi
	root="$(dirname "$main")"
	rm -rf "$PLUGINS_DIR/.$slug.new"
	mv "$root" "$PLUGINS_DIR/.$slug.new"
	rm -rf "${PLUGINS_DIR:?}/$slug"
	mv "$PLUGINS_DIR/.$slug.new" "$PLUGINS_DIR/$slug"
}

fetch_wcpos() {
	local repo="$1" slug="$1" label="$2" meta id sha created work
	meta="$(gh api "repos/wcpos/$repo/actions/artifacts?name=$ARTIFACT_NAME&per_page=100" \
		--jq "[.artifacts[] | select(.expired == false and .workflow_run.head_branch == \"$ARTIFACT_BRANCH\")] | sort_by(.created_at) | last | select(. != null) | [.id, .workflow_run.head_sha, .created_at] | @tsv")"
	if [ -z "$meta" ]; then
		echo "$label: no artefact yet"
		return 0
	fi
	IFS=$'\t' read -r id sha created <<<"$meta"

	if [ -f "$PLUGINS_DIR/$slug/$MARKER" ] && grep -q "^artifact_id=$id$" "$PLUGINS_DIR/$slug/$MARKER"; then
		echo "$label: up to date (artefact $id, $repo@${sha:0:8}, $created)"
		return 0
	fi

	work="$ARTIFACTS_DIR/$slug"
	rm -rf "$work"
	mkdir -p "$work/unpacked"
	gh api "repos/wcpos/$repo/actions/artifacts/$id/zip" >"$work/package.zip"
	unzip -q "$work/package.zip" -d "$work/zip"
	# The artefact is either a tarball of the plugin or the plugin tree itself.
	local tarball
	tarball="$(find "$work/zip" -maxdepth 2 -name '*.tar.gz' -type f | head -n 1)"
	if [ -n "$tarball" ]; then
		tar -xzf "$tarball" -C "$work/unpacked"
	else
		mv "$work/zip" "$work/unpacked/tree"
	fi
	install_tree "$slug" "$work/unpacked"
	printf 'artifact_id=%s\nhead_sha=%s\ncreated_at=%s\nsource=wcpos/%s %s %s\n' \
		"$id" "$sha" "$created" "$repo" "$ARTIFACT_BRANCH" "$ARTIFACT_NAME" >"$PLUGINS_DIR/$slug/$MARKER"
	rm -rf "$work"
	echo "$label: installed artefact $id ($repo@${sha:0:8}, $created)"
}

fetch_woocommerce() {
	local work="$ARTIFACTS_DIR/woocommerce" version
	rm -rf "$work"
	mkdir -p "$work"
	curl -fsSL -o "$work/woocommerce.zip" "https://downloads.wordpress.org/plugin/woocommerce.latest-stable.zip"
	unzip -q "$work/woocommerce.zip" -d "$work/unpacked"
	install_tree woocommerce "$work/unpacked"
	version="$(sed -n 's/^ \* Version: *//p' "$PLUGINS_DIR/woocommerce/woocommerce.php" | head -n 1)"
	printf 'source=downloads.wordpress.org latest-stable\nversion=%s\n' "$version" >"$PLUGINS_DIR/woocommerce/$MARKER"
	rm -rf "$work"
	echo "woocommerce: installed $version"
}

# Anything in plugins/ that did not come from this script (for example a raw
# git clone, which lacks built vendor code) must never be activated.
for dir in "$PLUGINS_DIR"/*/; do
	[ -d "$dir" ] || continue
	if [ ! -f "$dir/$MARKER" ]; then
		log "removing $(basename "$dir"): not installed by fetch-plugins.sh"
		rm -rf "$dir"
	fi
done

fetch_woocommerce
fetch_wcpos woocommerce-pos free
fetch_wcpos woocommerce-pos-pro pro
