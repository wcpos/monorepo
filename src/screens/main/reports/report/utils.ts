import toNumber from 'lodash/toNumber';

import type { OrderDocument } from '@wcpos/database';

export const calculateTotals = (orders: OrderDocument[]) => {
	const paymentMethodTotals: Record<string, { total: number; title: string }> = {};
	const taxTotals: Record<number, { label: string; total: number }> = {};
	const shippingTotals: Record<string, { total: number; total_tax: number }> = {};
	const userStoreTotals: Record<string, { totalOrders: number; totalAmount: number }> = {};

	let total = 0;
	let discountTotal = 0;
	let totalTax = 0;
	let totalItemsSold = 0;

	orders.forEach((order) => {
		// Total
		total += toNumber(order.total || '0');

		// Discount total
		discountTotal += toNumber(order.discount_total || 0);

		// Total tax
		totalTax += toNumber(order.total_tax || 0);

		// Determine the payment method key
		let paymentMethodKey = order.payment_method;
		let paymentMethodTitle = order.payment_method_title || '';

		if (!paymentMethodKey) {
			if (order.needs_payment) {
				paymentMethodKey = 'unpaid';
				paymentMethodTitle = '';
			} else {
				paymentMethodKey = 'unknown';
				paymentMethodTitle = '';
			}
		}

		// Update payment method totals
		if (!paymentMethodTotals[paymentMethodKey]) {
			paymentMethodTotals[paymentMethodKey] = {
				total: 0,
				title: paymentMethodTitle,
			};
		}

		paymentMethodTotals[paymentMethodKey].total +=
			toNumber(order.total || '0') + toNumber(order.total_tax || 0);

		// Tax totals
		(order.tax_lines || []).forEach((tax) => {
			if (tax.rate_id) {
				if (!taxTotals[tax.rate_id]) {
					taxTotals[tax.rate_id] = {
						label: tax.label || '',
						total: 0,
					};
				}
				taxTotals[tax.rate_id].total += toNumber(tax.tax_total || 0);
				// Set the label if not already set and it's non-empty
				if (!taxTotals[tax.rate_id].label && tax.label) {
					taxTotals[tax.rate_id].label = tax.label;
				}
			}
		});

		// Shipping totals
		(order.shipping_lines || []).forEach((shipping) => {
			if (shipping.method_id) {
				if (!shippingTotals[shipping.method_id]) {
					shippingTotals[shipping.method_id] = {
						total: 0,
						total_tax: 0,
					};
				}
				shippingTotals[shipping.method_id].total += toNumber(shipping.total || 0);
				shippingTotals[shipping.method_id].total_tax += toNumber(shipping.total_tax || 0);
			}
		});

		// Cashier and store totals
		const cashierId = (order.meta_data || []).find((meta) => meta.key === '_pos_user')?.value || '';
		const storeId = (order.meta_data || []).find((meta) => meta.key === '_pos_store')?.value || '';
		const key = `${cashierId}-${storeId}`;

		if (!userStoreTotals[key]) {
			userStoreTotals[key] = {
				totalOrders: 0,
				totalAmount: 0,
			};
		}

		userStoreTotals[key].totalOrders += 1;
		userStoreTotals[key].totalAmount += toNumber(order.total || '0');

		// Total items sold
		totalItemsSold += (order.line_items || []).reduce((acc, item) => acc + (item.quantity || 0), 0);
	});

	// Convert totals to arrays for easier usage
	const paymentMethodsArray = Object.entries(paymentMethodTotals).map(([method, data]) => ({
		payment_method: method,
		payment_method_title: data.title,
		total: data.total,
	}));

	const taxTotalsArray = Object.entries(taxTotals).map(([rate_id, data]) => ({
		rate_id: parseInt(rate_id, 10),
		label: data.label,
		total: data.total,
	}));

	const shippingTotalsArray = Object.entries(shippingTotals).map(([method_id, data]) => ({
		method_id,
		total: data.total,
		total_tax: data.total_tax,
	}));

	const userStoreArray = Object.entries(userStoreTotals).map(([key, data]) => {
		const [cashierId, storeId] = key.split('-');
		return {
			cashierId,
			storeId,
			totalOrders: data.totalOrders,
			totalAmount: data.totalAmount,
		};
	});

	return {
		total,
		paymentMethodsArray,
		taxTotalsArray,
		totalTax,
		discountTotal,
		userStoreArray,
		totalItemsSold,
		shippingTotalsArray,
	};
};
