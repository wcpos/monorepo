import { afterEach, describe, expect, it, vi } from 'vitest';
import { setPremiumFlag } from 'rxdb-premium/plugins/shared';

import { scopeKeyFor } from '@wcpos/sync-core';

import { createEngineHarness, memoryEngineStorage, memoryStringStore, remoteId } from './testing';
import { type RxdbSyncEnginePorts, type StoreScopeIdentity } from './create-rxdb-sync-engine';

setPremiumFlag();

const SITE = 'https://lab.example.test';
const TRICKLE_STATE_KEY = 'customer-trickle:state';
let uniqueStore = 0;

afterEach(() => {
	vi.restoreAllMocks();
});

function identity(): StoreScopeIdentity {
	uniqueStore += 1;
	return { site: SITE, storeId: 7, cashierId: `customer-trickle-${uniqueStore}` };
}

function json(payload: unknown, headers: Record<string, string> = {}): Response {
	return new Response(JSON.stringify(payload), {
		status: 200,
		headers: { 'content-type': 'application/json', ...headers },
	});
}

function customer(id: number): Record<string, unknown> {
	const uuid = `5b8e1a3c-2f4d-4a6b-9c8e-${String(id).padStart(12, '0')}`;
	return {
		id,
		email: `customer-${id}@example.test`,
		date_modified_gmt: '2026-07-20T00:00:00',
		_rxdb_digest: String(id * 101),
		meta_data: [{ key: '_woocommerce_pos_uuid', value: uuid }],
	};
}

function customers(start: number, count: number): Record<string, unknown>[] {
	return Array.from({ length: count }, (_, index) => customer(start + index));
}

/**
 * The trickle is the only customers request that asks for a single 10-record page — the
 * browse-window drain walks at the Performance dial (100 by default here). It is no longer
 * identifiable by its sort: the sort is now the cashier's (owner ruling 2026-08-19).
 */
function isTrickleUrl(url: string): boolean {
	const parsed = new URL(url);
	return parsed.pathname.endsWith('/customers') && parsed.searchParams.get('per_page') === '10';
}

/** Declare and settle one customers browse window, so the engine records it as current. */
async function declareBrowseWindow(
	engine: ReturnType<typeof engineWith>,
	dimensions: Record<string, unknown>
): Promise<void> {
	const handle = engine.require({
		id: 'grid',
		collection: 'customers',
		kind: 'customer-browse',
		...dimensions,
	} as never);
	await handle.ready.catch(() => undefined);
	handle.release();
}

function engineWith(overrides: Partial<RxdbSyncEnginePorts> = {}, storeIdentity = identity()) {
	const { fetcher, now, diagnostics, connectivity, ...ports } = overrides;
	return createEngineHarness({
		site: SITE,
		identity: storeIdentity,
		mode: 'manual',
		fetch: fetcher ?? (async () => json([])),
		now,
		diagnostics,
		connectivitySignal: connectivity,
		routes: { '/changes/config-fingerprint': {} },
		ports,
		awaitReady: false,
	}).engine;
}

