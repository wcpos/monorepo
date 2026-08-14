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
	type EngineEvent,
	type EngineFetcher,
	type RxdbSyncEngine,
} from './create-rxdb-sync-engine';
import { writeFacetFor } from './collections/collection-descriptors';
import { queueFor, requeueBornTwiceSnapshot } from './write-path/write-intents';
import { createEngineHarness, memoryEngineStorage, scriptedConnectivity } from './testing';

import type { RxStorage } from 'rxdb';

setPremiumFlag();

const SITE = 'https://write.example.test';
const UUID_A = '22222222-2222-4222-8222-222222222222';
const UUID_MINT = '33333333-3333-4333-8333-333333333333';
const UUID_CLAIM = '44444444-4444-4444-8444-444444444444';
const UUID_FOLLOW_UP = '55555555-5555-4555-8555-555555555555';

let uniqueScope = 0;
function freshIdentity(): StoreScopeIdentity {
	uniqueScope += 1;
	return { site: SITE, storeId: 7, cashierId: `write-${uniqueScope}` };
}

function engineWith(input: {
	fetch: (url: string, init?: RequestInit) => Promise<Response>;
	identity?: StoreScopeIdentity;
	storage?: RxStorage<unknown, unknown>;
	connectivity?: () => 'online' | 'offline' | 'degraded';
	uuid?: () => string;
	now?: () => number;
	diagnostics?: SyncObserver;
	mode?: 'auto' | 'manual';
	writeDrainPollMs?: number;
	barcodeFields?: Record<string, string[]>;
}): RxdbSyncEngine {
	return createEngineHarness({
		site: SITE,
		identity: input.identity ?? freshIdentity(),
		...(input.storage ? { storage: input.storage } : {}),
		mode: input.mode ?? 'manual',
		fetch: input.fetch,
		now: input.now,
		diagnostics: input.diagnostics,
		connectivitySignal: input.connectivity,
		routes: {
			'/changes/config-fingerprint': {
				fingerprints: {},
				...(input.barcodeFields ? { barcode_fields: input.barcodeFields } : {}),
			},
		},
		ports: {
			...(input.uuid ? { uuid: input.uuid } : {}),
		},
		...(input.writeDrainPollMs !== undefined
			? { intervals: { writeDrainPollMs: input.writeDrainPollMs } }
			: {}),
		awaitReady: false,
	}).engine;
}

