import { describe, expect, it, vi } from 'vitest';
import { setPremiumFlag } from 'rxdb-premium/plugins/shared';

import { createFakeWriteServer } from '@wcpos/sync-core/testing';
import type { ScopeEvent } from '@wcpos/sync-core';

import { createWriteDrainLane, type WriteDrainLaneDeps } from './write-drain-lane';
import { queueFor } from './write-intents';
import { createEngineHarness, remoteId } from '../testing';

import type { RxdbSyncEngine } from '../create-rxdb-sync-engine';

setPremiumFlag();

/**
 * Only what a tick touches before and after `runGuarded`: a tick that throws
 * there never reaches the queue, the database or the push adapter.
 */
function laneWith(runGuarded: () => Promise<unknown>) {
	const diagnostics = vi.fn();
	let listener: (event: ScopeEvent) => void = () => undefined;
	const manager = {
		activeScope: 'scope-1',
		runGuarded,
		onEvent: (cb: (event: ScopeEvent) => void) => {
			listener = cb;
			return () => undefined;
		},
		switchTo(scopeId: string) {
			manager.activeScope = scopeId;
			listener({ type: 'switched', scopeId, epoch: 0 } as unknown as ScopeEvent);
		},
	};
	const deps = {
		connectivity: () => 'online',
		manager,
		setLastError: vi.fn(),
		diagnostics,
	} as unknown as WriteDrainLaneDeps;
	return { lane: createWriteDrainLane(deps), diagnostics, manager };
}

describe('write drain tick errors', () => {
	it('numbers consecutive crashed ticks so the log alarms only on a streak', async () => {
		let fail = true;
		const { lane, diagnostics } = laneWith(async () => {
			if (fail) throw new Error('queue read failed');
			return { lane: 'write-drain', status: 'ran', pushed: 0 };
		});

		await lane.tick();
		await lane.tick();
		fail = false;
		await lane.tick();
		fail = true;
		await lane.tick();

		expect(
			diagnostics.mock.calls
				.map(([event]) => event)
				.filter((event) => event.type === 'queue.write.tick.error')
				.map((event) => event.fields.consecutiveFailures)
		).toEqual([1, 2, 1]);
	});

	it('keeps a tick that started under the outgoing scope out of the incoming streak', async () => {
		let failures = 0;
		const { lane, diagnostics, manager } = laneWith(async () => {
			failures += 1;
			// The second tick began under scope-1 and fails after the switch.
			if (failures === 2) manager.switchTo('scope-2');
			throw new Error('queue read failed');
		});
		await lane.tick();
		await lane.tick();
		await lane.tick();
		await lane.tick();

		// The late scope-1 failure lands on scope-1's dead tracker; scope-2 counts from zero.
		expect(
			diagnostics.mock.calls
				.map(([event]) => event)
				.filter((event) => event.type === 'queue.write.tick.error')
				.map((event) => event.fields.consecutiveFailures)
		).toEqual([1, 2, 1, 2]);
	});

	it('starts a return to the first scope at zero after another scope ran in between', async () => {
		let fail = true;
		const { lane, diagnostics, manager } = laneWith(async () => {
			if (fail) throw new Error('queue read failed');
			return { lane: 'write-drain', status: 'ran', pushed: 0 };
		});

		await lane.tick();
		await lane.tick();
		manager.switchTo('scope-2');
		fail = false;
		await lane.tick();
		manager.switchTo('scope-1');
		fail = true;
		await lane.tick();

		expect(
			diagnostics.mock.calls
				.map(([event]) => event)
				.filter((event) => event.type === 'queue.write.tick.error')
				.map((event) => event.fields.consecutiveFailures)
		).toEqual([1, 2, 1]);
	});
});

const SITE = 'https://drain-lane.example.test';
const ORDER_UUID = '22222222-2222-4222-8222-222222222222';
let uniqueScope = 0;

/** The real engine over memory storage: pushes go to a fake write server, and an
 * orders pull answers with the server's version of each order it is asked for. */
function deadLetterEngine(server: ReturnType<typeof createFakeWriteServer>) {
	const orderPulls: number[][] = [];
	const fetch = async (url: string, init?: RequestInit): Promise<Response> => {
		if (url.includes('/push/')) return server.fetch(url, init as never);
		const u = new URL(url);
		if (!u.pathname.endsWith('/orders')) throw new Error(`unexpected ${u.pathname}`);
		const include = (u.searchParams.get('include') ?? '').split(',').map(Number).filter(Boolean);
		orderPulls.push(include);
		const body = include.map((id) => ({
			id,
			number: String(1000 + id),
			status: 'on-hold', // the server's version the till must return to
			total: '10.00',
			date_created_gmt: '2026-07-10T00:00:00',
			date_modified_gmt: '2026-07-10T00:00:02',
			customer_id: 0,
			meta_data: [{ id: 1, key: '_woocommerce_pos_uuid', value: ORDER_UUID }],
		}));
		return new Response(JSON.stringify(body), {
			status: 200,
			headers: { 'content-type': 'application/json' },
		});
	};
	uniqueScope += 1;
	const engine = createEngineHarness({
		site: SITE,
		identity: { site: SITE, storeId: 7, cashierId: `drain-lane-${uniqueScope}` },
		mode: 'manual',
		fetch,
		routes: { '/changes/config-fingerprint': { fingerprints: {} } },
		awaitReady: false,
	}).engine;
	return { engine, orderPulls };
}

