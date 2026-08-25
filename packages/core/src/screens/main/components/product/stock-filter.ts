import { displayStockStatus, resolveStock, type ResolveStockInput } from './resolve-stock';

/**
 * Does this record match the Stock Status filter the product list is currently showing?
 *
 * The Stock Status pill is the ONE control that says which stock states a product list shows,
 * and the variations under an expanded row are part of that list — they answer to the same pill
 * as the rows around them. The `showOutOfStock` display setting SEEDS that pill on mount
 * (`rebaseFilter` in the POS products screen); it is not a second, hidden filter.
 *
 * Reading the setting directly is what let a cashier clear the pill, watch out-of-stock products
 * appear in the grid, and still be shown 4 of a product's 20 variations — the demo store's
 * "Chromatic" (20 colours, 4 in stock), reported 2026-08-25.
 *
 * An unset filter is no rule at all: every variation shows.
 */
export function matchesStockStatusFilter(
	input: ResolveStockInput,
	filter: string | undefined
): boolean {
	if (!filter) return true;
	/**
	 * `displayStockStatus` tracks a local quantity edit before the server echoes `stock_status`
	 * back, so an edit moves a variation between filtered views as soon as it lands. It returns
	 * undefined only for a payload carrying no status at all, where `resolveStock`'s default is
	 * the answer WooCommerce itself would give.
	 */
	return (displayStockStatus(input) ?? resolveStock(input).status) === filter;
}
