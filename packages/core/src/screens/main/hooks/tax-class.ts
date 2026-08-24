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
 * `@wcpos/order-math` already resolves the sentinel to the standard class when a
 * shipping line carries no class of its own (`extractShippingLineData`). This is the
 * UI face of that same resolution, for the one place a cart line is *authored*: the
 * Add shipping dialog seeds its tax-class field from the store setting, and seeding
 * it with the raw sentinel both blanks the select and — because the dialog stamps the
 * field into the line's pos_data, where it outranks the engine's default — filters
 * the rate list down to nothing, so the line is added with no tax at all.
 *
 * Settings deliberately does NOT go through this: there `'inherit'` is a value the
 * merchant owns and must be able to see and re-select, so `TaxClassSelect` offers it
 * as an option instead.
 */
export const INHERIT_TAX_CLASS = 'inherit';

export function shippingTaxClassFromStore(value?: string | null): string {
	return value === INHERIT_TAX_CLASS ? STANDARD_TAX_CLASS : taxClassFromWire(value);
}
