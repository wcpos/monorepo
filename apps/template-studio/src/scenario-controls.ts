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
const DEFAULT_CURRENCY = 'USD';

const LOCALE_CURRENCIES: Record<string, string> = {
	en_US: 'USD',
	en_GB: 'GBP',
	en_AU: 'AUD',
	en_CA: 'CAD',
	es_ES: 'EUR',
	es_MX: 'MXN',
	fr_FR: 'EUR',
	fr_CA: 'CAD',
	de_DE: 'EUR',
	it_IT: 'EUR',
	pt_BR: 'BRL',
	pt_PT: 'EUR',
	nl_NL: 'EUR',
	sv_SE: 'SEK',
	da_DK: 'DKK',
	nb_NO: 'NOK',
	ja_JP: 'JPY',
	zh_CN: 'CNY',
	zh_TW: 'TWD',
	ko_KR: 'KRW',
	ar_SA: 'SAR',
	ar_AE: 'AED',
	he_IL: 'ILS',
	ru_RU: 'RUB',
};

const LOCALIZED_SCENARIO_I18N: Record<string, Partial<ReceiptData['i18n']>> = {
	ar_SA: {
		gift_receipt: 'إيصال هدية',
		gift_return_policy: 'يمكن إرجاع أو استبدال الأصناف خلال 30 يوماً مع هذا الإيصال.',
	},
	ja_JP: {
		gift_receipt: 'ギフトレシート',
		gift_return_policy: '返品・交換には30日以内にこのレシートをご提示ください。',
	},
};

