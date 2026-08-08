/**
 * Slice 5e: the persisted scheduler DRAIN through the public handle —
 * sync('order-window-seed') persists the windowed task, sync('scheduler-drain')
 * claims it and pulls through the scripted server, orders land in the scope
 * database and the custom-pull checkpoint store advances. mode:'manual', the
 * slice-3 scripted-server style.
 */

import { describe, expect, it, vi } from 'vitest';
import { setPremiumFlag } from 'rxdb-premium/plugins/shared';

import { customerDocumentId } from '@wcpos/sync-core';

import {
	type RxdbSyncEngine,
	type RxdbSyncEnginePorts,
	type StoreScopeIdentity,
} from './create-rxdb-sync-engine';
import { createEngineHarness } from './testing';
import { seedTargetedProductSchedulerTask } from './scheduler/rx-scheduler-product-task-seeder';
import { seedTargetedLane } from './scheduler/rx-targeted-lane-seeder';

setPremiumFlag();

const SITE = 'https://lab.example.test';
const UUID_1 = '11111111-1111-4111-8111-111111111111';
let uniqueStore = 0;

function freshIdentity(): StoreScopeIdentity {
	uniqueStore += 1;
	return { site: SITE, storeId: 9, cashierId: `drain-${uniqueStore}` };
}

/** A scripted server for the windowed browser-filter lane: the /orders proxy
 * returns one open order (uuid-stamped meta — the projection keys by it). */
function scriptedOrderServer() {
	const state = { pulls: 0, urls: [] as string[] };
	const json = (body: unknown) =>
		new Response(JSON.stringify(body), {
			status: 200,
			headers: { 'content-type': 'application/json' },
		});
	const fetch = async (url: string): Promise<Response> => {
		state.urls.push(url);
		const u = new URL(url);
		if (u.pathname.endsWith('/orders')) {
			state.pulls += 1;
			return json([
				{
					id: 1,
					number: '1001',
					status: 'processing',
					total: '10.00',
					date_created_gmt: '2026-07-10T00:00:00',
					date_modified_gmt: '2026-07-10T00:00:01',
					customer_id: 0,
					_rxdb_digest: 'order-digest-1',
					meta_data: [{ id: 1, key: '_woocommerce_pos_uuid', value: UUID_1 }],
				},
			]);
		}
		throw new Error(`scripted order server: unexpected ${u.pathname}`);
	};
	return { state, fetch };
}

const PRODUCT_UUID_55 = '55555555-5555-4555-8555-555555555555';

/** A scripted server for the products browse-window lane: the /products proxy returns the
 * scripted catalog page (uuid-stamped meta — the projection keys by it); everything else
 * throws (the greedy bootstrap reference lanes fail harmlessly, as in the order case). */
function scriptedProductServer(page: Record<string, unknown>[], total?: number) {
	const state = { productPulls: 0, urls: [] as string[] };
	const json = (body: unknown) =>
		new Response(JSON.stringify(body), {
			status: 200,
			headers: {
				'content-type': 'application/json',
				...(total === undefined ? {} : { 'X-WP-Total': String(total) }),
			},
		});
	const fetch = async (url: string): Promise<Response> => {
		state.urls.push(url);
		const u = new URL(url);
		if (u.pathname.endsWith('/products')) {
			state.productPulls += 1;
			return json(page);
		}
		throw new Error(`scripted product server: unexpected ${u.pathname}`);
	};
	return { state, fetch };
}

function engineWith(
	fetch: (url: string) => Promise<Response>,
	overrides?: Partial<RxdbSyncEnginePorts>
): RxdbSyncEngine {
	const { now, diagnostics, connectivity, fetcher, ...ports } = overrides ?? {};
	return createEngineHarness({
		site: SITE,
		identity: freshIdentity(),
		mode: 'manual',
		fetch: fetcher ?? fetch,
		now,
		diagnostics,
		connectivitySignal: connectivity,
		ports,
		awaitReady: false,
	}).engine;
}

