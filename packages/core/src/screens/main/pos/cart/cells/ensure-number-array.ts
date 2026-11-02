/**
 * The cart's quick discounts, from the setting's comma list (or an array). Only real percentages
 * survive (0 < d ≤ 100): a cleared setting is no discounts, not a `−0%` key, a typo is dropped,
 * not `NaN`, and `150` is dropped rather than drawing a key that saves a negative price. How
 * many become keys is the price keypad's to decide (its row holds three).
 */
export function ensureNumberArray(input: string | number[]): number[] {
	const parts = typeof input === 'string' ? input.split(',') : Array.isArray(input) ? input : [];
	return parts.map(Number).filter((n) => n > 0 && n <= 100);
}
