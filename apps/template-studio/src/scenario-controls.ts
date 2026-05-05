import type {
	ReceiptCustomer,
	ReceiptData,
	ReceiptDiscount,
	ReceiptFee,
	ReceiptFiscal,
	ReceiptLineItem,
	ReceiptPayment,
	ReceiptRefund,
	ReceiptShipping,
	ReceiptTaxSummaryItem,
	ReceiptTotals,
} from '@wcpos/printer/encoder';

import type { ResolvedScenarios } from './randomizer';

export type ScenarioKey =
	| keyof Omit<ResolvedScenarios, 'cartSize'>
	| 'taxBreakdown'
	| 'customerDetails'
	| 'giftReceipt'
	| 'barcodeQr';

export type ScenarioState = Record<ScenarioKey, boolean>;

export interface ScenarioChipDefinition {
	key: ScenarioKey;
	label: string;
}

export const SCENARIO_CHIPS: readonly ScenarioChipDefinition[] = [
	{ key: 'emptyCart', label: 'empty cart' },
	{ key: 'refund', label: 'refund' },
	{ key: 'rtl', label: 'RTL' },
	{ key: 'multicurrency', label: 'multi-currency' },
	{ key: 'multiPayment', label: 'multi-payment' },
	{ key: 'fiscal', label: 'fiscal' },
	{ key: 'longNames', label: 'long names' },
	{ key: 'hasDiscounts', label: 'discounts' },
	{ key: 'hasFees', label: 'fees' },
	{ key: 'hasShipping', label: 'shipping' },
	{ key: 'taxBreakdown', label: 'tax breakdown' },
	{ key: 'customerDetails', label: 'customer details' },
	{ key: 'giftReceipt', label: 'gift receipt' },
	{ key: 'barcodeQr', label: 'barcode/QR' },
];

const TAX_RATE = 10;
const TAX_LABEL = 'VAT';

export function createScenarioState(
	scenarios: Partial<Omit<ResolvedScenarios, 'cartSize'>>,
	data?: ReceiptData
): ScenarioState {
	return {
		emptyCart: scenarios.emptyCart ?? Boolean(data && data.lines.length === 0),
		refund: scenarios.refund ?? Boolean(data?.refunds && data.refunds.length > 0),
		rtl: scenarios.rtl ?? Boolean(data && data.presentation_hints.locale.startsWith('ar')),
		multicurrency: scenarios.multicurrency ?? Boolean(data && data.meta.currency !== 'USD'),
		multiPayment: scenarios.multiPayment ?? Boolean(data && data.payments.length > 1),
		fiscal: scenarios.fiscal ?? Boolean(data && data.fiscal.immutable_id),
		longNames:
			scenarios.longNames ?? Boolean(data && data.lines.some((line) => line.name.length > 40)),
		hasDiscounts: scenarios.hasDiscounts ?? Boolean(data && data.discounts.length > 0),
		hasFees: scenarios.hasFees ?? Boolean(data && data.fees.length > 0),
		hasShipping: scenarios.hasShipping ?? Boolean(data && data.shipping.length > 0),
		taxBreakdown: Boolean(data && data.tax_summary.length > 0),
		customerDetails: Boolean(data && hasCustomerDetails(data.customer)),
		giftReceipt: Boolean(data && data.presentation_hints.display_tax === 'hidden'),
		barcodeQr: Boolean(data && data.fiscal.qr_payload),
	};
}

export function mergeScenarioOverrides(
	baseState: ScenarioState,
	overrides: Partial<Record<ScenarioKey, boolean>>
): ScenarioState {
	return { ...baseState, ...overrides };
}

export function toggleScenarioOverride(
	overrides: Partial<Record<ScenarioKey, boolean>>,
	key: ScenarioKey,
	nextValue: boolean
): Partial<Record<ScenarioKey, boolean>> {
	return { ...overrides, [key]: nextValue };
}

