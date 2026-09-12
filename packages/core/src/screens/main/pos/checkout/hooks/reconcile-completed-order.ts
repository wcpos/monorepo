import type { EngineRecord, useQueryRuntime } from '@wcpos/query';
import { remoteIdOrNull } from '@wcpos/sync-core';
import { getLogger } from '@wcpos/utils/logger';

import { stockAdjustment } from '../../../hooks/use-stock-adjustment';

// Bound the post-payment wait so a stalled refresh cannot strand checkout.
const ORDER_REFRESH_TIMEOUT_MS = 10_000;
const logger = getLogger(['wcpos', 'pos', 'checkout']);
type QueryRuntime = ReturnType<typeof useQueryRuntime>;

/**
 * Pull the store's copy of one order and wait for it, bounded.
 *
 * Used after a payment the store accepted: whatever the till holds locally is behind,
 * and the store's copy is the one with the money on it.
 */
export async function refreshOrderRecord(runtime: QueryRuntime, orderId: number): Promise<void> {
	const handle = runtime.engine.require({
		id: `checkout:order-refresh:${orderId}`,
		collection: 'orders',
		kind: 'targeted-records',
		remoteIds: [orderId].map(remoteIdOrNull).filter((remoteId) => remoteId !== null),
		forceRefresh: true,
	});
	let timer: ReturnType<typeof setTimeout> | undefined;
	try {
		await Promise.race([
			handle.ready,
			new Promise<void>((resolve) => {
				timer = setTimeout(resolve, ORDER_REFRESH_TIMEOUT_MS);
			}),
		]);
	} finally {
		if (timer) clearTimeout(timer);
		handle.release();
	}
}

export async function reconcileCompletedOrder(
	runtime: QueryRuntime,
	order: EngineRecord<'orders'>,
	refresh = true,
	adjustStock = (lineItems: Parameters<typeof stockAdjustment>[1]) =>
		stockAdjustment(runtime, lineItems)
): Promise<void> {
	if (refresh) {
		const orderId = order.getLatest().payload.id;
		if (!orderId) {
			throw new Error('checkout_refresh_requires_persisted_order');
		}
		try {
			await refreshOrderRecord(runtime, orderId);
		} catch (error) {
			// The payment is already recorded and the receipt stage already shown; a
			// refresh that fails must degrade to the local record, not surface as a
			// payment error and skip the stock reconciliation below.
			logger.warn('Post-payment order refresh failed; completing from the local record', {
				context: {
					orderId: order.uuid,
					error: error instanceof Error ? error.message : String(error),
				},
			});
		}
	}

	const latest = order.getLatest().payload;
	const reducedStockItems = (latest.line_items || []).filter((item) =>
		(item.meta_data as { key: string }[] | undefined)?.some((meta) => meta.key === '_reduced_stock')
	);
	adjustStock(reducedStockItems);
}
