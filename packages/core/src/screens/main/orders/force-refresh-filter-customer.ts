import { refreshRecordByWooId } from '@wcpos/query/record-readers';

type QueryManager = ReturnType<typeof import('@wcpos/query').useQueryRuntime>;

/** Re-anchor a missing selected filter label without writing through legacy storeDB. */
export async function forceRefreshFilterCustomer(
	manager: QueryManager,
	wooId: number,
	role: 'customer' | 'cashier'
): Promise<void> {
	// Filter-label refresh is fire-and-forget; the engine reports demand failures separately.
	await refreshRecordByWooId(manager.engine, {
		id: `orders-filter:${role}:${wooId}`,
		collection: 'customers',
		wooId,
	}).catch(() => undefined);
}
