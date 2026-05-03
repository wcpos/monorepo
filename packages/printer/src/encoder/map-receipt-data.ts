/**
 * Maps receipt data from the offline rendering shape (produced by buildReceiptData
 * in the core package) to the canonical ReceiptData shape expected by encodeReceipt.
 *
 * The offline rendering system builds a simplified, Mustache-friendly structure
 * from RxDB documents. This mapper bridges that gap so the printer encoder can
 * accept either shape without modification.
 *
 * Defensive throughout — missing fields, wrong types, and nulls are all handled
 * with sensible defaults so the encoder never blows up on bad input.
 */

import type {
	ReceiptCashier,
	ReceiptCustomer,
	ReceiptData,
	ReceiptDiscount,
	ReceiptFee,
	ReceiptFiscal,
	ReceiptLineItem,
	ReceiptOrderMeta,
	ReceiptPayment,
	ReceiptPresentationHints,
	ReceiptRefund,
	ReceiptShipping,
	ReceiptStoreMeta,
	ReceiptTaxSummaryItem,
	ReceiptTotals,
} from './types';

/** Safe number coercion — handles strings, nulls, undefined, NaN. */
function toNum(value: unknown): number {
	if (value == null) return 0;
	const n = typeof value === 'string' ? parseFloat(value) : Number(value);
	return Number.isFinite(n) ? n : 0;
}

/** Safe string coercion. */
function toStr(value: unknown): string {
	if (value == null) return '';
	return String(value);
}

/** Safe array coercion. */
function toArr(value: unknown): unknown[] {
	return Array.isArray(value) ? value : [];
}

/**
 * Checks whether the data already matches the canonical ReceiptData shape.
 * We look for fields that exist only in the canonical shape and never in the
 * offline rendering shape (e.g., `meta.schema_version`, `meta.order_id`,
 * `totals.subtotal_incl`).
 */
function isCanonicalShape(data: Record<string, any>): boolean {
	const meta = data.meta;
	const totals = data.totals;

	// Require markers from at least two sections to avoid false positives
	const hasMeta =
		meta && typeof meta === 'object' && 'schema_version' in meta && 'order_id' in meta;
	const hasTotals = totals && typeof totals === 'object' && 'subtotal_incl' in totals;

	return !!(hasMeta && hasTotals);
}

function mapMeta(src: Record<string, any>): ReceiptOrderMeta {
	return {
		schema_version: 1,
		mode: toStr(src.status) || 'live',
		created_at_gmt: toStr(src.order_date),
		order_id: 0, // Not available in the offline shape
		order_number: toStr(src.order_number),
		currency: toStr(src.currency),
	};
}

function mapStore(src: Record<string, any>): ReceiptStoreMeta {
	// The offline shape has a single `address` string. Split on commas
	// to produce address_lines for the encoder.
	const rawAddress = toStr(src.address);
	const addressLines = rawAddress
		? rawAddress
				.split(',')
				.map((s: string) => s.trim())
				.filter(Boolean)
		: [];

	return {
		name: toStr(src.name),
		address_lines: addressLines,
		phone: toStr(src.phone),
		email: toStr(src.email),
	};
}

function mapCustomer(src: Record<string, any>): ReceiptCustomer {
	// The offline shape stores addresses as formatted strings, not objects.
	// We can't reverse-parse them reliably, so leave the record-based fields empty.
	return {
		id: 0,
		name: toStr(src.name),
		billing_address: {},
		shipping_address: {},
	};
}

type DisplayTax = 'incl' | 'excl' | 'hidden' | 'itemized' | 'single';

function resolveDisplayTax(src: Record<string, any>): DisplayTax {
	const value = src.display_tax;
	if (value === 'excl' || value === 'hidden' || value === 'itemized' || value === 'single') {
		return value;
	}
	return 'incl';
}

function resolveDisplayValueSide(
	src: Pick<ReceiptPresentationHints, 'display_tax' | 'prices_entered_with_tax'>
): 'incl' | 'excl' {
	if (src.display_tax === 'incl' || src.display_tax === 'excl') {
		return src.display_tax;
	}

	return src.prices_entered_with_tax ? 'incl' : 'excl';
}

