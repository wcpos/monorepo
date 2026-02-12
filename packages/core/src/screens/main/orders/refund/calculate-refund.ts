interface LineItemInput {
	quantity: number;
	total: string;
	totalTax: string;
	taxes: Array<{ id: number; total: string }>;
	refundQty: number;
}

interface LineItemRefund {
	refund_total: string;
	refund_tax: Array<{ id: number; refund_total: string }>;
}

/**
 * Calculate proportional refund amounts for a line item based on refund quantity.
 */
export function calculateLineItemRefund(input: LineItemInput): LineItemRefund {
	const { quantity, total, totalTax, taxes, refundQty } = input;

	if (refundQty === 0 || quantity === 0) {
		return {
			refund_total: '0.00',
			refund_tax: taxes.map((tax) => ({ id: tax.id, refund_total: '0.00' })),
		};
	}

	const ratio = refundQty / quantity;
	const refundTotal = (parseFloat(total) * ratio).toFixed(2);
	const refundTax = taxes.map((tax) => ({
		id: tax.id,
		refund_total: (parseFloat(tax.total) * ratio).toFixed(2),
	}));

	return { refund_total: refundTotal, refund_tax: refundTax };
}

/**
 * Calculate the total refund amount from line item refunds + optional custom amount.
 * Includes tax in the total (line item refund_total + refund_tax amounts + custom amount).
 */
export function calculateRefundTotal(input: {
	lineItemRefunds: LineItemRefund[];
	customAmount: string;
}): string {
	const { lineItemRefunds, customAmount } = input;

	let total = 0;

	for (const item of lineItemRefunds) {
		total += parseFloat(item.refund_total) || 0;
		for (const tax of item.refund_tax) {
			total += parseFloat(tax.refund_total) || 0;
		}
	}

	if (customAmount) {
		total += parseFloat(customAmount) || 0;
	}

	return total.toFixed(2);
}
