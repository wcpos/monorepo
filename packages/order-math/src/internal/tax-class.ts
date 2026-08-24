/**
 * The WooCommerce REST API spells the standard tax class as an empty string on
 * order documents and line items (the wc/v3 taxes endpoint spells rate classes
 * 'standard'). Every read of an item's tax_class for rate matching must
 * normalize through this helper; the sites that inline the ternary are exactly
 * the ones that drift.
 *
 * The UI ⇄ wire codec for the same quirk lives in
 * packages/core/src/screens/main/hooks/tax-class.ts — core depends on
 * order-math, not the reverse, so each package owns its own face of the fact.
 */
export const STANDARD_TAX_CLASS = 'standard';

export function normalizeTaxClass(value?: string | null): string {
	return value === '' || value === null || value === undefined ? STANDARD_TAX_CLASS : value;
}

/**
 * WooCommerce's "shipping tax class based on the cart items" sentinel — the value a
 * store's `woocommerce_shipping_tax_class` option holds by default. It is not a class:
 * it matches no tax rate, and it must be resolved against the order's line items
 * before any rate lookup.
 */
export const INHERIT_TAX_CLASS = 'inherit';

/** Resolved to "no shipping tax at all", which is distinct from "the standard class". */
export const NO_SHIPPING_TAX = null;

/**
 * Port of the `'inherit'` branch of `WC_Abstract_Order::calculate_taxes()` — the path
 * WooCommerce takes for an order, which is what this package builds (the storefront's
 * `WC_Tax::get_shipping_tax_rates()` reaches the same answer through the live cart).
 *
 * ```php
 * $found_classes      = array_intersect( array_merge( array( '' ), WC_Tax::get_tax_class_slugs() ), $this->get_items_tax_classes() );
 * $shipping_tax_class = count( $found_classes ) ? current( $found_classes ) : false;
 * // Orders without product line items have no tax class to inherit, so use the standard class.
 * if ( false === $shipping_tax_class && 0 === count( $this->get_items() ) ) {
 *     $shipping_tax_class = '';
 * }
 * ```
 *
 * Three details the PHP encodes positionally and are easy to lose in a port:
 *
 * 1. `array_intersect` preserves the order of its FIRST argument, so the candidate
 *    order is the configured tax-class order with the standard class ahead of it —
 *    **the standard class wins whenever any line item carries it**, never "the first
 *    class in the cart".
 * 2. `get_items()` defaults to `'line_item'`, so **fee lines are not inherited from**,
 *    and only line items count toward the "no items" fallback.
 * 3. `get_items_tax_classes()` skips items that are not taxable. Line items that exist
 *    but are all non-taxable therefore give `false`, not `''` — and WooCommerce then
 *    charges **no shipping tax**. Returning the standard class there would invent tax
 *    on an order WooCommerce leaves untaxed.
 */
export function resolveInheritedShippingTaxClass(
	activeLineItems: readonly { tax_class?: string | null; taxable: boolean }[],
	taxClassSlugs: readonly string[]
): string | typeof NO_SHIPPING_TAX {
	const itemClasses = new Set(
		activeLineItems.filter((item) => item.taxable).map((item) => normalizeTaxClass(item.tax_class))
	);

	// No taxable classes to inherit. An order with no line items at all (shipping- or
	// fee-only) falls back to the standard class; one whose items are ALL non-taxable
	// does not — see (3).
	if (itemClasses.size === 0) {
		return activeLineItems.length === 0 ? STANDARD_TAX_CLASS : NO_SHIPPING_TAX;
	}

	// (1) and (2) are decided by the cart alone. Ordering them ahead of the configured
	// list is not just an optimisation: `taxClassSlugs` comes from a lazily fetched
	// endpoint, and resolving the common carts without it means an unfetched list
	// cannot silently zero the shipping tax.
	if (itemClasses.has(STANDARD_TAX_CLASS)) return STANDARD_TAX_CLASS;
	if (itemClasses.size === 1) return [...itemClasses][0];

	// (3) Several non-standard classes: the configured order breaks the tie.
	const found = taxClassSlugs.find((slug) => itemClasses.has(normalizeTaxClass(slug)));
	if (found !== undefined) return normalizeTaxClass(found);

	// Nothing matched. `wc/v3 taxes/classes` always contains the standard class, so an
	// EMPTY list means it has not loaded yet (or its fetch failed) — not that the cart's
	// classes were all rejected. Charging nothing on unloaded reference data would
	// under-tax the order and stay wrong for as long as the fetch keeps failing, so the
	// unknown case takes the standard class and only a genuinely loaded list that
	// matches nothing yields no shipping tax.
	if (taxClassSlugs.length === 0) return STANDARD_TAX_CLASS;
	return NO_SHIPPING_TAX;
}
