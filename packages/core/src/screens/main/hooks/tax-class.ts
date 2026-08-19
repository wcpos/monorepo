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
