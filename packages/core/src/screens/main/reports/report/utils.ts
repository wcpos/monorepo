import round from 'lodash/round';
import toNumber from 'lodash/toNumber';

import type { OrderDocument } from '@wcpos/database';

interface CalculateTotalsProps {
	orders: OrderDocument[];
	num_decimals?: number;
}

export const calculateTotals = ({ orders, num_decimals = 2 }: CalculateTotalsProps) => {
	const paymentMethodTotals: Record<string, { total: number; title: string }> = {};
	const taxTotals: Record<number, { label: string; total: number }> = {};
	const shippingTotals: Record<string, { total: number; total_tax: number }> = {};
	const userStoreTotals: Record<string, { totalOrders: number; totalAmount: number }> = {};

	let total = 0;
	let discountTotal = 0;
	let totalTax = 0;
	let totalItemsSold = 0;
	let averageOrderValue = 0;

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

		paymentMethodTotals[paymentMethodKey].total += toNumber(order.total || '0');

		/**
		 * NOTE: The tax_lines are to 6 decimal places, but the actual tax collected will be
		 * rounded to whatever the store has set in the settings (usually 2 decimal places).
		 * So we need to round to the store settings when summing the itemized tax totals.
		 *
		 * Also, tax_total and shipping_tax_total are separated in the tax_lines, so we need to
		 * add them together.
		 */
		(order.tax_lines || []).forEach((tax) => {
			if (tax.rate_id) {
				if (!taxTotals[tax.rate_id]) {
					taxTotals[tax.rate_id] = {
						label: tax.label || '',
						total: 0,
					};
				}
				taxTotals[tax.rate_id].total += round(
					toNumber(tax.tax_total || 0) + toNumber(tax.shipping_tax_total || 0),
					6
				);
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
				shippingTotals[shipping.method_id].total += round(
					toNumber(shipping.total || 0) + toNumber(shipping.total_tax || 0),
					6
				);
				// We're not using itemized shipping tax at the moment
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

	if (orders.length > 0) {
		averageOrderValue = total / orders.length;
	}

	return {
		total,
		paymentMethodsArray,
		taxTotalsArray,
		totalTax,
		discountTotal,
		userStoreArray,
		totalItemsSold,
		shippingTotalsArray,
		averageOrderValue,
	};
};
