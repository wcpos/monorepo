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
