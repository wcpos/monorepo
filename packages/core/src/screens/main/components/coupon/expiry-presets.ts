import { addMonths, addWeeks, endOfDay } from 'date-fns';

import { convertLocalDateToUTCString } from '../../../../hooks/use-local-date';

export type ExpiryPreset = 'end_of_day' | 'one_week' | 'one_month';

/**
 * Presets resolve to the end of the LOCAL day (23:59:59) — "end of day" means
 * the cashier's day, not UTC's — then store in the WC `_gmt` string format.
 * Client and server both treat a passed timestamp as expired, so the coupon
 * stays redeemable through the named period.
 */
export function expiryPresetToDate(preset: ExpiryPreset, now: Date = new Date()): string {
	switch (preset) {
		case 'end_of_day':
			return convertLocalDateToUTCString(endOfDay(now));
		case 'one_week':
			return convertLocalDateToUTCString(endOfDay(addWeeks(now, 1)));
		case 'one_month':
			return convertLocalDateToUTCString(endOfDay(addMonths(now, 1)));
	}
}