function mapLine(src: Record<string, any>, index: number, displayTax: DisplayTax): ReceiptLineItem {
	const qty = toNum(src.qty ?? src.quantity);
	const price = toNum(src.price ?? src.unit_price ?? src.unit_price_incl ?? src.unit_price_excl);
	const total = toNum(src.line_total ?? src.total ?? src.line_total_incl ?? src.line_total_excl);
	const unitPriceFallback = qty > 0 ? total / qty : price;
	const unitPriceIncl = toNum(src.unit_price_incl ?? src.unit_price ?? unitPriceFallback);
	const unitPriceExcl = toNum(src.unit_price_excl ?? src.unit_price ?? unitPriceFallback);
	const lineSubtotalIncl = toNum(src.line_subtotal_incl ?? src.line_subtotal ?? total);
	const lineSubtotalExcl = toNum(src.line_subtotal_excl ?? src.line_subtotal ?? total);
	const discountsIncl = toNum(src.discounts_incl ?? src.discounts);
	const discountsExcl = toNum(src.discounts_excl ?? src.discounts);
	const lineTotalIncl = toNum(src.line_total_incl ?? src.line_total ?? total);
	const lineTotalExcl = toNum(src.line_total_excl ?? src.line_total ?? total);
	const useExclSide = displayTax === 'excl';
	const displayUnitPrice = useExclSide ? unitPriceExcl : unitPriceIncl;
	const displayLineSubtotal = useExclSide ? lineSubtotalExcl : lineSubtotalIncl;
	const displayDiscounts = useExclSide ? discountsExcl : discountsIncl;
	const displayLineTotal = useExclSide ? lineTotalExcl : lineTotalIncl;

	const line: ReceiptLineItem = {
		key: toStr(src.key) || toStr(src.sku) || `line-${index}-${toStr(src.name).slice(0, 20)}`,
		sku: toStr(src.sku),
		name: toStr(src.name),
		qty,
		unit_price: displayUnitPrice,
		unit_price_incl: unitPriceIncl,
		unit_price_excl: unitPriceExcl,
		line_subtotal: displayLineSubtotal,
		line_subtotal_incl: lineSubtotalIncl,
		line_subtotal_excl: lineSubtotalExcl,
		discounts: displayDiscounts,
		discounts_incl: discountsIncl,
		discounts_excl: discountsExcl,
		line_total: displayLineTotal,
		line_total_incl: lineTotalIncl,
		line_total_excl: lineTotalExcl,
		meta: toArr(src.meta)
			.filter((entry): entry is Record<string, any> => !!entry && typeof entry === 'object')
			.map((entry) => ({
				key: toStr(entry.key),
				value: toStr(entry.value),
			})),
		taxes: toArr(src.taxes)
			.filter((entry): entry is Record<string, any> => !!entry && typeof entry === 'object')
			.map((entry) => ({
				code: toStr(entry.code),
				rate: entry.rate == null ? null : toNum(entry.rate),
				label: 'label' in entry ? toStr(entry.label) : undefined,
				amount: toNum(entry.amount),
			})),
	};

	if ('qty_refunded' in src && src.qty_refunded != null) {
		line.qty_refunded = toNum(src.qty_refunded);
	}
	if ('total_refunded' in src && src.total_refunded != null) {
		line.total_refunded = toNum(src.total_refunded);
	}

	// Pass through pre-discount per-unit subtotals when the canonical shape
	// supplies them — used by templates that want to display "was/now" pricing.
	if ('unit_subtotal_incl' in src) line.unit_subtotal_incl = toNum(src.unit_subtotal_incl);
	if ('unit_subtotal_excl' in src) line.unit_subtotal_excl = toNum(src.unit_subtotal_excl);
	if ('unit_subtotal' in src) {
		line.unit_subtotal = toNum(src.unit_subtotal);
	} else if (line.unit_subtotal_incl !== undefined || line.unit_subtotal_excl !== undefined) {
		line.unit_subtotal = useExclSide ? line.unit_subtotal_excl : line.unit_subtotal_incl;
	}

	return line;
}

function mapItemTaxes(
	taxes: any[]
): { code: string; rate?: number | null; label?: string; amount: number }[] {
	return taxes
		.filter((tax: unknown): tax is Record<string, unknown> => !!tax && typeof tax === 'object')
		.map((tax) => ({
			code: toStr(tax.code ?? tax.rate_code ?? tax.id),
			rate: tax.rate == null ? null : toNum(tax.rate),
			label: 'label' in tax ? toStr(tax.label) : undefined,
			amount: toNum(tax.amount ?? tax.tax_amount),
		}))
		.filter((tax) => tax.code.length > 0 || tax.amount !== 0);
}

