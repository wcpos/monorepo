/**
 * The cart's quick discounts, from the setting's comma list (or an array). Only real percentages
 * survive: a cleared setting is no discounts, not a `−0%` chip, and a typo is dropped, not `NaN`.
 */
export function ensureNumberArray(input: string | number[]): number[] {
	const parts = typeof input === 'string' ? input.split(',') : Array.isArray(input) ? input : [];
	return parts.map(Number).filter((n) => Number.isFinite(n) && n > 0);
}
