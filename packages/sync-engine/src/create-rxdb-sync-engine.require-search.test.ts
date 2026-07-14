/**
 * The public SEARCH-demand verb: `engine.require({ collection, kind: 'search', term })`.
 * A products/customers search declaration executes the existing scheduler fetcher directly,
 * lands the records, and resolves `ready` from that search's own outcome. UI-anchored
 * (re-declared per render → the MEMORY path, never durable); concurrent identical
 * declarations share one in-memory execution and `release()` abandons the last declaration.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
	createRxdbSyncEngine,
	type RxdbSyncEngine,
	type StoreScopeIdentity,
} from './create-rxdb-sync-engine';
import { memoryEngineStorage } from './testing';

const SITE = 'https://lab.example.test';
const SYNC_BASE = `${SITE}/wp-json/wc-rxdb-sync/v1`;
let uniqueStore = 0;

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

async function searchTaskRows(engine: RxdbSyncEngine): Promise<Record<string, unknown>[]> {
	const scope = engine.active();
	if (!scope) throw new Error('no active scope');
	const documents = await (
		scope.database.collections.schedulerTaskStates as {
			find(): { exec(): Promise<{ toJSON(): Record<string, unknown> }[]> };
		}
	)
		.find()
		.exec();
	return documents
		.map((document) => document.toJSON())
		.filter((row) => String(row['queryKey']).includes(':search'));
}

describe('require() for search — the public search-demand verb', () => {
	it('rounds a products search trip directly, lands the record, and persists no search task', async () => {
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
		expect(await searchTaskRows(engine)).toEqual([]);
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
		expect(await searchTaskRows(engine)).toEqual([]);
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

	it('release() abandons an in-flight search and persists no search task', async () => {
		const started = Promise.withResolvers<AbortSignal>();
		const engine = engineWith(async (url, init) => {
			if (!new URL(url).pathname.endsWith('/products')) return json([]);
			const signal = init?.signal;
			if (!signal) throw new Error('search request missing abort signal');
			started.resolve(signal);
			return await new Promise<Response>((_resolve, reject) => {
				const abort = () => reject(signal.reason);
				signal.addEventListener('abort', abort, { once: true });
				if (signal.aborted) abort();
			});
		});
		await engine.ready;
		const handle = engine.require({
			id: 'slow-search',
			collection: 'products',
			kind: 'search',
			term: 'keyboard',
		});
		const observedSignal = await started.promise;
		handle.release();

		await expect(handle.ready).resolves.toMatchObject({
			action: 'released',
			reason: 'released during drain',
		});
		expect(observedSignal.aborted).toBe(true);
		expect(await searchTaskRows(engine)).toEqual([]);
		await engine.dispose();
	});

	it('dedupes concurrent identical search declarations in memory', async () => {
		const server = scriptedProductSearchProxy([productPayload(321, 'Keyboard')]);
		const engine = engineWith(server.fetch);
		await engine.ready;

		const first = engine.require({
			id: 'dup-search-a',
			collection: 'products',
			kind: 'search',
			term: ' keyboard ',
		});
		const second = engine.require({
			id: 'dup-search-b',
			collection: 'products',
			kind: 'search',
			term: 'keyboard',
		});

		await expect(Promise.all([first.ready, second.ready])).resolves.toEqual([
			expect.objectContaining({ action: 'fetched' }),
			expect.objectContaining({ action: 'fetched' }),
		]);
		expect(server.state).toEqual({ searchPulls: 1, skuPulls: 1 });
		expect(await searchTaskRows(engine)).toEqual([]);
		await engine.dispose();
	});

	it('keeps a shared search alive when one duplicate declaration releases', async () => {
		const response = Promise.withResolvers<Response>();
		const started = Promise.withResolvers<AbortSignal>();
		const engine = engineWith(async (url, init) => {
			const parsed = new URL(url);
			if (!parsed.pathname.endsWith('/products')) return json([]);
			if (parsed.searchParams.has('sku')) return json([]);
			const signal = init?.signal;
			if (!signal) throw new Error('search request missing abort signal');
			started.resolve(signal);
			return response.promise;
		});
		await engine.ready;
		const first = engine.require({
			id: 'shared-search-a',
			collection: 'products',
			kind: 'search',
			term: 'keyboard',
		});
		const second = engine.require({
			id: 'shared-search-b',
			collection: 'products',
			kind: 'search',
			term: 'keyboard',
		});

		const signal = await started.promise;
		first.release();
		expect(signal.aborted).toBe(false);
		response.resolve(json([productPayload(321, 'Keyboard')]));

		await expect(first.ready).resolves.toMatchObject({ action: 'released' });
		await expect(second.ready).resolves.toMatchObject({ action: 'fetched' });
		expect(await searchTaskRows(engine)).toEqual([]);
		await engine.dispose();
	});

	it('keeps delimiter characters in a customer term behind the encoded task grammar', async () => {
		const searches: string[] = [];
		const engine = engineWith(async (url) => {
			const parsed = new URL(url);
			if (parsed.pathname.endsWith('/customers')) {
				searches.push(parsed.searchParams.get('search') ?? '');
			}
			return json([]);
		});
		await engine.ready;

		await expect(
			engine.require({
				id: 'encoded-search',
				collection: 'customers',
				kind: 'search',
				term: 'a:b c',
			}).ready
		).resolves.toMatchObject({ action: 'fetched' });
		expect(searches).toEqual(['a:b c']);
		expect(await searchTaskRows(engine)).toEqual([]);
		await engine.dispose();
	});

	it('uses the declared customer search limit without persisting its task', async () => {
		const perPage: string[] = [];
		const engine = engineWith(async (url) => {
			const parsed = new URL(url);
			if (parsed.pathname.endsWith('/customers')) {
				perPage.push(parsed.searchParams.get('per_page') ?? '');
			}
			return json([]);
		});
		await engine.ready;

		await expect(
			engine.require({
				id: 'limited-search',
				collection: 'customers',
				kind: 'search',
				term: 'ada',
				limit: 10,
			}).ready
		).resolves.toMatchObject({ action: 'fetched', requests: 1 });
		expect(perPage).toEqual(['10']);
		expect(await searchTaskRows(engine)).toEqual([]);
		await engine.dispose();
	});

	it("settles from the search's own outcome when an unrelated durable lane fails", async () => {
		const server = scriptedProductSearchProxy([productPayload(321, 'Keyboard')]);
		const engine = engineWith(async (url) => {
			if (new URL(url).pathname.endsWith('/products')) return server.fetch(url);
			return new Response('unrelated lane failed', { status: 500 });
		});
		await engine.ready;

		await expect(
			engine.require({
				id: 'isolated-search',
				collection: 'products',
				kind: 'search',
				term: 'keyboard',
			}).ready
		).resolves.toMatchObject({ action: 'fetched', documents: 1, requests: 2 });
		expect(server.state).toEqual({ searchPulls: 1, skuPulls: 1 });
		expect(await searchTaskRows(engine)).toEqual([]);
		await engine.dispose();
	});

	it('persists no search task when the search fetch fails', async () => {
		const engine = engineWith(async (url) => {
			if (new URL(url).pathname.endsWith('/products')) {
				return new Response('search failed', { status: 500 });
			}
			return json([]);
		});
		await engine.ready;

		await expect(
			engine.require({
				id: 'failed-search',
				collection: 'products',
				kind: 'search',
				term: 'keyboard',
			}).ready
		).rejects.toThrow(/product search request failed: 500/i);
		expect(await searchTaskRows(engine)).toEqual([]);
		await engine.dispose();
	});

	it('rejects a search over an unsupported collection', async () => {
		const engine = engineWith(async () => json([]));
		await engine.ready;

		await expect(
			engine.require({
				id: 'bad-collection',
				collection: 'taxRates',
				kind: 'search',
				term: 'anything',
			}).ready
		).rejects.toThrow(/'search' supports products\/customers/i);
		await engine.dispose();
	});

	it('rejects an empty search term loudly', async () => {
		const engine = engineWith(async () => json([]));
		await engine.ready;

		await expect(
			engine.require({
				id: 'empty-term',
				collection: 'customers',
				kind: 'search',
				term: '   ',
			}).ready
		).rejects.toThrow(/'search' needs a non-empty term/i);
		await engine.dispose();
	});
});
