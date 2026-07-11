/**
 * Slice-4 conformance (#429), through the PUBLIC handle: the write path
 * (durable enqueue → drain → ack/conflict/reject events, offline-first,
 * backoff, queue survival across switch) against sync-core's fakeWriteServer,
 * and the require() demand plane (serve-local coverage, targeted pulls,
 * priority preemption of queued work, release()).
 */

import { describe, expect, it, vi } from 'vitest';
import { setPremiumFlag } from 'rxdb-premium/plugins/shared';

import { createFakeWriteServer } from '@wcpos/sync-core/testing';
import type { StoreScopeIdentity, SyncEvent, SyncObserver } from '@wcpos/sync-core';

import {
	createRxdbSyncEngine,
	type EngineEvent,
	type RxdbSyncEngine,
} from './create-rxdb-sync-engine';
import { queueFor, requeueBornTwiceSnapshot } from './write-path/write-intents';
import { memoryEngineStorage, scriptedConnectivity } from './testing';

import type { RxStorage } from 'rxdb';

setPremiumFlag();

const SITE = 'https://write.example.test';
const UUID_A = '22222222-2222-4222-8222-222222222222';

let uniqueScope = 0;
function freshIdentity(): StoreScopeIdentity {
	uniqueScope += 1;
	return { site: SITE, storeId: 7, cashierId: `write-${uniqueScope}` };
}

function engineWith(input: {
	fetch: (url: string, init?: { signal?: AbortSignal }) => Promise<Response>;
	identity?: StoreScopeIdentity;
	storage?: RxStorage<unknown, unknown>;
	connectivity?: () => 'online' | 'offline' | 'degraded';
	now?: () => number;
	diagnostics?: SyncObserver;
	mode?: 'auto' | 'manual';
	writeDrainPollMs?: number;
}): RxdbSyncEngine {
	return createRxdbSyncEngine(
		{
			site: { syncBaseUrl: `${SITE}/wp-json/wc-rxdb-sync/v1`, wpJsonRoot: `${SITE}/wp-json` },
			storage: input.storage ?? memoryEngineStorage(),
			fetcher: input.fetch,
			...(input.connectivity ? { connectivity: input.connectivity } : {}),
			...(input.now ? { now: input.now } : {}),
			...(input.diagnostics ? { diagnostics: input.diagnostics } : {}),
			mode: input.mode ?? 'manual',
			...(input.writeDrainPollMs !== undefined
				? { intervals: { writeDrainPollMs: input.writeDrainPollMs } }
				: {}),
		},
		input.identity ?? freshIdentity()
	);
}

/** A resident born-local order the write path can create against. */
async function insertBornLocalOrder(engine: RxdbSyncEngine, id: string): Promise<void> {
	const scope = engine.active();
	if (!scope) throw new Error('no active scope');
	await (scope.database.collections.orders as { insert(doc: unknown): Promise<unknown> }).insert({
		id,
		wooOrderId: null,
		number: '',
		dateCreatedGmt: '2026-07-10T00:00:00',
		status: 'pos-open',
		total: '0.00',
		customerId: 0,
		payload: { status: 'pos-open', meta_data: [{ key: '_woocommerce_pos_uuid', value: id }] },
		sync: { revision: '', partial: false, source: 'skeleton' },
		local: { dirty: false, pendingMutationIds: [] },
	});
}

async function orderJson(
	engine: RxdbSyncEngine,
	id: string
): Promise<Record<string, unknown> | null> {
	const scope = engine.active();
	if (!scope) throw new Error('no active scope');
	const doc = await (
		scope.database.collections.orders as {
			findOne(id: string): { exec(): Promise<{ toJSON(): Record<string, unknown> } | null> };
		}
	)
		.findOne(id)
		.exec();
	return doc ? doc.toJSON() : null;
}

/** A SERVER-BORN resident order (uuid PK + known Woo id + anchored revision). */
async function insertServerBornOrder(
	engine: RxdbSyncEngine,
	id: string,
	over: { wooOrderId: number; revision: string; status?: string }
): Promise<void> {
	const scope = engine.active();
	if (!scope) throw new Error('no active scope');
	await (scope.database.collections.orders as { insert(doc: unknown): Promise<unknown> }).insert({
		id,
		wooOrderId: over.wooOrderId,
		number: String(1000 + over.wooOrderId),
		dateCreatedGmt: '2026-07-10T00:00:00',
		status: over.status ?? 'processing',
		total: '10.00',
		customerId: 0,
		payload: {
			id: over.wooOrderId,
			status: over.status ?? 'processing',
			meta_data: [{ key: '_woocommerce_pos_uuid', value: id }],
		},
		sync: { revision: over.revision, partial: false, source: 'woo-rest' },
		local: { dirty: false, pendingMutationIds: [] },
	});
}

/** Every row in the durable mutation queue (terminal rows included). */
async function queueRows(engine: RxdbSyncEngine): Promise<Record<string, unknown>[]> {
	const scope = engine.active();
	if (!scope) throw new Error('no active scope');
	const docs = await (
		scope.database.collections.recordMutations as {
			find(): { exec(): Promise<{ toJSON(): Record<string, unknown> }[]> };
		}
	)
		.find()
		.exec();
	return docs.map((doc) => doc.toJSON());
}

/** Routes push envelopes to the fake write server and targeted /orders pulls to a scripted proxy. */
function routedFetch(
	server: ReturnType<typeof createFakeWriteServer>,
	orderTruth: () => Record<string, unknown>
) {
	const state = { orderPulls: [] as number[][], failOrdersPull: false, emptyOrdersPull: false };
	const fetch = async (url: string, init?: { signal?: AbortSignal }): Promise<Response> => {
		if (url.includes('/push/')) return server.fetch(url, init as never);
		const u = new URL(url);
		if (!u.pathname.endsWith('/orders')) throw new Error(`routedFetch: unexpected ${u.pathname}`);
		if (state.failOrdersPull) return new Response('boom', { status: 500 });
		const include = (u.searchParams.get('include') ?? '').split(',').map(Number).filter(Boolean);
		state.orderPulls.push(include);
		const body = state.emptyOrdersPull ? [] : include.map((id) => ({ id, ...orderTruth() }));
		return new Response(JSON.stringify(body), {
			status: 200,
			headers: { 'content-type': 'application/json' },
		});
	};
	return { state, fetch };
}

