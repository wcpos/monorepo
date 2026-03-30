/**
 * Compute the net payment total by subtracting accumulated refunds from the order total.
 */
export function getNetPaymentTotal(
	total: string | number | null | undefined,
	refunds: Array<{ total?: string | number | null }> | null | undefined
): number {
	const orderTotal = parseFloat(String(total ?? '0'));
	const refundTotal = (refunds ?? []).reduce(
		(sum, r) => sum + Math.abs(parseFloat(String(r.total ?? '0'))),
		0
	);
	return orderTotal - refundTotal;
}
