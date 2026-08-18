import { remoteIdOrNull } from '@wcpos/sync-core';

type QueryManager = ReturnType<typeof import('@wcpos/query').useQueryRuntime>;

/** Re-anchor a missing selected filter label without writing through legacy storeDB. */
export async function forceRefreshFilterCustomer(
	manager: QueryManager,
	wooId: number,
	role: 'customer' | 'cashier'
): Promise<void> {
	const handle = manager.engine.require({
		id: `orders-filter:${role}:${wooId}`,
		collection: 'customers',
		kind: 'targeted-records',
		remoteIds: [wooId].map(remoteIdOrNull).filter((remoteId) => remoteId !== null),
		forceRefresh: true,
	});
	try {
		await handle.ready;
	} catch {
		// Filter-label refresh is fire-and-forget; the engine reports demand failures separately.
	} finally {
		handle.release();
	}
}
