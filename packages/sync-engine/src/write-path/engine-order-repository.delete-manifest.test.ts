// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { EngineOrderRepository, type OrderRepositoryDatabase } from './engine-order-repository';

/**
 * The order delete channel protects an order with un-pushed local work from removal — but it used
 * to drop that order's existence-manifest row anyway. The manifest is the LOCAL side of the Leg-3
 * reconcile diff, so an order with a document but no manifest row goes invisible to the audit: it
 * can never be pruned again once its local work is pushed, until a boot prime happens to repair
 * it. Found while documenting the reconcile's concurrency stance (#949 tranche 2).
 */

type OrderRow = {
	id: string;
	wooOrderId: number | null;
	local?: { dirty?: boolean; pendingMutationIds?: unknown[] };
};

function orderDatabase(orders: OrderRow[]) {
	const removedOrderIds: string[][] = [];
	const removedManifestIds: string[][] = [];
	const db = {
		orders: {
			find: () => ({ exec: async () => orders.map((row) => ({ toJSON: () => row })) }),
			bulkRemove: async (ids: string[]) => {
				removedOrderIds.push(ids);
				return [];
			},
			bulkUpsert: async () => [],
			findByIds: () => ({ exec: async () => new Map() }),
			count: () => ({ exec: async () => orders.length }),
		},
		existenceManifestOrders: {
			bulkUpsert: async () => [],
			bulkRemove: async (ids: string[]) => {
				removedManifestIds.push(ids);
				return [];
			},
			find: () => ({ exec: async () => [] }),
		},
		syncCheckpoints: { findOne: () => ({ exec: async () => null }), upsert: async () => [] },
		close: async () => true,
	} as unknown as OrderRepositoryDatabase;
	return { db, removedOrderIds, removedManifestIds };
}

describe('removeDeletedOrders manifest bookkeeping', () => {
	it('keeps the manifest row of an order it declined to delete (dirty)', async () => {
		const { db, removedOrderIds, removedManifestIds } = orderDatabase([
			{ id: 'o-1', wooOrderId: 101, local: { dirty: true } },
			{ id: 'o-2', wooOrderId: 102 },
		]);

		await new EngineOrderRepository(db).removeDeletedOrders([101, 102]);

		// Only the clean order's document went.
		expect(removedOrderIds).toEqual([['o-2']]);
		// ...and only its manifest row: 101's document survives, so its row must survive with it.
		// (rows are keyed by String(wooId) — see removeManifestByWooIds)
		expect(removedManifestIds).toEqual([['102']]);
	});

	it('keeps the manifest row of an order protected by the pending-mutation set', async () => {
		const { db, removedOrderIds, removedManifestIds } = orderDatabase([
			{ id: 'o-1', wooOrderId: 101 },
		]);

		await new EngineOrderRepository(db).removeDeletedOrders([101], new Set([101]));

		expect(removedOrderIds).toEqual([]);
		// Nothing to depurate: removeManifestByWooIds no-ops on an empty batch.
		expect(removedManifestIds).toEqual([]);
	});

	it('still depurates the row of a Woo id with no resident order at all', async () => {
		// Nothing local to protect — the row is stale bookkeeping and must go.
		const { db, removedManifestIds } = orderDatabase([{ id: 'o-1', wooOrderId: 101 }]);

		await new EngineOrderRepository(db).removeDeletedOrders([101, 999]);

		expect(removedManifestIds).toEqual([['101', '999']]);
	});

	it('removes both document and row for a clean order', async () => {
		const { db, removedOrderIds, removedManifestIds } = orderDatabase([
			{ id: 'o-1', wooOrderId: 101, local: { pendingMutationIds: [] } },
		]);

		await new EngineOrderRepository(db).removeDeletedOrders([101]);

		expect(removedOrderIds).toEqual([['o-1']]);
		expect(removedManifestIds).toEqual([['101']]);
	});
});
