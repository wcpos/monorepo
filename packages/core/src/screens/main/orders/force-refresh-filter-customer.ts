type QueryManager = ReturnType<typeof import('@wcpos/query').useQueryManager>;

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
		wooIds: [wooId],
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
