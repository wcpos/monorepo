/**
 * WooCommerce wire-value sentinels (ADR 0029 decision 1): the wc/v3 wire hangs
 * distinct meanings off the number 0. Name them once here — no magic zeros at
 * consumer sites.
 */

/** WooCommerce's guest customer: `customer_id` 0 on an order means "no registered customer". */
export const GUEST_CUSTOMER_ID = 0;

export function isGuestCustomer(customerId: number | null | undefined): boolean {
	return customerId === GUEST_CUSTOMER_ID;
}

/**
 * A miscellaneous (custom, non-catalog) product: `product_id` 0 on an order line item.
 * Distinct from `product_id: null`, which is the settled-line tombstone (see
 * `isActiveLineItem` in `@wcpos/order-math`).
 */
export const MISC_PRODUCT_ID = 0;

export function isMiscProductLine(line: { product_id?: number | null }): boolean {
	return line.product_id === MISC_PRODUCT_ID;
}
