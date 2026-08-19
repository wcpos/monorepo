import { type RefundLike, refundValue } from '@wcpos/order-math';

/** Σ |refundValue| over whichever refund list the caller displays — pass the same list
 * the rows render from, so the section total can never disagree with its own rows. */
export function totalRefunded(refunds: readonly RefundLike[] | null | undefined): number {
	return (refunds ?? []).reduce((sum, refund) => sum + refundValue(refund), 0);
}
