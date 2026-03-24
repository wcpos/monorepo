/**
 * WooCommerce-compatible precision and rounding utilities.
 *
 * These functions mirror the PHP implementations in:
 * - wc-core-functions.php (wc_get_rounding_precision, wc_add_number_precision, wc_remove_number_precision)
 * - wc-formatting-functions.php (wc_round_tax_total, wc_round_discount)
 * - class-woocommerce.php (WC_ROUNDING_PRECISION, WC_DISCOUNT_ROUNDING_MODE, WC_TAX_ROUNDING_MODE)
 */

/**
 * Equivalent to PHP's round() with PHP_ROUND_HALF_UP (mode 1).
 * This is the default rounding in most languages, including JS Math.round for positive numbers,
 * but we need an explicit implementation that handles arbitrary precision.
 */
export function roundHalfUp(value: number, precision: number): number {
	const factor = Math.pow(10, precision);
	const sign = value < 0 ? -1 : 1;
	// Use Number.EPSILON to handle floating point edge cases like 2.725 * 100 = 272.49999...
	// Operate on absolute value so ties round away from zero (PHP ROUND_HALF_UP behavior)
	return (sign * Math.round((Math.abs(value) + Number.EPSILON) * factor)) / factor;
}

/**
 * Equivalent to PHP's round() with PHP_ROUND_HALF_DOWN (mode 2).
 * When the value is exactly at the midpoint (e.g., 2.725 with precision 2),
 * it rounds DOWN (toward zero) instead of up.
 *
 * WooCommerce uses this for:
 * - Tax rounding when prices_include_tax = 'yes' (WC_TAX_ROUNDING_MODE = PHP_ROUND_HALF_DOWN)
 * - Discount rounding (WC_DISCOUNT_ROUNDING_MODE = PHP_ROUND_HALF_DOWN)
 */
export function roundHalfDown(value: number, precision: number): number {
	const factor = Math.pow(10, precision);
	const shifted = value * factor;
	// Check if we're at a midpoint (exactly .5 after shift)
	// Use a small epsilon to detect "close to .5" due to floating point
	const epsilon = 1e-8;
	const remainder = Math.abs(shifted - Math.floor(shifted) - 0.5);
	if (remainder < epsilon) {
		// At midpoint — round toward zero (down for positive, up for negative)
		return (value >= 0 ? Math.floor(shifted) : Math.ceil(shifted)) / factor;
	}
	// Not at midpoint — use standard rounding
	return Math.round(shifted) / factor;
}

/**
 * WC: wc_get_rounding_precision()
 * Returns max(dp + 2, WC_ROUNDING_PRECISION) where WC_ROUNDING_PRECISION = 6.
 */
export function getRoundingPrecision(dp: number): number {
	return Math.max(dp + 2, 6);
}

/**
 * WC: wc_add_number_precision($value, $round)
 * Shifts a decimal value into "cents" (integer precision).
 *
 * e.g., with dp=2: 9.99 -> 999
 *
 * The $round parameter controls the rounding precision after multiplication:
 * - true (default): round to (roundingPrecision - dp) places, e.g. 6-2=4
 * - false: round to roundingPrecision places, e.g. 6
 */
export function addNumberPrecision(value: number, dp: number, round = true): number {
	const factor = Math.pow(10, dp);
	const result = value * factor;
	const roundingPrecision = getRoundingPrecision(dp);
	const roundPrecision = round ? roundingPrecision - dp : roundingPrecision;
	return roundHalfUp(result, roundPrecision);
}

/**
 * WC: wc_remove_number_precision($value)
 * Shifts a "cents" value back to decimal.
 *
 * e.g., with dp=2: 999 -> 9.99
 */
export function removeNumberPrecision(value: number, dp: number): number {
	return value / Math.pow(10, dp);
}

/**
 * WC: wc_round_tax_total($value, $precision)
 * Rounds a tax total using the appropriate rounding mode:
 * - HALF_DOWN when prices include tax (WC_TAX_ROUNDING_MODE = PHP_ROUND_HALF_DOWN)
 * - HALF_UP when prices exclude tax (WC_TAX_ROUNDING_MODE = PHP_ROUND_HALF_UP)
 *
 * @param value - The tax value to round
 * @param dp - The number of decimal places (wc_get_price_decimals)
 * @param pricesIncludeTax - Whether prices include tax
 * @param precision - Override precision (defaults to dp). Pass 0 for cent-precision rounding.
 */
export function roundTaxTotal(
	value: number,
	dp: number,
	pricesIncludeTax: boolean,
	precision?: number
): number {
	const p = precision ?? dp;
	return pricesIncludeTax ? roundHalfDown(value, p) : roundHalfUp(value, p);
}

/**
 * WC: wc_round_discount($value, $precision)
 * Rounds a discount amount using PHP_ROUND_HALF_DOWN.
 * WC_DISCOUNT_ROUNDING_MODE = PHP_ROUND_HALF_DOWN (always, regardless of tax setting).
 */
export function roundDiscount(value: number, precision: number): number {
	return roundHalfDown(value, precision);
}
