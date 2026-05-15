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
	ReceiptPayment,
	ReceiptPresentationHints,
	ReceiptRefund,
	ReceiptShipping,
	ReceiptStoreMeta,
	ReceiptTaxId,
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

function toOptionalBool(value: unknown): boolean | undefined {
	if (typeof value === 'boolean') return value;
	if (typeof value === 'number') return value !== 0;
	if (typeof value === 'string') return ['true', '1', 'yes'].includes(value.trim().toLowerCase());
	return undefined;
}

/** Safe array coercion. */
function toArr(value: unknown): unknown[] {
	return Array.isArray(value) ? value : [];
}

/**
 * Checks whether the data already matches the canonical ReceiptData shape.
 * We look for fields that exist only in the canonical shape and never in the
 * offline rendering shape (a structured `order.id` and `totals.subtotal_incl`).
 */
function isCanonicalShape(data: Record<string, any>): boolean {
	const order = data.order;
	const totals = data.totals;

	// Require markers from at least two sections to avoid false positives.
	// Offline shape carries `order_number` at the top level (no nested `order` block);
	// canonical shape always has the nested object with `id`.
	const hasOrder = order && typeof order === 'object' && 'id' in order && 'number' in order;
	const hasTotals = totals && typeof totals === 'object' && 'subtotal_incl' in totals;

	return !!(hasOrder && hasTotals);
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
	const taxIds: NonNullable<ReceiptStoreMeta['tax_ids']> = Array.isArray(src.tax_ids)
		? src.tax_ids
				.filter((entry): entry is Record<string, unknown> => !!entry && typeof entry === 'object')
				.flatMap((entry): NonNullable<ReceiptStoreMeta['tax_ids']> => {
					const type = toStr(entry.type);
					const value = toStr(entry.value);
					if (!type || !value) return [];
					return [
						{
							type,
							value,
							country: entry.country == null ? undefined : toStr(entry.country),
							label: entry.label == null ? undefined : toStr(entry.label),
						},
					];
				})
		: [];
	const scalarTaxId = toStr(src.tax_id);
	if (taxIds.length === 0 && scalarTaxId) {
		taxIds.push({ type: 'other', value: scalarTaxId });
	}
	const numericId =
		typeof src.id === 'number' && Number.isFinite(src.id)
			? src.id
			: typeof src.id === 'string' && /^[+-]?\d+(\.\d+)?$/.test(src.id.trim())
				? Number(src.id)
				: 0;

	return {
		id: Math.trunc(numericId),
		name: toStr(src.name),
		address_lines: addressLines,
		...(taxIds.length > 0 ? { tax_ids: taxIds } : {}),
		phone: toStr(src.phone),
		email: toStr(src.email),
	};
}

const RECEIPT_TAX_ID_TYPES: readonly ReceiptTaxId['type'][] = [
	'eu_vat',
	'gb_vat',
	'au_abn',
	'br_cpf',
	'br_cnpj',
	'in_gst',
	'it_cf',
	'it_piva',
	'es_nif',
	'ar_cuit',
	'sa_vat',
	'ca_gst_hst',
	'us_ein',
	'other',
];

function isReceiptTaxIdType(value: string): value is ReceiptTaxId['type'] {
	return (RECEIPT_TAX_ID_TYPES as readonly string[]).includes(value);
}

