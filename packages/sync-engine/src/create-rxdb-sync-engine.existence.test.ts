// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { setPremiumFlag } from 'rxdb-premium/plugins/shared';

import { type RxdbSyncEnginePorts, type StoreScopeIdentity } from './create-rxdb-sync-engine';
import { createEngineHarness, scriptedConnectivity } from './testing';

setPremiumFlag();

const SITE = 'https://existence.example.test';
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

type IntegrityRow = { id: number; digest: string; object_type: string };
function scanEnvelope(url: string, rows: IntegrityRow[], match = true) {
	const parsed = new URL(url);
	const bucketSize = Number(parsed.searchParams.get('bucket_size'));
	const afterId = Number(parsed.searchParams.get('after_id'));
	const collection = parsed.searchParams.get('collection') ?? 'products';
	const byBucket = new Map<number, IntegrityRow[]>();
	for (const row of rows) {
		const bucket = Math.floor(row.id / bucketSize);
		byBucket.set(bucket, [...(byBucket.get(bucket) ?? []), row]);
	}
	return {
		collection,
		checkpoint: { bucket_size: bucketSize, after_id: afterId },
		changes: [...byBucket].map(([bucket, bucketRows]) => {
			const digest = bucketRows.reduce((folded, row) => folded ^ BigInt(row.digest), 0n).toString();
			return {
				bucket,
				stored_count: bucketRows.length,
				current_count: bucketRows.length,
				stored_digest: digest,
				current_digest: digest,
				match,
			};
		}),
		complete: true,
		meta: {},
	};
}

function engine(
	fetcher: RxdbSyncEnginePorts['fetcher'],
	overrides: Partial<RxdbSyncEnginePorts> = {}
) {
	const { now, diagnostics, connectivity, ...ports } = overrides;
	return createEngineHarness({
		site: SITE,
		identity: identity(),
		mode: 'manual',
		fetch: (url, init) => fetcher?.(url, init) ?? Promise.reject(new Error(`unexpected ${url}`)),
		routes: { '/changes/config-fingerprint': { fingerprints: {} } },
		now,
		diagnostics,
		connectivitySignal: connectivity,
		ports,
		awaitReady: false,
	}).engine;
}

async function seed(
	collection: { insert(doc: Record<string, unknown>): Promise<unknown> },
	doc: Record<string, unknown>
) {
	await collection.insert(doc);
}

afterEach(() => vi.restoreAllMocks());

