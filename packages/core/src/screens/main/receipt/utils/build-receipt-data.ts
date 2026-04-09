/**
 * Builds the canonical receipt_data object from local RxDB documents.
 * Used for offline Mustache template rendering when the receipts API is unavailable.
 *
 * Matches the shape returned by GET /wcpos/v1/receipts/{order_id} → data field.
 * See field-picker.tsx for the full field reference.
 */

interface ReceiptMeta {
	order_number: string;
	order_date: string;
	currency: string;
	status: string;
}

interface ReceiptStore {
	name: string;
	address: string;
	phone: string;
	email: string;
}

interface ReceiptCustomer {
	name: string;
	email: string;
	phone: string;
	billing_address: string;
	shipping_address: string;
}

interface ReceiptLine {
	name: string;
	quantity: number;
	price: number;
	total: string;
	sku: string;
	unit_price: string;
	unit_price_incl: string;
	unit_price_excl: string;
	line_subtotal: string;
	line_subtotal_incl: string;
	line_subtotal_excl: string;
	discounts: string;
	discounts_incl: string;
	discounts_excl: string;
	line_total: string;
	line_total_incl: string;
	line_total_excl: string;
	meta: { key: string; value: string }[];
}

interface ReceiptTotals {
	subtotal: string;
	subtotal_incl: string;
	subtotal_excl: string;
	tax_total: string;
	discount_total: string;
	discount_total_incl: string;
	discount_total_excl: string;
	grand_total: string;
	grand_total_incl: string;
	grand_total_excl: string;
}

interface ReceiptAdjustment {
	label: string;
	total: string;
	total_incl: string;
	total_excl: string;
}

interface ReceiptPayment {
	method: string;
	amount: string;
	transaction_id: string;
}

interface ReceiptFiscal {
	submission_status: string;
	fiscal_id: string;
}

interface ReceiptPresentationHints {
	display_tax: 'incl' | 'excl' | 'hidden';
	prices_entered_with_tax: boolean;
	rounding_mode: string;
	locale: string;
}

export interface ReceiptData {
	meta: ReceiptMeta;
	store: ReceiptStore;
	customer: ReceiptCustomer;
	lines: ReceiptLine[];
	fees: ReceiptAdjustment[];
	shipping: ReceiptAdjustment[];
	discounts: ReceiptAdjustment[];
	totals: ReceiptTotals;
	payments: ReceiptPayment[];
	fiscal: ReceiptFiscal;
	presentation_hints: ReceiptPresentationHints;
}

function formatAddress(addr: Record<string, string | undefined>): string {
	const parts = [
		addr.address_1,
		addr.address_2,
		addr.city,
		[addr.state, addr.postcode].filter(Boolean).join(' '),
		addr.country,
	].filter(Boolean);
	return parts.join(', ');
}

function toNum(value: unknown): number {
	const n = typeof value === 'string' ? parseFloat(value) : Number(value);
	return Number.isFinite(n) ? n : 0;
}

function getDisplayValue({
	incl,
	excl,
	displayTax,
}: {
	incl: number;
	excl: number;
	displayTax: 'incl' | 'excl';
}) {
	return displayTax === 'incl' ? incl : excl;
}

function mapAdjustment(
	label: string,
	excl: number,
	tax: number,
	displayTax: 'incl' | 'excl',
	dp: number
): ReceiptAdjustment {
	const incl = excl + tax;

	return {
		label,
		total: getDisplayValue({ incl, excl, displayTax }).toFixed(dp),
		total_incl: incl.toFixed(dp),
		total_excl: excl.toFixed(dp),
	};
}

