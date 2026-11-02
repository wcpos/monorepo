import { convertLocalDateToUTCString } from '../../../../hooks/use-local-date';
import { storeEndOfDayAfter } from '../../../../hooks/use-store-day';

export type ExpiryPreset = 'end_of_day' | 'one_week' | 'one_month';

/** Keep the coupon redeemable through the named store calendar day. */
export function expiryPresetToDate(
	preset: ExpiryPreset,
	timezone: string,
	now: Date = new Date()
): string {
	const amount = preset === 'one_week' ? { weeks: 1 } : preset === 'one_month' ? { months: 1 } : {};
	return convertLocalDateToUTCString(storeEndOfDayAfter(now, timezone, amount));
}
