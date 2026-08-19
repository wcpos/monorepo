import { afterEach, describe, expect, it, vi } from 'vitest';
import { setPremiumFlag } from 'rxdb-premium/plugins/shared';

import { createEngineHarness, remoteId } from './testing';
import { type RxdbSyncEnginePorts, type StoreScopeIdentity } from './create-rxdb-sync-engine';

setPremiumFlag();

const SITE = 'https://lab.example.test';
let uniqueStore = 0;

afterEach(() => {
	vi.restoreAllMocks();
});

function identity(): StoreScopeIdentity {
	uniqueStore += 1;
	return { site: SITE, storeId: 7, cashierId: `product-trickle-${uniqueStore}` };
}

function json(payload: unknown, headers: Record<string, string> = {}): Response {
	return new Response(JSON.stringify(payload), {
		status: 200,
		headers: { 'content-type': 'application/json', ...headers },
	});
}

function productUuid(id: number): string {
	return `00000000-0000-4000-8000-${String(id).padStart(12, '0')}`;
}

function product(id: number, name = `Product ${id}`): Record<string, unknown> {
	return {
		id,
		name,
		date_modified_gmt: '2026-08-18T00:00:00',
		price: '12.50',
		stock_status: 'instock',
		type: 'simple',
		categories: [],
		brands: [],
		on_sale: false,
		featured: false,
		stock_quantity: null,
		_rxdb_digest: String(id * 101),
		meta_data: [{ key: '_woocommerce_pos_uuid', value: productUuid(id) }],
	};
}

function products(start: number, count: number): Record<string, unknown>[] {
	return Array.from({ length: count }, (_, index) => product(start + index));
}

/**
 * The trickle is the only products request that asks for a single 10-record page — the
 * browse-window drain walks at the Performance dial (100 by default here). It is no longer
 * identifiable by its sort: the sort is now the cashier's (owner ruling 2026-08-19).
 */
function isTrickleUrl(url: string): boolean {
	const parsed = new URL(url);
	return (
		parsed.pathname.endsWith('/products') &&
		parsed.searchParams.get('status') === 'publish' &&
		parsed.searchParams.get('per_page') === '10'
	);
}

/** Declare and settle one products browse window, so the engine records it as current. */
async function declareBrowseWindow(
	engine: ReturnType<typeof engineWith>,
	dimensions: Record<string, unknown>
): Promise<void> {
	const handle = engine.require({
		id: 'grid',
		collection: 'products',
		kind: 'product-browse',
		...dimensions,
	} as never);
	await handle.ready.catch(() => undefined);
	handle.release();
}

function engineWith(
	overrides: Partial<RxdbSyncEnginePorts> = {},
	configFingerprint: Record<string, unknown> = {}
) {
	const { fetcher, now, diagnostics, connectivity, ...ports } = overrides;
	return createEngineHarness({
		site: SITE,
		identity: identity(),
		mode: 'manual',
		fetch: fetcher ?? (async () => json([])),
		now,
		diagnostics,
		connectivitySignal: connectivity,
		routes: { '/changes/config-fingerprint': configFingerprint },
		ports,
		awaitReady: false,
	}).engine;
}