export function buildReceiptData(
	order: Record<string, any>,
	store: Record<string, any>,
	dp: number = 2
): ReceiptData {
	const billing = order.billing || {};
	const shipping = order.shipping || {};
	const lineItems = order.line_items || [];
	const displayTax = store.tax_display_cart === 'incl' ? 'incl' : 'excl';
	const pricesEnteredWithTax =
		store.prices_include_tax === 'yes' || store.prices_include_tax === true;
	const locale = typeof store.locale === 'string' && store.locale ? store.locale : 'en_US';

	const mappedLines: ReceiptLine[] = lineItems.map((item: Record<string, any>) => {
		const quantity = toNum(item.quantity);
		const subtotalExcl = toNum(item.subtotal);
		const subtotalIncl = subtotalExcl + toNum(item.subtotal_tax);
		const totalExcl = toNum(item.total);
		const totalIncl = totalExcl + toNum(item.total_tax);
		const unitPriceExcl = quantity > 0 ? subtotalExcl / quantity : toNum(item.price);
		const unitPriceIncl =
			quantity > 0 ? subtotalIncl / quantity : toNum(item.price) + toNum(item.total_tax);
		const discountsExcl = subtotalExcl - totalExcl;
		const discountsIncl = subtotalIncl - totalIncl;
		const meta = Array.isArray(item.meta_data)
			? item.meta_data.map((entry: Record<string, any>) => ({
					key: String(entry?.key ?? ''),
					value: String(entry?.value ?? ''),
				}))
			: [];

		return {
			name: item.name || '',
			quantity,
			price: item.price || 0,
			total: item.total || '0.00',
			sku: item.sku || '',
			unit_price: getDisplayValue({
				incl: unitPriceIncl,
				excl: unitPriceExcl,
				displayTax,
			}).toFixed(dp),
			unit_price_incl: unitPriceIncl.toFixed(dp),
			unit_price_excl: unitPriceExcl.toFixed(dp),
			line_subtotal: getDisplayValue({
				incl: subtotalIncl,
				excl: subtotalExcl,
				displayTax,
			}).toFixed(dp),
			line_subtotal_incl: subtotalIncl.toFixed(dp),
			line_subtotal_excl: subtotalExcl.toFixed(dp),
			discounts: getDisplayValue({
				incl: discountsIncl,
				excl: discountsExcl,
				displayTax,
			}).toFixed(dp),
			discounts_incl: discountsIncl.toFixed(dp),
			discounts_excl: discountsExcl.toFixed(dp),
			line_total: getDisplayValue({ incl: totalIncl, excl: totalExcl, displayTax }).toFixed(dp),
			line_total_incl: totalIncl.toFixed(dp),
			line_total_excl: totalExcl.toFixed(dp),
			meta,
		};
	});

	const subtotalExcl = mappedLines.reduce((sum, line) => sum + toNum(line.line_subtotal_excl), 0);
	const subtotalIncl = mappedLines.reduce((sum, line) => sum + toNum(line.line_subtotal_incl), 0);
	const lineDiscountTotalExcl = mappedLines.reduce(
		(sum, line) => sum + toNum(line.discounts_excl),
		0
	);
	const lineDiscountTotalIncl = mappedLines.reduce(
		(sum, line) => sum + toNum(line.discounts_incl),
		0
	);
	const discountTotalExcl =
		order.discount_total != null ? toNum(order.discount_total) : lineDiscountTotalExcl;
	const discountTax = toNum(order.discount_tax);
	const discountTotalIncl =
		order.discount_total != null ? discountTotalExcl + discountTax : lineDiscountTotalIncl;
	const grandTotalIncl = toNum(order.total);
	const grandTotalExcl = grandTotalIncl - toNum(order.total_tax);
	const mappedFees: ReceiptAdjustment[] = (order.fee_lines || []).map((line: Record<string, any>) =>
		mapAdjustment(String(line.name || ''), toNum(line.total), toNum(line.total_tax), displayTax, dp)
	);
	const mappedShipping: ReceiptAdjustment[] = (order.shipping_lines || []).map(
		(line: Record<string, any>) =>
			mapAdjustment(
				String(line.method_title || line.method_id || ''),
				toNum(line.total),
				toNum(line.total_tax),
				displayTax,
				dp
			)
	);
	const mappedDiscounts: ReceiptAdjustment[] = (order.coupon_lines || []).map(
		(line: Record<string, any>) =>
			mapAdjustment(
				String(line.code || ''),
				toNum(line.discount),
				toNum(line.discount_tax),
				displayTax,
				dp
			)
	);

	return {
		meta: {
			order_number: order.number || String(order.id || ''),
			order_date: order.date_created || '',
			currency: order.currency || '',
			status: order.status || '',
		},
		store: {
			name: store.name || '',
			address: formatAddress({
				address_1: store.store_address,
				address_2: store.store_address_2,
				city: store.store_city,
				state: store.store_state,
				postcode: store.store_postcode,
				country: store.store_country,
			}),
			phone: store.phone || '',
			email: store.email || '',
		},
		customer: {
			name: [billing.first_name, billing.last_name].filter(Boolean).join(' '),
			email: billing.email || '',
			phone: billing.phone || '',
			billing_address: formatAddress(billing),
			shipping_address: formatAddress(shipping),
		},
		lines: mappedLines,
		fees: mappedFees,
		shipping: mappedShipping,
		discounts: mappedDiscounts,
		totals: {
			subtotal: getDisplayValue({ incl: subtotalIncl, excl: subtotalExcl, displayTax }).toFixed(dp),
			subtotal_incl: subtotalIncl.toFixed(dp),
			subtotal_excl: subtotalExcl.toFixed(dp),
			tax_total: toNum(order.total_tax).toFixed(dp),
			discount_total: getDisplayValue({
				incl: discountTotalIncl,
				excl: discountTotalExcl,
				displayTax,
			}).toFixed(dp),
			discount_total_incl: discountTotalIncl.toFixed(dp),
			discount_total_excl: discountTotalExcl.toFixed(dp),
			grand_total: getDisplayValue({
				incl: grandTotalIncl,
				excl: grandTotalExcl,
				displayTax,
			}).toFixed(dp),
			grand_total_incl: grandTotalIncl.toFixed(dp),
			grand_total_excl: grandTotalExcl.toFixed(dp),
		},
		payments: [
			{
				method: order.payment_method_title || order.payment_method || '',
				amount: order.total || '0.00',
				transaction_id: order.transaction_id || '',
			},
		],
		fiscal: {
			submission_status: '',
			fiscal_id: '',
		},
		presentation_hints: {
			display_tax: displayTax,
			prices_entered_with_tax: pricesEnteredWithTax,
			rounding_mode: 'round',
			locale,
		},
	};
}
