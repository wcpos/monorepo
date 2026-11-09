import { fromMinor, toMinor } from '@wcpos/order-math';

import { resultOf, resultText } from './closure-result';

/** Cash is counted in at least cents: a store that hides decimals still holds coins. */
export const countDecimals = (priceDecimals: unknown) => Math.max(2, Number(priceDecimals ?? 2));

// `decimals` is `countDecimals(price_num_decimals)`: a 3-place currency (KWD, BHD) counts in fils, a 0-place store still in cents.
export const validAmount = (value: string, decimals: number) =>
	/^(?:\d+\.?\d*|\.\d+)$/.test(value) &&
	Number.isFinite(Number(value)) &&
	Number.isSafeInteger(toMinor(value, decimals));
export const countVariance = (counted: string, expected: string, decimals: number) =>
	toMinor(counted, decimals) - toMinor(expected, decimals);
export const overThreshold = (variance: number, decimals: number, threshold?: string | null) =>
	!!threshold?.trim() && Math.abs(variance) > toMinor(threshold, decimals);
export const denominationTotal = (pieces: Record<string, number>, decimals: number) =>
	Object.entries(pieces).reduce((sum, [value, count]) => sum + toMinor(value, decimals) * count, 0);
export function varianceAmount(
	variance: number,
	decimals: number,
	format: (value: number) => string
) {
	const abs = Math.abs(Number(fromMinor(variance, decimals)));
	return variance < 0 ? `−${format(abs)}` : variance > 0 ? `+${format(abs)}` : format(0);
}
export function varianceText(
	variance: number,
	decimals: number,
	format: (value: number) => string,
	t: (key: string) => string
) {
	return resultText(resultOf(variance), varianceAmount(variance, decimals, format), t, 'register');
}
