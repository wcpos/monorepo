/**
 * The public PRODUCTS BROWSE-WINDOW demand verb:
 * `engine.require({ collection: 'products', kind: 'query', queryKey: 'products:browse-window:…' })`.
 *
 * Before #909 an unfiltered products browse declared NO remote demand at all: the cold
 * 100-row seed was the whole catalog the grid would ever see, so infinite scroll fetched
 * nothing past it and a sort change re-sorted the wrong local slice. These tests pin the
 * two properties that fix, plus the #908 invariant that every request obeys the dial.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
	createRxdbSyncEngine,
	type RxdbSyncEngine,
	type StoreScopeIdentity,
} from './create-rxdb-sync-engine';
import { memoryEngineStorage } from './testing';

const SITE = 'https://lab.example.test';
const SYNC_BASE = `${SITE}/wp-json/wcpos/v2`;
let uniqueStore = 0;

const productUuid = (n: number): string => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const posMeta = (uuid: string) => [{ key: '_woocommerce_pos_uuid', value: uuid }];

afterEach(() => {
	vi.useRealTimers();
	vi.restoreAllMocks();
});

function freshIdentity(): StoreScopeIdentity {
	uniqueStore += 1;
	return { site: SITE, storeId: 3, cashierId: `req-browse-${uniqueStore}` };
}

function json(payload: unknown, totalPages?: number): Response {
	return new Response(JSON.stringify(payload), {
		status: 200,
		headers: {
			'content-type': 'application/json',
			...(totalPages === undefined ? {} : { 'x-wp-totalpages': String(totalPages) }),
		},
	});
}

function productPayload(id: number, menuOrder: number, price: string): Record<string, unknown> {
	return {
		id,
		name: `Product ${id}`,
		date_modified_gmt: '2026-07-10T00:00:00',
		price,
		menu_order: menuOrder,
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

/**
 * A catalog of `count` products with distinct menu_order, served in whatever order the
 * request's `orderby`/`order` asks for. Records every request's per_page and sort.
 */
function scriptedCatalog(count: number) {
	const catalog = Array.from({ length: count }, (_, index) =>
		productPayload(index + 1, index, String(1_000 - index))
	);
	const state = { perPages: [] as number[], sorts: [] as string[] };
	const fetch = async (url: string): Promise<Response> => {
		const u = new URL(url);
		if (!u.pathname.endsWith('/products')) return json([]);
		const perPage = Number(u.searchParams.get('per_page'));
		const page = Number(u.searchParams.get('page') ?? '1');
		state.perPages.push(perPage);
		state.sorts.push(`${u.searchParams.get('orderby')}:${u.searchParams.get('order')}`);
		const ordered = u.searchParams.get('order') === 'desc' ? [...catalog].reverse() : [...catalog];
		const start = (page - 1) * perPage;
		return json(ordered.slice(start, start + perPage), Math.ceil(count / perPage));
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

async function productIds(engine: RxdbSyncEngine): Promise<number[]> {
	const scope = engine.active();
	if (!scope) throw new Error('no active scope');
	const documents = await (
		scope.database.collections.products as {
			find(): { exec(): Promise<{ toJSON(): Record<string, unknown> }[]> };
		}
	)
		.find()
		.exec();
	return documents
		.map((document) => Number(document.toJSON()['wooProductId']))
		.sort((a, b) => a - b);
}

describe('require() for the products browse window', () => {
	it('fetches the next window when the grid scrolls past the seed', async () => {
		const { setPremiumFlag } = await import('rxdb-premium/plugins/shared');
		setPremiumFlag();
		const server = scriptedCatalog(400);
		const engine = engineWith(server.fetch);
		await engine.ready;

		const seeded = await engine.require({
			id: 'browse-seed',
			collection: 'products',
			kind: 'query',
			queryKey: 'products:browse-window:limit=100',
		}).ready;
		expect(seeded).toMatchObject({ action: 'fetched' });
		expect(await productIds(engine)).toHaveLength(100);

		// onEndReached grows the grid's limit → a WIDER window key → genuinely new rows.
		const grown = await engine.require({
			id: 'browse-grown',
			collection: 'products',
			kind: 'query',
			queryKey: 'products:browse-window:limit=200',
		}).ready;
		expect(grown).toMatchObject({ action: 'fetched' });
		const ids = await productIds(engine);
		expect(ids).toHaveLength(200);
		expect(ids[199]).toBe(200);

		await engine.dispose();
	});

	it('re-seeds a server-sorted window when the sort changes', async () => {
		const { setPremiumFlag } = await import('rxdb-premium/plugins/shared');
		setPremiumFlag();
		const server = scriptedCatalog(400);
		const engine = engineWith(server.fetch);
		await engine.ready;

		await engine.require({
			id: 'browse-seed',
			collection: 'products',
			kind: 'query',
			queryKey: 'products:browse-window:limit=100',
		}).ready;

		const sorted = await engine.require({
			id: 'browse-price-desc',
			collection: 'products',
			kind: 'query',
			queryKey: 'products:browse-window:limit=100:orderby=price:order=desc',
		}).ready;

		expect(sorted).toMatchObject({ action: 'fetched' });
		// The sort reached the WIRE, not just a local re-sort of the seeded slice.
		expect(server.state.sorts).toContain('price:desc');
		// Top-of-catalog by price desc is ids 400…301 — rows the menu_order seed never held.
		const ids = await productIds(engine);
		expect(ids).toContain(400);
		expect(ids).toContain(301);

		await engine.dispose();
	});

	it('never exceeds the Performance dial on any browse-window request', async () => {
		const { setPremiumFlag } = await import('rxdb-premium/plugins/shared');
		setPremiumFlag();
		const server = scriptedCatalog(400);
		const engine = engineWith(server.fetch);
		await engine.ready;
		// Exactly what SyncConfigBridge does when the store's Balanced dial lands.
		engine.reconfigure({ pullBatchSize: 25 });

		await engine.require({
			id: 'browse-seed',
			collection: 'products',
			kind: 'query',
			queryKey: 'products:browse-window:limit=100',
		}).ready;

		// The #908 acceptance case, at the engine's public door: a clean DB seeding the
		// cold window issues only dial-sized requests — never the old per_page=100.
		expect(server.state.perPages.length).toBeGreaterThan(0);
		expect(Math.max(...server.state.perPages)).toBeLessThanOrEqual(25);
		expect(await productIds(engine)).toHaveLength(100);

		await engine.dispose();
	});

	it('rejects a query requirement that is not a browse-window descriptor', async () => {
		const { setPremiumFlag } = await import('rxdb-premium/plugins/shared');
		setPremiumFlag();
		const server = scriptedCatalog(10);
		const engine = engineWith(server.fetch);
		await engine.ready;

		await expect(
			engine.require({
				id: 'browse-bogus',
				collection: 'products',
				kind: 'query',
				queryKey: 'products:everything',
			}).ready
		).rejects.toThrow('require: unsupported product query');

		await engine.dispose();
	});
});