describe('customer-trickle maintenance lane', () => {
	it('fetches one ordered page, upserts customers and manifests, then advances to page 2', async () => {
		const urls: string[] = [];
		const engine = engineWith({
			fetcher: async (url) => {
				urls.push(url);
				const page = Number(new URL(url).searchParams.get('page'));
				return json(customers((page - 1) * 10 + 1, 10));
			},
		});
		const scope = await engine.ready;

		await expect(engine.sync('customer-trickle')).resolves.toMatchObject({
			status: 'ran',
		});
		expect(urls).toHaveLength(1);
		const first = new URL(urls[0]!);
		expect(first.pathname).toBe('/wp-json/wcpos/v2/customers');
		expect(first.search).toBe('?orderby=id&order=asc&role=all&per_page=10&page=1');
		expect(first.searchParams.has('include')).toBe(false);
		expect(first.searchParams.has('search')).toBe(false);
		expect(await scope.database.collections.customers.count().exec()).toBe(10);
		expect(await scope.database.collections.existenceManifestCustomers.count().exec()).toBe(10);

		await engine.sync('customer-trickle');
		expect(urls).toHaveLength(2);
		expect(new URL(urls[1]!).searchParams.get('page')).toBe('2');
		await engine.dispose();
	});

	it('resets an out-of-range durable page and resumes from page 1 on the next tick', async () => {
		const pages: string[] = [];
		const engine = engineWith({
			fetcher: async (url) => {
				const page = new URL(url).searchParams.get('page')!;
				pages.push(page);
				if (pages.length === 1) return json(customers(1, 10));
				if (pages.length === 2) {
					return new Response(JSON.stringify({ code: 'rest_post_invalid_page_number' }), {
						status: 400,
						headers: { 'content-type': 'application/json' },
					});
				}
				return json([customer(1)]);
			},
		});
		await engine.ready;

		await engine.sync('customer-trickle');
		await expect(engine.sync('customer-trickle')).resolves.toMatchObject({ status: 'ran' });
		await engine.sync('customer-trickle');
		expect(pages).toEqual(['1', '2', '1']);
		await engine.dispose();
	});

	// Paul's ruling, 2026-08-19: records arrive in the order the user chose, whatever path they
	// arrive by — and re-pointing the grid re-points the backfill.
	it('trickles in the sort the grid last declared, and restarts when that sort changes', async () => {
		const trickled: URL[] = [];
		const engine = engineWith({
			fetcher: async (url) => {
				if (isTrickleUrl(url)) trickled.push(new URL(url));
				return json(customers(1, 10));
			},
		});
		await engine.ready;

		await declareBrowseWindow(engine, { limit: 100, orderby: 'last_name', order: 'asc' });
		await engine.sync('customer-trickle');
		await engine.sync('customer-trickle');
		expect(trickled.map((url) => url.searchParams.get('orderby'))).toEqual([
			'last_name',
			'last_name',
		]);
		expect(trickled.map((url) => url.searchParams.get('page'))).toEqual(['1', '2']);

		// The cashier re-sorts to newest-registered-first: the walk starts again in THAT order.
		await declareBrowseWindow(engine, { limit: 100, orderby: 'registered_date', order: 'desc' });
		await engine.sync('customer-trickle');
		expect(trickled[2]!.searchParams.get('orderby')).toBe('registered_date');
		expect(trickled[2]!.searchParams.get('order')).toBe('desc');
		expect(trickled[2]!.searchParams.get('page')).toBe('1');
		await engine.dispose();
	});

	// Scrolling grows the window's limit, which is deliberately NOT part of the cursor's view
	// identity — otherwise every scroll tick would restart the backfill at page 1.
	it('keeps walking across a scroll that only grows the window', async () => {
		const trickled: URL[] = [];
		const engine = engineWith({
			fetcher: async (url) => {
				if (isTrickleUrl(url)) trickled.push(new URL(url));
				return json(customers(1, 10));
			},
		});
		await engine.ready;

		await declareBrowseWindow(engine, { limit: 100, orderby: 'last_name', order: 'asc' });
		await engine.sync('customer-trickle');
		await declareBrowseWindow(engine, { limit: 400, orderby: 'last_name', order: 'asc' });
		await engine.sync('customer-trickle');

		expect(trickled.map((url) => url.searchParams.get('page'))).toEqual(['1', '2']);
		await engine.dispose();
	});

	it('does not carry a browse window into another store scope', async () => {
		const trickled: URL[] = [];
		const engine = engineWith({
			fetcher: async (url) => {
				if (isTrickleUrl(url)) trickled.push(new URL(url));
				return json(customers(1, 10));
			},
		});
		const initialScope = await engine.ready;

		await declareBrowseWindow(engine, { limit: 100, orderby: 'last_name', order: 'asc' });
		await engine.scope.switch({ ...initialScope.identity, storeId: 8 });
		await engine.sync('customer-trickle');

		expect(trickled[0]!.searchParams.get('orderby')).toBe('id');
		await engine.dispose();
	});

	it('runs only while this tab owns the shared write plane', async () => {
		let isLeader = false;
		let customerFetches = 0;
		const engine = engineWith({
			writePlaneOwner: () => isLeader,
			fetcher: async () => {
				customerFetches += 1;
				return json([]);
			},
		});
		await engine.ready;

		await expect(engine.sync('customer-trickle')).resolves.toMatchObject({
			status: 'skipped',
			reason: 'not-write-plane-owner',
		});
		expect(customerFetches).toBe(0);
		isLeader = true;
		await expect(engine.sync('customer-trickle')).resolves.toMatchObject({ status: 'ran' });
		expect(customerFetches).toBe(1);
		await engine.dispose();
	});

	it('completes a full final page using the pagination headers', async () => {
		const urls: string[] = [];
		const engine = engineWith({
			fetcher: async (url) => {
				urls.push(url);
				const page = Number(new URL(url).searchParams.get('page'));
				return json(customers((page - 1) * 10 + 1, 10), {
					'X-WP-Total': '20',
					'X-WP-TotalPages': '2',
				});
			},
		});
		await engine.ready;

		await engine.sync('customer-trickle');
		await expect(engine.sync('customer-trickle')).resolves.toMatchObject({
			status: 'ran',
		});
		await expect(engine.sync('customer-trickle')).resolves.toMatchObject({
			status: 'skipped',
			reason: 'walk-complete',
		});
		expect(urls).toHaveLength(2);
		await engine.dispose();
	});

	it('skips while the user is active and fetches after 60 seconds of quiet', async () => {
		let now = 100_000;
		const urls: string[] = [];
		const engine = engineWith({
			now: () => now,
			lastUserActivityMs: () => 100_000,
			fetcher: async (url) => {
				urls.push(url);
				return json([]);
			},
		});
		await engine.ready;

		await expect(engine.sync('customer-trickle')).resolves.toMatchObject({
			status: 'skipped',
			reason: 'user-active',
		});
		expect(urls).toEqual([]);
		now += 60_000;
		await engine.sync('customer-trickle');
		expect(urls).toHaveLength(1);
		await engine.dispose();
	});

	it('skips while an interactive targeted-records requirement is in flight', async () => {
		const started = Promise.withResolvers<void>();
		let trickleFetches = 0;
		const engine = engineWith({
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
				if (isTrickleUrl(url)) trickleFetches += 1;
				return json([]);
			},
		});
		await engine.ready;
		const requirement = engine.require({
			id: 'interactive-customer',
			collection: 'customers',
			kind: 'targeted-records',
			remoteIds: [91].map(remoteId),
		});
		await started.promise;

		await expect(engine.sync('customer-trickle')).resolves.toMatchObject({
			status: 'skipped',
			reason: 'interactive-demand',
		});
		expect(trickleFetches).toBe(0);
		requirement.release();
		await expect(requirement.ready).resolves.toMatchObject({ action: 'released' });
		await engine.dispose();
	});

	it('does not accumulate missed windows into a burst', async () => {
		let active = true;
		const urls: string[] = [];
		const engine = engineWith({
			now: () => 100_000,
			lastUserActivityMs: () => (active ? 100_000 : 40_000),
			fetcher: async (url) => {
				urls.push(url);
				return json(customers(1, 10));
			},
		});
		await engine.ready;

		for (let tick = 0; tick < 4; tick += 1) {
			await engine.sync('customer-trickle');
		}
		active = false;
		await engine.sync('customer-trickle');

		expect(urls).toHaveLength(1);
		expect(new URL(urls[0]!).searchParams.get('per_page')).toBe('10');
		await engine.dispose();
	});

	it('coalesces overlapping ticks without fetching or advancing twice', async () => {
		const checkpoints = memoryStringStore();
		const storeIdentity = identity();
		const fetchStarted = Promise.withResolvers<void>();
		const releaseFetch = Promise.withResolvers<void>();
		let fetchCalls = 0;
		const engine = engineWith(
			{
				checkpoints,
				fetcher: async () => {
					fetchCalls += 1;
					fetchStarted.resolve();
					await releaseFetch.promise;
					return json(customers(1, 10));
				},
			},
			storeIdentity
		);
		await engine.ready;

		const first = engine.sync('customer-trickle');
		await fetchStarted.promise;
		const overlapping = engine.sync('customer-trickle');
		await expect(overlapping).resolves.toMatchObject({
			status: 'skipped',
			reason: 'in-flight',
		});
		releaseFetch.resolve();
		await expect(first).resolves.toMatchObject({ status: 'ran' });

		expect(fetchCalls).toBe(1);
		await expect(
			checkpoints.get(`${scopeKeyFor(storeIdentity)}:${TRICKLE_STATE_KEY}`)
		).resolves.toBe(
			JSON.stringify({ viewKey: 'customers:browse-window:limit=', page: 2, walkComplete: false })
		);
		await engine.dispose();
	});

	it('resumes from the persisted next page after engine disposal', async () => {
		const storage = memoryEngineStorage();
		const checkpoints = memoryStringStore();
		const storeIdentity = identity();
		const first = engineWith(
			{
				storage,
				checkpoints,
				fetcher: async () => json(customers(1, 10)),
			},
			storeIdentity
		);
		await first.ready;
		await first.sync('customer-trickle');
		await first.dispose();

		const urls: string[] = [];
		const resumed = engineWith(
			{
				storage,
				checkpoints,
				fetcher: async (url) => {
					urls.push(url);
					return json([]);
				},
			},
			storeIdentity
		);
		await resumed.ready;
		await resumed.sync('customer-trickle');
		expect(new URL(urls[0]!).searchParams.get('page')).toBe('2');
		await resumed.dispose();
	});

	it('rewinds the persisted page when customers are reset', async () => {
		const checkpoints = memoryStringStore();
		const urls: string[] = [];
		const engine = engineWith({
			checkpoints,
			fetcher: async (url) => {
				urls.push(url);
				return json(customers(1, 10));
			},
		});
		await engine.ready;

		await engine.sync('customer-trickle');
		await engine.scope.resetCollection('customers');
		await engine.sync('customer-trickle');

		expect(urls.map((url) => new URL(url).searchParams.get('page'))).toEqual(['1', '1']);
		await engine.dispose();
	});

	it('goes dormant after a short page', async () => {
		const urls: string[] = [];
		const engine = engineWith({
			fetcher: async (url) => {
				urls.push(url);
				return json(customers(1, 3));
			},
		});
		await engine.ready;

		await engine.sync('customer-trickle');
		await expect(engine.sync('customer-trickle')).resolves.toMatchObject({
			status: 'skipped',
			reason: 'walk-complete',
		});
		expect(urls).toHaveLength(1);
		await engine.dispose();
	});

	it('re-arms a completed walk when a fresh census total exceeds the local count', async () => {
		const urls: string[] = [];
		const engine = engineWith({
			now: () => 1_000_000,
			fetcher: async (url) => {
				urls.push(url);
				return json(urls.length === 1 ? customers(1, 3) : []);
			},
		});
		const scope = await engine.ready;
		await engine.sync('customer-trickle');
		await scope.database.collections.queryTotalCacheEntries.upsert({
			queryKey: 'census:customers',
			totalMatchingRecords: 20,
			updatedAtMs: 1_000_000,
			freshUntilMs: 2_000_000,
			schemaVersion: 1,
		});

		await engine.sync('customer-trickle');
		expect(urls).toHaveLength(2);
		expect(new URL(urls[1]!).searchParams.get('page')).toBe('1');
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
		await engine.sync('customer-trickle');
		expect(trickleUrls).toHaveLength(1);
		await engine.dispose();
	});

	it('defaults corrupt persisted state to page 1', async () => {
		const checkpoints = memoryStringStore();
		const storeIdentity = identity();
		await checkpoints.set(`${scopeKeyFor(storeIdentity)}:${TRICKLE_STATE_KEY}`, '{not valid json');
		const urls: string[] = [];
		const engine = engineWith(
			{
				checkpoints,
				fetcher: async (url) => {
					urls.push(url);
					return json([]);
				},
			},
			storeIdentity
		);
		await engine.ready;

		await engine.sync('customer-trickle');
		expect(new URL(urls[0]!).searchParams.get('page')).toBe('1');
		await engine.dispose();
	});
});

describe('customers targeted-records require path', () => {
	it('fetches missing ids once, then serves the identical requirement locally', async () => {
		const urls: string[] = [];
		const engine = engineWith({
			fetcher: async (url) => {
				urls.push(url);
				return json(customers(41, 2));
			},
		});
		const scope = await engine.ready;
		const requirement = {
			collection: 'customers' as const,
			kind: 'targeted-records' as const,
			remoteIds: [41, 42].map(remoteId),
		};

		await expect(
			engine.require({ id: 'customers-first', ...requirement }).ready
		).resolves.toMatchObject({ action: 'fetched' });
		expect(urls).toHaveLength(1);
		const pull = new URL(urls[0]!);
		expect(pull.pathname).toBe('/wp-json/wcpos/v2/customers');
		expect(pull.searchParams.get('include')).toBe('41,42');
		expect(await scope.database.collections.customers.count().exec()).toBe(2);

		await expect(
			engine.require({ id: 'customers-second', ...requirement }).ready
		).resolves.toMatchObject({ action: 'serve-local' });
		expect(urls).toHaveLength(1);
		await engine.dispose();
	});
});
