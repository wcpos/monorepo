import { fromMinor, toMinor } from '@wcpos/order-math';

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
	if (!variance) return t('register.exact');
	return `${varianceAmount(variance, decimals, format)} ${variance < 0 ? t('register.short') : t('register.over')}`;
}

/**
 * Whether leaving the count abandons it to selling (#2016): a count in progress does, and so
 * does a close the store refused, the count kept. A closed session awaiting its closure write is
 * not one to reopen; one already back at open needs no second abandon. The count's back and the
 * panel's close share this rule.
 */
export const mayAbandonCount = (
	session: { status?: string } | null | undefined,
	refusedClose: boolean | undefined
) => session?.status === 'counting' || (!!refusedClose && session?.status !== 'open');
