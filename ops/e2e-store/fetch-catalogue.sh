#!/usr/bin/env bash
# Copy the SHAPE of dev-next's catalogue from its public WooCommerce Store API
# into ~/e2e-store/catalogue, for seed-catalogue.php to rebuild locally.
#
# Read-only, unauthenticated GETs against public endpoints: nothing on the
# production VPS is written. Images are not downloaded; the seed attaches
# local placeholders instead.

# shellcheck source=lib.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

SOURCE_URL="https://dev-next.wcpos.com/wp-json/wc/store/v1"
OUT="$E2E_STORE_HOME/catalogue"
mkdir -p "$OUT"

# Fetch every page of a Store API collection into one JSON array.
fetch_all() {
	local path="$1" out="$2" page=1 pages tmp sep='?'
	[[ "$path" == *\?* ]] && sep='&'
	tmp="$(mktemp -d)"
	while :; do
		curl -fsS -D "$tmp/headers" -o "$tmp/page-$page.json" \
			"$SOURCE_URL/$path${sep}per_page=100&page=$page"
		pages="$(awk 'tolower($1) == "x-wp-totalpages:" { print $2 + 0 }' "$tmp/headers")"
		[ "$page" -ge "${pages:-1}" ] && break
		page=$((page + 1))
	done
	jq -s 'add' "$tmp"/page-*.json >"$out"
	rm -rf "$tmp"
}

fetch_all "products" "$OUT/products.json"
fetch_all "products?type=variation" "$OUT/variations.json"
fetch_all "products/categories" "$OUT/categories.json"

printf 'source=%s\nfetched_at=%s\n' "$SOURCE_URL" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" >"$OUT/SOURCE"
echo "catalogue: $(jq length "$OUT/products.json") products," \
	"$(jq length "$OUT/variations.json") variations," \
	"$(jq length "$OUT/categories.json") categories from $SOURCE_URL"
