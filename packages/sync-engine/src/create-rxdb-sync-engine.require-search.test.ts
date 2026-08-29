/**
 * The public SEARCH-demand verb: `engine.require({ collection, kind: 'search', term })`.
 * A products/customers/variations search declaration executes the existing scheduler fetcher directly,
 * lands the records, and resolves `ready` from that search's own outcome. UI-anchored
 * (re-declared per render → the MEMORY path, never durable); concurrent identical
 * declarations share one in-memory execution and `release()` abandons the last declaration.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { setPremiumFlag } from 'rxdb-premium/plugins/shared';

import { createEngineHarness, remoteId } from './testing';
import { type RxdbSyncEngine, type StoreScopeIdentity } from './create-rxdb-sync-engine';

setPremiumFlag();

const SITE = 'https://lab.example.test';
const SYNC_BASE = `${SITE}/wp-json/wcpos/v2`;
let uniqueStore = 0;

/**
 * The customer trickle's cursor is keyed by the browse window's VIEW identity (the sort) since
 * the 2026-08-19 ordering ruling, so a seeded "walk finished" cursor must name the view it
 * finished — here the default window (id asc), which is what an undeclared grid falls back to.
 */
const CUSTOMER_DEFAULT_VIEW_KEY = 'customers:browse-window:limit=';

// Server-stamped identity: a deterministic v4-shaped uuid per Woo id, so the post-flip
// STORAGE key (document.id) is predictable (mirrors the fetcher suites).
const productUuid = (n: number): string => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const customerUuid = (n: number): string =>
	`5b8e1a3c-2f4d-4a6b-9c8e-${String(n).padStart(12, '0')}`;