export function applyScenarioState(data: ReceiptData, state: ScenarioState): ReceiptData {
	let next = structuredClone(data) as ReceiptData;

	if (state.emptyCart) {
		next = {
			...next,
			lines: [],
			fees: [],
			shipping: [],
			discounts: [],
			refunds: [],
			tax_summary: [],
			payments: [buildSinglePayment(0)],
			totals: emptyTotals(),
		};
	} else if (next.lines.length === 0) {
		next.lines = [buildDefaultLine()];
	}

	next.fees = state.emptyCart || !state.hasFees ? [] : ensureItems(next.fees, [buildFee()]);
	next.shipping =
		state.emptyCart || !state.hasShipping ? [] : ensureItems(next.shipping, [buildShipping()]);
	next.discounts =
		state.emptyCart || !state.hasDiscounts ? [] : ensureItems(next.discounts, [buildDiscount()]);

	next.lines = state.longNames ? applyLongNames(next.lines) : applyShortNames(next.lines);
	next = applyLocale(next, state.rtl);
	next = applyCurrency(next, state.multicurrency);
	next.customer = state.customerDetails
		? ensureCustomerDetails(next.customer)
		: stripCustomerDetails(next.customer);
	next.presentation_hints = {
		...next.presentation_hints,
		display_tax: state.giftReceipt
			? 'hidden'
			: normalizeVisibleTax(next.presentation_hints.display_tax),
	};
	next.i18n = {
		...next.i18n,
		gift_receipt: 'Gift Receipt',
		gift_return_policy: 'Items may be returned or exchanged within 30 days with this receipt.',
	};

	next.totals = computeTotals(next.lines, next.fees, next.shipping, next.discounts, []);
	next.tax_summary = state.taxBreakdown && !state.emptyCart ? buildTaxSummary(next) : [];
	next.refunds = state.refund && !state.emptyCart ? ensureRefund(next) : [];
	if (next.refunds.length > 0) {
		next.totals.refund_total = round(
			next.refunds.reduce((sum, refund) => sum + (refund.amount ?? 0), 0)
		);
	} else {
		delete next.totals.refund_total;
		next.lines = next.lines.map(({ qty_refunded, total_refunded, ...line }) => line);
	}

	next.payments = state.multiPayment
		? buildSplitPayments(next.totals.grand_total_incl)
		: [buildSinglePayment(next.totals.grand_total_incl)];
	next.fiscal = applyFiscal(next, state.fiscal, state.barcodeQr);

	return next;
}

function hasCustomerDetails(customer: ReceiptCustomer): boolean {
	return Boolean(
		customer.name !== 'Guest customer' ||
		customer.tax_id ||
		(customer.tax_ids && customer.tax_ids.length > 0) ||
		Object.keys(customer.billing_address ?? {}).length > 0 ||
		Object.keys(customer.shipping_address ?? {}).length > 0
	);
}

function ensureItems<T>(current: T[], fallback: T[]): T[] {
	return current.length > 0 ? current : fallback;
}

function round(value: number): number {
	return Math.round(value * 100) / 100;
}

function taxableExcl(totalIncl: number): number {
	return round(totalIncl / (1 + TAX_RATE / 100));
}

function taxLine(totalIncl: number) {
	return {
		code: `vat-${TAX_RATE}`,
		rate: TAX_RATE,
		label: `${TAX_LABEL} ${TAX_RATE}%`,
		amount: round(totalIncl - taxableExcl(totalIncl)),
	};
}

function buildDefaultLine(): ReceiptLineItem {
	const totalIncl = 12;
	const totalExcl = taxableExcl(totalIncl);
	return {
		key: 'scenario-default-line',
		sku: 'SCENARIO-1',
		name: 'Espresso Beans 250g',
		qty: 1,
		unit_subtotal: totalIncl,
		unit_subtotal_incl: totalIncl,
		unit_subtotal_excl: totalExcl,
		unit_price: totalIncl,
		unit_price_incl: totalIncl,
		unit_price_excl: totalExcl,
		line_subtotal: totalIncl,
		line_subtotal_incl: totalIncl,
		line_subtotal_excl: totalExcl,
		discounts: 0,
		discounts_incl: 0,
		discounts_excl: 0,
		line_total: totalIncl,
		line_total_incl: totalIncl,
		line_total_excl: totalExcl,
		meta: [{ key: 'Size', value: '250g' }],
		taxes: [taxLine(totalIncl)],
	};
}

function buildFee(): ReceiptFee {
	const totalIncl = 2.5;
	return {
		label: 'Service charge',
		total: totalIncl,
		total_incl: totalIncl,
		total_excl: taxableExcl(totalIncl),
		taxes: [taxLine(totalIncl)],
	};
}

function buildShipping(): ReceiptShipping {
	const totalIncl = 6.95;
	return {
		label: 'Standard shipping',
		method_id: 'flat_rate',
		total: totalIncl,
		total_incl: totalIncl,
		total_excl: taxableExcl(totalIncl),
		meta: [{ key: 'Tracking', value: '1Z-SCENARIO' }],
		taxes: [taxLine(totalIncl)],
	};
}