describe('existence maintenance lanes through the public facade', () => {
	it('audits all three id spaces without downloads, protects dirty rows, and applies prune tombstones', async () => {
		const diagnostics = vi.fn();
		const fetches: string[] = [];
		const server = {
			products: [
				{ id: 10, digest: '10', object_type: 'product' },
				{ id: 40, digest: '40', object_type: 'product' },
			],
			customers: [
				{ id: 20, digest: '20', object_type: 'customer' },
				{ id: 41, digest: '41', object_type: 'customer' },
			],
			orders: [
				{ id: 30, digest: '30', object_type: 'order' },
				{ id: 42, digest: '42', object_type: 'order' },
			],
		};
		const fetcher = vi.fn(async (url: string) => {
			fetches.push(url);
			const u = new URL(url);
			const lane = (u.searchParams.get('collection') ?? 'products') as keyof typeof server;
			if (u.pathname.endsWith('/digests')) {
				const ids = (u.searchParams.get('include') ?? '').split(',').map(Number);
				return json({
					digests: server[lane].filter((row) => ids.includes(row.id)),
				});
			}
			if (u.pathname.endsWith('/integrity/scan')) return json(scanEnvelope(url, server[lane]));
			if (u.pathname.endsWith('/integrity/bucket')) return json({ ids: server[lane] });
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
			payload: { id: 10, status: 'publish' },
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
		await seed(db.existenceManifest as never, manifest(10, '10', 'product'));
		await seed(db.existenceManifest as never, manifest(11, '11', 'variation'));
		await seed(db.existenceManifestCustomers as never, manifest(20, '20', 'customer'));
		await seed(db.existenceManifestCustomers as never, manifest(21, '21', 'customer'));
		await seed(db.existenceManifestOrders as never, manifest(30, '30', 'order'));
		await seed(db.existenceManifestOrders as never, manifest(31, '31', 'order'));
		await seed(db.existenceManifestOrders as never, manifest(32, '32', 'order'));

		expect((await e.sync('existence-prime')).status).toBe('ran');
		const reconcileFetchStart = fetches.length;
		const report = await e.sync('existence-reconcile');
		expect(report).toMatchObject({
			status: 'ran',
			lane: 'existence-reconcile',
		});
		const secondTickStart = fetches.length;
		expect(
			fetches
				.slice(reconcileFetchStart, secondTickStart)
				.filter((url) => new URL(url).pathname.endsWith('/integrity/bucket'))
		).toHaveLength(2);
		const secondReport = await e.sync('existence-reconcile');
		expect(secondReport).toMatchObject({
			status: 'ran',
			lane: 'existence-reconcile',
		});
		expect(
			fetches
				.slice(secondTickStart)
				.filter((url) => new URL(url).pathname.endsWith('/integrity/bucket')).length
		).toBeLessThanOrEqual(2);
		expect(await db.variations.findOne('v11').exec()).toBeNull();
		expect(await db.customers.findOne('c21').exec()).not.toBeNull();
		expect(await db.orders.findOne('o31').exec()).toBeNull();
		expect(await db.orders.findOne('o32').exec()).not.toBeNull();
		expect(await db.products.findOne('44444444-4444-4444-8444-444444444444').exec()).toBeNull();
		expect(await db.customers.findOne('41414141-4141-4141-8141-414141414141').exec()).toBeNull();
		expect(await db.orders.findOne('42424242-4242-4242-8242-424242424242').exec()).toBeNull();
		expect(fetches.slice(reconcileFetchStart).filter((url) => url.includes('include='))).toEqual(
			[]
		);
		expect(
			fetches
				.filter((url) => {
					const parsed = new URL(url);
					return (
						parsed.pathname.endsWith('/integrity/bucket') && !parsed.searchParams.has('collection')
					);
				})
				.every((url) => new URL(url).searchParams.get('status') === 'publish')
		).toBe(true);
		const reconcileEvents = diagnostics.mock.calls
			.map(([event]) => event)
			.filter((event) => event.type === 'coverage.existence-reconcile');
		expect(reconcileEvents).toHaveLength(2);
		expect(reconcileEvents.reduce((total, event) => total + Number(event.fields?.pruned), 0)).toBe(
			2
		);
		expect(reconcileEvents.reduce((total, event) => total + Number(event.fields?.missing), 0)).toBe(
			3
		);
		await e.dispose();
	});

	it('prunes a local product absent from the publish-filtered server bucket', async () => {
		const productId = '77777777-7777-4777-8777-777777777777';
		const fetcher = vi.fn(async (url: string) => {
			const parsed = new URL(url);
			if (parsed.pathname.endsWith('/integrity/scan')) return json(scanEnvelope(url, []));
			if (parsed.pathname.endsWith('/integrity/bucket')) {
				if (!parsed.searchParams.has('collection')) {
					expect(parsed.searchParams.get('status')).toBe('publish');
				}
				return json({ ids: [] });
			}
			throw new Error(`unexpected fetch ${url}`);
		});
		const e = engine(fetcher);
		await e.ready;
		const db = e.active()!.database.collections;
		await seed(db.products as never, {
			id: productId,
			wooProductId: 77,
			price: 7,
			stockStatus: 'instock',
			type: 'simple',
			categoryIds: [],
			brandIds: [],
			onSale: false,
			featured: false,
			stockQuantity: null,
			payload: { id: 77, status: 'publish' },
			sync: { revision: 'old', partial: false, source: 'woo-rest' },
			local: { dirty: false, pendingMutationIds: [] },
		});
		await seed(db.existenceManifest as never, {
			id: '77',
			wooId: 77,
			digest: '77',
			objectType: 'product',
		});

		await expect(e.sync('existence-reconcile')).resolves.toMatchObject({
			status: 'ran',
		});
		expect(await db.products.findOne(productId).exec()).toBeNull();
		expect(await db.existenceManifest.findOne('77').exec()).toBeNull();
		expect(fetcher.mock.calls.some(([url]) => String(url).includes('include='))).toBe(false);
		await e.dispose();
	});

	it('prunes unmanifested non-publish residents during prime without dropping local work', async () => {
		const product = (id: number, status: string, dirty = false) => ({
			id: `00000000-0000-4000-8000-${String(id).padStart(12, '0')}`,
			wooProductId: id,
			price: id,
			stockStatus: 'instock',
			type: 'simple',
			categoryIds: [],
			brandIds: [],
			onSale: false,
			featured: false,
			stockQuantity: null,
			payload: { id, status },
			sync: { revision: 'old', partial: false, source: 'woo-rest' },
			local: { dirty, pendingMutationIds: dirty ? ['pending'] : [] },
		});
		const fetcher = vi.fn(async (url: string) => {
			const parsed = new URL(url);
			if (parsed.pathname.endsWith('/digests')) {
				expect(parsed.searchParams.get('status')).toBe('publish');
				return json({ digests: [] });
			}
			throw new Error(`unexpected fetch ${url}`);
		});
		const e = engine(fetcher);
		await e.ready;
		const db = e.active()!.database.collections;
		await seed(db.products as never, product(81, 'draft'));
		await seed(db.products as never, product(82, 'private'));
		await seed(db.products as never, product(83, 'draft', true));

		await expect(e.sync('existence-prime')).resolves.toMatchObject({
			status: 'ran',
		});
		expect(await db.products.findOne(product(81, 'draft').id).exec()).toBeNull();
		expect(await db.products.findOne(product(82, 'private').id).exec()).toBeNull();
		expect(await db.products.findOne(product(83, 'draft', true).id).exec()).not.toBeNull();
		await e.dispose();
	});

	it('cancels a held reconcile on scope switch without writing through the old scope', async () => {
		let releaseBucket!: () => void;
		let heldSignal: AbortSignal | undefined;
		const bucketHeld = new Promise<void>((resolve) => {
			releaseBucket = resolve;
		});
		const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
			if (new URL(url).pathname.endsWith('/integrity/scan')) {
				return json(scanEnvelope(url, []));
			}
			if (new URL(url).pathname.endsWith('/integrity/bucket')) {
				heldSignal = init?.signal ?? undefined;
				await bucketHeld;
				return json({ ids: [] });
			}
			return json({ ids: [] });
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
			payload: { id: 40, status: 'publish' },
			sync: { revision: 'old', partial: false, source: 'woo-rest' },
			local: { dirty: false, pendingMutationIds: [] },
		});
		await seed(oldDb.existenceManifest as never, {
			id: '40',
			wooId: 40,
			digest: '40',
			objectType: 'product',
		});
		const oldProductDeletes = vi.spyOn(oldDb.products, 'bulkRemove');

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
		expect(oldProductDeletes).not.toHaveBeenCalled();
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
			payload: { id: 40, status: 'publish' },
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

	it('resetCollection clears the matching existence manifest so the next prime repopulates it', async () => {
		const fetcher = vi.fn(async (url: string) => {
			const parsed = new URL(url);
			if (parsed.pathname.endsWith('/digests')) {
				const ids = (parsed.searchParams.get('include') ?? '').split(',').map(Number);
				return json({
					digests: ids.map((id) => ({ id, digest: `reprimed-${id}` })),
				});
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

		await expect(e.sync('existence-prime')).resolves.toMatchObject({
			status: 'ran',
		});
		expect((await db.existenceManifestOrders.findOne('77').exec())?.toJSON()).toMatchObject({
			wooId: 77,
			digest: 'reprimed-77',
		});
		await e.dispose();
	});

	it('does not fetch existence buckets after products and variations are reset together', async () => {
		const bucketFetches: string[] = [];
		const e = engine(async (url) => {
			if (new URL(url).pathname.endsWith('/integrity/bucket')) bucketFetches.push(url);
			return json({ ids: [] });
		});
		await e.ready;
		const db = e.active()!.database.collections;
		await seed(db.existenceManifest as never, {
			id: 'product-1',
			wooId: 1,
			digest: 'product-1',
			objectType: 'product',
		});
		await seed(db.existenceManifest as never, {
			id: 'variation-2',
			wooId: 2,
			digest: 'variation-2',
			objectType: 'variation',
		});

		await e.scope.resetCollection('variations');
		await e.scope.resetCollection('products');
		await e.sync('existence-reconcile');

		expect(bucketFetches).toEqual([]);
		await e.dispose();
	});

	it('does not fetch existence buckets after variations are reset alone', async () => {
		const bucketFetches: string[] = [];
		const e = engine(async (url) => {
			if (new URL(url).pathname.endsWith('/integrity/bucket')) bucketFetches.push(url);
			return json({ ids: [] });
		});
		await e.ready;
		const db = e.active()!.database.collections;
		await seed(db.existenceManifest as never, {
			id: 'product-1',
			wooId: 1,
			digest: 'product-1',
			objectType: 'product',
		});
		await seed(db.existenceManifest as never, {
			id: 'variation-2',
			wooId: 2,
			digest: 'variation-2',
			objectType: 'variation',
		});

		await e.scope.resetCollection('variations');
		await e.sync('existence-reconcile');

		expect(bucketFetches).toEqual([]);
		await e.dispose();
	});

	it('reports an unusable scan envelope and issues no bucket fetches', async () => {
		let bucketFetches = 0;
		const e = engine(async (url) => {
			const parsed = new URL(url);
			if (parsed.pathname.endsWith('/integrity/scan')) {
				return json({ ...scanEnvelope(url, []), changes: {} });
			}
			if (parsed.pathname.endsWith('/integrity/bucket')) bucketFetches += 1;
			throw new Error(`unexpected fetch ${url}`);
		});
		await e.ready;
		await seed(e.active()!.database.collections.existenceManifest as never, {
			id: '1',
			wooId: 1,
			digest: '1',
			objectType: 'product',
		});

		const report = await e.sync('existence-reconcile');

		expect(report).toMatchObject({ status: 'error' });
		expect(report.error).toMatch(/unusable products envelope/i);
		expect(bucketFetches).toBe(0);
		expect(e.status().lanes['existence-reconcile'].lastError).toBe(report.error);
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
				fields: {
					buckets: 0,
					emptyBuckets: 0,
					pruned: 0,
					missing: 0,
					changed: 0,
					skippedDirty: 0,
					durationMs: 0,
				},
			})
		);
		await e.dispose();
	});
});