describe('scheduler drain through the public handle (slice 5e)', () => {
	it('seed → drain: the windowed order task pulls through the transport port and lands orders + checkpoint', async () => {
		const server = scriptedOrderServer();
		const engine = engineWith(server.fetch);
		await engine.ready;

		expect((await engine.sync('order-window-seed')).status).toBe('ran');
		const drained = await engine.sync('scheduler-drain');
		expect(drained.status).toBe('ran');
		expect(server.state.pulls).toBeGreaterThan(0);

		const scope = engine.active();
		if (!scope) throw new Error('no active scope');
		const orders = await (
			scope.database.collections.orders as {
				find(): { exec(): Promise<{ toJSON(): Record<string, unknown> }[]> };
			}
		)
			.find()
			.exec();
		expect(orders).toHaveLength(1);
		expect(orders[0]!.toJSON()['wooOrderId']).toBe(1);
		expect(
			(await scope.database.collections.existenceManifestOrders.findOne('1').exec())?.toJSON()
		).toMatchObject({ wooId: 1, objectType: 'order', digest: 'order-digest-1' });

		// syncCheckpoints (new to the engine recipe) is open on the scope database —
		// the custom-pull greedy lane writes it; the windowed proxy lane does not.
		expect(scope.database.collections.syncCheckpoints).toBeDefined();
		expect(engine.status().lanes['scheduler-drain']).toMatchObject({
			lastError: null,
			lastTick: { status: 'ran' },
		});
		await engine.dispose();
	});

	it('one drain attributes activity per claimed task collection, not per declaring lane', async () => {
		// Ruled 2026-08-05: scheduler-drain activity follows the executing unit's
		// collection — a drain claiming both an orders task and a products task must
		// light BOTH collections while their units run, never one lane-wide collection.
		const orderServer = scriptedOrderServer();
		const productServer = scriptedProductServer([
			{
				id: 55,
				name: 'Cold Grid Product',
				meta_data: [{ key: '_woocommerce_pos_uuid', value: PRODUCT_UUID_55 }],
			},
		]);
		const engine = engineWith(async (url) => {
			const u = new URL(url);
			if (u.pathname.endsWith('/products')) return productServer.fetch(url);
			return orderServer.fetch(url);
		});
		await engine.ready;

		expect((await engine.sync('order-window-seed')).status).toBe('ran');
		expect((await engine.sync('product-browse-window-seed')).status).toBe('ran');

		const activeSeen = new Set<string>();
		const unsubscribe = engine.statusChanges((status) => {
			for (const [collection, state] of Object.entries(status.collections)) {
				if (state.active) activeSeen.add(collection);
			}
		});
		const drained = await engine.sync('scheduler-drain');
		unsubscribe();

		expect(drained.status).toBe('ran');
		expect(orderServer.state.pulls).toBeGreaterThan(0);
		expect(productServer.state.productPulls).toBeGreaterThan(0);
		expect(activeSeen).toContain('orders');
		expect(activeSeen).toContain('products');
		// The drain is quiet again once it settles.
		expect(engine.status().collections.orders.active).toBe(false);
		expect(engine.status().collections.products.active).toBe(false);
		await engine.dispose();
	});

	it('scheduler-fetched customers land both the stripped document and customer manifest row', async () => {
		const customerUuid = '41414141-4141-4141-8141-414141414141';
		const engine = engineWith(async (url) => {
			const u = new URL(url);
			if (!u.pathname.endsWith('/customers')) throw new Error(`unexpected ${u.pathname}`);
			return new Response(
				JSON.stringify([
					{
						id: 41,
						email: 'customer@example.test',
						_rxdb_digest: 'customer-digest-41',
						meta_data: [{ key: '_woocommerce_pos_uuid', value: customerUuid }],
					},
				]),
				{ status: 200, headers: { 'content-type': 'application/json' } }
			);
		});
		await engine.ready;

		const scope = engine.active();
		if (!scope) throw new Error('no active scope');
		await seedTargetedLane(
			{
				collection: 'customers',
				idLabel: 'customer',
				keyPrefix: 'customers',
				requirementPrefix: 'customers',
				documentId: customerDocumentId,
				defaultPriority: 900,
				defaultBatchSize: 100,
				defaultCompletedDedupeForMs: 30_000,
			},
			{ ids: [41], nowMs: 1, database: scope.database }
		);
		await expect(engine.sync('scheduler-drain')).resolves.toMatchObject({ status: 'ran' });

		const customer = await scope.database.collections.customers.findOne(customerUuid).exec();
		expect(customer?.toJSON()).toMatchObject({
			wooCustomerId: 41,
			payload: { email: 'customer@example.test' },
		});
		expect('_rxdb_digest' in (customer!.toJSON().payload as object)).toBe(false);
		expect(
			(await scope.database.collections.existenceManifestCustomers.findOne('41').exec())?.toJSON()
		).toMatchObject({ wooId: 41, objectType: 'customer', digest: 'customer-digest-41' });
		await engine.dispose();
	});

	it('seed → drain: the products browse-window task lands a cold-grid page through the transport port', async () => {
		const server = scriptedProductServer([
			{
				id: 77,
				name: 'Apron',
				date_modified_gmt: '2026-07-10T00:00:01',
				meta_data: [{ id: 1, key: '_woocommerce_pos_uuid', value: PRODUCT_UUID_55 }],
			},
		]);
		const engine = engineWith(server.fetch);
		await engine.ready;

		expect((await engine.sync('product-browse-window-seed')).status).toBe('ran');
		const drained = await engine.sync('scheduler-drain');
		expect(drained.status).toBe('ran');
		expect(server.state.productPulls).toBeGreaterThan(0);
		// The first page uses the POS default catalog sort and no search.
		expect(
			server.state.urls.some((url) =>
				url.includes('/products?per_page=100&orderby=menu_order&order=asc')
			)
		).toBe(true);

		const scope = engine.active();
		if (!scope) throw new Error('no active scope');
		const product = await scope.database.collections.products.findOne(PRODUCT_UUID_55).exec();
		expect(product?.toJSON()).toMatchObject({ wooProductId: 77, payload: { name: 'Apron' } });
		await engine.dispose();
	});

	it('stores a response total with query and census freshness from the drain clock', async () => {
		const nowMs = 10_000;
		const server = scriptedProductServer([], 42);
		const engine = engineWith(server.fetch, {
			now: () => nowMs,
			intervals: { censusFreshForMs: 60_000 },
		});
		await engine.ready;
		await engine.sync('product-browse-window-seed');
		await engine.sync('scheduler-drain');

		const scope = engine.active();
		if (!scope) throw new Error('no active scope');
		const cache = scope.database.collections.queryTotalCacheEntries;
		expect(
			(await cache.findOne('products:browse-window:limit=100').exec())?.toJSON()
		).toMatchObject({
			totalMatchingRecords: 42,
			updatedAtMs: nowMs,
			freshUntilMs: nowMs + 300_000,
		});
		expect((await cache.findOne('census:products').exec())?.toJSON()).toMatchObject({
			totalMatchingRecords: 42,
			updatedAtMs: nowMs,
			freshUntilMs: nowMs + 60_000,
		});
		await engine.dispose();
	});

	it('product reset re-arms the completed browse-window seed as one bounded page', async () => {
		const server = scriptedProductServer([]);
		const engine = engineWith(server.fetch);
		await engine.ready;

		await engine.sync('product-browse-window-seed');
		await engine.sync('scheduler-drain');
		await engine.scope.resetCollection('products');
		await engine.sync('product-browse-window-seed');
		await engine.sync('scheduler-drain');

		const productUrls = server.state.urls.filter((url) =>
			new URL(url).pathname.endsWith('/products')
		);
		expect(productUrls).toHaveLength(2);
		for (const url of productUrls) {
			const parsed = new URL(url);
			expect(parsed.searchParams.get('per_page')).toBe('100');
			expect(parsed.searchParams.get('page')).toBe('1');
			expect(parsed.searchParams.has('include')).toBe(false);
		}
		await engine.dispose();
	});

	it('orders reset creates no eager order fetch demand', async () => {
		const orderUrls: string[] = [];
		const engine = engineWith(async (url) => {
			const parsed = new URL(url);
			if (parsed.pathname.endsWith('/orders')) orderUrls.push(url);
			if (parsed.pathname.endsWith('/changes/sequence-log')) {
				return Response.json({
					changes: [],
					checkpoint: { since: 0, head: 0 },
					complete: true,
				});
			}
			return Response.json([]);
		});
		await engine.ready;

		await engine.scope.resetCollection('orders');
		await engine.sync('change-signal');
		await engine.sync('scheduler-drain');

		expect(orderUrls).toEqual([]);
		await engine.dispose();
	});

	it('targeted draft payload removes the resident product through the scheduler apply path', async () => {
		const server = scriptedProductServer([
			{
				id: 77,
				status: 'draft',
				date_modified_gmt: '2026-07-10T00:00:01',
				meta_data: [{ id: 1, key: '_woocommerce_pos_uuid', value: PRODUCT_UUID_55 }],
			},
		]);
		const engine = engineWith(server.fetch);
		await engine.ready;

		const scope = engine.active();
		if (!scope) throw new Error('no active scope');
		await scope.database.collections.products.insert({
			id: PRODUCT_UUID_55,
			wooProductId: 77,
			price: 0,
			stockStatus: '',
			type: '',
			categoryIds: [],
			brandIds: [],
			onSale: false,
			featured: false,
			stockQuantity: null,
			payload: { id: 77, status: 'publish' },
			sync: { revision: '2026-07-10T00:00:00', partial: false, source: 'woo-rest' },
			local: { dirty: false, pendingMutationIds: [] },
		} as never);
		await seedTargetedProductSchedulerTask({
			productIds: [77],
			nowMs: 1,
			database: scope.database,
		});

		await expect(engine.sync('scheduler-drain')).resolves.toMatchObject({ status: 'ran' });
		expect(await scope.database.collections.products.findOne(PRODUCT_UUID_55).exec()).toBeNull();
		expect(
			server.state.urls.some((url) => {
				const parsed = new URL(url);
				return parsed.searchParams.get('include') === '77' && !parsed.searchParams.has('status');
			})
		).toBe(true);
		await engine.dispose();
	});

	it('#637 dirty-guard: the browse-window refresh does not clobber a locally-dirty product', async () => {
		// The server returns the same record (same uuid) with a server-side name; the resident
		// carries queued local work (local.dirty). withoutLocallyProtected must drop the pulled
		// row so the dirty local copy survives the window refresh.
		const server = scriptedProductServer([
			{
				id: 77,
				name: 'Server Name',
				date_modified_gmt: '2026-07-10T00:00:01',
				meta_data: [{ id: 1, key: '_woocommerce_pos_uuid', value: PRODUCT_UUID_55 }],
			},
		]);
		const engine = engineWith(server.fetch);
		await engine.ready;

		const scope = engine.active();
		if (!scope) throw new Error('no active scope');
		await scope.database.collections.products.insert({
			id: PRODUCT_UUID_55,
			wooProductId: 77,
			price: 0,
			stockStatus: '',
			type: '',
			categoryIds: [],
			brandIds: [],
			onSale: false,
			featured: false,
			stockQuantity: null,
			payload: { id: 77, name: 'Local Edit' },
			sync: { revision: '2026-07-10T00:00:00', partial: false, source: 'local' },
			local: { dirty: true, pendingMutationIds: ['m-1'] },
		} as never);

		expect((await engine.sync('product-browse-window-seed')).status).toBe('ran');
		expect((await engine.sync('scheduler-drain')).status).toBe('ran');
		expect(server.state.productPulls).toBeGreaterThan(0);

		const product = await scope.database.collections.products.findOne(PRODUCT_UUID_55).exec();
		// The locally-dirty copy stays resident — the pulled server row was dropped.
		expect(product?.toJSON()).toMatchObject({
			payload: { name: 'Local Edit' },
			local: { dirty: true },
		});
		await engine.dispose();
	});

	it('drain with nothing queued reports ran with no server traffic', async () => {
		const server = scriptedOrderServer();
		const diagnostics = vi.fn();
		const engine = engineWith(server.fetch, { diagnostics });
		await engine.ready;
		await engine.sync('scheduler-drain');
		diagnostics.mockClear();
		const report = await engine.sync('scheduler-drain');
		expect(report.status).toBe('ran');
		expect(server.state.pulls).toBe(0);
		expect(diagnostics.mock.calls.some(([event]) => event.type === 'queue.scheduler.drain')).toBe(
			false
		);
		await engine.dispose();
	});
});
