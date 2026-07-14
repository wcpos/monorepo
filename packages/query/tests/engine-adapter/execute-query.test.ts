import { addRxPlugin, createRxDatabase } from 'rxdb';
import { RxDBMigrationSchemaPlugin } from 'rxdb/plugins/migration-schema';
import { firstValueFrom, Observable } from 'rxjs';
import { filter, take } from 'rxjs/operators';

import { engineSyncCollectionCreators, memoryEngineStorage } from '@wcpos/sync-engine/testing';

import { executeAdapterQuery } from '../../src/engine-adapter/execute-query';
import { wrapEngineDocument } from '../../src/engine-adapter/document-proxy';

import type { EngineDocument } from '../../src/engine-adapter/collection-map';
import type { AdapterDatabase, AdapterQueryResult } from '../../src/engine-adapter/execute-query';
import type { RxCollection, RxDatabase, RxDocument } from 'rxdb';

let sequence = 0;

addRxPlugin(RxDBMigrationSchemaPlugin);

function product(
	id: string,
	wooProductId: number,
	name: string,
	price: string,
	tagIds: number[] = []
) {
	return {
		id,
		wooProductId,
		price: Math.round(Number(price) * 100) / 100,
		stockStatus: 'instock',
		type: 'simple',
		categoryIds: [7],
		brandIds: [4],
		onSale: false,
		featured: false,
		stockQuantity: 2,
		payload: {
			id: wooProductId,
			name,
			price,
			stock_status: 'instock',
			type: 'simple',
			categories: [{ id: 7 }],
			brands: [{ id: 4 }],
			tags: tagIds.map((tagId) => ({ id: tagId })),
		},
		sync: { revision: '1', partial: false, source: 'woo-rest' },
		local: { dirty: false, pendingMutationIds: [] },
	};
}

async function openProductsDatabase(): Promise<{
	database: RxDatabase;
	products: RxCollection<EngineDocument>;
}> {
	const database = await createRxDatabase({
		name: `query-engine-adapter-${(sequence += 1)}`,
		storage: memoryEngineStorage({ validate: false }),
		multiInstance: false,
	});
	const creators = engineSyncCollectionCreators();
	await database.addCollections({ products: creators.products as never });
	return {
		database,
		products: database.collections.products as RxCollection<EngineDocument>,
	};
}

describe('executeAdapterQuery', () => {
	it('applies promoted prefilter, residual, numeric sort, skip, and limit in order', async () => {
		const { database, products } = await openProductsDatabase();
		await products.bulkInsert([
			product('product-b', 2, 'B', '1.004', [9]),
			product('product-a', 1, 'A', '1.003', [9]),
			product('product-c', 3, 'C', '2.00', [9]),
			product('product-x', 4, 'X', '0.50', [8]),
		]);

		const result = await firstValueFrom(
			executeAdapterQuery({
				database: database as unknown as AdapterDatabase,
				collection: 'products',
				selector: {
					categories: { $elemMatch: { id: 7 } },
					tags: { $elemMatch: { id: 9 } },
				},
				sort: [{ sortable_price: 'asc' }],
				skip: 1,
				limit: 1,
			})
		);

		expect(result.count).toBe(3);
		expect(result.hits.map((document) => document.id)).toEqual(['product-b']);
		expect(result.elapsed).toBeGreaterThanOrEqual(0);
		await database.close();
	});

	it('uses engine id as a stable sort tiebreaker', async () => {
		const { database, products } = await openProductsDatabase();
		await products.bulkInsert([
			product('product-z', 2, 'Same', '1.00'),
			product('product-a', 1, 'Same', '1.00'),
		]);

		const result = await firstValueFrom(
			executeAdapterQuery({
				database: database as unknown as AdapterDatabase,
				collection: 'products',
				selector: {},
				sort: [{ name: 'asc' }],
			})
		);
		expect(result.hits.map((document) => document.id)).toEqual(['product-a', 'product-z']);
		await database.close();
	});

	it('reacts to engine insert, update, and delete emissions', async () => {
		const { database, products } = await openProductsDatabase();
		await products.insert(product('product-a', 1, 'A', '1.00'));
		const results: AdapterQueryResult[] = [];
		const subscription = executeAdapterQuery({
			database: database as unknown as AdapterDatabase,
			collection: 'products',
			selector: {},
			sort: [{ name: 'asc' }],
		}).subscribe((result) => results.push(result));

		await firstValueFrom(
			executeAdapterQuery({
				database: database as unknown as AdapterDatabase,
				collection: 'products',
				selector: { uuid: 'product-a' },
			}).pipe(take(1))
		);
		const inserted = await products.insert(product('product-b', 2, 'B', '2.00'));
		await firstValueFrom(
			executeAdapterQuery({
				database: database as unknown as AdapterDatabase,
				collection: 'products',
				selector: {},
			}).pipe(
				filter((result) => result.count === 2),
				take(1)
			)
		);
		await inserted.incrementalPatch({
			payload: { ...inserted.payload, name: 'C' },
		});
		await inserted.getLatest().remove();
		await firstValueFrom(
			executeAdapterQuery({
				database: database as unknown as AdapterDatabase,
				collection: 'products',
				selector: {},
			}).pipe(
				filter((result) => result.count === 1),
				take(1)
			)
		);

		expect(results.some((result) => result.count === 2)).toBe(true);
		expect(results.at(-1)?.hits.map((document) => document.id)).toEqual(['product-a']);
		subscription.unsubscribe();
		await database.close();
	});

	it('drives proxy field observables from a real engine RxDocument update', async () => {
		const { database, products } = await openProductsDatabase();
		const document = await products.insert(product('product-a', 1, 'A', '1.00'));
		const proxy = wrapEngineDocument('products', document) as {
			name$: Observable<unknown>;
		};
		const values: unknown[] = [];
		const subscription = proxy.name$.subscribe((value) => values.push(value));
		await document.incrementalPatch({
			payload: { ...document.payload, name: 'B' },
		});

		expect(values).toEqual(['A', 'B']);
		subscription.unsubscribe();
		await database.close();
	});

	it('unsubscribes deterministically from the RxDB query source', () => {
		const teardown = jest.fn();
		const database = {
			collections: {
				products: {
					find: () => ({
						$: new Observable<RxDocument<EngineDocument>[]>((subscriber) => {
							subscriber.next([]);
							return teardown;
						}),
					}),
				},
			},
		} as unknown as AdapterDatabase;
		const subscription = executeAdapterQuery({
			database,
			collection: 'products',
			selector: {},
		}).subscribe();

		subscription.unsubscribe();
		expect(teardown).toHaveBeenCalledTimes(1);
	});
});
