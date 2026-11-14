/** @jest-environment node */
import { createRxDatabase, type RxDatabase } from 'rxdb';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';

import type { RxdbSyncEngine } from '@wcpos/sync-engine';

import {
	categorySchema,
	couponSchema,
} from '../../sync-engine/src/collections/reference-collection-schema';
import { productSchema } from '../../sync-engine/src/collections/product-schema';
import { readCouponCatalog } from '../src/reads/coupon-catalog';

let database: RxDatabase;
let engine: RxdbSyncEngine;
const row = (id: number, payload: Record<string, unknown>) => ({
	uuid: crypto.randomUUID(),
	remoteId: String(id),
	remoteKey: String(id),
	payload,
	sync: { revision: '1', partial: false, source: 'woo-rest' },
	local: { dirty: false, pendingMutationIds: [] },
});
beforeEach(async () => {
	database = await createRxDatabase({
		name: `coupons-${crypto.randomUUID()}`,
		storage: getRxStorageMemory(),
		multiInstance: false,
	});
	await database.addCollections({
		coupons: { schema: couponSchema },
		categories: { schema: categorySchema },
		products: { schema: productSchema },
	});
	engine = { active: () => ({ database }) } as unknown as RxdbSyncEngine;
});
afterEach(async () => {
	await database.close();
});

it('reads live coupons, categories and only the requested products', async () => {
	await database.collections.coupons.insert(row(1, { code: 'save', amount: '10' }));
	await (await database.collections.coupons.insert(row(2, { code: 'removed' }))).remove();
	await database.collections.categories.insert(row(3, { parent: 0 }));
	for (const id of [4, 5])
		await database.collections.products.insert({
			...row(id, { id, categories: [{ id: 3 }] }),
			sortName: 'product',
			price: 0,
			stockStatus: 'instock',
			type: 'simple',
			categoryIds: [3],
			tagIds: [],
			brandIds: [],
			onSale: false,
			featured: false,
			stockQuantity: null,
		});
	const { coupons, categories, products } = await readCouponCatalog(engine, [4, 0, 4]);
	expect(coupons.map((r) => r.payload.code)).toEqual(['save']);
	expect(categories.map((r) => r.remoteId)).toEqual(['3']);
	expect(products.map((r) => r.remoteId)).toEqual(['4']);
	expect(products[0].payload.categories).toEqual([{ id: 3 }]);
	expect((await readCouponCatalog(engine, [])).products).toEqual([]);
});
it('returns empty arrays without a scope or collections', async () => {
	for (const scope of [null, { database: { collections: {} } }]) {
		const inactive = { active: () => scope } as unknown as RxdbSyncEngine;
		await expect(readCouponCatalog(inactive, [1])).resolves.toEqual({
			coupons: [],
			products: [],
			categories: [],
		});
	}
});
