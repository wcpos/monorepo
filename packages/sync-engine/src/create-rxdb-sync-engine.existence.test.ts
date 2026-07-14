// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { setPremiumFlag } from 'rxdb-premium/plugins/shared';

import {
	createRxdbSyncEngine,
	type RxdbSyncEnginePorts,
	type StoreScopeIdentity,
} from './create-rxdb-sync-engine';
import { memoryEngineStorage, scriptedConnectivity } from './testing';

setPremiumFlag();

const SITE = 'https://existence.example.test';
const BASE = `${SITE}/wp-json/wc-rxdb-sync/v1`;
let scope = 0;
const identity = (): StoreScopeIdentity => ({
	site: SITE,
	storeId: 1,
	cashierId: `existence-${++scope}`,
});
const json = (body: unknown) =>
	new Response(JSON.stringify(body), {
		status: 200,
		headers: { 'content-type': 'application/json' },
	});

function engine(
	fetcher: RxdbSyncEnginePorts['fetcher'],
	overrides: Partial<RxdbSyncEnginePorts> = {}
) {
	return createRxdbSyncEngine(
		{
			site: { syncBaseUrl: BASE, wpJsonRoot: `${SITE}/wp-json` },
			storage: memoryEngineStorage(),
			mode: 'manual',
			fetcher,
			...overrides,
		},
		identity()
	);
}

async function seed(
	collection: { insert(doc: Record<string, unknown>): Promise<unknown> },
	doc: Record<string, unknown>
) {
	await collection.insert(doc);
}

afterEach(() => vi.restoreAllMocks());