const variationUuid = (n: number): string =>
	`70000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
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

function customerPayload(id: number): Record<string, unknown> {
	return {
		id,
		email: `customer-${id}@example.test`,
		date_modified_gmt: '2026-07-10T00:00:00',
		meta_data: posMeta(customerUuid(id)),
	};
}

function variationEnvelopeDocument(
	id: number,
	parentId: number,
	name: string
): Record<string, unknown> {
	return {
		id,
		parent_id: parentId,
		payload: {
			id,
			name,
			sku: `VAR-${id}`,
			date_modified_gmt: '2026-07-10T00:00:00',
			price: '5.00',
			stock_status: 'instock',
			attributes: [],
			stock_quantity: null,
			meta_data: posMeta(variationUuid(id)),
		},
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

/** Answers a `variations:search:` lane using the plugin's envelope contract. */
function scriptedVariationSearchProxy(documents: Record<string, unknown>[]) {
	const state = { urls: [] as string[] };
	const fetch = async (url: string): Promise<Response> => {
		const parsed = new URL(url);
		if (!parsed.pathname.endsWith('/variations')) return json([]);
		state.urls.push(url);
		const hits = parsed.searchParams.has('search') ? documents : [];
		return json({
			documents: hits,
			meta: {
				total: hits.length,
				page: Number(parsed.searchParams.get('page')),
				per_page: Number(parsed.searchParams.get('per_page')),
			},
		});
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
	return createEngineHarness({
		site: SITE,
		identity: freshIdentity(),
		fetch,
		awaitReady: false,
	}).engine;
}

async function seedProductsCensus(
	engine: RxdbSyncEngine,
	totalMatchingRecords: number,
	freshUntilMs: number,
	updatedAtMs = Date.now()
): Promise<void> {
	const scope = engine.active();
	if (!scope) throw new Error('no active scope');
	await scope.database.collections.queryTotalCacheEntries.upsert({
		queryKey: 'census:products',
		totalMatchingRecords,
		freshUntilMs,
		updatedAtMs,
		schemaVersion: 1,
	});
}

async function insertResidentProduct(engine: RxdbSyncEngine, id: number): Promise<void> {
	const scope = engine.active();
	if (!scope) throw new Error('no active scope');
	await scope.database.collections.products.insert({
		uuid: productUuid(id),
		remoteId: remoteId(id),
		price: 5,
		stockStatus: 'instock',
		type: 'simple',
		categoryIds: [],
		brandIds: [],
		onSale: false,
		featured: false,
		stockQuantity: null,
		payload: productPayload(id, `Product ${id}`),
		sync: { revision: 'r', partial: false, source: 'woo-rest' },
		local: { dirty: false, pendingMutationIds: [] },
	});
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
	it('serves repeated product and customer searches from fresh complete coverage lanes', async () => {
		const products = scriptedProductSearchProxy([]);
		const customers = scriptedCustomerSearchProxy([]);
		const engine = engineWith(async (url) =>
			new URL(url).pathname.endsWith('/products') ? products.fetch(url) : customers.fetch(url)
		);
		await engine.ready;

		for (const collection of ['products', 'customers'] as const) {
			await engine.require({ id: `${collection}-first`, collection, kind: 'search', term: 'empty' })
				.ready;
			const requestsBefore =
				collection === 'products'
					? products.state.searchPulls + products.state.skuPulls
					: customers.state.pulls;
			await expect(
				engine.require({ id: `${collection}-second`, collection, kind: 'search', term: 'empty' })
					.ready
			).resolves.toMatchObject({
				action: 'serve-local',
				reason: `${collection} search fetched within the coverage window`,
				requests: 0,
			});
			const requestsAfter =
				collection === 'products'
					? products.state.searchPulls + products.state.skuPulls
					: customers.state.pulls;
			expect(requestsAfter).toBe(requestsBefore);
		}
		await engine.dispose();
	});

	it('serves a product search locally when a fresh census is fully resident', async () => {
		const server = scriptedProductSearchProxy([]);
		const engine = engineWith(server.fetch);
		await engine.ready;
		await insertResidentProduct(engine, 1);
		await seedProductsCensus(engine, 1, Date.now() + 60_000);

		await expect(
			engine.require({ id: 'resident-census', collection: 'products', kind: 'search', term: 'hat' })
				.ready
		).resolves.toMatchObject({
			action: 'serve-local',
			reason: 'products catalogue is fully resident locally',
		});
		expect(server.state).toEqual({ searchPulls: 0, skuPulls: 0 });
		await engine.dispose();
	});

	it('does not trust a fully resident product census from before this engine session', async () => {
		const server = scriptedProductSearchProxy([]);
		const engine = createEngineHarness({
			site: SITE,
			identity: freshIdentity(),
			fetch: server.fetch,
			startAtMs: 2_000,
			awaitReady: false,
		}).engine;
		await engine.ready;
		await insertResidentProduct(engine, 1);
		await seedProductsCensus(engine, 1, 60_000, 1_000);

		await expect(
			engine.require({
				id: 'previous-session-census',
				collection: 'products',
				kind: 'search',
				term: 'hat',
			}).ready
		).resolves.toMatchObject({ action: 'fetched' });
		expect(server.state).toEqual({ searchPulls: 1, skuPulls: 1 });
		await engine.dispose();
	});

	it.each([
		['stale census', async (engine: RxdbSyncEngine) => seedProductsCensus(engine, 0, 1)],
		['no census row', async () => undefined],
		[
			'local count below census',
			async (engine: RxdbSyncEngine) => seedProductsCensus(engine, 1, Date.now() + 60_000),
		],
	] as const)('fetches with %s', async (_case, arrange) => {
		const server = scriptedProductSearchProxy([]);
		const engine = engineWith(server.fetch);
		await engine.ready;
		await arrange(engine);

		await expect(
			engine.require({ id: `fetch-${_case}`, collection: 'products', kind: 'search', term: 'hat' })
				.ready
		).resolves.toMatchObject({ action: 'fetched' });
		expect(server.state).toEqual({ searchPulls: 1, skuPulls: 1 });
		await engine.dispose();
	});

	it('forceRefresh bypasses both the coverage and catalogue-complete gates', async () => {
		const server = scriptedProductSearchProxy([]);
		const engine = engineWith(server.fetch);
		await engine.ready;
		await engine.require({ id: 'force-seed', collection: 'products', kind: 'search', term: 'hat' })
			.ready;
		await seedProductsCensus(engine, 0, Date.now() + 60_000);

		await expect(
			engine.require({
				id: 'force-refresh',
				collection: 'products',
				kind: 'search',
				term: 'hat',
				forceRefresh: true,
			}).ready
		).resolves.toMatchObject({ action: 'fetched' });
		expect(server.state).toEqual({ searchPulls: 2, skuPulls: 2 });
		await engine.dispose();
	});

	it('serves customer search locally only after trickle completion and a fresh resident census', async () => {
		const server = scriptedCustomerSearchProxy([]);
		const engine = engineWith(server.fetch);
		const scope = await engine.whenActive();
		await scope.database.collections.engineKv.upsert({
			key: 'customer-trickle:state',
			value: JSON.stringify({ viewKey: CUSTOMER_DEFAULT_VIEW_KEY, page: 1, walkComplete: true }),
		});
		await scope.database.collections.queryTotalCacheEntries.upsert({
			queryKey: 'census:customers',
			totalMatchingRecords: 0,
			freshUntilMs: Date.now() + 60_000,
			updatedAtMs: Date.now(),
			schemaVersion: 1,
		});

		await expect(
			engine.require({
				id: 'customer-catalogue',
				collection: 'customers',
				kind: 'search',
				term: 'ada',
			}).ready
		).resolves.toMatchObject({
			action: 'serve-local',
			reason: 'customers catalogue is fully resident locally',
		});
		expect(server.state.pulls).toBe(0);
		await engine.dispose();
	});

	it('keeps customer catalogue completion while a re-sort restarts the trickle', async () => {
		const tricklePages: string[] = [];
		let searchPulls = 0;
		const engine = engineWith(async (url) => {
			const parsed = new URL(url);
			if (!parsed.pathname.endsWith('/customers')) return json([]);
			if (parsed.searchParams.has('search')) {
				searchPulls += 1;
				return json([]);
			}
			if (parsed.searchParams.get('per_page') !== '10') return json([]);
			tricklePages.push(parsed.searchParams.get('page')!);
			return json(
				tricklePages.length === 1
					? []
					: Array.from({ length: 10 }, (_, i) => customerPayload(i + 1))
			);
		});
		const scope = await engine.whenActive();
		await engine.sync('customer-trickle');
		const browse = engine.require({
			id: 'sorted-grid',
			collection: 'customers',
			kind: 'customer-browse',
			limit: 100,
			orderby: 'last_name',
			order: 'asc',
		});
		await browse.ready;
		browse.release();
		await engine.sync('customer-trickle');
		await scope.database.collections.queryTotalCacheEntries.upsert({
			queryKey: 'census:customers',
			totalMatchingRecords: 10,
			freshUntilMs: Date.now() + 60_000,
			updatedAtMs: Date.now(),
			schemaVersion: 1,
		});

		expect(tricklePages).toEqual(['1', '1']);
		await expect(
			engine.require({
				id: 'sticky-catalogue',
				collection: 'customers',
				kind: 'search',
				term: 'ada',
			}).ready
		).resolves.toMatchObject({ action: 'serve-local' });
		expect(searchPulls).toBe(0);
		await engine.dispose();
	});

	it('withdraws customer catalogue completion until a census deficit re-walk completes', async () => {
		let tricklePulls = 0;
		let searchPulls = 0;
		const engine = engineWith(async (url) => {
			const parsed = new URL(url);
			if (!parsed.pathname.endsWith('/customers')) return json([]);
			if (parsed.searchParams.has('search')) {
				searchPulls += 1;
				return json([]);
			}
			tricklePulls += 1;
			return json(
				tricklePulls === 2 ? Array.from({ length: 10 }, (_, i) => customerPayload(i + 1)) : []
			);
		});
		const scope = await engine.whenActive();
		await engine.sync('customer-trickle');
		await scope.database.collections.queryTotalCacheEntries.upsert({
			queryKey: 'census:customers',
			totalMatchingRecords: 1,
			freshUntilMs: Date.now() + 60_000,
			updatedAtMs: Date.now(),
			schemaVersion: 1,
		});

		await engine.sync('customer-trickle');
		await expect(
			engine.require({
				id: 're-armed-catalogue',
				collection: 'customers',
				kind: 'search',
				term: 'ada',
			}).ready
		).resolves.toMatchObject({ action: 'fetched' });
		expect(searchPulls).toBe(1);

		await engine.sync('customer-trickle');
		await expect(
			engine.require({
				id: 're-complete-catalogue',
				collection: 'customers',
				kind: 'search',
				term: 'grace',
			}).ready
		).resolves.toMatchObject({ action: 'serve-local' });
		expect(searchPulls).toBe(1);
		await engine.dispose();
	});

	it('does not trust customer catalogue completion from before this engine session', async () => {
		const server = scriptedCustomerSearchProxy([]);
		const engine = createEngineHarness({
			site: SITE,
			identity: freshIdentity(),
			fetch: server.fetch,
			startAtMs: 2_000,
			awaitReady: false,
		}).engine;
		const scope = await engine.whenActive();
		await scope.database.collections.engineKv.upsert({
			key: 'customer-trickle:state',
			value: JSON.stringify({ viewKey: CUSTOMER_DEFAULT_VIEW_KEY, page: 1, walkComplete: true }),
		});
		await scope.database.collections.queryTotalCacheEntries.upsert({
			queryKey: 'census:customers',
			totalMatchingRecords: 0,
			freshUntilMs: 60_000,
			updatedAtMs: 1_000,
			schemaVersion: 1,
		});

		await expect(
			engine.require({
				id: 'previous-session-customer-census',
				collection: 'customers',
				kind: 'search',
				term: 'ada',
			}).ready
		).resolves.toMatchObject({ action: 'fetched' });
		expect(server.state.pulls).toBe(1);
		await engine.dispose();
	});

	it('does not let the customer:default sentinel satisfy the customers completeness count', async () => {
		const server = scriptedCustomerSearchProxy([]);
		const engine = engineWith(server.fetch);
		const scope = await engine.whenActive();
		await scope.database.collections.engineKv.upsert({
			key: 'customer-trickle:state',
			value: JSON.stringify({ viewKey: CUSTOMER_DEFAULT_VIEW_KEY, page: 1, walkComplete: true }),
		});
		// One real customer exists server-side (census 1) but only the born-local
		// sentinel is resident: the gate must fetch, not mask the missing customer.
		await scope.database.collections.customers.upsert({
			uuid: 'customer:default',
			remoteId: null,
			payload: {},
			sync: { revision: '', partial: true, source: 'woo-rest' },
			local: { dirty: false, pendingMutationIds: [] },
		});
		await scope.database.collections.queryTotalCacheEntries.upsert({
			queryKey: 'census:customers',
			totalMatchingRecords: 1,
			freshUntilMs: Date.now() + 60_000,
			updatedAtMs: Date.now(),
			schemaVersion: 1,
		});

		await expect(
			engine.require({
				id: 'customer-sentinel',
				collection: 'customers',
				kind: 'search',
				term: 'ada',
			}).ready
		).resolves.toMatchObject({ action: 'fetched' });
		expect(server.state.pulls).toBe(1);
		await engine.dispose();
	});

	it('publishes refcounted collection activity across concurrent settle and release paths', async () => {
		const { setPremiumFlag } = await import('rxdb-premium/plugins/shared');
		setPremiumFlag();
		let releaseFetch!: () => void;
		const fetchGate = new Promise<void>((resolve) => {
			releaseFetch = resolve;
		});
		let blockProducts = false;
		const engine = engineWith(async (url) => {
			const parsed = new URL(url);
			if (blockProducts && parsed.pathname.endsWith('/products')) {
				await fetchGate;
			}
			return json([]);
		});
		await engine.ready;
		blockProducts = true;

		const first = engine.require({
			id: 'activity-1',
			collection: 'products',
			kind: 'search',
			term: 'keyboard',
		});
		const second = engine.require({
			id: 'activity-2',
			collection: 'products',
			kind: 'search',
			term: 'keyboard',
		});
		expect(engine.status().collections.products.active).toBe(true);

		second.release();
		expect(engine.status().collections.products.active).toBe(true);
		releaseFetch();
		await first.ready;
		expect(engine.status().collections.products.active).toBe(false);

		await engine.dispose();
	});

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
		expect(rows.map((row) => row['remoteId'])).toEqual([remoteId(321)]);
		expect(await searchTaskRows(engine)).toEqual([]);
		await engine.dispose();
	});

	it('rounds a variations search trip over both legs, preserves parent_id, and persists no search task', async () => {
		const server = scriptedVariationSearchProxy([
			variationEnvelopeDocument(654, 321, 'Blue keyboard'),
		]);
		const engine = engineWith(server.fetch);
		await engine.ready;

		await expect(
			engine.require({
				id: 'variation-search',
				collection: 'variations',
				kind: 'search',
				term: 'blue keyboard',
			}).ready
		).resolves.toMatchObject({ action: 'fetched', documents: 1, requests: 2 });
		expect(server.state.urls).toEqual([
			`${SYNC_BASE}/variations?search=blue+keyboard&per_page=25&page=1`,
			`${SYNC_BASE}/variations?sku=blue+keyboard&per_page=25&page=1`,
		]);

		const scope = engine.active();
		if (!scope) throw new Error('no active scope');
		const rows = (
			await (
				scope.database.collections.variations as {
					find(): { exec(): Promise<{ toJSON(): Record<string, unknown> }[]> };
				}
			)
				.find()
				.exec()
		).map((doc) => doc.toJSON());
		expect(rows).toEqual([
			expect.objectContaining({
				uuid: variationUuid(654),
				remoteId: remoteId(654),
				parentRemoteId: remoteId(321),
			}),
		]);
		expect(await searchTaskRows(engine)).toEqual([]);
		await engine.dispose();
	});

	it('serves a repeated variations search from fresh coverage without another request', async () => {
		const server = scriptedVariationSearchProxy([]);
		const engine = engineWith(server.fetch);
		await engine.ready;
		await engine.require({
			id: 'variation-coverage-seed',
			collection: 'variations',
			kind: 'search',
			term: 'empty',
		}).ready;
		const requestsBefore = server.state.urls.length;

		await expect(
			engine.require({
				id: 'variation-coverage-repeat',
				collection: 'variations',
				kind: 'search',
				term: 'empty',
			}).ready
		).resolves.toMatchObject({
			action: 'serve-local',
			reason: 'variations search fetched within the coverage window',
			requests: 0,
		});
		expect(server.state.urls).toHaveLength(requestsBefore);
		await engine.dispose();
	});

	it('forceRefresh refetches a variations search despite fresh coverage', async () => {
		const server = scriptedVariationSearchProxy([]);
		const engine = engineWith(server.fetch);
		await engine.ready;
		await engine.require({
			id: 'variation-force-seed',
			collection: 'variations',
			kind: 'search',
			term: 'blue',
		}).ready;

		await expect(
			engine.require({
				id: 'variation-force-refresh',
				collection: 'variations',
				kind: 'search',
				term: 'blue',
				forceRefresh: true,
			}).ready
		).resolves.toMatchObject({ action: 'fetched' });
		expect(server.state.urls).toHaveLength(4);
		await engine.dispose();
	});

	it('runs both variations legs for a two-character term', async () => {
		const server = scriptedVariationSearchProxy([]);
		const engine = engineWith(server.fetch);
		await engine.ready;

		await expect(
			engine.require({
				id: 'variation-short-search',
				collection: 'variations',
				kind: 'search',
				term: '42',
			}).ready
		).resolves.toMatchObject({ action: 'fetched', requests: 2 });
		expect(server.state.urls).toEqual([
			`${SYNC_BASE}/variations?search=42&per_page=25&page=1`,
			`${SYNC_BASE}/variations?sku=42&per_page=25&page=1`,
		]);
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
		expect(rows.map((row) => row['remoteId'])).toEqual([remoteId(12)]);
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
			uuid: productUuid(321),
			remoteId: remoteId(321),
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

	it('does not report a NATIVE-shaped cancel of a released search as an error', async () => {
		// expo's winter fetch — what `globalThis.fetch` is on native — rejects an
		// aborted request with a PLAIN Error (name "Error") wrapping
		// FetchRequestCanceledException, not a DOMException named AbortError. The
		// release branch keyed on that name, so on native every superseded search
		// was emitted as `coverage.require.error` at ERROR level, which the dev
		// client draws as a red box OVER the app (monorepo#1672).
		//
		// Assert the DIAGNOSTIC, not the outcome: `handle.ready` resolves to
		// `released` either way, so an outcome assertion cannot tell the fixed
		// code from the broken code. Message is verbatim from a device.
		const started = Promise.withResolvers<AbortSignal>();
		const harness = createEngineHarness({
			site: SITE,
			identity: freshIdentity(),
			awaitReady: false,
			fetch: async (url: string, init?: RequestInit) => {
				if (!new URL(url).pathname.endsWith('/products')) return json([]);
				const signal = init?.signal;
				if (!signal) throw new Error('search request missing abort signal');
				started.resolve(signal);
				return await new Promise<Response>((_resolve, reject) => {
					const abort = () =>
						reject(
							new Error(
								'fetch failed: FetchRequestCanceledException: Fetch request has been canceled (at Expo/NativeResponse.swift:63)'
							)
						);
					signal.addEventListener('abort', abort, { once: true });
					if (signal.aborted) abort();
				});
			},
		});
		await harness.engine.ready;

		const handle = harness.engine.require({
			id: 'native-cancel-classification',
			collection: 'products',
			kind: 'search',
			term: 'keyboard',
		});
		await started.promise;
		handle.release();
		await expect(handle.ready).resolves.toMatchObject({ action: 'released' });

		// Let the deferred abandon (#1221) and the pump's catch run.
		await new Promise((resolve) => setTimeout(resolve, 50));

		expect(harness.diagnostics.filter((event) => event.type === 'coverage.require.error')).toEqual(
			[]
		);
		await harness.engine.dispose();
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

	it('rejoins an in-flight search when an identical redeclare follows release in the same tick (#1221)', async () => {
		const response = Promise.withResolvers<Response>();
		const started = Promise.withResolvers<AbortSignal>();
		let searchPulls = 0;
		const engine = engineWith(async (url, init) => {
			const parsed = new URL(url);
			if (!parsed.pathname.endsWith('/products')) return json([]);
			if (parsed.searchParams.has('sku')) return json([]);
			searchPulls += 1;
			const signal = init?.signal;
			if (!signal) throw new Error('search request missing abort signal');
			started.resolve(signal);
			return response.promise;
		});
		await engine.ready;
		const first = engine.require({
			id: 'churn-a',
			collection: 'products',
			kind: 'search',
			term: 'keyboard',
		});
		const signal = await started.promise;

		// Mimic the React demand effect on a recompile: the old handles release and the
		// identical requirement is redeclared in the same synchronous pass.
		first.release();
		const second = engine.require({
			id: 'churn-b',
			collection: 'products',
			kind: 'search',
			term: 'keyboard',
		});
		await Promise.resolve(); // flush the deferred-abandon microtask
		expect(signal.aborted).toBe(false);

		response.resolve(json([productPayload(321, 'Keyboard')]));
		await expect(first.ready).resolves.toMatchObject({ action: 'released' });
		await expect(second.ready).resolves.toMatchObject({ action: 'fetched' });
		expect(signal.aborted).toBe(false);
		expect(searchPulls).toBe(1);
		await engine.dispose();
	});

	it('queues a wider redeclare behind the in-flight walk instead of aborting it (#1221)', async () => {
		const response = Promise.withResolvers<Response>();
		const started = Promise.withResolvers<AbortSignal>();
		const state = { searchPulls: 0, skuPulls: 0 };
		const engine = engineWith(async (url, init) => {
			const parsed = new URL(url);
			if (!parsed.pathname.endsWith('/products')) return json([]);
			if (parsed.searchParams.has('sku')) {
				state.skuPulls += 1;
				return json([]);
			}
			state.searchPulls += 1;
			const signal = init?.signal;
			if (!signal) throw new Error('search request missing abort signal');
			started.resolve(signal);
			return response.promise;
		});
		await engine.ready;
		const first = engine.require({
			id: 'grow-a',
			collection: 'products',
			kind: 'search',
			term: 'e2e-probe',
			limit: 60,
		});
		const signal = await started.promise;

		// The end-reached churn shape: limit grows, old handle releases, wider identical
		// search redeclares — the in-flight walk must finish, not die as a 499.
		first.release();
		const second = engine.require({
			id: 'grow-b',
			collection: 'products',
			kind: 'search',
			term: 'e2e-probe',
			limit: 70,
		});
		await Promise.resolve(); // flush the deferred-abandon microtask
		expect(signal.aborted).toBe(false);

		// Short page → both legs exhausted → the finished walk records a COMPLETE lane,
		// which answers the wider successor without another wire request.
		response.resolve(json([]));
		await expect(second.ready).resolves.toMatchObject({
			action: 'serve-local',
			reason: 'products search fetched within the coverage window',
			requests: 0,
		});
		expect(signal.aborted).toBe(false);
		expect(state).toEqual({ searchPulls: 1, skuPulls: 1 });
		await engine.dispose();
	});

	it('reuses completed customer-search coverage for a wider successor', async () => {
		const response = Promise.withResolvers<Response>();
		const started = Promise.withResolvers<AbortSignal>();
		let customerPulls = 0;
		const engine = engineWith(async (url, init) => {
			const parsed = new URL(url);
			if (!parsed.pathname.endsWith('/customers')) return json([]);
			customerPulls += 1;
			if (customerPulls > 1) return json([]);
			const signal = init?.signal;
			if (!signal) throw new Error('search request missing abort signal');
			started.resolve(signal);
			return response.promise;
		});
		await engine.ready;
		const first = engine.require({
			id: 'customer-grow-a',
			collection: 'customers',
			kind: 'search',
			term: 'ada',
			limit: 60,
		});
		const signal = await started.promise;

		first.release();
		const second = engine.require({
			id: 'customer-grow-b',
			collection: 'customers',
			kind: 'search',
			term: 'ada',
			limit: 70,
		});
		await Promise.resolve();
		expect(signal.aborted).toBe(false);

		response.resolve(json([]));
		await expect(first.ready).resolves.toMatchObject({ action: 'released' });
		await expect(second.ready).resolves.toMatchObject({
			action: 'serve-local',
			reason: 'customers search fetched within the coverage window',
			requests: 0,
		});
		expect(signal.aborted).toBe(false);
		expect(customerPulls).toBe(1);
		await engine.dispose();
	});

	it('aborts an orphaned in-flight predecessor when its wider successor is released', async () => {
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
			id: 'orphan-a',
			collection: 'products',
			kind: 'search',
			term: 'keyboard',
			limit: 60,
		});
		const signal = await started.promise;

		first.release();
		const successor = engine.require({
			id: 'orphan-b',
			collection: 'products',
			kind: 'search',
			term: 'keyboard',
			limit: 70,
		});
		successor.release();
		await Promise.resolve();

		expect(signal.aborted).toBe(true);
		response.resolve(json([]));
		await expect(first.ready).resolves.toMatchObject({ action: 'released' });
		await expect(successor.ready).resolves.toMatchObject({
			action: 'released',
		});
		await engine.dispose();
	});

	it.each([
		['valid before invalid', ['valid', 'invalid']],
		['invalid before valid', ['invalid', 'valid']],
	] as const)(
		'isolates an invalid search limit from a concurrent %s declaration',
		async (_case, order) => {
			const customerGate = Promise.withResolvers<Response>();
			let productSearchPulls = 0;
			const engine = engineWith(async (url) => {
				const parsed = new URL(url);
				if (parsed.pathname.endsWith('/customers')) return customerGate.promise;
				if (parsed.pathname.endsWith('/products') && !parsed.searchParams.has('sku')) {
					productSearchPulls += 1;
				}
				return json([]);
			});
			await engine.ready;
			const blocker = engine.require({
				id: `invalid-limit-blocker-${_case}`,
				collection: 'customers',
				kind: 'search',
				term: 'ada',
			});
			const handles = order.map((kind) =>
				engine.require({
					id: `${kind}-${_case}`,
					collection: 'products',
					kind: 'search',
					term: 'keyboard',
					limit: kind === 'valid' ? 10 : 0,
				})
			);
			const valid = handles[order.indexOf('valid')];
			const invalid = handles[order.indexOf('invalid')];
			const invalidOutcome = expect(invalid.ready).rejects.toThrow(/positive integer/i);
			customerGate.resolve(json([]));

			await expect(blocker.ready).resolves.toMatchObject({ action: 'fetched' });
			await invalidOutcome;
			await expect(valid.ready).resolves.toMatchObject({ action: 'fetched' });
			expect(productSearchPulls).toBe(1);
			await engine.dispose();
		}
	);

	it('keeps force-refresh searches separate from queued ordinary searches at unequal limits', async () => {
		const customerGate = Promise.withResolvers<Response>();
		let productSearchPulls = 0;
		const engine = engineWith(async (url) => {
			const parsed = new URL(url);
			if (parsed.pathname.endsWith('/customers')) return customerGate.promise;
			if (parsed.pathname.endsWith('/products') && !parsed.searchParams.has('sku')) {
				productSearchPulls += 1;
			}
			return json([]);
		});
		await engine.ready;
		const blocker = engine.require({
			id: 'force-identity-blocker',
			collection: 'customers',
			kind: 'search',
			term: 'ada',
		});
		const ordinary = engine.require({
			id: 'ordinary-queued',
			collection: 'products',
			kind: 'search',
			term: 'keyboard',
			limit: 100,
		});
		const forced = engine.require({
			id: 'forced-queued',
			collection: 'products',
			kind: 'search',
			term: 'keyboard',
			limit: 50,
			forceRefresh: true,
		});
		customerGate.resolve(json([]));

		await expect(blocker.ready).resolves.toMatchObject({ action: 'fetched' });
		await expect(Promise.all([ordinary.ready, forced.ready])).resolves.toEqual([
			expect.objectContaining({ action: 'fetched' }),
			expect.objectContaining({ action: 'fetched' }),
		]);
		expect(productSearchPulls).toBe(2);
		await engine.dispose();
	});

	it('coalesces queued search declarations to the widest requested window (#1221)', async () => {
		const customerGate = Promise.withResolvers<Response>();
		const productPerPage: string[] = [];
		const engine = engineWith(async (url) => {
			const parsed = new URL(url);
			if (parsed.pathname.endsWith('/customers')) return customerGate.promise;
			if (parsed.pathname.endsWith('/products') && !parsed.searchParams.has('sku')) {
				productPerPage.push(parsed.searchParams.get('per_page') ?? '');
			}
			return json([]);
		});
		await engine.ready;
		// Occupy the serial pump so the products search stays queued while both limits declare.
		const customers = engine.require({
			id: 'occupy-pump',
			collection: 'customers',
			kind: 'search',
			term: 'ada',
		});
		const narrow = engine.require({
			id: 'coalesce-narrow',
			collection: 'products',
			kind: 'search',
			term: 'keyboard',
			limit: 10,
		});
		const wide = engine.require({
			id: 'coalesce-wide',
			collection: 'products',
			kind: 'search',
			term: 'keyboard',
			limit: 40,
		});
		customerGate.resolve(json([]));

		await expect(customers.ready).resolves.toMatchObject({ action: 'fetched' });
		await expect(Promise.all([narrow.ready, wide.ready])).resolves.toEqual([
			expect.objectContaining({ action: 'fetched' }),
			expect.objectContaining({ action: 'fetched' }),
		]);
		// One walk, sized to the widest declarer.
		expect(productPerPage).toEqual(['40']);
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
		).rejects.toThrow(/'search' supports products\/customers\/variations/i);
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
