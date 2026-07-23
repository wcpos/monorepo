/**
 * Slice-3 conformance (#428): the change-signal lane driven ENTIRELY through
 * the public handle — sync('change-signal') against a scripted HTTP fake.
 * The ticket's done-criterion: a fresh signal detected → applied → cursor
 * advanced; plus persistence (a NEW engine over the same storage resumes past
 * the applied sequence), the poison guard (an HTML body can never advance the
 * cursor), the offline gate, and reset-owns-cursor (resetting products prunes
 * the engine and re-primes).
 */

import { describe, expect, it, vi } from 'vitest';
import { setPremiumFlag } from 'rxdb-premium/plugins/shared';

import { scopeKeyFor, type StoreScopeIdentity, type SyncEvent } from '@wcpos/sync-core';

import {
	createRxdbSyncEngine,
	type EngineEvent,
	EngineStringStore,
	type RxdbSyncEngine,
} from './create-rxdb-sync-engine';
import { memoryEngineStorage, memoryStringStore, scriptedConnectivity } from './testing';

import type { RxStorage } from 'rxdb';

setPremiumFlag();

const SITE = 'https://signal.example.test';
const SYNC_BASE = `${SITE}/wp-json/wcpos/v2`;
const UUID_9 = '11111111-1111-4111-8111-111111111111';

let uniqueScope = 0;

type SequenceRow = {
	sequence: number;
	id: number;
	type: string;
	collection: string;
	modified_gmt: string;
};

/** A scripted change-signal + catalog server: mutable rows, head, poison switch. */
function scriptedServer() {
	const state = {
		head: 5,
		rows: [] as SequenceRow[],
		poisonSequenceLog: false,
		productPulls: 0,
		productIncludes: [] as number[][],
		variationPulls: 0,
		customerPulls: 0,
		sequenceLogFetches: 0,
		headFetches: 0,
		products: new Map<number, Record<string, unknown>>([
			[
				9,
				{
					id: 9,
					meta_data: [{ id: 1, key: '_woocommerce_pos_uuid', value: UUID_9 }],
					date_modified_gmt: '2026-07-10T00:00:00',
					price: '5.00',
					stock_status: 'instock',
					type: 'simple',
					categories: [],
					brands: [],
					on_sale: false,
					featured: false,
					stock_quantity: null,
				},
			],
		]),
	};

	const json = (body: unknown) =>
		new Response(JSON.stringify(body), {
			status: 200,
			headers: { 'content-type': 'application/json' },
		});

	const fetch = async (url: string): Promise<Response> => {
		const u = new URL(url);
		const path = u.pathname;
		if (path.endsWith('/changes/sequence-log')) {
			state.sequenceLogFetches += 1;
			if (state.poisonSequenceLog) {
				return new Response('<html>maintenance</html>', {
					status: 200,
					headers: { 'content-type': 'text/html' },
				});
			}
			const since = Number(u.searchParams.get('since') ?? '0');
			if (since === 0 && u.searchParams.get('limit') === '1') state.headFetches += 1;
			const rows = state.rows.filter((row) => row.sequence > since);
			const maxSeen = rows.reduce((max, row) => Math.max(max, row.sequence), since);
			return json({
				changes: rows,
				checkpoint: { since: Math.max(maxSeen, since), head: state.head },
				complete: true,
			});
		}
		if (path.endsWith('/integrity/scan')) {
			return json({
				changes: [],
				checkpoint: { after_id: Number(u.searchParams.get('after_id') ?? '0') },
				complete: true,
			});
		}
		if (path.endsWith('/changes/range-checksum')) {
			return json({ changes: [], complete: true });
		}
		if (path.endsWith('/changes/config-fingerprint')) {
			return json({
				candidate: 'config-fingerprint',
				fingerprints: { products: 'fp-1', variations: 'fp-1', tax_rates: 'fp-1' },
				barcode_fields: { products: ['sku'], variations: ['sku'], tax_rates: [] },
				meta: { supported: true },
			});
		}
		if (path.endsWith('/products')) {
			state.productPulls += 1;
			const include = (u.searchParams.get('include') ?? '').split(',').map(Number);
			state.productIncludes.push(include);
			return json(include.map((id) => state.products.get(id)).filter(Boolean));
		}
		if (path.endsWith('/variations')) {
			state.variationPulls += 1;
			const include = (u.searchParams.get('include') ?? '').split(',').map(Number);
			return json({
				documents: include.map((id) => ({
					id,
					parent_id: 9,
					payload: {
						meta_data: [
							{
								key: '_woocommerce_pos_uuid',
								value: '22222222-2222-4222-8222-222222222222',
							},
						],
						price: '4.00',
						stock_status: 'instock',
						attributes: [],
					},
				})),
			});
		}
		if (path.endsWith('/customers')) {
			state.customerPulls += 1;
			const include = (u.searchParams.get('include') ?? '').split(',').map(Number);
			return json(
				include.map((id) => ({
					id,
					meta_data: [
						{
							key: '_woocommerce_pos_uuid',
							value: '33333333-3333-4333-8333-333333333333',
						},
					],
				}))
			);
		}
		if (
			path.endsWith('/taxes') ||
			path.endsWith('/products/categories') ||
			path.endsWith('/products/brands') ||
			path.endsWith('/products/tags') ||
			path.endsWith('/coupons')
		) {
			return json([]);
		}
		throw new Error(`scripted server: unexpected ${path}`);
	};

	return { state, fetch };
}

