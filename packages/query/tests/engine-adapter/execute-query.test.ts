import { addRxPlugin, createRxDatabase } from 'rxdb';
import { RxDBMigrationSchemaPlugin } from 'rxdb/plugins/migration-schema';
import { firstValueFrom, Observable } from 'rxjs';
import { filter, take } from 'rxjs/operators';

import { engineSyncCollectionCreators, memoryEngineStorage } from '@wcpos/sync-engine/testing';

import { executeAdapterQuery } from '../../src/engine-adapter/execute-query';
import { wrapEngineDocument } from '../../src/engine-adapter/document-proxy';
import { engineVariation } from '../../src/testing';

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

function order(
	id: string,
	wooOrderId: number,
	dateCreatedGmt: string,
	cashier = '6',
	total = '10.00'
) {
	return {
		id,
		wooOrderId,
		number: String(wooOrderId),
		dateCreatedGmt,
		status: 'completed',
		total,
		customerId: 0,
		payload: {
			id: wooOrderId,
			total,
			meta_data: [
				{ id: wooOrderId * 2, key: '_pos_user', value: cashier },
				{ id: wooOrderId * 2 + 1, key: '_pos_store', value: '2' },
			],
		},
		sync: { revision: '1', partial: false, source: 'woo-rest' },
		local: { dirty: false, pendingMutationIds: [] },
	};
}

const ordersDefaultSelector = {
	$and: [
		{ meta_data: { $elemMatch: { key: '_pos_user', value: '6' } } },
		{ meta_data: { $elemMatch: { key: '_pos_store', value: '2' } } },
	],
};

async function openProductsDatabase(): Promise<{
	database: RxDatabase;
	products: RxCollection<EngineDocument>;
}> {
	const database = await createRxDatabase({
		name: `query-engine-adapter-${(sequence += 1)}`,
		storage: memoryEngineStorage({ validate: false }),
		multiInstance: false,
		allowSlowCount: true,
	});
	const creators = engineSyncCollectionCreators();
	await database.addCollections({ products: creators.products as never });
	return {
		database,
		products: database.collections.products as RxCollection<EngineDocument>,
	};
}

async function openOrdersDatabase(): Promise<{
	database: RxDatabase;
	orders: RxCollection<EngineDocument>;
}> {
	const database = await createRxDatabase({
		name: `query-engine-adapter-${(sequence += 1)}`,
		storage: memoryEngineStorage({ validate: false }),
		multiInstance: false,
		allowSlowCount: true,
	});
	const creators = engineSyncCollectionCreators();
	await database.addCollections({ orders: creators.orders as never });
	return {
		database,
		orders: database.collections.orders as RxCollection<EngineDocument>,
	};
}

