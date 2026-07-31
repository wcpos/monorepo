import { beforeEach, describe, expect, it, vi } from 'vitest';
import { setPremiumFlag } from 'rxdb-premium/plugins/shared';

import {
	getActiveBarcodeSelectors,
	setActiveBarcodeSelectors,
	type SyncEvent,
} from '@wcpos/sync-core';

import { createRxdbSyncEngine } from './create-rxdb-sync-engine';
import { materializeTargeted } from './materialization/record-materialization';
import { memoryEngineStorage } from './testing';

import type { RxDatabase } from 'rxdb';
import type { SeedPosBootstrapLanesInput } from './scheduler/rx-pos-bootstrap-seeder';

const seedPosBootstrapLanes = vi.hoisted(() => vi.fn());

vi.mock('./scheduler/rx-pos-bootstrap-seeder', () => ({ seedPosBootstrapLanes }));

setPremiumFlag();

let identity = 0;

function configResponse(): Response {
	return Response.json({
		fingerprints: { products: 'p1', variations: 'v1', tax_rates: 't1' },
		barcode_fields: {
			products: ['global_unique_id'],
			variations: ['meta_data:_barcode'],
			tax_rates: [],
		},
	});
}

describe('scope-open barcode selector hydration', () => {
	beforeEach(() => {
		identity += 1;
		setActiveBarcodeSelectors('products', []);
		setActiveBarcodeSelectors('variations', []);
		seedPosBootstrapLanes.mockReset();
		seedPosBootstrapLanes.mockResolvedValue(undefined);
	});

	it('hydrates selectors before bootstrap seeding', async () => {
		const order: string[] = [];
		const selectorsAtSeed: { products: string[]; variations: string[] }[] = [];
		seedPosBootstrapLanes.mockImplementation(async () => {
			order.push('seed');
			selectorsAtSeed.push({
				products: [...getActiveBarcodeSelectors('products')],
				variations: [...getActiveBarcodeSelectors('variations')],
			});
		});
		const engine = createRxdbSyncEngine(
			{
				site: {
					syncBaseUrl: 'https://example.test/wp-json/wcpos/v2',
					wpJsonRoot: 'https://example.test/wp-json',
				},
				storage: memoryEngineStorage(),
				mode: 'manual',
				fetcher: async (_url, init) => {
					order.push('hydrate');
					expect(init?.signal).toBeDefined();
					return configResponse();
				},
			},
			{ site: 'https://example.test', storeId: 1, cashierId: `hydrate-${identity}` }
		);

		await engine.ready;

		expect(order).toEqual(['hydrate', 'seed']);
		expect(selectorsAtSeed).toEqual([
			{ products: ['global_unique_id'], variations: ['meta_data:_barcode'] },
		]);
		await engine.dispose();
	});

	it('continues bootstrap and preserves selectors when hydration fails', async () => {
		const diagnostics: SyncEvent[] = [];
		setActiveBarcodeSelectors('products', ['existing-product']);
		setActiveBarcodeSelectors('variations', ['existing-variation']);
		const engine = createRxdbSyncEngine(
			{
				site: {
					syncBaseUrl: 'https://example.test/wp-json/wcpos/v2',
					wpJsonRoot: 'https://example.test/wp-json',
				},
				storage: memoryEngineStorage(),
				mode: 'manual',
				fetcher: async () => {
					throw new Error('config unavailable');
				},
				diagnostics: (event) => diagnostics.push(event),
			},
			{ site: 'https://example.test', storeId: 1, cashierId: `hydrate-${identity}` }
		);

		await expect(engine.ready).resolves.toBeDefined();
		expect(seedPosBootstrapLanes).toHaveBeenCalledOnce();
		// A previous engine's carriers (set above) must NOT survive into this
		// engine's failed hydration — the scope-open reset leaves the registry
		// empty so scans fall back online instead of using the wrong site's
		// carriers (#869 review).
		expect(getActiveBarcodeSelectors('products')).toEqual([]);
		expect(getActiveBarcodeSelectors('variations')).toEqual([]);
		expect(diagnostics).toContainEqual(
			expect.objectContaining({
				type: 'engine.barcode-selector-hydrate-failed',
				level: 'debug',
			})
		);
		await engine.dispose();
	});

	it('re-materializes records when selectors arrive after failed bootstrap hydration', async () => {
		const uuid = '11111111-1111-4111-8111-111111111111';
		const remoteProduct = {
			id: 9,
			global_unique_id: 'LATE-BARCODE',
			meta_data: [{ key: '_woocommerce_pos_uuid', value: uuid }],
			date_modified_gmt: '2026-07-30T00:00:00',
			price: '5.00',
			stock_status: 'instock',
			type: 'simple',
			categories: [],
			brands: [],
			on_sale: false,
			featured: false,
			stock_quantity: null,
		};
		seedPosBootstrapLanes.mockImplementationOnce(async (input: SeedPosBootstrapLanesInput) => {
			const repository = await input.getRepository();
			const product = materializeTargeted('products', remoteProduct).storedDocument;
			const database = repository.getDatabase() as unknown as RxDatabase;
			await database.collections.products.bulkUpsert([product]);
			return { inserted: 1, deduped: 0 };
		});
		let configRequests = 0;
		let productPulls = 0;
		const diagnostics: SyncEvent[] = [];
		const engine = createRxdbSyncEngine(
			{
				site: {
					syncBaseUrl: 'https://example.test/wp-json/wcpos/v2',
					wpJsonRoot: 'https://example.test/wp-json',
				},
				storage: memoryEngineStorage(),
				mode: 'manual',
				fetcher: async (url) => {
					const path = new URL(url).pathname;
					if (path.endsWith('/changes/config-fingerprint')) {
						configRequests += 1;
						if (configRequests === 1) throw new Error('config unavailable');
						return configResponse();
					}
					if (path.endsWith('/changes/tick')) {
						return new Response(null, { status: 404 });
					}
					if (path.endsWith('/changes/sequence-log')) {
						return Response.json({
							changes: [],
							checkpoint: { since: 0, head: 0 },
							complete: true,
						});
					}
					if (path.endsWith('/integrity/scan')) {
						return Response.json({ changes: [], checkpoint: { after_id: 0 }, complete: true });
					}
					if (path.endsWith('/changes/range-checksum')) {
						return Response.json({ changes: [], complete: true });
					}
					if (path.endsWith('/products')) {
						productPulls += 1;
						if (productPulls === 1) {
							return Response.json({ code: 'temporary_failure' }, { status: 503 });
						}
						return Response.json([remoteProduct]);
					}
					throw new Error(`unexpected request: ${url}`);
				},
				diagnostics: (event) => diagnostics.push(event),
			},
			{ site: 'https://example.test', storeId: 1, cashierId: `hydrate-${identity}` }
		);

		await engine.ready;
		const products = engine.active()!.database.collections.products;
		expect((await products.findOne(uuid).exec())!.toJSON().payload).not.toHaveProperty('barcode');

		expect((await engine.sync('change-signal')).status).toBe('error');
		expect((await products.findOne(uuid).exec())!.toJSON().payload).not.toHaveProperty('barcode');
		expect((await engine.sync('change-signal')).status).toBe('ran');

		expect(productPulls).toBe(2);
		expect((await products.findOne(uuid).exec())!.toJSON().payload).toMatchObject({
			barcode: 'LATE-BARCODE',
		});
		expect(diagnostics).toContainEqual(
			expect.objectContaining({ type: 'apply.refetch', collection: 'products' })
		);
		await engine.dispose();
	});

	it('clears the registry on dispose so a later engine cannot inherit carriers', async () => {
		const engine = createRxdbSyncEngine(
			{
				site: {
					syncBaseUrl: 'https://example.test/wp-json/wcpos/v2',
					wpJsonRoot: 'https://example.test/wp-json',
				},
				storage: memoryEngineStorage(),
				mode: 'manual',
				fetcher: async () => configResponse(),
			},
			{ site: 'https://example.test', storeId: 1, cashierId: `hydrate-${identity}` }
		);
		await engine.ready;
		expect(getActiveBarcodeSelectors('products')).toEqual(['global_unique_id']);
		expect(getActiveBarcodeSelectors('variations')).toEqual(['meta_data:_barcode']);

		await engine.dispose();

		expect(getActiveBarcodeSelectors('products')).toEqual([]);
		expect(getActiveBarcodeSelectors('variations')).toEqual([]);
	});
});