function buildDiscount(): ReceiptDiscount {
	const totalIncl = -3;
	return {
		label: 'WELCOME10',
		code: 'WELCOME10',
		codes: 'WELCOME10',
		total: totalIncl,
		total_incl: totalIncl,
		total_excl: taxableExcl(totalIncl),
	};
}

function emptyTotals(): ReceiptTotals {
	return {
		subtotal: 0,
		subtotal_incl: 0,
		subtotal_excl: 0,
		discount_total: 0,
		discount_total_incl: 0,
		discount_total_excl: 0,
		tax_total: 0,
		grand_total: 0,
		grand_total_incl: 0,
		grand_total_excl: 0,
		paid_total: 0,
		change_total: 0,
	};
}

function computeTotals(
	lines: ReceiptLineItem[],
	fees: ReceiptFee[],
	shipping: ReceiptShipping[],
	discounts: ReceiptDiscount[],
	refunds: ReceiptRefund[]
): ReceiptTotals {
	const subtotalIncl = round(lines.reduce((sum, line) => sum + line.line_subtotal_incl, 0));
	const subtotalExcl = round(lines.reduce((sum, line) => sum + line.line_subtotal_excl, 0));
	const feeIncl = fees.reduce((sum, fee) => sum + fee.total_incl, 0);
	const feeExcl = fees.reduce((sum, fee) => sum + fee.total_excl, 0);
	const shippingIncl = shipping.reduce((sum, item) => sum + item.total_incl, 0);
	const shippingExcl = shipping.reduce((sum, item) => sum + item.total_excl, 0);
	const discountIncl = discounts.reduce((sum, discount) => sum + discount.total_incl, 0);
	const discountExcl = discounts.reduce((sum, discount) => sum + discount.total_excl, 0);
	const grandIncl = round(subtotalIncl + feeIncl + shippingIncl + discountIncl);
	const grandExcl = round(subtotalExcl + feeExcl + shippingExcl + discountExcl);
	const totals: ReceiptTotals = {
		subtotal: subtotalIncl,
		subtotal_incl: subtotalIncl,
		subtotal_excl: subtotalExcl,
		discount_total: round(discountIncl),
		discount_total_incl: round(discountIncl),
		discount_total_excl: round(discountExcl),
		tax_total: round(grandIncl - grandExcl),
		grand_total: grandIncl,
		grand_total_incl: grandIncl,
		grand_total_excl: grandExcl,
		paid_total: grandIncl,
		change_total: 0,
	};
	const refundTotal = refunds.reduce((sum, refund) => sum + (refund.amount ?? 0), 0);
	if (refundTotal > 0) totals.refund_total = round(refundTotal);
	return totals;
}

function buildTaxSummary(data: ReceiptData): ReceiptTaxSummaryItem[] {
	const taxableExcl = data.totals.grand_total_excl;
	const taxableIncl = data.totals.grand_total_incl;
	if (taxableIncl === 0 && taxableExcl === 0) return [];
	return [
		{
			code: `vat-${TAX_RATE}`,
			rate: TAX_RATE,
			label: `${TAX_LABEL} ${TAX_RATE}%`,
			compound: false,
			taxable_amount_excl: taxableExcl,
			tax_amount: round(taxableIncl - taxableExcl),
			taxable_amount_incl: taxableIncl,
		},
	];
}

function ensureRefund(data: ReceiptData): ReceiptRefund[] {
	if (data.refunds && data.refunds.length > 0) return data.refunds;
	const line = data.lines[0] ?? buildDefaultLine();
	const qty = Math.min(Math.max(line.qty, 1), 1);
	const amount = round(line.line_total_incl / Math.max(line.qty, 1));
	return [
		{
			id: 9001,
			amount,
			subtotal: amount,
			tax_total: round(amount - taxableExcl(amount)),
			reason: 'Customer return',
			refunded_by_id: 1,
			refunded_by_name: 'Store Manager',
			refunded_payment: true,
			destination: 'original_method',
			gateway_id: 'cash',
			gateway_title: 'Cash',
			processing_mode: 'manual',
			lines: [{ name: line.name, sku: line.sku, qty, total: amount }],
		},
	];
}

function buildSinglePayment(amount: number): ReceiptPayment {
	return {
		method_id: 'card',
		method_title: 'Card',
		amount: round(amount),
		transaction_id: '**** **** **** 4242',
	};
}

