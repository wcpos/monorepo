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

import { scopeKeyFor, type StoreScopeIdentity } from '@wcpos/sync-core';

import { createRxdbSyncEngine, type RxdbSyncEngine } from './create-rxdb-sync-engine';
import { memoryEngineStorage, scriptedConnectivity } from './testing';

import type { RxStorage } from 'rxdb';

setPremiumFlag();

const SITE = 'https://signal.example.test';
const SYNC_BASE = `${SITE}/wp-json/wc-rxdb-sync/v1`;
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
			return json(include.map((id) => state.products.get(id)).filter(Boolean));
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
	fetch: (url: string, init?: { signal?: AbortSignal }) => Promise<Response>;
	identity: StoreScopeIdentity;
	connectivity?: () => 'online' | 'offline' | 'degraded';
}): RxdbSyncEngine {
	return createRxdbSyncEngine(
		{
			site: { syncBaseUrl: SYNC_BASE, wpJsonRoot: `${SITE}/wp-json` },
			storage: input.storage,
			fetcher: (url, init) => input.fetch(url, init),
			...(input.connectivity ? { connectivity: input.connectivity } : {}),
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
		const fetch = async (_url: string, init?: { signal?: AbortSignal }): Promise<Response> => {
			requestSignal = init?.signal;
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
