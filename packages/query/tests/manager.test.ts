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
		await storeDatabase.destroy();
		await syncDatabase.destroy();
		manager.cancel();
		jest.clearAllMocks();
	});

	describe('Query States', () => {
		it('should correctly serialize query keys', () => {
			const queryKey = ['test', { id: 1 }];
			expect(manager.stringify(queryKey)).toBe(JSON.stringify(queryKey));
		});

		it('should handle serialization errors', (done) => {
			const circularObj = {};
			circularObj['self'] = circularObj;

			manager.error$.subscribe((error) => {
				expect(error).toBeInstanceOf(Error);
				expect(error.message).toContain('Failed to serialize query key');
				done();
			});

			manager.stringify([circularObj]);
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

		it('should handle non-existent collections', (done) => {
			manager.error$.subscribe((error) => {
				expect(error).toBeInstanceOf(Error);
				expect(error.message).toContain('Collection with name');
				done();
			});

			manager.getCollection('nonExistentCollection');
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

		it('should handle non-existent queries', (done) => {
			manager.error$.subscribe((error) => {
				expect(error).toBeInstanceOf(Error);
				expect(error.message).toContain('Query with key');
				done();
			});

			manager.getQuery(['nonExistentQuery']);
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

		it('should cancel all queries and subscriptions', () => {
			// Setup and trigger the cancel method
			manager.cancel();
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
	});
});
