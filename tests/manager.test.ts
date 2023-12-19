import httpClientMock from './__mocks__/http';
import { MockRxDatabase } from './__mocks__/rxdb';
import { Manager } from '../src/manager';

import type { RxDatabase } from 'rxdb';

// jest.mock('rxdb');

describe('Manager', () => {
	let manager: Manager<RxDatabase>;
	let mockDatabase: RxDatabase;

	beforeEach(() => {
		mockDatabase = new MockRxDatabase() as unknown as RxDatabase;
		mockDatabase.addCollections({
			testCollection: { schema: {} },
		}); // Mock collection
		manager = new Manager(mockDatabase, httpClientMock);
	});

	afterEach(() => {
		jest.clearAllMocks();
	});

	describe('Query States', () => {
		it('should correctly serialize query keys', () => {
			const queryKey = ['test', { id: 1 }];
			expect(manager.serializeQueryKey(queryKey)).toBe(JSON.stringify(queryKey));
		});

		it('should handle serialization errors', (done) => {
			const circularObj = {};
			circularObj['self'] = circularObj;

			manager.error$.subscribe((error) => {
				expect(error).toBeInstanceOf(Error);
				expect(error.message).toContain('Failed to serialize query key');
				done();
			});

			manager.serializeQueryKey([circularObj]);
		});

		it('should return true if query exists', () => {
			const queryKey = ['testQuery'];
			manager.registerQuery({
				queryKey,
				collectionName: 'testCollection',
				initialParams: {},
			});
			expect(manager.hasQuery(queryKey)).toBe(true);
		});

		it('should return false if query does not exist', () => {
			expect(manager.hasQuery(['nonExistentQuery'])).toBe(false);
		});

		it('should register a new query', () => {
			const queryKey = ['newQuery'];
			manager.registerQuery({
				queryKey,
				collectionName: 'testCollection',
				initialParams: {},
			});
			expect(manager.queries.has(JSON.stringify(queryKey))).toBe(true);
		});

		it('should return the specified collection', () => {
			expect(manager.getCollection('testCollection')).toBeDefined();
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
			const queryKey = ['existingQuery'];
			manager.registerQuery({
				queryKey,
				collectionName: 'testCollection',
				initialParams: {},
			});
			expect(manager.getQuery(queryKey)).toBeDefined();
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
				collectionName: 'removableCollection',
				initialParams: {},
			});
			manager.deregisterQuery(queryKey);
			expect(manager.queries.has(JSON.stringify(queryKey))).toBe(false);
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
				queryKey: ['newQuery'],
				collectionName: 'testCollection',
				initialParams: {},
			});

			expect(manager.collectionReplicationStates.has('testCollection')).toBe(true);
		});
	});

	describe('Query Replication States', () => {
		it('should register a new query replication states', () => {
			const query = manager.registerQuery({
				queryKey: ['newQuery'],
				collectionName: 'testCollection',
				initialParams: {},
			});

			expect(manager.queryReplicationStates.has('testCollection')).toBe(true);

			const queryReplicationStates = manager.queryReplicationStates.get('testCollection');
			expect(queryReplicationStates.size).toEqual(1);

			query?.where('status', 'completed');
			expect(queryReplicationStates.size).toEqual(2);
		});
	});
});