describe('write() + sync("write-drain") through the public handle', () => {
	it('continues writing and draining after resetCollection mutations replaces the RxCollection', async () => {
		const server = createFakeWriteServer();
		const engine = engineWith({ fetch: (url, init) => server.fetch(url, init as never) });
		try {
			await engine.ready;
			await insertBornLocalOrder(engine, UUID_A);
			await engine.write({
				collection: 'orders',
				operation: 'create',
				recordId: UUID_A,
				payload: { status: 'pos-open' },
			});
			expect((await engine.sync('write-drain')).pushed).toBe(1);
			expect(await engine.scope.resetCollection('mutations', { confirmDestroyQueue: true })).toBe(
				'reset'
			);
			await engine.write({
				collection: 'orders',
				operation: 'update',
				recordId: UUID_A,
				payload: { status: 'pos-paid' },
			});
			expect((await engine.sync('write-drain')).pushed).toBe(1);
		} finally {
			await engine.dispose();
		}
	});

	it('re-materializes a missing order from a queued create acknowledgement after orders reset', async () => {
		const server = createFakeWriteServer({ firstId: 900_000_321 });
		const engine = engineWith({ fetch: (url, init) => server.fetch(url, init as never) });
		const events: EngineEvent[] = [];
		try {
			await engine.ready;
			engine.events((event) => events.push(event));
			await insertBornLocalOrder(engine, UUID_A);
			await engine.write({
				collection: 'orders',
				operation: 'create',
				recordId: UUID_A,
				payload: { status: 'pos-open' },
			});
			expect(await engine.scope.resetCollection('orders')).toBe('reset');
			expect(await orderJson(engine, UUID_A)).toBeNull();
			expect((await engine.sync('write-drain')).pushed).toBe(1);
			expect((await orderJson(engine, UUID_A))?.wooOrderId).toBe(900_000_321);
			expect(events).toContainEqual(
				expect.objectContaining({ type: 'write-ack-rematerialized', recordId: UUID_A })
			);
		} finally {
			await engine.dispose();
		}
	});

	it('includes write report counters in automatic lane telemetry', async () => {
		const events: SyncEvent[] = [];
		const server = createFakeWriteServer({ firstId: 900_000_050 });
		const engine = engineWith({
			fetch: (url, init) => server.fetch(url, init as never),
			diagnostics: (event) => events.push(event),
			mode: 'auto',
			writeDrainPollMs: 5,
		});
		try {
			await engine.ready;
			await insertBornLocalOrder(engine, UUID_A);
			await engine.write({
				collection: 'orders',
				operation: 'create',
				recordId: UUID_A,
				payload: { status: 'pos-open' },
			});

			await vi.waitFor(() =>
				expect(
					events.some(
						(event) =>
							event.type === 'engine.lane.tick' &&
							event.fields?.['lane'] === 'write-drain' &&
							event.fields?.['status'] === 'ran'
					)
				).toBe(true)
			);
			expect(
				events.find(
					(event) =>
						event.type === 'engine.lane.tick' &&
						event.fields?.['lane'] === 'write-drain' &&
						event.fields?.['status'] === 'ran'
				)?.fields
			).toMatchObject({ pushed: 1, conflicts: 0, deferred: 0, failed: 0, rejected: 0 });
		} finally {
			await engine.dispose();
		}
	});

	it('enqueue-offline → reconnect → drain → acknowledged, revision re-anchored', async () => {
		const server = createFakeWriteServer({ firstId: 900_000_100 });
		const connectivity = scriptedConnectivity('offline');
		const engine = engineWith({
			fetch: (url, init) => server.fetch(url, init as never),
			connectivity: connectivity.signal,
		});
		await engine.ready;
		const events: EngineEvent[] = [];
		engine.events((event) => events.push(event));
		await insertBornLocalOrder(engine, UUID_A);

		// Durable enqueue works OFFLINE — that is the point of the queue.
		const receipt = await engine.write({
			collection: 'orders',
			operation: 'create',
			recordId: UUID_A,
			payload: { status: 'pos-open', meta_data: [{ key: '_woocommerce_pos_uuid', value: UUID_A }] },
		});
		expect(receipt.recordId).toBe(UUID_A);
		expect(engine.status().queueDepth).toBe(1);

		expect((await engine.sync('write-drain')).status).toBe('skipped');
		expect(server.received.length).toBe(0);

		connectivity.set('online');
		const drained = await engine.sync('write-drain');
		expect(drained).toMatchObject({ status: 'ran', pushed: 1, conflicts: 0, rejected: 0 });
		expect(engine.status().queueDepth).toBe(0);

		const ack = events.find((event) => event.type === 'write-acknowledged');
		expect(ack).toMatchObject({
			collection: 'orders',
			recordId: UUID_A,
			mutationId: receipt.mutationId,
		});

		// The ack write-back: server id captured, revision re-anchored, dirty cleared.
		const order = await orderJson(engine, UUID_A);
		expect(order?.wooOrderId).toBe(900_000_100);
		expect((order?.sync as { revision?: string }).revision).toBeTruthy();
		expect((order?.local as { dirty?: boolean }).dirty).toBe(false);
		await engine.dispose();
	});

	it('a conflict surfaces as an event and the mutation STAYS queued', async () => {
		const server = createFakeWriteServer();
		server.script(() => ({
			kind: 'conflict' as const,
			current: null,
			currentRevision: 'sha256:server',
		}));
		const engine = engineWith({ fetch: (url, init) => server.fetch(url, init as never) });
		await engine.ready;
		const events: EngineEvent[] = [];
		engine.events((event) => events.push(event));
		await insertBornLocalOrder(engine, UUID_A);
		await engine.write({
			collection: 'orders',
			operation: 'create',
			recordId: UUID_A,
			payload: { status: 'pos-open', meta_data: [{ key: '_woocommerce_pos_uuid', value: UUID_A }] },
		});

		const drained = await engine.sync('write-drain');
		expect(drained).toMatchObject({ status: 'ran', pushed: 0, conflicts: 1 });
		expect(events.some((event) => event.type === 'write-conflict')).toBe(true);
		// Conflicts await caller resolution — the queue keeps the mutation.
		expect(engine.status().queueDepth).toBe(1);
		await engine.dispose();
	});

	it('a permanent 4xx dead-letters: write-rejected event, queue drained of it', async () => {
		const server = createFakeWriteServer();
		server.script(() => ({ kind: 'identity_ambiguous' as const }));
		const engine = engineWith({ fetch: (url, init) => server.fetch(url, init as never) });
		await engine.ready;
		const events: EngineEvent[] = [];
		engine.events((event) => events.push(event));
		await insertBornLocalOrder(engine, UUID_A);
		await engine.write({
			collection: 'orders',
			operation: 'create',
			recordId: UUID_A,
			payload: { status: 'pos-open', meta_data: [{ key: '_woocommerce_pos_uuid', value: UUID_A }] },
		});

		const drained = await engine.sync('write-drain');
		expect(drained).toMatchObject({ status: 'ran', rejected: 1 });
		expect(events.some((event) => event.type === 'write-rejected')).toBe(true);
		expect(engine.status().queueDepth).toBe(0);
		await engine.dispose();
	});

	it('the queue survives A→B→A: an offline write drains after the return', async () => {
		const server = createFakeWriteServer({ firstId: 900_000_200 });
		const connectivity = scriptedConnectivity('offline');
		const a = freshIdentity();
		const b = { ...a, cashierId: `${a.cashierId}-b` };
		const engine = engineWith({
			fetch: (url, init) => server.fetch(url, init as never),
			identity: a,
			connectivity: connectivity.signal,
		});
		await engine.ready;
		await insertBornLocalOrder(engine, UUID_A);
		await engine.write({
			collection: 'orders',
			operation: 'create',
			recordId: UUID_A,
			payload: { status: 'pos-open', meta_data: [{ key: '_woocommerce_pos_uuid', value: UUID_A }] },
		});

		await engine.scope.switch(b);
		await engine.scope.switch(a);
		connectivity.set('online');
		const drained = await engine.sync('write-drain');
		expect(drained).toMatchObject({ status: 'ran', pushed: 1 });
		expect((await orderJson(engine, UUID_A))?.wooOrderId).toBe(900_000_200);
		await engine.dispose();
	});

	it('transient failure backs off durably, then succeeds once the window elapses', async () => {
		const server = createFakeWriteServer({ firstId: 900_000_300 });
		let failures = 1;
		// One raw 500 (transient server error) before the fake server answers —
		// the drain must back off durably, then land the re-push.
		const flakyFetch = async (url: string, init?: { signal?: AbortSignal }): Promise<Response> => {
			if (failures > 0) {
				failures -= 1;
				return new Response('upstream boom', { status: 500 });
			}
			return server.fetch(url, init as never);
		};
		let nowMs = 1_700_000_000_000;
		const engine = engineWith({ fetch: flakyFetch, now: () => nowMs });
		await engine.ready;
		await insertBornLocalOrder(engine, UUID_A);
		await engine.write({
			collection: 'orders',
			operation: 'create',
			recordId: UUID_A,
			payload: { status: 'pos-open', meta_data: [{ key: '_woocommerce_pos_uuid', value: UUID_A }] },
		});

		expect(await engine.sync('write-drain')).toMatchObject({ status: 'ran', pushed: 0 });
		// Immediately after the failure the ADR 0012 gate defers the retry…
		expect(await engine.sync('write-drain')).toMatchObject({
			status: 'ran',
			deferred: 1,
			pushed: 0,
		});
		// …and once the window elapses the re-push lands.
		nowMs += 5 * 60_000;
		expect(await engine.sync('write-drain')).toMatchObject({ status: 'ran', pushed: 1 });
		await engine.dispose();
	});

	it('write() on a collection without a push/ack contract is caller misuse', async () => {
		const server = createFakeWriteServer();
		const engine = engineWith({ fetch: (url, init) => server.fetch(url, init as never) });
		await engine.ready;
		await expect(
			engine.write({ collection: 'products', operation: 'create', recordId: 'x', payload: {} })
		).rejects.toThrow(/not client-writeable/i);
		await engine.dispose();
	});
});

