import { SYNC_COLLECTION_NAMES, type SyncCollectionName } from '../collections/engine-collections';

import type { QueryTotalCacheEntry } from './query-total-requests';

export const CENSUS_COLLECTIONS = SYNC_COLLECTION_NAMES;

/** Woo has no cheap un-nested wc/v3 endpoint for all variations. */
export const SUPPORTED_CENSUS_COLLECTIONS = CENSUS_COLLECTIONS.filter(
	(collection): collection is Exclude<SyncCollectionName, 'variations'> =>
		collection !== 'variations'
);

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
