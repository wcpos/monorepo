import { describe, expect, it, vi } from 'vitest';
import { setPremiumFlag } from 'rxdb-premium/plugins/shared';

import { createRxdbSyncEngine, type RxdbSyncEnginePorts } from './create-rxdb-sync-engine';
import { memoryEngineStorage } from './testing';

setPremiumFlag();

const SITE = 'https://leader.example.test';
const ORDER_ID = '22222222-2222-4222-8222-222222222222';
let scope = 0;

function engineWith(writePlaneOwner?: () => boolean) {
	const fetcher = vi.fn(async (_url: string, _init?: RequestInit) => {
		throw new Error('the follower must not use the write transport');
	});
	const ports = {
		site: { syncBaseUrl: `${SITE}/wp-json/wcpos/v2`, wpJsonRoot: `${SITE}/wp-json` },
		storage: memoryEngineStorage(),
		fetcher: async (url: string, init?: RequestInit) =>
			url.endsWith('/changes/config-fingerprint')
				? Response.json({ fingerprints: {} })
				: fetcher(url, init),
		mode: 'manual' as const,
		writePlaneOwner,
	};
	const engine = createRxdbSyncEngine(ports as RxdbSyncEnginePorts, {
		site: SITE,
		storeId: 1,
		cashierId: `leader-gate-${++scope}`,
	});
	return { engine, fetcher };
}

async function insertServerOrder(engine: ReturnType<typeof createRxdbSyncEngine>) {
	await engine.ready;
	await engine.active()!.database.collections.orders.insert({
		id: ORDER_ID,
		wooOrderId: 42,
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
