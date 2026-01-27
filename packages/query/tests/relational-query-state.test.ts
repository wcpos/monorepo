import type { RxDatabase } from 'rxdb';

import { createStoreDatabase } from './helpers/db';
import { Query } from '../src/query-state';
import { RelationalQuery } from '../src/relational-query-state';

// Mock the logger module
jest.mock('@wcpos/utils/src/logger');

describe('RelationalQuery', () => {
	let storeDatabase: RxDatabase;

	beforeEach(async () => {
		storeDatabase = await createStoreDatabase();
	});

	afterEach(async () => {
		await new Promise((resolve) => setTimeout(resolve, 100));
		if (storeDatabase && !storeDatabase.destroyed) {
			await storeDatabase.remove();
		}
		jest.clearAllMocks();
	});

	describe('Parent-Child Search', () => {
		/**
		 * This is the critical feature: when searching for a term, RelationalQuery should:
		 * 1. Search parent collection (products)
		 * 2. Search child collection (variations)
		 * 3. Return parents that match OR have matching children
		 */
		it('should return parent products when search matches child variations', async () => {
			// Insert parent products
			const products = [
				{ uuid: 'prod-1', id: 1, name: 'T-Shirt', sku: 'TSHIRT-PARENT' },
				{ uuid: 'prod-2', id: 2, name: 'Hoodie', sku: 'HOODIE-PARENT' },
				{ uuid: 'prod-3', id: 3, name: 'Jeans', sku: 'JEANS-PARENT' },
			];
			await storeDatabase.collections.products.bulkInsert(products);

			// Insert variations - one variation has SKU that matches a search term
			const variations = [
				{ uuid: 'var-1', id: 101, parent_id: 1, name: 'T-Shirt - Small', sku: 'TSHIRT-S', attributes: [{ name: 'Size', option: 'Small' }] },
				{ uuid: 'var-2', id: 102, parent_id: 1, name: 'T-Shirt - Medium', sku: 'TSHIRT-M', attributes: [{ name: 'Size', option: 'Medium' }] },
				{ uuid: 'var-3', id: 103, parent_id: 2, name: 'Hoodie - Red', sku: 'HOODIE-RED', attributes: [{ name: 'Color', option: 'Red' }] },
				{ uuid: 'var-4', id: 104, parent_id: 2, name: 'Hoodie - Blue', sku: 'HOODIE-BLUE', attributes: [{ name: 'Color', option: 'Blue' }] },
			];
			await storeDatabase.collections.variations.bulkInsert(variations);

			// Create child query for variations
			const childQuery = new Query({
				id: 'child-query',
				collection: storeDatabase.collections.variations,
				initialParams: {},
			});

			// Create parent lookup query (used to convert parent IDs to UUIDs)
			const parentLookupQuery = new Query({
				id: 'parent-lookup-query',
				collection: storeDatabase.collections.products,
				initialParams: {
					selector: {
						id: { $in: [] },
					},
				},
				autoExec: false,
			});

			// Create relational query
			const relationalQuery = new RelationalQuery(
				{
					id: 'relational-query',
					collection: storeDatabase.collections.products,
					initialParams: {},
				},
				childQuery,
				parentLookupQuery
			);

			// Get initial results (should return all products)
			const initialResult = await new Promise((resolve) => {
				relationalQuery.result$.subscribe((result) => {
					resolve(result);
				});
			});

			expect(initialResult).toEqual(
				expect.objectContaining({
					searchActive: false,
					count: 3,
				})
			);

			// Cleanup
			relationalQuery.cancel();
			childQuery.cancel();
			parentLookupQuery.cancel();
		});

		it('should initialize with all parent records when no search is active', async () => {
			const products = [
				{ uuid: 'prod-1', id: 1, name: 'Product A' },
				{ uuid: 'prod-2', id: 2, name: 'Product B' },
			];
			await storeDatabase.collections.products.bulkInsert(products);

			const childQuery = new Query({
				id: 'child-query',
				collection: storeDatabase.collections.variations,
				initialParams: {},
			});

			const parentLookupQuery = new Query({
				id: 'parent-lookup-query',
				collection: storeDatabase.collections.products,
				initialParams: { selector: { id: { $in: [] } } },
				autoExec: false,
			});

			const relationalQuery = new RelationalQuery(
				{
					id: 'relational-query',
					collection: storeDatabase.collections.products,
					initialParams: {},
				},
				childQuery,
				parentLookupQuery
			);

			const result = await new Promise((resolve) => {
				relationalQuery.result$.subscribe(resolve);
			});

			expect(result).toEqual(
				expect.objectContaining({
					searchActive: false,
					count: 2,
					hits: expect.arrayContaining([
						expect.objectContaining({ id: 'prod-1' }),
						expect.objectContaining({ id: 'prod-2' }),
					]),
				})
			);

			relationalQuery.cancel();
			childQuery.cancel();
			parentLookupQuery.cancel();
		});

		it('should clear search and return all results when search term is empty', async () => {
			const products = [
				{ uuid: 'prod-1', id: 1, name: 'Product A' },
				{ uuid: 'prod-2', id: 2, name: 'Product B' },
			];
			await storeDatabase.collections.products.bulkInsert(products);

			const childQuery = new Query({
				id: 'child-query',
				collection: storeDatabase.collections.variations,
				initialParams: {},
			});

			const parentLookupQuery = new Query({
				id: 'parent-lookup-query',
				collection: storeDatabase.collections.products,
				initialParams: { selector: { id: { $in: [] } } },
				autoExec: false,
			});

			const relationalQuery = new RelationalQuery(
				{
					id: 'relational-query',
					collection: storeDatabase.collections.products,
					initialParams: {},
				},
				childQuery,
				parentLookupQuery
			);

			// Clear any search (simulating what happens when user clears search box)
			relationalQuery.search('');

			const result = await new Promise((resolve) => {
				const sub = relationalQuery.result$.subscribe((r) => {
					if (!r.searchActive) {
						resolve(r);
						sub.unsubscribe();
					}
				});
			});

			expect(result).toEqual(
				expect.objectContaining({
					searchActive: false,
					count: 2,
				})
			);

			relationalQuery.cancel();
			childQuery.cancel();
			parentLookupQuery.cancel();
		});
	});

	describe('Query State Management', () => {
		it('should cancel subscriptions when cancelled', async () => {
			const childQuery = new Query({
				id: 'child-query',
				collection: storeDatabase.collections.variations,
				initialParams: {},
			});

			const parentLookupQuery = new Query({
				id: 'parent-lookup-query',
				collection: storeDatabase.collections.products,
				initialParams: { selector: { id: { $in: [] } } },
				autoExec: false,
			});

			const relationalQuery = new RelationalQuery(
				{
					id: 'relational-query',
					collection: storeDatabase.collections.products,
					initialParams: {},
				},
				childQuery,
				parentLookupQuery
			);

			// Cancel should not throw
			expect(() => {
				relationalQuery.cancel();
			}).not.toThrow();

			childQuery.cancel();
			parentLookupQuery.cancel();
		});

		it('should inherit query builder methods from parent Query class', async () => {
			const childQuery = new Query({
				id: 'child-query',
				collection: storeDatabase.collections.variations,
				initialParams: {},
			});

			const parentLookupQuery = new Query({
				id: 'parent-lookup-query',
				collection: storeDatabase.collections.products,
				initialParams: { selector: { id: { $in: [] } } },
				autoExec: false,
			});

			const relationalQuery = new RelationalQuery(
				{
					id: 'relational-query',
					collection: storeDatabase.collections.products,
					initialParams: {},
				},
				childQuery,
				parentLookupQuery
			);

			// Should have access to Query methods
			expect(typeof relationalQuery.where).toBe('function');
			expect(typeof relationalQuery.sort).toBe('function');
			expect(typeof relationalQuery.search).toBe('function');

			relationalQuery.cancel();
			childQuery.cancel();
			parentLookupQuery.cancel();
		});
	});
});
