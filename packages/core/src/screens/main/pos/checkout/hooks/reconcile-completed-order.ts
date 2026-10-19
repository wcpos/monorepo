import type { EngineRecord, useQueryRuntime } from '@wcpos/query';
import {
	ORDER_REFRESH_TIMEOUT_MS,
	refreshOrderRecord as readFreshOrderRecord,
} from '@wcpos/query/record-readers';
import { POS_META_KEYS } from '@wcpos/sync-core';
import { getLogger } from '@wcpos/utils/logger';

import { stockAdjustment } from '../../../hooks/use-stock-adjustment';

const logger = getLogger(['wcpos', 'pos', 'checkout']);
type QueryRuntime = ReturnType<typeof useQueryRuntime>;

export function refreshOrderRecord(
	runtime: QueryRuntime,
	orderId: number
): Promise<'refreshed' | 'timed-out' | 'failed'> {
	return readFreshOrderRecord(runtime.engine, orderId);
}

export async function reconcileCompletedOrder(
	runtime: QueryRuntime,
	order: EngineRecord<'orders'>,
	refresh = true,
	adjustStock = (lineItems: Parameters<typeof stockAdjustment>[1]) =>
		stockAdjustment(runtime, lineItems)
): Promise<'refreshed' | 'timed-out' | 'failed' | 'skipped'> {
	let refreshOutcome: 'refreshed' | 'timed-out' | 'failed' | 'skipped' = 'skipped';
	if (refresh) {
		const orderId = order.getLatest().payload.id;
		if (!orderId) {
			throw new Error('checkout_refresh_requires_persisted_order');
		}
		// Outside the try on purpose — see refreshOrderRecord.
		const refreshed = refreshOrderRecord(runtime, orderId);
		try {
			refreshOutcome = await refreshed;
			if (refreshOutcome === 'timed-out') {
				// Previously invisible: the race resolved on the timer and completion carried
				// on with no row at all, so a store that never answered looked identical to
				// one that answered instantly.
				logger.debug('Post-payment order refresh timed out; completing from the local record', {
					terminal: { outcome: 'recovered', operationId: String(orderId) },
					context: { orderId: order.uuid, timeoutMs: ORDER_REFRESH_TIMEOUT_MS },
				});
			}
		} catch (error) {
			refreshOutcome = 'failed';
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
		(item.meta_data as { key: string }[] | undefined)?.some(
			(meta) => meta.key === POS_META_KEYS.reducedStock
		)
	);
	adjustStock(reducedStockItems);
	return refreshOutcome;
}