function mapCustomer(src: Record<string, any>): ReceiptCustomer {
	// The offline shape stores addresses as formatted strings, not objects.
	// We can't reverse-parse them reliably, so leave the record-based fields empty.
	const taxIds: ReceiptTaxId[] = Array.isArray(src.tax_ids)
		? src.tax_ids
				.filter((entry): entry is Record<string, unknown> => !!entry && typeof entry === 'object')
				.flatMap((entry): ReceiptTaxId[] => {
					const type = toStr(entry.type);
					const value = toStr(entry.value);
					if (!isReceiptTaxIdType(type) || value.length === 0) return [];
					return [
						{
							type,
							value,
							country: entry.country == null ? null : toStr(entry.country),
							label: entry.label == null ? null : toStr(entry.label),
						},
					];
				})
		: [];
	const scalarTaxId = toStr(src.tax_id);
	if (taxIds.length === 0 && scalarTaxId) {
		taxIds.push({ type: 'other', value: scalarTaxId });
	}
	return {
		id: 0,
		name: toStr(src.name),
		billing_address: {},
		shipping_address: {},
		tax_ids: taxIds,
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
	const rawTotal = src.line_total ?? src.total ?? src.line_total_incl ?? src.line_total_excl;
	const total = toNum(rawTotal);
	const rawTotalNumber =
		rawTotal == null ? NaN : typeof rawTotal === 'string' ? parseFloat(rawTotal) : Number(rawTotal);
	const derivedUnitPrice = Number.isFinite(rawTotalNumber) && qty !== 0 ? total / qty : price;
	const unitPriceFallback = Number.isFinite(derivedUnitPrice) ? derivedUnitPrice : price;
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
				compound: 'compound' in entry ? !!entry.compound : undefined,
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
): { code: string; rate?: number | null; label?: string; compound?: boolean; amount: number }[] {
	return taxes
		.filter((tax: unknown): tax is Record<string, unknown> => !!tax && typeof tax === 'object')
		.map((tax) => ({
			code: toStr(tax.code ?? tax.rate_code ?? tax.id),
			rate: tax.rate == null ? null : toNum(tax.rate),
			label: 'label' in tax ? toStr(tax.label) : undefined,
			compound: 'compound' in tax ? !!tax.compound : undefined,
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

/**
 * ─────────────────────────────────────────────────────────────────────────
 * NO LEGACY COMPAT — DO NOT ADD `grand_total*` FALLBACKS HERE
 * ─────────────────────────────────────────────────────────────────────────
 *
 * The receipt-data contract is v1. The earlier `grand_total*` field family was renamed to
 * `total*` before any release ever shipped — there is no legacy producer
 * to bridge to. If a payload comes in without `total_incl` / `total_excl`,
 * the resulting zeros are the correct signal that the producer is
 * out-of-spec.
 *
 * Review history: a compat shim was added in c5626465a / 4f8e6076a in
 * response to bot review feedback, then deliberately stripped in
 * c2820539e once the maintainer confirmed there is no shipping legacy.
 * Do not add it back.
 * ─────────────────────────────────────────────────────────────────────────
 */
function mapTotals(src: Record<string, any>, displayTax: DisplayTax): ReceiptTotals {
	const subtotalIncl = toNum(src.subtotal_incl ?? src.subtotal);
	const subtotalExcl =
		'subtotal_excl' in src ? toNum(src.subtotal_excl) : subtotalIncl - toNum(src.tax_total);
	const taxTotal = toNum(src.tax_total);
	const discountTotalIncl = toNum(src.discount_total_incl ?? src.discount_total);
	const discountTotalExcl = toNum(src.discount_total_excl ?? src.discount_total);
	const grandTotalIncl = toNum(src.total_incl ?? src.total);
	const grandTotalExcl = 'total_excl' in src ? toNum(src.total_excl) : grandTotalIncl - taxTotal;
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
		total: grandTotal,
		total_incl: grandTotalIncl,
		total_excl: grandTotalExcl,
		paid_total: 'paid_total' in src ? toNum(src.paid_total) : grandTotalIncl,
		change_total: 'change_total' in src ? toNum(src.change_total) : 0,
		...('refund_total' in src && src.refund_total != null
			? { refund_total: toNum(src.refund_total) }
			: {}),
		...('net_total' in src && src.net_total != null ? { net_total: toNum(src.net_total) } : {}),
		...('total_qty' in src && src.total_qty != null ? { total_qty: toNum(src.total_qty) } : {}),
		...('line_count' in src && src.line_count != null
			? { line_count: Math.max(0, Math.trunc(toNum(src.line_count))) }
			: {}),
	};
}

function mapPayment(src: Record<string, any>): ReceiptPayment {
	const transactionId = toStr(src.transaction_id);
	return {
		method_id: toStr(src.method_id ?? src.method),
		method_title: toStr(src.method_title ?? src.method),
		amount: toNum(src.amount),
		transaction_id: transactionId || toStr(src.reference),
		tendered: 'tendered' in src ? toNum(src.tendered) : undefined,
		change: 'change' in src ? toNum(src.change) : undefined,
	};
}

function mapRefundLine(entry: Record<string, any>) {
	const total = toNum(entry.total ?? entry.amount ?? entry.line_total);
	const totalIncl =
		'total_incl' in entry
			? toNum(entry.total_incl)
			: 'line_total_incl' in entry
				? toNum(entry.line_total_incl)
				: undefined;
	const totalExcl =
		'total_excl' in entry
			? toNum(entry.total_excl)
			: 'line_total_excl' in entry
				? toNum(entry.line_total_excl)
				: undefined;
	const line: ReceiptRefund['lines'][number] = {
		name: toStr(entry.name),
		sku: 'sku' in entry ? toStr(entry.sku) : undefined,
		qty: toNum(entry.qty ?? entry.quantity),
		total,
		line_total: 'line_total' in entry && entry.line_total != null ? toNum(entry.line_total) : total,
	};
	if (totalIncl != null) {
		line.total_incl = totalIncl;
		line.line_total_incl =
			'line_total_incl' in entry && entry.line_total_incl != null
				? toNum(entry.line_total_incl)
				: totalIncl;
	}
	if (totalExcl != null) {
		line.total_excl = totalExcl;
		line.line_total_excl =
			'line_total_excl' in entry && entry.line_total_excl != null
				? toNum(entry.line_total_excl)
				: totalExcl;
	}
	if ('unit_total' in entry && entry.unit_total != null) line.unit_total = toNum(entry.unit_total);
	if ('unit_total_incl' in entry && entry.unit_total_incl != null) {
		line.unit_total_incl = toNum(entry.unit_total_incl);
	}
	if ('unit_total_excl' in entry && entry.unit_total_excl != null) {
		line.unit_total_excl = toNum(entry.unit_total_excl);
	}
	if (Array.isArray(entry.taxes) && entry.taxes.length > 0) {
		const taxes = mapItemTaxes(entry.taxes);
		if (taxes.length > 0) line.taxes = taxes;
	}
	return line;
}

function mapRefundFee(entry: Record<string, any>) {
	const fee: NonNullable<ReceiptRefund['fees']>[number] = {
		label: toStr(entry.label ?? entry.name ?? entry.title),
		total: toNum(entry.total),
	};
	if ('total_incl' in entry && entry.total_incl != null) fee.total_incl = toNum(entry.total_incl);
	if ('total_excl' in entry && entry.total_excl != null) fee.total_excl = toNum(entry.total_excl);
	if (Array.isArray(entry.taxes) && entry.taxes.length > 0) {
		const taxes = mapItemTaxes(entry.taxes);
		if (taxes.length > 0) fee.taxes = taxes;
	}
	return fee;
}

function mapRefundShipping(entry: Record<string, any>) {
	const shipping: NonNullable<ReceiptRefund['shipping']>[number] = {
		label: toStr(entry.label ?? entry.name ?? entry.title),
		total: toNum(entry.total),
	};
	if ('method_id' in entry && entry.method_id != null) shipping.method_id = toStr(entry.method_id);
	if ('total_incl' in entry && entry.total_incl != null) {
		shipping.total_incl = toNum(entry.total_incl);
	}
	if ('total_excl' in entry && entry.total_excl != null) {
		shipping.total_excl = toNum(entry.total_excl);
	}
	if (Array.isArray(entry.taxes) && entry.taxes.length > 0) {
		const taxes = mapItemTaxes(entry.taxes);
		if (taxes.length > 0) shipping.taxes = taxes;
	}
	return shipping;
}

function mapRefund(src: Record<string, any>): ReceiptRefund {
	const refund: ReceiptRefund = {
		id: Math.trunc(toNum(src.id)),
		amount: toNum(src.amount),
		lines: toArr(src.lines)
			.filter((entry): entry is Record<string, any> => !!entry && typeof entry === 'object')
			.map(mapRefundLine),
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

	if ('subtotal' in src && src.subtotal != null) refund.subtotal = toNum(src.subtotal);
	if ('tax_total' in src && src.tax_total != null) refund.tax_total = toNum(src.tax_total);
	if ('shipping_total' in src && src.shipping_total != null) {
		refund.shipping_total = toNum(src.shipping_total);
	}
	if ('shipping_tax' in src && src.shipping_tax != null) {
		refund.shipping_tax = toNum(src.shipping_tax);
	}
	if ('destination' in src && src.destination != null) refund.destination = toStr(src.destination);
	if ('gateway_id' in src && src.gateway_id != null) refund.gateway_id = toStr(src.gateway_id);
	if ('gateway_title' in src && src.gateway_title != null) {
		refund.gateway_title = toStr(src.gateway_title);
	}
	if ('processing_mode' in src && src.processing_mode != null) {
		refund.processing_mode = toStr(src.processing_mode);
	}
	if (Array.isArray(src.fees) && src.fees.length > 0) {
		refund.fees = src.fees
			.filter(
				(entry: unknown): entry is Record<string, any> => !!entry && typeof entry === 'object'
			)
			.map(mapRefundFee);
	}
	if (Array.isArray(src.shipping) && src.shipping.length > 0) {
		refund.shipping = src.shipping
			.filter(
				(entry: unknown): entry is Record<string, any> => !!entry && typeof entry === 'object'
			)
			.map(mapRefundShipping);
	}
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
		order_barcode_type: resolveOrderBarcodeType(src.order_barcode_type),
	};
}

function resolveOrderBarcodeType(value: unknown): ReceiptPresentationHints['order_barcode_type'] {
	const normalized = toStr(value).trim().toLowerCase();
	if (
		normalized === 'qr' ||
		normalized === 'qrcode' ||
		normalized === 'code128' ||
		normalized === 'ean13' ||
		normalized === 'ean8' ||
		normalized === 'upca'
	) {
		return normalized === 'qr' ? 'qrcode' : normalized;
	}
	return 'code128';
}

function formatPrintedDatetime(timezone?: string): string {
	const options: Intl.DateTimeFormatOptions = {
		year: 'numeric',
		month: 'short',
		day: 'numeric',
		hour: 'numeric',
		minute: '2-digit',
		hour12: true,
	};

	try {
		return new Intl.DateTimeFormat('en-US', {
			...options,
			timeZone: timezone,
		}).format(new Date());
	} catch (error) {
		if (!(error instanceof RangeError)) {
			throw error;
		}
		return new Intl.DateTimeFormat('en-US', options).format(new Date());
	}
}

function normalizeCanonicalReceiptData(data: Partial<ReceiptData>): ReceiptData {
	const base = emptyReceiptData();
	const presentationHints = mapPresentationHints(
		data.presentation_hints && typeof data.presentation_hints === 'object'
			? (data.presentation_hints as Record<string, any>)
			: {}
	);
	const displayTax = resolveDisplayValueSide(presentationHints);
	const order = data.order ?? base.order;
	const storeSource =
		data.store && typeof data.store === 'object' ? (data.store as Record<string, any>) : {};
	const customerSource =
		data.customer && typeof data.customer === 'object'
			? (data.customer as Record<string, any>)
			: {};
	const storeData = { ...storeSource };
	delete storeData.tax_id;
	delete storeData.tax_ids;
	const customerData = { ...customerSource };
	delete customerData.tax_id;
	delete customerData.tax_ids;
	const normalizedStore = mapStore(storeSource);
	const normalizedCustomer = mapCustomer(customerSource);
	const storeTimezone =
		typeof storeSource.timezone === 'string' && storeSource.timezone
			? storeSource.timezone
			: undefined;
	const printed = { ...base.order.printed, ...(order.printed ?? {}) };
	if (!printed.datetime) {
		printed.datetime = formatPrintedDatetime(storeTimezone);
	}

	const result: ReceiptData = {
		order: {
			...base.order,
			...order,
			created: { ...base.order.created, ...(order.created ?? {}) },
			paid: { ...base.order.paid, ...(order.paid ?? {}) },
			completed: { ...base.order.completed, ...(order.completed ?? {}) },
			printed,
		},
		store: {
			...base.store,
			...storeData,
			...normalizedStore,
			address_lines: Array.isArray(storeSource.address_lines)
				? storeSource.address_lines.map((line) => toStr(line))
				: normalizedStore.address_lines,
		},
		cashier: {
			...base.cashier,
			...(data.cashier ?? {}),
		},
		customer: {
			...base.customer,
			...customerData,
			...(normalizedCustomer.tax_ids?.length ? { tax_ids: normalizedCustomer.tax_ids } : {}),
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

	// Pass-through `i18n` (advisory labels — templates may use it but the
	// encoder doesn't depend on them).
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

	// Offline rendering shape carries `order_number`, `order_date`, `currency` at the top
	// level — synthesise the canonical `order` block from those. Date variants are empty
	// strings for everything except `datetime` (the only field the offline shape provides),
	// matching the contract that ReceiptDate has all 19 keys present.
	const offlineCreated = { ...emptyReceiptDate(), datetime: toStr(data.order_date) };
	const offlineDate = emptyReceiptDate();
	// Format the printed timestamp deterministically (en-US format, explicit
	// options) so audit strings are locale-agnostic, but honor the store's
	// IANA timezone when configured so reprints reflect the store's wall-clock
	// rather than the device's. Falls back to the device timezone when the
	// store carries no timezone override.
	const storeTimezone =
		typeof store.timezone === 'string' && store.timezone ? store.timezone : undefined;
	const offlinePrinted = { ...emptyReceiptDate(), datetime: formatPrintedDatetime(storeTimezone) };
	const normalizedStore = mapStore(store);
	const {
		address: _storeAddress,
		address_lines: storeAddressLines,
		email: _storeEmail,
		id: _storeId,
		name: _storeName,
		phone: _storePhone,
		tax_id: _storeTaxId,
		tax_ids: _storeTaxIds,
		...storePresentationFields
	} = store;

	const result: ReceiptData = {
		order: {
			id: 0,
			number: toStr(data.order_number),
			currency: toStr(data.currency),
			customer_note: toStr(data.customer_note),
			wc_status: toStr(data.wc_status ?? data.status) || undefined,
			status_label: toStr(data.status_label) || undefined,
			created_via: toStr(data.created_via) || undefined,
			needs_payment: 'needs_payment' in data ? toOptionalBool(data.needs_payment) : undefined,
			payment_url: toStr(data.payment_url) || undefined,
			created: offlineCreated,
			paid: offlineDate,
			completed: offlineDate,
			printed: offlinePrinted,
		},
		store: {
			...storePresentationFields,
			...normalizedStore,
			address_lines: Array.isArray(storeAddressLines)
				? storeAddressLines.map((line: unknown) => toStr(line))
				: normalizedStore.address_lines,
		},
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

	if (Array.isArray(data.refunds)) {
		result.refunds = data.refunds
			.filter(
				(entry: unknown): entry is Record<string, any> => !!entry && typeof entry === 'object'
			)
			.map((entry) => mapRefund(entry));
	}

	return result;
}

/** A ReceiptDate object with every field set to an empty string. */
function emptyReceiptDate() {
	return {
		datetime: '',
		date: '',
		time: '',
		datetime_short: '',
		datetime_long: '',
		datetime_full: '',
		date_short: '',
		date_long: '',
		date_full: '',
		date_ymd: '',
		date_dmy: '',
		date_mdy: '',
		weekday_short: '',
		weekday_long: '',
		day: '',
		month: '',
		month_short: '',
		month_long: '',
		year: '',
	};
}

/** Minimal valid ReceiptData with all required fields set to defaults. */
function emptyReceiptData(): ReceiptData {
	return {
		order: {
			id: 0,
			number: '',
			currency: '',
			customer_note: '',
			needs_payment: false,
			payment_url: '',
			created: emptyReceiptDate(),
			paid: emptyReceiptDate(),
			completed: emptyReceiptDate(),
			printed: emptyReceiptDate(),
		},
		store: { id: 0, name: '', address_lines: [] },
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
			total: 0,
			total_incl: 0,
			total_excl: 0,
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
			order_barcode_type: 'code128',
		},
	};
}
