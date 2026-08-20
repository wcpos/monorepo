// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createRxDatabase } from 'rxdb';

import { existenceManifestSchema } from '../local-coverage/existence-manifest-schema';
import { productSchema } from '../collections/product-schema';
import { memoryEngineStorage } from '../testing';
import { purgeMisfiledVariationProducts } from './purge-misfiled-variation-products';

import type { RxDatabase } from 'rxdb';

let dbSeq = 0;

async function openDb(): Promise<RxDatabase> {
	const db = await createRxDatabase({
		name: `purge-misfiled-${(dbSeq += 1)}`,
		storage: memoryEngineStorage(),
		multiInstance: false,
	});
	await db.addCollections({
		products: { schema: productSchema },
		existenceManifest: { schema: existenceManifestSchema },
	} as never);
	return db as RxDatabase;
}

function productDocument(input: {
	uuid: string;
	wooId: number;
	type: string;
	sku: string;
	dirty?: boolean;
}) {
	return {
		uuid: input.uuid,
		remoteId: String(input.wooId),
		price: 24,
		stockStatus: 'instock',
		type: input.type,
		categoryIds: [],
		brandIds: [],
		onSale: false,
		featured: false,
		stockQuantity: null,
		payload: {
			id: input.wooId,
			type: input.type,
			sku: input.sku,
			status: 'publish',
			name: `Doc ${input.wooId}`,
		},
		sync: { revision: '2026-08-20T15:01:04', partial: false, source: 'woo-rest' },
		local: {
			dirty: input.dirty ?? false,
			pendingMutationIds: input.dirty ? ['mutation-1'] : [],
		},
	};
}

const manifestRow = (wooId: number, objectType: 'product' | 'variation') => ({
	remoteId: String(wooId),
	wooId,
	objectType,
	digest: `digest-${wooId}`,
});

describe('purgeMisfiledVariationProducts', () => {
	it('removes variation-typed products-collection documents and their product-labelled manifest rows', async () => {
		// The pre-fix products search lane persisted Woo's variation-typed sku-leg rows
		// into the PRODUCTS collection (the dev-pro 733620209958 pollution). The sweep
		// removes the misfiled document, keeps the real product, and removes only the
		// manifest row still claiming the swept wooId is a product — a row already
		// re-labelled by a legitimate variations pull describes the real variation and
		// must survive.
		const db = await openDb();
		await db.collections.products.bulkInsert([
			productDocument({
				uuid: 'uuid-misfiled',
				wooId: 68023,
				type: 'variation',
				sku: '733620209958',
			}),
			productDocument({ uuid: 'uuid-parent', wooId: 66566, type: 'variable', sku: 'MSH09' }),
		]);
		await db.collections.existenceManifest.bulkInsert([
			manifestRow(68023, 'product'),
			manifestRow(66566, 'product'),
		]);

		const purged = await purgeMisfiledVariationProducts(db);

		expect(purged).toBe(1);
		const remaining = await db.collections.products.find().exec();
		expect(remaining.map((doc) => doc.primary)).toEqual(['uuid-parent']);
		const manifest = await db.collections.existenceManifest.find().exec();
		expect(manifest.map((row) => row.primary)).toEqual(['66566']);
		await db.close();
	});

	it('leaves a manifest row already re-labelled as a variation untouched', async () => {
		const db = await openDb();
		await db.collections.products.bulkInsert([
			productDocument({
				uuid: 'uuid-misfiled',
				wooId: 68023,
				type: 'variation',
				sku: '733620209958',
			}),
		]);
		await db.collections.existenceManifest.bulkInsert([manifestRow(68023, 'variation')]);

		const purged = await purgeMisfiledVariationProducts(db);

		expect(purged).toBe(1);
		const manifest = await db.collections.existenceManifest.find().exec();
		expect(manifest.map((row) => row.primary)).toEqual(['68023']);
		await db.close();
	});

	it('never deletes a misfiled document carrying pending local work', async () => {
		const db = await openDb();
		await db.collections.products.bulkInsert([
			productDocument({
				uuid: 'uuid-dirty',
				wooId: 68023,
				type: 'variation',
				sku: '733620209958',
				dirty: true,
			}),
		]);

		const purged = await purgeMisfiledVariationProducts(db);

		expect(purged).toBe(0);
		const remaining = await db.collections.products.find().exec();
		expect(remaining.map((doc) => doc.primary)).toEqual(['uuid-dirty']);
		await db.close();
	});

	it('is a no-op on a clean store', async () => {
		const db = await openDb();
		await db.collections.products.bulkInsert([
			productDocument({ uuid: 'uuid-simple', wooId: 100, type: 'simple', sku: 'PLAIN-1' }),
		]);

		expect(await purgeMisfiledVariationProducts(db)).toBe(0);
		expect((await db.collections.products.find().exec()).length).toBe(1);
		await db.close();
	});
});
