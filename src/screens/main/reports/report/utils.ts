import type { OrderDocument } from '@wcpos/database';

export const calculateTotals = (orders: OrderDocument[]) => {
	const paymentMethodTotals: Record<string, number> = {};
	const taxTotals: Record<string, number> = {};
	let discountTotal = 0;
	const userStoreTotals: { cashierId: string; storeId: string }[] = [];

	orders.forEach((order) => {
		// Payment method totals
		paymentMethodTotals[order.payment_method] =
			(paymentMethodTotals[order.payment_method] || 0) +
			order.line_items.reduce((acc, item) => acc + parseFloat(item.total), 0);

		// Tax totals
		order.tax_lines.forEach((tax) => {
			taxTotals[tax.label] = (taxTotals[tax.label] || 0) + parseFloat(tax.tax_total);
		});

		// Discount totals
		discountTotal += order.coupon_lines.reduce(
			(acc, coupon) => acc + parseFloat(coupon.discount),
			0
		);

		// Extract cashier ID and store ID from meta data
		const cashierId = order.meta_data.find((meta) => meta.key === '_pos_user')?.value || 'Unknown';
		const storeId = order.meta_data.find((meta) => meta.key === '_pos_store')?.value || 'Unknown';
		userStoreTotals.push({ cashierId, storeId });
	});

	return { paymentMethodTotals, taxTotals, discountTotal, userStoreTotals };
};
