import { describe, expect, it } from 'vitest';

import {
	CENSUS_COLLECTIONS,
	censusCollectionFromQueryKey,
	censusQueryKey,
	censusTotalsFromCache,
	SUPPORTED_CENSUS_COLLECTIONS,
} from './census';

describe('collection census', () => {
	it('uses stable census query keys for every synced collection', () => {
		expect(CENSUS_COLLECTIONS).toEqual([
			'orders',
			'products',
			'variations',
			'customers',
			'taxRates',
			'categories',
			'brands',
			'tags',
			'coupons',
		]);
		expect(CENSUS_COLLECTIONS.map(censusQueryKey)).toEqual([
			'census:orders',
			'census:products',
			'census:variations',
			'census:customers',
			'census:taxRates',
			'census:categories',
			'census:brands',
			'census:tags',
			'census:coupons',
		]);
		for (const collection of CENSUS_COLLECTIONS) {
			expect(censusCollectionFromQueryKey(censusQueryKey(collection))).toBe(collection);
		}
		expect(censusCollectionFromQueryKey('orders:all')).toBeNull();
		expect(censusCollectionFromQueryKey('census:not-a-collection')).toBeNull();
	});

	it('leaves variations unsupported when no cheap collection endpoint exists', () => {
		expect(SUPPORTED_CENSUS_COLLECTIONS).toEqual(
			CENSUS_COLLECTIONS.filter((collection) => collection !== 'variations')
		);
	});

	it('projects missing, fresh, and stale cache entries without a local denominator', () => {
		const totals = censusTotalsFromCache(
			[
				{
					queryKey: 'census:orders',
					totalMatchingRecords: 25,
					updatedAtMs: 900,
					freshUntilMs: 1_001,
				},
				{
					queryKey: 'census:products',
					totalMatchingRecords: 40,
					updatedAtMs: 800,
					freshUntilMs: 1_000,
				},
				{
					queryKey: 'orders:browser:status=processing',
					totalMatchingRecords: 7,
					updatedAtMs: 950,
					freshUntilMs: 2_000,
				},
			],
			1_000
		);

		expect(totals.orders).toEqual({
			total: 25,
			updatedAtMs: 900,
			freshUntilMs: 1_001,
			fresh: true,
		});
		expect(totals.products).toEqual({
			total: 40,
			updatedAtMs: 800,
			freshUntilMs: 1_000,
			fresh: false,
		});
		expect(totals.variations).toBeNull();
		expect(totals.customers).toBeNull();
	});
});
