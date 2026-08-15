/**
 * Drain outcomes are PER TASK, not per tick.
 *
 * A drain tick runs every runnable scheduler task, so its scalar counters (`failed`,
 * `claimLost`, `totalDocuments` …) describe the TICK. Every require-plane browse/refresh
 * branch nonetheless read them as if they described its own work:
 *
 *     if (drainResult.failed > 0) throw ...
 *
 * So an unrelated collection failing in the same tick rejected a requirement whose own task
 * had succeeded, and an unrelated lost claim reported it released — with another lane's
 * document counts attached. These tests pin the fix end-to-end against a real engine and a
 * real drain: no mocked drain result can prove a task's failure stays in its own lane.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

import { type RxdbSyncEngine, type StoreScopeIdentity } from './create-rxdb-sync-engine';
import { seedOrderFilterSchedulerTask } from './scheduler';
import { seedTaxRatesLane } from './scheduler/rx-pos-bootstrap-seeder';
import { createEngineHarness } from './testing';

const SITE = 'https://lab.example.test';
let uniqueStore = 0;

afterEach(async () => {
	await createEngineHarness.disposeTrackedEngines();
	vi.useRealTimers();
	vi.restoreAllMocks();
});

function freshIdentity(): StoreScopeIdentity {
	uniqueStore += 1;
	return { site: SITE, storeId: 3, cashierId: `drain-outcomes-${uniqueStore}` };
}

function json(payload: unknown, headers: Record<string, string> = {}): Response {
	return new Response(JSON.stringify(payload), {
		status: 200,
		headers: { 'content-type': 'application/json', ...headers },
	});
}

const productUuid = (n: number): string => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

function productPayload(id: number): Record<string, unknown> {
	return {
		id,
		name: `Product ${id}`,
		date_modified_gmt: '2026-08-06T00:00:00',
		price: '10.00',
		menu_order: id,
		stock_status: 'instock',
		status: 'publish',
		type: 'simple',
		categories: [],
		brands: [],
		on_sale: false,
		featured: false,
		stock_quantity: null,
		meta_data: [{ key: '_woocommerce_pos_uuid', value: productUuid(id) }],
	};
}

/**
 * A server that serves products normally and answers EVERY orders read with a 500. Any orders
 * task in the same drain tick therefore fails, while every products task succeeds.
 */
function productsHealthyOrdersBroken() {
	const requested: string[] = [];
	const fetch = async (url: string): Promise<Response> => {
		const u = new URL(url);
		requested.push(u.pathname);
		if (u.pathname.endsWith('/orders')) {
			return new Response('{"message":"boom"}', { status: 500 });
		}
		if (u.pathname.endsWith('/taxes')) {
			// A healthy unrelated lane with a DISTINCT, non-zero row count.
			return json(
				Array.from({ length: 7 }, (_, index) => ({
					id: index + 1,
					country: 'GB',
					rate: '20.0000',
					name: 'VAT',
				})),
				{ 'X-WP-Total': '7', 'X-WP-TotalPages': '1' }
			);
		}
		if (u.pathname.endsWith('/products')) {
			const perPage = Number(u.searchParams.get('per_page') ?? '10');
			const page = Number(u.searchParams.get('page') ?? '1');
			const all = Array.from({ length: 250 }, (_, index) => productPayload(index + 1));
			const start = (page - 1) * perPage;
			return json(all.slice(start, start + perPage), {
				'X-WP-Total': '250',
				'X-WP-TotalPages': String(Math.ceil(250 / perPage)),
			});
		}
		return json([]);
	};
	return { requested, fetch };
}

function engineWith(fetch: (url: string, init?: RequestInit) => Promise<Response>) {
	return createEngineHarness({
		site: SITE,
		identity: freshIdentity(),
		fetch,
		awaitReady: false,
	}).engine;
}

async function residentTaxRateCount(engine: RxdbSyncEngine): Promise<number> {
	const scope = engine.active();
	if (!scope) throw new Error('no active scope');
	const documents = await (
		scope.database.collections.taxRates as { find(): { exec(): Promise<unknown[]> } }
	)
		.find()
		.exec();
	return documents.length;
}

async function residentProductCount(engine: RxdbSyncEngine): Promise<number> {
	const scope = engine.active();
	if (!scope) throw new Error('no active scope');
	const documents = await (
		scope.database.collections.products as {
			find(): { exec(): Promise<unknown[]> };
		}
	)
		.find()
		.exec();
	return documents.length;
}

/** Persist a runnable orders task that is guaranteed to fail when the tick reaches it. */
async function seedDoomedOrdersTask(engine: RxdbSyncEngine): Promise<void> {
	const scope = engine.active();
	if (!scope) throw new Error('no active scope');
	const seeded = await seedOrderFilterSchedulerTask({
		status: 'processing',
		search: '',
		limit: 25,
		complete: false,
		database: scope.database as never,
	});
	expect(seeded.taskIds.length).toBeGreaterThan(0);
}

