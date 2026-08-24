/**
 * The WooCommerce REST API spells the standard tax class as an empty string and
 * rejects the literal 'standard' with an error, while UI selects can't hold ''
 * as a value — so the app spells it 'standard'. Every read of a wire/document
 * tax_class and every write back to one must go through this codec; the sites
 * that inline the ternary are exactly the ones that drift.
 */
export const STANDARD_TAX_CLASS = 'standard';

export function taxClassFromWire(value?: string | null): string {
	return value === '' || value === null || value === undefined ? STANDARD_TAX_CLASS : value;
}

export function taxClassToWire(value?: string | null): string {
	return value === STANDARD_TAX_CLASS || value === null || value === undefined ? '' : value;
}

/**
 * WooCommerce's shipping tax class carries one extra spelling the item classes do
 * not: `'inherit'` — "shipping tax class based on cart items", and the default a
 * fresh store arrives with. It is a sentinel, not a slug, so it matches no entry in
 * the server's tax-class list and no tax rate.
 *
 * It is NOT a spelling of the standard class. `@wcpos/order-math` resolves it against
 * the order's line items, mirroring `WC_Abstract_Order::calculate_taxes()`, so it must
 * survive the UI ⇄ wire codec untouched in both directions. Selects that can hold it
 * pass `includeInherit` to `TaxClassSelect`.
 */
export const INHERIT_TAX_CLASS = 'inherit';