function mapFeeLike(src: Record<string, any>, displayTax: DisplayTax): ReceiptFee {
	const totalIncl = toNum(src.total_incl ?? src.total);
	const totalExcl = 'total_excl' in src ? toNum(src.total_excl) : totalIncl - toNum(src.total_tax);
	const total = displayTax === 'excl' ? totalExcl : totalIncl;

	const fee: ReceiptFee = {
		label: toStr(src.label ?? src.name ?? src.title),
		total,
		total_incl: totalIncl,
		total_excl: totalExcl,
	};
	if (Array.isArray(src.meta) && src.meta.length > 0) {
		const meta = src.meta
			.filter(
				(entry: unknown): entry is Record<string, unknown> => !!entry && typeof entry === 'object'
			)
			.map((entry) => ({
				key: toStr(entry.key ?? entry.display_key),
				value: toStr(entry.value ?? entry.display_value),
			}))
			.filter((entry) => entry.key.length > 0 || entry.value.length > 0);
		if (meta.length > 0) fee.meta = meta;
	}
	if (Array.isArray(src.taxes) && src.taxes.length > 0) {
		const taxes = mapItemTaxes(src.taxes);
		if (taxes.length > 0) fee.taxes = taxes;
	}
	return fee;
}

function mapShippingLike(src: Record<string, any>, displayTax: DisplayTax): ReceiptShipping {
	const fee = mapFeeLike(src, displayTax);
	const shipping: ReceiptShipping = { ...fee };
	if ('method_id' in src && src.method_id != null) {
		shipping.method_id = toStr(src.method_id);
	}
	return shipping;
}

function mapDiscountLike(src: Record<string, any>, displayTax: DisplayTax): ReceiptDiscount {
	const totalIncl = toNum(src.total_incl ?? src.total);
	const totalExcl = 'total_excl' in src ? toNum(src.total_excl) : totalIncl - toNum(src.total_tax);
	const total = displayTax === 'excl' ? totalExcl : totalIncl;

	const discount: ReceiptDiscount = {
		label: toStr(src.label ?? src.name ?? src.title),
		total,
		total_incl: totalIncl,
		total_excl: totalExcl,
	};
	if ('code' in src && src.code != null) discount.code = toStr(src.code);
	if ('codes' in src && src.codes != null) discount.codes = toStr(src.codes);
	return discount;
}

function mapTotals(src: Record<string, any>, displayTax: DisplayTax): ReceiptTotals {
	const subtotalIncl = toNum(src.subtotal_incl ?? src.subtotal);
	const subtotalExcl =
		'subtotal_excl' in src ? toNum(src.subtotal_excl) : subtotalIncl - toNum(src.tax_total);
	const taxTotal = toNum(src.tax_total);
	const discountTotalIncl = toNum(src.discount_total_incl ?? src.discount_total);
	const discountTotalExcl = toNum(src.discount_total_excl ?? src.discount_total);
	const grandTotalIncl = toNum(src.grand_total_incl ?? src.grand_total);
	const grandTotalExcl =
		'grand_total_excl' in src ? toNum(src.grand_total_excl) : grandTotalIncl - taxTotal;
	const subtotal = displayTax === 'excl' ? subtotalExcl : subtotalIncl;
	const discountTotal = displayTax === 'excl' ? discountTotalExcl : discountTotalIncl;
	const grandTotal = displayTax === 'excl' ? grandTotalExcl : grandTotalIncl;

	return {
		subtotal,
		subtotal_incl: subtotalIncl,
		subtotal_excl: subtotalExcl,
		discount_total: discountTotal,
		discount_total_incl: discountTotalIncl,
		discount_total_excl: discountTotalExcl,
		tax_total: taxTotal,
		grand_total: grandTotal,
		grand_total_incl: grandTotalIncl,
		grand_total_excl: grandTotalExcl,
		paid_total: 'paid_total' in src ? toNum(src.paid_total) : grandTotalIncl,
		change_total: 'change_total' in src ? toNum(src.change_total) : 0,
		...('refund_total' in src && src.refund_total != null
			? { refund_total: toNum(src.refund_total) }
			: {}),
	};
}

function mapPayment(src: Record<string, any>): ReceiptPayment {
	return {
		method_id: toStr(src.method_id ?? src.method),
		method_title: toStr(src.method_title ?? src.method),
		amount: toNum(src.amount),
		transaction_id: toStr(src.transaction_id ?? src.reference),
		tendered: 'tendered' in src ? toNum(src.tendered) : undefined,
		change: 'change' in src ? toNum(src.change) : undefined,
	};
}

