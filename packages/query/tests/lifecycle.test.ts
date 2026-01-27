import type { RxDatabase } from 'rxdb';

import { httpClientMock } from './__mocks__/http';
import { createStoreDatabase, createSyncDatabase } from './helpers/db';
import { Manager } from '../src/manager';
import { Query } from '../src/query-state';

// Mock the logger module
jest.mock('@wcpos/utils/src/logger');

describe('Lifecycle Management', () => {
	let storeDatabase1: RxDatabase;
	let storeDatabase2: RxDatabase;
	let syncDatabase: RxDatabase;

	beforeEach(async () => {
		storeDatabase1 = await createStoreDatabase();
		storeDatabase2 = await createStoreDatabase();
		syncDatabase = await createSyncDatabase();
	});

	afterEach(async () => {
		// Clean up all databases
		if (storeDatabase1 && !storeDatabase1.destroyed) {
			await storeDatabase1.remove();
		}
		if (storeDatabase2 && !storeDatabase2.destroyed) {
			await storeDatabase2.remove();
		}
		if (syncDatabase && !syncDatabase.destroyed) {
			await syncDatabase.remove();
		}
		jest.clearAllMocks();
	});

	describe('Manager Singleton', () => {
		it('should return the same instance when called with same databases', () => {
			const manager1 = Manager.getInstance(storeDatabase1, syncDatabase, httpClientMock);
			const manager2 = Manager.getInstance(storeDatabase1, syncDatabase, httpClientMock);

			expect(manager1).toBe(manager2);
		});

		it('should create new instance when database changes', () => {
			const manager1 = Manager.getInstance(storeDatabase1, syncDatabase, httpClientMock);
			const manager2 = Manager.getInstance(storeDatabase2, syncDatabase, httpClientMock);

			expect(manager1).not.toBe(manager2);
		});

		it('should cancel old instance when database changes', () => {
			const manager1 = Manager.getInstance(storeDatabase1, syncDatabase, httpClientMock);
			const cancelSpy = jest.spyOn(manager1, 'cancel');

			Manager.getInstance(storeDatabase2, syncDatabase, httpClientMock);

			expect(cancelSpy).toHaveBeenCalled();
		});

		it('should mark old manager as cancelled when database switches', () => {
			const manager1 = Manager.getInstance(storeDatabase1, syncDatabase, httpClientMock);

			expect(manager1.isCanceled).toBe(false);

			Manager.getInstance(storeDatabase2, syncDatabase, httpClientMock);

			expect(manager1.isCanceled).toBe(true);
		});
	});

	describe('Manager Cleanup', () => {
		it('should cancel all queries when manager is cancelled', async () => {
			const manager = Manager.getInstance(storeDatabase1, syncDatabase, httpClientMock);

			// Register some queries
			const query1 = manager.registerQuery({
				queryKeys: ['query1'],
				collectionName: 'products',
				initialParams: {},
			});
			const query2 = manager.registerQuery({
				queryKeys: ['query2'],
				collectionName: 'products',
				initialParams: {},
			});

			expect(query1).toBeDefined();
			expect(query2).toBeDefined();

			const cancelSpy1 = jest.spyOn(query1!, 'cancel');
			const cancelSpy2 = jest.spyOn(query2!, 'cancel');

			await manager.cancel();

			expect(cancelSpy1).toHaveBeenCalled();
			expect(cancelSpy2).toHaveBeenCalled();
		});

		it('should complete cancel$ observable when cancelled', async () => {
			const manager = Manager.getInstance(storeDatabase1, syncDatabase, httpClientMock);

			const completePromise = new Promise<void>((resolve) => {
				manager.cancel$.subscribe({
					complete: () => {
						resolve();
					},
				});
			});

			await manager.cancel();
			await completePromise;
		});

		it('should set isCanceled flag when cancelled', async () => {
			const manager = Manager.getInstance(storeDatabase1, syncDatabase, httpClientMock);

			expect(manager.isCanceled).toBe(false);

			await manager.cancel();

			expect(manager.isCanceled).toBe(true);
		});
	});

	describe('Query Lifecycle', () => {
		it('should create query with collection reference', () => {
			const manager = Manager.getInstance(storeDatabase1, syncDatabase, httpClientMock);

			const query = manager.registerQuery({
				queryKeys: ['products-query'],
				collectionName: 'products',
				initialParams: {},
			});

			expect(query).toBeDefined();
			expect(query?.collection).toBe(storeDatabase1.collections.products);
		});

		it('should return existing query for same queryKeys', () => {
			const manager = Manager.getInstance(storeDatabase1, syncDatabase, httpClientMock);

			const query1 = manager.registerQuery({
				queryKeys: ['same-key'],
				collectionName: 'products',
				initialParams: {},
			});

			const query2 = manager.registerQuery({
				queryKeys: ['same-key'],
				collectionName: 'products',
				initialParams: { selector: { name: 'test' } }, // Different params, same key
			});

			expect(query1).toBe(query2);
		});

		it('should deregister query and cancel it', () => {
			const manager = Manager.getInstance(storeDatabase1, syncDatabase, httpClientMock);

			const query = manager.registerQuery({
				queryKeys: ['to-remove'],
				collectionName: 'products',
				initialParams: {},
			});

			expect(manager.hasQuery(['to-remove'])).toBe(true);

			const cancelSpy = jest.spyOn(query!, 'cancel');

			// deregisterQuery takes the stringified key, not the array
			const key = manager.stringify(['to-remove'])!;
			manager.deregisterQuery(key);

			expect(manager.hasQuery(['to-remove'])).toBe(false);
			expect(cancelSpy).toHaveBeenCalled();
		});
	});

	describe('Database Close Handler', () => {
		it('should register onClose handler when created', () => {
			const initialOnCloseCount = storeDatabase1.onClose.length;

			Manager.getInstance(storeDatabase1, syncDatabase, httpClientMock);

			expect(storeDatabase1.onClose.length).toBeGreaterThan(initialOnCloseCount);
		});

		it('should cancel manager when database is closed', async () => {
			const manager = Manager.getInstance(storeDatabase1, syncDatabase, httpClientMock);

			expect(manager.isCanceled).toBe(false);

			// close() triggers the onClose handlers
			await storeDatabase1.close();

			expect(manager.isCanceled).toBe(true);
		});
	});

	describe('Query Cancellation', () => {
		it('should complete all subjects when query is cancelled', async () => {
			const query = new Query({
				id: 'test-query',
				collection: storeDatabase1.collections.products,
				initialParams: {},
			});

			const completePromise = new Promise<void>((resolve) => {
				query.cancel$.subscribe({
					complete: () => {
						expect(query.isCanceled).toBe(true);
						resolve();
					},
				});
			});

			await query.cancel();
			await completePromise;
		});

		it('should unsubscribe all internal subscriptions when cancelled', async () => {
			const query = new Query({
				id: 'test-query',
				collection: storeDatabase1.collections.products,
				initialParams: {},
			});

			// Add a test subscription
			const testSub = query.result$.subscribe();
			query.addSub('test', testSub);

			expect(query.subs['test']).toBeDefined();

			await query.cancel();

			// After cancel, subscriptions should be unsubscribed
			expect(testSub.closed).toBe(true);
		});
	});

	describe('SubscribableBase', () => {
		it('should allow adding and removing subscriptions', () => {
			const query = new Query({
				id: 'test-query',
				collection: storeDatabase1.collections.products,
				initialParams: {},
			});

			const sub = query.result$.subscribe();

			query.addSub('custom', sub);
			expect(query.subs['custom']).toBe(sub);

			query.cancelSub('custom');
			expect(query.subs['custom']).toBeUndefined();
			expect(sub.closed).toBe(true);
		});

		it('should replace existing subscription when adding with same key', () => {
			const query = new Query({
				id: 'test-query',
				collection: storeDatabase1.collections.products,
				initialParams: {},
			});

			const sub1 = query.result$.subscribe();
			const sub2 = query.result$.subscribe();

			query.addSub('key', sub1);
			expect(query.subs['key']).toBe(sub1);

			query.addSub('key', sub2);
			expect(query.subs['key']).toBe(sub2);
			expect(sub1.closed).toBe(true); // Old subscription should be unsubscribed
		});
	});

	describe('Collection Reset Handling', () => {
		it('should have reset$ observable on database', () => {
			// This tests our mock database setup
			expect((storeDatabase1 as any).reset$).toBeDefined();
		});

		// TODO: Once Manager's reset$ subscription is re-enabled (Phase 2),
		// add tests for:
		// - Query re-registration when collection resets
		// - Replication state handling on collection reset
	});

	describe('AbortController', () => {
		it('should have signal property on query', () => {
			const query = new Query({
				id: 'test-query',
				collection: storeDatabase1.collections.products,
				initialParams: {},
			});

			expect(query.signal).toBeDefined();
			expect(query.signal).toBeInstanceOf(AbortSignal);
			expect(query.isAborted).toBe(false);
		});

		it('should abort signal when cancelled', async () => {
			const query = new Query({
				id: 'test-query',
				collection: storeDatabase1.collections.products,
				initialParams: {},
			});

			expect(query.isAborted).toBe(false);

			await query.cancel();

			expect(query.isAborted).toBe(true);
			expect(query.signal.aborted).toBe(true);
		});

		it('should abort manager signal when cancelled', async () => {
			const manager = Manager.getInstance(storeDatabase1, syncDatabase, httpClientMock);

			expect(manager.isAborted).toBe(false);

			await manager.cancel();

			expect(manager.isAborted).toBe(true);
		});

		it('should abort all queries when manager is cancelled', async () => {
			const manager = Manager.getInstance(storeDatabase1, syncDatabase, httpClientMock);

			const query1 = manager.registerQuery({
				queryKeys: ['abort-test-1'],
				collectionName: 'products',
				initialParams: {},
			});
			const query2 = manager.registerQuery({
				queryKeys: ['abort-test-2'],
				collectionName: 'products',
				initialParams: {},
			});

			expect(query1!.isAborted).toBe(false);
			expect(query2!.isAborted).toBe(false);

			await manager.cancel();

			expect(query1!.isAborted).toBe(true);
			expect(query2!.isAborted).toBe(true);
		});
	});
});
