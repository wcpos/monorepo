import { mintRemoteId } from '@wcpos/sync-core';
import type { RxdbSyncEngine, SyncCollectionName } from '@wcpos/sync-engine';

import { fetchFreshRecords } from '../reads/refresh-demands';

/** Own a forced collection refresh until it settles, including failure. */
export async function refreshCollection(
	engine: RxdbSyncEngine,
	request: { id: string; collection: SyncCollectionName }
): Promise<void> {
	const handle = engine.require({ ...request, kind: 'refresh', forceRefresh: true });
	try {
		await handle.ready;
	} finally {
		handle.release();
	}
}

/** Force a single remote record refresh and release its demand when settled. */
export function refreshRecordByWooId(
	engine: RxdbSyncEngine,
	request: {
		id: string;
		collection: 'products' | 'variations' | 'customers' | 'orders';
		wooId: number;
	}
): Promise<void> {
	return fetchFreshRecords(engine, [
		{ id: request.id, collection: request.collection, wooIds: [request.wooId] },
	]);
}

/** Force an order's refunds refresh, preserving release outcomes for the caller's loop. */
export async function refreshOrderRefunds(
	engine: RxdbSyncEngine,
	request: { id: string; orderId: number }
): Promise<'settled' | 'released'> {
	const handle = engine.require({
		id: request.id,
		kind: 'refunds-by-parent',
		collection: 'refunds',
		parentRemoteId: mintRemoteId(request.orderId, 'refund parent'),
		forceRefresh: true,
	});
	try {
		const result = await handle.ready;
		return result?.action === 'released' ? 'released' : 'settled';
	} finally {
		handle.release();
	}
}
