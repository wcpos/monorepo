/**
 * The public CUSTOMERS BROWSE-WINDOW demand verb (#951):
 * `engine.require({ collection: 'customers', kind: 'customer-browse', ...dimensions })`.
 *
 * Before this lane a customers browse declared NO remote demand at all. That is correct for a
 * cold UNSORTED browse (#865 — customers are on-demand plus an idle trickle, and that ruling
 * stands), but it meant the grid's SORT UI re-ordered whichever residents the trickle happened
 * to have walked to: mid-trickle (id asc) a cashier sorting by registration date saw a
 * plausible-looking but incomplete list. Paul's ruling (2026-08-06): "You're a cashier — you
 * go to the customers page and you change the sorting or you add a filter. You expect to see
 * those customers."
 *
 * These tests pin that fix and the invariants it must not break: the trickle keeps its own
 * cursor, `role=all` stays on every request, scroll extension mints a DISTINCT window (not the
 * collapsed dedupe of #957), and no arbitrary record cap bounds the window (R8).
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

import { type RemoteId, wooIdOf } from '@wcpos/sync-core';

import { type RxdbSyncEngine, type StoreScopeIdentity } from './create-rxdb-sync-engine';
import { seedTaxRatesLane } from './scheduler/rx-pos-bootstrap-seeder';
import { createEngineHarness } from './testing';

const SITE = 'https://lab.example.test';
let uniqueStore = 0;

const customerUuid = (n: number): string =>
	`00000000-0000-4000-9000-${String(n).padStart(12, '0')}`;

afterEach(async () => {
	await createEngineHarness.disposeTrackedEngines();
	vi.useRealTimers();
	vi.restoreAllMocks();
});

function freshIdentity(): StoreScopeIdentity {
	uniqueStore += 1;
	return { site: SITE, storeId: 3, cashierId: `req-cust-browse-${uniqueStore}` };
}

function json(payload: unknown, headers: Record<string, string> = {}): Response {
	return new Response(JSON.stringify(payload), {
		status: 200,
		headers: { 'content-type': 'application/json', ...headers },
	});
}

function customerPayload(id: number): Record<string, unknown> {
	return {
		id,
		email: `customer-${id}@example.test`,
		first_name: `First${id}`,
		last_name: `Last${String(1_000 - id).padStart(4, '0')}`,
		role: 'customer',
		date_created_gmt: `2026-01-${String((id % 28) + 1).padStart(2, '0')}T00:00:00`,
		date_modified_gmt: '2026-08-06T00:00:00',
		meta_data: [{ key: '_woocommerce_pos_uuid', value: customerUuid(id) }],
	};
}

type RequestLog = { url: URL; sort: string; role: string | null; perPage: number; page: number };

/**
 * A customer base of `count` users. `id` ascending is the natural order; `registered_date`
 * descending is deliberately the REVERSE, so a test can prove the rows that arrive came from
 * the requested server sort and not from a locally re-ordered id-asc slice.
 */
function scriptedCustomerBase(count: number) {
	const byId = Array.from({ length: count }, (_, index) => customerPayload(index + 1));
	const requests: RequestLog[] = [];
	const fetch = async (url: string): Promise<Response> => {
		const u = new URL(url);
		if (!u.pathname.endsWith('/customers')) return json([]);
		const perPage = Number(u.searchParams.get('per_page') ?? '10');
		const page = Number(u.searchParams.get('page') ?? '1');
		const orderby = u.searchParams.get('orderby') ?? 'id';
		const order = u.searchParams.get('order') ?? 'asc';
		requests.push({
			url: u,
			sort: `${orderby}:${order}`,
			role: u.searchParams.get('role'),
			perPage,
			page,
		});
		const ordered = order === 'desc' ? [...byId].reverse() : [...byId];
		const start = (page - 1) * perPage;
		return json(ordered.slice(start, start + perPage), {
			'X-WP-Total': String(count),
			'X-WP-TotalPages': String(Math.ceil(count / perPage)),
		});
	};
	return { requests, fetch };
}

function engineWith(fetch: (url: string, init?: RequestInit) => Promise<Response>) {
	return createEngineHarness({
		site: SITE,
		identity: freshIdentity(),
		fetch,
		awaitReady: false,
	}).engine;
}

async function residentCustomerIds(engine: RxdbSyncEngine): Promise<number[]> {
	const scope = engine.active();
	if (!scope) throw new Error('no active scope');
	const documents = await (
		scope.database.collections.customers as {
			find(): { exec(): Promise<{ toJSON(): Record<string, unknown> }[]> };
		}
	)
		.find()
		.exec();
	return documents
		.map((document) => wooIdOf(document.toJSON()['remoteId'] as RemoteId))
		.filter((id) => Number.isFinite(id))
		.sort((a, b) => a - b);
}

