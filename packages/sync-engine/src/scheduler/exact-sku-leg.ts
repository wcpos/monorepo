/**
 * Whether the store still needs the exact `sku=` search leg beside `search=`.
 *
 * The client never raises its plugin floor for a server improvement — the web
 * bundle ships before the PHP plugin, so a floor above what a store reports
 * would hide login until the merchant updates. Behaviour that depends on a
 * newer server is gated on the reported version instead (same pattern as
 * `bareAuthParamSupported`).
 *
 * `wcpos/v2/products?search=` matches `_sku` and the configured barcode key by
 * substring from 1.10.3, and ranks an exact match first from 1.10.8
 * (wcpos/woocommerce-pos#1834). 1.10.8 is therefore the first release where one
 * `search=` request is sufficient; below it the exact leg is what guarantees an
 * exact SKU lands on the first page (and below 1.10.3 it is the only thing that
 * finds a SKU at all on the products route). Unknown or unparseable versions
 * keep the leg — the safe side is an extra request, not a missed product.
 */
export const EXACT_SKU_LEG_UNTIL_PLUGIN = '1.10.8';

type VersionTuple = [major: number, minor: number, patch: number];

function parseVersion(version: string | null | undefined): VersionTuple | null {
	const [, major, minor, patch] = version?.match(/^(\d+)\.(\d+)\.(\d+)/) ?? [];
	if (major === undefined || minor === undefined || patch === undefined) return null;
	return [Number(major), Number(minor), Number(patch)];
}

const SUFFICIENT_SEARCH_SINCE = parseVersion(EXACT_SKU_LEG_UNTIL_PLUGIN) as VersionTuple;

function isBefore(left: VersionTuple, right: VersionTuple): boolean {
	for (let index = 0; index < left.length; index += 1) {
		if (left[index] !== right[index]) return left[index] < right[index];
	}
	return false;
}

export function exactSkuLegRequired(wcposVersion: string | null | undefined): boolean {
	const reported = parseVersion(wcposVersion);
	return reported === null || isBefore(reported, SUFFICIENT_SEARCH_SINCE);
}