function freshIdentity(): StoreScopeIdentity {
	uniqueScope += 1;
	return { site: SITE, storeId: 3, cashierId: `signal-${uniqueScope}` };
}

function engineWith(input: {
	storage: RxStorage<unknown, unknown>;
	fetch: (url: string, init?: RequestInit) => Promise<Response>;
	identity: StoreScopeIdentity;
	connectivity?: () => 'online' | 'offline' | 'degraded';
	diagnostics?: (event: SyncEvent) => void;
	checkpoints?: EngineStringStore;
}): RxdbSyncEngine {
	return createRxdbSyncEngine(
		{
			site: { syncBaseUrl: SYNC_BASE, wpJsonRoot: `${SITE}/wp-json` },
			storage: input.storage,
			fetcher: (url, init) => input.fetch(url, init),
			...(input.checkpoints ? { checkpoints: input.checkpoints } : {}),
			...(input.connectivity ? { connectivity: input.connectivity } : {}),
			...(input.diagnostics ? { diagnostics: input.diagnostics } : {}),
			mode: 'manual',
		},
		input.identity
	);
}

async function productCount(engine: RxdbSyncEngine): Promise<number> {
	const scope = engine.active();
	if (!scope) throw new Error('no active scope');
	return (scope.database.collections.products as { count(): { exec(): Promise<number> } })
		.count()
		.exec();
}

