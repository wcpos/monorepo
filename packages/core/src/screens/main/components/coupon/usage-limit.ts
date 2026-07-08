/**
 * Usage-limit fields (`usage_limit`, `usage_limit_per_user`, `limit_usage_to_x_items`) are
 * "no limit" when unset, which WooCommerce stores as null.
 *
 * We cannot submit null to clear a limit: WC_REST_Coupons_Controller skips every writable
 * property that arrives as null, so a full-document POST built from a cleared field would
 * leave the previous limit in place. Sending 0 clears it instead — WC_Coupon::set_usage_limit()
 * maps any value below 1 back to null, and the server echoes null in the response.
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