describe('#507 offline write flows through the public handle', () => {
	it('regression 1: two queued updates coalesce into ONE push that lands the SECOND snapshot through the real revision check', async () => {
		const events: SyncEvent[] = [];
		const server = createFakeWriteServer();
		server.seed(UUID_A, { id: 42, revision: 'sha256:base-r1' });
		const connectivity = scriptedConnectivity('offline');
		const engine = engineWith({
			fetch: (url, init) => server.fetch(url, init as never),
			connectivity: connectivity.signal,
			diagnostics: (event) => events.push(event),
		});
		try {
			await engine.ready;
			await insertServerBornOrder(engine, UUID_A, { wooOrderId: 42, revision: 'sha256:base-r1' });

			const first = await engine.write({
				collection: 'orders',
				operation: 'update',
				recordId: UUID_A,
				payload: { status: 'pos-open' },
			});
			const second = await engine.write({
				collection: 'orders',
				operation: 'update',
				recordId: UUID_A,
				payload: { status: 'completed' },
			});
			expect(second.mutationId).not.toBe(first.mutationId); // a coalesced entry NEVER reuses a mutationId with a different payload
			expect(engine.status().queueDepth).toBe(1); // coalesced, not stacked
			expect(events.some((event) => event.type === 'queue.write.coalesce')).toBe(true);

			connectivity.set('online');
			expect(await engine.sync('write-drain')).toMatchObject({
				status: 'ran',
				pushed: 1,
				conflicts: 0,
				rejected: 0,
			});
			// ONE envelope, the second snapshot, the ORIGINAL base — accepted by the server's real revision check.
			expect(server.received).toHaveLength(1);
			expect(server.received[0]).toMatchObject({
				operation: 'update',
				mutationId: second.mutationId,
				baseRevision: 'sha256:base-r1',
			});
			expect((server.received[0].payload as { status?: string }).status).toBe('completed');
			// Ack re-anchored the record to the server's advanced revision; nothing dirty remains.
			const order = await orderJson(engine, UUID_A);
			expect((order?.sync as { revision?: string }).revision).toBe(
				server.applied.get(UUID_A)?.revision
			);
			expect(order?.local).toMatchObject({ dirty: false, pendingMutationIds: [] });
		} finally {
			await engine.dispose();
		}
	});

	it('regression 2: an edit queued behind an IN-FLIGHT ack drains with the re-anchored base — no 409', async () => {
		const server = createFakeWriteServer({ firstId: 900_000_400 });
		let gateOpen: (() => void) | null = null;
		const gated = new Promise<void>((resolve) => {
			gateOpen = resolve;
		});
		let holds = 0;
		const fetch = async (url: string, init?: { signal?: AbortSignal }): Promise<Response> => {
			if (url.includes('/push/') && holds === 0) {
				holds += 1;
				await gated; // hold the CREATE push in flight
			}
			return server.fetch(url, init as never);
		};
		const engine = engineWith({ fetch });
		try {
			await engine.ready;
			await insertBornLocalOrder(engine, UUID_A);
			await engine.write({
				collection: 'orders',
				operation: 'create',
				recordId: UUID_A,
				payload: { status: 'pos-open' },
			});

			const inFlight = engine.sync('write-drain');
			await vi.waitFor(() => expect(holds).toBe(1));
			// The create is CLAIMED (in flight) — this edit must NOT coalesce into it; it queues behind.
			await engine.write({
				collection: 'orders',
				operation: 'update',
				recordId: UUID_A,
				payload: { status: 'completed' },
			});
			expect((await queueRows(engine)).length).toBe(2);
			gateOpen!();
			expect(await inFlight).toMatchObject({ status: 'ran', pushed: 1 });

			const revisionAfterCreate = server.applied.get(UUID_A)?.revision;
			expect(revisionAfterCreate).toBeTruthy();
			// The queued edit re-stamps its base from the ack's re-anchored revision at drain time.
			expect(await engine.sync('write-drain')).toMatchObject({
				status: 'ran',
				pushed: 1,
				conflicts: 0,
				rejected: 0,
			});
			expect(server.received).toHaveLength(2);
			expect(server.received[1]).toMatchObject({
				operation: 'update',
				baseRevision: revisionAfterCreate,
			});
			expect(engine.status().queueDepth).toBe(0);
		} finally {
			await engine.dispose();
		}
	});

	it('regression 3: a cross-client conflict parks durably — fetch count FROZEN, server truth in conflicts(), then retry-with-server-base wins', async () => {
		const server = createFakeWriteServer();
		// Another client advanced the server to r2; this client is anchored at r1.
		server.seed(UUID_A, { id: 42, revision: 'sha256:server-r2' });
		const engine = engineWith({ fetch: (url, init) => server.fetch(url, init as never) });
		try {
			await engine.ready;
			const events: EngineEvent[] = [];
			engine.events((event) => events.push(event));
			await insertServerBornOrder(engine, UUID_A, { wooOrderId: 42, revision: 'sha256:server-r1' });
			const receipt = await engine.write({
				collection: 'orders',
				operation: 'update',
				recordId: UUID_A,
				payload: { status: 'completed' },
			});

			expect(await engine.sync('write-drain')).toMatchObject({
				status: 'ran',
				pushed: 0,
				conflicts: 1,
			});
			const fetchesAtConflict = server.received.length;
			// The conflicted mutation LEAVES the drain: further ticks push NOTHING.
			expect(await engine.sync('write-drain')).toMatchObject({
				status: 'ran',
				pushed: 0,
				conflicts: 0,
				deferred: 0,
				failed: 0,
			});
			expect(await engine.sync('write-drain')).toMatchObject({
				status: 'ran',
				pushed: 0,
				conflicts: 0,
				deferred: 0,
				failed: 0,
			});
			expect(server.received.length).toBe(fetchesAtConflict); // frozen
			expect(events.filter((event) => event.type === 'write-conflict')).toHaveLength(1); // ONE event, at transition

			// conflicts() exposes the server truth captured from the 409.
			const conflicts = await engine.conflicts();
			expect(conflicts).toHaveLength(1);
			expect(conflicts[0]).toMatchObject({
				mutationId: receipt.mutationId,
				status: 'conflicted',
				conflictRevision: 'sha256:server-r2',
				conflictDocument: { id: 42 },
			});

			// Retry on the server's base: the local intent wins.
			await engine.resolveConflict(receipt.mutationId, 'retry-with-server-base');
			expect(await engine.sync('write-drain')).toMatchObject({
				status: 'ran',
				pushed: 1,
				conflicts: 0,
			});
			expect(await engine.conflicts()).toEqual([]);
			expect((server.received.at(-1)?.payload as { status?: string }).status).toBe('completed');
			const order = await orderJson(engine, UUID_A);
			expect((order?.sync as { revision?: string }).revision).toBe(
				server.applied.get(UUID_A)?.revision
			);
			expect(order?.local).toMatchObject({ dirty: false, pendingMutationIds: [] });
		} finally {
			await engine.dispose();
		}
	});

	it('regression 3b: discarding a conflict restores server truth via a targeted re-pull and clears dirty', async () => {
		const server = createFakeWriteServer();
		server.seed(UUID_A, { id: 42, revision: 'sha256:server-r2' });
		const { state, fetch } = routedFetch(server, () => ({
			number: '1042',
			status: 'refunded', // the server's truth this client must return to
			total: '99.00',
			date_created_gmt: '2026-07-10T00:00:00',
			date_modified_gmt: '2026-07-10T00:00:01',
			customer_id: 0,
			meta_data: [{ id: 1, key: '_woocommerce_pos_uuid', value: UUID_A }],
		}));
		const engine = engineWith({ fetch });
		try {
			await engine.ready;
			await insertServerBornOrder(engine, UUID_A, { wooOrderId: 42, revision: 'sha256:server-r1' });
			const receipt = await engine.write({
				collection: 'orders',
				operation: 'update',
				recordId: UUID_A,
				payload: { status: 'completed' },
			});
			await engine.sync('write-drain');
			expect(await engine.conflicts()).toHaveLength(1);

			await engine.resolveConflict(receipt.mutationId, 'discard');
			expect(await engine.conflicts()).toEqual([]);
			expect(await queueRows(engine)).toEqual([]);
			expect(state.orderPulls).toEqual([[42]]); // the targeted force-refresh re-pull
			const order = await orderJson(engine, UUID_A);
			expect(order?.status).toBe('refunded'); // server truth applied
			expect(order?.local).toMatchObject({ dirty: false, pendingMutationIds: [] });
		} finally {
			await engine.dispose();
		}
	});

	it('regression 4: a rejected mutation frees the record — a pull applies server truth; the dead letter resolves by discard', async () => {
		const server = createFakeWriteServer();
		server.seed(UUID_A, { id: 42, revision: 'sha256:server-r1' });
		server.script(() => ({ kind: 'identity_ambiguous' as const }));
		const { state, fetch } = routedFetch(server, () => ({
			number: '1042',
			status: 'on-hold',
			total: '10.00',
			date_created_gmt: '2026-07-10T00:00:00',
			date_modified_gmt: '2026-07-10T00:00:02',
			customer_id: 0,
			meta_data: [{ id: 1, key: '_woocommerce_pos_uuid', value: UUID_A }],
		}));
		const engine = engineWith({ fetch });
		try {
			await engine.ready;
			await insertServerBornOrder(engine, UUID_A, { wooOrderId: 42, revision: 'sha256:server-r1' });
			const receipt = await engine.write({
				collection: 'orders',
				operation: 'update',
				recordId: UUID_A,
				payload: { status: 'completed' },
			});

			expect(await engine.sync('write-drain')).toMatchObject({ status: 'ran', rejected: 1 });
			// Dead-letter cleanup freed the record's bookkeeping immediately...
			expect((await orderJson(engine, UUID_A))?.local).toMatchObject({
				dirty: false,
				pendingMutationIds: [],
			});
			// ...while the rejected entry persists in the conflicts surface.
			const [dead] = await engine.conflicts();
			expect(dead).toMatchObject({ mutationId: receipt.mutationId, status: 'rejected' });

			// The record is SYNCABLE again: a subsequent pull applies server truth despite the dead letter.
			server.script(() => undefined);
			await engine.require({
				id: 'recover',
				collection: 'orders',
				kind: 'targeted-records',
				wooIds: [42],
				forceRefresh: true,
			}).ready;
			expect(state.orderPulls).toEqual([[42]]);
			expect((await orderJson(engine, UUID_A))?.status).toBe('on-hold');

			// A rejected row's only resolution is discard.
			await expect(
				engine.resolveConflict(receipt.mutationId, 'retry-with-server-base')
			).rejects.toThrow(/only be discarded/i);
			await engine.resolveConflict(receipt.mutationId, 'discard');
			expect(await engine.conflicts()).toEqual([]);
		} finally {
			await engine.dispose();
		}
	});

	it('regression 5: same-millisecond create+update under a fixed clock drains AS the create, carrying the latest snapshot', async () => {
		const server = createFakeWriteServer({ firstId: 900_000_500 });
		const engine = engineWith({
			fetch: (url, init) => server.fetch(url, init as never),
			now: () => 1_752_105_600_000,
		});
		try {
			await engine.ready;
			await insertBornLocalOrder(engine, UUID_A);
			await engine.write({
				collection: 'orders',
				operation: 'create',
				recordId: UUID_A,
				payload: { status: 'pos-open' },
			});
			const second = await engine.write({
				collection: 'orders',
				operation: 'update',
				recordId: UUID_A,
				payload: { status: 'pos-paid' },
			});

			expect(await engine.sync('write-drain')).toMatchObject({
				status: 'ran',
				pushed: 1,
				conflicts: 0,
				rejected: 0,
			});
			// ONE envelope: still a CREATE (the server never saw the record), with the update's snapshot,
			// under the coalesced entry's fresh mutationId — never an update racing ahead of its create.
			expect(server.received).toHaveLength(1);
			expect(server.received[0]).toMatchObject({
				operation: 'create',
				mutationId: second.mutationId,
			});
			expect((server.received[0].payload as { status?: string }).status).toBe('pos-paid');
			const order = await orderJson(engine, UUID_A);
			expect(order?.wooOrderId).toBe(900_000_500);
			expect(order?.local).toMatchObject({ dirty: false, pendingMutationIds: [] });
		} finally {
			await engine.dispose();
		}
	});

	it('regression 6 (re-ruled by #516 item 3): pending-create + delete ANNIHILATES — terminal write-annihilated event, local row REMOVED, nothing pushed', async () => {
		const events: SyncEvent[] = [];
		const engineEvents: EngineEvent[] = [];
		const server = createFakeWriteServer();
		const engine = engineWith({
			fetch: (url, init) => server.fetch(url, init as never),
			diagnostics: (event) => events.push(event),
		});
		try {
			await engine.ready;
			engine.events((event) => engineEvents.push(event));
			await insertBornLocalOrder(engine, UUID_A);
			await engine.write({
				collection: 'orders',
				operation: 'create',
				recordId: UUID_A,
				payload: { status: 'pos-open' },
			});
			// Note: NO baseRevision — a born-local record has none, and annihilation must not demand one.
			const receipt = await engine.write({
				collection: 'orders',
				operation: 'delete',
				recordId: UUID_A,
			});
			expect(receipt.annihilated).toBe(true);

			expect(await queueRows(engine)).toEqual([]);
			expect(events.some((event) => event.type === 'queue.write.annihilate')).toBe(true);
			// The honest contract (#516 item 3): ONE terminal event for the receipt
			// mutationId (a distinct 'write-annihilated' — no push ever happened, so
			// the ack shape with its revision slot would lie)...
			expect(engineEvents).toContainEqual({
				type: 'write-annihilated',
				collection: 'orders',
				recordId: UUID_A,
				mutationId: receipt.mutationId,
			});
			// ...and the caller asked for DELETION: the resident row is gone, not a
			// ghost record sitting there as dirty:false.
			expect(await orderJson(engine, UUID_A)).toBeNull();
			expect(await engine.sync('write-drain')).toMatchObject({ status: 'ran', pushed: 0 });
			expect(server.received).toEqual([]); // nothing was ever sent
		} finally {
			await engine.dispose();
		}
	});

	it('regression 6b: a pending update ∘ delete coalesces to ONE delete at the original position (server record — not annihilation)', async () => {
		const server = createFakeWriteServer();
		server.seed(UUID_A, { id: 42, revision: 'sha256:base-r1' });
		const engine = engineWith({ fetch: (url, init) => server.fetch(url, init as never) });
		try {
			await engine.ready;
			await insertServerBornOrder(engine, UUID_A, { wooOrderId: 42, revision: 'sha256:base-r1' });
			const update = await engine.write({
				collection: 'orders',
				operation: 'update',
				recordId: UUID_A,
				payload: { status: 'completed' },
			});
			const del = await engine.write({
				collection: 'orders',
				operation: 'delete',
				recordId: UUID_A,
			});
			expect(del.mutationId).not.toBe(update.mutationId);

			const rows = await queueRows(engine);
			expect(rows).toHaveLength(1);
			expect(rows[0]).toMatchObject({
				operation: 'delete',
				mutationId: del.mutationId,
				baseRevision: 'sha256:base-r1',
			});

			expect(await engine.sync('write-drain')).toMatchObject({
				status: 'ran',
				pushed: 1,
				conflicts: 0,
				rejected: 0,
			});
			expect(server.received).toHaveLength(1);
			expect(server.received[0]).toMatchObject({ operation: 'delete' });
			expect(server.applied.has(UUID_A)).toBe(false); // the server record is gone
		} finally {
			await engine.dispose();
		}
	});

	it('regression 7: a failed dirty-mark rolls back the enqueue — write() rejects and the queue holds no orphan', async () => {
		const inner = memoryEngineStorage();
		let armed = false;
		// Sabotage port: while armed, the orders collection's storage FAILS every
		// write (a per-row storage error, the shape RxDB propagates cleanly), so
		// the enqueue's SECOND write (the dirty-mark) fails after the queue insert.
		const failRows = (rows: { document: Record<string, unknown> }[]) => ({
			error: rows.map((row) => ({
				status: 422,
				isError: true as const,
				documentId: row.document.id as string,
				writeRow: row,
				validationErrors: [{ message: 'sabotage: orders storage write refused' }],
			})),
		});
		const storage = new Proxy(inner as object, {
			get(target, prop, receiver) {
				if (prop === 'createStorageInstance') {
					return async (params: { collectionName: string }) => {
						const instance = await (
							inner as unknown as { createStorageInstance(p: unknown): Promise<object> }
						).createStorageInstance(params);
						if (params.collectionName !== 'orders') return instance;
						return new Proxy(instance, {
							get(instanceTarget, instanceProp) {
								const value = Reflect.get(instanceTarget, instanceProp);
								if (instanceProp === 'bulkWrite' && typeof value === 'function') {
									return (...args: unknown[]) =>
										armed
											? Promise.resolve(
													failRows(args[0] as { document: Record<string, unknown> }[])
												)
											: (value as (...a: unknown[]) => unknown).apply(instanceTarget, args);
								}
								return typeof value === 'function'
									? (value as (...a: unknown[]) => unknown).bind(instanceTarget)
									: value;
							},
						});
					};
				}
				const value = Reflect.get(target, prop, receiver);
				return typeof value === 'function'
					? (value as (...a: unknown[]) => unknown).bind(target)
					: value;
			},
		}) as RxStorage<unknown, unknown>;

		const server = createFakeWriteServer({ firstId: 900_000_600 });
		const engine = engineWith({ fetch: (url, init) => server.fetch(url, init as never), storage });
		try {
			await engine.ready;
			await insertBornLocalOrder(engine, UUID_A);
			armed = true;
			await expect(
				engine.write({
					collection: 'orders',
					operation: 'create',
					recordId: UUID_A,
					payload: { status: 'pos-open' },
				})
			).rejects.toThrow(/COL20/); // RxDB's storage-write error surfaced through write()
			expect(await queueRows(engine)).toEqual([]); // the compensating delete removed the inserted row

			// Recovery: nothing half-enqueued lingers — the retried write drains exactly once.
			armed = false;
			await engine.write({
				collection: 'orders',
				operation: 'create',
				recordId: UUID_A,
				payload: { status: 'pos-open' },
			});
			expect(await engine.sync('write-drain')).toMatchObject({ status: 'ran', pushed: 1 });
			expect(server.received).toHaveLength(1);
		} finally {
			await engine.dispose();
		}
	});

	it('P1-1a: two partial updates touching DIFFERENT fields coalesce into a snapshot carrying BOTH edits', async () => {
		const server = createFakeWriteServer();
		server.seed(UUID_A, { id: 42, revision: 'sha256:base-r1' });
		const engine = engineWith({ fetch: (url, init) => server.fetch(url, init as never) });
		try {
			await engine.ready;
			await insertServerBornOrder(engine, UUID_A, { wooOrderId: 42, revision: 'sha256:base-r1' });
			// Neither intent carries the other's field — the OLD replace-the-payload
			// coalescing would push only the second partial and silently drop the first edit.
			await engine.write({
				collection: 'orders',
				operation: 'update',
				recordId: UUID_A,
				payload: { status: 'completed' },
			});
			await engine.write({
				collection: 'orders',
				operation: 'update',
				recordId: UUID_A,
				payload: { customer_note: 'ring twice' },
			});

			expect(await engine.sync('write-drain')).toMatchObject({
				status: 'ran',
				pushed: 1,
				conflicts: 0,
				rejected: 0,
			});
			expect(server.received).toHaveLength(1);
			const pushedPayload = server.received[0].payload as {
				status?: string;
				customer_note?: string;
			};
			expect(pushedPayload.status).toBe('completed'); // the FIRST edit survives the coalesce
			expect(pushedPayload.customer_note).toBe('ring twice'); // and the second lands with it
		} finally {
			await engine.dispose();
		}
	});

	it('P1-1b: create + partial update coalesces into a create retaining the original fields plus the edit', async () => {
		const server = createFakeWriteServer({ firstId: 900_000_700 });
		const engine = engineWith({ fetch: (url, init) => server.fetch(url, init as never) });
		try {
			await engine.ready;
			await insertBornLocalOrder(engine, UUID_A);
			await engine.write({
				collection: 'orders',
				operation: 'create',
				recordId: UUID_A,
				payload: { status: 'pos-open', currency: 'AUD' },
			});
			// The partial update names ONLY status — the flipped-to-create replacement
			// must still carry the original create's currency.
			await engine.write({
				collection: 'orders',
				operation: 'update',
				recordId: UUID_A,
				payload: { status: 'pos-paid' },
			});

			expect(await engine.sync('write-drain')).toMatchObject({
				status: 'ran',
				pushed: 1,
				conflicts: 0,
				rejected: 0,
			});
			expect(server.received).toHaveLength(1);
			expect(server.received[0].operation).toBe('create');
			const pushedPayload = server.received[0].payload as { status?: string; currency?: string };
			expect(pushedPayload.status).toBe('pos-paid');
			expect(pushedPayload.currency).toBe('AUD'); // the create's own field is NOT dropped
		} finally {
			await engine.dispose();
		}
	});

	it('P1-2a: a delete does NOT annihilate a CLAIMED (in-flight) create — it queues behind and lands after the ack', async () => {
		const events: SyncEvent[] = [];
		const server = createFakeWriteServer({ firstId: 900_000_800 });
		let gateOpen: (() => void) | null = null;
		const gated = new Promise<void>((resolve) => {
			gateOpen = resolve;
		});
		let holds = 0;
		const fetch = async (url: string, init?: { signal?: AbortSignal }): Promise<Response> => {
			if (url.includes('/push/') && holds === 0) {
				holds += 1;
				await gated; // hold the CREATE push in flight (claimed)
			}
			return server.fetch(url, init as never);
		};
		const engine = engineWith({ fetch, diagnostics: (event) => events.push(event) });
		try {
			await engine.ready;
			await insertBornLocalOrder(engine, UUID_A);
			await engine.write({
				collection: 'orders',
				operation: 'create',
				recordId: UUID_A,
				payload: { status: 'pos-open' },
			});

			const inFlight = engine.sync('write-drain');
			try {
				await vi.waitFor(() => expect(holds).toBe(1));
				// The interleave under test: the create is claimed, THEN the delete arrives.
				await engine.write({ collection: 'orders', operation: 'delete', recordId: UUID_A });
				const rows = (await queueRows(engine)).sort(
					(a, b) => (a.seq as number) - (b.seq as number)
				);
				expect(rows.map((row) => [row.operation, row.status])).toEqual([
					['create', 'claimed'],
					['delete', 'pending'],
				]);
				expect(events.some((event) => event.type === 'queue.write.annihilate')).toBe(false); // NOT annihilated
			} finally {
				gateOpen!(); // open even on assertion failure — a gated dispose would mask the real error as a timeout
			}
			expect(await inFlight).toMatchObject({ status: 'ran', pushed: 1 });
			expect(server.applied.has(UUID_A)).toBe(true); // the in-flight create landed

			// The queued delete drains next, base re-stamped from the create's ack.
			expect(await engine.sync('write-drain')).toMatchObject({
				status: 'ran',
				pushed: 1,
				conflicts: 0,
				rejected: 0,
			});
			expect(server.received.map((env) => env.operation)).toEqual(['create', 'delete']);
			expect(server.applied.has(UUID_A)).toBe(false); // created, then deleted — never cancelled mid-flight
			expect(await orderJson(engine, UUID_A)).toBeNull(); // the delete ack removed the local row
		} finally {
			await engine.dispose();
		}
	});

	it('P1-2b: concurrent write() calls coalesce onto one pending row exactly once — one well-ordered row, every edit kept', async () => {
		const server = createFakeWriteServer();
		server.seed(UUID_A, { id: 42, revision: 'sha256:base-r1' });
		const engine = engineWith({ fetch: (url, init) => server.fetch(url, init as never) });
		try {
			await engine.ready;
			await insertServerBornOrder(engine, UUID_A, { wooOrderId: 42, revision: 'sha256:base-r1' });
			await engine.write({
				collection: 'orders',
				operation: 'update',
				recordId: UUID_A,
				payload: { status: 'completed' },
			});
			// Two racing writes read the SAME pending row: the CAS lets exactly one
			// consume it; the loser re-reads and coalesces onto the winner's replacement.
			await Promise.all([
				engine.write({
					collection: 'orders',
					operation: 'update',
					recordId: UUID_A,
					payload: { customer_note: 'ring twice' },
				}),
				engine.write({
					collection: 'orders',
					operation: 'update',
					recordId: UUID_A,
					payload: { transaction_id: 'txn-7' },
				}),
			]);

			const rows = await queueRows(engine);
			expect(rows).toHaveLength(1); // exactly one row — no duplicated ordering metadata
			expect(rows[0]).toMatchObject({
				seq: 1,
				coalesced: 2,
				status: 'pending',
				baseRevision: 'sha256:base-r1',
			});

			expect(await engine.sync('write-drain')).toMatchObject({
				status: 'ran',
				pushed: 1,
				conflicts: 0,
				rejected: 0,
			});
			expect(server.received).toHaveLength(1);
			const pushedPayload = server.received[0].payload as {
				status?: string;
				customer_note?: string;
				transaction_id?: string;
			};
			expect(pushedPayload).toMatchObject({
				status: 'completed',
				customer_note: 'ring twice',
				transaction_id: 'txn-7',
			}); // every edit kept
		} finally {
			await engine.dispose();
		}
	});
});

