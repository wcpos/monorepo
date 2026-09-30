import { describe, expect, it, vi } from 'vitest';
import { setPremiumFlag } from 'rxdb-premium/plugins/shared';

import { createEngineHarness, remoteId } from './testing';
import { createRxdbSyncEngine } from './create-rxdb-sync-engine';

setPremiumFlag();

const SITE = 'https://leader.example.test';
const ORDER_ID = '22222222-2222-4222-8222-222222222222';
let scope = 0;

function engineWith() {
	const fetcher = vi.fn(async (_url: string, _init?: RequestInit) => {
		throw new Error('coalescing must not use the write transport');
	});
	const engine = createEngineHarness({
		site: SITE,
		identity: { site: SITE, storeId: 1, cashierId: `leader-gate-${++scope}` },
		mode: 'manual',
		fetch: fetcher,
		awaitReady: false,
	}).engine;
	return { engine, fetcher };
}

async function insertServerOrder(engine: ReturnType<typeof createRxdbSyncEngine>) {
	await engine.ready;
	await engine.active()!.database.collections.orders.insert({
		posUserId: '',
		posStoreId: '',
		uuid: ORDER_ID,
		remoteId: remoteId(42),
		remoteKey: String(remoteId(42) ?? ''),
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

describe('single-owner write-plane coalescing', () => {
	it('keeps the existing coalescing behavior for the storage owner', async () => {
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
