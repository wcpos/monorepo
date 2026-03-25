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
	if (!Number.isFinite(value) || value === 0) return value;

	const sign = value < 0 ? -1 : 1;
	const abs = Math.abs(value);
	const factor = Math.pow(10, precision);

	// Baseline: PHP's core algorithm — floor(shifted + 0.5).
	// This handles non-midpoint cases correctly even when float subtraction
	// produces values like 2 - 1.33 = 0.6699999999999999 (shifted * 100 = 67 exact).
	const shifted = abs * factor;
	let result = Math.floor(shifted + 0.5);

	// Fix for true midpoints where float multiplication lands just below .5.
	// Example: 19.275 * 100 = 1927.4999999998 → floor(+0.5) = 1927 (wrong).
	// But String(19.275) = "19.275" — the '5' at the 3rd decimal proves it IS
	// a true midpoint. PHP's round() correctly returns 19.28 for these cases.
	//
	// We detect true midpoints via the shortest decimal representation:
	// if the digit at `precision` is exactly 5 with no trailing non-zero digits,
	// force round up (away from zero).
	const str = String(abs);
	const dot = str.indexOf('.');
	if (dot !== -1) {
		const decimals = str.slice(dot + 1);
		if (precision < decimals.length && decimals[precision] === '5') {
			const rest = decimals.slice(precision + 1);
			if (rest === '' || /^0*$/.test(rest)) {
				// True midpoint — ensure we round UP (HALF_UP)
				result = Math.floor(shifted) + 1;
			}
		}
	}

	return (sign * result) / factor;
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
	if (!Number.isFinite(value) || value === 0) return value;

	const sign = value < 0 ? -1 : 1;
	const abs = Math.abs(value);
	const factor = Math.pow(10, precision);

	// Baseline: floor(shifted + 0.5) — standard rounding (half up).
	const shifted = abs * factor;
	let result = Math.floor(shifted + 0.5);

	// For true midpoints (detected via shortest decimal), round DOWN toward zero.
	// Same detection as roundHalfUp but opposite action at the midpoint.
	const str = String(abs);
	const dot = str.indexOf('.');
	if (dot !== -1) {
		const decimals = str.slice(dot + 1);
		if (precision < decimals.length && decimals[precision] === '5') {
			const rest = decimals.slice(precision + 1);
			if (rest === '' || /^0*$/.test(rest)) {
				// True midpoint — round DOWN (toward zero, HALF_DOWN)
				result = Math.floor(shifted);
			}
		}
	}

	return (sign * result) / factor;
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
