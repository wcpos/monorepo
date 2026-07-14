/**
 * Usage-limit fields (`usage_limit`, `usage_limit_per_user`, `limit_usage_to_x_items`) mean
 * "no limit" when unset. Two WooCommerce coupon REST behaviours — both verified against WC
 * core (Version2 coupons controller + WC_Coupon) — dictate that we clear with 0, not null:
 *
 *   1. `prepare_object_for_database()` skips any writable property that arrives as `null`
 *      (`if ( ! is_null( $value ) )`). So POSTing `usage_limit: null` in the full-document
 *      push from `usePushDocument` leaves an existing limit untouched — null cannot clear.
 *   2. The setters run the value through `absint()` (0 for a blank field), so 0 is a real
 *      write that clears the limit. `get_formatted_item_data()` then coerces 0 back to `null`
 *      for all three fields in the response, so the server always echoes `null` for "no limit".
 *
 * Net: submit 0 to clear. It is written and clears the limit, and the server echoes `null`,
 * which the usage column renders as "no limit".
 */
export const NO_USAGE_LIMIT = 0;

/**
 * Parse user input into a value safe to submit. A blank field becomes the clearing sentinel
 * rather than null. Non-digits are stripped so a pasted "1,000" or "-5" cannot reach the API.
 */
export function toUsageLimit(text: string | number | undefined | null): number {
	const cleaned = String(text ?? '').replace(/[^0-9]/g, '');
	return cleaned === '' ? NO_USAGE_LIMIT : parseInt(cleaned, 10);
}

/**
 * Render a stored limit for the text input. Both null (never set) and 0 (just cleared) are
 * "no limit" and so display as a blank field.
 */
export function fromUsageLimit(value: number | null | undefined): string {
	return value == null || value === NO_USAGE_LIMIT ? '' : String(value);
}

/**
 * The "One-time use" switch is a convenience view over `usage_limit`: exactly 1
 * means one-time. Turning it off writes the clearing sentinel (0), because
 * WooCommerce ignores `null` on write — see NO_USAGE_LIMIT above.
 */
export const ONE_TIME_USE = 1;

export function isOneTimeUse(value: number | null | undefined): boolean {
	return value === ONE_TIME_USE;
}

export function toggleOneTimeUse(checked: boolean): number {
	return checked ? ONE_TIME_USE : NO_USAGE_LIMIT;
}
