/**
 * Rounded to the four places WooCommerce stores a rate in; trailing zeros fall away. Its own
 * module so the pure tax helpers can use it without `usePercentFormat`'s app-state graph.
 */
export function roundPercent(value: number): number {
	return Math.round(value * 10000) / 10000;
}