describe('gate2 #516 — coalescing survives replay, reordering, and its own contracts', () => {
	it('#526: a lost create ack replays as created, acknowledges once, and does not born-twice requeue', async () => {
		const events: SyncEvent[] = [];
		const engineEvents: EngineEvent[] = [];
		const server = createFakeWriteServer();
		let drop = true;
		let nowMs = 0;
		const engine = engineWith({
			diagnostics: (event) => events.push(event),
			now: () => nowMs,
			fetch: async (url, init) => {
				const response = await server.fetch(url, init as never);
				if (drop) {
					drop = false;
					throw new TypeError('ack lost');
				}
				return response;
			},
		});
		try {
			await engine.ready;
			engine.events((event) => engineEvents.push(event));
			await insertBornLocalOrder(engine, UUID_A);
			const create = await engine.write({
				collection: 'orders',
				operation: 'create',
				recordId: UUID_A,
				payload: { status: 'pos-open' },
			});
			expect((await engine.sync('write-drain')).failed).toBe(1);
			nowMs = 120_000;
			expect((await engine.sync('write-drain')).pushed).toBe(1);
			expect(await queueRows(engine)).toEqual([]);
			expect(events.some((event) => event.type === 'queue.write.born-twice-requeue')).toBe(false);
			expect(
				engineEvents.filter(
					(event) => event.type === 'write-acknowledged' && event.mutationId === create.mutationId
				)
			).toHaveLength(1);
		} finally {
			await engine.dispose();
		}
	});

	it('#526: a lost born-twice create ack replays as 200 and requeues the discarded payload', async () => {
		const events: SyncEvent[] = [];
		const server = createFakeWriteServer();
		server.seed(UUID_A, { id: 900_100_001, revision: 'sha256:existing' });
		let drop = true;
		let nowMs = 0;
		const engine = engineWith({
			diagnostics: (event) => events.push(event),
			now: () => nowMs,
			fetch: async (url, init) => {
				const response = await server.fetch(url, init as never);
				if (drop) {
					drop = false;
					throw new TypeError('ack lost');
				}
				return response;
			},
		});
		try {
			await engine.ready;
			await insertBornLocalOrder(engine, UUID_A);
			await engine.write({
				collection: 'orders',
				operation: 'create',
				recordId: UUID_A,
				payload: { status: 'pos-paid' },
			});
			expect((await engine.sync('write-drain')).failed).toBe(1);
			nowMs = 120_000;
			expect((await engine.sync('write-drain')).pushed).toBe(1);
			expect(events.some((event) => event.type === 'queue.write.born-twice-requeue')).toBe(true);
			expect(await queueRows(engine)).toEqual([
				expect.objectContaining({
					operation: 'update',
					payload: expect.objectContaining({ status: 'pos-paid' }),
				}),
			]);
		} finally {
			await engine.dispose();
		}
	});

	it('gate2 R2 (item 1): an applied-but-unacked create never re-coalesces — the edit queues BEHIND, the replay dedupes, and the edit lands', async () => {
		const server = createFakeWriteServer({ firstId: 900_100_000 });
		// The FIRST push is applied server-side but the response is "lost" (the
		// classic flaky-network lost ack).
		let dropResponses = 1;
		const fetch = async (url: string, init?: { signal?: AbortSignal }): Promise<Response> => {
			const response = await server.fetch(url, init as never);
			if (url.includes('/push/') && dropResponses > 0) {
				dropResponses -= 1;
				throw new TypeError('network dropped after server applied');
			}
			return response;
		};
		let nowMs = 1_752_105_600_000;
		const engine = engineWith({ fetch, now: () => nowMs });
		try {
			await engine.ready;
			await insertBornLocalOrder(engine, UUID_A);
			const create = await engine.write({
				collection: 'orders',
				operation: 'create',
				recordId: UUID_A,
				payload: { status: 'pos-open' },
			});

			// Drain 1: the server APPLIES the create, the response is lost → retryable failure.
			expect((await engine.sync('write-drain')).failed).toBe(1);
			expect(server.applied.get(UUID_A)).toBeDefined();

			// The user edits. Pre-fix this coalesced INTO the pending create under a
			// FRESH mutationId — the replay then hit the born-twice guard, which
			// returned the EXISTING document and silently discarded 'pos-paid'.
			// Post-fix: the ever-pushed row (attempts > 0) never coalesces; the edit
			// queues BEHIND as a separate update.
			const edit = await engine.write({
				collection: 'orders',
				operation: 'update',
				recordId: UUID_A,
				payload: { status: 'pos-paid' },
			});
			const rows = (await queueRows(engine)).sort((a, b) => (a.seq as number) - (b.seq as number));
			expect(rows.map((row) => [row.operation, row.mutationId])).toEqual([
				['create', create.mutationId], // the ORIGINAL mutationId — the replay stays a replay
				['update', edit.mutationId],
			]);

			// Drain 2 (past backoff): the create replays under its ORIGINAL id (the
			// server's mutationId dedupe answers idempotently), then the edit pushes
			// against the ack's re-anchored revision.
			nowMs += 120_000;
			expect(await engine.sync('write-drain')).toMatchObject({
				status: 'ran',
				pushed: 2,
				conflicts: 0,
				rejected: 0,
			});
			expect(server.received.map((env) => [env.operation, env.mutationId])).toEqual([
				['create', create.mutationId],
				['create', create.mutationId], // the replay — same id, not a fresh one
				['update', edit.mutationId],
			]);
			// The truth the executed repro proved lost: the server DID apply 'pos-paid'.
			expect((server.received.at(-1)?.payload as { status?: string }).status).toBe('pos-paid');
			const order = await orderJson(engine, UUID_A);
			expect((order?.sync as { revision?: string }).revision).toBe(
				server.applied.get(UUID_A)?.revision
			);
			expect(order?.local).toMatchObject({ dirty: false, pendingMutationIds: [] });
			expect(await engine.conflicts()).toEqual([]);
		} finally {
			await engine.dispose();
		}
	});

	it('gate2 R2 delete (item 1): a delete behind an applied-but-unacked create queues BEHIND instead of annihilating maybe-applied work', async () => {
		const events: SyncEvent[] = [];
		const server = createFakeWriteServer({ firstId: 900_110_000 });
		let dropResponses = 1;
		const fetch = async (url: string, init?: { signal?: AbortSignal }): Promise<Response> => {
			const response = await server.fetch(url, init as never);
			if (url.includes('/push/') && dropResponses > 0) {
				dropResponses -= 1;
				throw new TypeError('network dropped after server applied');
			}
			return response;
		};
		let nowMs = 1_752_105_600_000;
		const engine = engineWith({
			fetch,
			now: () => nowMs,
			diagnostics: (event) => events.push(event),
		});
		try {
			await engine.ready;
			await insertBornLocalOrder(engine, UUID_A);
			const create = await engine.write({
				collection: 'orders',
				operation: 'create',
				recordId: UUID_A,
				payload: { status: 'pos-open' },
			});
			expect((await engine.sync('write-drain')).failed).toBe(1);
			expect(server.applied.has(UUID_A)).toBe(true); // the server holds the create

			// Annihilating now would strand a server-side zombie record forever.
			await engine.write({ collection: 'orders', operation: 'delete', recordId: UUID_A });
			expect(events.some((event) => event.type === 'queue.write.annihilate')).toBe(false);
			const rows = (await queueRows(engine)).sort((a, b) => (a.seq as number) - (b.seq as number));
			expect(rows.map((row) => row.operation)).toEqual(['create', 'delete']);
			expect(rows[0]?.mutationId).toBe(create.mutationId);

			// Replay the create (dedupe), then the delete lands against the anchored revision.
			nowMs += 120_000;
			expect(await engine.sync('write-drain')).toMatchObject({
				status: 'ran',
				pushed: 2,
				conflicts: 0,
				rejected: 0,
			});
			expect(server.applied.has(UUID_A)).toBe(false); // created, then deleted — never a zombie
			expect(await orderJson(engine, UUID_A)).toBeNull(); // delete ack removed the local row
			expect(await queueRows(engine)).toEqual([]);
		} finally {
			await engine.dispose();
		}
	});

	it('gate2 R2 honest ack (item 1): a born-twice create ack (HTTP 200) re-queues the discarded snapshot as a follow-up update', async () => {
		const events: SyncEvent[] = [];
		const server = createFakeWriteServer();
		// The server ALREADY knows this uuid (another till's create landed, or a
		// replay whose server-side memo was lost): the born-twice guard will
		// answer 200 with the EXISTING document and ignore the pushed payload.
		server.seed(UUID_A, { id: 900_120_777, revision: 'sha256:existing-r1' });
		const engine = engineWith({
			fetch: (url, init) => server.fetch(url, init as never),
			diagnostics: (event) => events.push(event),
		});
		try {
			await engine.ready;
			await insertBornLocalOrder(engine, UUID_A);
			const create = await engine.write({
				collection: 'orders',
				operation: 'create',
				recordId: UUID_A,
				payload: { status: 'pos-paid', currency: 'AUD' },
			});

			// Drain 1: the create acks (200 returned-existing) — pre-fix the client
			// bookkept dirty:false with the edit silently gone. Post-fix the honest
			// reconcile re-queues the discarded snapshot.
			expect(await engine.sync('write-drain')).toMatchObject({
				status: 'ran',
				pushed: 1,
				conflicts: 0,
				rejected: 0,
			});
			expect(events.some((event) => event.type === 'queue.write.born-twice-requeue')).toBe(true);
			const rows = await queueRows(engine);
			expect(rows).toHaveLength(1);
			expect(rows[0]).toMatchObject({ operation: 'update', baseRevision: 'sha256:existing-r1' });
			expect(rows[0]?.mutationId).not.toBe(create.mutationId);
			expect(rows[0]?.payload as { status?: string; currency?: string }).toMatchObject({
				status: 'pos-paid',
				currency: 'AUD',
			});
			const afterAck = await orderJson(engine, UUID_A);
			expect(afterAck?.wooOrderId).toBe(900_120_777); // the existing server identity was adopted
			expect((afterAck?.local as { dirty?: boolean }).dirty).toBe(true); // NOT posing as synced

			// Drain 2: the follow-up lands the snapshot on the existing record's base.
			expect(await engine.sync('write-drain')).toMatchObject({
				status: 'ran',
				pushed: 1,
				conflicts: 0,
				rejected: 0,
			});
			expect(server.received.map((env) => env.operation)).toEqual(['create', 'update']);
			expect((server.received.at(-1)?.payload as { status?: string }).status).toBe('pos-paid');
			expect(server.applied.get(UUID_A)?.revision).not.toBe('sha256:existing-r1'); // the edit really landed
			expect((await orderJson(engine, UUID_A))?.local).toMatchObject({
				dirty: false,
				pendingMutationIds: [],
			});
		} finally {
			await engine.dispose();
		}
	});

	it('gate2 review P1 (item 1): a concurrent write racing the tail requeue wins — the snapshot merges UNDER it, never lands behind it', async () => {
		const server = createFakeWriteServer();
		const engine = engineWith({ fetch: (url, init) => server.fetch(url, init as never) });
		try {
			await engine.ready;
			await insertBornLocalOrder(engine, UUID_A);
			const scope = engine.active()!;
			const queue = queueFor(scope.database as never);
			// The pushed create whose payload the born-twice guard discarded.
			const pushedCreate = {
				mutationId: 'gate2-p1-create',
				collectionName: 'orders',
				operation: 'create' as const,
				recordId: UUID_A,
				origin: 'minted' as const,
				payload: { status: 'pos-paid', currency: 'AUD' },
				baseRevision: null,
				queuedAt: '2026-07-10T00:00:00.000Z',
			};
			// Deterministic race: the requeue's placement read returns STALE rows —
			// a concurrent edit lands right after the read, before the tail append.
			const realPending = queue.pending.bind(queue);
			const pendingSpy = vi.spyOn(queue, 'pending').mockImplementationOnce(async () => {
				const rows = await realPending();
				await queue.enqueue({
					mutationId: 'gate2-p1-concurrent',
					collectionName: 'orders',
					operation: 'update',
					recordId: UUID_A,
					origin: 'existing',
					payload: { status: 'completed' }, // the NEWER edit — it must win
					baseRevision: null,
					queuedAt: '2026-07-10T00:00:01.000Z',
				});
				return rows;
			});
			let seq = 0;
			const result = await requeueBornTwiceSnapshot({
				db: scope.database,
				mutation: pushedCreate,
				ackRevision: 'sha256:existing-r1',
				mintUuid: () => `00000000-0000-4000-8000-9991000000${String(++seq).padStart(2, '0')}`,
				now: () => '2026-07-10T00:00:02.000Z',
			});
			pendingSpy.mockRestore();

			// Pre-fix: the tail append was unconditional, so the OLDER snapshot
			// slotted at a HIGHER seq than the concurrent edit (and without its
			// fields) — 'completed' was overwritten server-side. Post-fix: the
			// conditional append refuses, the decision re-runs, and the snapshot
			// merges UNDER the newer edit.
			expect(result).not.toBeNull();
			const rows = await queueRows(engine);
			expect(rows).toHaveLength(1);
			expect(rows[0]?.mutationId).toBe(result?.mutationId);
			expect(rows[0]?.payload).toMatchObject({ status: 'completed', currency: 'AUD' }); // newer edit wins on overlap; snapshot fields kept
		} finally {
			await engine.dispose();
		}
	});

	it('gate2 review P2 (item 1): CAS exhaustion under a hot same-record writer FAILS the ack — the create stays queued and a quiet drain lands both', async () => {
		const engineEvents: EngineEvent[] = [];
		const server = createFakeWriteServer();
		server.seed(UUID_A, { id: 900_140_777, revision: 'sha256:pre' }); // born-twice on the create push
		let nowMs = 1_752_105_600_000;
		const engine = engineWith({
			fetch: (url, init) => server.fetch(url, init as never),
			now: () => nowMs,
		});
		try {
			await engine.ready;
			engine.events((event) => engineEvents.push(event));
			await insertBornLocalOrder(engine, UUID_A);
			const create = await engine.write({
				collection: 'orders',
				operation: 'create',
				recordId: UUID_A,
				payload: { status: 'pos-paid', currency: 'AUD' },
			});

			// The hot writer: every queue read while hot is immediately followed by a
			// same-record mutation (an append the first time, then a coalesce swap of
			// the tail), so BOTH requeue arms' CAS transitions keep refusing.
			const scope = engine.active()!;
			const queue = queueFor(scope.database as never);
			const realPending = queue.pending.bind(queue);
			let hot = false;
			let hotSeq = 0;
			vi.spyOn(queue, 'pending').mockImplementation(async () => {
				const rows = await realPending();
				if (hot) {
					const tail = rows
						.filter(
							(row) =>
								row.recordId === UUID_A &&
								row.operation !== 'create' &&
								(row.status === undefined || row.status === 'pending')
						)
						.at(-1);
					if (tail) {
						await queue.coalesceInto(tail.mutationId, {
							...tail,
							mutationId: `gate2-p2-hot-${++hotSeq}`,
							coalesced: (tail.coalesced ?? 0) + 1,
							payload: { note: 'hot' },
							status: 'pending',
						});
					} else {
						await queue.enqueue({
							mutationId: `gate2-p2-hot-${++hotSeq}`,
							collectionName: 'orders',
							operation: 'update',
							recordId: UUID_A,
							origin: 'existing',
							payload: { note: 'hot' },
							baseRevision: null,
							queuedAt: '2026-07-10T00:00:01.000Z',
						});
					}
				}
				return rows;
			});

			// Drain 1 (hot): the create pushes (200 born-twice) but the requeue's CAS
			// loop exhausts → the ack FAILS. Pre-fix it returned null instead: the
			// create was acknowledged and the snapshot silently vanished.
			hot = true;
			expect(await engine.sync('write-drain')).toMatchObject({
				status: 'ran',
				pushed: 0,
				failed: 1,
			});
			hot = false;
			expect(engineEvents.filter((event) => event.type === 'write-acknowledged')).toEqual([]); // the ack did NOT complete
			const afterHot = await queueRows(engine);
			const stillQueuedCreate = afterHot.find((row) => row.operation === 'create');
			expect(stillQueuedCreate).toMatchObject({
				mutationId: create.mutationId,
				status: 'pending',
				attempts: 1,
			}); // queued to replay

			// Quiet drains past the backoff: the replay dedupes (memoized 200), the
			// requeue merges the snapshot under the hot writer's surviving row, and
			// everything lands.
			nowMs += 5 * 60_000;
			expect(await engine.sync('write-drain')).toMatchObject({
				status: 'ran',
				pushed: 1,
				failed: 0,
			}); // the create acks
			expect(await engine.sync('write-drain')).toMatchObject({
				status: 'ran',
				pushed: 1,
				failed: 0,
			}); // the merged follow-up lands
			expect(await queueRows(engine)).toEqual([]);
			expect(server.received.at(-1)?.operation).toBe('update');
			expect(server.received.at(-1)?.payload).toMatchObject({
				status: 'pos-paid',
				currency: 'AUD',
				note: 'hot',
			}); // both the snapshot and the hot edit landed
			expect(server.applied.get(UUID_A)?.revision).not.toBe('sha256:pre');
			expect((await orderJson(engine, UUID_A))?.local).toMatchObject({
				dirty: false,
				pendingMutationIds: [],
			});
		} finally {
			await engine.dispose();
		}
	});

	it('gate2 R3 (item 2): a third edit coalesces into the LAST pending row — the server converges on the newest values', async () => {
		const server = createFakeWriteServer({ firstId: 900_200_000 });
		server.seed(UUID_A, { id: 900_200_777, revision: 'rev-1' });

		let gate: ((value: void) => void) | null = null;
		let failNext = false;
		const fetch = async (url: string, init?: { signal?: AbortSignal }): Promise<Response> => {
			if (url.includes('/push/') && failNext) {
				failNext = false;
				// Hold the push open until the test enqueues U2, then fail it (network).
				await new Promise<void>((resolve) => {
					gate = resolve;
				});
				throw new TypeError('network failed mid-push');
			}
			return server.fetch(url, init as never);
		};
		let nowMs = 1_752_105_600_000;
		const engine = engineWith({ fetch, now: () => nowMs });
		try {
			await engine.ready;
			await insertServerBornOrder(engine, UUID_A, {
				wooOrderId: 900_200_777,
				revision: 'rev-1',
				status: 'pos-open',
			});

			// U1 enqueued, then a drain claims it and the push hangs.
			await engine.write({
				collection: 'orders',
				operation: 'update',
				recordId: UUID_A,
				payload: { note: 'U1' },
			});
			failNext = true;
			const drain1 = engine.sync('write-drain');
			await new Promise<void>((resolve) => {
				const poll = () => (gate ? resolve() : setTimeout(poll, 5));
				poll();
			});
			// U2 lands while U1 is CLAIMED → queues behind as a second row.
			await engine.write({
				collection: 'orders',
				operation: 'update',
				recordId: UUID_A,
				payload: { note: 'U2', discount: '5.00' },
			});
			gate!();
			expect((await drain1).failed).toBe(1);
			expect(await queueRows(engine)).toHaveLength(2); // U1 (back to pending) + U2

			// U3 arrives. Pre-fix it coalesced into the LOWEST-seq row (U1), so the
			// final server state carried U2's stale 5.00. Post-fix it coalesces into
			// the LAST pending row (U2).
			await engine.write({
				collection: 'orders',
				operation: 'update',
				recordId: UUID_A,
				payload: { note: 'U3', discount: '9.99' },
			});
			const rows = (await queueRows(engine)).sort((a, b) => (a.seq as number) - (b.seq as number));
			expect(rows).toHaveLength(2);
			expect((rows[0]?.payload as { note?: string }).note).toBe('U1'); // the ever-pushed head is untouched
			expect(rows[1]?.payload as { note?: string; discount?: string }).toMatchObject({
				note: 'U3',
				discount: '9.99',
			});

			// Drain past the backoff: pushes arrive U1-then-U3 — the user's LAST
			// choice (9.99) is the server's final state.
			nowMs += 120_000;
			expect(await engine.sync('write-drain')).toMatchObject({
				status: 'ran',
				pushed: 2,
				conflicts: 0,
				rejected: 0,
			});
			const pushOrder = server.received
				.filter((env) => env.operation === 'update')
				.map((env) => (env.payload as { note?: string })?.note);
			expect(pushOrder).toEqual(['U1', 'U3']);
			expect((server.received.at(-1)?.payload as { discount?: string }).discount).toBe('9.99');
			expect((await orderJson(engine, UUID_A))?.local).toMatchObject({
				dirty: false,
				pendingMutationIds: [],
			});
		} finally {
			await engine.dispose();
		}
	});

	it('gate2 item 2: a delete annihilates a never-pushed create+update CHAIN (crash-restored rows) — no guaranteed-404 orphan', async () => {
		const events: SyncEvent[] = [];
		const engineEvents: EngineEvent[] = [];
		const server = createFakeWriteServer();
		const engine = engineWith({
			fetch: (url, init) => server.fetch(url, init as never),
			diagnostics: (event) => events.push(event),
		});
		try {
			await engine.ready;
			engine.events((event) => engineEvents.push(event));
			const scope = engine.active()!;
			// A crash-restored chain: a pending create plus a pending successor
			// update, NEITHER ever pushed (attempts absent) — the shape a reload can
			// leave when the enqueue raced a crash.
			await (
				scope.database.collections.orders as { insert(doc: unknown): Promise<unknown> }
			).insert({
				id: UUID_A,
				wooOrderId: null,
				number: '',
				dateCreatedGmt: '2026-07-10T00:00:00',
				status: 'pos-open',
				total: '0.00',
				customerId: 0,
				payload: { status: 'pos-open' },
				sync: { revision: '', partial: false, source: 'skeleton' },
				local: { dirty: true, pendingMutationIds: ['gate2-mc', 'gate2-mu'] },
			});
			const queueCollection = scope.database.collections.recordMutations as {
				insert(doc: unknown): Promise<unknown>;
			};
			await queueCollection.insert({
				mutationId: 'gate2-mc',
				recordId: UUID_A,
				collectionName: 'orders',
				operation: 'create',
				origin: 'minted',
				payload: { status: 'pos-open' },
				baseRevision: null,
				queuedAt: '2026-07-10T00:00:00.000Z',
				seq: 1,
				status: 'pending',
			});
			await queueCollection.insert({
				mutationId: 'gate2-mu',
				recordId: UUID_A,
				collectionName: 'orders',
				operation: 'update',
				origin: 'existing',
				payload: { status: 'pos-paid' },
				baseRevision: null,
				queuedAt: '2026-07-10T00:00:01.000Z',
				seq: 2,
				status: 'pending',
			});

			const receipt = await engine.write({
				collection: 'orders',
				operation: 'delete',
				recordId: UUID_A,
			});
			expect(receipt.annihilated).toBe(true);
			// The WHOLE chain cancels — pre-fix the create annihilated alone and the
			// queued update stayed behind as a guaranteed-404 orphan.
			expect(await queueRows(engine)).toEqual([]);
			expect(events).toContainEqual(
				expect.objectContaining({
					type: 'queue.write.annihilate',
					fields: expect.objectContaining({ removed: 2 }),
				})
			);
			expect(engineEvents).toContainEqual({
				type: 'write-annihilated',
				collection: 'orders',
				recordId: UUID_A,
				mutationId: receipt.mutationId,
			});
			expect(await orderJson(engine, UUID_A)).toBeNull();
			expect(await engine.sync('write-drain')).toMatchObject({ status: 'ran', pushed: 0 });
			expect(server.received).toEqual([]);
		} finally {
			await engine.dispose();
		}
	});

	it('#526: failed resident removal restores ahead of a concurrent same-record newcomer', async () => {
		const engine = engineWith({ fetch: createFakeWriteServer().fetch });
		try {
			await engine.ready;
			await insertBornLocalOrder(engine, UUID_A);
			await engine.write({
				collection: 'orders',
				operation: 'create',
				recordId: UUID_A,
				payload: { status: 'pos-open' },
			});
			const scope = engine.active()!;
			const queue = queueFor(scope.database);
			await queue.enqueue({
				mutationId: 'chain-update',
				recordId: UUID_A,
				collectionName: 'orders',
				operation: 'update',
				origin: 'existing',
				payload: { status: 'chain' },
				baseRevision: null,
				queuedAt: '2026-07-11T00:00:00.000Z',
			});
			const resident = await scope.database.collections.orders.findOne(UUID_A).exec();
			vi.spyOn(resident!, 'remove').mockImplementationOnce(async () => {
				await engine.write({
					collection: 'orders',
					operation: 'update',
					recordId: UUID_A,
					payload: { status: 'newcomer' },
				});
				throw new Error('scripted resident remove failure');
			});
			await expect(
				engine.write({ collection: 'orders', operation: 'delete', recordId: UUID_A })
			).rejects.toThrow('scripted resident remove failure');
			const rows = (await queueRows(engine)).sort((a, b) => Number(a.seq) - Number(b.seq));
			expect(rows.map((row) => row.seq)).toEqual([1, 2, 3]);
			expect(rows.map((row) => row.operation)).toEqual(['create', 'update', 'update']);
			expect((rows[1]?.payload as { status?: string }).status).toBe('chain');
			expect((rows[2]?.payload as { status?: string }).status).toBe('newcomer');
		} finally {
			await engine.dispose();
		}
	});

	it('gate2 item 4: a delete-428 recovers through the SAME revision refresh as updates and lands', async () => {
		const server = createFakeWriteServer();
		server.seed(UUID_A, { id: 42, revision: 'sha256:d1' });
		const { state, fetch } = routedFetch(server, () => ({
			_rxdb_revision: 'sha256:d1',
			number: '1042',
			status: 'processing',
			total: '10.00',
			date_created_gmt: '2026-07-10T00:00:00',
			date_modified_gmt: '2026-07-10T00:00:01',
			customer_id: 0,
			meta_data: [{ id: 1, key: '_woocommerce_pos_uuid', value: UUID_A }],
		}));
		let fault = true;
		server.script((env) => {
			if (env.operation !== 'delete' || !fault) return undefined;
			fault = false;
			return { kind: 'precondition_required' };
		});
		const engine = engineWith({ fetch });
		try {
			await engine.ready;
			await insertServerBornOrder(engine, UUID_A, { wooOrderId: 42, revision: 'sha256:d1' });
			await engine.write({ collection: 'orders', operation: 'delete', recordId: UUID_A });

			// Pre-fix the adapter mapped the delete-428 to a null-truth conflict
			// RESULT, so this refresh-and-retry never ran for deletes — the row
			// parked unresolvable. Post-fix: one refresh, one restamped retry, done.
			expect(await engine.sync('write-drain')).toMatchObject({
				status: 'ran',
				pushed: 1,
				conflicts: 0,
				rejected: 0,
			});
			expect(state.orderPulls).toEqual([[42]]); // the targeted revision refresh ran
			expect(server.applied.has(UUID_A)).toBe(false); // the delete landed
			expect(await orderJson(engine, UUID_A)).toBeNull();
			expect(await engine.conflicts()).toEqual([]);
		} finally {
			await engine.dispose();
		}
	});

	it("gate2 item 4: an unrecoverable 428 parks as 'needs-revision'; retry-with-server-base REFRESHES first (no same-base loop)", async () => {
		const engineEvents: EngineEvent[] = [];
		const server = createFakeWriteServer();
		server.seed(UUID_A, { id: 42, revision: 'sha256:server-r2' });
		const { state, fetch } = routedFetch(server, () => ({
			_rxdb_revision: 'sha256:server-r2',
			number: '1042',
			status: 'processing',
			total: '10.00',
			date_created_gmt: '2026-07-10T00:00:00',
			date_modified_gmt: '2026-07-10T00:00:01',
			customer_id: 0,
			meta_data: [{ id: 1, key: '_woocommerce_pos_uuid', value: UUID_A }],
		}));
		let fault = true;
		server.script((env) =>
			env.operation === 'update' && fault ? { kind: 'precondition_required' } : undefined
		);
		const engine = engineWith({ fetch });
		try {
			await engine.ready;
			engine.events((event) => engineEvents.push(event));
			await insertServerBornOrder(engine, UUID_A, { wooOrderId: 42, revision: 'sha256:server-r2' });
			const receipt = await engine.write({
				collection: 'orders',
				operation: 'update',
				recordId: UUID_A,
				payload: { status: 'completed' },
			});

			// The refresh finds nothing (server returns an empty pull) → the honest
			// distinct park, surfaced through the conflict surfaces.
			state.emptyOrdersPull = true;
			expect(await engine.sync('write-drain')).toMatchObject({
				status: 'ran',
				pushed: 0,
				conflicts: 1,
			});
			expect(engineEvents.some((event) => event.type === 'write-conflict')).toBe(true);
			const [parked] = await engine.conflicts();
			expect(parked).toMatchObject({ mutationId: receipt.mutationId, status: 'needs-revision' });

			// While the refresh still fails, retry-with-server-base REFUSES rather
			// than re-pending on the same stale base (the killed retry loop) — the
			// row stays parked and re-runnable.
			await expect(
				engine.resolveConflict(receipt.mutationId, 'retry-with-server-base')
			).rejects.toThrow(/no longer returns|stays parked/i);
			expect((await engine.conflicts())[0]).toMatchObject({ status: 'needs-revision' });

			// Server truth becomes reachable → the retry refreshes, re-pends on the
			// OBSERVED base, and the drain lands it.
			state.emptyOrdersPull = false;
			fault = false;
			await engine.resolveConflict(receipt.mutationId, 'retry-with-server-base');
			expect(await engine.sync('write-drain')).toMatchObject({
				status: 'ran',
				pushed: 1,
				conflicts: 0,
				rejected: 0,
			});
			expect((server.received.at(-1)?.payload as { status?: string }).status).toBe('completed');
			expect(await engine.conflicts()).toEqual([]);
			expect((await orderJson(engine, UUID_A))?.local).toMatchObject({
				dirty: false,
				pendingMutationIds: [],
			});
		} finally {
			await engine.dispose();
		}
	});

	it('gate2 item 5: the enqueue rollback is CAS-conditional — a drain-claimed row survives a failed dirty-mark', async () => {
		const inner = memoryEngineStorage();
		let armed = false;
		let engineRef: RxdbSyncEngine | null = null;
		const failRows = (rows: { document: Record<string, unknown> }[]) => ({
			error: rows.map((row) => ({
				status: 422,
				isError: true as const,
				documentId: row.document.id as string,
				writeRow: row,
				validationErrors: [{ message: 'sabotage: orders storage write refused' }],
			})),
		});
		// While armed, the orders dirty-mark write fails — but FIRST a "drain"
		// claims the just-enqueued row, modelling the claim racing the rollback.
		const storage = new Proxy(inner as object, {
			get(target, prop, receiver) {
				if (prop === 'createStorageInstance') {
					return async (params: { collectionName: string }) => {
						const instance = await (
							inner as unknown as { createStorageInstance(p: unknown): Promise<object> }
						).createStorageInstance(params);
						if (params.collectionName !== 'orders') return instance;
						return new Proxy(instance, {
							get(instanceTarget, instanceProp) {
								const value = Reflect.get(instanceTarget, instanceProp);
								if (instanceProp === 'bulkWrite' && typeof value === 'function') {
									return (...args: unknown[]) => {
										if (!armed)
											return (value as (...a: unknown[]) => unknown).apply(instanceTarget, args);
										return (async () => {
											const database = engineRef!.active()!.database;
											const queue = queueFor(database as never);
											const row = (await queue.pending()).find(
												(item) => item.recordId === UUID_A && item.status === 'pending'
											);
											if (row) await queue.claim({ ...row, status: 'claimed' });
											return failRows(args[0] as { document: Record<string, unknown> }[]);
										})();
									};
								}
								return typeof value === 'function'
									? (value as (...a: unknown[]) => unknown).bind(instanceTarget)
									: value;
							},
						});
					};
				}
				const value = Reflect.get(target, prop, receiver);
				return typeof value === 'function'
					? (value as (...a: unknown[]) => unknown).bind(target)
					: value;
			},
		}) as RxStorage<unknown, unknown>;

		const server = createFakeWriteServer({ firstId: 900_130_000 });
		const engine = engineWith({ fetch: (url, init) => server.fetch(url, init as never), storage });
		engineRef = engine;
		try {
			await engine.ready;
			await insertBornLocalOrder(engine, UUID_A);
			armed = true;
			await expect(
				engine.write({
					collection: 'orders',
					operation: 'create',
					recordId: UUID_A,
					payload: { status: 'pos-open' },
				})
			).rejects.toThrow(/COL20/);
			armed = false;
			// Pre-fix the rollback DELETED the row unconditionally — cancelling the
			// claimed, possibly-in-flight push. Post-fix the CAS refuses and the
			// claimed row survives.
			const rows = await queueRows(engine);
			expect(rows.map((row) => [row.operation, row.status])).toEqual([['create', 'claimed']]);
			// The surviving claim drains exactly once.
			expect(await engine.sync('write-drain')).toMatchObject({
				status: 'ran',
				pushed: 1,
				conflicts: 0,
				rejected: 0,
			});
			expect(server.received).toHaveLength(1);
			expect(await queueRows(engine)).toEqual([]);
		} finally {
			await engine.dispose();
		}
	});

	it('gate2 item 5: the discard re-pull is queued DURABLY before local state clears — a failed pull self-heals on a later scheduler drain', async () => {
		const server = createFakeWriteServer();
		server.seed(UUID_A, { id: 42, revision: 'sha256:server-r2' });
		const { state, fetch } = routedFetch(server, () => ({
			number: '1042',
			status: 'refunded', // the server truth the client must eventually reflect
			total: '99.00',
			date_created_gmt: '2026-07-10T00:00:00',
			date_modified_gmt: '2026-07-10T00:00:01',
			customer_id: 0,
			meta_data: [{ id: 1, key: '_woocommerce_pos_uuid', value: UUID_A }],
		}));
		let nowMs = 1_752_105_600_000;
		const engine = engineWith({ fetch, now: () => nowMs });
		try {
			await engine.ready;
			await insertServerBornOrder(engine, UUID_A, { wooOrderId: 42, revision: 'sha256:server-r1' });
			const receipt = await engine.write({
				collection: 'orders',
				operation: 'update',
				recordId: UUID_A,
				payload: { status: 'completed' },
			});
			await engine.sync('write-drain');
			expect(await engine.conflicts()).toHaveLength(1);

			// The immediate re-pull FAILS — pre-fix nothing durable existed and the
			// record stayed silently stale forever. Post-fix the re-pull was queued
			// as a PERSISTED scheduler task BEFORE local state cleared.
			state.failOrdersPull = true;
			await engine.resolveConflict(receipt.mutationId, 'discard');
			expect(await engine.conflicts()).toEqual([]);
			expect(await queueRows(engine)).toEqual([]);
			expect((await orderJson(engine, UUID_A))?.status).toBe('processing'); // server truth NOT yet restored
			const scope = engine.active()!;
			const tasks = (
				await (
					scope.database.collections.schedulerTaskStates as {
						find(): { exec(): Promise<{ toJSON(): Record<string, unknown> }[]> };
					}
				)
					.find()
					.exec()
			).map((doc) => doc.toJSON());
			const repullTask = tasks.find(
				(task) => task.collectionName === 'orders' && String(task.queryKey).includes(':ids:42')
			);
			expect(repullTask).toBeDefined(); // the durable re-pull survives the failure
			expect(repullTask?.status).toBe('failed'); // parked behind its retry gate, not lost

			// Server reachable again + the retry gate elapses → the ordinary
			// scheduler-drain lane completes the discard's re-pull.
			state.failOrdersPull = false;
			nowMs += 60_000;
			expect((await engine.sync('scheduler-drain')).status).toBe('ran');
			const order = await orderJson(engine, UUID_A);
			expect(order?.status).toBe('refunded'); // server truth applied
			expect(order?.local).toMatchObject({ dirty: false, pendingMutationIds: [] });
		} finally {
			await engine.dispose();
		}
	});
});