function buildSplitPayments(amount: number): ReceiptPayment[] {
	const first = round(amount * 0.6);
	const second = round(amount - first);
	return [
		{
			method_id: 'card',
			method_title: 'Card',
			amount: first,
			transaction_id: '**** **** **** 4242',
		},
		{ method_id: 'cash', method_title: 'Cash', amount: second, tendered: second, change: 0 },
	];
}

function applyFiscal(data: ReceiptData, fiscal: boolean, barcodeQr: boolean): ReceiptFiscal {
	if (!fiscal && !barcodeQr) return {};
	const base: ReceiptFiscal = fiscal
		? {
				immutable_id: `IMM-${data.meta.order_number}`,
				receipt_number: `R-${data.meta.order_number}`,
				sequence: data.meta.order_id,
				hash: 'scenariohash',
				signature_excerpt: 'SCENARIO',
				tax_agency_code: 'AEAT',
				signed_at: data.meta.created_at_gmt,
				document_label: 'Fiscal Receipt',
				is_reprint: false,
				reprint_count: 0,
				extra_fields: { invoice_serial: `${data.meta.order_number}-SCN` },
			}
		: {};
	if (barcodeQr) base.qr_payload = `wcpos://receipt/${data.meta.order_number}/scenario`;
	return base;
}

function applyLongNames(lines: ReceiptLineItem[]): ReceiptLineItem[] {
	if (lines.some((line) => line.name.length > 40)) return lines;
	return lines.map((line, index) => ({
		...line,
		name:
			index === 0
				? 'Limited-edition single-origin Ethiopian Yirgacheffe whole-bean coffee 250g with tasting notes'
				: line.name,
	}));
}

function applyShortNames(lines: ReceiptLineItem[]): ReceiptLineItem[] {
	return lines.map((line) => ({
		...line,
		name: line.name.length > 40 ? 'Espresso Beans 250g' : line.name,
	}));
}

function applyLocale(data: ReceiptData, rtl: boolean): ReceiptData {
	if (rtl) {
		return {
			...data,
			presentation_hints: { ...data.presentation_hints, locale: 'ar_SA' },
			store: { ...data.store, name: 'مقهى ورد' },
		};
	}
	return {
		...data,
		presentation_hints: {
			...data.presentation_hints,
			locale: data.presentation_hints.locale.startsWith('ar')
				? 'en_US'
				: data.presentation_hints.locale,
		},
	};
}

function applyCurrency(data: ReceiptData, multicurrency: boolean): ReceiptData {
	const currency = multicurrency
		? 'EUR'
		: data.meta.currency === 'EUR'
			? 'USD'
			: data.meta.currency;
	return {
		...data,
		meta: { ...data.meta, currency },
		order: data.order ? { ...data.order, currency } : data.order,
	};
}

function ensureCustomerDetails(customer: ReceiptCustomer): ReceiptCustomer {
	return {
		...customer,
		id: customer.id ?? 42,
		name: customer.name && customer.name !== 'Guest customer' ? customer.name : 'Alex Customer',
		billing_address:
			customer.billing_address && Object.keys(customer.billing_address).length > 0
				? customer.billing_address
				: {
						first_name: 'Alex',
						last_name: 'Customer',
						address_1: '100 Market Street',
						city: 'San Francisco',
						postcode: '94105',
						country: 'US',
						email: 'alex@example.com',
						phone: '+1 415 555 0100',
					},
		shipping_address:
			customer.shipping_address && Object.keys(customer.shipping_address).length > 0
				? customer.shipping_address
				: {
						first_name: 'Alex',
						last_name: 'Customer',
						address_1: '200 Warehouse Way',
						city: 'Oakland',
						postcode: '94607',
						country: 'US',
					},
		tax_id: customer.tax_id || 'US123456789',
		tax_ids:
			customer.tax_ids && customer.tax_ids.length > 0
				? customer.tax_ids
				: [{ type: 'us_ein', value: 'US123456789', country: 'US', label: 'EIN' }],
	};
}

function stripCustomerDetails(customer: ReceiptCustomer): ReceiptCustomer {
	return {
		...customer,
		id: null,
		name: 'Guest customer',
		billing_address: {},
		shipping_address: {},
		tax_id: '',
		tax_ids: [],
	};
}

function normalizeVisibleTax(displayTax: ReceiptData['presentation_hints']['display_tax']) {
	return displayTax === 'hidden' ? 'incl' : displayTax;
}
