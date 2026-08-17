import { remoteId } from './testing';
import { describe, expect, it, vi } from 'vitest';
import { setPremiumFlag } from 'rxdb-premium/plugins/shared';

import { createRxdbSyncEngine } from './create-rxdb-sync-engine';
import { createEngineHarness } from './testing';

setPremiumFlag();

const SITE = 'https://leader.example.test';
const ORDER_ID = '22222222-2222-4222-8222-222222222222';
let scope = 0;

function engineWith(writePlaneOwner?: () => boolean) {
	const fetcher = vi.fn(async (_url: string, _init?: RequestInit) => {
		throw new Error('the follower must not use the write transport');
	});
	const engine = createEngineHarness({
		site: SITE,
		identity: { site: SITE, storeId: 1, cashierId: `leader-gate-${++scope}` },
		mode: 'manual',
		fetch: fetcher,
		routes: { '/changes/config-fingerprint': { fingerprints: {} } },
		ports: { writePlaneOwner },
		awaitReady: false,
	}).engine;
	return { engine, fetcher };
}

async function insertServerOrder(engine: ReturnType<typeof createRxdbSyncEngine>) {
	await engine.ready;
	await engine.active()!.database.collections.orders.insert({
		uuid: ORDER_ID,
		remoteId: remoteId(42),
		number: '1042',
		dateCreatedGmt: '2026-08-07T00:00:00',
		status: 'processing',
		total: '10.00',
		customerId: 0,
		payload: { id: 42, status: 'processing' },
		sync: { revision: 'sha256:base-r1', partial: false, source: 'woo-rest' },
		local: { dirty: false, pendingMutationIds: [] },
	});
}

async function queueRows(engine: ReturnType<typeof createRxdbSyncEngine>) {
	const rows = await engine.active()!.database.collections.recordMutations.find().exec();
	return rows.map((row) => row.toJSON());
}

describe('web write-plane leader gate', () => {
	it('defers conflict resolution on a follower with a typed error', async () => {
		const { engine } = engineWith(() => false);
		try {
			await engine.ready;
			await expect(engine.resolveConflict('mutation-1', 'discard')).rejects.toMatchObject({
				name: 'WritePlaneFollowerError',
			});
		} finally {
			await engine.dispose();
		}
	});

	it('reports a no-op write-drain tick without pushing on a follower', async () => {
		const { engine, fetcher } = engineWith(() => false);
		try {
			await insertServerOrder(engine);
			await engine.write({
				collection: 'orders',
				operation: 'update',
				recordId: ORDER_ID,
				payload: { status: 'completed' },
			});

			await expect(engine.sync('write-drain')).resolves.toMatchObject({
				lane: 'write-drain',
				status: 'ran',
				pushed: 0,
			});
			expect(fetcher).not.toHaveBeenCalled();
			expect(await queueRows(engine)).toHaveLength(1);
		} finally {
			await engine.dispose();
		}
	});

	it('appends fresh mutations instead of coalescing follower writes', async () => {
		const { engine } = engineWith(() => false);
		try {
			await insertServerOrder(engine);
			await engine.write({
				collection: 'orders',
				operation: 'update',
				recordId: ORDER_ID,
				payload: { status: 'on-hold' },
			});
			await engine.write({
				collection: 'orders',
				operation: 'update',
				recordId: ORDER_ID,
				payload: { status: 'completed' },
			});

			const rows = await queueRows(engine);
			expect(rows).toHaveLength(2);
			expect(new Set(rows.map((row) => row.mutationId)).size).toBe(2);
		} finally {
			await engine.dispose();
		}
	});

	it('annihilates a follower create+void at the leader drain — no phantom server order (#1059)', async () => {
		// The tab rings up an order then voids it as a FOLLOWER (fresh-appends, no
		// coalesce), then becomes the write-plane LEADER and drains. Without
		// leader-side drain annihilation the leader would push a real WooCommerce
		// order and then delete it; with it, neither the create nor the delete is
		// ever sent.
		let isLeader = false;
		const { engine, fetcher } = engineWith(() => isLeader);
		const LOCAL_ID = '33333333-3333-4333-8333-333333333333';
		try {
			await engine.ready;
			// Born-local order (no server identity) — rung up locally.
			await engine.active()!.database.collections.orders.insert({
				uuid: LOCAL_ID,
				remoteId: null,
				number: '',
				dateCreatedGmt: '2026-08-07T00:00:00',
				status: 'pos-open',
				total: '5.00',
				customerId: 0,
				payload: { status: 'pos-open' },
				sync: { revision: '', partial: true, source: 'local' },
				local: { dirty: false, pendingMutationIds: [] },
			});
			await engine.write({
				collection: 'orders',
				operation: 'create',
				recordId: LOCAL_ID,
				payload: { status: 'pos-open' },
			});
			await engine.write({ collection: 'orders', operation: 'delete', recordId: LOCAL_ID });
			expect(await queueRows(engine)).toHaveLength(2); // fresh-appended create + delete

			isLeader = true; // the tab is now the write-plane leader
			const report = await engine.sync('write-drain');

			expect(report).toMatchObject({
				lane: 'write-drain',
				status: 'ran',
				pushed: 0,
				annihilated: 1,
			});
			// The core guarantee: nothing ever reached the write transport, so no
			// order number was consumed and no create→delete round-trip happened.
			expect(fetcher).not.toHaveBeenCalled();
			expect(await queueRows(engine)).toHaveLength(0); // both rows gone
			// The resident local order is removed, exactly as enqueue-time annihilation
			// would have removed it on a single tab.
			expect(
				await engine.active()!.database.collections.orders.findOne(LOCAL_ID).exec()
			).toBeNull();
		} finally {
			await engine.dispose();
		}
	});

	it('keeps the existing coalescing behavior for the default leader', async () => {
		const { engine } = engineWith();
		try {
			await insertServerOrder(engine);
			await engine.write({
				collection: 'orders',
				operation: 'update',
				recordId: ORDER_ID,
				payload: { status: 'on-hold' },
			});
			await engine.write({
				collection: 'orders',
				operation: 'update',
				recordId: ORDER_ID,
				payload: { status: 'completed' },
			});

			expect(await queueRows(engine)).toEqual([
				expect.objectContaining({
					coalesced: 1,
					payload: expect.objectContaining({ status: 'completed' }),
				}),
			]);
		} finally {
			await engine.dispose();
		}
	});
});
