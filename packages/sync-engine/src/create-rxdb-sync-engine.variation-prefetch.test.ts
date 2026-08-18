import { afterEach, describe, expect, it, vi } from 'vitest';
import { setPremiumFlag } from 'rxdb-premium/plugins/shared';

import { createEngineHarness, remoteId } from './testing';
import { type RxdbSyncEnginePorts, type StoreScopeIdentity } from './create-rxdb-sync-engine';

setPremiumFlag();

const SITE = 'https://variation-prefetch.example.test';
let uniqueStore = 0;

afterEach(() => vi.restoreAllMocks());

function identity(): StoreScopeIdentity {
	return {
		site: SITE,
		storeId: 7,
		cashierId: `variation-prefetch-${++uniqueStore}`,
	};
}

function json(body: unknown): Response {
	return new Response(JSON.stringify(body), {
		status: 200,
		headers: { 'content-type': 'application/json' },
	});
}

const uuid = (kind: 'product' | 'variation', id: number): string =>
	`${kind === 'product' ? '10000000' : '20000000'}-0000-4000-8000-${String(id).padStart(12, '0')}`;

function product(id: number, variations: number[]): Record<string, unknown> {
	return {
		uuid: uuid('product', id),
		remoteId: remoteId(id),
		price: 5,
		stockStatus: 'instock',
		type: 'variable',
		categoryIds: [],
		brandIds: [],
		onSale: false,
		featured: false,
		stockQuantity: null,
		payload: { id, type: 'variable', variations },
		sync: { revision: 'r', partial: false, source: 'woo-rest' },
		local: { dirty: false, pendingMutationIds: [] },
	};
}

function variation(id: number, parentId: number): Record<string, unknown> {
	return {
		uuid: uuid('variation', id),
		remoteId: remoteId(id),
		parentRemoteId: remoteId(parentId),
		price: 5,
		stockStatus: 'instock',
		attributes: [],
		stockQuantity: null,
		payload: { id, parent_id: parentId },
		sync: { revision: 'r', partial: false, source: 'woo-rest' },
		local: { dirty: false, pendingMutationIds: [] },
	};
}

function variationEnvelope(id: number, parentId: number): Record<string, unknown> {
	return {
		id,
		parent_id: parentId,
		payload: {
			id,
			price: '5.00',
			stock_status: 'instock',
			attributes: [],
			stock_quantity: null,
			meta_data: [{ key: '_woocommerce_pos_uuid', value: uuid('variation', id) }],
		},
	};
}

function engineWith(overrides: Partial<RxdbSyncEnginePorts> = {}) {
	const { fetcher, now, diagnostics, connectivity, ...ports } = overrides;
	return createEngineHarness({
		site: SITE,
		identity: identity(),
		mode: 'manual',
		fetch: fetcher ?? (async () => json({ documents: [] })),
		now,
		diagnostics,
		connectivitySignal: connectivity,
		routes: { '/changes/config-fingerprint': {} },
		ports,
		awaitReady: false,
	}).engine;
}

