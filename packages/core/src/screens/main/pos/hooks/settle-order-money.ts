import { type CartConfig, settleAggregate, snapshotFromOrderJSON } from '@wcpos/order-math';

type OrderDocument = import('@wcpos/database').OrderDocument;

/**
 * The order's money fields re-derived from its lines, as the cart settlement writes them. A
 * money-path writer that changes lines (the tender's rounding fee, the void that drops it) puts
 * `patch` in the same write: the settlement subscription is asynchronous, and the next leg reads
 * the total.
 */
export function settleOrderMoney(payload: Partial<OrderDocument>, cartConfig: CartConfig) {
	const result = settleAggregate(snapshotFromOrderJSON(payload), cartConfig);
	return { ...result, patch: result.patch as Partial<OrderDocument> };
}
