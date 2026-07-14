/**
 * The public SEARCH-demand verb: `engine.require({ collection, kind: 'search', term })`.
 * A products/customers search declaration seeds the SAME `products:search:` /
 * `customers:search=…:limit=…` scheduler task the drain already executes, drains it,
 * lands the records, and resolves `ready`. UI-anchored (re-declared per render → the
 * MEMORY-path scheduler dedupe, not durable); `release()` abandons a search in flight.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

import { createRxdbSyncEngine, type StoreScopeIdentity } from './create-rxdb-sync-engine';
import { createRequirePlane } from './require-plane';
import * as searchSeeder from './scheduler/rx-scheduler-search-task-seeder';
import * as schedulerDrain from './scheduler/engine-scheduler-drain';
import { memoryEngineStorage } from './testing';

const SITE = 'https://lab.example.test';
const SYNC_BASE = `${SITE}/wp-json/wc-rxdb-sync/v1`;
let uniqueStore = 0;

const EMPTY_SEED_RESULT = {
	inserted: 0,
	requeued: 0,
	skippedActive: 0,
	skippedCompleted: 0,
	skippedRunnable: 0,
	claimLost: 0,
	rerunRequested: 0,
};

const EMPTY_DRAIN_RESULT = {
	scanned: 0,
	claimLost: 0,
	completionLost: 0,
	succeeded: 0,
	coalescedReruns: 0,
	failed: 0,
	failureLost: 0,
	renewalLost: 0,
	totalDocuments: 0,
	totalRequests: 0,
};

// Server-stamped identity: a deterministic v4-shaped uuid per Woo id, so the post-flip
// STORAGE key (document.id) is predictable (mirrors the fetcher suites).
const productUuid = (n: number): string => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const customerUuid = (n: number): string =>
	`5b8e1a3c-2f4d-4a6b-9c8e-${String(n).padStart(12, '0')}`;
const posMeta = (uuid: string) => [{ key: '_woocommerce_pos_uuid', value: uuid }];

afterEach(() => {
	vi.useRealTimers();
	vi.restoreAllMocks();
});

function freshIdentity(): StoreScopeIdentity {
	uniqueStore += 1;
	return { site: SITE, storeId: 3, cashierId: `req-search-${uniqueStore}` };
}

function json(payload: unknown): Response {
	return new Response(JSON.stringify(payload), {
		status: 200,
		headers: { 'content-type': 'application/json' },
	});
}

function productPayload(id: number, name: string): Record<string, unknown> {
	return {
		id,
		name,
		date_modified_gmt: '2026-07-10T00:00:00',
		price: '5.00',
		stock_status: 'instock',
		type: 'simple',
		categories: [],
		brands: [],
		on_sale: false,
		featured: false,
		stock_quantity: null,
		meta_data: posMeta(productUuid(id)),
	};
}

/** Answers a `products:search:` lane: the fetcher issues a `search=` GET and a `sku=` GET. */
function scriptedProductSearchProxy(products: Record<string, unknown>[]) {
	const state = { searchPulls: 0, skuPulls: 0 };
	const fetch = async (url: string): Promise<Response> => {
		const u = new URL(url);
		if (u.pathname.endsWith('/products')) {
			if (u.searchParams.has('sku')) {
				state.skuPulls += 1;
				return json([]);
			}
			state.searchPulls += 1;
			return json(products);
		}
		return json([]);
	};
	return { state, fetch };
}

/** Answers a `customers:search=…:limit=…` lane: the fetcher paginates `search=` GETs. */
function scriptedCustomerSearchProxy(customers: Record<string, unknown>[]) {
	const state = { pulls: 0 };
	const fetch = async (url: string): Promise<Response> => {
		const u = new URL(url);
		if (u.pathname.endsWith('/customers')) {
			state.pulls += 1;
			return json(state.pulls === 1 ? customers : []);
		}
		return json([]);
	};
	return { state, fetch };
}

function engineWith(fetch: (url: string, init?: RequestInit) => Promise<Response>) {
	return createRxdbSyncEngine(
		{
			site: { syncBaseUrl: SYNC_BASE, wpJsonRoot: `${SITE}/wp-json` },
			storage: memoryEngineStorage(),
			fetcher: (url, init) => fetch(url, init),
			mode: 'manual',
		},
		freshIdentity()
	);
}

