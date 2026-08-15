import type { CouponLineInput, FeeLineInput, LineItemInput, ShippingLineInput } from './types';

export interface CartSnapshot {
	readonly line_items?: readonly LineItemInput[];
	readonly fee_lines?: readonly FeeLineInput[];
	readonly shipping_lines?: readonly ShippingLineInput[];
	readonly coupon_lines?: readonly CouponLineInput[];
	readonly billing?: { readonly email?: string }; // coupon validation only
	readonly customer_id?: number | null; // coupon validation only
	// persisted totals — read ONLY for `changed` detection; optional (absent ⇒ changed: true)
	readonly discount_total?: string;
	readonly discount_tax?: string;
	readonly shipping_total?: string;
	readonly shipping_tax?: string;
	readonly cart_tax?: string;
	readonly total?: string;
	readonly total_tax?: string;
	readonly tax_lines?: readonly unknown[];
}

/** The one sanctioned snapshot constructor — no `as CartSnapshot` casts in adapters. */
export function snapshotFromOrderJSON(json: {
	line_items?: unknown;
	fee_lines?: unknown;
	shipping_lines?: unknown;
	coupon_lines?: unknown;
	billing?: unknown;
	customer_id?: unknown;
	discount_total?: unknown;
	discount_tax?: unknown;
	shipping_total?: unknown;
	shipping_tax?: unknown;
	cart_tax?: unknown;
	total?: unknown;
	total_tax?: unknown;
	tax_lines?: unknown;
}): CartSnapshot {
	const billing = json.billing as Record<string, unknown> | null | undefined;

	return {
		line_items: Array.isArray(json.line_items) ? (json.line_items as LineItemInput[]) : [],
		fee_lines: Array.isArray(json.fee_lines) ? (json.fee_lines as FeeLineInput[]) : [],
		shipping_lines: Array.isArray(json.shipping_lines)
			? (json.shipping_lines as ShippingLineInput[])
			: [],
		coupon_lines: Array.isArray(json.coupon_lines) ? (json.coupon_lines as CouponLineInput[]) : [],
		billing:
			billing != null && typeof billing === 'object'
				? { email: billing['email'] as string | undefined }
				: undefined,
		customer_id: json.customer_id as number | null | undefined,
		discount_total: json.discount_total as string | undefined,
		discount_tax: json.discount_tax as string | undefined,
		shipping_total: json.shipping_total as string | undefined,
		shipping_tax: json.shipping_tax as string | undefined,
		cart_tax: json.cart_tax as string | undefined,
		total: json.total as string | undefined,
		total_tax: json.total_tax as string | undefined,
		tax_lines: json.tax_lines as readonly unknown[] | undefined,
	};
}

/**
 * Tombstone predicate for line items.
 * Convention: product_id === null marks a tombstone; product_id 0 is an active misc product.
 */
export function isActiveLineItem(item: LineItemInput): boolean {
	return item.product_id !== null;
}

/**
 * Tombstone predicate for fee lines.
 * Convention: name === null marks a tombstone.
 */
export function isActiveFeeLine(item: FeeLineInput): boolean {
	return item.name !== null;
}

/**
 * Tombstone predicate for shipping lines.
 * Convention: method_id === null marks a tombstone.
 */
export function isActiveShippingLine(item: ShippingLineInput): boolean {
	return item.method_id !== null;
}

/**
 * Tombstone predicate for coupon lines.
 * Convention: code == null (loose equality) marks a tombstone — both null and undefined are tombstones.
 */
export function isActiveCouponLine(item: CouponLineInput): boolean {
	return item.code != null;
}
