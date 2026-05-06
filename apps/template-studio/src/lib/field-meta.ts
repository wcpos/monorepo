/**
 * Static metadata about known ReceiptData fields.
 *
 * Encodes section ordering, display labels, enum option lists, and add-row
 * defaults so the FieldsTree can render schema-driven controls without
 * importing Zod internals at runtime.
 */

import type { PathSegment } from './path-utils';

export interface SectionMeta {
	key: string;
	label: string;
	path: PathSegment[];
	kind: 'object' | 'array';
}

export const SECTIONS: SectionMeta[] = [
	{ key: 'order', label: 'Order', path: ['order'], kind: 'object' },
	{ key: 'store', label: 'Store', path: ['store'], kind: 'object' },
	{ key: 'cashier', label: 'Cashier', path: ['cashier'], kind: 'object' },
	{ key: 'customer', label: 'Customer', path: ['customer'], kind: 'object' },
	{ key: 'lines', label: 'Line Items', path: ['lines'], kind: 'array' },
	{ key: 'fees', label: 'Fees', path: ['fees'], kind: 'array' },
	{ key: 'shipping', label: 'Shipping', path: ['shipping'], kind: 'array' },
	{ key: 'discounts', label: 'Discounts', path: ['discounts'], kind: 'array' },
	{ key: 'totals', label: 'Totals', path: ['totals'], kind: 'object' },
	{ key: 'tax_summary', label: 'Tax Summary', path: ['tax_summary'], kind: 'array' },
	{ key: 'payments', label: 'Payments', path: ['payments'], kind: 'array' },
	{ key: 'refunds', label: 'Refunds', path: ['refunds'], kind: 'array' },
	{ key: 'fiscal', label: 'Fiscal', path: ['fiscal'], kind: 'object' },
	{
		key: 'presentation_hints',
		label: 'Presentation',
		path: ['presentation_hints'],
		kind: 'object',
	},
	{ key: 'i18n', label: 'i18n', path: ['i18n'], kind: 'object' },
];

/** Path strings → enum option list. Used by leaf renderer to show a select. */
export const ENUM_OPTIONS: Record<string, readonly string[]> = {
	'order.wc_status': [
		'pending',
		'processing',
		'on-hold',
		'completed',
		'cancelled',
		'refunded',
		'failed',
	],
	'order.created_via': ['woocommerce-pos', 'checkout', 'admin', 'rest-api'],
	'presentation_hints.display_tax': ['incl', 'excl', 'hidden', 'itemized', 'single'],
	'presentation_hints.rounding_mode': ['per-line', 'per-total'],
	'presentation_hints.order_barcode_type': ['code128', 'qrcode', 'ean13', 'ean8', 'upca'],
	'customer.tax_ids.type': [
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
	],
};

/** Hidden paths — not rendered in tree (system fields). */
export const HIDDEN_PATHS = new Set<string>(['id']);

const DEFAULT_LINE = {
	key: 'new-line',
	sku: '',
	name: 'New product',
	qty: 1,
	unit_price_incl: 0,
	unit_price_excl: 0,
	line_subtotal_incl: 0,
	line_subtotal_excl: 0,
	discounts_incl: 0,
	discounts_excl: 0,
	line_total_incl: 0,
	line_total_excl: 0,
	taxes: [],
};

const DEFAULT_FEE = { label: 'New fee', total_incl: 0, total_excl: 0 };
const DEFAULT_DISCOUNT = { label: 'New discount', total_incl: 0, total_excl: 0 };
const DEFAULT_TAX = {
	code: 'TAX',
	rate: 0,
	label: 'Tax',
	taxable_amount_excl: 0,
	tax_amount: 0,
	taxable_amount_incl: 0,
};
const DEFAULT_PAYMENT = {
	method_id: 'cash',
	method_title: 'Cash',
	amount: 0,
};

const DEFAULT_TAX_ID = { type: 'other', value: '', country: '', label: '' };

const DEFAULT_LINE_META = { key: 'Attribute', value: '' };
const DEFAULT_LINE_TAX = { code: 'TAX', rate: null, label: 'Tax', amount: 0 };
const DEFAULT_REFUND_LINE = { name: 'Refunded item', qty: 1, total: 0 };
const DEFAULT_REFUND = {
	id: 0,
	amount: 0,
	reason: '',
	refunded_by_id: null,
	refunded_by_name: '',
	refunded_payment: false,
	lines: [DEFAULT_REFUND_LINE],
};

/**
 * Default item to insert when "+ Add" is clicked on an array section.
 *
 * Keys here are the *last* path segment of the array, so nested arrays like
 * `lines[0].meta` or `fees[0].taxes` resolve via their own segment name (no
 * collision with the top-level `meta` object section, which is not an array).
 */
export const ARRAY_DEFAULTS: Record<string, unknown> = {
	lines: DEFAULT_LINE,
	fees: DEFAULT_FEE,
	shipping: DEFAULT_FEE,
	discounts: DEFAULT_DISCOUNT,
	tax_summary: DEFAULT_TAX,
	payments: DEFAULT_PAYMENT,
	refunds: DEFAULT_REFUND,
	meta: DEFAULT_LINE_META,
	taxes: DEFAULT_LINE_TAX,
	tax_ids: DEFAULT_TAX_ID,
};

/** Title for an array item (e.g., line item shows product name). */
export function arrayItemTitle(arrayKey: string, item: unknown, index: number): string {
	if (item && typeof item === 'object') {
		const record = item as Record<string, unknown>;
		// Tax ID rows: prefer the structured `type: value` pair when present,
		// falling back to value-only when `type` is omitted (e.g. some store
		// tax_ids entries). Targeted by `arrayKey` so other shapes that happen
		// to carry `value`/`type` aren't accidentally re-titled.
		if (arrayKey === 'tax_ids') {
			const value = record.value as string | undefined;
			if (typeof value === 'string' && value.length > 0) {
				const type = record.type;
				return type ? `${String(type)}: ${value}` : value;
			}
		}
		const name =
			(record.name as string) ?? (record.label as string) ?? (record.method_title as string);
		if (typeof name === 'string' && name.length > 0) return name;
		const code = record.code as string | undefined;
		if (code) return code;
	}
	return `${arrayKey} #${index + 1}`;
}
