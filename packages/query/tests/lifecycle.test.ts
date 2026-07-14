import { createStoreDatabase } from './helpers/db';
import { createEngineDatabase, createFakeEngine } from './helpers/engine';
import { Manager } from '../src/manager';
import { Query } from '../src/query-state';

import type { RxDatabase } from 'rxdb';
import type { FakeEngine } from './helpers/engine';

// Mock the logger module
jest.mock('@wcpos/utils/src/logger');

// Manager holds the engine now (ADR 0023 increment 1b). Singleton identity keys
// on (localDB, engine, locale); the Query / Subscribable lifecycle is unchanged
// and exercised against the local-path Query for isolation.

describe('Lifecycle Management', () => {
	let localDB1: RxDatabase;
	let localDB2: RxDatabase;
	let engineDB: RxDatabase;
	let engine: FakeEngine;

	beforeEach(async () => {
		localDB1 = await createStoreDatabase();
		localDB2 = await createStoreDatabase();
		engineDB = await createEngineDatabase();
		engine = createFakeEngine(engineDB);
	});

	afterEach(async () => {
		if (localDB1 && !localDB1.destroyed) await localDB1.remove();
		if (localDB2 && !localDB2.destroyed) await localDB2.remove();
		if (engineDB && !engineDB.destroyed) await engineDB.remove();
		jest.clearAllMocks();
	});

	describe('Manager Singleton', () => {
		it('should return the same instance for the same (localDB, engine, locale)', () => {
			const manager1 = Manager.getInstance(localDB1, engine, 'en');
			const manager2 = Manager.getInstance(localDB1, engine, 'en');
			expect(manager1).toBe(manager2);
		});

		it('should create a new instance when the database changes', () => {
			const manager1 = Manager.getInstance(localDB1, engine, 'en');
			const manager2 = Manager.getInstance(localDB2, engine, 'en');
			expect(manager1).not.toBe(manager2);
		});

		it('should cancel the old instance when the database changes', () => {
			const manager1 = Manager.getInstance(localDB1, engine, 'en');
			const cancelSpy = jest.spyOn(manager1, 'cancel');
			Manager.getInstance(localDB2, engine, 'en');
			expect(cancelSpy).toHaveBeenCalled();
		});

		it('should mark the old manager cancelled when the database switches', () => {
			const manager1 = Manager.getInstance(localDB1, engine, 'en');
			expect(manager1.isCanceled).toBe(false);
			Manager.getInstance(localDB2, engine, 'en');
			expect(manager1.isCanceled).toBe(true);
		});
	});

	describe('Manager Cleanup', () => {
		it('should cancel all queries when the manager is cancelled', async () => {
			const manager = Manager.getInstance(localDB1, engine, 'en');
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

		it('should complete cancel$ when cancelled', async () => {
			const manager = Manager.getInstance(localDB1, engine, 'en');
			const completePromise = new Promise<void>((resolve) => {
				manager.cancel$.subscribe({ complete: () => resolve() });
			});
			await manager.cancel();
			await completePromise;
		});

		it('should set isCanceled when cancelled', async () => {
			const manager = Manager.getInstance(localDB1, engine, 'en');
			expect(manager.isCanceled).toBe(false);
			await manager.cancel();
			expect(manager.isCanceled).toBe(true);
		});
	});

	describe('Query Lifecycle', () => {
		it('should create a query backed by the engine collection', () => {
			const manager = Manager.getInstance(localDB1, engine, 'en');
			const query = manager.registerQuery({
				queryKeys: ['products-query'],
				collectionName: 'products',
				initialParams: {},
			});
			expect(query).toBeDefined();
			expect(query?.collection).toBe(engineDB.collections.products);
		});

		it('should return the existing query for the same queryKeys', () => {
			const manager = Manager.getInstance(localDB1, engine, 'en');
			const query1 = manager.registerQuery({
				queryKeys: ['same-key'],
				collectionName: 'products',
				initialParams: {},
			});
			const query2 = manager.registerQuery({
				queryKeys: ['same-key'],
				collectionName: 'products',
				initialParams: { selector: { name: 'test' } },
			});
			expect(query1).toBe(query2);
		});

		it('should deregister a query and cancel it', async () => {
			const manager = Manager.getInstance(localDB1, engine, 'en');
			const query = manager.registerQuery({
				queryKeys: ['to-remove'],
				collectionName: 'products',
				initialParams: {},
			});
			expect(manager.hasQuery(['to-remove'])).toBe(true);
			const cancelSpy = jest.spyOn(query!, 'cancel');
			await manager.deregisterQuery(manager.stringify(['to-remove']));
			expect(manager.hasQuery(['to-remove'])).toBe(false);
			expect(cancelSpy).toHaveBeenCalled();
		});
	});

	describe('Database Close Handler', () => {
		it('should register an onClose handler when created', () => {
			const initialOnCloseCount = localDB1.onClose.length;
			Manager.getInstance(localDB1, engine, 'en');
			expect(localDB1.onClose.length).toBeGreaterThan(initialOnCloseCount);
		});

		it('should cancel the manager when the database is closed', async () => {
			const manager = Manager.getInstance(localDB1, engine, 'en');
			expect(manager.isCanceled).toBe(false);
			await localDB1.close();
			expect(manager.isCanceled).toBe(true);
		});
	});

	describe('Query Cancellation', () => {
		it('should complete all subjects when a query is cancelled', async () => {
			const query = new Query({
				id: 'test-query',
				collection: localDB1.collections.products,
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
				collection: localDB1.collections.products,
				initialParams: {},
			});
			const testSub = query.result$.subscribe();
			query.addSub('test', testSub);
			expect(query.subs['test']).toBeDefined();
			await query.cancel();
			expect(testSub.closed).toBe(true);
		});
	});

	describe('SubscribableBase', () => {
		it('should allow adding and removing subscriptions', () => {
			const query = new Query({
				id: 'test-query',
				collection: localDB1.collections.products,
				initialParams: {},
			});
			const sub = query.result$.subscribe();
			query.addSub('custom', sub);
			expect(query.subs['custom']).toBe(sub);
			query.cancelSub('custom');
			expect(query.subs['custom']).toBeUndefined();
			expect(sub.closed).toBe(true);
		});

		it('should replace an existing subscription when adding with the same key', () => {
			const query = new Query({
				id: 'test-query',
				collection: localDB1.collections.products,
				initialParams: {},
			});
			const sub1 = query.result$.subscribe();
			const sub2 = query.result$.subscribe();
			query.addSub('key', sub1);
			expect(query.subs['key']).toBe(sub1);
			query.addSub('key', sub2);
			expect(query.subs['key']).toBe(sub2);
			expect(sub1.closed).toBe(true);
		});
	});

	describe('Collection Reset Handling', () => {
		it('should have a reset$ observable on the local database', () => {
			expect((localDB1 as any).reset$).toBeDefined();
		});

		it('should deregister queries for a collection when reset', async () => {
			const manager = Manager.getInstance(localDB1, engine, 'en');
			manager.registerQuery({
				queryKeys: ['product-query-1'],
				collectionName: 'products',
				initialParams: {},
			});
			manager.registerQuery({
				queryKeys: ['product-query-2'],
				collectionName: 'products',
				initialParams: {},
			});
			expect(manager.hasQuery(['product-query-1'])).toBe(true);
			expect(manager.hasQuery(['product-query-2'])).toBe(true);

			await manager.onCollectionReset(engineDB.collections.products as any);

			expect(manager.hasQuery(['product-query-1'])).toBe(false);
			expect(manager.hasQuery(['product-query-2'])).toBe(false);
		});
	});

	describe('AbortController', () => {
		it('should have a signal on the query', () => {
			const query = new Query({
				id: 'test-query',
				collection: localDB1.collections.products,
				initialParams: {},
			});
			expect(query.signal).toBeDefined();
			expect(query.signal).toBeInstanceOf(AbortSignal);
			expect(query.isAborted).toBe(false);
		});

		it('should abort the signal when cancelled', async () => {
			const query = new Query({
				id: 'test-query',
				collection: localDB1.collections.products,
				initialParams: {},
			});
			expect(query.isAborted).toBe(false);
			await query.cancel();
			expect(query.isAborted).toBe(true);
			expect(query.signal.aborted).toBe(true);
		});

		it('should abort the manager signal when cancelled', async () => {
			const manager = Manager.getInstance(localDB1, engine, 'en');
			expect(manager.isAborted).toBe(false);
			await manager.cancel();
			expect(manager.isAborted).toBe(true);
		});
	});
});