function mapRefund(src: Record<string, any>): ReceiptRefund {
	const refund: ReceiptRefund = {
		id: Math.trunc(toNum(src.id)),
		amount: toNum(src.amount),
		lines: toArr(src.lines)
			.filter((entry): entry is Record<string, any> => !!entry && typeof entry === 'object')
			.map((entry) => ({
				name: toStr(entry.name),
				sku: 'sku' in entry ? toStr(entry.sku) : undefined,
				qty: toNum(entry.qty ?? entry.quantity),
				total: toNum(entry.total ?? entry.amount),
			})),
	};
	if ('reason' in src && src.reason != null) refund.reason = toStr(src.reason);
	if ('refunded_by_id' in src) {
		refund.refunded_by_id =
			src.refunded_by_id == null ? null : Math.trunc(toNum(src.refunded_by_id));
	}
	if ('refunded_by_name' in src && src.refunded_by_name != null) {
		refund.refunded_by_name = toStr(src.refunded_by_name);
	}
	if ('refunded_payment' in src) refund.refunded_payment = !!src.refunded_payment;
	if (src.date && typeof src.date === 'object') refund.date = src.date as ReceiptRefund['date'];
	return refund;
}

function mapFiscal(src: Record<string, any>): ReceiptFiscal {
	const fiscal: ReceiptFiscal = {
		immutable_id: toStr(src.immutable_id ?? src.fiscal_id) || undefined,
		receipt_number: toStr(src.receipt_number) || undefined,
		sequence: 'sequence' in src ? toNum(src.sequence) : undefined,
		hash: toStr(src.hash) || undefined,
		qr_payload: toStr(src.qr_payload) || undefined,
		tax_agency_code: toStr(src.tax_agency_code) || undefined,
		signed_at: toStr(src.signed_at) || undefined,
	};
	if ('signature_excerpt' in src && src.signature_excerpt != null) {
		fiscal.signature_excerpt = toStr(src.signature_excerpt);
	}
	if ('document_label' in src && src.document_label != null) {
		fiscal.document_label = toStr(src.document_label);
	}
	if ('is_reprint' in src) fiscal.is_reprint = !!src.is_reprint;
	if ('reprint_count' in src) fiscal.reprint_count = toNum(src.reprint_count);
	if ('extra_fields' in src && src.extra_fields != null) fiscal.extra_fields = src.extra_fields;
	return fiscal;
}

function mapPresentationHints(src: Record<string, any>): ReceiptPresentationHints {
	const locale = toStr(src.locale).replace(/_/g, '-');

	return {
		display_tax: resolveDisplayTax(src),
		prices_entered_with_tax:
			'prices_entered_with_tax' in src ? !!src.prices_entered_with_tax : true,
		rounding_mode: toStr(src.rounding_mode) || 'round',
		locale: locale || 'en-US',
	};
}

function normalizeCanonicalReceiptData(data: Partial<ReceiptData>): ReceiptData {
	const base = emptyReceiptData();
	const presentationHints = mapPresentationHints(
		data.presentation_hints && typeof data.presentation_hints === 'object'
			? (data.presentation_hints as Record<string, any>)
			: {}
	);
	const displayTax = resolveDisplayValueSide(presentationHints);

	const result: ReceiptData = {
		meta: {
			...base.meta,
			...(data.meta ?? {}),
		},
		store: {
			...base.store,
			...(data.store ?? {}),
			address_lines: Array.isArray(data.store?.address_lines)
				? data.store.address_lines.map((line) => toStr(line))
				: base.store.address_lines,
		},
		cashier: {
			...base.cashier,
			...(data.cashier ?? {}),
		},
		customer: {
			...base.customer,
			...(data.customer ?? {}),
		},
		lines: toArr(data.lines).map((item, i) =>
			mapLine(item && typeof item === 'object' ? (item as Record<string, any>) : {}, i, displayTax)
		),
		fees: toArr(data.fees).map((item) =>
			mapFeeLike(item && typeof item === 'object' ? (item as Record<string, any>) : {}, displayTax)
		),
		shipping: toArr(data.shipping).map((item) =>
			mapShippingLike(
				item && typeof item === 'object' ? (item as Record<string, any>) : {},
				displayTax
			)
		),
		discounts: toArr(data.discounts).map((item) =>
			mapDiscountLike(
				item && typeof item === 'object' ? (item as Record<string, any>) : {},
				displayTax
			)
		),
		totals: mapTotals(
			data.totals && typeof data.totals === 'object' ? (data.totals as Record<string, any>) : {},
			displayTax
		),
		tax_summary: toArr(data.tax_summary)
			.filter((entry): entry is Record<string, any> => !!entry && typeof entry === 'object')
			.map((entry) => {
				const item: ReceiptTaxSummaryItem = {
					code: toStr(entry.code),
					rate: entry.rate == null ? null : toNum(entry.rate),
					label: toStr(entry.label),
					taxable_amount_excl:
						entry.taxable_amount_excl == null ? null : toNum(entry.taxable_amount_excl),
					tax_amount: toNum(entry.tax_amount),
					taxable_amount_incl:
						entry.taxable_amount_incl == null ? null : toNum(entry.taxable_amount_incl),
				};
				if ('compound' in entry) item.compound = !!entry.compound;
				return item;
			}),
		payments: toArr(data.payments).map((p) =>
			mapPayment(p && typeof p === 'object' ? (p as Record<string, any>) : {})
		),
		fiscal: mapFiscal(
			data.fiscal && typeof data.fiscal === 'object' ? (data.fiscal as Record<string, any>) : {}
		),
		presentation_hints: presentationHints,
	};

	if (Array.isArray(data.refunds)) {
		result.refunds = data.refunds
			.filter((entry: unknown) => !!entry && typeof entry === 'object')
			.map((entry: unknown) => mapRefund(entry as Record<string, any>));
	}

	// Pass-through optional top-level keys (`receipt`, `order`, `i18n`) emitted
	// by the PHP Receipt_Data_Builder. These are advisory — templates may use
	// them but the encoder doesn't depend on them, so we copy as-is.
	if (data.receipt !== undefined) result.receipt = data.receipt;
	if (data.order !== undefined) result.order = data.order;
	if (data.i18n !== undefined) result.i18n = data.i18n;

	return result;
}