async function cachedTotalFor(engine: RxdbSyncEngine, queryKey: string): Promise<number | null> {
	const scope = engine.active();
	if (!scope) throw new Error('no active scope');
	const documents = await (
		scope.database.collections.queryTotalCacheEntries as {
			find(): { exec(): Promise<{ toJSON(): Record<string, unknown> }[]> };
		}
	)
		.find()
		.exec();
	const entry = documents
		.map((document) => document.toJSON())
		.find((document) => document['queryKey'] === queryKey);
	return entry ? Number(entry['totalMatchingRecords']) : null;
}

describe('require() for the customers browse window', () => {
	it('a cold grid sorted by registration date fetches THAT order from the server', async () => {
		const { setPremiumFlag } = await import('rxdb-premium/plugins/shared');
		setPremiumFlag();
		const server = scriptedCustomerBase(4_000);
		const engine = engineWith(server.fetch);
		await engine.ready;

		const handle = engine.require({
			id: 'customers-browse',
			collection: 'customers',
			kind: 'customer-browse',
			limit: 10,
			orderby: 'registered_date',
			order: 'desc',
		});
		expect(handle.queryKey).toBe(
			'customers:browse-window:limit=100:orderby=registered_date:order=desc'
		);
		expect(await handle.ready).toMatchObject({ action: 'fetched' });

		// Every browse request asked the SERVER for that sort, with role=all (#1379/#850).
		expect(server.requests.length).toBeGreaterThan(0);
		for (const request of server.requests) {
			expect(request.sort).toBe('registered_date:desc');
			expect(request.role).toBe('all');
		}
		// The rows that landed are the TAIL of the id space — the reverse of what an id-asc
		// window would have produced. A locally re-sorted id-asc slice could never contain them.
		const resident = await residentCustomerIds(engine);
		expect(resident).toHaveLength(100);
		expect(resident[0]).toBe(3_901);
		expect(resident.at(-1)).toBe(4_000);

		// The footer's total is the SERVER's count for this view, not the 100 rows held (#894/#945).
		expect(await cachedTotalFor(engine, handle.queryKey!)).toBe(4_000);
		handle.release();
	});

	it('ignores an unrelated failing scheduler task while draining a customer browse', async () => {
		const { setPremiumFlag } = await import('rxdb-premium/plugins/shared');
		setPremiumFlag();
		const server = scriptedCustomerBase(100);
		let unrelatedRequests = 0;
		const engine = engineWith(async (url) => {
			if (new URL(url).pathname.endsWith('/customers')) return server.fetch(url);
			unrelatedRequests += 1;
			return new Response('unrelated task failed', { status: 500 });
		});
		await engine.ready;

		const scope = engine.active();
		if (!scope) throw new Error('no active scope');
		await seedTaxRatesLane({ database: scope.database as never });
		const unrelatedRequestsBeforeBrowse = unrelatedRequests;

		const handle = engine.require({
			id: 'customers-browse-isolated-drain',
			collection: 'customers',
			kind: 'customer-browse',
			limit: 10,
			orderby: 'id',
			order: 'asc',
		});
		await expect(handle.ready).resolves.toMatchObject({ action: 'fetched' });
		expect(server.requests.length).toBeGreaterThan(0);
		expect(unrelatedRequests).toBe(unrelatedRequestsBeforeBrowse);
		handle.release();
	});

	it('scroll extension mints a DISTINCT window key and fetches genuinely new rows (#957)', async () => {
		const { setPremiumFlag } = await import('rxdb-premium/plugins/shared');
		setPremiumFlag();
		const server = scriptedCustomerBase(4_000);
		const engine = engineWith(server.fetch);
		await engine.ready;

		const seed = engine.require({
			id: 'customers-browse-seed',
			collection: 'customers',
			kind: 'customer-browse',
			limit: 10,
			orderby: 'id',
			order: 'asc',
		});
		expect(seed.queryKey).toBe('customers:browse-window:limit=100');
		await seed.ready;
		expect(await residentCustomerIds(engine)).toHaveLength(100);
		seed.release();

		// onEndReached grows the grid's limit past the seeded window → a WIDER key.
		const grown = engine.require({
			id: 'customers-browse-more',
			collection: 'customers',
			kind: 'customer-browse',
			limit: 110,
			orderby: 'id',
			order: 'asc',
		});
		expect(grown.queryKey).toBe('customers:browse-window:limit=200');
		expect(grown.queryKey).not.toBe(seed.queryKey);
		expect(await grown.ready).toMatchObject({ action: 'fetched' });
		expect(await residentCustomerIds(engine)).toHaveLength(200);
		grown.release();
	});

	// The heaviest walk in this file (11 sequential requests + 1,100 upserts), so it carries an
	// explicit timeout rather than relying on the default under a loaded full-suite run.
	it('keeps paging indefinitely — no arbitrary record cap (R8)', async () => {
		const { setPremiumFlag } = await import('rxdb-premium/plugins/shared');
		setPremiumFlag();
		const server = scriptedCustomerBase(4_000);
		const engine = engineWith(server.fetch);
		await engine.ready;

		// A window past the 1,000-row ceiling the products browse lane used to impose — this lane
		// has no such constant to hit. 1,100 requested rounds up the growth curve to 1,600.
		const deep = engine.require({
			id: 'customers-browse-deep',
			collection: 'customers',
			kind: 'customer-browse',
			limit: 1_100,
			orderby: 'id',
			order: 'asc',
		});
		expect(deep.queryKey).toBe('customers:browse-window:limit=1600');
		expect(await deep.ready).toMatchObject({ action: 'fetched' });
		expect(await residentCustomerIds(engine)).toHaveLength(1_600);
		// Bounded per REQUEST, not in total: nothing ever asked for more than a Woo page.
		for (const request of server.requests) expect(request.perPage).toBeLessThanOrEqual(100);
		deep.release();
	}, 30_000);

	it('coexists with the idle trickle: neither lane disturbs the other cursor', async () => {
		const { setPremiumFlag } = await import('rxdb-premium/plugins/shared');
		setPremiumFlag();
		const server = scriptedCustomerBase(4_000);
		const engine = engineWith(server.fetch);
		await engine.ready;

		// The trickle owns a page cursor over `orderby=id&order=asc`, persisted per scope, and
		// walks in fixed 10-row batches WITHOUT a `role` param. The browse window walks the same
		// ordering but always states `role=all`, so the two lanes' requests are distinguishable
		// on the wire — which is the honest way to watch the cursor from outside the engine.
		const tricklePages = () =>
			server.requests.filter((request) => request.role === null).map((request) => request.page);

		await engine.sync('customer-trickle');
		await engine.sync('customer-trickle');
		expect(tricklePages()).toEqual([1, 2]);
		const afterTrickle = await residentCustomerIds(engine);
		expect(afterTrickle.length).toBeGreaterThan(0);

		const handle = engine.require({
			id: 'customers-browse-coexist',
			collection: 'customers',
			kind: 'customer-browse',
			limit: 100,
			orderby: 'id',
			order: 'asc',
		});
		await handle.ready;
		handle.release();

		// The trickle resumes from ITS page, not from wherever the browse window reached.
		await engine.sync('customer-trickle');
		expect(tricklePages()).toEqual([1, 2, 3]);
		// And because both lanes walk id-asc, the browse superset already covers what the
		// trickle held — overlapping work, not a second ordering to reconcile.
		const afterBrowse = await residentCustomerIds(engine);
		expect(afterBrowse).toEqual(expect.arrayContaining(afterTrickle));
	});

	it('defers the idle trickle while interactive browse demand is in flight', async () => {
		const { setPremiumFlag } = await import('rxdb-premium/plugins/shared');
		setPremiumFlag();
		const server = scriptedCustomerBase(4_000);
		const engine = engineWith(server.fetch);
		await engine.ready;

		// The trickle's politeness gate is `hasPendingInteractiveWork`. A mounted, sorted grid
		// is exactly that, so the background walk stands down instead of racing it for the wire.
		const handle = engine.require({
			id: 'customers-browse-inflight',
			collection: 'customers',
			kind: 'customer-browse',
			limit: 100,
			orderby: 'registered_date',
			order: 'desc',
		});
		const report = await engine.sync('customer-trickle');
		expect(report).toMatchObject({ status: 'skipped', reason: 'interactive-demand' });

		await handle.ready;
		handle.release();
	});

	// last_name is now proxied (#1488), so it builds a valid window; a sort with no wire
	// orderby on ANY surface (date_modified_gmt) is what the lane still refuses to build.
	it('builds a window for a plugin-proxied sort and rejects one with no wire orderby', () => {
		const server = scriptedCustomerBase(10);
		const engine = engineWith(server.fetch);
		const handle = engine.require({
			id: 'customers-browse-last-name',
			collection: 'customers',
			kind: 'customer-browse',
			orderby: 'last_name',
			order: 'asc',
		});
		expect(handle.queryKey).toBe('customers:browse-window:limit=100:orderby=last_name:order=asc');
		handle.release();

		expect(() =>
			engine.require({
				id: 'customers-browse-bad-sort',
				collection: 'customers',
				kind: 'customer-browse',
				orderby: 'date_modified_gmt' as never,
				order: 'asc',
			})
		).toThrow(/unsupported customer browse orderby/);
	});
});
