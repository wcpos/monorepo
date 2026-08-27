import { waitFor } from '@testing-library/react';
import { firstValueFrom, of, Subject } from 'rxjs';

import { engineSyncCollectionCreators } from '@wcpos/sync-engine/testing';
import { getLogger } from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/generated/error-codes.generated';

import { observeEngineQuery } from '../src/engine-query';
import {
	createEngineDatabase,
	createFakeEngine,
	createPendingFakeEngine,
	engineProduct,
} from '../src/testing';

import type { RxDatabase } from 'rxdb';

const searchLogger = getLogger(['wcpos', 'query', 'search']);
const searchError = jest.mocked(searchLogger.error);

describe('observeEngineQuery', () => {
	it('exposes the native engine record beside the legacy document', async () => {
		const database = await createEngineDatabase(['products']);
		const engine = createFakeEngine(database);
		await database.collections.products.insert(
			engineProduct({ uuid: 'native-record', id: 42, name: 'Native record' })
		);

		try {
			const result = await firstValueFrom(
				observeEngineQuery(engine, 'en', { collection: 'products' })
			);
			const hit = result.hits[0];

			expect(hit.record.payload.name).toBe('Native record');
			expect(hit.record).toBe(await database.collections.products.findOne('native-record').exec());
			expect(hit.record.payload.name).toBe('Native record');
		} finally {
			await database.close();
		}
	});

	it('matches one- and two-character word prefixes without mid-token fallthrough', async () => {
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
					observeEngineQuery(engine, 'en', {
						collection: 'products',
						search: term,
						searchFields: ['name', 'sku'],
					})
				);
				expect(result.hits.map((hit) => hit.id)).toEqual(['name-prefix', 'sku-prefix']);
				expect(result.hits.map((hit) => hit.id)).not.toContain('mid-token');
			}
		} finally {
			await database.close();
		}
	});

	it('reacts to source writes for short searches and keeps an explicit empty id selector', async () => {
		const database = await createEngineDatabase(['products']);
		const engine = createFakeEngine(database);
		await database.collections.products.insert(
			engineProduct({ uuid: 'unrelated', id: 1, name: 'Hammer', sku: 'ABC' })
		);
		const collection = database.collections.products;
		const find = jest.spyOn(collection, 'find');
		let ids: string[] = [];
		const subscription = observeEngineQuery(engine, 'en', {
			collection: 'products',
			search: '4',
			searchFields: ['name', 'sku'],
		}).subscribe((result) => {
			ids = result.hits.map((hit) => hit.id);
		});

		try {
			await waitFor(() => expect(ids).toEqual([]));
			expect(find.mock.calls).toContainEqual([
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
				observeEngineQuery(engine, 'en', { collection: 'products', search: '4' })
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
					find: () => ({ exec: () => Promise.reject(error) }),
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
			observeEngineQuery(engine as never, 'en', {
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

		// Unlike a FlexSearch index failure, a short-search read error is a genuine
		// storage error, so the recovery path must attempt the collection reset.
		expect(resetCollection).toHaveBeenCalled();
	});

	it('uses the FlexSearch instance for three-character terms', async () => {
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
				observeEngineQuery(engine, 'en', {
					collection: 'products',
					search: 'abc',
					searchFields: ['name'],
				})
			);
			expect(initSearch).toHaveBeenCalledTimes(1);
			expect(search).toHaveBeenCalledWith('abc');
			expect(result.hits.map((hit) => hit.id)).toEqual(['flex-hit']);
		} finally {
			await database.close();
		}
	});

	it('does not reset the data collection when only the search index is corrupt', async () => {
		const error = new Error('could not requestRemote: SyntaxError: value is not valid JSON');
		const resetCollection = jest.fn().mockRejectedValue(error);
		const database = {
			collections: {
				products: {
					initSearch: async () => ({
						collection: { $: of(null) },
						find: async () => Promise.reject(error),
					}),
				},
			},
		};
		const engine = {
			active: () => ({ database, scopeId: 'store-a' }),
			db$: (listener) => {
				listener(database);
				return () => undefined;
			},
			ready: Promise.resolve(),
			scope: { resetCollection },
		};

		await new Promise<void>((resolve) => {
			observeEngineQuery(engine as never, 'en', {
				collection: 'products',
				search: 'coffee',
			}).subscribe({
				error: (received) => {
					expect(received).toBe(error);
					resolve();
				},
			});
		});

		expect(resetCollection).not.toHaveBeenCalled();
	});

	describe('search index divergence self-check', () => {
		beforeEach(() => searchError.mockClear());

		it('rebuilds a divergent index and emits the corrected result set', async () => {
			const database = await createEngineDatabase(['products']);
			const engine = createFakeEngine(database);
			await database.collections.products.bulkInsert([
				engineProduct({ uuid: 'false-hit', id: 1, name: 'Oxford Shorts' }),
				engineProduct({ uuid: 'correct-hit', id: 2, name: 'Oxford Shirt' }),
			]);
			const falseHit = await database.collections.products.findOne('false-hit').exec();
			const correctHit = await database.collections.products.findOne('correct-hit').exec();
			if (!falseHit || !correctHit) throw new Error('missing divergence fixtures');
			jest
				.spyOn(database.collections.products, 'initSearch')
				.mockResolvedValueOnce({
					collection: { $: of(null) },
					find: async () => [falseHit],
				} as never)
				.mockResolvedValueOnce({
					collection: { $: of(null) },
					find: async () => [correctHit],
				} as never);
			const recreateSearch = jest.fn().mockResolvedValue(null);
			Object.assign(database.collections.products, { recreateSearch });

			try {
				const result = await firstValueFrom(
					observeEngineQuery(engine, 'divergence-first', {
						collection: 'products',
						search: 'shirt',
						searchFields: ['name'],
					})
				);

				expect(result.hits.map((hit) => hit.id)).toEqual(['correct-hit']);
				expect(recreateSearch).toHaveBeenCalledTimes(1);
				expect(searchError).toHaveBeenCalledWith('Search index divergence detected', {
					code: ERROR_CODES.SEARCH_INDEX_DIVERGENCE,
					showToast: false,
					context: {
						collection: 'products',
						locale: 'divergence-first',
						search: 'shirt',
						falseHits: [{ uuid: 'false-hit', fields: 'Oxford Shorts' }],
						totalHits: 1,
						falseHitCount: 1,
					},
				});
			} finally {
				await database.close();
			}
		});

		it('filters a second divergence without rebuilding the same index again', async () => {
			const database = await createEngineDatabase(['products']);
			const engine = createFakeEngine(database);
			await database.collections.products.bulkInsert([
				engineProduct({ uuid: 'false-hit', id: 1, name: 'Oxford Shorts' }),
				engineProduct({ uuid: 'correct-hit', id: 2, name: 'Oxford Shirt' }),
			]);
			const falseHit = await database.collections.products.findOne('false-hit').exec();
			const correctHit = await database.collections.products.findOne('correct-hit').exec();
			if (!falseHit || !correctHit) throw new Error('missing repeated-divergence fixtures');
			jest
				.spyOn(database.collections.products, 'initSearch')
				.mockResolvedValueOnce({
					collection: { $: of(null) },
					find: async () => [falseHit],
				} as never)
				.mockResolvedValueOnce({
					collection: { $: of(null) },
					find: async () => [correctHit],
				} as never)
				.mockResolvedValueOnce({
					collection: { $: of(null) },
					find: async () => [falseHit, correctHit],
				} as never);
			const recreateSearch = jest.fn().mockResolvedValue(null);
			Object.assign(database.collections.products, { recreateSearch });
			const query = {
				collection: 'products',
				search: 'shirt',
				searchFields: ['name'],
			} as const;

			try {
				await firstValueFrom(observeEngineQuery(engine, 'divergence-repeat', query));
				const result = await firstValueFrom(observeEngineQuery(engine, 'divergence-repeat', query));

				expect(result.hits.map((hit) => hit.id)).toEqual(['correct-hit']);
				expect(recreateSearch).toHaveBeenCalledTimes(1);
				expect(searchError).toHaveBeenCalledTimes(2);
				expect(searchError.mock.calls[1][1]?.context).toMatchObject({
					alreadyRebuilt: true,
					falseHitCount: 1,
				});
			} finally {
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
						observeEngineQuery(engine, 'legitimate-matches', {
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
					observeEngineQuery(engine, 'mid-word-match', {
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
				engineProduct({ uuid: 'red-shirt', id: 1, name: 'Red Shirt' })
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
					observeEngineQuery(engine, 'punctuation-match', {
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

		it('rebinds live search updates to the recreated index', async () => {
			const database = await createEngineDatabase(['products']);
			const engine = createFakeEngine(database);
			await database.collections.products.bulkInsert([
				engineProduct({ uuid: 'false-hit', id: 1, name: 'Oxford Shorts' }),
				engineProduct({ uuid: 'correct-hit', id: 2, name: 'Oxford Shirt' }),
				engineProduct({ uuid: 'later-hit', id: 3, name: 'Evening Shirt' }),
			]);
			const falseHit = await database.collections.products.findOne('false-hit').exec();
			const correctHit = await database.collections.products.findOne('correct-hit').exec();
			const laterHit = await database.collections.products.findOne('later-hit').exec();
			if (!falseHit || !correctHit || !laterHit) throw new Error('missing rebind fixtures');
			const originalUpdates = new Subject<unknown>();
			const rebuiltUpdates = new Subject<unknown>();
			const originalFind = jest.fn(async () => [falseHit]);
			let rebuiltDocuments = [correctHit];
			const rebuiltFind = jest.fn(async () => rebuiltDocuments);
			jest
				.spyOn(database.collections.products, 'initSearch')
				.mockResolvedValueOnce({
					collection: { $: originalUpdates },
					find: originalFind,
				} as never)
				.mockResolvedValueOnce({
					collection: { $: rebuiltUpdates },
					find: rebuiltFind,
				} as never);
			Object.assign(database.collections.products, { recreateSearch: jest.fn() });
			const emissions: string[][] = [];
			const subscription = observeEngineQuery(engine, 'divergence-rebind', {
				collection: 'products',
				search: 'shirt',
				searchFields: ['name'],
			}).subscribe((result) => emissions.push(result.hits.map((hit) => hit.id)));

			try {
				await waitFor(() => expect(emissions.at(-1)).toEqual(['correct-hit']));
				originalUpdates.next(null);
				await waitFor(() => expect(originalFind).toHaveBeenCalledTimes(1));

				rebuiltDocuments = [correctHit, laterHit];
				rebuiltUpdates.next(null);
				await waitFor(() => expect(emissions.at(-1)).toEqual(['correct-hit', 'later-hit']));
				expect(rebuiltFind).toHaveBeenCalledTimes(2);
			} finally {
				subscription.unsubscribe();
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
		const subscription = observeEngineQuery(pending.engine, 'en', {
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
		const subscription = observeEngineQuery(engine, 'en', {
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
		const subscription = observeEngineQuery(engine, 'en', { collection: 'products' }).subscribe(
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