/** A resident born-local order the write path can create against. */
async function insertBornLocalOrder(
	engine: RxdbSyncEngine,
	id: string,
	payload: Record<string, unknown> = {
		status: 'pos-open',
		meta_data: [{ key: '_woocommerce_pos_uuid', value: id }],
	},
	promotedStatus = 'pending'
): Promise<void> {
	const scope = engine.active();
	if (!scope) throw new Error('no active scope');
	await (scope.database.collections.orders as { insert(doc: unknown): Promise<unknown> }).insert({
		id,
		wooOrderId: null,
		number: '',
		dateCreatedGmt: '2026-07-10T00:00:00',
		status: promotedStatus,
		total: '0.00',
		customerId: 0,
		payload,
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

/**
 * Make a stale-revision 409 OUTLIVE #1204's one automatic recovery.
 *
 * Ruled 2026-08-14: an order push that 409s re-anchors from the 409's own
 * `currentRevision` and re-pushes ONCE; only a second consecutive conflict parks
 * the row. So a test about the PARKED surface — conflicts(), resolveConflict,
 * the frozen-fetch guarantee — has to make the server disagree twice, or it is
 * quietly testing the recovery instead. After the two refusals the script steps
 * aside so a later `retry-with-server-base` can land, exactly as before.
 */
function conflictPastAutoRecovery(
	server: ReturnType<typeof createFakeWriteServer>,
	currentRevision: string,
	current: Record<string, unknown> | null = { id: 42 }
): void {
	let remaining = 2;
	server.script(() =>
		remaining-- > 0 ? { kind: 'conflict' as const, current, currentRevision } : undefined
	);
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
	const state = {
		orderPulls: [] as number[][],
		orderUrls: [] as string[],
		failOrdersPull: false,
		emptyOrdersPull: false,
	};
	const fetch = async (url: string, init?: RequestInit): Promise<Response> => {
		if (url.includes('/push/')) return server.fetch(url, init as never);
		const u = new URL(url);
		if (!u.pathname.endsWith('/orders')) throw new Error(`routedFetch: unexpected ${u.pathname}`);
		state.orderUrls.push(url);
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

const PRODUCT_ID = 501;

function productPayload(stockQuantity: number): Record<string, unknown> {
	return {
		id: PRODUCT_ID,
		name: 'Auto-revert product',
		type: 'simple',
		price: '12.50',
		stock_status: 'instock',
		stock_quantity: stockQuantity,
		categories: [],
		brands: [],
		on_sale: false,
		featured: false,
		meta_data: [{ key: '_woocommerce_pos_uuid', value: UUID_A }],
		_rxdb_revision: 'sha256:server-truth',
	};
}

async function insertServerBornProduct(
	engine: RxdbSyncEngine,
	stockQuantity: number
): Promise<void> {
	const scope = engine.active();
	if (!scope) throw new Error('no active scope');
	const facet = writeFacetFor('products');
	if (!facet) throw new Error('no products write facet');
	await facet.upsertServerDocument(
		scope.database,
		facet.documentFromServerPayload(productPayload(stockQuantity))
	);
}

async function productJson(engine: RxdbSyncEngine): Promise<Record<string, unknown> | null> {
	const scope = engine.active();
	if (!scope) throw new Error('no active scope');
	const doc = await scope.database.collections.products.findOne(UUID_A).exec();
	return doc?.toJSON() ?? null;
}

function rejectedProductFetch(options: { failPull?: boolean } = {}) {
	const pulls: number[][] = [];
	const fetch = async (url: string): Promise<Response> => {
		const parsed = new URL(url);
		if (parsed.pathname.includes('/push/')) {
			return Response.json(
				{
					code: 'woocommerce_rest_cannot_edit',
					message: 'Sorry, you are not allowed to edit this resource.',
				},
				{ status: 403 }
			);
		}
		if (!parsed.pathname.endsWith('/products')) throw new Error(`unexpected ${parsed.pathname}`);
		pulls.push(
			(parsed.searchParams.get('include') ?? '').split(',').map(Number).filter(Number.isSafeInteger)
		);
		if (options.failPull) return new Response('unavailable', { status: 503 });
		return Response.json([productPayload(9)]);
	};
	return { pulls, fetch };
}

function withAckDocument(
	server: ReturnType<typeof createFakeWriteServer>,
	mapDocument: (document: Record<string, unknown> | null) => Record<string, unknown> | null
): (url: string, init?: RequestInit) => Promise<Response> {
	return async (url, init) => {
		const response = await server.fetch(url, init as never);
		if (!url.includes('/push/') || !response.ok) return response;
		const body = (await response.json()) as {
			document?: Record<string, unknown> | null;
			currentRevision?: string | null;
		};
		return Response.json(
			{ ...body, document: mapDocument(body.document ?? null) },
			{ status: response.status }
		);
	};
}

describe('write() + sync("write-drain") through the public handle', () => {
	it('holds a non-explicit pos-open create without touching retry bookkeeping', async () => {
		const server = createFakeWriteServer();
		const events: SyncEvent[] = [];
		const engine = engineWith({
			fetch: (url, init) => server.fetch(url, init as never),
			diagnostics: (event) => events.push(event),
		});
		try {
			await engine.ready;
			await insertBornLocalOrder(engine, UUID_A, undefined, 'pos-open');
			await engine.write({
				collection: 'orders',
				operation: 'create',
				recordId: UUID_A,
				payload: { status: 'pos-open' },
			});

			expect(await engine.sync('write-drain')).toMatchObject({
				status: 'ran',
				held: 1,
				pushed: 0,
				failed: 0,
				deferred: 0,
			});
			expect(server.received).toEqual([]);
			expect(await queueRows(engine)).toHaveLength(1);
			expect((await queueRows(engine))[0]).not.toHaveProperty('attempts');
			expect((await queueRows(engine))[0]).not.toHaveProperty('nextAttemptAt');
			expect(events).toContainEqual(
				expect.objectContaining({
					type: 'engine.lane.tick',
					fields: expect.objectContaining({ lane: 'write-drain', held: 1, pushed: 0 }),
				})
			);
		} finally {
			await engine.dispose();
		}
	});

	it('replays a stale claimed non-explicit pos-open create', async () => {
		const server = createFakeWriteServer();
		const engine = engineWith({ fetch: (url, init) => server.fetch(url, init as never) });
		try {
			await engine.ready;
			await insertBornLocalOrder(engine, UUID_A, undefined, 'pos-open');
			await engine.write({
				collection: 'orders',
				operation: 'create',
				recordId: UUID_A,
				payload: { status: 'pos-open' },
			});
			const queue = queueFor(engine.active()!.database);
			const [mutation] = await queue.pending();
			expect(mutation).toBeDefined();
			expect(await queue.claim({ ...mutation!, status: 'claimed' })).toBe(true);

			expect(await engine.sync('write-drain')).toMatchObject({ held: 0, pushed: 1 });
			expect(server.received).toHaveLength(1);
		} finally {
			await engine.dispose();
		}
	});

	it('pushes an explicit pos-open create', async () => {
		const server = createFakeWriteServer();
		const engine = engineWith({ fetch: (url, init) => server.fetch(url, init as never) });
		try {
			await engine.ready;
			await insertBornLocalOrder(engine, UUID_A, undefined, 'pos-open');
			await engine.write({
				collection: 'orders',
				operation: 'create',
				recordId: UUID_A,
				payload: { status: 'pos-open' },
				explicit: true,
			} as never);

			expect(await queueRows(engine)).toEqual([
				expect.objectContaining({ explicit: true, operation: 'create' }),
			]);
			expect(await engine.sync('write-drain')).toMatchObject({ held: 0, pushed: 1 });
			expect(server.received).toHaveLength(1);
			expect(server.received[0]).not.toHaveProperty('explicit');
		} finally {
			await engine.dispose();
		}
	});

	it('releases a held mutation after the resident status leaves pos-open', async () => {
		const server = createFakeWriteServer();
		const engine = engineWith({ fetch: (url, init) => server.fetch(url, init as never) });
		try {
			await engine.ready;
			await insertBornLocalOrder(engine, UUID_A, undefined, 'pos-open');
			await engine.write({
				collection: 'orders',
				operation: 'create',
				recordId: UUID_A,
				payload: { status: 'pos-open' },
			});
			expect(await engine.sync('write-drain')).toMatchObject({ held: 1, pushed: 0 });

			const resident = await engine.active()?.database.collections.orders.findOne(UUID_A).exec();
			await resident?.incrementalModify((data: Record<string, unknown>) => ({
				...data,
				status: 'pending',
			}));

			expect(await engine.sync('write-drain')).toMatchObject({ held: 0, pushed: 1 });
			expect(server.received).toHaveLength(1);
		} finally {
			await engine.dispose();
		}
	});

	it('releases an already-attempted held chain when an explicit write queues behind it', async () => {
		const server = createFakeWriteServer();
		const engine = engineWith({ fetch: (url, init) => server.fetch(url, init as never) });
		try {
			await engine.ready;
			await insertBornLocalOrder(engine, UUID_A, undefined, 'pos-open');
			await engine.write({
				collection: 'orders',
				operation: 'create',
				recordId: UUID_A,
				payload: { status: 'pos-open' },
			});
			// An earlier attempt (e.g. pushed while released, then the cashier backed
			// out of checkout) makes the row un-coalescable — Pay's explicit write
			// must still drain the chain instead of starving behind the hold.
			const queue = queueFor(engine.active()!.database);
			const [row] = await queue.pending();
			await queue.replace({ ...row!, attempts: 1 });
			await engine.write({
				collection: 'orders',
				operation: 'update',
				recordId: UUID_A,
				payload: { customer_note: 'release me' },
				explicit: true,
			});

			expect(await engine.sync('write-drain')).toMatchObject({ held: 0, pushed: 2 });
			expect(server.received).toHaveLength(2);
		} finally {
			await engine.dispose();
		}
	});

	it('releases an already-attempted held chain when a delete queues behind it', async () => {
		const server = createFakeWriteServer();
		const engine = engineWith({ fetch: (url, init) => server.fetch(url, init as never) });
		try {
			await engine.ready;
			await insertBornLocalOrder(engine, UUID_A, undefined, 'pos-open');
			await engine.write({
				collection: 'orders',
				operation: 'create',
				recordId: UUID_A,
				payload: { status: 'pos-open' },
			});
			const queue = queueFor(engine.active()!.database);
			const [row] = await queue.pending();
			await queue.replace({ ...row!, attempts: 1 });
			// attempts > 0 blocks annihilation, so the delete queues behind the
			// create — and must release the held chain rather than wait for a
			// status transition that will never come.
			await engine.write({ collection: 'orders', operation: 'delete', recordId: UUID_A });

			expect(await engine.sync('write-drain')).toMatchObject({ held: 0, pushed: 2 });
			expect(server.received).toHaveLength(2);
			expect(await engine.active()?.database.collections.orders.findOne(UUID_A).exec()).toBeNull();
		} finally {
			await engine.dispose();
		}
	});

	it('does not hold a delete for a pos-open order', async () => {
		const server = createFakeWriteServer();
		server.seed(UUID_A, { id: 42, revision: 'sha256:base-r1' });
		const engine = engineWith({ fetch: (url, init) => server.fetch(url, init as never) });
		try {
			await engine.ready;
			await insertServerBornOrder(engine, UUID_A, {
				wooOrderId: 42,
				revision: 'sha256:base-r1',
				status: 'pos-open',
			});
			await engine.write({ collection: 'orders', operation: 'delete', recordId: UUID_A });

			expect(await engine.sync('write-drain')).toMatchObject({ held: 0, pushed: 1 });
			expect(server.received).toEqual([expect.objectContaining({ operation: 'delete' })]);
		} finally {
			await engine.dispose();
		}
	});

	it('uses the host UUID generator for mutation, drain claim, and born-twice follow-up ids', async () => {
		const server = createFakeWriteServer();
		server.seed(UUID_A, { id: 43, revision: 'sha256:existing' });
		const ids = [UUID_MINT, UUID_CLAIM, UUID_FOLLOW_UP];
		const uuid = vi.fn(() => ids.shift()!);
		const engine = engineWith({
			fetch: (url, init) => server.fetch(url, init as never),
			uuid,
		});
		try {
			await engine.ready;
			await insertBornLocalOrder(engine, UUID_A);
			const receipt = await engine.write({
				collection: 'orders',
				operation: 'create',
				recordId: UUID_A,
				payload: { status: 'pos-open' },
			});

			expect(receipt.mutationId).toBe(UUID_MINT);
			expect(await engine.sync('write-drain')).toMatchObject({ pushed: 1 });
			expect(await queueRows(engine)).toEqual([
				expect.objectContaining({ mutationId: UUID_FOLLOW_UP, operation: 'update' }),
			]);
			expect(uuid).toHaveBeenCalledTimes(3);
		} finally {
			await engine.dispose();
		}
	});

	it('exposes and forwards the full RequestInit for queued writes', async () => {
		const server = createFakeWriteServer();
		const writeRequests: RequestInit[] = [];
		const fetcher: EngineFetcher = async (url, init) => {
			if (url.includes('/push/')) writeRequests.push(init ?? {});
			return server.fetch(url, init as never);
		};
		const engine = engineWith({ fetch: fetcher });
		try {
			await engine.ready;
			await insertBornLocalOrder(engine, UUID_A);
			await engine.write({
				collection: 'orders',
				operation: 'create',
				recordId: UUID_A,
				payload: { status: 'pos-open' },
			});
			await engine.sync('write-drain');

			expect(writeRequests).toHaveLength(1);
			expect(writeRequests[0]?.method).toBe('POST');
			expect(new Headers(writeRequests[0]?.headers).get('content-type')).toBe('application/json');
			expect(JSON.parse(String(writeRequests[0]?.body))).toMatchObject({
				collection: 'orders',
				operation: 'create',
				recordId: UUID_A,
			});
		} finally {
			await engine.dispose();
		}
	});

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
				explicit: true,
			} as never);
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

	it('merges the authoritative order payload after the final create ack', async () => {
		const server = createFakeWriteServer({ firstId: 900_000_101 });
		const localPayload = {
			status: 'pos-open',
			total: '50.00',
			line_items: [{ product_id: 123, quantity: 1, total: '50.00' }],
			meta_data: [{ key: '_woocommerce_pos_uuid', value: UUID_A }],
		};
		const fetch = withAckDocument(server, (document) => ({
			...document,
			total: '52.00',
			line_items: [{ product_id: 123, quantity: 1, id: 7001, total: '52.00' }],
		}));
		const engine = engineWith({ fetch });
		try {
			await engine.ready;
			await insertBornLocalOrder(engine, UUID_A, localPayload);
			await engine.write({
				collection: 'orders',
				operation: 'create',
				recordId: UUID_A,
				payload: localPayload,
			});

			expect(await engine.sync('write-drain')).toMatchObject({ pushed: 1, rejected: 0 });
			expect(await orderJson(engine, UUID_A)).toMatchObject({
				wooOrderId: 900_000_101,
				payload: {
					total: '52.00',
					line_items: [{ product_id: 123, quantity: 1, id: 7001, total: '52.00' }],
				},
				// The promoted filter/sort columns must be recomputed from the adopted
				// payload, not left at their pre-ack values (insert seeded total '0.00').
				status: 'pos-open',
				total: '52.00',
				sync: { revision: server.applied.get(UUID_A)?.revision },
				local: { dirty: false, pendingMutationIds: [] },
			});
		} finally {
			await engine.dispose();
		}
	});

	it('preserves local POS identity meta while adopting other create-ack meta', async () => {
		const server = createFakeWriteServer({ firstId: 900_000_105 });
		const localPayload = {
			status: 'pos-open',
			meta_data: [
				{ key: '_woocommerce_pos_uuid', value: UUID_A },
				{ key: '_pos_user', value: '7' },
				{ key: '_pos_store', value: '11' },
			],
		};
		const fetch = withAckDocument(server, (document) => ({
			...document,
			meta_data: [
				{ key: '_woocommerce_pos_uuid', value: UUID_A },
				{ key: '_pos_user', value: '999' },
				{ key: 'echo_meta', value: 'adopted' },
			],
		}));
		const engine = engineWith({ fetch });
		try {
			await engine.ready;
			await insertBornLocalOrder(engine, UUID_A, localPayload);
			await engine.write({
				collection: 'orders',
				operation: 'create',
				recordId: UUID_A,
				payload: localPayload,
			});

			expect(await engine.sync('write-drain')).toMatchObject({ pushed: 1, rejected: 0 });
			const metaData = (
				(await orderJson(engine, UUID_A))?.payload as {
					meta_data?: { key: string; value: unknown }[];
				}
			).meta_data;
			expect(metaData).toEqual(
				expect.arrayContaining([
					{ key: '_pos_user', value: '7' },
					{ key: '_pos_store', value: '11' },
					{ key: 'echo_meta', value: 'adopted' },
				])
			);
		} finally {
			await engine.dispose();
		}
	});

	// #818 flipped the second half of this contract: local VALUES still win over a
	// queued successor (that part is #815 and unchanged), but the server's line
	// IDENTITY must now land on the resident — leaving it id-less is what made the
	// next update append duplicates.
	it('keeps local values but grafts server line ids when a successor is queued', async () => {
		const server = createFakeWriteServer({ firstId: 900_000_102 });
		const LINE_UUID = '55555555-5555-4555-8555-555555555555';
		const lineMeta = [{ key: '_woocommerce_pos_uuid', value: LINE_UUID }];
		const localPayload = {
			status: 'pos-open',
			total: '52.00',
			line_items: [{ product_id: 123, quantity: 1, total: '52.00', meta_data: lineMeta }],
			meta_data: [{ key: '_woocommerce_pos_uuid', value: UUID_A }],
		};
		const mappedFetch = withAckDocument(server, (document) => ({
			...document,
			total: '104.00',
			line_items: [
				{ product_id: 123, quantity: 1, id: 7002, total: '104.00', meta_data: lineMeta },
			],
		}));
		let releaseAck: (() => void) | undefined;
		let ackReceived: (() => void) | undefined;
		const release = new Promise<void>((resolve) => {
			releaseAck = resolve;
		});
		const received = new Promise<void>((resolve) => {
			ackReceived = resolve;
		});
		let firstPush = true;
		const fetch = async (url: string, init?: RequestInit): Promise<Response> => {
			const response = await mappedFetch(url, init);
			if (firstPush && url.includes('/push/')) {
				firstPush = false;
				ackReceived?.();
				await release;
			}
			return response;
		};
		const engine = engineWith({ fetch });
		try {
			await engine.ready;
			await insertBornLocalOrder(engine, UUID_A, localPayload);
			await engine.write({
				collection: 'orders',
				operation: 'create',
				recordId: UUID_A,
				payload: localPayload,
			});
			const firstDrain = engine.sync('write-drain');
			await received;
			const successor = await engine.write({
				collection: 'orders',
				operation: 'update',
				recordId: UUID_A,
				payload: localPayload,
			});
			releaseAck?.();

			expect(await firstDrain).toMatchObject({ pushed: 1, rejected: 0 });
			const order = await orderJson(engine, UUID_A);
			expect(order).toMatchObject({
				wooOrderId: 900_000_102,
				// The ack's `total: '104.00'` is NOT adopted — the queued successor owns
				// the record's values (#815).
				payload: { status: 'pos-open', total: '52.00' },
				sync: { revision: server.applied.get(UUID_A)?.revision },
				local: { dirty: true },
			});
			// …but the line now carries the server's identity alongside its local
			// values (#818), which is what every later push is built from.
			expect((order?.payload as { line_items: Record<string, unknown>[] }).line_items).toEqual([
				{ product_id: 123, quantity: 1, total: '52.00', meta_data: lineMeta, id: 7002 },
			]);
			// The queued successor is NOT rewritten: its durable row stays the honest
			// record of what the cashier intended, under its ORIGINAL mutationId (a
			// swap would strand the `awaitWriteOutcome` caller holding that receipt).
			// The id is stamped on at PUSH time instead — see the drain test below.
			expect((order?.local as { pendingMutationIds: string[] }).pendingMutationIds).toEqual([
				successor.mutationId,
			]);
			const queued = (await queueRows(engine)).filter((row) => row.operation === 'update');
			expect(queued).toHaveLength(1);
			expect(queued[0]).toMatchObject({ mutationId: successor.mutationId });
		} finally {
			releaseAck?.();
			await engine.dispose();
		}
	});

	it('grafts server line identity onto a successor queued behind an IN-FLIGHT create (#818)', async () => {
		const server = createFakeWriteServer({ firstId: 900_000_106 });
		const LINE_UUID = '44444444-4444-4444-8444-444444444444';
		const line = (over: Record<string, unknown>): Record<string, unknown> => ({
			product_id: 123,
			quantity: 1,
			total: '52.00',
			meta_data: [{ key: '_woocommerce_pos_uuid', value: LINE_UUID }],
			...over,
		});
		const localPayload = {
			status: 'pos-open',
			total: '52.00',
			line_items: [line({})],
			meta_data: [{ key: '_woocommerce_pos_uuid', value: UUID_A }],
		};
		// Woo assigns every CREATED line an id and echoes the POS line uuid meta back.
		const mappedFetch = withAckDocument(server, (document) => ({
			...document,
			line_items: (((document ?? {}).line_items ?? []) as Record<string, unknown>[]).map(
				(item, index) => ({ ...item, id: 7100 + index })
			),
		}));
		let releaseAck: (() => void) | undefined;
		let ackReceived: (() => void) | undefined;
		const release = new Promise<void>((resolve) => {
			releaseAck = resolve;
		});
		const received = new Promise<void>((resolve) => {
			ackReceived = resolve;
		});
		let firstPush = true;
		const fetch = async (url: string, init?: RequestInit): Promise<Response> => {
			const response = await mappedFetch(url, init);
			if (firstPush && url.includes('/push/')) {
				firstPush = false;
				ackReceived?.();
				await release;
			}
			return response;
		};
		const engine = engineWith({ fetch });
		const events: EngineEvent[] = [];
		try {
			await engine.ready;
			engine.events((event) => events.push(event));
			await insertBornLocalOrder(engine, UUID_A, localPayload);
			await engine.write({
				collection: 'orders',
				operation: 'create',
				recordId: UUID_A,
				payload: localPayload,
			});
			const firstDrain = engine.sync('write-drain');
			await received;
			// The cashier bumps the quantity while the create is STILL IN FLIGHT: the
			// successor's frozen snapshot carries the pre-create, id-less line item.
			const successor = await engine.write({
				collection: 'orders',
				operation: 'update',
				recordId: UUID_A,
				payload: {
					...localPayload,
					total: '104.00',
					line_items: [line({ quantity: 2, total: '104.00' })],
				},
			});
			releaseAck?.();
			expect(await firstDrain).toMatchObject({ pushed: 1, rejected: 0 });

			// The resident keeps its LOCAL field values (adoption is still skipped — a
			// successor is pending) but gains the server's line identity.
			const resident = (await orderJson(engine, UUID_A))?.payload as {
				total?: string;
				line_items?: Record<string, unknown>[];
			};
			expect(resident.total).toBe('52.00');
			expect(resident.line_items).toHaveLength(1);
			expect(resident.line_items?.[0]).toMatchObject({ id: 7100, quantity: 1 });

			// …and the queued successor pushes WITH that identity, so Woo updates the
			// existing line instead of APPENDING a second one (duplicated money).
			expect(await engine.sync('write-drain')).toMatchObject({ pushed: 1, rejected: 0 });
			const update = server.received.find((envelope) => envelope.operation === 'update');
			const pushedLines = (update?.payload as { line_items?: Record<string, unknown>[] })
				?.line_items;
			expect(pushedLines).toHaveLength(1);
			expect(pushedLines?.[0]).toMatchObject({ id: 7100, product_id: 123, quantity: 2 });
			// The successor keeps its receipt identity end to end, so a caller sitting
			// in `awaitWriteOutcome(receipt.mutationId)` still settles.
			expect(events).toContainEqual(
				expect.objectContaining({
					type: 'write-acknowledged',
					mutationId: successor.mutationId,
				})
			);
		} finally {
			releaseAck?.();
			await engine.dispose();
		}
	});

	it('keeps bookkeeping-only ack behavior when the server document is null', async () => {
		const localPayload = {
			status: 'pos-open',
			total: '52.00',
			line_items: [{ product_id: 123, quantity: 1, total: '52.00' }],
			meta_data: [{ key: '_woocommerce_pos_uuid', value: UUID_A }],
		};
		const engine = engineWith({ fetch: async () => Response.json({}) });
		try {
			await engine.ready;
			await insertBornLocalOrder(engine, UUID_A, localPayload);
			const facet = writeFacetFor('orders');
			if (!facet) throw new Error('orders write facet is missing');
			const scope = engine.active();
			if (!scope) throw new Error('no active scope');
			const resident = await scope.database.collections.orders.findOne(UUID_A).exec();
			await resident?.incrementalModify((data: Record<string, unknown>) => ({
				...data,
				local: { dirty: true, pendingMutationIds: ['mutation-null-document'] },
			}));
			await facet.reconcile(scope.database, {
				mutation: {
					mutationId: 'mutation-null-document',
					operation: 'create',
					recordId: UUID_A,
				},
				recordId: UUID_A,
				remoteId: 900_000_103,
				currentRevision: 'sha256:null-document',
				document: null,
			});

			expect(await orderJson(engine, UUID_A)).toMatchObject({
				wooOrderId: 900_000_103,
				payload: localPayload,
				sync: { revision: 'sha256:null-document' },
				local: { dirty: false, pendingMutationIds: [] },
			});
		} finally {
			await engine.dispose();
		}
	});

	it('acks cleanly WITHOUT adoption when the ack document is not materializable', async () => {
		const server = createFakeWriteServer({ firstId: 900_000_104 });
		const localPayload = {
			status: 'pos-open',
			total: '52.00',
			line_items: [{ product_id: 123, quantity: 1, total: '52.00' }],
			meta_data: [{ key: '_woocommerce_pos_uuid', value: UUID_A }],
		};
		// The write contract allows a trimmed ack document — a bare `{ id }` with no
		// uuid meta must NOT turn a successful push into a failed (replaying) ack.
		const fetch = withAckDocument(server, (document) => ({
			id: (document as { id?: unknown }).id,
		}));
		const engine = engineWith({ fetch });
		try {
			await engine.ready;
			await insertBornLocalOrder(engine, UUID_A, localPayload);
			await engine.write({
				collection: 'orders',
				operation: 'create',
				recordId: UUID_A,
				payload: localPayload,
			});

			expect(await engine.sync('write-drain')).toMatchObject({ pushed: 1, rejected: 0 });
			expect(await orderJson(engine, UUID_A)).toMatchObject({
				wooOrderId: 900_000_104,
				payload: localPayload,
				sync: { revision: server.applied.get(UUID_A)?.revision },
				local: { dirty: false, pendingMutationIds: [] },
			});
		} finally {
			await engine.dispose();
		}
	});

	it('does NOT adopt the born-twice ack document over the local edit it discarded', async () => {
		const server = createFakeWriteServer();
		// The EXISTING server record the born-twice guard will match (and return).
		server.seed(UUID_A, {
			id: 42,
			revision: 'sha256:existing-r1',
			payload: { status: 'processing', total: '10.00' },
		});
		const localPayload = {
			status: 'pos-open',
			total: '52.00',
			line_items: [{ product_id: 123, quantity: 1, total: '52.00' }],
			meta_data: [{ key: '_woocommerce_pos_uuid', value: UUID_A }],
		};
		const engine = engineWith({ fetch: server.fetch });
		try {
			await engine.ready;
			await insertBornLocalOrder(engine, UUID_A, localPayload);
			await engine.write({
				collection: 'orders',
				operation: 'create',
				recordId: UUID_A,
				payload: localPayload,
			});

			// First drain: the create answers 200 — the pushed payload was DISCARDED
			// and re-landed as a follow-up update. The resident must keep the local
			// edit, not adopt the stale existing server document.
			expect(await engine.sync('write-drain')).toMatchObject({ pushed: 1, rejected: 0 });
			const afterBornTwice = await orderJson(engine, UUID_A);
			expect(afterBornTwice).toMatchObject({
				wooOrderId: 42,
				payload: localPayload,
				local: { dirty: true },
			});
			expect(
				(afterBornTwice?.local as { pendingMutationIds: string[] }).pendingMutationIds
			).toHaveLength(1);

			// Second drain: the follow-up update lands the edit; ITS ack adopts.
			expect(await engine.sync('write-drain')).toMatchObject({ pushed: 1, rejected: 0 });
			expect(await orderJson(engine, UUID_A)).toMatchObject({
				payload: { status: 'pos-open', total: '52.00' },
				total: '52.00',
				sync: { revision: server.applied.get(UUID_A)?.revision },
				local: { dirty: false, pendingMutationIds: [] },
			});
		} finally {
			await engine.dispose();
		}
	});

	it('grafts server line ids onto the BORN-TWICE follow-up snapshot (#818)', async () => {
		const server = createFakeWriteServer();
		const LINE_UUID = '66666666-6666-4666-8666-666666666666';
		const lineMeta = [{ key: '_woocommerce_pos_uuid', value: LINE_UUID }];
		// The EXISTING server record the born-twice guard matches — its line already
		// has a server id, and carries the uuid this client minted for it.
		server.seed(UUID_A, {
			id: 42,
			revision: 'sha256:existing-r1',
			payload: {
				status: 'processing',
				total: '10.00',
				line_items: [
					{ id: 501, product_id: 123, quantity: 1, total: '10.00', meta_data: lineMeta },
				],
			},
		});
		const localPayload = {
			status: 'pos-open',
			total: '52.00',
			// The DISCARDED create snapshot: same line, no server id.
			line_items: [{ product_id: 123, quantity: 2, total: '52.00', meta_data: lineMeta }],
			meta_data: [{ key: '_woocommerce_pos_uuid', value: UUID_A }],
		};
		const engine = engineWith({ fetch: server.fetch });
		try {
			await engine.ready;
			await insertBornLocalOrder(engine, UUID_A, localPayload);
			await engine.write({
				collection: 'orders',
				operation: 'create',
				recordId: UUID_A,
				payload: localPayload,
			});

			// First drain: HTTP 200 — the payload was discarded and re-landed as a
			// follow-up update. That follow-up is rebuilt from the ID-LESS create
			// snapshot, so without the graft it would APPEND a duplicate line.
			expect(await engine.sync('write-drain')).toMatchObject({ pushed: 1, rejected: 0 });
			expect(await engine.sync('write-drain')).toMatchObject({ pushed: 1, rejected: 0 });

			const update = server.received.find((envelope) => envelope.operation === 'update');
			const pushedLines = (update?.payload as { line_items?: Record<string, unknown>[] })
				?.line_items;
			expect(pushedLines).toHaveLength(1);
			expect(pushedLines?.[0]).toMatchObject({ id: 501, quantity: 2, total: '52.00' });
		} finally {
			await engine.dispose();
		}
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

	it('auto-reverts a rejected catalog mutation to server truth without a pull lane', async () => {
		const route = rejectedProductFetch();
		const diagnostics: SyncEvent[] = [];
		const engine = engineWith({
			fetch: route.fetch,
			diagnostics: (event) => diagnostics.push(event),
		});
		try {
			await engine.ready;
			await insertServerBornProduct(engine, 2);
			const receipt = await engine.write({
				collection: 'products',
				operation: 'update',
				recordId: UUID_A,
				payload: productPayload(2),
			});

			expect(await engine.sync('write-drain')).toMatchObject({ rejected: 1 });
			await vi.waitFor(async () => {
				expect((await productJson(engine))?.stockQuantity).toBe(9);
				expect(await engine.conflicts()).toEqual([]);
			});
			expect(route.pulls).toEqual([[PRODUCT_ID]]);
			expect(diagnostics).toContainEqual(
				expect.objectContaining({
					type: 'queue.write.auto-reverted',
					level: 'error',
					collection: 'products',
					fields: expect.objectContaining({
						recordId: UUID_A,
						mutationId: receipt.mutationId,
						status: 403,
						reason: 'woocommerce_rest_cannot_edit',
						// The WP-localized sentence the cashier sees — not the machine code.
						serverMessage: 'Sorry, you are not allowed to edit this resource.',
					}),
				})
			);
		} finally {
			await engine.dispose();
		}
	});

	it('adopts the update ack document so server-derived catalog fields land at ack time', async () => {
		// The cashier zeroes stock_quantity; WooCommerce recomputes stock_status
		// server-side and returns it in the push ack envelope. The resident (and
		// its promoted grid/filter columns) must learn that at ack time — the ack
		// re-anchors sync.revision, so the pull plane will treat the row as
		// current and a dropped ack document leaves stock_status stale locally.
		const ackDocument = {
			...productPayload(0),
			stock_status: 'outofstock',
			date_modified_gmt: '2026-08-14T16:25:08',
		};
		const engine = engineWith({
			fetch: async (url) => {
				const parsed = new URL(url);
				if (!parsed.pathname.includes('/push/')) throw new Error(`unexpected ${parsed.pathname}`);
				return Response.json({
					document: ackDocument,
					currentRevision: 'sha256:after-stock-edit',
				});
			},
		});
		try {
			await engine.ready;
			await insertServerBornProduct(engine, 1);
			await engine.write({
				collection: 'products',
				operation: 'update',
				recordId: UUID_A,
				payload: { ...productPayload(1), stock_quantity: 0 },
			});

			expect(await engine.sync('write-drain')).toMatchObject({ pushed: 1, rejected: 0 });
			const row = await productJson(engine);
			expect((row?.payload as Record<string, unknown>).stock_status).toBe('outofstock');
			expect((row?.payload as Record<string, unknown>).date_modified_gmt).toBe(
				'2026-08-14T16:25:08'
			);
			expect(row?.stockStatus).toBe('outofstock');
			expect(row?.sync).toMatchObject({ revision: 'sha256:after-stock-edit' });
			expect(row?.local).toMatchObject({ dirty: false, pendingMutationIds: [] });
		} finally {
			await engine.dispose();
		}
	});

	it('adopts the update ack document for variations too', async () => {
		const VARIATION_ID = 601;
		const variationPayload = (stockQuantity: number): Record<string, unknown> => ({
			id: VARIATION_ID,
			parent_id: 50,
			sku: 'VAR-1',
			price: '4.20',
			stock_status: 'instock',
			stock_quantity: stockQuantity,
			attributes: [],
			meta_data: [{ key: '_woocommerce_pos_uuid', value: UUID_FOLLOW_UP }],
		});
		const engine = engineWith({
			fetch: async (url) => {
				const parsed = new URL(url);
				if (!parsed.pathname.includes('/push/')) throw new Error(`unexpected ${parsed.pathname}`);
				return Response.json({
					document: { ...variationPayload(0), stock_status: 'outofstock' },
					currentRevision: 'sha256:variation-after-stock-edit',
				});
			},
		});
		try {
			await engine.ready;
			const scope = engine.active();
			if (!scope) throw new Error('no active scope');
			const facet = writeFacetFor('variations');
			if (!facet) throw new Error('no variations write facet');
			await facet.upsertServerDocument(
				scope.database,
				facet.documentFromServerPayload(variationPayload(1))
			);
			await engine.write({
				collection: 'variations',
				operation: 'update',
				recordId: UUID_FOLLOW_UP,
				payload: { ...variationPayload(1), stock_quantity: 0 },
			});

			expect(await engine.sync('write-drain')).toMatchObject({ pushed: 1, rejected: 0 });
			const doc = await scope.database.collections.variations.findOne(UUID_FOLLOW_UP).exec();
			const row = doc?.toJSON() as Record<string, unknown>;
			expect((row.payload as Record<string, unknown>).stock_status).toBe('outofstock');
			expect(row.stockStatus).toBe('outofstock');
			expect(row.parentId).toBe(50);
			expect(row.sync).toMatchObject({ revision: 'sha256:variation-after-stock-edit' });
		} finally {
			await engine.dispose();
		}
	});

	it('ack adoption derives payload.barcode by the scope carriers in force', async () => {
		// The adoption re-materializes the payload; without the scope's live
		// selectors on the ack that projection would drop the stored barcode.
		const ackDocument = {
			...productPayload(0),
			sku: 'BAR-42',
			stock_status: 'outofstock',
		};
		const engine = engineWith({
			barcodeFields: { products: ['sku'], variations: ['sku'] },
			fetch: async (url) => {
				const parsed = new URL(url);
				if (!parsed.pathname.includes('/push/')) throw new Error(`unexpected ${parsed.pathname}`);
				return Response.json({
					document: ackDocument,
					currentRevision: 'sha256:barcode-carriers',
				});
			},
		});
		try {
			await engine.ready;
			await insertServerBornProduct(engine, 1);
			await engine.write({
				collection: 'products',
				operation: 'update',
				recordId: UUID_A,
				payload: { ...productPayload(1), sku: 'BAR-42', stock_quantity: 0 },
			});

			expect(await engine.sync('write-drain')).toMatchObject({ pushed: 1, rejected: 0 });
			const row = await productJson(engine);
			expect((row?.payload as Record<string, unknown>).barcode).toBe('BAR-42');
			expect((row?.payload as Record<string, unknown>).stock_status).toBe('outofstock');
		} finally {
			await engine.dispose();
		}
	});

	it('adopts the update ack document for customers', async () => {
		const CUSTOMER_ID = 701;
		const customerPayload = (email: string): Record<string, unknown> => ({
			id: CUSTOMER_ID,
			email,
			first_name: 'Pat',
			last_name: 'Probe',
			role: 'customer',
			date_modified_gmt: '2026-08-01T00:00:00',
			meta_data: [{ key: '_woocommerce_pos_uuid', value: UUID_CLAIM }],
		});
		const engine = engineWith({
			fetch: async (url) => {
				const parsed = new URL(url);
				if (!parsed.pathname.includes('/push/')) throw new Error(`unexpected ${parsed.pathname}`);
				// The server normalizes the email and bumps date_modified.
				return Response.json({
					document: {
						...customerPayload('pat@example.test'),
						date_modified_gmt: '2026-08-14T17:00:00',
					},
					currentRevision: 'sha256:customer-after-edit',
				});
			},
		});
		try {
			await engine.ready;
			const scope = engine.active();
			if (!scope) throw new Error('no active scope');
			const facet = writeFacetFor('customers');
			if (!facet) throw new Error('no customers write facet');
			await facet.upsertServerDocument(
				scope.database,
				facet.documentFromServerPayload(customerPayload('old@example.test'))
			);
			await engine.write({
				collection: 'customers',
				operation: 'update',
				recordId: UUID_CLAIM,
				payload: { ...customerPayload('old@example.test'), email: 'PAT@Example.Test' },
			});

			expect(await engine.sync('write-drain')).toMatchObject({ pushed: 1, rejected: 0 });
			const doc = await scope.database.collections.customers.findOne(UUID_CLAIM).exec();
			const row = doc?.toJSON() as Record<string, unknown>;
			expect((row.payload as Record<string, unknown>).email).toBe('pat@example.test');
			expect((row.payload as Record<string, unknown>).date_modified_gmt).toBe(
				'2026-08-14T17:00:00'
			);
			expect(row.wooCustomerId).toBe(CUSTOMER_ID);
			expect(row.sync).toMatchObject({ revision: 'sha256:customer-after-edit' });
		} finally {
			await engine.dispose();
		}
	});

	it('adopts the update ack document for coupons (server-normalized code, usage_count)', async () => {
		const COUPON_ID = 801;
		const couponPayload = (code: string, usageCount: number): Record<string, unknown> => ({
			id: COUPON_ID,
			code,
			amount: '10.00',
			usage_count: usageCount,
			meta_data: [{ key: '_woocommerce_pos_uuid', value: UUID_MINT }],
		});
		const engine = engineWith({
			fetch: async (url) => {
				const parsed = new URL(url);
				if (!parsed.pathname.includes('/push/')) throw new Error(`unexpected ${parsed.pathname}`);
				// Woo lowercases coupon codes and owns usage_count.
				return Response.json({
					document: couponPayload('summer10', 3),
					currentRevision: 'sha256:coupon-after-edit',
				});
			},
		});
		try {
			await engine.ready;
			const scope = engine.active();
			if (!scope) throw new Error('no active scope');
			const facet = writeFacetFor('coupons');
			if (!facet) throw new Error('no coupons write facet');
			await facet.upsertServerDocument(
				scope.database,
				facet.documentFromServerPayload(couponPayload('OLD10', 0))
			);
			await engine.write({
				collection: 'coupons',
				operation: 'update',
				recordId: UUID_MINT,
				payload: { ...couponPayload('SUMMER10', 0) },
			});

			expect(await engine.sync('write-drain')).toMatchObject({ pushed: 1, rejected: 0 });
			const doc = await scope.database.collections.coupons.findOne(UUID_MINT).exec();
			const row = doc?.toJSON() as Record<string, unknown>;
			expect((row.payload as Record<string, unknown>).code).toBe('summer10');
			expect((row.payload as Record<string, unknown>).usage_count).toBe(3);
			expect(row.sync).toMatchObject({ revision: 'sha256:coupon-after-edit' });
		} finally {
			await engine.dispose();
		}
	});

	it('never auto-reverts a rejected order mutation', async () => {
		const server = createFakeWriteServer();
		server.seed(UUID_A, { id: 42, revision: 'sha256:server-r1' });
		server.script(() => ({ kind: 'cannot_delete' }));
		const { state, fetch } = routedFetch(server, () => ({ status: 'on-hold' }));
		const diagnostics: SyncEvent[] = [];
		const engine = engineWith({ fetch, diagnostics: (event) => diagnostics.push(event) });
		try {
			await engine.ready;
			await insertServerBornOrder(engine, UUID_A, {
				wooOrderId: 42,
				revision: 'sha256:server-r1',
			});
			const receipt = await engine.write({
				collection: 'orders',
				operation: 'update',
				recordId: UUID_A,
				payload: { status: 'completed' },
			});

			expect(await engine.sync('write-drain')).toMatchObject({ rejected: 1 });
			expect(await engine.conflicts()).toEqual([
				expect.objectContaining({ mutationId: receipt.mutationId, status: 'rejected' }),
			]);
			expect(state.orderPulls).toEqual([]);
			expect(diagnostics.some((event) => event.type === 'queue.write.auto-reverted')).toBe(false);
		} finally {
			await engine.dispose();
		}
	});

	it('leaves a rejected catalog mutation parked when the auto-revert fetch fails', async () => {
		const route = rejectedProductFetch({ failPull: true });
		const diagnostics: SyncEvent[] = [];
		const engine = engineWith({
			fetch: route.fetch,
			diagnostics: (event) => diagnostics.push(event),
		});
		try {
			await engine.ready;
			await insertServerBornProduct(engine, 2);
			const receipt = await engine.write({
				collection: 'products',
				operation: 'update',
				recordId: UUID_A,
				payload: productPayload(2),
			});

			expect(await engine.sync('write-drain')).toMatchObject({ rejected: 1 });
			await vi.waitFor(() => expect(route.pulls).toEqual([[PRODUCT_ID]]));
			expect(await engine.conflicts()).toEqual([
				expect.objectContaining({ mutationId: receipt.mutationId, status: 'rejected' }),
			]);
			expect((await productJson(engine))?.stockQuantity).toBe(2);
			expect(diagnostics.some((event) => event.type === 'queue.write.auto-reverted')).toBe(false);
		} finally {
			await engine.dispose();
		}
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
		const flakyFetch = async (url: string, init?: RequestInit): Promise<Response> => {
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
			engine.write({ collection: 'tags', operation: 'create', recordId: 'x', payload: {} })
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
		const fetch = async (url: string, init?: RequestInit): Promise<Response> => {
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
		conflictPastAutoRecovery(server, 'sha256:server-r2');
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
		conflictPastAutoRecovery(server, 'sha256:server-r2');
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

	it('regression 4: a rejected mutation frees the record — a pull applies server truth; the dead letter resolves by a rebuilt requeue or discard', async () => {
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

			// A rejected row can never re-pend its OWN payload: the server already
			// refused that exact intent, so a fresher base changes nothing.
			await expect(
				engine.resolveConflict(receipt.mutationId, 'retry-with-server-base')
			).rejects.toThrow(/discarded or requeued/i);
			// It CAN be requeued (#832): the payload is rebuilt from the current
			// resident and queued under a fresh mutationId with provenance.
			await engine.resolveConflict(receipt.mutationId, 'requeue-rebuilt');
			expect(await engine.conflicts()).toEqual([]);
			const [requeued] = await queueRows(engine);
			expect(requeued).toMatchObject({
				status: 'pending',
				requeuedFrom: receipt.mutationId,
				requeueCount: 1,
			});
			// …and discard still settles a dead letter — re-reject the requeued row to prove it.
			server.script(() => ({ kind: 'identity_ambiguous' as const }));
			expect(await engine.sync('write-drain')).toMatchObject({ status: 'ran', rejected: 1 });
			const [deadAgain] = await engine.conflicts();
			expect(deadAgain).toMatchObject({ status: 'rejected', requeueCount: 1 });
			await engine.resolveConflict(deadAgain.mutationId, 'discard');
			expect(await engine.conflicts()).toEqual([]);
		} finally {
			await engine.dispose();
		}
	});

	/**
	 * #832 — dead-letter recovery. A permanently-rejected CREATE is a completed
	 * sale that lives ONLY on this device: the server never saw it, and every
	 * later update 404s. Recovery must REBUILD the payload from the record as it
	 * stands now, through the same enqueue pipeline a normal write uses — a
	 * replay of the frozen snapshot earns the identical 4xx forever.
	 */
	it('#832: requeue-rebuilt recovers a dead-lettered create from the CURRENT resident through outbound sanitization', async () => {
		const server = createFakeWriteServer();
		// The wc/v3 schema refusals that stranded guest checkouts before #786: an
		// EMPTY billing email, and a non-string meta display_value.
		server.script((env) => {
			const payload = (env.payload ?? {}) as Record<string, unknown>;
			const billing = payload.billing as { email?: unknown } | undefined;
			if (billing?.email === '') {
				return {
					kind: 'invalid_param' as const,
					code: 'rest_invalid_email',
					message: 'Invalid parameter(s): billing',
				};
			}
			const meta = payload.meta_data;
			if (
				Array.isArray(meta) &&
				meta.some(
					(entry) =>
						typeof entry === 'object' &&
						entry !== null &&
						'display_value' in entry &&
						typeof (entry as { display_value?: unknown }).display_value !== 'string'
				)
			) {
				return {
					kind: 'invalid_param' as const,
					code: 'rest_invalid_param',
					message: 'Invalid parameter(s): meta_data',
				};
			}
			return undefined;
		});
		const engine = engineWith({ fetch: (url, init) => server.fetch(url, init as never) });
		try {
			await engine.ready;
			// The order as it stands on this device TODAY: a guest sale (email stored
			// locally as ''), edited to 25.00 after the create was rejected.
			await insertBornLocalOrder(engine, UUID_A, {
				status: 'pos-paid',
				total: '25.00',
				billing: { first_name: 'Guest', email: '' },
				meta_data: [{ key: '_woocommerce_pos_uuid', value: UUID_A }],
			});
			// A dead letter frozen by an OLD build: the pre-sanitizer payload, at the
			// total the order had back then. This is what dev-next still carries.
			const scope = engine.active();
			if (!scope) throw new Error('no active scope');
			const queue = queueFor(scope.database);
			const stale = await queue.enqueue({
				mutationId: 'stranded-create',
				collectionName: 'orders',
				operation: 'create',
				recordId: UUID_A,
				origin: 'minted',
				payload: {
					status: 'pos-paid',
					total: '10.00',
					billing: { first_name: 'Guest', email: '' },
					meta_data: [
						{ key: '_woocommerce_pos_uuid', value: UUID_A },
						{ key: '_pos_display', value: 'x', display_value: { amount: 1 } },
					],
				},
				baseRevision: null,
				queuedAt: '2026-01-05T00:00:00.000Z',
			});
			await queue.replace({
				...stale,
				status: 'rejected',
				rejectedStatus: 400,
				rejectedReason: 'rest_invalid_email',
				rejectedMessage: 'Invalid parameter(s): billing',
				rejectedAt: '2026-01-05T00:00:01.000Z',
			});
			expect(await engine.conflicts()).toHaveLength(1);

			await engine.resolveConflict('stranded-create', 'requeue-rebuilt');

			// The dead letter is retired and replaced by ONE pending row under a FRESH
			// mutationId carrying provenance — the server replays by mutationId, so a
			// rebuilt payload can never reuse the rejected one's id.
			expect(await engine.conflicts()).toEqual([]);
			const [requeued] = await queueRows(engine);
			expect(requeued).toMatchObject({
				status: 'pending',
				operation: 'create',
				requeuedFrom: 'stranded-create',
				requeueCount: 1,
			});
			expect(requeued.mutationId).not.toBe('stranded-create');
			// Requeuing the same dead letter twice never yields two live rows — the
			// second resolution finds it already settled and refuses.
			await expect(engine.resolveConflict('stranded-create', 'requeue-rebuilt')).rejects.toThrow();
			expect(await queueRows(engine)).toHaveLength(1);

			expect(await engine.sync('write-drain')).toMatchObject({
				status: 'ran',
				pushed: 1,
				rejected: 0,
			});
			// REBUILT, not replayed: the envelope carries the CURRENT resident's total,
			// and the enqueue pipeline's sanitizers removed both fields the server
			// refuses — neither of which the frozen snapshot had lost.
			expect(server.received).toHaveLength(1);
			const sent = server.received[0].payload as Record<string, unknown>;
			expect(sent.total).toBe('25.00');
			expect(sent.billing).toEqual({ first_name: 'Guest' });
			expect(sent.meta_data).toEqual([{ key: '_woocommerce_pos_uuid', value: UUID_A }]);
			// The sale is finally on the server, reconciled onto the resident record.
			const order = await orderJson(engine, UUID_A);
			expect(order?.wooOrderId).toBe(500);
			expect(order?.local).toMatchObject({ dirty: false, pendingMutationIds: [] });
			expect(await queueRows(engine)).toEqual([]);
		} finally {
			await engine.dispose();
		}
	});

	it('#832: a dead letter records the server verdict, and requeue → reject → requeue keeps working with a rising count', async () => {
		const server = createFakeWriteServer();
		let refuse = true;
		server.script(() =>
			refuse
				? {
						kind: 'invalid_param' as const,
						code: 'rest_invalid_param',
						message: 'Invalid parameter(s): line_items',
					}
				: undefined
		);
		const engine = engineWith({ fetch: (url, init) => server.fetch(url, init as never) });
		try {
			await engine.ready;
			await insertBornLocalOrder(engine, UUID_A, {
				status: 'pos-paid',
				total: '25.00',
				meta_data: [{ key: '_woocommerce_pos_uuid', value: UUID_A }],
			});
			await engine.write({
				collection: 'orders',
				operation: 'create',
				recordId: UUID_A,
				payload: { status: 'pos-paid' },
			});
			expect(await engine.sync('write-drain')).toMatchObject({ status: 'ran', rejected: 1 });

			// The WHY is persisted on the row, not only in a long-gone event.
			const [dead] = await engine.conflicts();
			expect(dead).toMatchObject({
				status: 'rejected',
				rejectedStatus: 400,
				rejectedReason: 'rest_invalid_param',
				rejectedMessage: 'Invalid parameter(s): line_items',
			});
			expect(typeof dead.rejectedAt).toBe('string');

			// Requeue #1 — the server has not been fixed, so it dead-letters again…
			await engine.resolveConflict(dead.mutationId, 'requeue-rebuilt');
			expect(await engine.sync('write-drain')).toMatchObject({ status: 'ran', rejected: 1 });
			const [deadAgain] = await engine.conflicts();
			// …and stays requeue-able, carrying how many recoveries it has survived.
			expect(deadAgain).toMatchObject({
				status: 'rejected',
				requeuedFrom: dead.mutationId,
				requeueCount: 1,
			});

			// Requeue #2, against a server that now accepts the payload.
			await engine.resolveConflict(deadAgain.mutationId, 'requeue-rebuilt');
			const [pending] = await queueRows(engine);
			expect(pending).toMatchObject({ status: 'pending', requeueCount: 2 });
			refuse = false;
			expect(await engine.sync('write-drain')).toMatchObject({ status: 'ran', pushed: 1 });
			expect(await engine.conflicts()).toEqual([]);
			expect((await orderJson(engine, UUID_A))?.wooOrderId).toBe(500);
		} finally {
			await engine.dispose();
		}
	});

	it('#832: requeue refuses a non-rejected row, and a dead letter whose record is gone (discard is then the honest answer)', async () => {
		const server = createFakeWriteServer();
		server.seed(UUID_A, { id: 42, revision: 'sha256:server-r2' });
		conflictPastAutoRecovery(server, 'sha256:server-r2');
		const { fetch } = routedFetch(server, () => ({
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
			// A 409 stale-revision row is CONFLICTED, not rejected: its intent was
			// never refused, so rebuilding it would discard the server's truth.
			await insertServerBornOrder(engine, UUID_A, { wooOrderId: 42, revision: 'sha256:server-r1' });
			const conflicted = await engine.write({
				collection: 'orders',
				operation: 'update',
				recordId: UUID_A,
				payload: { status: 'completed' },
			});
			await engine.sync('write-drain');
			expect(await engine.conflicts()).toHaveLength(1);
			await expect(
				engine.resolveConflict(conflicted.mutationId, 'requeue-rebuilt')
			).rejects.toThrow(/only to rejected mutations/i);
			await engine.resolveConflict(conflicted.mutationId, 'discard');

			// A dead letter whose resident was removed locally has nothing left to
			// rebuild from — requeue THROWS and leaves the row listed.
			const scope = engine.active();
			if (!scope) throw new Error('no active scope');
			const queue = queueFor(scope.database);
			const orphan = await queue.enqueue({
				mutationId: 'orphan-create',
				collectionName: 'orders',
				operation: 'create',
				recordId: UUID_MINT,
				origin: 'minted',
				payload: { status: 'pos-paid' },
				baseRevision: null,
				queuedAt: '2026-01-05T00:00:00.000Z',
			});
			await queue.replace({ ...orphan, status: 'rejected', rejectedStatus: 400 });
			await expect(engine.resolveConflict('orphan-create', 'requeue-rebuilt')).rejects.toThrow(
				/no longer on this device/i
			);
			expect((await engine.conflicts()).map((row) => row.mutationId)).toEqual(['orphan-create']);
		} finally {
			await engine.dispose();
		}
	});

	it('#832: a queued delete supersedes a dead letter — requeue refuses rather than cancelling the deletion', async () => {
		const server = createFakeWriteServer();
		server.seed(UUID_A, { id: 42, revision: 'sha256:server-r1' });
		const engine = engineWith({ fetch: (url, init) => server.fetch(url, init as never) });
		try {
			await engine.ready;
			await insertServerBornOrder(engine, UUID_A, { wooOrderId: 42, revision: 'sha256:server-r1' });
			const scope = engine.active();
			if (!scope) throw new Error('no active scope');
			const queue = queueFor(scope.database);
			const stale = await queue.enqueue({
				mutationId: 'refused-update',
				collectionName: 'orders',
				operation: 'update',
				recordId: UUID_A,
				origin: 'existing',
				payload: { status: 'completed' },
				baseRevision: 'sha256:server-r1',
				queuedAt: '2026-01-05T00:00:00.000Z',
			});
			await queue.replace({ ...stale, status: 'rejected', rejectedStatus: 400 });
			// The cashier has since asked for the order to go away. That is the NEWER
			// intent; recovering the old one would coalesce into it and silently
			// replace the delete with an update.
			await engine.write({ collection: 'orders', operation: 'delete', recordId: UUID_A });

			await expect(engine.resolveConflict('refused-update', 'requeue-rebuilt')).rejects.toThrow(
				/queued for deletion/i
			);
			// Nothing moved: the delete is intact and the dead letter is still listed.
			const rows = await queueRows(engine);
			expect(rows.filter((row) => row.operation === 'delete')).toHaveLength(1);
			expect((await engine.conflicts()).map((row) => row.mutationId)).toEqual(['refused-update']);
		} finally {
			await engine.dispose();
		}
	});

	it('#832: requeuing a dead-lettered create absorbs the never-pushed edits queued behind it into ONE create', async () => {
		const server = createFakeWriteServer();
		const engine = engineWith({ fetch: (url, init) => server.fetch(url, init as never) });
		try {
			await engine.ready;
			await insertBornLocalOrder(engine, UUID_A, {
				status: 'pos-paid',
				total: '25.00',
				meta_data: [{ key: '_woocommerce_pos_uuid', value: UUID_A }],
			});
			const scope = engine.active();
			if (!scope) throw new Error('no active scope');
			const queue = queueFor(scope.database);
			const stale = await queue.enqueue({
				mutationId: 'stranded-create',
				collectionName: 'orders',
				operation: 'create',
				recordId: UUID_A,
				origin: 'minted',
				payload: { status: 'pos-open', total: '10.00' },
				baseRevision: null,
				queuedAt: '2026-01-05T00:00:00.000Z',
			});
			await queue.replace({ ...stale, status: 'rejected', rejectedStatus: 400 });
			// An edit made after the create was rejected. It is pending and never
			// pushed, so it must not end up ahead of the create it depends on.
			await engine.write({
				collection: 'orders',
				operation: 'update',
				recordId: UUID_A,
				payload: { customer_note: 'gift wrap' },
			});

			await engine.resolveConflict('stranded-create', 'requeue-rebuilt');

			// ONE row, still a CREATE (the server has never seen this record), carrying
			// the merged snapshot — never an update racing ahead of its create.
			const rows = await queueRows(engine);
			expect(rows).toHaveLength(1);
			expect(rows[0]).toMatchObject({
				status: 'pending',
				operation: 'create',
				requeuedFrom: 'stranded-create',
				requeueCount: 1,
			});

			expect(await engine.sync('write-drain')).toMatchObject({ status: 'ran', pushed: 1 });
			expect(server.received).toHaveLength(1);
			expect(server.received[0].operation).toBe('create');
			expect(server.received[0].payload).toMatchObject({
				total: '25.00',
				customer_note: 'gift wrap',
			});
			expect((await orderJson(engine, UUID_A))?.wooOrderId).toBe(500);
		} finally {
			await engine.dispose();
		}
	});

	it('#832: requeue refuses while a same-record push is in flight, rather than queueing behind it', async () => {
		const server = createFakeWriteServer();
		let releasePush: () => void = () => undefined;
		const gate = new Promise<void>((resolve) => {
			releasePush = resolve;
		});
		let gated = false;
		const engine = engineWith({
			fetch: async (url, init) => {
				// Hold the FIRST push open so its row stays durably 'claimed' while the
				// requeue below runs — the real in-flight window, not a simulated one.
				if (url.includes('/push/') && !gated) {
					gated = true;
					await gate;
				}
				return server.fetch(url, init as never);
			},
		});
		try {
			await engine.ready;
			await insertServerBornOrder(engine, UUID_A, { wooOrderId: 42, revision: 'sha256:server-r1' });
			server.seed(UUID_A, { id: 42, revision: 'sha256:server-r1' });
			const scope = engine.active();
			if (!scope) throw new Error('no active scope');
			const queue = queueFor(scope.database);
			const stale = await queue.enqueue({
				mutationId: 'refused-update',
				collectionName: 'orders',
				operation: 'update',
				recordId: UUID_A,
				origin: 'existing',
				payload: { status: 'completed' },
				baseRevision: 'sha256:server-r1',
				queuedAt: '2026-01-05T00:00:00.000Z',
			});
			await queue.replace({ ...stale, status: 'rejected', rejectedStatus: 400 });
			await engine.write({
				collection: 'orders',
				operation: 'update',
				recordId: UUID_A,
				payload: { customer_note: 'later edit' },
			});
			const draining = engine.sync('write-drain');
			// Let the drain claim the successor and block inside its push.
			await vi.waitFor(async () => {
				const rows = await queueRows(engine);
				expect(rows.some((row) => row.status === 'claimed')).toBe(true);
			});

			await expect(engine.resolveConflict('refused-update', 'requeue-rebuilt')).rejects.toThrow(
				/being sent right now/i
			);
			// The dead letter is untouched and still recoverable once the push settles.
			expect((await engine.conflicts()).map((row) => row.mutationId)).toEqual(['refused-update']);

			releasePush();
			await draining;
		} finally {
			releasePush();
			await engine.dispose();
		}
	});

	it('#832: a delete that lands DURING the rebuild still wins — the recovery refuses instead of coalescing over it', async () => {
		const server = createFakeWriteServer();
		server.seed(UUID_A, { id: 42, revision: 'sha256:server-r1' });
		const engine = engineWith({ fetch: (url, init) => server.fetch(url, init as never) });
		try {
			await engine.ready;
			await insertServerBornOrder(engine, UUID_A, { wooOrderId: 42, revision: 'sha256:server-r1' });
			const scope = engine.active();
			if (!scope) throw new Error('no active scope');
			const queue = queueFor(scope.database);
			const stale = await queue.enqueue({
				mutationId: 'refused-update',
				collectionName: 'orders',
				operation: 'update',
				recordId: UUID_A,
				origin: 'existing',
				payload: { status: 'completed' },
				baseRevision: 'sha256:server-r1',
				queuedAt: '2026-01-05T00:00:00.000Z',
			});
			await queue.replace({ ...stale, status: 'rejected', rejectedStatus: 400 });

			// Slip the delete in AFTER the pre-flight check has already passed: the
			// resident read inside the rebuild is the last await before the enqueue
			// decision, so enqueueing here lands the delete in exactly the window the
			// pre-flight check cannot see. Coalescing takes the INCOMING operation, so
			// without the in-loop guard the delete row would be swapped for an update
			// and the cashier's deletion would vanish silently.
			const orders = scope.database.collections.orders as unknown as {
				findOne(id: string): { exec(): Promise<unknown> };
			};
			const realFindOne = orders.findOne.bind(orders);
			let reads = 0;
			orders.findOne = (id: string) => ({
				exec: async () => {
					const doc = await realFindOne(id).exec();
					// The FIRST read is the recovery's own pre-flight; its delete check
					// runs after it. The SECOND is inside enqueueWriteIntent's decision
					// loop — past every pre-flight, which is precisely the window only
					// the in-loop guard covers.
					reads += 1;
					if (reads === 2) {
						await engine.write({ collection: 'orders', operation: 'delete', recordId: UUID_A });
					}
					return doc;
				},
			});

			await expect(engine.resolveConflict('refused-update', 'requeue-rebuilt')).rejects.toThrow(
				/queued for deletion/i
			);
			orders.findOne = realFindOne;

			// The delete survived, and no rebuilt update replaced it.
			const rows = await queueRows(engine);
			expect(rows.filter((row) => row.operation === 'delete')).toHaveLength(1);
			expect(rows.filter((row) => row.requeuedFrom !== undefined)).toEqual([]);
			expect((await engine.conflicts()).map((row) => row.mutationId)).toEqual(['refused-update']);
		} finally {
			await engine.dispose();
		}
	});

	/**
	 * #832 follow-up, ruling R7a. A rejected UPDATE stops guarding its record
	 * (#507 regression 4, deliberate), so a pull adopts server truth over the
	 * resident — which is CORRECT and stays correct here: pulls are not
	 * re-blocked. But the resident is then no longer a witness to what the cashier
	 * asked for, and #1011's resident-only rebuild sent the server its own values
	 * back: the edit vanished with nothing anywhere saying so. The intent lives on
	 * the dead letter's frozen payload, and requeue must carry it BACK ON TOP of
	 * the server-adopted base.
	 */
	it("#832 R7a: a pull overwrote the rejected UPDATE's resident — requeue still carries the cashier's edit, on the server-adopted base", async () => {
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
				payload: { status: 'completed', customer_note: 'gift wrap' },
			});
			expect(await engine.sync('write-drain')).toMatchObject({ status: 'ran', rejected: 1 });

			// The pull the dead letter deliberately stopped guarding against: server
			// truth lands on the resident, and the cashier's edit is no longer on it.
			server.script(() => undefined);
			await engine.require({
				id: 'recover',
				collection: 'orders',
				kind: 'targeted-records',
				wooIds: [42],
				forceRefresh: true,
			}).ready;
			expect(state.orderPulls).toEqual([[42]]);
			const overwritten = (await orderJson(engine, UUID_A))?.payload as Record<string, unknown>;
			expect(overwritten.status).toBe('on-hold');
			expect(overwritten.customer_note).toBeUndefined();

			await engine.resolveConflict(receipt.mutationId, 'requeue-rebuilt');

			// BOTH layers are in the rebuilt payload: the server-adopted base the pull
			// wrote, and the refused edit's own fields put back on top of it.
			const [requeued] = await queueRows(engine);
			expect(requeued).toMatchObject({
				status: 'pending',
				operation: 'update',
				requeuedFrom: receipt.mutationId,
				requeueCount: 1,
			});
			expect(requeued.payload).toMatchObject({
				status: 'completed',
				customer_note: 'gift wrap',
				number: '1042',
				total: '10.00',
			});
			// `meta_data` is NOT taken from the dead letter: the builder injects the
			// uuid mirror into every payload, so that entry carries no cashier intent
			// and must not replace the resident's real (server-id-bearing) array.
			expect(requeued.payload).toMatchObject({
				meta_data: [{ id: 1, key: '_woocommerce_pos_uuid', value: UUID_A }],
			});

			// …and it is what actually reaches the server. Re-seed the fake server to
			// the revision the pull anchored, or the push conflicts on a base mismatch
			// that has nothing to do with the reconstruction under test.
			const anchored = (await orderJson(engine, UUID_A))?.sync as { revision: string };
			server.seed(UUID_A, { id: 42, revision: anchored.revision });
			expect(await engine.sync('write-drain')).toMatchObject({ status: 'ran', pushed: 1 });
			const sent = server.received.at(-1)?.payload as Record<string, unknown>;
			expect(sent).toMatchObject({
				status: 'completed',
				customer_note: 'gift wrap',
				total: '10.00',
			});
		} finally {
			await engine.dispose();
		}
	});

	it('#832 R7a: a LIVE queued row keeps its fields and its own row — the recovery neither rolls it back nor absorbs it', async () => {
		const server = createFakeWriteServer();
		server.seed(UUID_A, { id: 42, revision: 'sha256:server-r1' });
		const engine = engineWith({ fetch: (url, init) => server.fetch(url, init as never) });
		try {
			await engine.ready;
			await insertServerBornOrder(engine, UUID_A, { wooOrderId: 42, revision: 'sha256:server-r1' });
			const scope = engine.active();
			if (!scope) throw new Error('no active scope');
			const queue = queueFor(scope.database);
			const stale = await queue.enqueue({
				mutationId: 'refused-update',
				collectionName: 'orders',
				operation: 'update',
				recordId: UUID_A,
				origin: 'existing',
				payload: { status: 'completed', customer_note: 'refused note' },
				baseRevision: 'sha256:server-r1',
				queuedAt: '2026-01-05T00:00:00.000Z',
			});
			await queue.replace({ ...stale, status: 'rejected', rejectedStatus: 400 });
			// A live edit the server has NOT refused. Between a live intent and a dead
			// one, the live one owns every field they both touch.
			const live = await engine.write({
				collection: 'orders',
				operation: 'update',
				recordId: UUID_A,
				payload: { customer_note: 'newer edit' },
			});

			await engine.resolveConflict('refused-update', 'requeue-rebuilt');

			const rows = await queueRows(engine);
			// TWO rows, not one. A recovered UPDATE must not coalesce into the live row:
			// coalescing replaces it, so a second refusal would dead-letter the merged
			// row and entomb the live edit inside it, where discard destroys both.
			expect(rows).toHaveLength(2);
			const survivor = rows.find((row) => row.mutationId === live.mutationId);
			const recovery = rows.find((row) => row.requeuedFrom === 'refused-update');
			expect(survivor?.payload).toMatchObject({ customer_note: 'newer edit' });
			expect(recovery).toBeDefined();
			// The recovery carries the field the live row does NOT own…
			expect(recovery?.payload).toMatchObject({ status: 'completed' });
			// …and none that it does — keeping 'refused note' would overwrite the live
			// edit, because the recovery is ordered behind it.
			expect(recovery?.payload).not.toHaveProperty('customer_note');
		} finally {
			await engine.dispose();
		}
	});

	/**
	 * The subtraction asks "is this field owned by a LIVE row?", never "is that row
	 * newer?". `seq` cannot answer the second question: a coalesced replacement
	 * KEEPS the original seq (so a crash stranding both generations leaves a strictly
	 * newer row at an EQUAL seq), and a newer edit can coalesce into a row whose seq
	 * sits BELOW the dead letter's. This pins the lower-seq case — the recovery must
	 * still not touch that row's fields.
	 */
	it('#832 R7a: a live row with a LOWER seq than the dead letter still owns its fields', async () => {
		const server = createFakeWriteServer();
		server.seed(UUID_A, { id: 42, revision: 'sha256:server-r1' });
		const engine = engineWith({ fetch: (url, init) => server.fetch(url, init as never) });
		try {
			await engine.ready;
			await insertServerBornOrder(engine, UUID_A, { wooOrderId: 42, revision: 'sha256:server-r1' });
			const scope = engine.active();
			if (!scope) throw new Error('no active scope');
			const queue = queueFor(scope.database);
			// Enqueued FIRST, so its seq is below the dead letter's.
			const live = await queue.enqueue({
				mutationId: 'live-lower-seq',
				collectionName: 'orders',
				operation: 'update',
				recordId: UUID_A,
				origin: 'existing',
				payload: { customer_note: 'live edit' },
				baseRevision: 'sha256:server-r1',
				queuedAt: '2026-01-05T00:00:00.000Z',
			});
			const stale = await queue.enqueue({
				mutationId: 'refused-update',
				collectionName: 'orders',
				operation: 'update',
				recordId: UUID_A,
				origin: 'existing',
				payload: { status: 'completed', customer_note: 'refused note' },
				baseRevision: 'sha256:server-r1',
				queuedAt: '2026-01-05T00:00:01.000Z',
			});
			expect((live.seq ?? 0) < (stale.seq ?? 0)).toBe(true);
			await queue.replace({ ...stale, status: 'rejected', rejectedStatus: 400 });

			await engine.resolveConflict('refused-update', 'requeue-rebuilt');

			const recovery = (await queueRows(engine)).find(
				(row) => row.requeuedFrom === 'refused-update'
			);
			expect(recovery?.payload).toMatchObject({ status: 'completed' });
			expect(recovery?.payload).not.toHaveProperty('customer_note');
		} finally {
			await engine.dispose();
		}
	});

	it('#832 R7a: meta_data is never recovered from the dead letter — the resident array wins', async () => {
		const server = createFakeWriteServer();
		server.seed(UUID_A, { id: 42, revision: 'sha256:server-r1' });
		const engine = engineWith({ fetch: (url, init) => server.fetch(url, init as never) });
		try {
			await engine.ready;
			await insertServerBornOrder(engine, UUID_A, { wooOrderId: 42, revision: 'sha256:server-r1' });
			const scope = engine.active();
			if (!scope) throw new Error('no active scope');
			const queue = queueFor(scope.database);
			// The frozen row carries the uuid mirror PLUS a real POS meta entry, which
			// the old heuristic read as "intentional" and re-applied wholesale over the
			// resident's array. The builders inject the mirror into every payload, so
			// provenance is unrecoverable and no heuristic can be sound — meta_data is
			// simply never taken from a dead letter.
			const stale = await queue.enqueue({
				mutationId: 'refused-update',
				collectionName: 'orders',
				operation: 'update',
				recordId: UUID_A,
				origin: 'existing',
				payload: {
					status: 'completed',
					meta_data: [
						{ key: '_woocommerce_pos_uuid', value: UUID_A },
						{ key: '_pos_stale', value: 'from the refused push' },
					],
				},
				baseRevision: 'sha256:server-r1',
				queuedAt: '2026-01-05T00:00:00.000Z',
			});
			await queue.replace({ ...stale, status: 'rejected', rejectedStatus: 400 });

			await engine.resolveConflict('refused-update', 'requeue-rebuilt');

			const [recovery] = await queueRows(engine);
			expect(recovery.payload).toMatchObject({ status: 'completed' });
			const meta = (recovery.payload as { meta_data?: { key: string }[] }).meta_data ?? [];
			expect(meta.some((item) => item.key === '_pos_stale')).toBe(false);
			expect(meta.some((item) => item.key === '_woocommerce_pos_uuid')).toBe(true);
		} finally {
			await engine.dispose();
		}
	});

	/**
	 * #832 follow-up, ruling R7b. Discarding a dead-lettered BORN-LOCAL create left
	 * the order behind: clean-flagged, listed in the app, and permanently
	 * unsyncable — the #832 failure class all over again, one press after the
	 * recovery UI offered to end it. There is no server truth to fall back to, so
	 * discard here means destruction, stated as such in the confirm copy.
	 */
	it('#832 R7b: discarding a rejected born-local CREATE removes the order — no unsyncable ghost left behind', async () => {
		const server = createFakeWriteServer();
		const engine = engineWith({ fetch: (url, init) => server.fetch(url, init as never) });
		try {
			await engine.ready;
			await insertBornLocalOrder(engine, UUID_A, {
				status: 'pos-paid',
				total: '25.00',
				meta_data: [{ key: '_woocommerce_pos_uuid', value: UUID_A }],
			});
			const scope = engine.active();
			if (!scope) throw new Error('no active scope');
			const queue = queueFor(scope.database);
			const stale = await queue.enqueue({
				mutationId: 'stranded-create',
				collectionName: 'orders',
				operation: 'create',
				recordId: UUID_A,
				origin: 'minted',
				payload: { status: 'pos-paid', total: '25.00' },
				baseRevision: null,
				queuedAt: '2026-01-05T00:00:00.000Z',
			});
			await queue.replace({ ...stale, status: 'rejected', rejectedStatus: 400 });

			await engine.resolveConflict('stranded-create', 'discard');

			expect(await orderJson(engine, UUID_A)).toBeNull();
			expect(await engine.conflicts()).toEqual([]);
			expect(await queueRows(engine)).toEqual([]);
			// Nothing was sent: a discard never talks to the server.
			expect(server.received).toEqual([]);
		} finally {
			await engine.dispose();
		}
	});

	it('#832 R7b: discarding a rejected UPDATE keeps the resident — that row is server truth', async () => {
		const server = createFakeWriteServer();
		server.seed(UUID_A, { id: 42, revision: 'sha256:server-r1' });
		const { fetch } = routedFetch(server, () => ({
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
			const scope = engine.active();
			if (!scope) throw new Error('no active scope');
			const queue = queueFor(scope.database);
			const stale = await queue.enqueue({
				mutationId: 'refused-update',
				collectionName: 'orders',
				operation: 'update',
				recordId: UUID_A,
				origin: 'existing',
				payload: { status: 'completed' },
				baseRevision: 'sha256:server-r1',
				queuedAt: '2026-01-05T00:00:00.000Z',
			});
			await queue.replace({ ...stale, status: 'rejected', rejectedStatus: 400 });

			await engine.resolveConflict('refused-update', 'discard');

			const order = await orderJson(engine, UUID_A);
			expect(order).not.toBeNull();
			expect(order?.wooOrderId).toBe(42);
			expect(order?.local).toMatchObject({ dirty: false, pendingMutationIds: [] });
			expect(await engine.conflicts()).toEqual([]);
		} finally {
			await engine.dispose();
		}
	});

	it('#832 R7b: a create whose record has since gained a server identity is NOT born-local — discard keeps it', async () => {
		const server = createFakeWriteServer();
		server.seed(UUID_A, { id: 42, revision: 'sha256:server-r1' });
		const { fetch } = routedFetch(server, () => ({
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
			await insertBornLocalOrder(engine, UUID_A, {
				status: 'pos-paid',
				total: '25.00',
				meta_data: [{ key: '_woocommerce_pos_uuid', value: UUID_A }],
			});
			const scope = engine.active();
			if (!scope) throw new Error('no active scope');
			const queue = queueFor(scope.database);
			const stale = await queue.enqueue({
				mutationId: 'stranded-create',
				collectionName: 'orders',
				operation: 'create',
				recordId: UUID_A,
				origin: 'minted',
				payload: { status: 'pos-paid' },
				baseRevision: null,
				queuedAt: '2026-01-05T00:00:00.000Z',
			});
			await queue.replace({ ...stale, status: 'rejected', rejectedStatus: 400 });
			// A pull matched the order by `_woocommerce_pos_uuid` and adopted the
			// server's id: the record exists server-side now, so it is no longer
			// born-local and destroying it would delete a real order.
			await engine.require({
				id: 'adopt',
				collection: 'orders',
				kind: 'targeted-records',
				wooIds: [42],
				forceRefresh: true,
			}).ready;
			expect((await orderJson(engine, UUID_A))?.wooOrderId).toBe(42);

			await engine.resolveConflict('stranded-create', 'discard');

			expect(await orderJson(engine, UUID_A)).not.toBeNull();
			expect(await engine.conflicts()).toEqual([]);
		} finally {
			await engine.dispose();
		}
	});

	it('#832 R7a: a later ordinary edit never coalesces INTO a pending recovery row', async () => {
		const server = createFakeWriteServer();
		server.seed(UUID_A, { id: 42, revision: 'sha256:server-r1' });
		const engine = engineWith({ fetch: (url, init) => server.fetch(url, init as never) });
		try {
			await engine.ready;
			await insertServerBornOrder(engine, UUID_A, { wooOrderId: 42, revision: 'sha256:server-r1' });
			const scope = engine.active();
			if (!scope) throw new Error('no active scope');
			const queue = queueFor(scope.database);
			const stale = await queue.enqueue({
				mutationId: 'refused-update',
				collectionName: 'orders',
				operation: 'update',
				recordId: UUID_A,
				origin: 'existing',
				payload: { status: 'completed' },
				baseRevision: 'sha256:server-r1',
				queuedAt: '2026-01-05T00:00:00.000Z',
			});
			await queue.replace({ ...stale, status: 'rejected', rejectedStatus: 400 });
			await engine.resolveConflict('refused-update', 'requeue-rebuilt');
			const [recovery] = await queueRows(engine);
			expect(recovery).toMatchObject({ requeuedFrom: 'refused-update' });

			// The recovery can sit pending for a long time — offline, held, backing
			// off. An edit landing meanwhile must NOT replace it: merging the refused
			// fields into a new valid edit (and dropping the provenance with them)
			// recreates the entombment the outbound half of this rule prevents.
			const later = await engine.write({
				collection: 'orders',
				operation: 'update',
				recordId: UUID_A,
				payload: { customer_note: 'later edit' },
			});

			const rows = await queueRows(engine);
			expect(rows).toHaveLength(2);
			const recoveryRow = rows.find((item) => item.mutationId === recovery.mutationId);
			const laterRow = rows.find((item) => item.mutationId === later.mutationId);
			expect(recoveryRow).toMatchObject({ requeuedFrom: 'refused-update' });
			expect(recoveryRow?.payload).not.toHaveProperty('customer_note');
			expect(laterRow?.payload).toMatchObject({ customer_note: 'later edit' });
		} finally {
			await engine.dispose();
		}
	});

	it('#832 R7a: a dead-lettered DELETE supersedes an older update — requeue refuses', async () => {
		const server = createFakeWriteServer();
		server.seed(UUID_A, { id: 42, revision: 'sha256:server-r1' });
		const engine = engineWith({ fetch: (url, init) => server.fetch(url, init as never) });
		try {
			await engine.ready;
			await insertServerBornOrder(engine, UUID_A, { wooOrderId: 42, revision: 'sha256:server-r1' });
			const scope = engine.active();
			if (!scope) throw new Error('no active scope');
			const queue = queueFor(scope.database);
			const stale = await queue.enqueue({
				mutationId: 'refused-update',
				collectionName: 'orders',
				operation: 'update',
				recordId: UUID_A,
				origin: 'existing',
				payload: { status: 'completed' },
				baseRevision: 'sha256:server-r1',
				queuedAt: '2026-01-05T00:00:00.000Z',
			});
			await queue.replace({ ...stale, status: 'rejected', rejectedStatus: 400 });
			// The cashier's newer intent is DELETION, and it dead-lettered too.
			// `pending()` filters rejected rows out, so this delete used to be
			// invisible to the recovery's guard — reviving the older update would push
			// a change to a record they have asked to remove.
			const deletion = await queue.enqueue({
				mutationId: 'refused-delete',
				collectionName: 'orders',
				operation: 'delete',
				recordId: UUID_A,
				origin: 'existing',
				payload: { id: UUID_A },
				baseRevision: 'sha256:server-r1',
				queuedAt: '2026-01-05T00:00:02.000Z',
			});
			await queue.replace({ ...deletion, status: 'rejected', rejectedStatus: 400 });

			await expect(engine.resolveConflict('refused-update', 'requeue-rebuilt')).rejects.toThrow(
				/queued for deletion/i
			);
			// Both dead letters stay listed and independently resolvable.
			expect((await engine.conflicts()).map((item) => item.mutationId).sort()).toEqual([
				'refused-delete',
				'refused-update',
			]);
		} finally {
			await engine.dispose();
		}
	});

	/**
	 * `identity-ambiguous` is the push adapter's PERMANENT 409: the record's uuid
	 * resolves to more than one server record, so the server fails closed and the
	 * create dead-letters with no ack. Nothing local ever gets a `wooOrderId`, so
	 * every local signal says "born local" — while the server demonstrably holds
	 * matching orders. Destroying there deletes a real sale on an inference the
	 * client is not entitled to make.
	 */
	it('#832 R7b: a create rejected as identity-ambiguous is NOT born-local — discard keeps the order', async () => {
		const server = createFakeWriteServer();
		const engine = engineWith({ fetch: (url, init) => server.fetch(url, init as never) });
		try {
			await engine.ready;
			await insertBornLocalOrder(engine, UUID_A, {
				status: 'pos-paid',
				total: '25.00',
				meta_data: [{ key: '_woocommerce_pos_uuid', value: UUID_A }],
			});
			const scope = engine.active();
			if (!scope) throw new Error('no active scope');
			const queue = queueFor(scope.database);
			const stale = await queue.enqueue({
				mutationId: 'ambiguous-create',
				collectionName: 'orders',
				operation: 'create',
				recordId: UUID_A,
				origin: 'minted',
				payload: { status: 'pos-paid', total: '25.00' },
				baseRevision: null,
				queuedAt: '2026-01-05T00:00:00.000Z',
			});
			await queue.replace({
				...stale,
				status: 'rejected',
				rejectedStatus: 409,
				rejectedReason: 'identity-ambiguous',
				rejectedMessage: 'This record matches more than one order.',
			});

			await engine.resolveConflict('ambiguous-create', 'discard');

			// The order survives: the server may hold it, and a pull can reconcile.
			expect(await orderJson(engine, UUID_A)).not.toBeNull();
			expect(await engine.conflicts()).toEqual([]);
		} finally {
			await engine.dispose();
		}
	});

	it('#832 R7b: a destructive discard refuses while anything is still queued to send for the record', async () => {
		const server = createFakeWriteServer();
		const engine = engineWith({ fetch: (url, init) => server.fetch(url, init as never) });
		try {
			await engine.ready;
			await insertBornLocalOrder(engine, UUID_A, {
				status: 'pos-paid',
				total: '25.00',
				meta_data: [{ key: '_woocommerce_pos_uuid', value: UUID_A }],
			});
			const scope = engine.active();
			if (!scope) throw new Error('no active scope');
			const queue = queueFor(scope.database);
			const stale = await queue.enqueue({
				mutationId: 'stranded-create',
				collectionName: 'orders',
				operation: 'create',
				recordId: UUID_A,
				origin: 'minted',
				payload: { status: 'pos-paid' },
				baseRevision: null,
				queuedAt: '2026-01-05T00:00:00.000Z',
			});
			await queue.replace({ ...stale, status: 'rejected', rejectedStatus: 400 });
			// A recovery's replacement — or any live row — will be pushed by the drain.
			// Destroying the resident now lets that push recreate the order the cashier
			// just confirmed destroying (its ack rematerializes the record).
			await engine.resolveConflict('stranded-create', 'requeue-rebuilt');
			const [replacement] = await queueRows(engine);
			expect(replacement).toMatchObject({ status: 'pending', operation: 'create' });

			// Re-dead-letter the replacement so there is something to discard, and leave
			// a second live row queued for the same record.
			await queue.replace({ ...replacement, status: 'rejected', rejectedStatus: 400 } as never);
			await engine.write({
				collection: 'orders',
				operation: 'update',
				recordId: UUID_A,
				payload: { customer_note: 'still queued' },
			});

			await expect(
				engine.resolveConflict(replacement.mutationId as string, 'discard')
			).rejects.toThrow(/queued to send/i);
			// Nothing was destroyed and nothing was retired.
			expect(await orderJson(engine, UUID_A)).not.toBeNull();
			expect((await engine.conflicts()).map((row) => row.mutationId)).toEqual([
				replacement.mutationId,
			]);
		} finally {
			await engine.dispose();
		}
	});

	/**
	 * Requeue enqueues its replacement BEFORE it retires the dead letter. A discard
	 * interleaving in that window destroyed the resident while the replacement was
	 * already queued — the drain then pushed the create and the ack's
	 * missing-resident path rematerialized the order the cashier just confirmed
	 * destroying. Resolutions are now serialized, so the interleave cannot happen:
	 * whichever runs first completes fully and the other finds the row settled.
	 */
	it('#832 R7b: concurrent requeue + discard never leaves a destroyed order with a live create queued', async () => {
		const server = createFakeWriteServer();
		const engine = engineWith({ fetch: (url, init) => server.fetch(url, init as never) });
		try {
			await engine.ready;
			await insertBornLocalOrder(engine, UUID_A, {
				status: 'pos-paid',
				total: '25.00',
				meta_data: [{ key: '_woocommerce_pos_uuid', value: UUID_A }],
			});
			const scope = engine.active();
			if (!scope) throw new Error('no active scope');
			const queue = queueFor(scope.database);
			const stale = await queue.enqueue({
				mutationId: 'stranded-create',
				collectionName: 'orders',
				operation: 'create',
				recordId: UUID_A,
				origin: 'minted',
				payload: { status: 'pos-paid' },
				baseRevision: null,
				queuedAt: '2026-01-05T00:00:00.000Z',
			});
			await queue.replace({ ...stale, status: 'rejected', rejectedStatus: 400 });

			// FORCE the interleave rather than hoping the scheduler produces it:
			// `guardWrite` tracks in-flight writes but does not serialize them, so
			// without the resolution chain a discard genuinely can run to completion
			// inside requeue's enqueue→retire window. The hook fires once the
			// replacement is durably enqueued and the requeue is about to retire the
			// dead letter — precisely the reviewed schedule.
			const queueUnderTest = queue as unknown as {
				removeIfStatus: (id: string, status: string) => Promise<boolean>;
			};
			const realRemoveIfStatus = queueUnderTest.removeIfStatus.bind(queueUnderTest);
			let raced = false;
			let discardOutcome: Promise<unknown> = Promise.resolve();
			let draining: Promise<unknown> = Promise.resolve();
			queueUnderTest.removeIfStatus = async (id: string, status: string) => {
				if (!raced) {
					raced = true;
					discardOutcome = engine
						.resolveConflict('stranded-create', 'discard')
						.catch((error) => error);
					// The drain must CLAIM the replacement inside this window too: without
					// a claim the requeue's own compensation (`removePending`) unwinds the
					// replacement cleanly and nothing is lost. The damage needs a claimed
					// row that neither resolution can take back.
					draining = engine.sync('write-drain').catch((error) => error);
					// Give both real turns. Neither can be awaited here: once resolutions
					// are serialized the discard is chained BEHIND this requeue, so
					// awaiting it would deadlock — which is itself the proof that the
					// interleave is gone.
					for (let tick = 0; tick < 30; tick += 1) {
						await new Promise((resolve) => setTimeout(resolve, 0));
					}
				}
				return realRemoveIfStatus(id, status);
			};

			await Promise.allSettled([engine.resolveConflict('stranded-create', 'requeue-rebuilt')]);
			const discardResult = await discardOutcome;
			await draining;
			queueUnderTest.removeIfStatus = realRemoveIfStatus;
			expect(raced).toBe(true);
			await engine.sync('write-drain');

			// THE invariant. A discard that REPORTS SUCCESS told the cashier the order
			// was deleted; the order must then be gone and must never have been created
			// server-side. (When the discard instead refuses — because the resolution ran
			// after the requeue, or because the live-row guard stopped it — there is no
			// promise to keep, and the order legitimately survives.)
			if (!(discardResult instanceof Error)) {
				expect(await orderJson(engine, UUID_A)).toBeNull();
				expect(server.received.filter((envelope) => envelope.operation === 'create')).toEqual([]);
			} else {
				expect(String(discardResult)).toMatch(/not found|queued to send/i);
			}
		} finally {
			await engine.dispose();
		}
	});

	it('#832 R7b: two discards of one born-local dead letter settle it once, without erroring over work already done', async () => {
		const server = createFakeWriteServer();
		const engine = engineWith({ fetch: (url, init) => server.fetch(url, init as never) });
		try {
			await engine.ready;
			await insertBornLocalOrder(engine, UUID_A, {
				status: 'pos-paid',
				total: '25.00',
				meta_data: [{ key: '_woocommerce_pos_uuid', value: UUID_A }],
			});
			const scope = engine.active();
			if (!scope) throw new Error('no active scope');
			const queue = queueFor(scope.database);
			const stale = await queue.enqueue({
				mutationId: 'stranded-create',
				collectionName: 'orders',
				operation: 'create',
				recordId: UUID_A,
				origin: 'minted',
				payload: { status: 'pos-paid' },
				baseRevision: null,
				queuedAt: '2026-01-05T00:00:00.000Z',
			});
			await queue.replace({ ...stale, status: 'rejected', rejectedStatus: 400 });

			const outcomes = await Promise.allSettled([
				engine.resolveConflict('stranded-create', 'discard'),
				engine.resolveConflict('stranded-create', 'discard'),
			]);

			expect(outcomes.some((outcome) => outcome.status === 'fulfilled')).toBe(true);
			// A loser may report the row as already gone — never a storage conflict
			// from removing a queue row or a record the winner already removed.
			for (const outcome of outcomes) {
				if (outcome.status === 'rejected') {
					expect(String(outcome.reason)).toMatch(/not found/i);
				}
			}
			expect(await orderJson(engine, UUID_A)).toBeNull();
			expect(await engine.conflicts()).toEqual([]);
			expect(await queueRows(engine)).toEqual([]);
		} finally {
			await engine.dispose();
		}
	});

	/**
	 * Cross-process resolution safety (task 43). A SECOND Electron window holding a
	 * live durable claim on the dead letter must block this window's resolve —
	 * proving `resolveConflict` is gated by the durable claim, not only the
	 * in-process chain. Once the other window's deadline passes, the claim is
	 * stealable and the resolution proceeds. `now` is injected so the deadline is
	 * deterministic.
	 */
	it('#task43: a live claim held by another window blocks resolveConflict until it expires', async () => {
		let clock = Date.parse('2026-01-05T00:00:00.000Z');
		const server = createFakeWriteServer();
		const engine = engineWith({
			fetch: (url, init) => server.fetch(url, init as never),
			now: () => clock,
		});
		try {
			await engine.ready;
			await insertBornLocalOrder(engine, UUID_A, {
				status: 'pos-paid',
				total: '25.00',
				meta_data: [{ key: '_woocommerce_pos_uuid', value: UUID_A }],
			});
			const scope = engine.active();
			if (!scope) throw new Error('no active scope');
			const queue = queueFor(scope.database);
			const stale = await queue.enqueue({
				mutationId: 'stranded-create',
				collectionName: 'orders',
				operation: 'create',
				recordId: UUID_A,
				origin: 'minted',
				payload: { status: 'pos-paid' },
				baseRevision: null,
				queuedAt: '2026-01-05T00:00:00.000Z',
			});
			// Another window dead-letters it AND holds a claim expiring 30s out.
			await queue.replace({
				...stale,
				status: 'rejected',
				rejectedStatus: 400,
				resolutionClaimBy: 'other-window',
				resolutionClaimUntil: new Date(clock + 30_000).toISOString(),
			});

			// This window cannot resolve while the other's claim is live.
			await expect(engine.resolveConflict('stranded-create', 'discard')).rejects.toThrow(
				/another window is resolving/i
			);
			expect(await orderJson(engine, UUID_A)).not.toBeNull();
			expect((await engine.conflicts()).map((row) => row.mutationId)).toEqual(['stranded-create']);

			// The other window crashed without releasing; past its deadline the claim
			// is stealable and the resolution goes through.
			clock += 31_000;
			await engine.resolveConflict('stranded-create', 'discard');
			expect(await orderJson(engine, UUID_A)).toBeNull();
			expect(await engine.conflicts()).toEqual([]);
		} finally {
			await engine.dispose();
		}
	});

	/**
	 * The composition hole (task 43): a claim STOLEN mid-resolution must not let the
	 * original window destroy the record. A window may only destroy the resident
	 * while its own claim is unexpired — another window can steal only AFTER the
	 * deadline — so a resolution that stalls past its deadline aborts before the
	 * irreversible removal. Here the injected clock jumps past the deadline right
	 * before the destructive step; the discard must refuse and leave the order.
	 */
	it('#task43: a resolution whose claim was stolen mid-flight aborts before destroying the resident', async () => {
		const server = createFakeWriteServer();
		const engine = engineWith({ fetch: (url, init) => server.fetch(url, init as never) });
		try {
			await engine.ready;
			await insertBornLocalOrder(engine, UUID_A, {
				status: 'pos-paid',
				total: '25.00',
				meta_data: [{ key: '_woocommerce_pos_uuid', value: UUID_A }],
			});
			const scope = engine.active();
			if (!scope) throw new Error('no active scope');
			const queue = queueFor(scope.database);
			const stale = await queue.enqueue({
				mutationId: 'stranded-create',
				collectionName: 'orders',
				operation: 'create',
				recordId: UUID_A,
				origin: 'minted',
				payload: { status: 'pos-paid' },
				baseRevision: null,
				queuedAt: '2026-01-05T00:00:00.000Z',
			});
			await queue.replace({ ...stale, status: 'rejected', rejectedStatus: 400 });

			// Simulate ANOTHER window stealing the claim in the window between our
			// claim and the destructive step: hook the resident read (which the discard
			// branch performs just before the removal) to overwrite the claim.
			const orders = scope.database.collections.orders as unknown as {
				findOne(id: string): { exec(): Promise<unknown> };
			};
			const realFindOne = orders.findOne.bind(orders);
			let stolen = false;
			orders.findOne = (id: string) => ({
				exec: async () => {
					const doc = await realFindOne(id).exec();
					if (!stolen && id === UUID_A) {
						stolen = true;
						const row = (await queue.all()).find((r) => r.mutationId === 'stranded-create');
						if (row) {
							await queue.replace({
								...row,
								resolutionClaimBy: 'other-window',
								resolutionClaimUntil: new Date(Date.now() + 60_000).toISOString(),
							});
						}
					}
					return doc;
				},
			});

			await expect(engine.resolveConflict('stranded-create', 'discard')).rejects.toThrow(
				/expired or was taken by another window/i
			);
			orders.findOne = realFindOne;
			// The order survived — no destructive write ran under a stolen claim.
			expect(await orderJson(engine, UUID_A)).not.toBeNull();
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
		const fetch = async (url: string, init?: RequestInit): Promise<Response> => {
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
		const fetch = async (url: string, init?: RequestInit): Promise<Response> => {
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
		const fetch = async (url: string, init?: RequestInit): Promise<Response> => {
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
		const fetch = async (url: string, init?: RequestInit): Promise<Response> => {
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
				explicit: true,
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
				explicit: true,
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
			expect(state.orderUrls).toEqual([
				`${SITE}/wp-json/wcpos/v2/orders?include=42&per_page=1&orderby=include`,
			]);
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
		conflictPastAutoRecovery(server, 'sha256:server-r2');
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
			engine.require({ id: 'x', collection: 'products', kind: 'targeted-records' } as never).ready
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
