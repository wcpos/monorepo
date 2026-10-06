import { waitFor } from '@testing-library/react';
import { firstValueFrom, of, Subject } from 'rxjs';
import { fillWithDefaultSettings } from 'rxdb';

import { engineSyncCollectionCreators } from '@wcpos/sync-engine/testing';
import { getLogger } from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/generated/error-codes.generated';

import { observeEngineQuery } from '../src/engine-query';
import {
	createEngineDatabase,
	createFakeEngine,
	createPendingFakeEngine,
	engineProduct,
	engineVariation,
} from '../src/testing';

import type { RxDatabase } from 'rxdb';

const searchLogger = getLogger(['wcpos', 'query', 'search']);
const searchError = jest.mocked(searchLogger.error);
const searchWarn = jest.mocked(searchLogger.warn);

describe('observeEngineQuery', () => {
	it('builds once across three product search keystrokes and hydrates only matching ids', async () => {
		const database = await createEngineDatabase(['products']);
		const collection = database.collections.products;
		await collection.bulkInsert([
			engineProduct({ uuid: 'coffee', name: 'Coffee' }),
			engineProduct({ uuid: 'tea', name: 'Tea' }),
		]);
		const find = jest.spyOn(collection, 'find');
		const findByIds = jest.spyOn(collection, 'findByIds');
		const init = jest.spyOn(collection, 'initSearch');
		try {
			for (const search of ['c', 'co', 'cof']) {
				const result = await firstValueFrom(
					observeEngineQuery(createFakeEngine(database), {
						collection: 'products',
						search,
						searchFields: ['name'],
					})
				);
				expect(result.hits.map((hit) => hit.id)).toEqual(['coffee']);
			}
			expect(find).not.toHaveBeenCalled();
			expect(findByIds.mock.calls).toEqual([[['coffee']], [['coffee']], [['coffee']]]);
			expect(init).not.toHaveBeenCalled();
		} finally {
			await database.close();
		}
	});

	it('reads resolved search hit ids by findByIds without uuid $in storage selectors', async () => {
		const database = await createEngineDatabase(['products']);
		const collection = database.collections.products;
		await collection.bulkInsert([
			engineProduct({ uuid: 'hit-b', name: 'Shirt B' }),
			engineProduct({ uuid: 'hit-a', name: 'Shirt A' }),
			engineProduct({ uuid: 'other', name: 'Hammer' }),
		]);
		const documents = await collection.find().exec();
		const hits = documents.filter((document) => document.primary !== 'other');
		jest.spyOn(collection, 'initSearch').mockResolvedValue({
			collection: { $: of(null) },
			find: async () => hits,
		} as never);
		const find = jest.spyOn(collection, 'find');
		const count = jest.spyOn(collection, 'count');
		const findByIds = jest.spyOn(collection, 'findByIds');
		try {
			const result = await firstValueFrom(
				observeEngineQuery(createFakeEngine(database), {
					collection: 'products',
					search: 'shirt',
					searchFields: ['name'],
				})
			);
			expect(result.hits.map((hit) => hit.id)).toEqual(['hit-a', 'hit-b']);
			for (const [query] of [...find.mock.calls, ...count.mock.calls]) {
				expect(JSON.stringify(query?.selector ?? {})).not.toMatch(/"uuid":\{"\$in":/);
			}
			expect(findByIds.mock.calls).toEqual([[hits.map((document) => document.primary)]]);
		} finally {
			await database.close();
		}
	});

	it.each(['legacy', 'compiled'] as const)(
		'matches the old search selector result, order and count with panel filtering and paging (%s)',
		async (mode) => {
			const database = await createEngineDatabase(['products']);
			const collection = database.collections.products;
			await collection.bulkInsert([
				engineProduct({ uuid: 'cheap', name: 'Shirt', price: '5' }),
				engineProduct({ uuid: 'middle', name: 'Shirt', price: '20' }),
				engineProduct({ uuid: 'expensive', name: 'Shirt', price: '30' }),
				engineProduct({ uuid: 'sold-out', name: 'Shirt', price: '40', stock_status: 'outofstock' }),
				engineProduct({ uuid: 'variable', name: 'Shirt', price: '25', type: 'variable' }),
				engineProduct({ uuid: 'other', name: 'Hammer', price: '15' }),
			]);
			const documents = (await collection.find().exec()).filter((doc) => doc.primary !== 'other');
			jest.spyOn(collection, 'initSearch').mockResolvedValue({
				collection: { $: of(null) },
				find: async () => documents,
			} as never);
			try {
				const selector = {
					$and: [
						{ stockStatus: 'instock', type: 'simple' },
						{ uuid: { $in: documents.map((doc) => doc.primary) } },
					],
				};
				const oldHits = await collection
					.find({ selector, sort: [{ price: 'asc' }], skip: 1, limit: 1 })
					.exec();
				const oldCount = await collection.count({ selector }).exec();
				const result = await firstValueFrom(
					observeEngineQuery(createFakeEngine(database), {
						collection: 'products',
						search: 'shirt',
						searchFields: ['name'],
						skip: 1,
						limit: 1,
						...(mode === 'legacy'
							? {
									selector: { stock_status: 'instock', type: 'simple' },
									sort: [{ price: 'asc' }],
								}
							: {
									selector: { stock_status: 'instock' },
									read: {
										prefilter: {},
										residual: (doc) => doc.type === 'simple',
										complete: false,
										sort: [{ direction: 'asc', enginePath: 'price', value: (doc) => doc.price }],
										sortPushable: true,
										search: 'shirt',
										searchFields: ['name'],
										limit: 1,
									},
								}),
					})
				);
				expect(oldCount).toBe(3);
				expect(oldHits.map((doc) => doc.primary)).toEqual(['middle']);
				expect(result.hits.map((hit) => hit.id)).toEqual(oldHits.map((doc) => doc.primary));
				expect(result.count).toBe(oldCount);
			} finally {
				await database.close();
			}
		}
	);

	it('keeps the storage order for a pushable string sort (code-unit, not collated)', async () => {
		const database = await createEngineDatabase(['products']);
		const collection = database.collections.products;
		await collection.bulkInsert([
			engineProduct({ uuid: 'lower', name: 'Shirt', type: 'a-100' }),
			engineProduct({ uuid: 'upper', name: 'Shirt', type: 'Z-100' }),
			engineProduct({ uuid: 'other', name: 'Hammer', type: 'b-100' }),
		]);
		const documents = (await collection.find().exec()).filter((doc) => doc.primary !== 'other');
		jest.spyOn(collection, 'initSearch').mockResolvedValue({
			collection: { $: of(null) },
			find: async () => documents,
		} as never);
		try {
			const selector = { uuid: { $in: documents.map((doc) => doc.primary) } };
			const oldHits = await collection.find({ selector, sort: [{ type: 'asc' }] }).exec();
			const result = await firstValueFrom(
				observeEngineQuery(createFakeEngine(database), {
					collection: 'products',
					search: 'shirt',
					searchFields: ['name'],
					sort: [{ type: 'asc' }],
				})
			);
			// The storage's code-unit order puts 'Z-100' before 'a-100'; the cashier
			// collator would reverse them. The by-id path must match what the storage
			// returned before it existed.
			expect(oldHits.map((doc) => doc.primary)).toEqual(['upper', 'lower']);
			expect(result.hits.map((hit) => hit.id)).toEqual(['upper', 'lower']);
		} finally {
			await database.close();
		}
	});

	it('returns empty search hits after the blob read without count or findByIds calls', async () => {
		const database = await createEngineDatabase(['products']);
		const collection = database.collections.products;
		await collection.insert(engineProduct({ uuid: 'other', name: 'Hammer' }));
		jest.spyOn(collection, 'initSearch').mockResolvedValue({
			collection: { $: of(null) },
			find: async () => [],
		} as never);
		const find = jest.spyOn(collection, 'find');
		const count = jest.spyOn(collection, 'count');
		const findByIds = jest.spyOn(collection, 'findByIds');
		try {
			const result = await firstValueFrom(
				observeEngineQuery(createFakeEngine(database), {
					collection: 'products',
					search: 'shirt',
					searchFields: ['name'],
				})
			);
			expect(result).toEqual({ hits: [], count: 0, searchState: 'answered' });
			expect(find).not.toHaveBeenCalled();
			expect(count).not.toHaveBeenCalled();
			expect(findByIds).not.toHaveBeenCalled();
		} finally {
			await database.close();
		}
	});

	it('re-emits search hits when a hit stops satisfying the panel selector', async () => {
		const database = await createEngineDatabase(['products']);
		const collection = database.collections.products;
		const hit = await collection.insert(engineProduct({ uuid: 'hit', name: 'Shirt' }));
		// A single index answer isolates point-read reactivity from search-lane reruns.
		jest.spyOn(collection, 'initSearch').mockResolvedValue({
			collection: { $: of(null) },
			find: async () => [hit],
		} as never);
		const results: { ids: string[]; count: number }[] = [];
		const subscription = observeEngineQuery(createFakeEngine(database), {
			collection: 'products',
			search: 'shirt',
			searchFields: ['name'],
			selector: { stock_status: 'instock' },
		}).subscribe((result) =>
			results.push({ ids: result.hits.map((entry) => entry.id), count: result.count })
		);
		try {
			await waitFor(() => expect(results.at(-1)).toEqual({ ids: ['hit'], count: 1 }));
			await hit.incrementalPatch({ stockStatus: 'outofstock' });
			await waitFor(() => expect(results.at(-1)).toEqual({ ids: [], count: 0 }));
		} finally {
			subscription.unsubscribe();
			await database.close();
		}
	});

	it.each([
		['products', 'index'],
		['products', 'unavailable'],
		['products', 'stalled'],
		['variations', 'index'],
		['variations', 'unavailable'],
		['variations', 'stalled'],
	] as const)(
		'matches every Georgian search term in %s before counting/paging via %s',
		async (collection, lane) => {
			const database = await createEngineDatabase([collection]);
			const engine = createFakeEngine(database);
			const record = collection === 'products' ? engineProduct : engineVariation;
			await database.collections[collection].bulkInsert([
				record({ uuid: 'phrase', id: 1, name: 'xxxx MY საბარგული xxxx' }),
				record({ uuid: 'model', id: 2, name: 'M3 საბარგული' }),
				record({ uuid: 'reverse', id: 3, name: 'საბარგული MY' }),
				record({ uuid: 'gap', id: 4, name: 'MY xxxx საბარგული' }),
				record({ uuid: 'split', id: 5, name: 'საბარგული', sku: 'MY' }),
			]);
			const documents = await database.collections[collection].find().exec();
			const find = jest.fn().mockResolvedValue(documents);
			const init = jest.spyOn(database.collections[collection], 'initSearch');
			if (lane === 'unavailable') init.mockResolvedValue(null);
			else
				init.mockResolvedValue({
					collection: { $: of(null) },
					find: lane === 'stalled' ? () => new Promise(() => {}) : find,
				} as never);
			const recreateSearch = jest.fn();
			Object.assign(database.collections[collection], { recreateSearch });
			try {
				const result = await firstValueFrom(
					observeEngineQuery(engine, {
						collection,
						search: 'MY საბარგული',
						searchFields: ['name', 'sku'],
						limit: 1,
					})
				);
				expect(result.count).toBe(4);
				expect(result.hits.map((hit) => hit.id)).toEqual(['gap']);
				const all = await firstValueFrom(
					observeEngineQuery(engine, {
						collection,
						search: 'MY საბარგული',
						searchFields: ['name', 'sku'],
					})
				);
				expect(all.hits.map((hit) => hit.id).sort()).toEqual(['gap', 'phrase', 'reverse', 'split']);
				expect(recreateSearch).not.toHaveBeenCalled();
				expect(init).not.toHaveBeenCalled();
				expect(find).not.toHaveBeenCalled();
			} finally {
				await database.close();
			}
		}
	);

	it('keeps an all-term hit beyond the first 100 catalogue rows', async () => {
		const database = await createEngineDatabase(['products']);
		const engine = createFakeEngine(database);
		const products = Array.from({ length: 150 }, (_, id) =>
			engineProduct({
				uuid: `candidate-${id}`,
				id: id + 1,
				name: id === 149 ? 'xxxx MY საბარგული xxxx' : `M3 საბარგული ${id}`,
			})
		);
		await database.collections.products.bulkInsert(products);
		try {
			const result = await firstValueFrom(
				observeEngineQuery(engine, {
					collection: 'products',
					search: 'MY საბარგული',
					searchFields: ['name'],
					limit: 1,
				})
			);
			expect(result.count).toBe(1);
			expect(result.hits.map((hit) => hit.id)).toEqual(['candidate-149']);
		} finally {
			await database.close();
		}
	});

	it.each([
		['MY', 'xxMYxx'],
		['A', 'CAB'],
		['A B', 'xxB gap Axx'],
		['0.4', 'Coil 0.4 ohm'],
		['0,4', 'Coil 0,4 ohm'],
	])('matches all short terms in %s and reacts to writes', async (search, name) => {
		const database = await createEngineDatabase(['products']);
		const init = jest.spyOn(database.collections.products, 'initSearch');
		await database.collections.products.insert(
			engineProduct({ uuid: 'empty', id: 1, name: 'zzz' })
		);
		let latest: string[] | null = null;
		const sub = observeEngineQuery(createFakeEngine(database), {
			collection: 'products',
			search,
			searchFields: ['name'],
		}).subscribe((result) => {
			latest = result.hits.map((hit) => hit.id);
		});
		try {
			await waitFor(() => expect(latest).toEqual([]));
			await database.collections.products.insert(engineProduct({ uuid: 'embedded', id: 2, name }));
			await waitFor(() => expect(latest).toEqual(['embedded']));
			expect(init).not.toHaveBeenCalled();
		} finally {
			sub.unsubscribe();
			await database.close();
		}
	});

	it('exposes the native engine record beside the legacy document', async () => {
		const database = await createEngineDatabase(['products']);
		const engine = createFakeEngine(database);
		await database.collections.products.insert(
			engineProduct({ uuid: 'native-record', id: 42, name: 'Native record' })
		);

		try {
			const result = await firstValueFrom(observeEngineQuery(engine, { collection: 'products' }));
			const hit = result.hits[0];

			expect(hit.record.payload.name).toBe('Native record');
			expect(hit.record).toBe(await database.collections.products.findOne('native-record').exec());
			expect(hit.record.payload.name).toBe('Native record');
		} finally {
			await database.close();
		}
	});

	it('matches one- and two-character substrings including identifiers', async () => {
		const database = await createEngineDatabase(['products']);
		const engine = createFakeEngine(database);
		await database.collections.products.bulkInsert([
			engineProduct({ uuid: 'sku-prefix', id: 1, name: 'Plain', sku: '42' }),
			engineProduct({ uuid: 'name-prefix', id: 2, name: 'Nails 42mm', sku: 'X' }),
			engineProduct({ uuid: 'mid-token', id: 3, name: 'Box', sku: 'AB-400' }),
		]);

		try {
			for (const term of ['4', '42']) {
				const result = await firstValueFrom(
					observeEngineQuery(engine, {
						collection: 'products',
						search: term,
						searchFields: ['name', 'sku'],
					})
				);
				expect(result.hits.map((hit) => hit.id).sort()).toEqual(
					term === '4' ? ['mid-token', 'name-prefix', 'sku-prefix'] : ['name-prefix', 'sku-prefix']
				);
			}
		} finally {
			await database.close();
		}
	});

	it('folds accented short prefixes and NFD input', async () => {
		const database = await createEngineDatabase(['products']);
		const engine = createFakeEngine(database);
		await database.collections.products.insert(
			engineProduct({ uuid: 'accented-prefix', id: 1, name: 'Éclair 42' })
		);

		try {
			// The NFD 'éc' is 3 code units but folds to 2 chars: it must route to the
			// short-prefix path on its FOLDED length, or the index's minlength drops it.
			for (const term of ['ec', 'é'.normalize('NFD'), 'éc'.normalize('NFD')]) {
				const result = await firstValueFrom(
					observeEngineQuery(engine, {
						collection: 'products',
						search: term,
						searchFields: ['name'],
					})
				);
				expect(result.hits.map((hit) => hit.id)).toEqual(['accented-prefix']);
			}
		} finally {
			await database.close();
		}
	});

	it('reacts to source writes for short searches without an empty id storage selector', async () => {
		const database = await createEngineDatabase(['products']);
		const engine = createFakeEngine(database);
		await database.collections.products.insert(
			engineProduct({ uuid: 'unrelated', id: 1, name: 'Hammer', sku: 'ABC' })
		);
		const collection = database.collections.products;
		const find = jest.spyOn(collection, 'find');
		let ids: string[] = [];
		const subscription = observeEngineQuery(engine, {
			collection: 'products',
			search: '4',
			searchFields: ['name', 'sku'],
		}).subscribe((result) => {
			ids = result.hits.map((hit) => hit.id);
		});

		try {
			await waitFor(() => expect(ids).toEqual([]));
			expect(find.mock.calls).not.toContainEqual([
				expect.objectContaining({ selector: { uuid: { $in: [] } } }),
			]);
			await collection.insert(
				engineProduct({ uuid: 'reactive-prefix', id: 2, name: 'Nails 42mm' })
			);
			await waitFor(() => expect(ids).toEqual(['reactive-prefix']));
		} finally {
			subscription.unsubscribe();
			await database.close();
		}
	});

	it('falls back to the collection searchFields when the descriptor omits them', async () => {
		const database = await createEngineDatabase(['products']);
		const engine = createFakeEngine(database);
		await database.collections.products.insert(
			engineProduct({ uuid: 'fallback-hit', id: 1, name: 'Plain', sku: '42' })
		);
		// Mirror initSearch's fallback source: collection.options.searchFields.
		(database.collections.products as { options?: { searchFields?: string[] } }).options = {
			searchFields: ['name', 'sku'],
		};

		try {
			const result = await firstValueFrom(
				observeEngineQuery(engine, { collection: 'products', search: '4' })
			);
			expect(result.hits.map((hit) => hit.id)).toEqual(['fallback-hit']);
		} finally {
			await database.close();
		}
	});

	it('keeps short-search collection read failures eligible for storage recovery', async () => {
		const error = new Error('could not requestRemote: SyntaxError: value is not valid JSON');
		const resetCollection = jest.fn().mockRejectedValue(error);
		const database = {
			collections: {
				products: {
					$: of(null),
					initSearch: async () => ({ collection: { $: of(null) }, find: async () => [] }),
					schema: {
						jsonSchema: fillWithDefaultSettings(engineSyncCollectionCreators().products.schema),
					},
					storageInstance: { query: () => Promise.reject(error) },
				},
			},
		};
		const engine = {
			active: () => ({ database, scopeId: 'store-short-search' }),
			db$: (listener) => {
				listener(database);
				return () => undefined;
			},
			ready: Promise.resolve(),
			scope: { resetCollection },
		};

		await new Promise<void>((resolve) => {
			observeEngineQuery(engine as never, {
				collection: 'products',
				search: '4',
				searchFields: ['name'],
			}).subscribe({
				error: (received) => {
					expect(received).toBe(error);
					resolve();
				},
			});
		});

		// A search read error is a genuine
		// storage error, so the recovery path must attempt the collection reset.
		expect(resetCollection).toHaveBeenCalled();
	});

	it('answers three-character terms from the blob', async () => {
		const database = await createEngineDatabase(['products']);
		const engine = createFakeEngine(database);
		await database.collections.products.insert(
			engineProduct({ uuid: 'flex-hit', id: 1, name: 'Abc product' })
		);
		const document = await database.collections.products.findOne('flex-hit').exec();
		if (!document) throw new Error('missing flex fixture');
		const search = jest.fn(async () => [document]);
		const initSearch = jest
			.spyOn(database.collections.products, 'initSearch')
			.mockResolvedValue({ collection: { $: of(null) }, find: search } as never);

		try {
			const result = await firstValueFrom(
				observeEngineQuery(engine, {
					collection: 'products',
					search: 'abc',
					searchFields: ['name'],
				})
			);
			expect(initSearch).not.toHaveBeenCalled();
			expect(search).not.toHaveBeenCalled();
			expect(result.hits.map((hit) => hit.id)).toEqual(['flex-hit']);
		} finally {
			await database.close();
		}
	});

	describe('search state and legitimate matches', () => {
		beforeEach(() => {
			searchError.mockClear();
			searchWarn.mockClear();
		});

		it('marks the pre-database placeholder pending and real answers answered', async () => {
			const database = await createEngineDatabase(['products']);
			await database.collections.products.insert(
				engineProduct({ uuid: 'answered-hit', id: 1, name: 'Abc product' })
			);
			const document = await database.collections.products.findOne('answered-hit').exec();
			if (!document) throw new Error('missing answered fixture');
			jest
				.spyOn(database.collections.products, 'initSearch')
				.mockResolvedValue({ collection: { $: of(null) }, find: async () => [document] } as never);
			const pending = createPendingFakeEngine(database);
			const listeners = new Set<(current: RxDatabase | null) => void>();
			pending.engine.db$ = (listener) => {
				listeners.add(listener);
				listener(null);
				return () => listeners.delete(listener);
			};
			const states: (string | undefined)[] = [];
			let ids: string[] = [];
			const subscription = observeEngineQuery(pending.engine, {
				collection: 'products',
				search: 'abc',
				searchFields: ['name'],
			}).subscribe((result) => {
				states.push(result.searchState);
				ids = result.hits.map((hit) => hit.id);
			});

			try {
				// The placeholder emitted before any engine database is bound is NOT an
				// answer — rendering it as "no products found" is the #1733 lie.
				expect(states).toEqual(['pending']);
				listeners.forEach((listener) => listener(database as never));
				await waitFor(() => expect(states.at(-1)).toBe('answered'));
				expect(ids).toEqual(['answered-hit']);
			} finally {
				subscription.unsubscribe();
				pending.open();
				await database.close();
			}
		});

		it('accepts legitimate plain and diacritic-normalized matches', async () => {
			const database = await createEngineDatabase(['products']);
			const engine = createFakeEngine(database);
			await database.collections.products.bulkInsert([
				engineProduct({ uuid: 'cooltech', id: 1, name: 'Cobalt CoolTech&trade; Fitness Short' }),
				engineProduct({ uuid: 'edition', id: 2, name: 'Édition Spéciale' }),
			]);
			const cooltech = await database.collections.products.findOne('cooltech').exec();
			const edition = await database.collections.products.findOne('edition').exec();
			if (!cooltech || !edition) throw new Error('missing legitimate-match fixtures');
			jest.spyOn(database.collections.products, 'initSearch').mockResolvedValue({
				collection: { $: of(null) },
				find: async (term: string) => (term === 'cooltech' ? [cooltech] : [edition]),
			} as never);
			const recreateSearch = jest.fn();
			Object.assign(database.collections.products, { recreateSearch });

			try {
				for (const [search, expected] of [
					['cooltech', 'cooltech'],
					['edition', 'edition'],
				] as const) {
					const result = await firstValueFrom(
						observeEngineQuery(engine, {
							collection: 'products',
							search,
							searchFields: ['name'],
						})
					);
					expect(result.hits.map((hit) => hit.id)).toEqual([expected]);
				}
				expect(searchError).not.toHaveBeenCalled();
				expect(recreateSearch).not.toHaveBeenCalled();
			} finally {
				await database.close();
			}
		});

		it('accepts a mid-word substring match', async () => {
			const database = await createEngineDatabase(['products']);
			const engine = createFakeEngine(database);
			await database.collections.products.insert(
				engineProduct({ uuid: 'sweatshirt', id: 1, name: 'Ajax Full-Zip Sweatshirt' })
			);
			const document = await database.collections.products.findOne('sweatshirt').exec();
			if (!document) throw new Error('missing mid-word fixture');
			jest.spyOn(database.collections.products, 'initSearch').mockResolvedValue({
				collection: { $: of(null) },
				find: async () => [document],
			} as never);
			const recreateSearch = jest.fn();
			Object.assign(database.collections.products, { recreateSearch });

			try {
				const result = await firstValueFrom(
					observeEngineQuery(engine, {
						collection: 'products',
						search: 'shirt',
						searchFields: ['name'],
					})
				);
				expect(result.hits.map((hit) => hit.id)).toEqual(['sweatshirt']);
				expect(searchError).not.toHaveBeenCalled();
				expect(recreateSearch).not.toHaveBeenCalled();
			} finally {
				await database.close();
			}
		});

		it('accepts punctuation-delimited query tokens', async () => {
			const database = await createEngineDatabase(['products']);
			const engine = createFakeEngine(database);
			await database.collections.products.insert(
				engineProduct({ uuid: 'red-shirt', id: 1, name: 'Red-Shirt XL' })
			);
			const document = await database.collections.products.findOne('red-shirt').exec();
			if (!document) throw new Error('missing punctuation fixture');
			jest.spyOn(database.collections.products, 'initSearch').mockResolvedValue({
				collection: { $: of(null) },
				find: async () => [document],
			} as never);
			const recreateSearch = jest.fn();
			Object.assign(database.collections.products, { recreateSearch });

			try {
				const result = await firstValueFrom(
					observeEngineQuery(engine, {
						collection: 'products',
						search: 'red-shirt',
						searchFields: ['name'],
					})
				);
				expect(result.hits.map((hit) => hit.id)).toEqual(['red-shirt']);
				expect(searchError).not.toHaveBeenCalled();
				expect(recreateSearch).not.toHaveBeenCalled();
			} finally {
				await database.close();
			}
		});
	});

	it('runs the real products query after null-to-live and database-identity transitions', async () => {
		const database = await createEngineDatabase(['products']);
		await database.collections.products.insert(
			engineProduct({ uuid: 'seeded-product', id: 1, name: 'Seeded product' })
		);
		const pending = createPendingFakeEngine(database);
		const listeners = new Set<(current: RxDatabase | null) => void>();
		pending.engine.db$ = (listener) => {
			listeners.add(listener);
			listener(null);
			return () => listeners.delete(listener);
		};
		// Model two scope-database identities exposing the same real RxCollection.
		// Collection identity alone must not suppress the second database binding.
		const firstDatabase = { collections: database.collections } as RxDatabase;
		const secondDatabase = { collections: database.collections } as RxDatabase;
		const counts: number[] = [];
		const results: unknown[] = [];
		const subscription = observeEngineQuery(pending.engine, {
			collection: 'products',
			selector: { stock_status: 'instock' },
		}).subscribe((result) => {
			counts.push(result.count);
			results.push(result);
		});

		try {
			expect(counts).toEqual([0]);
			expect(results[0]).toEqual({ count: 0, hits: [] });
			listeners.forEach((listener) => listener(firstDatabase));
			await waitFor(() => expect(counts.filter((count) => count === 1)).toHaveLength(1));

			listeners.forEach((listener) => listener(secondDatabase));
			await waitFor(() => expect(counts.filter((count) => count === 1)).toHaveLength(2));
		} finally {
			subscription.unsubscribe();
			pending.open();
			await database.close();
		}
	});

	it('rebinds when db$ re-emits the same database with a replaced collection', async () => {
		const database = await createEngineDatabase(['products']);
		const engine = createFakeEngine(database);
		const listeners = new Set<(current: typeof database | null) => void>();
		engine.db$ = (listener) => {
			listeners.add(listener);
			listener(database);
			return () => listeners.delete(listener);
		};
		await database.collections.products.insert(
			engineProduct({ uuid: 'before-reset', id: 1, name: 'Before reset' })
		);
		let residentIds: string[] = [];
		const subscription = observeEngineQuery(engine, {
			collection: 'products',
		}).subscribe((result) => {
			residentIds = result.hits.map((hit) => hit.id);
		});

		try {
			await waitFor(() => expect(residentIds).toEqual(['before-reset']));

			await database.collections.products.remove();
			await database.addCollections({
				products: engineSyncCollectionCreators().products as never,
			});
			listeners.forEach((listener) => listener(database));
			await database.collections.products.insert(
				engineProduct({ uuid: 'after-reset', id: 2, name: 'After reset' })
			);

			await waitFor(() => expect(residentIds).toEqual(['after-reset']));
		} finally {
			subscription.unsubscribe();
			await database.close();
		}
	});
});

/**
 * A store switch moves the engine to a new scope database, but `engine.ready` is
 * created ONCE — `const ready = switchScope(initialScope)` in
 * create-rxdb-sync-engine — and keeps resolving to the ActiveScope the engine
 * BOOTED on, whose `database` reference is the outgoing scope's. Anything that
 * subscribes AFTER the switch (a variations popover, the customer picker) must
 * still read the ACTIVE scope.
 */
describe('observeEngineQuery across a store switch', () => {
	it('reads the ACTIVE scope database, not the one `ready` still names', async () => {
		const bootScope = await createEngineDatabase(['products']);
		const activeScopeDatabase = await createEngineDatabase(['products']);
		await bootScope.collections.products.insert(
			engineProduct({ uuid: 'boot-scope', id: 1, name: 'Outgoing store' })
		);
		await activeScopeDatabase.collections.products.insert(
			engineProduct({ uuid: 'active-scope', id: 2, name: 'Incoming store' })
		);
		const engine = createFakeEngine(activeScopeDatabase);
		engine.ready = Promise.resolve({
			identity: { site: 'https://test', storeId: '1', cashierId: '1' },
			scopeId: 'boot-scope',
			database: bootScope,
		});
		engine.active = () => ({
			identity: { site: 'https://test', storeId: '2', cashierId: '1' },
			scopeId: 'active-scope',
			database: activeScopeDatabase,
		});
		engine.db$ = (listener: (database: RxDatabase | null) => void) => {
			listener(activeScopeDatabase);
			return () => undefined;
		};

		let ids: string[] = [];
		const subscription = observeEngineQuery(engine, { collection: 'products' }).subscribe(
			(result) => {
				ids = result.hits.map((hit) => hit.id);
			}
		);

		try {
			await waitFor(() => expect(ids).toEqual(['active-scope']));
			// `ready` has long since resolved, so its continuation runs a microtask after
			// subscribe — after the first, correct emission.
			await new Promise((resolve) => setTimeout(resolve, 0));
			expect(ids).toEqual(['active-scope']);
		} finally {
			subscription.unsubscribe();
			await bootScope.close();
			await activeScopeDatabase.close();
		}
	});
});
