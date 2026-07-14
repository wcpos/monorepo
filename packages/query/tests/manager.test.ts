import { firstValueFrom, Subject } from 'rxjs';
import { filter } from 'rxjs/operators';

import { coverageLaneSchema, queryTotalCacheSchema } from '@wcpos/sync-engine/testing';
import { getLogger } from '@wcpos/utils/logger';

import { httpClientMock } from './__mocks__/http';
import { createStoreDatabase } from './helpers/db';
import { createEngineDatabase, createFakeEngine, engineProduct } from './helpers/engine';
import { Manager } from '../src/manager';

import type { FakeEngine } from './helpers/engine';
import type { Query } from '../src/query-state';
import type { RxCollection, RxDatabase } from 'rxdb';

// The Manager holds an ENGINE now (ADR 0023 increment 1b): fluent reads come
// from the engine database through the adapter; localDB survives for logs only;
// the old replication machine is gone. These tests drive the new seam against a
// fake of the engine's public handle.

describe('Manager', () => {
	let manager: Manager<RxDatabase>;
	let localDB: RxDatabase;
	let engineDB: RxDatabase;
	let engine: FakeEngine;
	const nextSearchExecution = (query: Query<RxCollection>, term: string) =>
		firstValueFrom(
			query.rxQuery$.pipe(filter((rxQuery) => rxQuery?.other?.search?.searchTerm === term))
		);
	const hasSearchResult = (result: { count?: number }, term: string, count: number) =>
		(result as { searchTerm?: string }).searchTerm === term && result.count === count;

	beforeEach(async () => {
		localDB = await createStoreDatabase();
		engineDB = await createEngineDatabase([
			'products',
			'variations',
			'orders',
			'customers',
			'categories',
		]);
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

		it('should resolve the engine collection for a mapped collection name', () => {
			expect(manager.getCollection('products')).toBe(engineDB.collections.products);
		});

		it('should resolve the local collection for logs', () => {
			expect(manager.getCollection('logs')).toBe(localDB.collections.logs);
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
			manager.registerQuery({
				queryKeys,
				collectionName: 'products',
				initialParams: {},
			});
			await manager.deregisterQuery(manager.stringify(queryKeys));
			expect(manager.hasQuery(queryKeys)).toBe(false);
		});

		it('should cancel all queries and subscriptions', async () => {
			await manager.cancel();
			expect(manager.isCanceled).toBe(true);
		});
	});

	describe('Requirement bridge (the demand plane)', () => {
		const installLocalSearch = (collection: RxCollection, fields: string[]): void => {
			type SearchDocument = {
				primary: string;
				get(path: string): unknown;
			};
			type SearchCollection = RxCollection & {
				initSearch(locale: string): Promise<{
					collection: RxCollection;
					find(term: string): Promise<SearchDocument[]>;
				}>;
			};

			(collection as SearchCollection).initSearch = async () => ({
				collection,
				find: async (term: string) => {
					const normalized = term.toLocaleLowerCase();
					const documents = (await collection.find().exec()) as unknown as SearchDocument[];
					return documents.filter((document) =>
						fields.some((field) =>
							String(document.get(field)).toLocaleLowerCase().includes(normalized)
						)
					);
				},
			});
		};

		const installSnapshotAwareSearch = (collection: RxCollection): void => {
			type SearchInitOptions = {
				searchFields?: string[];
				documentSnapshot(document: unknown): Record<string, unknown>;
			};
			type SearchCollection = RxCollection & {
				initSearch(
					locale: string,
					options: SearchInitOptions
				): Promise<{
					collection: RxCollection;
					find(term: string): Promise<unknown[]>;
				}>;
			};

			(collection as SearchCollection).initSearch = async (_locale, options) => {
				const indexed = new Map<string, { document: unknown; text: string }>();
				const indexChanges = new Subject<void>();
				const indexDocument = (document: { primary: string }) => {
					const snapshot = options.documentSnapshot(document);
					indexed.set(document.primary, {
						document,
						text: (options.searchFields ?? [])
							.map((field) => String(snapshot[field] ?? ''))
							.join(' ')
							.toLocaleLowerCase(),
					});
				};
				const documents = await collection.find().exec();
				documents.forEach(indexDocument);
				collection.find().$.subscribe((nextDocuments) => {
					indexed.clear();
					nextDocuments.forEach(indexDocument);
					indexChanges.next();
				});
				return {
					collection: { $: indexChanges } as unknown as RxCollection,
					find: async (term) => {
						const normalized = term.toLocaleLowerCase();
						return [...indexed.values()]
							.filter(({ text }) => text.includes(normalized))
							.map(({ document }) => document);
					},
				};
			};
		};

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
				initialParams: {
					selector: { status: 'processing' },
					sort: [{ date_created_gmt: 'desc' }],
				},
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
			expect(engine.searchRequireCalls).toHaveLength(0);
		});

		it('declares product search demand and re-emits when a remote match lands locally', async () => {
			installLocalSearch(engineDB.collections.products, ['payload.name', 'payload.sku']);
			const query = manager.registerQuery({
				queryKeys: ['product-search'],
				collectionName: 'products',
				initialParams: {},
			});
			if (!query) throw new Error('product query was not registered');

			const searchExecution = nextSearchExecution(query, 'keyboard');
			query.search('keyboard');
			await searchExecution;
			expect(query.currentRxQuery.other.search).toEqual({
				searchTerm: 'keyboard',
			});

			expect(engine.searchRequireCalls).toHaveLength(1);
			expect(engine.searchRequireCalls[0]?.requirement).toMatchObject({
				collection: 'products',
				kind: 'search',
				term: 'keyboard',
			});

			const remoteResult = firstValueFrom(
				query.result$.pipe(filter((result) => hasSearchResult(result, 'keyboard', 1)))
			);
			await engineDB.collections.products.insert(
				engineProduct({
					uuid: 'product-keyboard',
					id: 101,
					name: 'Mechanical Keyboard',
				})
			);
			const result = await remoteResult;

			expect((result.hits[0]?.document as unknown as { name?: string }).name).toBe(
				'Mechanical Keyboard'
			);
			expect(engine.searchRequireCalls).toHaveLength(1);
		});

		it('indexes engine documents through the legacy snapshot and updates after payload changes', async () => {
			installSnapshotAwareSearch(engineDB.collections.products);
			const product = await engineDB.collections.products.insert(
				engineProduct({
					uuid: 'renamed-product',
					id: 109,
					name: 'Mechanical Mouse',
					sku: 'M-1',
				})
			);
			const query = manager.registerQuery({
				queryKeys: ['projected-product-search'],
				collectionName: 'products',
				initialParams: {},
			});
			if (!query) throw new Error('product query was not registered');

			query.search('keyboard');
			await firstValueFrom(
				query.result$.pipe(
					filter(
						(result) =>
							(result as unknown as { searchTerm?: string }).searchTerm === 'keyboard' &&
							result.count === 0
					)
				)
			);

			const updatedResult = firstValueFrom(
				query.result$.pipe(
					filter(
						(result) =>
							(result as unknown as { searchTerm?: string }).searchTerm === 'keyboard' &&
							result.count === 1
					)
				)
			);
			await product.incrementalPatch({
				payload: { ...product.payload, name: 'Mechanical Keyboard' },
			});

			const result = await updatedResult;
			expect(result.hits[0]?.id).toBe('renamed-product');
			expect((result.hits[0]?.document as unknown as { name?: string }).name).toBe(
				'Mechanical Keyboard'
			);
		});

		it('settles fluent searchActive with the engine search requirement handle', async () => {
			installSnapshotAwareSearch(engineDB.collections.products);
			await engineDB.collections.products.insert(
				engineProduct({
					uuid: 'pending-search',
					id: 110,
					name: 'Pending Keyboard',
				})
			);

			let settleSearch!: (value: {
				action: 'fetched';
				missingRecordIds: number[];
				reason: string;
			}) => void;
			const searchReady = new Promise<{
				action: 'fetched';
				missingRecordIds: number[];
				reason: string;
			}>((resolve) => {
				settleSearch = resolve;
			});
			const originalRequire = engine.require.bind(engine);
			engine.require = (requirement) =>
				requirement.kind === 'search'
					? { ready: searchReady, release: () => undefined }
					: originalRequire(requirement);

			const query = manager.registerQuery({
				queryKeys: ['settled-search-active'],
				collectionName: 'products',
				initialParams: {},
			});
			if (!query) throw new Error('product query was not registered');
			query.search('keyboard');

			await firstValueFrom(
				query.result$.pipe(
					filter(
						(result) =>
							(result as unknown as { searchTerm?: string }).searchTerm === 'keyboard' &&
							result.searchActive
					)
				)
			);
			const settledResult = firstValueFrom(
				query.result$.pipe(
					filter(
						(result) =>
							(result as unknown as { searchTerm?: string }).searchTerm === 'keyboard' &&
							!result.searchActive
					)
				)
			);
			settleSearch({
				action: 'fetched',
				missingRecordIds: [],
				reason: 'search complete',
			});

			expect((await settledResult).count).toBe(1);
		});

		it('tracks an order search query handle as fluent searchActive', async () => {
			installSnapshotAwareSearch(engineDB.collections.orders);
			let settleSearch!: () => void;
			const searchReady = new Promise<void>((resolve) => {
				settleSearch = resolve;
			});
			let searchStarted = false;
			let searchRequirement: { kind: string } | undefined;
			const originalRequire = engine.require.bind(engine);
			engine.require = (requirement) => {
				if (!searchStarted) {
					return originalRequire(requirement);
				}
				searchRequirement = requirement;
				return { ready: searchReady, release: () => undefined };
			};

			const query = manager.registerQuery({
				queryKeys: ['settled-order-search-active'],
				collectionName: 'orders',
				initialParams: {},
			});
			if (!query) throw new Error('order query was not registered');
			searchStarted = true;
			query.search('smith');

			await firstValueFrom(
				query.result$.pipe(
					filter(
						(result) =>
							(result as unknown as { searchTerm?: string }).searchTerm === 'smith' &&
							result.searchActive
					)
				)
			);
			expect(searchRequirement?.kind).toBe('query');
			const settledResult = firstValueFrom(
				query.result$.pipe(
					filter(
						(result) =>
							(result as unknown as { searchTerm?: string }).searchTerm === 'smith' &&
							!result.searchActive
					)
				)
			);
			settleSearch();

			await settledResult;
		});

		it('drops released search generations from searchActive immediately', async () => {
			installSnapshotAwareSearch(engineDB.collections.products);
			const neverSettles = new Promise<never>(() => undefined);
			const release = jest.fn();
			const originalRequire = engine.require.bind(engine);
			engine.require = (requirement) =>
				requirement.kind === 'search'
					? { ready: neverSettles, release }
					: originalRequire(requirement);

			const query = manager.registerQuery({
				queryKeys: ['released-search-active'],
				collectionName: 'products',
				initialParams: {},
			});
			if (!query) throw new Error('product query was not registered');
			query.search('keyboard');
			await firstValueFrom(query.result$.pipe(filter((result) => result.searchActive)));

			const cleared = firstValueFrom(
				query.result$.pipe(
					filter(
						(result) =>
							!result.searchActive &&
							(result as unknown as { searchTerm?: string }).searchTerm === undefined
					)
				)
			);
			query.search('');

			await cleared;
			expect(release).toHaveBeenCalledTimes(1);
		});

		it('widens product search demand when loadMore grows the bounded query window', async () => {
			installLocalSearch(engineDB.collections.products, ['payload.name']);
			const query = manager.registerQuery({
				queryKeys: ['paginated-product-search'],
				collectionName: 'products',
				initialParams: {},
				infiniteScroll: true,
				pageSize: 25,
			});
			if (!query) throw new Error('paginated product query was not registered');

			const searchExecution = nextSearchExecution(query, 'keyboard');
			query.search('keyboard');
			await searchExecution;
			expect(engine.searchRequireCalls[0]?.requirement.limit).toBe(25);

			query.loadMore();

			expect(engine.searchRequireCalls).toHaveLength(2);
			expect(engine.searchRequireCalls[0]?.released).toBe(true);
			expect(engine.searchRequireCalls[1]?.requirement).toMatchObject({
				collection: 'products',
				kind: 'search',
				term: 'keyboard',
				limit: 50,
			});

			const laterMatch = firstValueFrom(
				query.result$.pipe(filter((result) => hasSearchResult(result, 'keyboard', 1)))
			);
			await engineDB.collections.products.insert(
				engineProduct({
					uuid: 'later-keyboard',
					id: 150,
					name: 'Later Keyboard',
				})
			);

			expect((await laterMatch).hits[0]?.id).toBe('later-keyboard');
			expect(engine.searchRequireCalls).toHaveLength(2);
		});

		it('force-refreshes the active search requirement when the query syncs', async () => {
			installLocalSearch(engineDB.collections.products, ['payload.name']);
			const query = manager.registerQuery({
				queryKeys: ['synced-product-search'],
				collectionName: 'products',
				initialParams: {},
			});
			if (!query) throw new Error('synced product query was not registered');

			const searchExecution = nextSearchExecution(query, 'keyboard');
			query.search('keyboard');
			await searchExecution;
			await manager.syncQuery(query.id);

			expect(engine.searchRequireCalls).toHaveLength(2);
			expect(engine.searchRequireCalls[1]?.requirement).toMatchObject({
				collection: 'products',
				kind: 'search',
				term: 'keyboard',
				forceRefresh: true,
				priority: 1000,
			});
			expect(engine.syncCalls).toContain('scheduler-drain');
		});

		it('re-seeds a reset reference collection before draining records back into it', async () => {
			let referenceSeeded = false;
			engine.sync = jest.fn(async (lane) => {
				engine.syncCalls.push(lane);
				if (lane === 'reference-seed') referenceSeeded = true;
				if (lane === 'scheduler-drain' && referenceSeeded) {
					await engineDB.collections.categories.insert({
						id: 'woo-category:7',
						wooId: 7,
						payload: { id: 7, name: 'Refilled' },
						sync: { revision: 'rev-7', partial: false, source: 'woo-rest' },
						local: { dirty: false, pendingMutationIds: [] },
					});
				}
				return { lane: (lane ?? 'all') as never, status: 'ran' as const };
			});
			const refill = manager.prepareCollectionResetRefill(['products/categories']);

			await engine.scope.resetCollection('categories');
			await refill();

			expect(engine.syncCalls).toEqual(['reference-seed', 'scheduler-drain']);
			await expect(engineDB.collections.categories.count().exec()).resolves.toBe(1);
		});

		it('re-seeds the product browse window and force-refreshes captured active demand', async () => {
			const query = manager.registerQuery({
				queryKeys: ['reset-targeted-product'],
				collectionName: 'products',
				initialParams: { selector: { id: 17 } },
			});
			if (!query) throw new Error('targeted product query was not registered');
			const refill = manager.prepareCollectionResetRefill(['products']);

			await manager.onCollectionReset(engineDB.collections.products);
			await refill();

			expect(engine.requireCalls.at(-1)).toMatchObject({
				collection: 'products',
				kind: 'targeted-records',
				wooIds: [17],
				forceRefresh: true,
				priority: 1000,
			});
			expect(engine.syncCalls).toEqual(['product-browse-window-seed', 'scheduler-drain']);
		});

		it('retries an identical search declaration after its requirement rejects', async () => {
			installLocalSearch(engineDB.collections.products, ['payload.name']);
			engine.searchFailure = new Error('remote search unavailable');
			const query = manager.registerQuery({
				queryKeys: ['retried-product-search'],
				collectionName: 'products',
				initialParams: {},
			});
			if (!query) throw new Error('retried product query was not registered');

			const searchExecution = nextSearchExecution(query, 'keyboard');
			query.search('keyboard');
			await searchExecution;
			expect(engine.searchRequireCalls).toHaveLength(1);

			engine.searchFailure = undefined;
			query.exec();

			expect(engine.searchRequireCalls).toHaveLength(2);
			expect(engine.searchRequireCalls[1]?.requirement.term).toBe('keyboard');
		});

		it('releases product search demand when the term changes and when search clears', async () => {
			installLocalSearch(engineDB.collections.products, ['payload.name']);
			const query = manager.registerQuery({
				queryKeys: ['changing-product-search'],
				collectionName: 'products',
				initialParams: {},
			});
			if (!query) throw new Error('product query was not registered');

			const keyboardExecution = nextSearchExecution(query, 'keyboard');
			query.search('keyboard');
			await keyboardExecution;
			expect(query.currentRxQuery.other.search).toEqual({
				searchTerm: 'keyboard',
			});
			const mouseExecution = nextSearchExecution(query, 'mouse');
			query.search('mouse');
			await mouseExecution;
			expect(query.currentRxQuery.other.search).toEqual({
				searchTerm: 'mouse',
			});

			expect(engine.searchRequireCalls).toHaveLength(2);
			expect(engine.searchRequireCalls[0]?.released).toBe(true);
			expect(engine.searchRequireCalls[1]?.requirement.term).toBe('mouse');

			query.search('');

			expect(engine.searchRequireCalls[1]?.released).toBe(true);
			expect(engine.searchRequireCalls).toHaveLength(2);
		});

		it('releases product search demand when the query surface unmounts', async () => {
			installLocalSearch(engineDB.collections.products, ['payload.name']);
			const query = manager.registerQuery({
				queryKeys: ['unmounted-product-search'],
				collectionName: 'products',
				initialParams: {},
			});
			if (!query) throw new Error('product query was not registered');

			const searchExecution = nextSearchExecution(query, 'keyboard');
			query.search('keyboard');
			await searchExecution;
			expect(query.currentRxQuery.other.search).toEqual({
				searchTerm: 'keyboard',
			});
			manager.maybePauseQueryReplications(query);

			expect(engine.searchRequireCalls[0]?.released).toBe(true);

			const staleEmission = firstValueFrom(
				query.result$.pipe(filter((result) => hasSearchResult(result, 'keyboard', 1)))
			);
			await engineDB.collections.products.insert(
				engineProduct({
					uuid: 'paused-keyboard',
					id: 151,
					name: 'Paused Keyboard',
				})
			);
			await staleEmission;

			expect(engine.searchRequireCalls).toHaveLength(1);
		});

		it('keeps serving local search results when search demand rejects', async () => {
			installLocalSearch(engineDB.collections.products, ['payload.name']);
			await engineDB.collections.products.insert(
				engineProduct({
					uuid: 'local-keyboard',
					id: 102,
					name: 'Local Keyboard',
				})
			);
			await engineDB.collections.products.insert(
				engineProduct({ uuid: 'local-mouse', id: 104, name: 'Local Mouse' })
			);
			engine.searchFailure = new Error('remote search unavailable');
			const query = manager.registerQuery({
				queryKeys: ['degraded-product-search'],
				collectionName: 'products',
				initialParams: {},
			});
			if (!query) throw new Error('product query was not registered');

			query.search('keyboard');
			const result = await firstValueFrom(
				query.result$.pipe(filter((next) => hasSearchResult(next, 'keyboard', 1)))
			);

			expect((result.hits[0]?.document as unknown as { name?: string }).name).toBe(
				'Local Keyboard'
			);
			expect(engine.searchRequireCalls).toHaveLength(1);
			expect(getLogger(['test']).warn).toHaveBeenCalledWith(
				'Search requirement failed; continuing with local results',
				expect.objectContaining({
					context: expect.objectContaining({
						collection: 'products',
						termLength: 8,
					}),
				})
			);
		});

		it('does not log the raw customer search term when search demand rejects', async () => {
			const searchTerm = 'Ada Lovelace';
			installLocalSearch(engineDB.collections.customers, ['payload.first_name']);
			engine.searchFailure = new Error('remote search unavailable');
			const query = manager.registerQuery({
				queryKeys: ['private-customer-search'],
				collectionName: 'customers',
				initialParams: {},
			});
			if (!query) throw new Error('customer query was not registered');

			const searchExecution = nextSearchExecution(query, searchTerm);
			query.search(searchTerm);
			await searchExecution;

			expect(getLogger(['test']).warn).toHaveBeenCalledWith(
				'Search requirement failed; continuing with local results',
				expect.objectContaining({
					context: expect.objectContaining({
						collection: 'customers',
						termLength: searchTerm.length,
					}),
				})
			);
			expect(JSON.stringify((getLogger(['test']).warn as jest.Mock).mock.calls)).not.toContain(
				searchTerm
			);
		});

		it('declares customer search demand and re-emits when a remote match lands locally', async () => {
			installLocalSearch(engineDB.collections.customers, [
				'payload.first_name',
				'payload.last_name',
				'payload.email',
			]);
			const query = manager.registerQuery({
				queryKeys: ['customer-search'],
				collectionName: 'customers',
				initialParams: {},
			});
			if (!query) throw new Error('customer query was not registered');

			const searchExecution = nextSearchExecution(query, 'ada');
			query.search('ada');
			await searchExecution;
			expect(query.currentRxQuery.other.search).toEqual({ searchTerm: 'ada' });
			expect(engine.searchRequireCalls[0]?.requirement).toMatchObject({
				collection: 'customers',
				kind: 'search',
				term: 'ada',
			});

			const remoteResult = firstValueFrom(
				query.result$.pipe(filter((result) => hasSearchResult(result, 'ada', 1)))
			);
			await engineDB.collections.customers.insert({
				id: 'customer-ada',
				wooCustomerId: 103,
				payload: { id: 103, first_name: 'Ada', last_name: 'Lovelace' },
				sync: { revision: '1', partial: false, source: 'woo-rest' },
				local: { dirty: false, pendingMutationIds: [] },
			});
			const result = await remoteResult;

			expect((result.hits[0]?.document as unknown as { first_name?: string }).first_name).toBe(
				'Ada'
			);
			expect(engine.searchRequireCalls).toHaveLength(1);
		});
	});

	describe('Coverage-aware replication totals', () => {
		const addCoverageCollections = async () => {
			await engineDB.addCollections({
				coverageLanes: { schema: coverageLaneSchema },
				queryTotalCacheEntries: { schema: queryTotalCacheSchema },
			} as never);
		};

		it('uses a fresh complete product browse lane total instead of the resident count', async () => {
			await addCoverageCollections();
			await engineDB.collections.products.insert(
				engineProduct({ uuid: 'resident-product', id: 120, name: 'Resident' })
			);
			const query = manager.registerQuery({
				queryKeys: ['coverage-products'],
				collectionName: 'products',
				initialParams: {},
			});
			if (!query) throw new Error('product query was not registered');

			await engineDB.collections.coverageLanes.insert({
				laneKey: 'products::products:browse-window:limit=100',
				collectionName: 'products',
				queryKey: 'products:browse-window:limit=100',
				complete: true,
				expectedRecordIds: ['woo-product:120', 'woo-product:121', 'woo-product:122'],
				freshUntilMs: Date.now() + 60_000,
				updatedAtMs: Date.now(),
				schemaVersion: 2,
			});

			const total$ = manager.replicationTotal$(query.id);
			if (!total$) throw new Error('product total projection was not created');
			await expect(firstValueFrom(total$.pipe(filter((total) => total === 3)))).resolves.toBe(3);
		});

		it('falls back to the resident count when an idle coverage lane expires', async () => {
			await addCoverageCollections();
			await engineDB.collections.products.insert(
				engineProduct({ uuid: 'expiring-resident', id: 121, name: 'Resident' })
			);
			await engineDB.collections.coverageLanes.insert({
				laneKey: 'products::products:browse-window:limit=100',
				collectionName: 'products',
				queryKey: 'products:browse-window:limit=100',
				complete: true,
				expectedRecordIds: ['woo-product:121', 'woo-product:122'],
				freshUntilMs: Date.now() + 100,
				updatedAtMs: Date.now(),
				schemaVersion: 2,
			});
			const query = manager.registerQuery({
				queryKeys: ['expiring-coverage-products'],
				collectionName: 'products',
				initialParams: {},
			});
			if (!query) throw new Error('product query was not registered');
			const total$ = manager.replicationTotal$(query.id);
			if (!total$) throw new Error('product total projection was not created');

			await firstValueFrom(total$.pipe(filter((total) => total === 2)));
			await expect(firstValueFrom(total$.pipe(filter((total) => total === 1)))).resolves.toBe(1);
		});

		it('uses a fresh query-total projection for the exact orders lane', async () => {
			await addCoverageCollections();
			const query = manager.registerQuery({
				queryKeys: ['coverage-orders'],
				collectionName: 'orders',
				initialParams: { selector: { status: 'processing' }, limit: 25 },
			});
			if (!query) throw new Error('orders query was not registered');
			const queryKey = engine.requireCalls.find(
				(requirement) => requirement.collection === 'orders' && requirement.kind === 'query'
			)?.queryKey;
			if (!queryKey) throw new Error('orders query requirement was not declared');

			await engineDB.collections.queryTotalCacheEntries.insert({
				queryKey,
				totalMatchingRecords: 42,
				freshUntilMs: Date.now() + 60_000,
				updatedAtMs: Date.now(),
				schemaVersion: 1,
			});

			const total$ = manager.replicationTotal$(query.id);
			if (!total$) throw new Error('orders total projection was not created');
			await expect(firstValueFrom(total$.pipe(filter((total) => total === 42)))).resolves.toBe(42);
		});

		it('falls back to the local count when an orders selector has undescribed predicates', async () => {
			await addCoverageCollections();
			const query = manager.registerQuery({
				queryKeys: ['filtered-coverage-orders'],
				collectionName: 'orders',
				initialParams: { selector: { created_via: 'woocommerce-pos' }, limit: 25 },
			});
			if (!query) throw new Error('orders query was not registered');
			const queryKey = engine.requireCalls.find(
				(requirement) => requirement.collection === 'orders' && requirement.kind === 'query'
			)?.queryKey;
			if (!queryKey) throw new Error('orders query requirement was not declared');

			await engineDB.collections.queryTotalCacheEntries.insert({
				queryKey,
				totalMatchingRecords: 42,
				freshUntilMs: Date.now() + 60_000,
				updatedAtMs: Date.now(),
				schemaVersion: 1,
			});

			const total$ = manager.replicationTotal$(query.id);
			if (!total$) throw new Error('orders total projection was not created');
			await expect(firstValueFrom(total$)).resolves.toBe(0);
		});

		it('keeps customer totals on the local-count fallback', async () => {
			await addCoverageCollections();
			await engineDB.collections.customers.insert({
				id: 'resident-customer',
				wooCustomerId: 130,
				payload: { id: 130, first_name: 'Resident' },
				sync: { revision: '1', partial: false, source: 'woo-rest' },
				local: { dirty: false, pendingMutationIds: [] },
			});
			await engineDB.collections.coverageLanes.insert({
				laneKey: 'customers::customers:search=resident:limit=10',
				collectionName: 'customers',
				queryKey: 'customers:search=resident:limit=10',
				complete: true,
				expectedRecordIds: Array.from({ length: 9 }, (_, index) => `customer-${index}`),
				freshUntilMs: Date.now() + 60_000,
				updatedAtMs: Date.now(),
				schemaVersion: 2,
			});
			const query = manager.registerQuery({
				queryKeys: ['coverage-customers'],
				collectionName: 'customers',
				initialParams: {},
			});
			if (!query) throw new Error('customer query was not registered');

			const total$ = manager.replicationTotal$(query.id);
			if (!total$) throw new Error('customer total projection was not created');
			await expect(firstValueFrom(total$.pipe(filter((total) => total === 1)))).resolves.toBe(1);
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

	describe('stringify error handling', () => {
		it('returns an empty string for a circular reference', () => {
			const circular: any = { a: 1 };
			circular.self = circular;
			expect(manager.stringify(circular)).toBe('');
		});
	});

	describe('engine-owned mutation surface', () => {
		it('does not expose the transitional replication-state registry', () => {
			expect(manager).not.toHaveProperty('replicationStates');
		});

		it('does not expose the transitional collection-replication factory', () => {
			expect(manager).not.toHaveProperty('registerCollectionReplication');
		});
	});
});
