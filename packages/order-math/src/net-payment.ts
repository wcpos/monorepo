import type { RefundLike } from './types';

const toFinite = (value: string | number | null | undefined): number => {
	const n = typeof value === 'string' ? parseFloat(value) : (value ?? NaN);
	return Number.isFinite(n) ? n : 0;
};

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
	const refunded = (refunds ?? []).reduce(
		(sum, refund) => sum + Math.abs(toFinite(refund.amount ?? refund.total)),
		0
	);
	return toFinite(total) - refunded;
}