describe('sync("change-signal") through the public handle', () => {
	it('primes to head, applies a fresh signal, persists the cursor across engines', async () => {
		const server = scriptedServer();
		const storage = memoryEngineStorage();
		const identity = freshIdentity();

		const engine = engineWith({ storage, fetch: server.fetch, identity });
		await engine.ready;

		// Tick 1: cold start primes AT head (5) — the historical backlog is never drained.
		const first = await engine.sync('change-signal');
		expect(first.status).toBe('ran');
		expect(server.state.headFetches).toBe(1);
		expect(await productCount(engine)).toBe(0);

		// A fresh signal lands: sequence 6 updates product 9.
		server.state.head = 6;
		server.state.rows.push({
			sequence: 6,
			id: 9,
			type: 'update',
			collection: 'products',
			modified_gmt: '2026-07-10T00:00:01',
		});

		const second = await engine.sync('change-signal');
		expect(second.status).toBe('ran');
		expect(await productCount(engine)).toBe(1); // detected → applied
		expect(server.state.productPulls).toBe(1);

		// Same envelope again: the cursor moved past sequence 6 — no re-apply.
		const third = await engine.sync('change-signal');
		expect(third.status).toBe('ran');
		expect(server.state.productPulls).toBe(1);
		await engine.dispose();

		// Persistence: a NEW engine over the SAME storage resumes from the blob —
		// no re-prime (headFetches stays 1), no re-pull of sequence 6.
		const revived = engineWith({ storage, fetch: server.fetch, identity });
		await revived.ready;
		const fourth = await revived.sync('change-signal');
		expect(fourth.status).toBe('ran');
		expect(server.state.headFetches).toBe(1);
		expect(server.state.productPulls).toBe(1);
		expect(await productCount(revived)).toBe(1);
		await revived.dispose();
	});

	it('re-baselines a restored far-behind cursor in one page and refreshes locally synced docs', async () => {
		const server = scriptedServer();
		const storage = memoryEngineStorage();
		const checkpoints = memoryStringStore();
		const identity = freshIdentity();
		const engine = engineWith({ storage, fetch: server.fetch, identity, checkpoints });
		await engine.ready;
		await engine.sync('change-signal');

		server.state.head = 8;
		server.state.rows.push(
			{
				sequence: 6,
				id: 9,
				type: 'update',
				collection: 'products',
				modified_gmt: '2026-07-10T00:00:01',
			},
			{
				sequence: 7,
				id: 20,
				type: 'update',
				collection: 'variations',
				modified_gmt: '2026-07-10T00:00:02',
			},
			{
				sequence: 8,
				id: 30,
				type: 'update',
				collection: 'customers',
				modified_gmt: '2026-07-10T00:00:03',
			}
		);
		expect((await engine.sync('change-signal')).status).toBe('ran');
		await engine.dispose();

		const key = `${scopeKeyFor(identity)}:checkpoint:change-signal`;
		await checkpoints.set(key, JSON.stringify({ cursor: { sequence: 0 }, baselineDigests: [] }));
		server.state.head = 6_000;
		server.state.sequenceLogFetches = 0;
		const pullsBefore = {
			products: server.state.productPulls,
			variations: server.state.variationPulls,
			customers: server.state.customerPulls,
		};

		const revived = engineWith({ storage, fetch: server.fetch, identity, checkpoints });
		await revived.ready;
		expect(await revived.sync('change-signal')).toMatchObject({ status: 'ran', rebaselined: true });

		expect(server.state.sequenceLogFetches).toBe(1);
		// The direct rebaseline refresh is followed by the browse-window seed drain.
		expect(server.state.productPulls).toBe(pullsBefore.products + 2);
		expect(server.state.variationPulls).toBe(pullsBefore.variations + 1);
		expect(server.state.customerPulls).toBe(pullsBefore.customers + 1);
		expect(JSON.parse((await checkpoints.get(key))!)).toMatchObject({
			cursor: { sequence: 6_000 },
		});
		await revived.dispose();
	});

	it('rebaseline tolerates a server-deleted record: prunes it locally and still persists head', async () => {
		const server = scriptedServer();
		const storage = memoryEngineStorage();
		const checkpoints = memoryStringStore();
		const identity = freshIdentity();
		const engine = engineWith({ storage, fetch: server.fetch, identity, checkpoints });
		await engine.ready;
		await engine.sync('change-signal'); // prime at head 5

		// Seed product 9 locally through the normal signal → pull path.
		server.state.head = 6;
		server.state.rows.push({
			sequence: 6,
			id: 9,
			type: 'update',
			collection: 'products',
			modified_gmt: '2026-07-10T00:00:01',
		});
		await engine.sync('change-signal');
		expect(await productCount(engine)).toBe(1);
		await engine.dispose();

		// The record is deleted server-side during the skipped window; the include
		// pull now returns a SHORT page. The strict arms would fail the tick — the
		// rebaseline arm must instead prune the id and commit head (a thrown
		// shortfall here would wedge the guard in a permanent retry loop).
		server.state.products.delete(9);
		const key = `${scopeKeyFor(identity)}:checkpoint:change-signal`;
		await checkpoints.set(key, JSON.stringify({ cursor: { sequence: 0 }, baselineDigests: [] }));
		server.state.head = 7_000;

		const revived = engineWith({ storage, fetch: server.fetch, identity, checkpoints });
		await revived.ready;
		expect(await revived.sync('change-signal')).toMatchObject({ status: 'ran', rebaselined: true });
		expect(await productCount(revived)).toBe(0); // pruned, not wedged
		expect(JSON.parse((await checkpoints.get(key))!)).toMatchObject({
			cursor: { sequence: 7_000 },
		});
		await revived.dispose();
	});

	it('rebaseline pulls the MIRRORED woo id and skips docs with pending local work', async () => {
		const server = scriptedServer();
		const storage = memoryEngineStorage();
		const checkpoints = memoryStringStore();
		const identity = freshIdentity();
		const engine = engineWith({ storage, fetch: server.fetch, identity, checkpoints });
		await engine.ready;
		await engine.sync('change-signal'); // prime at head 5

		const scope = engine.active();
		if (!scope) throw new Error('no active scope');
		const products = scope.database.collections.products as {
			insert(doc: Record<string, unknown>): Promise<unknown>;
		};
		// A locally-created-then-acked record: the server id lives ONLY in the
		// mirrored field; the original create payload never carried `id`.
		await products.insert({
			id: '44444444-4444-4444-8444-444444444444',
			wooProductId: 77,
			price: 7,
			stockStatus: 'instock',
			type: 'simple',
			categoryIds: [],
			brandIds: [],
			onSale: false,
			featured: false,
			stockQuantity: null,
			payload: { name: 'acked local create' },
			sync: { revision: 'r', partial: false, source: 'woo-rest' },
			local: { dirty: false, pendingMutationIds: [] },
		});
		// A record with pending local work: its payload must not be re-pulled (the
		// local-work guard would discard it anyway).
		await products.insert({
			id: '55555555-5555-4555-8555-555555555555',
			wooProductId: 88,
			price: 8,
			stockStatus: 'instock',
			type: 'simple',
			categoryIds: [],
			brandIds: [],
			onSale: false,
			featured: false,
			stockQuantity: null,
			payload: { id: 88, name: 'dirty local edit' },
			sync: { revision: 'r', partial: false, source: 'woo-rest' },
			local: { dirty: true, pendingMutationIds: [] },
		});
		server.state.products.set(77, {
			id: 77,
			meta_data: [
				{ id: 1, key: '_woocommerce_pos_uuid', value: '44444444-4444-4444-8444-444444444444' },
			],
			date_modified_gmt: '2026-07-10T00:00:00',
			price: '7.00',
			stock_status: 'instock',
			type: 'simple',
			categories: [],
			brands: [],
			on_sale: false,
			featured: false,
			stock_quantity: null,
		});
		await engine.dispose();

		const key = `${scopeKeyFor(identity)}:checkpoint:change-signal`;
		await checkpoints.set(key, JSON.stringify({ cursor: { sequence: 0 }, baselineDigests: [] }));
		server.state.head = 8_000;
		server.state.productIncludes = [];

		const revived = engineWith({ storage, fetch: server.fetch, identity, checkpoints });
		await revived.ready;
		expect(await revived.sync('change-signal')).toMatchObject({ status: 'ran', rebaselined: true });
		// Mirrored id 77 pulled; dirty 88 never requested.
		expect(server.state.productIncludes).toContainEqual([77]);
		expect(server.state.productIncludes.flat()).not.toContain(88);
		await revived.dispose();
	});

	it('manual change-signal sync completes the existence/seed lanes after a rebaseline', async () => {
		const server = scriptedServer();
		const identity = freshIdentity();
		const checkpoints = memoryStringStore();
		const key = `${scopeKeyFor(identity)}:checkpoint:change-signal`;
		await checkpoints.set(key, JSON.stringify({ cursor: { sequence: 0 }, baselineDigests: [] }));
		server.state.head = 9_000;

		const engine = engineWith({
			storage: memoryEngineStorage(),
			fetch: server.fetch,
			identity,
			checkpoints,
		});
		const events: EngineEvent[] = [];
		engine.events((event) => events.push(event));
		await engine.ready;

		expect(await engine.sync('change-signal')).toMatchObject({ status: 'ran', rebaselined: true });
		for (const lane of [
			'existence-prime',
			'existence-reconcile',
			'product-browse-window-seed',
			'scheduler-drain',
		] as const) {
			expect(
				events.filter((event) => event.type === 'lane-finish' && event.lane === lane)
			).toHaveLength(1);
		}
		await engine.dispose();
	});

	it('auto mode converges the existence/seed lanes immediately after a rebaseline tick', async () => {
		const server = scriptedServer();
		const identity = freshIdentity();
		const checkpoints = memoryStringStore();
		// The cursor is far behind head BEFORE the engine boots — the first
		// automatic change-signal tick must rebaseline and then kick the lanes
		// that deliver what the discarded rows would have (creates, refills),
		// instead of leaving them to their 5–17 min cadences.
		const key = `${scopeKeyFor(identity)}:checkpoint:change-signal`;
		await checkpoints.set(key, JSON.stringify({ cursor: { sequence: 0 }, baselineDigests: [] }));
		server.state.head = 9_000;

		const intervals: { callback: () => void; delay: number }[] = [];
		vi.spyOn(globalThis, 'setInterval').mockImplementation(((
			callback: () => void,
			delay: number
		) => {
			intervals.push({ callback, delay });
			return intervals.length as unknown as ReturnType<typeof setInterval>;
		}) as typeof setInterval);
		vi.spyOn(globalThis, 'clearInterval').mockImplementation(() => undefined);

		const engine = createRxdbSyncEngine(
			{
				site: { syncBaseUrl: SYNC_BASE, wpJsonRoot: `${SITE}/wp-json` },
				storage: memoryEngineStorage(),
				fetcher: (url) => server.fetch(url),
				checkpoints,
				mode: 'auto',
			},
			identity
		);
		try {
			const events: EngineEvent[] = [];
			engine.events((event) => events.push(event));
			await engine.ready;
			await vi.waitFor(() => expect(intervals.some(({ delay }) => delay === 10_000)).toBe(true));
			events.length = 0;

			// Fire the change-signal interval: the tick rebaselines (cursor 0 →
			// 9,000) and the follow-up chain must run the existence/seed lanes now.
			intervals.find(({ delay }) => delay === 10_000)!.callback();
			await vi.waitFor(() => {
				for (const lane of [
					'existence-prime',
					'existence-reconcile',
					'product-browse-window-seed',
					'scheduler-drain',
				] as const) {
					expect(
						events.filter((event) => event.type === 'lane-start' && event.lane === lane)
					).toHaveLength(1);
				}
			});

			// Negative control: a routine (non-rebaseline) tick kicks nothing.
			events.length = 0;
			intervals.find(({ delay }) => delay === 10_000)!.callback();
			await vi.waitFor(() =>
				expect(
					events.filter((event) => event.type === 'lane-finish' && event.lane === 'change-signal')
				).toHaveLength(1)
			);
			await new Promise((resolve) => setTimeout(resolve, 50));
			expect(
				events.filter((event) => event.type === 'lane-start' && event.lane === 'existence-prime')
			).toHaveLength(0);
		} finally {
			vi.restoreAllMocks();
			await engine.dispose();
		}
	});

	it('adopts the server _rxdb_revision stamp as sync.revision and strips it from the stored payload (#423 step 1b)', async () => {
		const server = scriptedServer();
		const stamped = server.state.products.get(9)!;
		server.state.products.set(9, { ...stamped, _rxdb_revision: 'sha256:canonical-9' });
		const engine = engineWith({
			storage: memoryEngineStorage(),
			fetch: server.fetch,
			identity: freshIdentity(),
		});
		await engine.ready;

		await engine.sync('change-signal'); // prime at head 5
		server.state.head = 6;
		server.state.rows.push({
			sequence: 6,
			id: 9,
			type: 'update',
			collection: 'products',
			modified_gmt: '2026-07-10T00:00:01',
		});
		await engine.sync('change-signal');

		const scope = engine.active();
		if (!scope) throw new Error('no active scope');
		const docs = await (
			scope.database.collections.products as {
				find(): { exec(): Promise<{ toJSON(): Record<string, unknown> }[]> };
			}
		)
			.find()
			.exec();
		expect(docs).toHaveLength(1);
		const json = docs[0]!.toJSON() as {
			sync: { revision: string };
			payload: Record<string, unknown>;
		};
		expect(json.sync.revision).toBe('sha256:canonical-9');
		expect('_rxdb_revision' in json.payload).toBe(false); // transport metadata never stored
		await engine.dispose();
	});

	it('a poison page reports error and can never advance the cursor', async () => {
		const server = scriptedServer();
		const engine = engineWith({
			storage: memoryEngineStorage(),
			fetch: server.fetch,
			identity: freshIdentity(),
		});
		await engine.ready;
		await engine.sync('change-signal'); // prime at head 5

		server.state.head = 6;
		server.state.rows.push({
			sequence: 6,
			id: 9,
			type: 'update',
			collection: 'products',
			modified_gmt: '2026-07-10T00:00:01',
		});
		server.state.poisonSequenceLog = true;

		const poisoned = await engine.sync('change-signal');
		expect(poisoned.status).toBe('error');
		expect(poisoned.error).toMatch(/non-JSON|not valid JSON|changes envelope/i);
		expect(engine.status().lanes['change-signal'].lastError).toBe(poisoned.error);
		expect(await productCount(engine)).toBe(0);

		// Recovery: the cursor never moved, so the same signal now applies.
		server.state.poisonSequenceLog = false;
		const recovered = await engine.sync('change-signal');
		expect(recovered.status).toBe('ran');
		expect(engine.status().lanes['change-signal'].lastError).toBeNull();
		expect(await productCount(engine)).toBe(1);
		await engine.dispose();
	});

	it('emits signal.cycle with pulls: 0 on an idle poll', async () => {
		const server = scriptedServer();
		const diagnosticsEvents: SyncEvent[] = [];
		const engine = engineWith({
			storage: memoryEngineStorage(),
			fetch: server.fetch,
			identity: freshIdentity(),
			diagnostics: (event) => diagnosticsEvents.push(event),
		});
		await engine.ready;

		await engine.sync('change-signal');

		const cycles = diagnosticsEvents.filter((e) => e.type === 'signal.cycle');
		expect(cycles).toHaveLength(1);
		expect(cycles[0]!.level).toBe('info');
		expect(cycles[0]!.fields).toMatchObject({ pulls: 0, deletes: 0 });
		expect(cycles[0]!.fields?.collectionsChecked).toEqual(
			expect.arrayContaining(['products', 'variations', 'customers', 'tax_rates'])
		);
		expect(typeof cycles[0]!.fields?.durationMs).toBe('number');
		await engine.dispose();
	});

	it('does not emit signal.cycle when the poll fails', async () => {
		const server = scriptedServer();
		const diagnosticsEvents: SyncEvent[] = [];
		const engine = engineWith({
			storage: memoryEngineStorage(),
			fetch: server.fetch,
			identity: freshIdentity(),
			diagnostics: (event) => diagnosticsEvents.push(event),
		});
		await engine.ready;
		await engine.sync('change-signal');
		diagnosticsEvents.length = 0;
		server.state.poisonSequenceLog = true;

		await engine.sync('change-signal');

		expect(diagnosticsEvents.some((e) => e.type === 'signal.cycle')).toBe(false);
		expect(diagnosticsEvents.some((e) => e.type === 'signal.tick.error')).toBe(true);
		await engine.dispose();
	});

	it('does not advance the cursor when bulkUpsert resolves with a per-row failure', async () => {
		const server = scriptedServer();
		const engine = engineWith({
			storage: memoryEngineStorage(),
			fetch: server.fetch,
			identity: freshIdentity(),
		});
		await engine.ready;
		await engine.sync('change-signal');
		server.state.head = 6;
		server.state.rows.push({
			sequence: 6,
			id: 9,
			type: 'update',
			collection: 'products',
			modified_gmt: '2026-07-10T00:00:01',
		});
		const products = engine.active()!.database.collections.products;
		const original = products.bulkUpsert.bind(products);
		products.bulkUpsert = (async () => ({
			success: [],
			error: [{ documentId: UUID_9, status: 409 }],
		})) as unknown as typeof products.bulkUpsert;
		expect((await engine.sync('change-signal')).status).toBe('error');
		expect(server.state.productPulls).toBe(1);
		products.bulkUpsert = original;
		expect((await engine.sync('change-signal')).status).toBe('ran');
		expect(server.state.productPulls).toBe(2);
		expect(await productCount(engine)).toBe(1);
		await engine.dispose();
	});

	it('offline connectivity skips the tick before any request', async () => {
		const server = scriptedServer();
		const connectivity = scriptedConnectivity('offline');
		const engine = engineWith({
			storage: memoryEngineStorage(),
			fetch: server.fetch,
			identity: freshIdentity(),
			connectivity: connectivity.signal,
		});
		await engine.ready;
		const report = await engine.sync('change-signal');
		expect(report).toMatchObject({ lane: 'change-signal', status: 'skipped', reason: 'offline' });
		expect(server.state.headFetches).toBe(0);

		connectivity.set('online');
		expect((await engine.sync('change-signal')).status).toBe('ran');
		await engine.dispose();
	});

	it('aborts an in-flight request without AbortSignal.any', async () => {
		const controller = new AbortController();
		let requestSignal: AbortSignal | undefined;
		let markStarted!: () => void;
		const started = new Promise<void>((resolve) => {
			markStarted = resolve;
		});
		const fetch = async (_url: string, init?: RequestInit): Promise<Response> => {
			requestSignal = init?.signal ?? undefined;
			markStarted();
			return new Promise((_resolve, reject) =>
				init?.signal?.addEventListener(
					'abort',
					() => reject(new DOMException('aborted', 'AbortError')),
					{ once: true }
				)
			);
		};
		const engine = engineWith({ storage: memoryEngineStorage(), fetch, identity: freshIdentity() });
		const any = vi.spyOn(AbortSignal, 'any').mockImplementation(() => {
			throw new Error('unsupported');
		});

		try {
			await engine.ready;
			const tick = engine.sync('change-signal', { signal: controller.signal });
			await started;
			controller.abort();
			await expect(tick).resolves.toMatchObject({ status: 'skipped', reason: 'aborted' });
			expect(requestSignal?.aborted).toBe(true);
			expect(any).not.toHaveBeenCalled();
		} finally {
			any.mockRestore();
			await engine.dispose();
		}
	});

	it('resetting a hybrid collection rewinds the cursor to ZERO — the emptied collection refills, never re-primes', async () => {
		const server = scriptedServer();
		const identity = freshIdentity();
		const engine = engineWith({ storage: memoryEngineStorage(), fetch: server.fetch, identity });
		await engine.ready;
		await engine.sync('change-signal');
		expect(server.state.headFetches).toBe(1);

		// A historical signal exists (sequence 6 ≤ head): apply it, then reset.
		server.state.head = 6;
		server.state.rows.push({
			sequence: 6,
			id: 9,
			type: 'update',
			collection: 'products',
			modified_gmt: '2026-07-10T00:00:01',
		});
		await engine.sync('change-signal');
		expect(await productCount(engine)).toBe(1);

		const outcome = await engine.scope.resetCollection('products');
		expect(outcome).toBe('reset');
		expect(await productCount(engine)).toBe(0);

		// The invalidator rewound the blob to sequence 0 (NOT deleted): the next
		// tick drains the historical log and REFILLS the dropped collection —
		// priming to head here would silently skip exactly these rows.
		await engine.sync('change-signal');
		expect(server.state.headFetches).toBe(1); // no re-prime
		expect(await productCount(engine)).toBe(1); // refilled from sequence 0
		expect(scopeKeyFor(identity)).toBe(engine.active()?.scopeId);
		await engine.dispose();
	});

	it('an unknown lane is caller misuse — an exception, not a report', async () => {
		const server = scriptedServer();
		const engine = engineWith({
			storage: memoryEngineStorage(),
			fetch: server.fetch,
			identity: freshIdentity(),
		});
		await engine.ready;
		await expect(engine.sync('bootstrap' as never)).rejects.toThrow(/unknown engine lane/i);
		await engine.dispose();
	});
});
