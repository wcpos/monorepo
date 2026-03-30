/**
 * Compute the net payment total by subtracting accumulated refunds from the order total.
 */
export function getNetPaymentTotal(
	total: string | number | null | undefined,
	refunds: { total?: string | number | null }[] | null | undefined
): number {
	const toNumber = (value: string | number | null | undefined): number => {
		const parsed = parseFloat(String(value || '0'));
		return Number.isFinite(parsed) ? parsed : 0;
	};

	const orderTotal = toNumber(total);
	const refundTotal = (refunds ?? []).reduce((sum, r) => sum + Math.abs(toNumber(r.total)), 0);
	return orderTotal - refundTotal;
}