export function createScenarioState(
	scenarios: Partial<Omit<ResolvedScenarios, 'cartSize'>>,
	data?: ReceiptData
): ScenarioState {
	const fixtureCurrency = data?.order.currency || DEFAULT_CURRENCY;
	const localCurrency = localeCurrency(data?.presentation_hints.locale);
	return {
		emptyCart: scenarios.emptyCart ?? Boolean(data && data.lines.length === 0),
		refund: scenarios.refund ?? Boolean(data?.refunds && data.refunds.length > 0),
		rtl: scenarios.rtl ?? Boolean(data && data.presentation_hints.locale.startsWith('ar')),
		multicurrency: scenarios.multicurrency ?? fixtureCurrency !== localCurrency,
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
	const localizedScenarioI18n = LOCALIZED_SCENARIO_I18N[next.presentation_hints.locale] ?? {};
	next.i18n = {
		...next.i18n,
		gift_receipt: localizedScenarioI18n.gift_receipt ?? next.i18n?.gift_receipt ?? 'Gift Receipt',
		gift_return_policy:
			localizedScenarioI18n.gift_return_policy ??
			next.i18n?.gift_return_policy ??
			'Items may be returned or exchanged within 30 days with this receipt.',
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
		? buildSplitPayments(next.totals.total_incl)
		: [buildSinglePayment(next.totals.total_incl)];
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
	const totalIncl = 3;
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
		total: 0,
		total_incl: 0,
		total_excl: 0,
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
	const lineTotals = lines.reduce(
		(totals, line) => ({
			subtotalIncl: totals.subtotalIncl + line.line_subtotal_incl,
			subtotalExcl: totals.subtotalExcl + line.line_subtotal_excl,
			totalIncl: totals.totalIncl + line.line_total_incl,
			totalExcl: totals.totalExcl + line.line_total_excl,
		}),
		{ subtotalIncl: 0, subtotalExcl: 0, totalIncl: 0, totalExcl: 0 }
	);
	const subtotalIncl = round(lineTotals.subtotalIncl);
	const subtotalExcl = round(lineTotals.subtotalExcl);
	const lineDiscountIncl = lineTotals.subtotalIncl - lineTotals.totalIncl;
	const lineDiscountExcl = lineTotals.subtotalExcl - lineTotals.totalExcl;
	const feeIncl = fees.reduce((sum, fee) => sum + fee.total_incl, 0);
	const feeExcl = fees.reduce((sum, fee) => sum + fee.total_excl, 0);
	const shippingIncl = shipping.reduce((sum, item) => sum + item.total_incl, 0);
	const shippingExcl = shipping.reduce((sum, item) => sum + item.total_excl, 0);
	const discountIncl =
		lineDiscountIncl + discounts.reduce((sum, discount) => sum + discount.total_incl, 0);
	const discountExcl =
		lineDiscountExcl + discounts.reduce((sum, discount) => sum + discount.total_excl, 0);
	const grandIncl = round(subtotalIncl + feeIncl + shippingIncl - discountIncl);
	const grandExcl = round(subtotalExcl + feeExcl + shippingExcl - discountExcl);
	const totals: ReceiptTotals = {
		subtotal: subtotalIncl,
		subtotal_incl: subtotalIncl,
		subtotal_excl: subtotalExcl,
		discount_total: round(discountIncl),
		discount_total_incl: round(discountIncl),
		discount_total_excl: round(discountExcl),
		tax_total: round(grandIncl - grandExcl),
		total: grandIncl,
		total_incl: grandIncl,
		total_excl: grandExcl,
		paid_total: grandIncl,
		change_total: 0,
	};
	const refundTotal = refunds.reduce((sum, refund) => sum + (refund.amount ?? 0), 0);
	if (refundTotal > 0) totals.refund_total = round(refundTotal);
	return totals;
}

function buildTaxSummary(data: ReceiptData): ReceiptTaxSummaryItem[] {
	const grandExcl = data.totals.total_excl;
	const grandIncl = data.totals.total_incl;
	if (grandIncl === 0 && grandExcl === 0) return [];
	return [
		{
			code: `vat-${TAX_RATE}`,
			rate: TAX_RATE,
			label: `${TAX_LABEL} ${TAX_RATE}%`,
			compound: false,
			taxable_amount_excl: grandExcl,
			tax_amount: round(grandIncl - grandExcl),
			taxable_amount_incl: grandIncl,
		},
	];
}

function ensureRefund(data: ReceiptData): ReceiptRefund[] {
	if (data.refunds && data.refunds.length > 0) return data.refunds;
	const line = data.lines[0] ?? buildDefaultLine();
	const qty = Math.min(Math.max(line.qty, 1), 1);
	const amount = round(line.line_total_incl / Math.max(line.qty, 1));
	const amountExcl = taxableExcl(amount);
	const taxAmount = round(amount - amountExcl);
	return [
		{
			id: 9001,
			date: { ...data.order.created },
			amount,
			subtotal: amount,
			tax_total: taxAmount,
			reason: 'Customer return',
			refunded_by_id: 1,
			refunded_by_name: 'Store Manager',
			refunded_payment: true,
			destination: 'original_method',
			gateway_id: 'cash',
			gateway_title: 'Cash',
			processing_mode: 'manual',
			lines: [
				{
					name: line.name,
					sku: line.sku,
					qty,
					total: amount,
					total_incl: amount,
					total_excl: amountExcl,
					line_total: amount,
					line_total_incl: amount,
					line_total_excl: amountExcl,
					unit_total: amount,
					unit_total_incl: amount,
					unit_total_excl: amountExcl,
					taxes: [
						{
							code: `vat-${TAX_RATE}`,
							rate: TAX_RATE,
							label: `${TAX_LABEL} ${TAX_RATE}%`,
							amount: taxAmount,
						},
					],
				},
			],
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
				immutable_id: `IMM-${data.order.number}`,
				receipt_number: `R-${data.order.number}`,
				sequence: data.order.id,
				hash: 'scenariohash',
				signature_excerpt: 'SCENARIO',
				tax_agency_code: 'AEAT',
				signed_at: data.order.created.datetime,
				document_label: 'Fiscal Receipt',
				is_reprint: false,
				reprint_count: 0,
				extra_fields: { invoice_serial: `${data.order.number}-SCN` },
			}
		: {};
	if (barcodeQr) base.qr_payload = `wcpos://receipt/${data.order.number}/scenario`;
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

function localeCurrency(locale: string | undefined): string {
	if (!locale) return DEFAULT_CURRENCY;
	return (
		LOCALE_CURRENCIES[locale] ?? LOCALE_CURRENCIES[locale.replace(/-/g, '_')] ?? DEFAULT_CURRENCY
	);
}

function alternateCurrencyFor(localeCurrencyCode: string): string {
	return localeCurrencyCode === DEFAULT_CURRENCY ? 'EUR' : DEFAULT_CURRENCY;
}

function applyCurrency(data: ReceiptData, multicurrency: boolean): ReceiptData {
	const localCurrency = localeCurrency(data.presentation_hints.locale);
	const fixtureCurrency = data.order.currency || localCurrency;
	const currency = multicurrency
		? fixtureCurrency === localCurrency
			? alternateCurrencyFor(localCurrency)
			: fixtureCurrency
		: localCurrency;
	return {
		...data,
		order: { ...data.order, currency },
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