describe('require() through the public handle', () => {
	const P_UUID = (n: number) => `33333333-3333-4333-8333-${String(n).padStart(12, '0')}`;

	function productServer() {
		const pulls: number[][] = [];
		const fetch = async (url: string): Promise<Response> => {
			const u = new URL(url);
			if (!u.pathname.endsWith('/products')) throw new Error(`unexpected ${u.pathname}`);
			const include = (u.searchParams.get('include') ?? '').split(',').map(Number);
			pulls.push(include);
			return new Response(
				JSON.stringify(
					include.map((id) => ({
						id,
						_rxdb_digest: `product-digest-${id}`,
						meta_data: [{ key: '_woocommerce_pos_uuid', value: P_UUID(id) }],
						date_modified_gmt: '2026-07-10T00:00:00',
						price: '1.00',
						stock_status: 'instock',
						type: 'simple',
						categories: [],
						brands: [],
						on_sale: false,
						featured: false,
						stock_quantity: null,
					}))
				),
				{ status: 200, headers: { 'content-type': 'application/json' } }
			);
		};
		return { pulls, fetch };
	}

	it('serve-local when every record is resident; fetched when not; preemption; release', async () => {
		const server = productServer();
		const engine = engineWith({ fetch: server.fetch });
		await engine.ready;

		// Seed product 1 (via a require — also proves the fetch path end-to-end).
		const first = await engine.require({
			id: 'r1',
			collection: 'products',
			kind: 'targeted-records',
			wooIds: [1],
		}).ready;
		expect(first).toMatchObject({ action: 'fetched', missingRecordIds: [1] });
		expect(server.pulls).toEqual([[1]]);
		const scope = engine.active();
		if (!scope) throw new Error('no active scope');
		expect(
			(await scope.database.collections.existenceManifest.findOne('1').exec())?.toJSON()
		).toMatchObject({ wooId: 1, objectType: 'product', digest: 'product-digest-1' });

		// Resident → serve-local, NO fetch.
		const again = await engine.require({
			id: 'r2',
			collection: 'products',
			kind: 'targeted-records',
			wooIds: [1],
		}).ready;
		expect(again).toMatchObject({ action: 'serve-local', missingRecordIds: [] });
		expect(server.pulls).toEqual([[1]]);

		// Preemption: while a low-priority requirement is IN FLIGHT, a queued
		// high-priority one jumps the remaining queue.
		const low = engine.require({
			id: 'low',
			collection: 'products',
			kind: 'targeted-records',
			wooIds: [10],
			priority: 100,
		});
		const mid = engine.require({
			id: 'mid',
			collection: 'products',
			kind: 'targeted-records',
			wooIds: [20],
			priority: 500,
		});
		const high = engine.require({
			id: 'high',
			collection: 'products',
			kind: 'targeted-records',
			wooIds: [30],
			priority: 900,
		});
		await Promise.all([low.ready, mid.ready, high.ready]);
		// low started first (pump was idle); high preempted mid in the queue.
		expect(server.pulls).toEqual([[1], [10], [30], [20]]);

		// release(): a queued requirement demotes without fetching.
		const busy = engine.require({
			id: 'busy',
			collection: 'products',
			kind: 'targeted-records',
			wooIds: [40],
			priority: 100,
		});
		const released = engine.require({
			id: 'released',
			collection: 'products',
			kind: 'targeted-records',
			wooIds: [50],
			priority: 50,
		});
		released.release();
		const [, releasedOutcome] = await Promise.all([busy.ready, released.ready]);
		expect(releasedOutcome).toMatchObject({ action: 'released' });
		expect(server.pulls.flat()).not.toContain(50);
		await engine.dispose();
	});

	it("require('targeted-records') without ids, or on the wrong shape, is caller misuse", async () => {
		const server = productServer();
		const engine = engineWith({ fetch: server.fetch });
		await engine.ready;
		await expect(
			engine.require({ id: 'x', collection: 'products', kind: 'targeted-records' }).ready
		).rejects.toThrow(/needs wooIds/i);
		await expect(
			engine.require({ id: 'y', collection: 'categories', kind: 'targeted-records', wooIds: [1] })
				.ready
		).rejects.toThrow(/targeted collection/i);
		await engine.dispose();
	});
});

