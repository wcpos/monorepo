/** @jest-environment node */
import { createRxDatabase, type RxDatabase } from 'rxdb';
import { BehaviorSubject, firstValueFrom } from 'rxjs';
import { filter, take, toArray } from 'rxjs/operators';

import type { RxdbSyncEngine } from '@wcpos/sync-engine';

import { productSchema } from '../../sync-engine/src/collections/product-schema';
import { variationSchema } from '../../sync-engine/src/collections/variation-schema';
import {
	observeCatalogByWooIds,
	readStockPayload,
	resolveStockOwnerId,
} from '../src/reads/stock-record';
import { storages } from './helpers/storages';

const productRow = (id = 1, stock = 0) => ({
	uuid: crypto.randomUUID(),
	remoteId: String(id),
	remoteKey: String(id),
	sortName: 'deleted',
	price: 0,
	stockStatus: 'outofstock',
	type: 'simple',
	categoryIds: [],
	tagIds: [],
	brandIds: [],
	onSale: false,
	featured: false,
	stockQuantity: stock,
	payload: { id, name: 'Deleted', manage_stock: true, stock_quantity: stock },
	sync: { revision: '1', partial: false, source: 'woo-rest' },
	local: { dirty: false, pendingMutationIds: [] },
});
const variationRow = (manageStock: boolean | 'parent') => {
	const {
		type: _,
		categoryIds: _c,
		tagIds: _t,
		brandIds: _b,
		onSale: _o,
		featured: _f,
		...row
	} = productRow(11);
	return {
		...row,
		parentRemoteId: '10',
		parentRemoteKey: '10',
		attributes: [],
		payload: { ...row.payload, manage_stock: manageStock },
	};
};

describe.each(storages)('%s stock reads', (_name, storage) => {
	let database: RxDatabase;
	let databases: RxDatabase[];
	let db$: BehaviorSubject<RxDatabase | null>;
	let engine: RxdbSyncEngine;
	async function openDatabase() {
		const db = await createRxDatabase({
			name: `stock-${crypto.randomUUID()}`,
			storage,
			multiInstance: false,
		});
		databases.push(db);
		await db.addCollections({
			products: { schema: productSchema },
			variations: { schema: variationSchema },
		});
		return db;
	}
	beforeEach(async () => {
		databases = [];
		database = await openDatabase();
		db$ = new BehaviorSubject<RxDatabase | null>(database);
		engine = {
			active: () => (db$.value ? { database: db$.value } : null),
			ready: Promise.resolve(),
			db$: (next: (db: RxDatabase | null) => void) => {
				const subscription = db$.subscribe(next);
				return () => subscription.unsubscribe();
			},
		} as unknown as RxdbSyncEngine;
	});
	afterEach(async () => {
		for (const db of databases) await db.close();
	});

	it('reads the last stock of a soft-deleted product keyed by its server uuid', async () => {
		const product = await database.collections.products.insert(productRow());
		await product.remove();
		await expect(readStockPayload(engine, 'products', 1)).resolves.toMatchObject({
			name: 'Deleted',
			stock_quantity: 0,
		});
	});
	it('prefers a live payload over an older tombstone with the same remote id', async () => {
		await (await database.collections.products.insert(productRow())).remove();
		await database.collections.products.insert(productRow(1, 4));
		await expect(readStockPayload(engine, 'products', 1)).resolves.toMatchObject({
			stock_quantity: 4,
		});
	});
	it('reads the latest live stock', async () => {
		const product = await database.collections.products.insert(productRow(1, 2));
		await product.incrementalPatch({ payload: { ...product.payload, stock_quantity: 3 } });
		await expect(readStockPayload(engine, 'products', 1)).resolves.toMatchObject({
			stock_quantity: 3,
		});
	});
	it('returns null for missing, invalid and unscoped reads', async () => {
		await expect(readStockPayload(engine, 'variations', 11)).resolves.toBeNull();
		await expect(readStockPayload(engine, 'products', 0)).resolves.toBeNull();
		db$.next(null);
		await expect(readStockPayload(engine, 'products', 1)).resolves.toBeNull();
	});
	it.each([
		[true, 11],
		['parent', 10],
		[null, 11],
	] as const)(
		'resolves variation stock ownership for manage_stock=%s',
		async (manageStock, ownerId) => {
			if (manageStock !== null)
				await (await database.collections.variations.insert(variationRow(manageStock))).remove();
			await expect(resolveStockOwnerId(engine, 10, 11)).resolves.toBe(ownerId);
		}
	);
	it('a simple product owns its own stock without a read', async () => {
		const unreadable = {
			active: () => {
				throw new Error('unexpected read');
			},
		} as unknown as RxdbSyncEngine;
		await expect(resolveStockOwnerId(unreadable, 10)).resolves.toBe(10);
	});
	it('observes only requested ids and rebinds across absent and replacement databases', async () => {
		await database.collections.products.bulkInsert([productRow(1, 2), productRow(2, 9)]);
		await database.collections.variations.insert(variationRow(true));
		const other = await openDatabase();
		await other.collections.products.insert(productRow(1, 7));
		const emissions = firstValueFrom(
			observeCatalogByWooIds(engine, {
				productIds: [1, 1, 0, null],
				variationIds: [11, undefined],
			}).pipe(take(3), toArray())
		);
		// Wait for RxDB's initial query before moving scopes.
		await firstValueFrom(observeCatalogByWooIds(engine, { productIds: [1], variationIds: [11] }));
		db$.next(null);
		db$.next(other);
		const values = await emissions;
		expect(values.map(({ products }) => products.map((p) => p.payload.stock_quantity))).toEqual([
			[2],
			[],
			[7],
		]);
		expect(values.map(({ variations }) => variations.map((v) => v.remoteId))).toEqual([
			['11'],
			[],
			[],
		]);
		expect(values.map(({ available }) => available)).toEqual([true, false, true]);
	});
	it('publishes updates and deletions of the selected catalog rows', async () => {
		const product = await database.collections.products.insert(productRow(1, 2));
		const seen: number[][] = [];
		const catalog$ = observeCatalogByWooIds(engine, { productIds: [1], variationIds: [] });
		const subscription = catalog$.subscribe(({ products }) =>
			seen.push(products.map((p) => p.payload.stock_quantity!))
		);
		try {
			await firstValueFrom(catalog$);
			const updated = firstValueFrom(
				catalog$.pipe(filter(({ products }) => products[0]?.payload.stock_quantity === 1))
			);
			await product.incrementalPatch({ payload: { ...product.payload, stock_quantity: 1 } });
			await updated;
			const deleted = firstValueFrom(
				catalog$.pipe(filter(({ products }) => products.length === 0))
			);
			await product.getLatest().remove();
			await deleted;
			expect(seen).toEqual([[2], [1], []]);
		} finally {
			subscription.unsubscribe();
		}
	});
});
