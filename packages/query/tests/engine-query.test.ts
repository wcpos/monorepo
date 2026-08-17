import { waitFor } from '@testing-library/react';
import { firstValueFrom, of } from 'rxjs';

import { engineSyncCollectionCreators } from '@wcpos/sync-engine/testing';

import { observeEngineQuery } from '../src/engine-query';
import {
	createEngineDatabase,
	createFakeEngine,
	createPendingFakeEngine,
	engineProduct,
} from '../src/testing';

import type { RxDatabase } from 'rxdb';

describe('observeEngineQuery', () => {
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
			ready: Promise.resolve({ database }),
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
			ready: Promise.resolve({ database }),
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