describe('telemetry redaction corpus', () => {
	it('keeps seed, drain, require, conflict, and reset event fields metadata-only', async () => {
		const events: SyncEvent[] = [];
		const server = createFakeWriteServer();
		server.script(() => ({
			kind: 'conflict' as const,
			current: null,
			currentRevision: 'sha256:server',
		}));
		const engine = engineWith({
			fetch: (url, init) => server.fetch(url, init as never),
			diagnostics: (event) => events.push(event),
		});
		await engine.ready;
		await engine.sync('order-window-seed');
		await insertBornLocalOrder(engine, UUID_A);
		await engine.write({
			collection: 'orders',
			operation: 'create',
			recordId: UUID_A,
			payload: { status: 'pos-open' },
		});
		await engine.sync('write-drain');
		await engine
			.require({ id: 'resident', collection: 'orders', kind: 'targeted-records', wooIds: [] })
			.ready.catch(() => undefined);
		await engine.scope.resetCollection('products');
		await engine.dispose();

		const forbidden = /payload|body|email|phone|address|token|authorization|password|secret/i;
		const offenders: string[] = [];
		const inspect = (value: unknown, path: string): void => {
			if (
				value === null ||
				value === undefined ||
				['string', 'number', 'boolean'].includes(typeof value)
			)
				return;
			if (Array.isArray(value)) {
				offenders.push(`${path}:array`);
				return;
			}
			if (typeof value === 'object') {
				for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
					if (forbidden.test(key)) offenders.push(`${path}.${key}`);
					if (nested !== null && typeof nested === 'object')
						offenders.push(`${path}.${key}:nested-object`);
					inspect(nested, `${path}.${key}`);
				}
			}
		};
		events.forEach((event, index) => inspect(event.fields, `${index}:${event.type}.fields`));
		expect(events.length).toBeGreaterThan(5);
		expect(offenders, offenders.join('\n')).toEqual([]);
	});
});
