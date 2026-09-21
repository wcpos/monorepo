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
export function refreshOrderRecord(
	runtime: QueryRuntime,
	orderId: number
): Promise<'refreshed' | 'timed-out'> {
	// Deliberately not `async`: an engine that cannot even take the request throws
	// from here, synchronously, to whoever asked for the refresh. Only the WAIT for
	// readiness is the caller's to absorb.
	const handle = runtime.engine.require({
		id: `checkout:order-refresh:${orderId}`,
		collection: 'orders',
		kind: 'targeted-records',
		remoteIds: [orderId].map(remoteIdOrNull).filter((remoteId) => remoteId !== null),
		forceRefresh: true,
	});
	let timer: ReturnType<typeof setTimeout> | undefined;
	return Promise.race([
		handle.ready.then((): 'refreshed' => 'refreshed'),
		new Promise<'timed-out'>((resolve) => {
			timer = setTimeout(() => resolve('timed-out'), ORDER_REFRESH_TIMEOUT_MS);
		}),
	]).finally(() => {
		if (timer) clearTimeout(timer);
		handle.release();
	});
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
		// Outside the try on purpose — see refreshOrderRecord.
		const refreshed = refreshOrderRecord(runtime, orderId);
		try {
			const outcome = await refreshed;
			if (outcome === 'timed-out') {
				// Previously invisible: the race resolved on the timer and completion carried
				// on with no row at all, so a store that never answered looked identical to
				// one that answered instantly.
				logger.debug('Post-payment order refresh timed out; completing from the local record', {
					terminal: { outcome: 'recovered', operationId: String(orderId) },
					context: { orderId: order.uuid, timeoutMs: ORDER_REFRESH_TIMEOUT_MS },
				});
			}
		} catch (error) {
			// The payment is already recorded and the receipt stage already shown; a
			// refresh that fails must degrade to the local record, not surface as a
			// payment error and skip the stock reconciliation below. Per LEVELS.md that
			// makes this a recovered arc, not a warning: the sale completed.
			logger.debug('Post-payment order refresh failed; completing from the local record', {
				terminal: { outcome: 'recovered', operationId: String(orderId) },
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
