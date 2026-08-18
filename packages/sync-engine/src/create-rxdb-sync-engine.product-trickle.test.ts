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

function isTrickleUrl(url: string): boolean {
	const parsed = new URL(url);
	return (
		parsed.pathname.endsWith('/products') &&
		parsed.searchParams.get('status') === 'publish' &&
		parsed.searchParams.get('orderby') === 'id' &&
		parsed.searchParams.get('order') === 'asc'
	);
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
		expect(first.search).toBe('?status=publish&orderby=id&order=asc&per_page=10&page=1');
		expect(await scope.database.collections.products.count().exec()).toBe(10);
		expect(await scope.database.collections.existenceManifest.count().exec()).toBe(10);

		await engine.sync('product-trickle');
		expect(new URL(urls[1]!).searchParams.get('page')).toBe('2');
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
