import { describe, expect, it } from 'vitest';

import { createRequirePlane, type EngineRequirement } from './require-plane';
import { orderBrowserQueryKey, productBrowseWindowQueryKeyFromDimensions } from './scheduler';
import { REFERENCE_LANE_CONFIGS } from './scheduler/rx-pos-bootstrap-seeder';

function queryKeyFor(requirement: EngineRequirement): string | null {
	const plane = createRequirePlane({
		awaitReady: () => new Promise(() => undefined),
		manager: {} as never,
		databaseFor: () => null,
		coverageFor: () => null,
		fetcher: async () => new Response(),
		syncBaseUrl: 'https://example.test/wp-json/wcpos/v2',
		diagnostics: () => undefined,
	});
	const handle = plane.require(requirement);
	handle.release();
	return handle.queryKey;
}

describe('RequirementHandle.queryKey', () => {
	it('carries the scheduler lane key for reference refresh requirements', () => {
		for (const collection of ['categories', 'brands', 'tags', 'coupons'] as const) {
			expect(queryKeyFor({ id: `${collection}-refresh`, collection, kind: 'refresh' })).toBe(
				REFERENCE_LANE_CONFIGS[collection].config.queryKey
			);
		}
	});

	it('stays null for refresh requirements without a complete-collection lane', () => {
		expect(
			queryKeyFor({ id: 'products-refresh', collection: 'products', kind: 'refresh' })
		).toBeNull();
	});

	it('keeps deriving browse lane keys from their descriptor helpers', () => {
		const orders: Extract<EngineRequirement, { kind: 'orders-browse' }> = {
			id: 'orders-browse',
			collection: 'orders',
			kind: 'orders-browse',
			status: 'processing',
			limit: 50,
		};
		const products: Extract<EngineRequirement, { kind: 'product-browse' }> = {
			id: 'products-browse',
			collection: 'products',
			kind: 'product-browse',
			limit: 110,
			category: [7, 2],
		};

		expect(queryKeyFor(orders)).toBe(orderBrowserQueryKey(orders));
		expect(queryKeyFor(products)).toBe(productBrowseWindowQueryKeyFromDimensions(products));
	});

	it('carries the search lane key, including the customer window limit', () => {
		expect(
			queryKeyFor({
				id: 'products-search',
				collection: 'products',
				kind: 'search',
				term: 'blue shirt / sale',
				limit: 10,
			})
		).toBe('products:search:blue%20shirt%20%2F%20sale');
		expect(
			queryKeyFor({
				id: 'customers-search',
				collection: 'customers',
				kind: 'search',
				term: 'Ada Lovelace',
				limit: 40,
			})
		).toBe('customers:search=Ada%20Lovelace:limit=40');
	});
});
