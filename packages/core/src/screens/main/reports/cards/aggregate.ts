import round from 'lodash/round';

import { readLedger } from '@wcpos/order-math';

import type { ReportOrder, ReportsScope } from '../context';
import type { calculateTotals } from '../report/utils';

type Totals = ReturnType<typeof calculateTotals>;
export function ordersSummary(orders: ReportOrder[], totals: Totals, num_decimals = 2) {
	const values = orders.map((order) => Number(order.total || 0)).sort((a, b) => a - b);
	const count = values.length,
		middle = Math.floor(count / 2);
	return {
		count,
		average: totals.averageOrderValue,
		median: count
			? round(count % 2 ? values[middle] : (values[middle - 1] + values[middle]) / 2, num_decimals)
			: 0,
		largest: count ? round(values[count - 1], num_decimals) : null,
		items: totals.totalItemsSold,
		itemsPerOrder: count ? round(totals.totalItemsSold / count, 1) : 0,
		discounts: totals.discountTotal,
	};
}
// The bar partitions the count: an order carrying a refund is the Refunded part, whatever its
// status, so the parts add up to the figure (the prototype's status bar).
export function statusCounts(orders: ReportOrder[], statusMode: ReportsScope['statusMode']) {
	const kept = orders.filter((order) => !order.refunds?.length);
	const count = (status: string, rows = kept) =>
		rows.filter((order) => order.status === status).length;
	const segments = (['completed', 'processing', 'on-hold', 'pending'] as const)
		.map((status) => ({ status, count: count(status) }))
		.filter(
			({ status, count }) =>
				['completed', 'processing'].includes(status) || (statusMode === 'all' && count > 0)
		);
	return {
		segments,
		refunded: orders.filter((order) => order.refunds?.length).length,
		// What needs you is a status, refunded or not: counted over every selected order.
		needsYou: {
			processing: count('processing', orders),
			onHold: count('on-hold', orders),
			pending: count('pending', orders),
		},
	};
}
export function topProducts(orders: ReportOrder[], totals: Totals, num_decimals = 2) {
	const products = new Map<
		number | string,
		{ key: number | string; name: string; quantity: number; amount: number }
	>();
	for (const order of orders)
		for (const line of order.line_items ?? []) {
			const key = line.variation_id || line.product_id || line.name || '';
			const row = products.get(key) ?? { key, name: line.name || '', quantity: 0, amount: 0 };
			row.quantity += Number.isFinite(line.quantity) ? line.quantity! : 0;
			row.amount += Number(line.total || 0) + Number(line.total_tax || 0);
			products.set(key, row);
		}
	return [...products.values()]
		.map((row) => ({
			...row,
			amount: round(row.amount, num_decimals),
			share: totals.total ? row.amount / totals.total : 0,
		}))
		.sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name));
}
// A rate's net is the sum of the lines it taxed (products, shipping, fees), read from each
// line's own `taxes[]`; two rates on the same goods both carry that net, as the return does.
export function taxesByRate(orders: ReportOrder[], totals: Totals, num_decimals = 2) {
	const nets = new Map<number, number>();
	for (const order of orders)
		for (const line of [
			...(order.line_items ?? []),
			...(order.shipping_lines ?? []),
			...(order.fee_lines ?? []),
		])
			for (const tax of line.taxes ?? []) {
				// WooCommerce writes an empty-string total for a rate that exists on the order but
				// does not apply to this line (as the receipt path reads it); a '0' is a zero-rated
				// or zero-rounded line, still taxed under the rate.
				if (!tax.id || tax.total == null || tax.total === '') continue;
				nets.set(tax.id, (nets.get(tax.id) ?? 0) + Number(line.total || 0));
			}
	// WC_Order_Item_Tax::get_label() falls back to the rate code, then "Tax"; an unsynced local
	// order can carry an empty label, so the row keeps the code and the card supplies the word.
	const codes = new Map<number, string>();
	for (const order of orders)
		for (const line of order.tax_lines ?? [])
			if (line.rate_id && line.rate_code && !codes.has(line.rate_id))
				codes.set(line.rate_id, line.rate_code);
	const rows = totals.taxTotalsArray
		.map((row) => ({
			rateId: row.rate_id,
			label: row.label || codes.get(row.rate_id) || '',
			tax: round(row.total, num_decimals),
			net: nets.has(row.rate_id) ? round(nets.get(row.rate_id)!, num_decimals) : null,
			share: totals.totalTax ? row.total / totals.totalTax : 0,
		}))
		.sort((a, b) => b.tax - a.tax);
	return {
		rows,
		net: round(totals.total - totals.totalTax, num_decimals),
		tax: totals.totalTax,
		gross: totals.total,
	};
}
export function refundsSummary(orders: ReportOrder[], totals: Totals, num_decimals = 2) {
	const kept = round(totals.total - totals.refundTotal, num_decimals);
	return {
		refunded: totals.refundTotal,
		ordersWithRefunds: orders.filter((order) => order.refunds?.length).length,
		orders: orders.length,
		kept,
		keptShare: totals.total ? kept / totals.total : null,
	};
}