describe('executeAdapterQuery', () => {
	it('pushes a complete orders query, sort, and page into RxDB', async () => {
		const { database, orders } = await openOrdersDatabase();
		const originalFind = orders.find.bind(orders);
		const find = jest
			.spyOn(orders, 'find')
			.mockImplementation((query) => originalFind(query as never));

		await firstValueFrom(
			executeAdapterQuery({
				database: database as unknown as AdapterDatabase,
				collection: 'orders',
				selector: ordersDefaultSelector,
				sort: [{ date_created_gmt: 'desc' }],
				skip: 0,
				limit: 10,
			})
		);

		expect(find).toHaveBeenCalledWith({
			selector: {
				$and: [
					{ 'payload.meta_data': { $elemMatch: { key: '_pos_user', value: '6' } } },
					{ 'payload.meta_data': { $elemMatch: { key: '_pos_store', value: '2' } } },
				],
			},
			sort: [{ dateCreatedGmt: 'desc' }],
			skip: 0,
			limit: 10,
		});
		await database.close();
	});

	it('keeps a compiled cashier, store, and date grid on the pushed fast path', async () => {
		const { database, orders } = await openOrdersDatabase();
		const originalFind = orders.find.bind(orders);
		const find = jest
			.spyOn(orders, 'find')
			.mockImplementation((query) => originalFind(query as never));
		const prefilter = {
			$and: [
				{ 'payload.meta_data': { $elemMatch: { key: '_pos_user', value: '6' } } },
				{ 'payload.meta_data': { $elemMatch: { key: '_pos_store', value: '2' } } },
				{
					dateCreatedGmt: {
						$gte: '2026-07-01T00:00:00',
						$lte: '2026-07-31T23:59:59',
					},
				},
			],
		};

		await firstValueFrom(
			executeAdapterQuery({
				database: database as unknown as AdapterDatabase,
				collection: 'orders',
				skip: 3,
				read: {
					prefilter,
					residual: () => true,
					complete: true,
					sort: [
						{
							enginePath: 'dateCreatedGmt',
							direction: 'desc',
							value: (document) => document.dateCreatedGmt,
						},
					],
					sortPushable: true,
					limit: 10,
					search: '',
				},
			})
		);

		expect(find).toHaveBeenCalledWith({
			selector: prefilter,
			sort: [{ dateCreatedGmt: 'desc' }],
			skip: 3,
			limit: 10,
		});
		await database.close();
	});

	it('pushes the engine ID order when no sort is supplied', async () => {
		const { database, products } = await openProductsDatabase();
		const originalFind = products.find.bind(products);
		const find = jest
			.spyOn(products, 'find')
			.mockImplementation((query) => originalFind(query as never));

		await firstValueFrom(
			executeAdapterQuery({
				database: database as unknown as AdapterDatabase,
				collection: 'products',
				selector: {},
				limit: 10,
			})
		);

		expect(find).toHaveBeenCalledWith({
			selector: {},
			sort: [{ id: 'asc' }],
			skip: 0,
			limit: 10,
		});
		await database.close();
	});

	it('returns one pushed-down orders page and the total matching count', async () => {
		const { database, orders } = await openOrdersDatabase();
		await orders.bulkInsert(
			Array.from({ length: 15 }, (_, index) =>
				order(
					`order-${index}`,
					index + 1,
					`2026-07-${String(index + 1).padStart(2, '0')}T00:00:00`,
					index < 11 ? '6' : '7'
				)
			)
		);

		const result = await firstValueFrom(
			executeAdapterQuery({
				database: database as unknown as AdapterDatabase,
				collection: 'orders',
				selector: ordersDefaultSelector,
				sort: [{ date_created_gmt: 'desc' }],
				limit: 5,
			})
		);

		expect(result.hits.map((document) => document.id)).toEqual([
			'order-10',
			'order-9',
			'order-8',
			'order-7',
			'order-6',
		]);
		expect(result.hits).toHaveLength(5);
		expect(result.count).toBe(11);
		await database.close();
	});

	it('reacts when a matching order enters the pushed-down page', async () => {
		const { database, orders } = await openOrdersDatabase();
		await orders.insert(order('order-1', 1, '2026-07-01T00:00:00'));
		const results = executeAdapterQuery({
			database: database as unknown as AdapterDatabase,
			collection: 'orders',
			selector: ordersDefaultSelector,
			sort: [{ date_created_gmt: 'desc' }],
			limit: 1,
		});
		await firstValueFrom(results.pipe(take(1)));
		const updated = firstValueFrom(
			results.pipe(
				filter((result) => result.count === 2 && result.hits[0]?.id === 'order-2'),
				take(1)
			)
		);

		await orders.insert(order('order-2', 2, '2026-07-02T00:00:00'));
		await expect(updated).resolves.toMatchObject({ count: 2 });
		await database.close();
	});

	it('falls back to app-side numeric order pagination when sort cannot be pushed', async () => {
		const { database, orders } = await openOrdersDatabase();
		await orders.bulkInsert([
			order('order-a', 1, '2026-07-01T00:00:00', '6', '2.00'),
			order('order-b', 2, '2026-07-02T00:00:00', '6', '10.00'),
			order('order-c', 3, '2026-07-03T00:00:00', '6', '5.00'),
			order('order-x', 4, '2026-07-04T00:00:00', '7', '100.00'),
		]);

		const result = await firstValueFrom(
			executeAdapterQuery({
				database: database as unknown as AdapterDatabase,
				collection: 'orders',
				selector: ordersDefaultSelector,
				sort: [{ sortable_total: 'desc' }],
				skip: 1,
				limit: 2,
			})
		);

		expect(result.hits.map((document) => document.id)).toEqual(['order-c', 'order-a']);
		expect(result.count).toBe(3);
		await database.close();
	});

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
		await database.close();
	});

	it('executes a precompiled read without rebuilding the query from Mango', async () => {
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
				selector: {},
				skip: 1,
				read: {
					prefilter: { categoryIds: { $in: [7] } },
					residual: (document) =>
						(document.payload.tags as { id: number }[]).some(({ id }) => id === 9),
					complete: false,
					sort: [
						{
							direction: 'asc',
							value: (document) => Number(document.payload.price),
						},
					],
					sortPushable: false,
					limit: 1,
					search: '',
				},
			})
		);

		expect(result.count).toBe(3);
		expect(result.hits.map((document) => document.id)).toEqual(['product-b']);
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

	it('orders the catalog sort by menu_order then the Woo id tiebreak (#810)', async () => {
		const { database, products } = await openProductsDatabase();
		const withMenuOrder = (document: ReturnType<typeof product>, menuOrder: number) => ({
			...document,
			payload: { ...document.payload, menu_order: menuOrder },
		});
		await products.bulkInsert([
			withMenuOrder(product('product-c', 30, 'A', '1.00'), 0),
			withMenuOrder(product('product-a', 10, 'B', '1.00'), 2),
			withMenuOrder(product('product-b', 20, 'C', '1.00'), 0),
		]);

		const result = await firstValueFrom(
			executeAdapterQuery({
				database: database as unknown as AdapterDatabase,
				collection: 'products',
				selector: {},
				sort: [{ menu_order: 'asc' }, { id: 'asc' }],
			})
		);

		// Equal menu_order (the common all-zero case) resolves by Woo id — not by
		// name or insertion order.
		expect(result.hits.map((document) => document.id)).toEqual([
			'product-b',
			'product-c',
			'product-a',
		]);
		await database.close();
	});

	it('falls back to Woo id order when menu_order is missing (1.9 contract, #810)', async () => {
		const { database, products } = await openProductsDatabase();
		await products.bulkInsert([
			product('product-z', 3, 'C', '1.00'),
			product('product-x', 1, 'A', '1.00'),
			product('product-y', 2, 'B', '1.00'),
		]);

		const result = await firstValueFrom(
			executeAdapterQuery({
				database: database as unknown as AdapterDatabase,
				collection: 'products',
				selector: {},
				sort: [{ menu_order: 'asc' }, { id: 'asc' }],
			})
		);

		expect(result.hits.map((document) => document.id)).toEqual([
			'product-x',
			'product-y',
			'product-z',
		]);
		await database.close();
	});

	it('orders variations numerically by menu_order then Woo id (#871)', async () => {
		const database = await createRxDatabase({
			name: `query-engine-adapter-${(sequence += 1)}`,
			storage: memoryEngineStorage({ validate: false }),
			multiInstance: false,
		});
		const creators = engineSyncCollectionCreators();
		await database.addCollections({ variations: creators.variations as never });
		const variations = database.collections.variations as RxCollection<EngineDocument>;
		await variations.bulkInsert([
			engineVariation({ uuid: 'variation-a', id: 20, menu_order: 2 }) as EngineDocument,
			engineVariation({ uuid: 'variation-b', id: 30, menu_order: 10 }) as EngineDocument,
			engineVariation({ uuid: 'variation-c', id: 3, menu_order: 2 }) as EngineDocument,
		]);

		const result = await firstValueFrom(
			executeAdapterQuery({
				database: database as unknown as AdapterDatabase,
				collection: 'variations',
				selector: {},
				sort: [{ menu_order: 'asc' }, { id: 'asc' }],
			})
		);

		expect(result.hits.map((document) => document.id)).toEqual([
			'variation-c',
			'variation-a',
			'variation-b',
		]);
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
					count: () => ({
						$: new Observable<number>((subscriber) => subscriber.next(0)),
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