describe('per-task drain outcomes across the require-plane', () => {
	it('does not fail a products browse because an unrelated orders task failed', async () => {
		const { setPremiumFlag } = await import('rxdb-premium/plugins/shared');
		setPremiumFlag();
		const server = productsHealthyOrdersBroken();
		const engine = engineWith(server.fetch);
		await engine.ready;
		await seedDoomedOrdersTask(engine);

		// The products browse drains in the same tick as the doomed orders task. Its OWN task
		// succeeded, so it must report a fetch — reading the tick's `failed` counter rejected it.
		const handle = engine.require({
			id: 'products-browse-beside-a-failure',
			collection: 'products',
			kind: 'product-browse',
			limit: 10,
		});

		await expect(handle.ready).resolves.toMatchObject({ action: 'fetched' });
		expect(await residentProductCount(engine)).toBeGreaterThan(0);
		// The failing lane really was in the tick — otherwise this proves nothing.
		expect(server.requested).toContain('/wp-json/wcpos/v2/orders');
		handle.release();
	});

	it('reports only its OWN documents and requests, not the whole tick', async () => {
		const { setPremiumFlag } = await import('rxdb-premium/plugins/shared');
		setPremiumFlag();
		const server = productsHealthyOrdersBroken();
		const engine = engineWith(server.fetch);
		await engine.ready;
		// The unrelated lane must SUCCEED and carry its own non-zero counts. A merely failing
		// neighbour contributes zero documents, so its presence could not distinguish per-task
		// counts from tick-wide totals — the assertion would hold under the old aggregate code.
		const scope = engine.active();
		if (!scope) throw new Error('no active scope');
		await seedTaxRatesLane({ database: scope.database as never });

		const handle = engine.require({
			id: 'products-own-counts',
			collection: 'products',
			kind: 'product-browse',
			limit: 10,
		});
		const outcome = await handle.ready;

		const products = await residentProductCount(engine);
		const taxRates = await residentTaxRateCount(engine);
		// The tax lane really ran in this tick — otherwise this proves nothing.
		expect(taxRates).toBe(7);
		expect(server.requested).toContain('/wp-json/wcpos/v2/taxes');
		// Own counts only: the tick moved products + 7 tax rates, this requirement moved products.
		expect(outcome.documents).toBe(products);
		expect(outcome.documents).not.toBe(products + taxRates);
		expect(outcome.requests).toBeGreaterThan(0);
		handle.release();
	});

	it('still rejects when the requirement’s OWN task is the one that failed', async () => {
		const { setPremiumFlag } = await import('rxdb-premium/plugins/shared');
		setPremiumFlag();
		const server = productsHealthyOrdersBroken();
		const engine = engineWith(server.fetch);
		await engine.ready;

		// Scoping outcomes per task must not swallow a genuine failure: this requirement's own
		// orders task is the one hitting the 500.
		const handle = engine.require({
			id: 'orders-browse-that-really-fails',
			collection: 'orders',
			kind: 'orders-browse',
			status: 'processing',
			limit: 25,
		});

		await expect(handle.ready).rejects.toThrow(/scheduler drain failed/i);
		handle.release();
	});

	// NOTE what this does and does not prove. Customers additionally scopes its drain to its own
	// task id (work isolation — see the require-plane comment), so an unrelated task is never in
	// its tick at all and this cannot exercise outcome isolation for that lane. Its verdict path
	// is the SHARED requirementDrainOutcome helper, covered by the runner and require-orders
	// suites; this is a plain regression guard that the lane still fetches.
	it('keeps a customers browse healthy while another lane is failing', async () => {
		const { setPremiumFlag } = await import('rxdb-premium/plugins/shared');
		setPremiumFlag();
		const server = productsHealthyOrdersBroken();
		const engine = engineWith(server.fetch);
		await engine.ready;
		await seedDoomedOrdersTask(engine);

		const handle = engine.require({
			id: 'customers-browse-beside-a-failure',
			collection: 'customers',
			kind: 'customer-browse',
			limit: 10,
			orderby: 'id',
			order: 'asc',
		});

		await expect(handle.ready).resolves.toMatchObject({ action: 'fetched' });
		handle.release();
	});

	it('keeps a reference refresh healthy beside a failing orders task', async () => {
		const { setPremiumFlag } = await import('rxdb-premium/plugins/shared');
		setPremiumFlag();
		const server = productsHealthyOrdersBroken();
		const engine = engineWith(server.fetch);
		await engine.ready;
		await seedDoomedOrdersTask(engine);

		const handle = engine.require({
			id: 'categories-refresh-beside-a-failure',
			collection: 'categories',
			kind: 'refresh',
		});

		await expect(handle.ready).resolves.toMatchObject({ action: 'fetched' });
		handle.release();
	});
});