export function tenders(orders: ReportOrder[], totals: Totals, num_decimals = 2) {
	const parts = new Map<string, { key: string; label: string; amount: number; orders: number }>();
	for (const order of orders) {
		const ledger = readLedger(order.meta_data);
		// Money taken is what the sale completion counts (`checkout/sale-completion.ts`): a captured
		// row, or an authorized row recorded offline. A ledger whose rows are all pending, failed
		// or voided is still the ledger: nothing is attributed to the order's method, and what the
		// order still needs is the unpaid part. Only an order with no ledger at all (a sale from
		// before the ledger, or from elsewhere) is read from its payment method.
		const settled = ledger.filter(
			(row) => row.status === 'captured' || (row.status === 'authorized' && row.recorded_offline)
		);
		const taken = settled.reduce((sum, row) => sum + Number(row.amount), 0);
		const rows = ledger.length
			? [
					...settled.map((row) => ({
						key: row.kind === 'cash' ? 'cash' : row.method_id,
						label: row.method_id === order.payment_method ? order.payment_method_title || '' : '',
						amount: Number(row.amount),
					})),
					...(order.needs_payment && Number(order.total || 0) > taken
						? [{ key: 'unpaid', label: '', amount: Number(order.total || 0) - taken }]
						: []),
				]
			: [
					{
						key: order.payment_method || (order.needs_payment ? 'unpaid' : 'unknown'),
						label: order.payment_method ? order.payment_method_title || '' : '',
						amount: Number(order.total || 0),
					},
				];
		const touched = new Set<string>();
		for (const row of rows) {
			const part = parts.get(row.key) ?? {
				key: row.key,
				label: row.label || (['cash', 'unpaid', 'unknown'].includes(row.key) ? '' : row.key),
				amount: 0,
				orders: 0,
			};
			if (row.label) part.label = row.label;
			part.amount += row.amount;
			if (!touched.has(row.key)) part.orders++;
			touched.add(row.key);
			parts.set(row.key, part);
		}
	}
	return [...parts.values()]
		.map((row) => ({
			...row,
			amount: round(row.amount, num_decimals),
			share: totals.total ? row.amount / totals.total : 0,
		}))
		.sort((a, b) => b.amount - a.amount);
}
export function channels(orders: ReportOrder[], totals: Totals) {
	return ['store', 'online']
		.map((key) => {
			const rows = orders.filter(
				(order) => (order.created_via === 'woocommerce-pos' ? 'store' : 'online') === key
			);
			const amount = rows.reduce((sum, order) => sum + Number(order.total || 0), 0);
			return { key, amount, orders: rows.length, share: totals.total ? amount / totals.total : 0 };
		})
		.filter((row) => row.orders > 0)
		.sort((a, b) => b.amount - a.amount);
}
export function registers(totals: Totals) {
	return totals.registerArray
		.map((row) => ({
			key: row.registerId,
			amount: row.totalAmount,
			orders: row.totalOrders,
			share: totals.total ? row.totalAmount / totals.total : 0,
		}))
		.sort((a, b) => b.amount - a.amount);
}
export function cashiers(totals: Totals) {
	const parts = new Map<string, { key: string; amount: number; orders: number }>();
	for (const row of totals.userStoreArray) {
		const part = parts.get(row.cashierId) ?? { key: row.cashierId, amount: 0, orders: 0 };
		part.amount += row.totalAmount;
		part.orders += row.totalOrders;
		parts.set(row.cashierId, part);
	}
	return [...parts.values()]
		.map((row) => ({ ...row, share: totals.total ? row.amount / totals.total : 0 }))
		.sort((a, b) => b.amount - a.amount);
}
export type LocalProduct = { id?: number; categories?: { id?: number; name?: string }[] };
export function categories(
	orders: ReportOrder[],
	products: LocalProduct[],
	totals: Totals,
	num_decimals = 2
) {
	const directory = new Map(products.map((product) => [product.id, product]));
	const parts = new Map<string, { key: string; label: string; amount: number; quantity: number }>();
	let unknownLines = 0,
		totalLines = 0;
	for (const order of orders)
		for (const line of order.line_items ?? []) {
			const product = directory.get(line.product_id ?? undefined),
				category = product?.categories?.[0];
			const key = !product ? 'unknown' : category ? String(category.id) : 'uncategorised';
			const part = parts.get(key) ?? { key, label: category?.name || '', amount: 0, quantity: 0 };
			part.amount += Number(line.total || 0) + Number(line.total_tax || 0);
			part.quantity += Number.isFinite(line.quantity) ? line.quantity! : 0;
			parts.set(key, part);
			totalLines++;
			if (!product) unknownLines++;
		}
	return {
		parts: [...parts.values()]
			.map((row) => ({
				...row,
				amount: round(row.amount, num_decimals),
				share: totals.total ? row.amount / totals.total : 0,
			}))
			.sort((a, b) => b.amount - a.amount),
		unknownLines,
		totalLines,
	};
}
