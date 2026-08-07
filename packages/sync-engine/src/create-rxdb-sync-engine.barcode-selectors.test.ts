import { beforeEach, describe, expect, it, vi } from 'vitest';
import { setPremiumFlag } from 'rxdb-premium/plugins/shared';

import { type SyncEvent } from '@wcpos/sync-core';

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
		seedPosBootstrapLanes.mockReset();
		seedPosBootstrapLanes.mockResolvedValue(undefined);
	});

	it('hydrates selectors before bootstrap seeding', async () => {
		const order: string[] = [];
		const selectorsAtSeed: unknown[] = [];
		let engineUnderTest: ReturnType<typeof createRxdbSyncEngine> | undefined;
		seedPosBootstrapLanes.mockImplementation(async () => {
			order.push('seed');
			// The seed runs INSIDE the scope open, so the carriers it will
			// materialize by must already be on the scope by now.
			selectorsAtSeed.push(engineUnderTest?.active()?.barcodeSelectors);
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
		engineUnderTest = engine;

		await engine.ready;

		expect(order).toEqual(['hydrate', 'seed']);
		expect(selectorsAtSeed).toEqual([
			{ products: ['global_unique_id'], variations: ['meta_data:_barcode'] },
		]);
		expect(engine.active()!.barcodeSelectors).toEqual({
			products: ['global_unique_id'],
			variations: ['meta_data:_barcode'],
		});
		await engine.dispose();
	});

	it('continues bootstrap and leaves the scope carrier-less when hydration fails', async () => {
		const diagnostics: SyncEvent[] = [];
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
		// A failed hydration leaves THIS scope with no carriers, so scans fall back
		// online instead of matching on a guessed field (#869 review). Nothing has
		// to be reset for that to hold: the carriers were never process state.
		expect(engine.active()!.barcodeSelectors).toEqual({ products: [], variations: [] });
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
			// Seeded with NO carriers — the failed hydration's consequence, and what
			// the recovery below has to undo.
			const product = materializeTargeted('products', remoteProduct, []).storedDocument;
			const database = input.database as RxDatabase;
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

	it("drops the previous attempt's carriers when a retried hydration fails", async () => {
		// A failed bootstrap seed leaves the scope un-bootstrapped, so the NEXT
		// switch re-runs hydration. If that retry fails, the first attempt's
		// carriers must not stay active — the site's barcode setting may have
		// changed in between, and materializing by a stale carrier is worse than
		// materializing by none (which falls back to the online resolve).
		let configRequests = 0;
		seedPosBootstrapLanes.mockRejectedValue(new Error('seed unavailable'));
		const engine = createRxdbSyncEngine(
			{
				site: {
					syncBaseUrl: 'https://example.test/wp-json/wcpos/v2',
					wpJsonRoot: 'https://example.test/wp-json',
				},
				storage: memoryEngineStorage(),
				mode: 'manual',
				fetcher: async () => {
					configRequests += 1;
					if (configRequests === 1) return configResponse();
					throw new Error('config unavailable');
				},
			},
			{ site: 'https://example.test', storeId: 1, cashierId: `hydrate-${identity}` }
		);

		// Attempt 1: hydration succeeds, the bootstrap seed fails.
		await engine.ready;
		expect(engine.active()!.barcodeSelectors).toEqual({
			products: ['global_unique_id'],
			variations: ['meta_data:_barcode'],
		});
		expect(engine.status().bootstrapFailed).not.toEqual({});

		// Attempt 2: the scope is still un-bootstrapped, so the switch re-hydrates
		// — and this time the config read fails.
		await engine.scope.switch({
			site: 'https://example.test',
			storeId: 1,
			cashierId: `hydrate-${identity}`,
		});
		expect(configRequests).toBeGreaterThan(1);
		expect(engine.active()!.barcodeSelectors).toEqual({ products: [], variations: [] });

		await engine.dispose();
	});

	it('gives each engine its own carriers — a later engine inherits nothing', async () => {
		const engineFor = (input: { cashierId: string; fetcher: typeof fetch }) =>
			createRxdbSyncEngine(
				{
					site: {
						syncBaseUrl: 'https://example.test/wp-json/wcpos/v2',
						wpJsonRoot: 'https://example.test/wp-json',
					},
					storage: memoryEngineStorage(),
					mode: 'manual',
					fetcher: input.fetcher as never,
				},
				{ site: 'https://example.test', storeId: 1, cashierId: input.cashierId }
			);

		const first = engineFor({
			cashierId: `hydrate-${identity}-a`,
			fetcher: (async () => configResponse()) as never,
		});
		await first.ready;
		expect(first.active()!.barcodeSelectors).toEqual({
			products: ['global_unique_id'],
			variations: ['meta_data:_barcode'],
		});

		// The second engine's own hydration fails. Its scope stays carrier-less —
		// the first engine's carriers are unreachable from here by construction,
		// disposed or not, because they live on the first engine's scope.
		const second = engineFor({
			cashierId: `hydrate-${identity}-b`,
			fetcher: (async () => {
				throw new Error('config unavailable');
			}) as never,
		});
		await second.ready;
		expect(second.active()!.barcodeSelectors).toEqual({ products: [], variations: [] });
		expect(first.active()!.barcodeSelectors).toEqual({
			products: ['global_unique_id'],
			variations: ['meta_data:_barcode'],
		});

		await first.dispose();
		expect(second.active()!.barcodeSelectors).toEqual({ products: [], variations: [] });
		await second.dispose();
	});
});
