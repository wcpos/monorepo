import { SYNC_COLLECTION_NAMES, type SyncCollectionName } from '../collections/engine-collections';

import type { QueryTotalCacheEntry } from './query-total-requests';

export const CENSUS_COLLECTIONS = SYNC_COLLECTION_NAMES;

/**
 * Every sync collection has a census total, and every one of them is probed on
 * a WCPOS-namespace route — never raw wc/v3, which cannot see POS visibility
 * and loses its `X-WP-Total` to a header-stripping proxy with no envelope
 * fallback (collection-map owns the per-collection route and pins the rule).
 * Variations are the reason this is stated rather than assumed: Woo core has no
 * un-nested variations endpoint at all, and the plugin's cross-parent
 * `wcpos/v1/products/variations` route is what lets them count like everything
 * else.
 */
export const SUPPORTED_CENSUS_COLLECTIONS = CENSUS_COLLECTIONS;

export type CensusTotal = {
	total: number;
	updatedAtMs: number;
	/** When this total stops being fresh — lets UIs show "next update in ~N min". */
	freshUntilMs: number;
	fresh: boolean;
};
export type CensusTotals = Record<SyncCollectionName, CensusTotal | null>;

export function censusQueryKey(collection: SyncCollectionName): `census:${SyncCollectionName}` {
	return `census:${collection}`;
}

export function censusCollectionFromQueryKey(queryKey: string): SyncCollectionName | null {
	if (!queryKey.startsWith('census:')) return null;
	const collection = queryKey.slice('census:'.length);
	return (CENSUS_COLLECTIONS as readonly string[]).includes(collection)
		? (collection as SyncCollectionName)
		: null;
}

export function censusTotalsFromCache(
	entries: QueryTotalCacheEntry[],
	nowMs: number
): CensusTotals {
	const byQueryKey = new Map(entries.map((entry) => [entry.queryKey, entry]));
	return Object.fromEntries(
		CENSUS_COLLECTIONS.map((collection) => {
			const entry = byQueryKey.get(censusQueryKey(collection));
			return [
				collection,
				entry
					? {
							total: entry.totalMatchingRecords,
							updatedAtMs: entry.updatedAtMs,
							freshUntilMs: entry.freshUntilMs,
							fresh: entry.freshUntilMs > nowMs,
						}
					: null,
			];
		})
	) as CensusTotals;
}

export function censusNextExpiryMs(entries: QueryTotalCacheEntry[], nowMs: number): number | null {
	const upcoming = entries
		.map((entry) => entry.freshUntilMs)
		.filter((deadline) => deadline > nowMs);
	return upcoming.length > 0 ? Math.min(...upcoming) : null;
}