/** Mocked seeder+drain harness (the orders suite's orchestration style) — the search branch
 * routes seed→drain without touching resident records, so a minimal scope stub suffices. */
function orchestrationHarness() {
	const boundFetch = vi.fn(async () => new Response());
	const guardWrite = vi.fn(async (write: () => Promise<void>) => {
		await write();
		return 'applied' as const;
	});
	const bound = {
		scopeId: 'scope-a',
		epoch: 1,
		bindFetch: vi.fn(() => boundFetch),
		guardWrite,
		isCurrent: vi.fn(() => true),
	};
	const diagnostics = vi.fn();
	const plane = createRequirePlane({
		awaitReady: async () => undefined,
		manager: {
			runGuarded: async (operation: (captured: typeof bound) => Promise<unknown>) =>
				operation(bound),
		} as never,
		databaseFor: () => ({ collections: {} }) as never,
		coverageFor: () =>
			({
				recordQueryResult: vi.fn(async () => undefined),
				recordRecords: vi.fn(async () => undefined),
				recordCumulativeQueryResult: vi.fn(async () => undefined),
				readLane: vi.fn(async () => null),
			}) as never,
		fetcher: vi.fn(async () => new Response()),
		syncBaseUrl: SYNC_BASE,
		diagnostics,
	});
	return { plane, diagnostics };
}