describe('product-trickle maintenance lane', () => {
	it('fetches ordered published pages, materializes products and manifests, then advances', async () => {
		const urls: string[] = [];
		const engine = engineWith({
			fetcher: async (url) => {
				urls.push(url);
				const page = Number(new URL(url).searchParams.get('page'));
				return json(products((page - 1) * 10 + 1, 10));
			},
		});
		const scope = await engine.ready;

		await expect(engine.sync('product-trickle')).resolves.toMatchObject({ status: 'ran' });
		const first = new URL(urls[0]!);
		expect(first.pathname).toBe('/wp-json/wcpos/v2/products');
		expect(first.search).toBe('?orderby=menu_order&order=asc&status=publish&per_page=10&page=1');
		expect(await scope.database.collections.products.count().exec()).toBe(10);
		expect(await scope.database.collections.existenceManifest.count().exec()).toBe(10);

		await engine.sync('product-trickle');
		expect(new URL(urls[1]!).searchParams.get('page')).toBe('2');
		await engine.dispose();
	});

	it('the pre-declaration fallback walks the host-authored default sort (one-place ruling, #1372)', async () => {
		const urls: string[] = [];
		const engine = engineWith({
			fetcher: async (url) => {
				urls.push(url);
				const page = Number(new URL(url).searchParams.get('page'));
				return json(products((page - 1) * 10 + 1, 10));
			},
			defaultProductBrowseSort: { orderby: 'title', order: 'asc' },
		});
		await engine.ready;

		await expect(engine.sync('product-trickle')).resolves.toMatchObject({ status: 'ran' });
		const first = new URL(urls[0]!);
		expect(first.search).toBe('?orderby=title&order=asc&status=publish&per_page=10&page=1');
		await engine.dispose();
	});

	it('resets an out-of-range durable page and resumes from page 1 on the next tick', async () => {
		const pages: string[] = [];
		const engine = engineWith({
			fetcher: async (url) => {
				const page = new URL(url).searchParams.get('page')!;
				pages.push(page);
				if (pages.length === 1) return json(products(1, 10));
				if (pages.length === 2) {
					return new Response(JSON.stringify({ code: 'rest_post_invalid_page_number' }), {
						status: 400,
						headers: { 'content-type': 'application/json' },
					});
				}
				return json([product(1)]);
			},
		});
		await engine.ready;

		await engine.sync('product-trickle');
		await expect(engine.sync('product-trickle')).resolves.toMatchObject({ status: 'ran' });
		await engine.sync('product-trickle');
		expect(pages).toEqual(['1', '2', '1']);
		await engine.dispose();
	});

	// Paul's ruling, 2026-08-19: the catalogue comes down in the order the merchant/cashier
	// chose, not by id — and re-pointing the grid re-points the backfill.
	it('trickles in the sort the grid last declared, and restarts when that sort changes', async () => {
		const trickled: URL[] = [];
		const engine = engineWith({
			fetcher: async (url) => {
				if (isTrickleUrl(url)) trickled.push(new URL(url));
				return json(products(1, 10));
			},
		});
		await engine.ready;

		await declareBrowseWindow(engine, { limit: 100, orderby: 'title', order: 'asc' });
		await engine.sync('product-trickle');
		await engine.sync('product-trickle');
		expect(trickled.map((url) => url.searchParams.get('orderby'))).toEqual(['title', 'title']);
		expect(trickled.map((url) => url.searchParams.get('page'))).toEqual(['1', '2']);

		// The cashier re-sorts to newest-first: the walk starts again in THAT order.
		await declareBrowseWindow(engine, { limit: 100, orderby: 'date', order: 'desc' });
		await engine.sync('product-trickle');
		expect(trickled[2]!.searchParams.get('orderby')).toBe('date');
		expect(trickled[2]!.searchParams.get('order')).toBe('desc');
		expect(trickled[2]!.searchParams.get('page')).toBe('1');
		await engine.dispose();
	});

	it('does not carry a browse window into another store scope', async () => {
		const trickled: URL[] = [];
		const engine = engineWith({
			fetcher: async (url) => {
				if (isTrickleUrl(url)) trickled.push(new URL(url));
				return json(products(1, 10));
			},
		});
		const initialScope = await engine.ready;

		await declareBrowseWindow(engine, { limit: 100, orderby: 'title', order: 'asc' });
		await engine.scope.switch({ ...initialScope.identity, storeId: 8 });
		await engine.sync('product-trickle');

		expect(trickled[0]!.searchParams.get('orderby')).toBe('menu_order');
		await engine.dispose();
	});

	// Filters PRIORITISE, they do not EXCLUDE: the till must still end up able to sell the
	// products the cashier's filter hid.
	it('covers the filtered window first, then continues the same sort unfiltered', async () => {
		const trickled: URL[] = [];
		const engine = engineWith({
			fetcher: async (url) => {
				if (!isTrickleUrl(url)) return json([]);
				trickled.push(new URL(url));
				return json(products(trickled.length * 100, 3));
			},
		});
		await engine.ready;

		await declareBrowseWindow(engine, {
			limit: 100,
			orderby: 'title',
			order: 'asc',
			stock_status: 'instock',
		});
		// Stage 1 runs out of in-stock products — that is a handover, not the end of the walk.
		await expect(engine.sync('product-trickle')).resolves.toMatchObject({ status: 'ran' });
		expect(trickled[0]!.searchParams.get('stock_status')).toBe('instock');

		await expect(engine.sync('product-trickle')).resolves.toMatchObject({ status: 'ran' });
		expect(trickled[1]!.searchParams.get('stock_status')).toBeNull();
		expect(trickled[1]!.searchParams.get('orderby')).toBe('title');
		expect(trickled[1]!.searchParams.get('page')).toBe('1');

		await expect(engine.sync('product-trickle')).resolves.toMatchObject({
			status: 'skipped',
			reason: 'walk-complete',
		});
		expect(trickled).toHaveLength(2);
		await engine.dispose();
	});

	it('runs only while this tab owns the shared write plane', async () => {
		let isLeader = false;
		let productFetches = 0;
		const engine = engineWith({
			writePlaneOwner: () => isLeader,
			fetcher: async () => {
				productFetches += 1;
				return json([]);
			},
		});
		await engine.ready;

		await expect(engine.sync('product-trickle')).resolves.toMatchObject({
			status: 'skipped',
			reason: 'not-write-plane-owner',
		});
		expect(productFetches).toBe(0);
		isLeader = true;
		await expect(engine.sync('product-trickle')).resolves.toMatchObject({ status: 'ran' });
		expect(productFetches).toBe(1);
		await engine.dispose();
	});

	it('skips while the user is active or interactive work is pending', async () => {
		let now = 100_000;
		let productFetches = 0;
		const activeEngine = engineWith({
			now: () => now,
			lastUserActivityMs: () => 100_000,
			fetcher: async () => {
				productFetches += 1;
				return json([]);
			},
		});
		await activeEngine.ready;
		await expect(activeEngine.sync('product-trickle')).resolves.toMatchObject({
			status: 'skipped',
			reason: 'user-active',
		});
		expect(productFetches).toBe(0);
		await activeEngine.dispose();

		const started = Promise.withResolvers<void>();
		const demandEngine = engineWith({
			fetcher: async (url, init) => {
				const parsed = new URL(url);
				if (parsed.searchParams.has('include')) {
					const signal = init?.signal;
					if (!signal) throw new Error('targeted request missing abort signal');
					started.resolve();
					return await new Promise<Response>((_resolve, reject) => {
						const abort = () => reject(signal.reason);
						signal.addEventListener('abort', abort, { once: true });
						if (signal.aborted) abort();
					});
				}
				if (isTrickleUrl(url)) productFetches += 1;
				return json([]);
			},
		});
		await demandEngine.ready;
		const requirement = demandEngine.require({
			id: 'interactive-product',
			collection: 'products',
			kind: 'targeted-records',
			remoteIds: [91].map(remoteId),
		});
		await started.promise;
		await expect(demandEngine.sync('product-trickle')).resolves.toMatchObject({
			status: 'skipped',
			reason: 'interactive-demand',
		});
		expect(productFetches).toBe(0);
		requirement.release();
		await expect(requirement.ready).resolves.toMatchObject({ action: 'released' });
		await demandEngine.dispose();
	});

	it('goes dormant after a short page', async () => {
		const urls: string[] = [];
		const engine = engineWith({
			fetcher: async (url) => {
				urls.push(url);
				return json(products(1, 3));
			},
		});
		await engine.ready;

		await engine.sync('product-trickle');
		await expect(engine.sync('product-trickle')).resolves.toMatchObject({
			status: 'skipped',
			reason: 'walk-complete',
		});
		expect(urls).toHaveLength(1);
		await engine.dispose();
	});

	it('restarts an exhausted mutable-sort walk when fresh census exceeds local coverage', async () => {
		const trickled: URL[] = [];
		const engine = engineWith({
			now: () => 1_000_000,
			fetcher: async (url) => {
				if (!isTrickleUrl(url)) return json([]);
				trickled.push(new URL(url));
				return json(trickled.length === 1 ? products(1, 3) : [product(4)]);
			},
		});
		const scope = await engine.ready;
		await scope.database.collections.queryTotalCacheEntries.upsert({
			queryKey: 'census:products',
			totalMatchingRecords: 4,
			updatedAtMs: 1_000_000,
			freshUntilMs: 2_000_000,
			schemaVersion: 1,
		});
		await declareBrowseWindow(engine, { limit: 100, orderby: 'title', order: 'asc' });

		await engine.sync('product-trickle');
		await expect(engine.sync('product-trickle')).resolves.toMatchObject({ status: 'ran' });
		expect(trickled.map((url) => url.searchParams.get('page'))).toEqual(['1', '1']);
		expect(await scope.database.collections.products.count().exec()).toBe(4);
		await engine.dispose();
	});

	it('re-arms only when the fresh product census total changes', async () => {
		const urls: string[] = [];
		const engine = engineWith({
			now: () => 1_000_000,
			fetcher: async (url) => {
				urls.push(url);
				return json(products(1, 3));
			},
		});
		const scope = await engine.ready;
		const cache = scope.database.collections.queryTotalCacheEntries;
		await cache.upsert({
			queryKey: 'census:products',
			totalMatchingRecords: 3,
			updatedAtMs: 1_000_000,
			freshUntilMs: 2_000_000,
			schemaVersion: 1,
		});
		await engine.sync('product-trickle');

		await expect(engine.sync('product-trickle')).resolves.toMatchObject({
			status: 'skipped',
			reason: 'walk-complete',
		});
		expect(urls).toHaveLength(1);
		await cache.upsert({
			queryKey: 'census:products',
			totalMatchingRecords: 4,
			updatedAtMs: 1_000_001,
			freshUntilMs: 2_000_000,
			schemaVersion: 1,
		});
		await engine.sync('product-trickle');
		expect(urls).toHaveLength(2);
		expect(new URL(urls[1]!).searchParams.get('page')).toBe('1');
		await engine.dispose();
	});

	it('re-walks once per census total, not forever, on a permanent deficit (#1345)', async () => {
		// The server reports 4 products but only ever serves 3 (id drift, duplicate
		// pos-uuid collapse). The old completion gate restarted the whole catalog walk
		// on every deficit — and never recorded walkComplete, so the changed-total
		// re-arm gate was never reached: an infinite background re-walk. One re-walk
		// per observed total is the bound; a CHANGED total re-arms again.
		const trickled: string[] = [];
		const engine = engineWith({
			now: () => 1_000_000,
			fetcher: async (url) => {
				if (!isTrickleUrl(url)) return json([]);
				trickled.push(url);
				return json(products(1, 3));
			},
		});
		const scope = await engine.ready;
		const cache = scope.database.collections.queryTotalCacheEntries;
		await cache.upsert({
			queryKey: 'census:products',
			totalMatchingRecords: 4,
			updatedAtMs: 1_000_000,
			freshUntilMs: 2_000_000,
			schemaVersion: 1,
		});

		// Walk 1 ends with a deficit → exactly one re-walk (walk 2), which then
		// accepts completion for this total.
		await engine.sync('product-trickle');
		await engine.sync('product-trickle');
		expect(trickled).toHaveLength(2);
		await expect(engine.sync('product-trickle')).resolves.toMatchObject({
			status: 'skipped',
			reason: 'walk-complete',
		});
		expect(trickled).toHaveLength(2);
		// The total changing re-arms the walk again.
		await cache.upsert({
			queryKey: 'census:products',
			totalMatchingRecords: 5,
			updatedAtMs: 1_000_001,
			freshUntilMs: 2_000_000,
			schemaVersion: 1,
		});
		await engine.sync('product-trickle');
		expect(trickled).toHaveLength(3);
		expect(new URL(trickled[2]!).searchParams.get('page')).toBe('1');
		await engine.dispose();
	});

	it('does not clobber a locally protected resident product', async () => {
		const engine = engineWith({ fetcher: async () => json([product(77, 'Server Name')]) });
		const scope = await engine.ready;
		await scope.database.collections.products.insert({
			uuid: productUuid(77),
			remoteId: remoteId(77),
			price: 12.5,
			stockStatus: 'instock',
			type: 'simple',
			categoryIds: [],
			brandIds: [],
			onSale: false,
			featured: false,
			stockQuantity: null,
			payload: { id: 77, name: 'Local Edit' },
			sync: { revision: 'local', partial: false, source: 'local' },
			local: { dirty: true, pendingMutationIds: ['mutation-77'] },
		} as never);

		await engine.sync('product-trickle');
		expect(
			(await scope.database.collections.products.findOne(productUuid(77)).exec())?.toJSON()
		).toMatchObject({ payload: { name: 'Local Edit' }, local: { dirty: true } });
		await engine.dispose();
	});

	it('materializes payload.barcode from the scope barcode carrier', async () => {
		const payload = {
			...product(42),
			meta_data: [
				{ key: '_woocommerce_pos_uuid', value: productUuid(42) },
				{ key: '_barcode', value: 'BAR-42' },
			],
		};
		const engine = engineWith(
			{ fetcher: async () => json([payload]) },
			{
				fingerprints: { products: 'p1', variations: 'v1', tax_rates: 't1' },
				barcode_fields: {
					products: ['meta_data:_barcode'],
					variations: [],
					tax_rates: [],
				},
			}
		);
		const scope = await engine.ready;

		await engine.sync('product-trickle');
		expect(
			(await scope.database.collections.products.findOne(productUuid(42)).exec())?.toJSON().payload
		).toMatchObject({ barcode: 'BAR-42' });
		await engine.dispose();
	});

	it('excludes the idle lane from sync() but permits an explicit trickle tick', async () => {
		const trickleUrls: string[] = [];
		const engine = engineWith({
			fetcher: async (url) => {
				if (isTrickleUrl(url)) trickleUrls.push(url);
				return json([]);
			},
		});
		await engine.ready;

		await engine.sync();
		expect(trickleUrls).toEqual([]);
		await engine.sync('product-trickle');
		expect(trickleUrls).toHaveLength(1);
		await engine.dispose();
	});
});