describe('variation-prefetch maintenance lane', () => {
	it('pulls missing variations from the first resident variable parent', async () => {
		const urls: string[] = [];
		const engine = engineWith({
			fetcher: async (url) => {
				urls.push(url);
				return json({
					documents: [variationEnvelope(101, 10), variationEnvelope(102, 10)],
				});
			},
		});
		const scope = await engine.ready;
		await scope.database.collections.products.insert(product(10, [101, 102]) as never);

		await expect(engine.sync('variation-prefetch')).resolves.toMatchObject({
			status: 'ran',
		});
		expect(urls).toHaveLength(1);
		const request = new URL(urls[0]!);
		expect(request.pathname).toBe('/wp-json/wcpos/v2/variations');
		expect(request.searchParams.get('include')).toBe('101,102');
		expect(request.searchParams.get('per_page')).toBe('2');
		expect(await scope.database.collections.variations.count().exec()).toBe(2);
		await engine.dispose();
	});

	it('skips for recent activity and pending interactive demand without fetching', async () => {
		const activeFetch = vi.fn(async () => json({ documents: [] }));
		const active = engineWith({
			now: () => 100_000,
			lastUserActivityMs: () => 100_000,
			fetcher: activeFetch,
		});
		const activeScope = await active.ready;
		await activeScope.database.collections.products.insert(product(10, [101]) as never);
		await expect(active.sync('variation-prefetch')).resolves.toMatchObject({
			status: 'skipped',
			reason: 'user-active',
		});
		expect(activeFetch).not.toHaveBeenCalled();
		await active.dispose();

		const started = Promise.withResolvers<void>();
		let variationFetches = 0;
		const pending = engineWith({
			fetcher: async (url, init) => {
				if (new URL(url).pathname.endsWith('/customers')) {
					const signal = init?.signal;
					if (!signal) throw new Error('targeted request missing abort signal');
					started.resolve();
					return await new Promise<Response>((_resolve, reject) => {
						const abort = () => reject(signal.reason);
						signal.addEventListener('abort', abort, { once: true });
						if (signal.aborted) abort();
					});
				}
				variationFetches += 1;
				return json({ documents: [] });
			},
		});
		const pendingScope = await pending.ready;
		await pendingScope.database.collections.products.insert(product(10, [101]) as never);
		const requirement = pending.require({
			id: 'interactive-customer',
			collection: 'customers',
			kind: 'targeted-records',
			remoteIds: [remoteId(91)],
		});
		await started.promise;
		await expect(pending.sync('variation-prefetch')).resolves.toMatchObject({
			status: 'skipped',
			reason: 'interactive-demand',
		});
		expect(variationFetches).toBe(0);
		requirement.release();
		await requirement.ready;
		await pending.dispose();
	});

	it('skips resident variations, completes the walk, then stays idle', async () => {
		const fetcher = vi.fn(async () => json({ documents: [] }));
		const engine = engineWith({ fetcher });
		const scope = await engine.ready;
		await scope.database.collections.products.bulkInsert([
			product(10, [101]),
			product(20, [201]),
		] as never);
		await scope.database.collections.variations.bulkInsert([
			variation(101, 10),
			variation(201, 20),
		] as never);

		await expect(engine.sync('variation-prefetch')).resolves.toMatchObject({
			status: 'ran',
		});
		await expect(engine.sync('variation-prefetch')).resolves.toMatchObject({
			status: 'skipped',
			reason: 'walk-complete',
		});
		expect(fetcher).not.toHaveBeenCalled();
		await engine.dispose();
	});

	it('re-arms only when the fresh variations census total changes', async () => {
		let requests = 0;
		const engine = engineWith({
			now: () => 1_000_000,
			fetcher: async () => {
				requests += 1;
				return json({ documents: [variationEnvelope(201, 20)] });
			},
		});
		const scope = await engine.ready;
		await scope.database.collections.products.insert(product(10, [101]) as never);
		await scope.database.collections.variations.insert(variation(101, 10) as never);
		await scope.database.collections.queryTotalCacheEntries.upsert({
			queryKey: 'census:variations',
			totalMatchingRecords: 1,
			updatedAtMs: 1_000_000,
			freshUntilMs: 2_000_000,
			schemaVersion: 1,
		});
		await engine.sync('variation-prefetch');
		await expect(engine.sync('variation-prefetch')).resolves.toMatchObject({
			status: 'skipped',
			reason: 'walk-complete',
		});

		await scope.database.collections.products.insert(product(20, [201]) as never);
		await scope.database.collections.queryTotalCacheEntries.upsert({
			queryKey: 'census:variations',
			totalMatchingRecords: 2,
			updatedAtMs: 1_000_000,
			freshUntilMs: 2_000_000,
			schemaVersion: 1,
		});
		await expect(engine.sync('variation-prefetch')).resolves.toMatchObject({
			status: 'ran',
		});
		expect(requests).toBe(1);
		await engine.dispose();
	});

	it('advances past an omitted variation instead of fetching the same parent again', async () => {
		const requested: string[] = [];
		const engine = engineWith({
			fetcher: async (url) => {
				const include = new URL(url).searchParams.get('include')!;
				requested.push(include);
				return json({
					documents: include === '201' ? [variationEnvelope(201, 20)] : [],
				});
			},
		});
		const scope = await engine.ready;
		await scope.database.collections.products.bulkInsert([
			product(10, [101]),
			product(20, [201]),
		] as never);

		await engine.sync('variation-prefetch');
		await engine.sync('variation-prefetch');
		expect(requested).toEqual(['101', '201']);
		await engine.dispose();
	});

	it('is excluded from a manual full sync but remains explicitly tickable', async () => {
		const variationRequests: string[] = [];
		const engine = engineWith({
			fetcher: async (url) => {
				const isVariation = new URL(url).pathname.endsWith('/variations');
				if (isVariation) variationRequests.push(url);
				return json(isVariation ? { documents: [] } : []);
			},
		});
		const scope = await engine.ready;

		await engine.sync();
		expect(variationRequests).toEqual([]);
		await scope.database.collections.products.insert(product(10, [101]) as never);
		await engine.sync('variation-prefetch');
		expect(variationRequests).toHaveLength(1);
		await engine.dispose();
	});
});