type Rows = { find(): { exec(): Promise<{ toJSON(): Record<string, unknown> }[]> } };
type Orders = {
	insert(doc: unknown): Promise<unknown>;
	findOne(id: string): { exec(): Promise<{ toJSON(): Record<string, unknown> } | null> };
};

function ordersOf(engine: RxdbSyncEngine): Orders {
	const scope = engine.active();
	if (!scope) throw new Error('no active scope');
	return scope.database.collections.orders as unknown as Orders;
}

/** The persisted targeted order re-pulls (scheduler tasks keyed `orders:ids:…`). */
async function persistedOrderRepulls(engine: RxdbSyncEngine): Promise<unknown[]> {
	const scope = engine.active();
	if (!scope) throw new Error('no active scope');
	const tasks = await (scope.database.collections.schedulerTaskStates as unknown as Rows)
		.find()
		.exec();
	return tasks
		.map((doc) => doc.toJSON())
		.filter((task) => task.collectionName === 'orders' && String(task.queryKey).includes(':ids:'))
		.map((task) => task.queryKey);
}

/** A resident order: server-born (Woo id + anchored revision), or born-local when `null`. */
async function insertOrder(engine: RxdbSyncEngine, wooOrderId: number | null): Promise<void> {
	const id = wooOrderId === null ? null : remoteId(wooOrderId);
	await ordersOf(engine).insert({
		posUserId: '',
		posStoreId: '',
		uuid: ORDER_UUID,
		remoteId: id,
		remoteKey: id === null ? '' : String(id),
		number: wooOrderId === null ? '' : String(1000 + wooOrderId),
		dateCreatedGmt: '2026-07-10T00:00:00',
		status: 'processing',
		total: '10.00',
		customerId: 0,
		payload: {
			...(wooOrderId === null ? {} : { id: wooOrderId }),
			status: 'processing',
			meta_data: [{ key: '_woocommerce_pos_uuid', value: ORDER_UUID }],
		},
		sync:
			wooOrderId === null
				? { revision: '', partial: false, source: 'skeleton' }
				: { revision: 'sha256:server-r1', partial: false, source: 'woo-rest' },
		local: { dirty: false, pendingMutationIds: [] },
	});
}

describe('dead-lettered order re-pull', () => {
	it('an order update refused 4xx leaves a durable re-pull for that order', async () => {
		const server = createFakeWriteServer();
		server.seed(ORDER_UUID, { id: 42, revision: 'sha256:server-r1' });
		server.script(() => ({ kind: 'invalid_param' as const }));
		const { engine, orderPulls } = deadLetterEngine(server);
		try {
			await engine.ready;
			await insertOrder(engine, 42);
			await engine.write({
				collection: 'orders',
				operation: 'update',
				recordId: ORDER_UUID,
				payload: { status: 'cancelled' },
			});

			expect(await engine.sync('write-drain')).toMatchObject({ status: 'ran', rejected: 1 });
			// The dead letter keeps the refused payload for requeue...
			expect(await engine.conflicts()).toEqual([expect.objectContaining({ status: 'rejected' })]);
			// ...and a targeted re-pull of the order is persisted, so the till does not
			// keep the refused values until the order next changes on the server.
			expect(await persistedOrderRepulls(engine)).toEqual([expect.stringContaining(':ids:42')]);

			expect((await engine.sync('scheduler-drain')).status).toBe('ran');
			expect(orderPulls).toEqual([[42]]);
			const order = (await ordersOf(engine).findOne(ORDER_UUID).exec())?.toJSON();
			expect(order?.status).toBe('on-hold');
			expect(order?.local).toMatchObject({ dirty: false, pendingMutationIds: [] });
		} finally {
			await engine.dispose();
		}
	});

	it('a born-local order create that dead-letters persists no re-pull', async () => {
		const server = createFakeWriteServer();
		server.script(() => ({ kind: 'invalid_param' as const }));
		const { engine, orderPulls } = deadLetterEngine(server);
		try {
			await engine.ready;
			await insertOrder(engine, null);
			const scope = engine.active();
			if (!scope) throw new Error('no active scope');
			await queueFor(scope.database).enqueue({
				mutationId: 'born-local-create',
				collectionName: 'orders',
				operation: 'create',
				recordId: ORDER_UUID,
				origin: 'minted',
				payload: { status: 'pending', total: '10.00' },
				baseRevision: null,
				queuedAt: '2026-01-05T00:00:00.000Z',
			});

			expect(await engine.sync('write-drain')).toMatchObject({ status: 'ran', rejected: 1 });
			expect(await persistedOrderRepulls(engine)).toEqual([]);
			expect((await engine.sync('scheduler-drain')).status).toBe('ran');
			expect(orderPulls).toEqual([]);
			expect((await ordersOf(engine).findOne(ORDER_UUID).exec())?.toJSON().status).toBe(
				'processing'
			);
		} finally {
			await engine.dispose();
		}
	});
});