/**
 * Convert receipt data from the offline rendering shape to the canonical
 * ReceiptData shape used by the printer encoder.
 *
 * If the data already matches the canonical shape, it is returned as-is
 * (cast to ReceiptData). This makes it safe to always run incoming data
 * through the mapper regardless of its origin.
 */
export function mapReceiptData(data: Record<string, any>): ReceiptData {
	if (!data || typeof data !== 'object') {
		// Return a minimal valid structure so the encoder doesn't crash.
		return emptyReceiptData();
	}

	// Pass through data that already matches the canonical shape.
	if (isCanonicalShape(data)) {
		return normalizeCanonicalReceiptData(data as Partial<ReceiptData>);
	}

	const meta = data.meta && typeof data.meta === 'object' ? data.meta : {};
	const store = data.store && typeof data.store === 'object' ? data.store : {};
	const customer = data.customer && typeof data.customer === 'object' ? data.customer : {};
	const totals = data.totals && typeof data.totals === 'object' ? data.totals : {};
	const fiscal = data.fiscal && typeof data.fiscal === 'object' ? data.fiscal : {};
	const presentationHints =
		data.presentation_hints && typeof data.presentation_hints === 'object'
			? data.presentation_hints
			: {};
	const normalizedHints = mapPresentationHints(presentationHints);
	const displayTax = resolveDisplayValueSide(normalizedHints);

	return {
		meta: mapMeta(meta),
		store: mapStore(store),
		cashier: { id: 0, name: '' } as ReceiptCashier,
		customer: mapCustomer(customer),
		lines: toArr(data.lines).map((item, i) =>
			mapLine(item && typeof item === 'object' ? (item as Record<string, any>) : {}, i, displayTax)
		),
		fees: toArr(data.fees).map((item) =>
			mapFeeLike(item && typeof item === 'object' ? (item as Record<string, any>) : {}, displayTax)
		),
		shipping: toArr(data.shipping).map((item) =>
			mapShippingLike(
				item && typeof item === 'object' ? (item as Record<string, any>) : {},
				displayTax
			)
		),
		discounts: toArr(data.discounts).map((item) =>
			mapDiscountLike(
				item && typeof item === 'object' ? (item as Record<string, any>) : {},
				displayTax
			)
		),
		totals: mapTotals(totals, displayTax),
		tax_summary: [] as ReceiptTaxSummaryItem[],
		payments: toArr(data.payments).map((p) =>
			mapPayment(p && typeof p === 'object' ? (p as Record<string, any>) : {})
		),
		fiscal: mapFiscal(fiscal),
		presentation_hints: normalizedHints,
	};
}

/** Minimal valid ReceiptData with all required fields set to defaults. */
function emptyReceiptData(): ReceiptData {
	return {
		meta: {
			schema_version: 1,
			mode: 'live',
			created_at_gmt: '',
			order_id: 0,
			order_number: '',
			currency: '',
		},
		store: { name: '', address_lines: [] },
		cashier: { id: 0, name: '' },
		customer: { id: 0, name: '' },
		lines: [],
		fees: [],
		shipping: [],
		discounts: [],
		totals: {
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
		},
		tax_summary: [],
		payments: [],
		fiscal: {},
		presentation_hints: {
			display_tax: 'incl',
			prices_entered_with_tax: true,
			rounding_mode: 'round',
			locale: 'en-US',
		},
	};
}
