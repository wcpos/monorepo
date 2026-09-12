import { fromMinor, toMinor } from '@wcpos/order-math';

export const validAmount = (value: string) =>
	/^(?:\d+\.?\d*|\.\d+)$/.test(value) &&
	Number.isFinite(Number(value)) &&
	Number.isSafeInteger(toMinor(value, 2));
export const countVariance = (counted: string, expected: string) =>
	toMinor(counted, 2) - toMinor(expected, 2);
export const overThreshold = (variance: number, threshold?: string | null) =>
	!!threshold?.trim() && Math.abs(variance) > toMinor(threshold, 2);
export const denominationTotal = (pieces: Record<string, number>) =>
	Object.entries(pieces).reduce((sum, [value, count]) => sum + toMinor(value, 2) * count, 0);
export function varianceText(
	variance: number,
	format: (value: number) => string,
	t: (key: string) => string
) {
	if (!variance) return t('register.exact');
	return `${variance < 0 ? '−' : '+'}${format(Number(fromMinor(Math.abs(variance), 2)))} ${t(variance < 0 ? 'register.short' : 'register.over')}`;
}
