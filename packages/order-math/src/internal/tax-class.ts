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