describe('existence maintenance lanes through the public facade', () => {
	it('reconciles all three id spaces, pulls missing rows, protects dirty rows, and applies order tombstones without resurrection', async () => {
		const diagnostics = vi.fn();
		const fetches: string[] = [];
		const server = {
			products: [
				{ id: 10, digest: 'p10', object_type: 'product' },
				{ id: 40, digest: 'p40', object_type: 'product' },
			],
			customers: [
				{ id: 20, digest: 'c20', object_type: 'customer' },
				{ id: 41, digest: 'c41', object_type: 'customer' },
			],
			orders: [
				{ id: 30, digest: 'o30', object_type: 'order' },
				{ id: 42, digest: 'o42', object_type: 'order' },
			],
		};
		const fetcher = vi.fn(async (url: string) => {
			fetches.push(url);
			const u = new URL(url);
			const lane = (u.searchParams.get('collection') ?? 'products') as keyof typeof server;
			if (u.pathname.endsWith('/digests')) {
				const ids = (u.searchParams.get('include') ?? '').split(',').map(Number);
				return json({ digests: server[lane].filter((row) => ids.includes(row.id)) });
			}
			if (u.pathname.endsWith('/integrity/bucket')) return json({ ids: server[lane] });
			if (u.pathname.endsWith('/products'))
				return json([
					{
						id: 40,
						_rxdb_digest: 'p40',
						price: '4',
						stock_status: 'instock',
						type: 'simple',
						categories: [],
						brands: [],
						on_sale: false,
						featured: false,
						stock_quantity: null,
						meta_data: [
							{ key: '_woocommerce_pos_uuid', value: '44444444-4444-4444-8444-444444444444' },
						],
					},
				]);
			if (u.pathname.endsWith('/customers'))
				return json([
					{
						id: 41,
						_rxdb_digest: 'c41',
						meta_data: [
							{ key: '_woocommerce_pos_uuid', value: '41414141-4141-4141-8141-414141414141' },
						],
					},
				]);
			if (u.pathname.endsWith('/orders'))
				return json([
					{
						id: 42,
						_rxdb_digest: 'o42',
						number: '42',
						date_created_gmt: '2026-01-01T00:00:00',
						date_modified_gmt: '2026-01-01T00:00:00',
						status: 'processing',
						total: '1',
						customer_id: 0,
						meta_data: [
							{ key: '_woocommerce_pos_uuid', value: '42424242-4242-4242-8242-424242424242' },
						],
					},
				]);
			throw new Error(`unexpected fetch ${url}`);
		});
		const e = engine(fetcher, { diagnostics, now: () => 500 });
		await e.ready;
		const db = e.active()!.database.collections;
		const common = {
			sync: { revision: 'r', partial: false, source: 'woo-rest' },
			local: { dirty: false, pendingMutationIds: [] },
		};
		await seed(db.products as never, {
			id: 'p10',
			wooProductId: 10,
			price: 1,
			stockStatus: 'instock',
			type: 'simple',
			categoryIds: [],
			brandIds: [],
			onSale: false,
			featured: false,
			stockQuantity: null,
			payload: { id: 10 },
			...common,
		});
		await seed(db.variations as never, {
			id: 'v11',
			wooId: 11,
			parentId: 10,
			price: 1,
			stockStatus: 'instock',
			attributes: [],
			stockQuantity: null,
			payload: { id: 11 },
			...common,
		});
		await seed(db.customers as never, {
			id: 'c20',
			wooCustomerId: 20,
			payload: { id: 20 },
			...common,
		});
		await seed(db.customers as never, {
			id: 'c21',
			wooCustomerId: 21,
			payload: { id: 21 },
			sync: common.sync,
			local: { dirty: true, pendingMutationIds: ['m'] },
		});
		const order = (id: number, dirty = false) => ({
			id: `o${id}`,
			wooOrderId: id,
			number: String(id),
			dateCreatedGmt: '2026-01-01T00:00:00',
			status: 'processing',
			total: '1',
			customerId: 0,
			payload: { id },
			sync: common.sync,
			local: { dirty, pendingMutationIds: dirty ? ['m'] : [] },
		});
		await seed(db.orders as never, order(30));
		await seed(db.orders as never, order(31));
		await seed(db.orders as never, order(32, true));
		const manifest = (wooId: number, digest: string, objectType: string) => ({
			id: String(wooId),
			wooId,
			digest,
			objectType,
		});
		await seed(db.existenceManifest as never, manifest(10, 'p10', 'product'));
		await seed(db.existenceManifest as never, manifest(11, 'v11', 'variation'));
		await seed(db.existenceManifestCustomers as never, manifest(20, 'c20', 'customer'));
		await seed(db.existenceManifestCustomers as never, manifest(21, 'c21', 'customer'));
		await seed(db.existenceManifestOrders as never, manifest(30, 'o30', 'order'));
		await seed(db.existenceManifestOrders as never, manifest(31, 'o31', 'order'));
		await seed(db.existenceManifestOrders as never, manifest(32, 'o32', 'order'));

		expect((await e.sync('existence-prime')).status).toBe('ran');
		const report = await e.sync('existence-reconcile');
		expect(report).toMatchObject({ status: 'ran', lane: 'existence-reconcile' });
		expect(await db.variations.findOne('v11').exec()).toBeNull();
		expect(await db.customers.findOne('c21').exec()).not.toBeNull();
		expect(await db.orders.findOne('o31').exec()).toBeNull();
		expect(await db.orders.findOne('o32').exec()).not.toBeNull();
		expect(await db.products.findOne('44444444-4444-4444-8444-444444444444').exec()).not.toBeNull();
		expect(
			await db.customers.findOne('41414141-4141-4141-8141-414141414141').exec()
		).not.toBeNull();
		expect(await db.orders.findOne('42424242-4242-4242-8242-424242424242').exec()).not.toBeNull();
		expect(fetches.filter((url) => url.includes('/orders?'))).toHaveLength(1);
		expect(diagnostics).toHaveBeenCalledWith(
			expect.objectContaining({
				type: 'coverage.existence-reconcile',
				fields: expect.objectContaining({ pruned: 2, pulled: 3, skippedDirty: 2, durationMs: 0 }),
			})
		);

		const payloadFetchCount = fetches.filter((url) =>
			/\/(products|customers|orders)\?/.test(url)
		).length;
		const secondReport = await e.sync('existence-reconcile');
		expect(secondReport).toMatchObject({ status: 'ran', lane: 'existence-reconcile' });
		expect(fetches.filter((url) => /\/(products|customers|orders)\?/.test(url))).toHaveLength(
			payloadFetchCount
		);
		expect(
			diagnostics.mock.calls
				.map(([event]) => event)
				.filter((event) => event.type === 'coverage.existence-reconcile')
				.at(-1)
		).toEqual(
			expect.objectContaining({
				type: 'coverage.existence-reconcile',
				fields: expect.objectContaining({ pruned: 0, pulled: 0, repulled: 0 }),
			})
		);
		expect((await db.existenceManifest.findOne('40').exec())?.toJSON()).toMatchObject({
			wooId: 40,
			digest: 'p40',
		});
		expect((await db.existenceManifestCustomers.findOne('41').exec())?.toJSON()).toMatchObject({
			wooId: 41,
			digest: 'c41',
		});
		expect(
			'_rxdb_digest' in
				((await db.products.findOne('44444444-4444-4444-8444-444444444444').exec())!.toJSON()
					.payload as object)
		).toBe(false);
		expect(
			'_rxdb_digest' in
				((await db.customers.findOne('41414141-4141-4141-8141-414141414141').exec())!.toJSON()
					.payload as object)
		).toBe(false);
		await e.dispose();
	});

	it('cancels a held reconcile on scope switch without writing through the old scope', async () => {
		let releaseBucket!: () => void;
		let heldSignal: AbortSignal | undefined;
		const bucketHeld = new Promise<void>((resolve) => {
			releaseBucket = resolve;
		});
		const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
			if (new URL(url).pathname.endsWith('/integrity/bucket')) {
				heldSignal = init?.signal ?? undefined;
				await bucketHeld;
				return json({ ids: [{ id: 40, digest: 'new', object_type: 'product' }] });
			}
			if (new URL(url).pathname.endsWith('/products')) {
				return json([
					{
						id: 40,
						_rxdb_digest: 'new',
						meta_data: [
							{ key: '_woocommerce_pos_uuid', value: '44444444-4444-4444-8444-444444444444' },
						],
					},
				]);
			}
			return json({ ids: [] });
		});
		const e = engine(fetcher);
		await e.ready;
		const oldDb = e.active()!.database.collections;
		await seed(oldDb.existenceManifest as never, {
			id: '40',
			wooId: 40,
			digest: 'old',
			objectType: 'product',
		});
		const oldProductWrites = vi.spyOn(oldDb.products, 'bulkUpsert');

		const pass = e.sync('existence-reconcile');
		await vi.waitFor(() =>
			expect(fetcher.mock.calls.some(([url]) => String(url).includes('/integrity/bucket'))).toBe(
				true
			)
		);
		const switching = e.scope.switch(identity());
		await vi.waitFor(() => expect(heldSignal?.aborted).toBe(true));
		releaseBucket();

		await expect(pass).resolves.toMatchObject({ status: 'skipped' });
		await switching;
		expect(oldProductWrites).not.toHaveBeenCalled();
		await e.dispose();
	});

	it('cancels a held prime on scope switch without writing through the old scope', async () => {
		let releaseDigests!: () => void;
		let heldSignal: AbortSignal | undefined;
		const digestsHeld = new Promise<void>((resolve) => {
			releaseDigests = resolve;
		});
		const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
			if (new URL(url).pathname.endsWith('/digests')) {
				heldSignal = init?.signal ?? undefined;
				await digestsHeld;
				return json({ digests: [{ id: 40, digest: 'new' }] });
			}
			throw new Error(`unexpected fetch ${url}`);
		});
		const e = engine(fetcher);
		await e.ready;
		const oldDb = e.active()!.database.collections;
		await seed(oldDb.products as never, {
			id: 'p40',
			wooProductId: 40,
			price: 1,
			stockStatus: 'instock',
			type: 'simple',
			categoryIds: [],
			brandIds: [],
			onSale: false,
			featured: false,
			stockQuantity: null,
			payload: { id: 40 },
			sync: { revision: 'r', partial: false, source: 'woo-rest' },
			local: { dirty: false, pendingMutationIds: [] },
		});
		const oldManifestWrites = vi.spyOn(oldDb.existenceManifest, 'bulkUpsert');

		const pass = e.sync('existence-prime');
		await vi.waitFor(() =>
			expect(fetcher.mock.calls.some(([url]) => String(url).includes('/digests'))).toBe(true)
		);
		const switching = e.scope.switch(identity());
		await vi.waitFor(() => expect(heldSignal?.aborted).toBe(true));
		releaseDigests();

		await expect(pass).resolves.toMatchObject({ status: 'skipped' });
		await switching;
		expect(oldManifestWrites).not.toHaveBeenCalled();
		await e.dispose();
	});

	it('chunks order existence pulls at the Woo REST 100-record cap', async () => {
		const ids = Array.from({ length: 150 }, (_unused, index) => index + 1);
		const orderPulls: number[][] = [];
		const fetcher = vi.fn(async (url: string) => {
			const parsed = new URL(url);
			if (parsed.pathname.endsWith('/integrity/bucket')) {
				const lane = parsed.searchParams.get('collection');
				return json({
					ids:
						lane === 'orders'
							? ids.map((id) => ({ id, digest: `new-${id}`, object_type: 'order' }))
							: [],
				});
			}
			if (parsed.pathname.endsWith('/orders')) {
				const requested = (parsed.searchParams.get('include') ?? '').split(',').map(Number);
				orderPulls.push(requested);
				return json(
					requested.slice(0, 100).map((id) => ({
						id,
						_rxdb_digest: `new-${id}`,
						date_modified_gmt: '2026-01-01T00:00:00',
						meta_data: [
							{
								key: '_woocommerce_pos_uuid',
								value: `00000000-0000-4000-8000-${String(id).padStart(12, '0')}`,
							},
						],
					}))
				);
			}
			return json({ ids: [] });
		});
		const e = engine(fetcher);
		await e.ready;
		const db = e.active()!.database.collections;
		for (const id of ids) {
			await seed(db.existenceManifestOrders as never, {
				id: String(id),
				wooId: id,
				digest: `old-${id}`,
				objectType: 'order',
			});
		}

		await expect(e.sync('existence-reconcile')).resolves.toMatchObject({ status: 'ran' });
		expect(orderPulls.map((batch) => batch.length)).toEqual([100, 50]);
		expect(orderPulls.flat()).toEqual(ids);
		expect(await db.orders.count().exec()).toBe(150);
		await e.dispose();
	});

	it('continues reconciling when an order disappears between the bucket scan and pull', async () => {
		const fetcher = vi.fn(async (url: string) => {
			const parsed = new URL(url);
			if (parsed.pathname.endsWith('/integrity/bucket')) {
				return json({
					ids:
						parsed.searchParams.get('collection') === 'orders'
							? [
									{ id: 1, digest: 'new-1', object_type: 'order' },
									{ id: 2, digest: 'new-2', object_type: 'order' },
								]
							: [],
				});
			}
			if (parsed.pathname.endsWith('/orders')) {
				return json([
					{
						id: 1,
						_rxdb_digest: 'new-1',
						date_modified_gmt: '2026-01-01T00:00:00',
						meta_data: [
							{ key: '_woocommerce_pos_uuid', value: '00000000-0000-4000-8000-000000000001' },
						],
					},
				]);
			}
			return json({ ids: [] });
		});
		const e = engine(fetcher);
		await e.ready;
		const db = e.active()!.database.collections;
		for (const id of [1, 2]) {
			await seed(db.existenceManifestOrders as never, {
				id: String(id),
				wooId: id,
				digest: `old-${id}`,
				objectType: 'order',
			});
		}

		await expect(e.sync('existence-reconcile')).resolves.toMatchObject({ status: 'ran' });
		expect(await db.orders.findOne('00000000-0000-4000-8000-000000000001').exec()).not.toBeNull();
		expect(await db.orders.count().exec()).toBe(1);
		await e.dispose();
	});

	it('resetCollection clears the matching existence manifest so the next prime repopulates it', async () => {
		const fetcher = vi.fn(async (url: string) => {
			const parsed = new URL(url);
			if (parsed.pathname.endsWith('/digests')) {
				const ids = (parsed.searchParams.get('include') ?? '').split(',').map(Number);
				return json({ digests: ids.map((id) => ({ id, digest: `reprimed-${id}` })) });
			}
			throw new Error(`unexpected fetch ${url}`);
		});
		const e = engine(fetcher);
		await e.ready;
		let db = e.active()!.database.collections;
		const order = {
			id: '00000000-0000-4000-8000-000000000077',
			wooOrderId: 77,
			number: '77',
			dateCreatedGmt: '2026-01-01T00:00:00',
			status: 'processing',
			total: '1',
			customerId: 0,
			payload: { id: 77 },
			sync: { revision: 'r', partial: false, source: 'woo-rest' },
			local: { dirty: false, pendingMutationIds: [] },
		};
		await seed(db.orders as never, order);
		await seed(db.existenceManifestOrders as never, {
			id: '77',
			wooId: 77,
			digest: 'stale',
			objectType: 'order',
		});

		await expect(e.scope.resetCollection('orders')).resolves.toBe('reset');
		db = e.active()!.database.collections;
		expect(await db.existenceManifestOrders.count().exec()).toBe(0);
		await seed(db.orders as never, order);

		await expect(e.sync('existence-prime')).resolves.toMatchObject({ status: 'ran' });
		expect((await db.existenceManifestOrders.findOne('77').exec())?.toJSON()).toMatchObject({
			wooId: 77,
			digest: 'reprimed-77',
		});
		await e.dispose();
	});

	it('skips both existence lanes offline without fetching', async () => {
		const connectivity = scriptedConnectivity('offline');
		const fetcher = vi.fn(async () => json({}));
		const e = engine(fetcher, { connectivity: connectivity.signal });
		await e.ready;
		await expect(e.sync('existence-prime')).resolves.toMatchObject({
			status: 'skipped',
			reason: 'offline',
		});
		await expect(e.sync('existence-reconcile')).resolves.toMatchObject({
			status: 'skipped',
			reason: 'offline',
		});
		expect(fetcher).not.toHaveBeenCalled();
		await e.dispose();
	});

	it('arms auto-mode existence timers at staggered intervals', async () => {
		const intervals: number[] = [];
		vi.spyOn(globalThis, 'setInterval').mockImplementation(((
			_callback: TimerHandler,
			ms?: number
		) => {
			intervals.push(Number(ms));
			return 1 as never;
		}) as unknown as typeof setInterval);
		const e = engine(async () => json({}), {
			mode: 'auto',
			intervals: { existencePrimeMs: 901_000, existenceReconcileMs: 1_021_000 },
		});
		await e.ready;
		await vi.waitFor(() => expect(intervals).toEqual(expect.arrayContaining([901_000, 1_021_000])));
		await e.dispose();
	});

	it('emits duration and lane count fields for prime and reconcile telemetry', async () => {
		const diagnostics = vi.fn();
		const e = engine(
			async (url) =>
				new URL(url).pathname.endsWith('/integrity/bucket')
					? json({ ids: [] })
					: json({ digests: [] }),
			{ diagnostics, now: () => 42 }
		);
		await e.ready;
		await e.sync('existence-prime');
		await e.sync('existence-reconcile');
		expect(diagnostics).toHaveBeenCalledWith(
			expect.objectContaining({
				type: 'coverage.existence-prime',
				fields: { products: 0, customers: 0, orders: 0, durationMs: 0 },
			})
		);
		expect(diagnostics).toHaveBeenCalledWith(
			expect.objectContaining({
				type: 'coverage.existence-reconcile',
				fields: { buckets: 0, pruned: 0, pulled: 0, repulled: 0, skippedDirty: 0, durationMs: 0 },
			})
		);
		await e.dispose();
	});
});
