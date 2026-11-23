import { toMinor } from '@wcpos/order-math';
import { isPaidStatus } from '@wcpos/sync-core';

type Field = 'status' | 'total' | 'payment_method' | 'payment_method_title';

/**
 * What the store took with no till payment record: the Orders view's fallback row, narrowed to a
 * paid status. The server writes no record for a status-only payment taken outside the POS (#3755),
 * so the ledger alone reads Paid $0.00. Any record wins; a paid date alone never qualifies, nor
 * does on-hold (`isPaidStatus` passes it, but the money has not arrived). Display only: nothing is
 * written to the order and no record is created (ADR 0040 rule 2).
 */
export function storeSettledTender(
	payload: { [key in Field]?: string | null },
	rowCount: number,
	dp: number
): { amountMinor: number; title: string } | null {
	const amountMinor = toMinor(payload.total, dp);
	const paid = isPaidStatus(payload.status) && payload.status !== 'on-hold';
	if (rowCount > 0 || !paid || amountMinor <= 0) return null;
	return { amountMinor, title: payload.payment_method_title || payload.payment_method || '' };
}
