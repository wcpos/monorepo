import { roundHalfUp } from '../../hooks/utils/precision';

interface LineItemInput {
	quantity: number;
	total: string;
	taxes: { id: number; total: string }[];
	refundQty: number;
	dp?: number;
}

type RefundLineItemLike = {
	id?: number;
	item_id?: number;
	quantity?: number | string;
	meta_data?: { key?: string; value?: unknown }[];
};

type RefundLike = {
	line_items?: RefundLineItemLike[];
};

export interface LineItemRefund {
	refund_total: string;
	refund_tax: { id: number; refund_total: string }[];
}

/**
 * Calculate proportional refund amounts for a line item based on refund quantity.
 */
export function calculateLineItemRefund(input: LineItemInput): LineItemRefund {
	const { quantity, total, taxes, refundQty, dp = 2 } = input;

	const zeroPad = (0).toFixed(dp);
	const safeRefundQty = Math.min(Math.max(refundQty, 0), quantity);
	if (safeRefundQty === 0 || quantity === 0) {
		return {
			refund_total: zeroPad,
			refund_tax: taxes.map((tax) => ({ id: tax.id, refund_total: zeroPad })),
		};
	}

	const ratio = safeRefundQty / quantity;
	const refundTotal = roundHalfUp(parseFloat(total) * ratio, dp).toFixed(dp);
	const refundTax = taxes.map((tax) => ({
		id: tax.id,
		refund_total: roundHalfUp(parseFloat(tax.total) * ratio, dp).toFixed(dp),
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
	dp?: number;
}): string {
	const { lineItemRefunds, customAmount, dp = 2 } = input;

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

	return roundHalfUp(total, dp).toFixed(dp);
}

export function formatLineItemRefundWithTax(
	itemRefund: LineItemRefund | undefined,
	dp: number
): string {
	if (!itemRefund) {
		return (0).toFixed(dp);
	}

	const totalWithTax =
		parseFloat(itemRefund.refund_total) +
		itemRefund.refund_tax.reduce((sum, tax) => sum + parseFloat(tax.refund_total), 0);

	return roundHalfUp(totalWithTax, dp).toFixed(dp);
}

/**
 * Calculate the maximum refundable amount for an order,
 * accounting for previous refunds.
 */
export function computeMaxRefundable(
	orderTotal: string,
	refunds: { total?: string }[],
	dp: number = 2
): number {
	const previousTotal = refunds.reduce((sum, r) => sum + Math.abs(parseFloat(r.total || '0')), 0);
	return Number((parseFloat(orderTotal || '0') - previousTotal).toFixed(dp));
}

export function formatRefundUnitPrice(input: {
	quantity: number;
	total: string;
	totalTax: string;
	displayTax: 'incl' | 'excl';
	dp: number;
}): string {
	const { quantity, total, totalTax, displayTax, dp } = input;
	if (quantity <= 0) {
		return (0).toFixed(dp);
	}

	const lineTotal = parseFloat(total) || 0;
	const lineTax = displayTax === 'incl' ? parseFloat(totalTax) || 0 : 0;
	return roundHalfUp((lineTotal + lineTax) / quantity, dp).toFixed(dp);
}

export function computeRemainingRefundQuantity(input: {
	lineItemId: number;
	quantity: number;
	refunds?: RefundLike[] | null;
}): number {
	const { lineItemId, quantity, refunds } = input;
	const refundedQuantity = (refunds || []).reduce((sum, refund) => {
		const refundLineItems = Array.isArray(refund.line_items) ? refund.line_items : [];
		return (
			sum +
			refundLineItems.reduce((lineSum, lineItem) => {
				const refundLineItemId = getRefundLineOriginalId(lineItem);
				if (refundLineItemId !== lineItemId) {
					return lineSum;
				}

				return lineSum + Math.abs(Number(lineItem.quantity) || 0);
			}, 0)
		);
	}, 0);

	return Math.max(0, quantity - refundedQuantity);
}

function getRefundLineOriginalId(lineItem: RefundLineItemLike): number | undefined {
	if (lineItem.item_id) {
		return lineItem.item_id;
	}

	const refundedItemId = lineItem.meta_data?.find(
		(meta) => meta.key === '_refunded_item_id'
	)?.value;
	if (typeof refundedItemId === 'number') {
		return refundedItemId;
	}

	if (typeof refundedItemId === 'string') {
		const parsed = Number(refundedItemId);
		return Number.isFinite(parsed) ? parsed : undefined;
	}

	return lineItem.id;
}
