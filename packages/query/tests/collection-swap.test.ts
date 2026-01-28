import type { RxDatabase, RxCollection } from 'rxdb';
import { Subject } from 'rxjs';

import { httpClientMock } from './__mocks__/http';
import { createStoreDatabase, createSyncDatabase } from './helpers/db';
import { Manager } from '../src/manager';
import { swapCollection, swapCollections } from '../src/collection-swap';

// Mock the logger module
jest.mock('@wcpos/utils/src/logger');

// Schemas for re-adding collections
const storeSchema = {
	title: 'products',
	version: 0,
	primaryKey: 'uuid',
	type: 'object' as const,
	properties: {
		uuid: { type: 'string' as const, maxLength: 36 },
		id: { type: 'integer' as const },
	},
};

const syncSchema = {
	title: 'products',
	version: 0,
	primaryKey: 'uuid',
	type: 'object' as const,
	properties: {
		uuid: { type: 'string' as const, maxLength: 36 },
		id: { type: 'integer' as const },
		status: { type: 'string' as const },
		endpoint: { type: 'string' as const },
	},
};

const variationsStoreSchema = { ...storeSchema, title: 'variations' };
const variationsSyncSchema = { ...syncSchema, title: 'variations' };

describe('Collection Swap', () => {
	let storeDatabase: RxDatabase;
	let syncDatabase: RxDatabase;
	let manager: Manager<any>;
	let mockReset$: Subject<RxCollection>;

	beforeEach(async () => {
		storeDatabase = await createStoreDatabase();
		syncDatabase = await createSyncDatabase();
		manager = Manager.getInstance(storeDatabase, syncDatabase, httpClientMock);

		// Add mock reset$ observable (required by swapCollection for validation)
		mockReset$ = new Subject<RxCollection>();
		(storeDatabase as any).reset$ = mockReset$.asObservable();
		(syncDatabase as any).reset$ = mockReset$.asObservable();
	});

	afterEach(async () => {
		mockReset$.complete();
		if (manager) {
			await manager.cancel();
		}
		if (storeDatabase && !storeDatabase.destroyed) {
			await storeDatabase.remove();
		}
		if (syncDatabase && !syncDatabase.destroyed) {
			await syncDatabase.remove();
		}
		jest.clearAllMocks();
	});

	describe('swapCollection', () => {
		it('should return success result with duration', async () => {
			// Poll and re-add collections as they are removed
			let stopPolling = false;
			const pollAndReAdd = async () => {
				while (!stopPolling) {
					await new Promise((resolve) => setTimeout(resolve, 10));
					if (!storeDatabase.destroyed && !storeDatabase.collections.products) {
						try {
							await storeDatabase.addCollections({ products: { schema: storeSchema } });
						} catch (e) { /* ignore */ }
					}
					if (!syncDatabase.destroyed && !syncDatabase.collections.products) {
						try {
							await syncDatabase.addCollections({ products: { schema: syncSchema } });
						} catch (e) { /* ignore */ }
					}
				}
			};

			// Start polling in background
			const pollingPromise = pollAndReAdd();

			const result = await swapCollection({
				manager,
				collectionName: 'products',
				storeDB: storeDatabase,
				fastStoreDB: syncDatabase,
				timeout: 5000,
			});

			stopPolling = true;
			await pollingPromise;

			expect(result.success).toBe(true);
			expect(result.duration).toBeGreaterThan(0);
			expect(result.error).toBeUndefined();
		});

		it('should cancel operations for the collection', async () => {
			// Register a query first
			manager.registerQuery({
				queryKeys: ['cancel-test'],
				collectionName: 'products',
				initialParams: {},
			});

			expect(manager.hasQuery(['cancel-test'])).toBe(true);

			// Start re-add process
			const reAddPromise = (async () => {
				await new Promise((resolve) => setTimeout(resolve, 20));
				if (!storeDatabase.collections.products && !storeDatabase.destroyed) {
					await storeDatabase.addCollections({ products: { schema: storeSchema } });
				}
				if (!syncDatabase.collections.products && !syncDatabase.destroyed) {
					await syncDatabase.addCollections({ products: { schema: syncSchema } });
				}
			})();

			const result = await swapCollection({
				manager,
				collectionName: 'products',
				storeDB: storeDatabase,
				fastStoreDB: syncDatabase,
				timeout: 5000,
			});

			await reAddPromise;

			expect(result.success).toBe(true);
			// Query should be deregistered after swap
			expect(manager.hasQuery(['cancel-test'])).toBe(false);
		});

		it('should timeout if collection is not re-added', async () => {
			// Don't re-add collections, so swap will timeout
			const result = await swapCollection({
				manager,
				collectionName: 'products',
				storeDB: storeDatabase,
				fastStoreDB: syncDatabase,
				timeout: 100, // Very short timeout
			});

			expect(result.success).toBe(false);
			expect(result.error).toContain('Timeout');
		});

		it('should handle missing reset$ observable', async () => {
			// Remove reset$ to simulate missing plugin
			(storeDatabase as any).reset$ = undefined;

			const result = await swapCollection({
				manager,
				collectionName: 'products',
				storeDB: storeDatabase,
				fastStoreDB: syncDatabase,
			});

			expect(result.success).toBe(false);
			expect(result.error).toContain('reset$');
		});
	});

	describe('swapCollections', () => {
		it('should swap multiple collections sequentially', async () => {
			// Poll and re-add collections as they are removed
			// This simulates the reset-collection plugin behavior
			let stopPolling = false;
			const pollAndReAdd = async () => {
				while (!stopPolling) {
					await new Promise((resolve) => setTimeout(resolve, 10));
					
					// Check and re-add variations
					if (!storeDatabase.destroyed && !storeDatabase.collections.variations) {
						try {
							await storeDatabase.addCollections({ variations: { schema: variationsStoreSchema } });
						} catch (e) { /* ignore */ }
					}
					if (!syncDatabase.destroyed && !syncDatabase.collections.variations) {
						try {
							await syncDatabase.addCollections({ variations: { schema: variationsSyncSchema } });
						} catch (e) { /* ignore */ }
					}
					
					// Check and re-add products
					if (!storeDatabase.destroyed && !storeDatabase.collections.products) {
						try {
							await storeDatabase.addCollections({ products: { schema: storeSchema } });
						} catch (e) { /* ignore */ }
					}
					if (!syncDatabase.destroyed && !syncDatabase.collections.products) {
						try {
							await syncDatabase.addCollections({ products: { schema: syncSchema } });
						} catch (e) { /* ignore */ }
					}
				}
			};

			// Start the polling in background
			const pollingPromise = pollAndReAdd();

			const results = await swapCollections({
				manager,
				collectionNames: ['variations', 'products'],
				storeDB: storeDatabase,
				fastStoreDB: syncDatabase,
				timeout: 5000,
			});

			// Stop polling after swap completes
			stopPolling = true;
			await pollingPromise;

			expect(results).toHaveLength(2);
			expect(results[0].success).toBe(true);
			expect(results[1].success).toBe(true);
		});

		it('should stop on first failure', async () => {
			// Remove reset$ to cause validation failure
			(storeDatabase as any).reset$ = undefined;

			const results = await swapCollections({
				manager,
				collectionNames: ['products', 'variations'],
				storeDB: storeDatabase,
				fastStoreDB: syncDatabase,
			});

			expect(results).toHaveLength(1);
			expect(results[0].success).toBe(false);
		});
	});

	describe('Integration with Manager', () => {
		it('should deregister queries when swapping', async () => {
			// Register a query
			manager.registerQuery({
				queryKeys: ['swap-test-query'],
				collectionName: 'products',
				initialParams: {},
			});

			expect(manager.hasQuery(['swap-test-query'])).toBe(true);

			// Start re-add process
			const reAddPromise = (async () => {
				await new Promise((resolve) => setTimeout(resolve, 20));
				if (!storeDatabase.collections.products && !storeDatabase.destroyed) {
					await storeDatabase.addCollections({ products: { schema: storeSchema } });
				}
				if (!syncDatabase.collections.products && !syncDatabase.destroyed) {
					await syncDatabase.addCollections({ products: { schema: syncSchema } });
				}
			})();

			const result = await swapCollection({
				manager,
				collectionName: 'products',
				storeDB: storeDatabase,
				fastStoreDB: syncDatabase,
				timeout: 5000,
			});

			await reAddPromise;

			expect(result.success).toBe(true);
			// Query should be deregistered after swap
			expect(manager.hasQuery(['swap-test-query'])).toBe(false);
		});

		it('should return new collection instance after swap', async () => {
			const originalCollection = storeDatabase.collections.products;

			// Start re-add process
			const reAddPromise = (async () => {
				await new Promise((resolve) => setTimeout(resolve, 20));
				if (!storeDatabase.collections.products && !storeDatabase.destroyed) {
					await storeDatabase.addCollections({ products: { schema: storeSchema } });
				}
				if (!syncDatabase.collections.products && !syncDatabase.destroyed) {
					await syncDatabase.addCollections({ products: { schema: syncSchema } });
				}
			})();

			const result = await swapCollection({
				manager,
				collectionName: 'products',
				storeDB: storeDatabase,
				fastStoreDB: syncDatabase,
				timeout: 5000,
			});

			await reAddPromise;

			expect(result.success).toBe(true);
			expect(result.collection).toBeDefined();
			// The returned collection should be different from the original
			expect(result.collection).not.toBe(originalCollection);
		});
	});
});
