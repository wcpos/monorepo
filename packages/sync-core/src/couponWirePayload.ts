/**
 * Coupon wire-payload mapping.
 *
 * The client's canonical coupon expiry field is `date_expires_gmt` (UTC, in the
 * WC `_gmt` string shape `yyyy-MM-ddTHH:mm:ss`, no timezone suffix). WooCommerce's
 * coupons REST controller cannot persist that field: `prepare_object_for_database`
 * falls through to `is_callable( array( $coupon, "set_date_expires_gmt" ) )` and
 * `WC_Coupon` only defines `set_date_expires`, so the `_gmt` variant is silently
 * dropped (class-wc-rest-coupons-v2-controller.php, unchanged through wc/v3).
 * Only `date_expires` is writable — so the wire payload must carry it.
 */

/** The suffix-less UTC shape the client stamps (`convertLocalDateToUTCString`). */
const PLAIN_GMT_DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/;

/**
 * Derives the writable `date_expires` from the canonical `date_expires_gmt`.
 *
 * - A plain `_gmt` string gets a `Z` suffix: `WC_Data::set_date_prop` treats a
 *   suffix-less string as SITE-LOCAL time, and only an explicit offset (or `Z`)
 *   as UTC — forwarding the value verbatim would shift the expiry by the site's
 *   UTC offset.
 * - Clearing must ride an empty string, never null: the controller skips null
 *   params entirely (`! is_null( $value )`), while `set_date_expires( '' )`
 *   nulls the stored date.
 * - `date_expires` is always overwritten when the `_gmt` key is present — a
 *   full-document update otherwise echoes the STALE server-rendered site-local
 *   `date_expires` alongside the freshly edited `_gmt` value, and the server
 *   would persist the stale one.
 *
 * Payloads without the `date_expires_gmt` key pass through untouched.
 */
export function mapCouponExpiryToPayload(
	payload: Record<string, unknown>
): Record<string, unknown> {
	if (!('date_expires_gmt' in payload)) return payload;
	const mapped = { ...payload };
	const gmt = mapped.date_expires_gmt;
	if (typeof gmt === 'string' && gmt !== '') {
		mapped.date_expires = PLAIN_GMT_DATETIME.test(gmt) ? `${gmt}Z` : gmt;
	} else {
		mapped.date_expires = '';
	}
	return mapped;
}
