import type { RefundLike } from './types';

const toFinite = (value: string | number | null | undefined): number => {
	const n = typeof value === 'string' ? parseFloat(value) : (value ?? NaN);
	return Number.isFinite(n) ? n : 0;
};

/**
 * What a single refund is worth, as a positive number. The ONE rule: prefer
 * `amount` (full refund documents), fall back to `total` (embedded
 * order.refunds[] rows). Callers that display refunds row-by-row must use this
 * so the rows sum to exactly what {@link getNetPaymentTotal} deducts.
 */
export function refundValue(refund: RefundLike): number {
	return Math.abs(toFinite(refund.amount ?? refund.total));
}

/**
 * Net payment = order total − Σ |refund value|, where refund value prefers
 * `amount` (full refund documents) and falls back to `total` (embedded
 * order.refunds[] rows). Reconciles the four legacy implementations; POS
 * call sites pass refunds without `amount` and get identical results.
 */
export function getNetPaymentTotal(
	total: string | number | null | undefined,
	refunds: readonly RefundLike[] | null | undefined
): number {
	const refunded = (refunds ?? []).reduce((sum, refund) => sum + refundValue(refund), 0);
	return toFinite(total) - refunded;
}
