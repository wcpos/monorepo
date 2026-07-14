import { httpClientMock } from './__mocks__/http';
import { createStoreDatabase } from './helpers/db';
import { createEngineDatabase, createFakeEngine, engineProduct } from './helpers/engine';
import { Manager } from '../src/manager';

import type { FakeEngine } from './helpers/engine';
import type { RxDatabase } from 'rxdb';

// The Manager holds an ENGINE now (ADR 0023 increment 1b): fluent reads come
// from the engine database through the adapter; localDB survives for logs only;
// the old replication machine is gone. These tests drive the new seam against a
// fake of the engine's public handle.

describe('Manager', () => {
	let manager: Manager<RxDatabase>;
	let localDB: RxDatabase;
	let engineDB: RxDatabase;
	let engine: FakeEngine;

	beforeEach(async () => {
		localDB = await createStoreDatabase();
		engineDB = await createEngineDatabase();
		engine = createFakeEngine(engineDB);
		manager = Manager.getInstance(localDB, engine, 'en', httpClientMock);
	});

	afterEach(async () => {
		if (manager) {
			await manager.cancel();
		}
		if (localDB && !localDB.destroyed) {
			await localDB.remove();
		}
		if (engineDB && !engineDB.destroyed) {
			await engineDB.remove();
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
			manager.registerQuery({ queryKeys, collectionName: 'products', initialParams: {} });
			expect(manager.hasQuery(queryKeys)).toBe(true);
		});

		it('should return false if query does not exist', () => {
			expect(manager.hasQuery(['nonExistentQuery'])).toBe(false);
		});

		it('should resolve the engine collection for a mapped collection name', () => {
			expect(manager.getCollection('products')).toBe(engineDB.collections.products);
		});

		it('should resolve the local collection for logs', () => {
			expect(manager.getCollection('logs')).toBe(localDB.collections.logs);
		});

		it('should retrieve an existing query', () => {
			const queryKeys = ['existingQuery'];
			manager.registerQuery({ queryKeys, collectionName: 'products', initialParams: {} });
			expect(manager.getQuery(queryKeys)).toBeDefined();
		});

		it('should build an engine-backed query that keys on the uuid identity', () => {
			const query = manager.registerQuery({
				queryKeys: ['identity'],
				collectionName: 'products',
				initialParams: {},
			});
			expect(query?.isEngineBacked).toBe(true);
			expect(query?.primaryKey).toBe('uuid');
		});

		it('should deregister a query', async () => {
			const queryKeys = ['queryToRemove'];
			manager.registerQuery({ queryKeys, collectionName: 'products', initialParams: {} });
			await manager.deregisterQuery(manager.stringify(queryKeys));
			expect(manager.hasQuery(queryKeys)).toBe(false);
		});

		it('should cancel all queries and subscriptions', async () => {
			await manager.cancel();
			expect(manager.isCanceled).toBe(true);
		});
	});

	describe('Requirement bridge (the demand plane)', () => {
		it('declares a targeted-records requirement for a finite-ID selector', async () => {
			manager.registerQuery({
				queryKeys: ['byIds'],
				collectionName: 'products',
				initialParams: { selector: { id: { $in: [11, 22, 33] } } },
			});
			// The rxQuery$ emission runs synchronously on exec().
			const targeted = engine.requireCalls.find((req) => req.kind === 'targeted-records');
			expect(targeted).toBeDefined();
			expect(targeted?.collection).toBe('products');
			expect(targeted?.wooIds).toEqual([11, 22, 33]);
		});

		it('declares an order query descriptor for an unbounded orders browse', () => {
			manager.registerQuery({
				queryKeys: ['orders'],
				collectionName: 'orders',
				initialParams: { selector: { status: 'processing' }, sort: [{ date_created_gmt: 'desc' }] },
			});
			const orderQuery = engine.requireCalls.find((req) => req.kind === 'query');
			expect(orderQuery?.collection).toBe('orders');
			expect(orderQuery?.queryKey).toContain('orders:browser:status=processing');
		});

		it('creates NO remote demand for an unbounded product browse (local residents only)', () => {
			manager.registerQuery({
				queryKeys: ['browse'],
				collectionName: 'products',
				initialParams: { selector: { stock_status: 'instock' } },
			});
			expect(engine.requireCalls).toHaveLength(0);
		});
	});

	describe('getInstance with changed deps', () => {
		it('returns the same instance for identical (localDB, engine, locale)', () => {
			const again = Manager.getInstance(localDB, engine, 'en', httpClientMock);
			expect(again).toBe(manager);
		});

		it('creates a new instance and cancels the old when the engine changes', async () => {
			const cancelSpy = jest.spyOn(manager, 'cancel');
			const otherEngineDB = await createEngineDatabase();
			const otherEngine = createFakeEngine(otherEngineDB);
			const next = Manager.getInstance(localDB, otherEngine, 'en', httpClientMock);
			expect(next).not.toBe(manager);
			expect(cancelSpy).toHaveBeenCalled();
			manager = next;
			await otherEngineDB.remove();
		});

		it('creates a new instance when the locale changes', () => {
			const next = Manager.getInstance(localDB, engine, 'fr', httpClientMock);
			expect(next).not.toBe(manager);
			expect(next.locale).toBe('fr');
			manager = next;
		});
	});

	describe('registerQuery edge cases', () => {
		it('returns undefined when the collection does not exist', () => {
			const result = manager.registerQuery({
				queryKeys: ['missing'],
				collectionName: 'nonExistentCollection',
				initialParams: {},
			});
			expect(result).toBeUndefined();
		});
	});

	describe('Transitional mutation remnant', () => {
		it('registerCollectionReplication returns the wc/v3 mutation surface Core calls', () => {
			const replication = manager.registerCollectionReplication({
				collection: localDB.collections.products as any,
				endpoint: 'products',
			});
			expect(typeof replication.remotePatch).toBe('function');
			expect(typeof replication.remoteCreate).toBe('function');
			expect(typeof replication.sync).toBe('function');
			expect(manager.replicationStates.has('products')).toBe(true);
		});

		it('sync({include}) maps to a targeted-records engine requirement', () => {
			const replication = manager.registerCollectionReplication({
				collection: engineDB.collections.products as any,
				endpoint: 'products',
			});
			replication.sync({ include: [5, 6], force: true });
			const targeted = engine.requireCalls.find(
				(req) => req.kind === 'targeted-records' && req.wooIds?.includes(5)
			);
			expect(targeted).toBeDefined();
			expect(targeted?.forceRefresh).toBe(true);
		});
	});

	describe('stringify error handling', () => {
		it('returns an empty string for a circular reference', () => {
			const circular: any = { a: 1 };
			circular.self = circular;
			expect(manager.stringify(circular)).toBe('');
		});
	});
});
