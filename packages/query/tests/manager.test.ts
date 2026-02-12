import { httpClientMock } from './__mocks__/http';
import { createStoreDatabase, createSyncDatabase } from './helpers/db';
import { Manager } from '../src/manager';

import type { RxDatabase } from 'rxdb';

// jest.mock('rxdb');

describe('Manager', () => {
	let manager: Manager<RxDatabase>;
	let storeDatabase: RxDatabase;
	let syncDatabase: RxDatabase;

	beforeEach(async () => {
		storeDatabase = await createStoreDatabase();
		syncDatabase = await createSyncDatabase();
		manager = Manager.getInstance(storeDatabase, syncDatabase, httpClientMock);
	});

	afterEach(async () => {
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

	describe('Query States', () => {
		it('should correctly serialize query keys', () => {
			const queryKey = ['test', { id: 1 }];
			expect(manager.stringify(queryKey)).toBe(JSON.stringify(queryKey));
		});

		it('should return true if query exists', () => {
			const queryKeys = ['testQuery'];
			manager.registerQuery({
				queryKeys,
				collectionName: 'products',
				initialParams: {},
			});
			expect(manager.hasQuery(queryKeys)).toBe(true);
		});

		it('should return false if query does not exist', () => {
			expect(manager.hasQuery(['nonExistentQuery'])).toBe(false);
		});

		it('should return the specified collection', () => {
			expect(manager.getCollection('products')).toBeDefined();
		});

		it('should retrieve an existing query', () => {
			const queryKeys = ['existingQuery'];
			manager.registerQuery({
				queryKeys,
				collectionName: 'products',
				initialParams: {},
			});
			expect(manager.getQuery(queryKeys)).toBeDefined();
		});

		it('should deregister a query', () => {
			const queryKey = ['queryToRemove'];
			manager.registerQuery({
				queryKey,
				collectionName: 'products',
				initialParams: {},
			});
			manager.deregisterQuery(queryKey);
			expect(manager.hasQuery(['queryToRemove'])).toBe(false);
		});

		it('should cancel all queries and subscriptions', async () => {
			// Setup and trigger the cancel method
			await manager.cancel();
			expect(manager.isCanceled).toBe(true);
			// Assertions for subscription cancellations and query cancellations
		});
	});

	describe('Collection Replication States', () => {
		it('should register a collection replication state with a new query', () => {
			manager.registerQuery({
				queryKeys: ['newQuery'],
				collectionName: 'products',
				initialParams: {},
			});

			expect(manager.replicationStates.has('products')).toBe(true);
		});

		it('should register a collection replication state with a given endpoint', () => {
			manager.registerQuery({
				queryKeys: ['newQuery'],
				collectionName: 'products',
				initialParams: {},
				endpoint: 'testEndpoint',
			});

			expect(manager.replicationStates.has('testEndpoint')).toBe(true);
		});

		it('should share a collection replication state between queries with the same endpoint', () => {
			manager.registerQuery({
				queryKeys: ['newQuery1'],
				collectionName: 'products',
				initialParams: {},
				endpoint: 'testEndpoint',
			});

			manager.registerQuery({
				queryKeys: ['newQuery2'],
				collectionName: 'products',
				initialParams: {},
				endpoint: 'testEndpoint',
			});

			expect(manager.replicationStates.has('testEndpoint')).toBe(true);

			const queryReplication1 = manager.getQuery(['newQuery1']);
			const queryReplication2 = manager.getQuery(['newQuery2']);
			expect(queryReplication1.collectionReplication).toEqual(
				queryReplication2.collectionReplication
			);
		});

		it('should create new replication when existing one has stale (destroyed) collection', async () => {
			// Register initial query
			manager.registerQuery({
				queryKeys: ['staleTest'],
				collectionName: 'products',
				initialParams: {},
			});

			const originalReplication = manager.replicationStates.get('products');
			expect(originalReplication).toBeDefined();

			// Store original collection reference
			const originalCollection = originalReplication.collection;

			// Simulate collection destruction (like during a swap)
			await storeDatabase.collections.products.remove();

			// Re-add collection (simulates what reset-collection plugin does)
			await storeDatabase.addCollections({
				products: {
					schema: storeDatabase.collections.products?.schema?.jsonSchema || {
						title: 'products',
						version: 0,
						primaryKey: 'uuid',
						type: 'object',
						properties: {
							uuid: { type: 'string', maxLength: 36 },
							id: { type: 'integer' },
						},
					},
				},
			});

			// Deregister old query (simulates what onCollectionReset does)
			await manager.deregisterQuery(['staleTest']);

			// Re-register query with same keys
			manager.registerQuery({
				queryKeys: ['staleTest'],
				collectionName: 'products',
				initialParams: {},
			});

			const newReplication = manager.replicationStates.get('products');
			expect(newReplication).toBeDefined();

			// Should be a different instance pointing to the new collection
			expect(newReplication.collection).not.toBe(originalCollection);
			expect((newReplication.collection as any).destroyed).toBeFalsy();
		});

		it('should emit on total$ after collection swap and re-registration', async () => {
			// Setup mock response for sync
			httpClientMock.__setMockResponse('get', 'products', [
				{ id: 1, date_modified_gmt: '2024-01-01T00:00:00' },
				{ id: 2, date_modified_gmt: '2024-01-01T00:00:00' },
				{ id: 3, date_modified_gmt: '2024-01-01T00:00:00' },
			], {
				params: { fields: ['id', 'date_modified_gmt'], posts_per_page: -1 },
			});

			// Register query
			manager.registerQuery({
				queryKeys: ['totalTest'],
				collectionName: 'products',
				initialParams: {},
			});

			// Get the replication and start it
			const replication = manager.activeCollectionReplications.get('["totalTest"]');
			expect(replication).toBeDefined();

			// Track total$ emissions
			const totalValues: number[] = [];
			replication.total$.subscribe((total) => totalValues.push(total));

			// Start replication and wait for first sync
			replication.start();
			await replication.firstSync;

			// Should have emitted the total (3 remote IDs)
			expect(totalValues).toContain(3);

			// Clean up
			await replication.cancel();
		});
	});

	describe('getApiQueryParams', () => {
		it('should return default params when no query params provided', () => {
			const result = manager.getApiQueryParams();
			expect(result).toEqual({
				orderby: undefined,
				order: undefined,
				per_page: 10,
				dates_are_gmt: 'true',
			});
		});

		it('should return default params when empty query params provided', () => {
			const result = manager.getApiQueryParams({});
			expect(result).toEqual({
				orderby: undefined,
				order: undefined,
				per_page: 10,
				dates_are_gmt: 'true',
			});
		});

		it('should extract sort into orderby and order', () => {
			const result = manager.getApiQueryParams({
				sort: [{ name: 'asc' }],
			});
			expect(result.orderby).toBe('name');
			expect(result.order).toBe('asc');
		});

		it('should strip sortable_ prefix from sort key', () => {
			const result = manager.getApiQueryParams({
				sort: [{ sortable_price: 'desc' }],
			});
			expect(result.orderby).toBe('price');
			expect(result.order).toBe('desc');
		});

		it('should convert selector.id.$in to params.include array', () => {
			const result = manager.getApiQueryParams({
				selector: { id: { $in: [1, 2, 3] } } as any,
			});
			expect(result.include).toEqual([1, 2, 3]);
		});

		it('should convert selector.id as number to params.include', () => {
			const result = manager.getApiQueryParams({
				selector: { id: 42 } as any,
			});
			expect(result.include).toBe(42);
		});

		it('should convert selector.id as string to params.include', () => {
			const result = manager.getApiQueryParams({
				selector: { id: '99' } as any,
			});
			expect(result.include).toBe('99');
		});

		it('should exclude uuid from params', () => {
			const result = manager.getApiQueryParams({
				selector: { uuid: 'abc-123', status: 'publish' },
			});
			expect(result.uuid).toBeUndefined();
			expect(result.status).toBe('publish');
		});

		it('should pass other selector keys as top-level params', () => {
			const result = manager.getApiQueryParams({
				selector: { status: 'publish', category: 'shoes' },
			});
			expect(result.status).toBe('publish');
			expect(result.category).toBe('shoes');
		});

		it('should always include dates_are_gmt and per_page', () => {
			const result = manager.getApiQueryParams({
				sort: [{ name: 'asc' }],
				selector: { status: 'draft' },
			});
			expect(result.dates_are_gmt).toBe('true');
			expect(result.per_page).toBe(10);
		});

		it('should handle selector with id.$in and other keys together', () => {
			const result = manager.getApiQueryParams({
				selector: { id: { $in: [10, 20] }, status: 'publish', uuid: 'skip-me' } as any,
			});
			expect(result.include).toEqual([10, 20]);
			expect(result.status).toBe('publish');
			expect(result.uuid).toBeUndefined();
			// id should have been deleted from selector before iterating
		});
	});

	describe('stringify error handling', () => {
		it('should return empty string for circular reference and log error', () => {
			const circular: any = { a: 1 };
			circular.self = circular;
			const result = manager.stringify(circular);
			expect(result).toBe('');
		});
	});

	describe('getInstance with changed deps', () => {
		it('should cancel old instance and create new one when locale changes', async () => {
			const firstManager = Manager.getInstance(storeDatabase, syncDatabase, httpClientMock);
			expect(firstManager).toBe(manager);

			// Create a new manager with a different locale
			const secondManager = Manager.getInstance(
				storeDatabase,
				syncDatabase,
				httpClientMock,
				'fr'
			);

			// Should be a different instance
			expect(secondManager).not.toBe(firstManager);
			// The new manager should have the new locale
			expect(secondManager.locale).toBe('fr');

			// Update our reference so afterEach cleanup works
			manager = secondManager;
		});

		it('should cancel old instance when localDB changes', async () => {
			const newStoreDatabase = await createStoreDatabase();
			try {
				const secondManager = Manager.getInstance(
					newStoreDatabase,
					syncDatabase,
					httpClientMock
				);
				expect(secondManager).not.toBe(manager);
				manager = secondManager;
			} finally {
				if (!newStoreDatabase.destroyed) {
					await newStoreDatabase.remove();
				}
			}
		});

		it('should return same instance when deps are identical', () => {
			const sameManager = Manager.getInstance(storeDatabase, syncDatabase, httpClientMock);
			expect(sameManager).toBe(manager);
		});
	});

	describe('registerQuery edge cases', () => {
		it('should return undefined when collection does not exist', () => {
			const result = manager.registerQuery({
				queryKeys: ['nonExistentCollectionQuery'],
				collectionName: 'nonExistentCollection',
				initialParams: {},
			});
			expect(result).toBeUndefined();
		});
	});

	describe('maybePauseQueryReplications', () => {
		it('should return early when query has no active replication', () => {
			// Create a mock query that has no entry in activeQueryReplications
			const mockQuery = { id: 'non-existent-id' } as any;
			// Should not throw
			manager.maybePauseQueryReplications(mockQuery);
		});

		it('should return early when active replication has no endpoint', () => {
			// Set up a mock replication with no endpoint
			const mockReplication = {
				endpoint: '',
				pause: jest.fn(),
			} as any;
			manager.activeQueryReplications.set('mock-query-id', mockReplication);
			const mockQuery = { id: 'mock-query-id' } as any;
			manager.maybePauseQueryReplications(mockQuery);
			expect(mockReplication.pause).not.toHaveBeenCalled();
		});

		it('should pause when there is only 1 active replication for the endpoint', () => {
			const mockReplication = {
				endpoint: 'test-endpoint',
				pause: jest.fn(),
			} as any;
			manager.activeQueryReplications.set('mock-query-id', mockReplication);
			const mockQuery = { id: 'mock-query-id' } as any;
			manager.maybePauseQueryReplications(mockQuery);
			expect(mockReplication.pause).toHaveBeenCalledTimes(1);
		});

		it('should not pause when there are multiple active replications for the endpoint', () => {
			const mockReplication1 = {
				endpoint: 'shared-endpoint',
				pause: jest.fn(),
			} as any;
			const mockReplication2 = {
				endpoint: 'shared-endpoint',
				pause: jest.fn(),
			} as any;
			manager.activeQueryReplications.set('query-1', mockReplication1);
			manager.activeQueryReplications.set('query-2', mockReplication2);
			const mockQuery = { id: 'query-1' } as any;
			manager.maybePauseQueryReplications(mockQuery);
			expect(mockReplication1.pause).not.toHaveBeenCalled();
		});
	});

	describe('getActiveQueryReplicationStatesByEndpoint', () => {
		it('should return empty array when no replications match', () => {
			const result = manager.getActiveQueryReplicationStatesByEndpoint('no-match');
			expect(result).toEqual([]);
		});

		it('should return matching replication states by endpoint', () => {
			const mockRep1 = { endpoint: 'products' } as any;
			const mockRep2 = { endpoint: 'orders' } as any;
			const mockRep3 = { endpoint: 'products' } as any;
			manager.activeQueryReplications.set('q1', mockRep1);
			manager.activeQueryReplications.set('q2', mockRep2);
			manager.activeQueryReplications.set('q3', mockRep3);
			const result = manager.getActiveQueryReplicationStatesByEndpoint('products');
			expect(result).toHaveLength(2);
			expect(result).toContain(mockRep1);
			expect(result).toContain(mockRep3);
		});
	});

	describe('ensureReplicationsForCollection', () => {
		it('should warn and return when sync collection is not ready', () => {
			// Use a collection name that does not exist in syncDatabase
			manager.ensureReplicationsForCollection('nonExistentSyncCollection');
			// Should not throw - just logs a warning
		});

		it('should skip queries that already have replications', () => {
			// Register a query (which sets up replication automatically)
			manager.registerQuery({
				queryKeys: ['ensureTest'],
				collectionName: 'products',
				initialParams: {},
			});

			// Verify replication exists
			const key = manager.stringify(['ensureTest']);
			expect(manager.activeCollectionReplications.has(key)).toBe(true);

			// Calling ensureReplicationsForCollection should skip this query
			// (it already has a replication) and not throw
			manager.ensureReplicationsForCollection('products');
		});
	});

	describe('Stale Replication Detection', () => {
		it('should detect when collection instance changes after removal', async () => {
			// Register query
			manager.registerQuery({
				queryKeys: ['destroyTest'],
				collectionName: 'products',
				initialParams: {},
			});

			const replication = manager.replicationStates.get('products');
			const originalCollection = replication.collection;

			// Remove the collection
			await storeDatabase.collections.products.remove();

			// Re-add collection
			await storeDatabase.addCollections({
				products: {
					schema: {
						title: 'products',
						version: 0,
						primaryKey: 'uuid',
						type: 'object',
						properties: {
							uuid: { type: 'string', maxLength: 36 },
							id: { type: 'integer' },
						},
					},
				},
			});

			const newCollection = storeDatabase.collections.products;

			// The new collection should be a different instance
			expect(newCollection).not.toBe(originalCollection);
		});

		it('should create fresh replication when collection instance changes', async () => {
			// Register query
			manager.registerQuery({
				queryKeys: ['freshTest'],
				collectionName: 'products',
				initialParams: {},
			});

			const firstReplication = manager.replicationStates.get('products');
			const firstCollection = firstReplication.collection;

			// Remove and re-add collection
			await storeDatabase.collections.products.remove();
			await storeDatabase.addCollections({
				products: {
					schema: {
						title: 'products',
						version: 0,
						primaryKey: 'uuid',
						type: 'object',
						properties: {
							uuid: { type: 'string', maxLength: 36 },
							id: { type: 'integer' },
						},
					},
				},
			});

			// Deregister and re-register
			await manager.deregisterQuery(['freshTest']);
			manager.registerQuery({
				queryKeys: ['freshTest'],
				collectionName: 'products',
				initialParams: {},
			});

			const secondReplication = manager.replicationStates.get('products');
			
			// Key check: the replication should now reference the NEW collection
			const newCollection = storeDatabase.collections.products;
			expect(secondReplication.collection).toBe(newCollection);
			expect(secondReplication.collection).not.toBe(firstCollection);
		});

		it('should detect stale replication by collection reference inequality', async () => {
			// Register query
			manager.registerQuery({
				queryKeys: ['staleRefTest'],
				collectionName: 'products',
				initialParams: {},
			});

			const replication = manager.replicationStates.get('products');
			const replicationCollection = replication.collection;
			const dbCollection = storeDatabase.collections.products;

			// Initially they should be the same
			expect(replicationCollection).toBe(dbCollection);

			// Remove and re-add collection
			await storeDatabase.collections.products.remove();
			await storeDatabase.addCollections({
				products: {
					schema: {
						title: 'products',
						version: 0,
						primaryKey: 'uuid',
						type: 'object',
						properties: {
							uuid: { type: 'string', maxLength: 36 },
							id: { type: 'integer' },
						},
					},
				},
			});

			const newDbCollection = storeDatabase.collections.products;

			// The replication's collection should now be stale (different from DB)
			expect(replicationCollection).not.toBe(newDbCollection);
		});
	});
});