describe('require() for search — the public search-demand verb', () => {
	it('rounds a products search trip: seeds the lane task, drains it, lands the record', async () => {
		const { setPremiumFlag } = await import('rxdb-premium/plugins/shared');
		setPremiumFlag();
		const server = scriptedProductSearchProxy([productPayload(321, 'Keyboard')]);
		const engine = engineWith(server.fetch);
		await engine.ready;

		const outcome = await engine.require({
			id: 'product-search',
			collection: 'products',
			kind: 'search',
			term: 'keyboard',
		}).ready;

		expect(outcome).toMatchObject({ action: 'fetched' });
		expect(server.state.searchPulls).toBeGreaterThan(0);

		const scope = engine.active();
		if (!scope) throw new Error('no active scope');
		const rows = (
			await (
				scope.database.collections.products as {
					find(): { exec(): Promise<{ toJSON(): Record<string, unknown> }[]> };
				}
			)
				.find()
				.exec()
		).map((doc) => doc.toJSON());
		expect(rows.map((row) => row['wooProductId'])).toEqual([321]);
		await engine.dispose();
	});

	it('rounds a customers search trip through the search=…:limit= lane', async () => {
		const { setPremiumFlag } = await import('rxdb-premium/plugins/shared');
		setPremiumFlag();
		const server = scriptedCustomerSearchProxy([
			{
				id: 12,
				email: 'ada@example.test',
				date_modified_gmt: '2026-07-10T00:00:00',
				meta_data: posMeta(customerUuid(12)),
			},
		]);
		const engine = engineWith(server.fetch);
		await engine.ready;

		const outcome = await engine.require({
			id: 'customer-search',
			collection: 'customers',
			kind: 'search',
			term: 'ada',
		}).ready;

		expect(outcome).toMatchObject({ action: 'fetched' });
		expect(server.state.pulls).toBeGreaterThan(0);

		const scope = engine.active();
		if (!scope) throw new Error('no active scope');
		const rows = (
			await (
				scope.database.collections.customers as {
					find(): { exec(): Promise<{ toJSON(): Record<string, unknown> }[]> };
				}
			)
				.find()
				.exec()
		).map((doc) => doc.toJSON());
		expect(rows.map((row) => row['wooCustomerId'])).toEqual([12]);
		await engine.dispose();
	});

	it('protects a locally-dirty product from a search upsert (#637 dirty-guard)', async () => {
		const { setPremiumFlag } = await import('rxdb-premium/plugins/shared');
		setPremiumFlag();
		// The server would return a fresh copy of product 321, but the resident is dirty.
		const server = scriptedProductSearchProxy([productPayload(321, 'SERVER-FRESH')]);
		const engine = engineWith(server.fetch);
		await engine.ready;
		const scope = engine.active();
		if (!scope) throw new Error('no active scope');
		const products = scope.database.collections.products as {
			insert(doc: Record<string, unknown>): Promise<unknown>;
			find(): { exec(): Promise<{ toJSON(): Record<string, unknown> }[]> };
		};
		await products.insert({
			id: productUuid(321),
			wooProductId: 321,
			price: 5,
			stockStatus: 'instock',
			type: 'simple',
			categoryIds: [],
			brandIds: [],
			onSale: false,
			featured: false,
			stockQuantity: null,
			payload: { id: 321, name: 'RESIDENT-DIRTY' },
			sync: { revision: 'r', partial: false, source: 'woo-rest' },
			local: { dirty: true, pendingMutationIds: ['m1'] },
		});

		await engine.require({
			id: 'dirty-search',
			collection: 'products',
			kind: 'search',
			term: 'keyboard',
		}).ready;

		const rows = (await products.find().exec()).map((doc) => doc.toJSON());
		expect(rows).toHaveLength(1);
		// The dirty resident survives untouched — the server-fresh copy was dropped.
		expect((rows[0]?.['payload'] as Record<string, unknown>)['name']).toBe('RESIDENT-DIRTY');
		await engine.dispose();
	});

	it('release() abandons an in-flight search drain and settles as released', async () => {
		const harness = orchestrationHarness();
		vi.spyOn(searchSeeder, 'seedSearchSchedulerTask').mockResolvedValue({
			...EMPTY_SEED_RESULT,
			inserted: 1,
		});
		let observedSignal: AbortSignal | undefined;
		vi.spyOn(schedulerDrain, 'runEngineSchedulerDrain').mockImplementation(async (input) => {
			observedSignal = input.signal;
			return await new Promise<never>((_resolve, reject) => {
				input.signal?.addEventListener('abort', () => reject(input.signal?.reason), { once: true });
			});
		});

		const handle = harness.plane.require({
			id: 'slow-search',
			collection: 'products',
			kind: 'search',
			term: 'keyboard',
		});
		await vi.waitFor(() => expect(observedSignal).toBeDefined());
		handle.release();

		await expect(handle.ready).resolves.toMatchObject({
			action: 'released',
			reason: 'released during drain',
		});
		expect(observedSignal?.aborted).toBe(true);
	});

	it('dedupes a duplicate search declaration to a released outcome when one is already active', async () => {
		const harness = orchestrationHarness();
		const seed = vi
			.spyOn(searchSeeder, 'seedSearchSchedulerTask')
			.mockResolvedValue({ ...EMPTY_SEED_RESULT, skippedActive: 1 });
		const drain = vi
			.spyOn(schedulerDrain, 'runEngineSchedulerDrain')
			.mockResolvedValue(EMPTY_DRAIN_RESULT);

		const outcome = await harness.plane.require({
			id: 'dup-search',
			collection: 'customers',
			kind: 'search',
			term: 'ada',
		}).ready;

		expect(seed).toHaveBeenCalledWith(
			expect.objectContaining({ collection: 'customers', term: 'ada' })
		);
		expect(outcome).toMatchObject({ action: 'released' });
		expect(outcome.reason).toMatch(/already in progress/i);
		expect(drain).not.toHaveBeenCalled();
	});

	it('rejects a search over an unsupported collection', async () => {
		const harness = orchestrationHarness();
		const seed = vi.spyOn(searchSeeder, 'seedSearchSchedulerTask');

		await expect(
			harness.plane.require({
				id: 'bad-collection',
				collection: 'taxRates',
				kind: 'search',
				term: 'anything',
			}).ready
		).rejects.toThrow(/'search' supports products\/customers/i);
		expect(seed).not.toHaveBeenCalled();
	});

	it('rejects an empty search term loudly', async () => {
		const harness = orchestrationHarness();
		const seed = vi.spyOn(searchSeeder, 'seedSearchSchedulerTask');

		await expect(
			harness.plane.require({
				id: 'empty-term',
				collection: 'products',
				kind: 'search',
				term: '   ',
			}).ready
		).rejects.toThrow(/'search' needs a non-empty term/i);
		expect(seed).not.toHaveBeenCalled();
	});
});
