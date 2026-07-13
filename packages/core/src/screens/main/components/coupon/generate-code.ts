/**
 * Charset excludes 0/O, 1/I/L — a cashier may read a code aloud or retype it
 * from a printed receipt, so every character must be unambiguous.
 */
export const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

const CODE_LENGTH = 4;
const CODE_PREFIX = 'POS-';

/**
 * WooCommerce lowercases codes on save (`wc_format_coupon_code`); uppercase is
 * only the display/entry form, and matching is case-insensitive.
 */
export function generateCouponCode(random: () => number = Math.random): string {
	let out = '';
	for (let i = 0; i < CODE_LENGTH; i++) {
		out += CODE_CHARS[Math.floor(random() * CODE_CHARS.length)];
	}
	return `${CODE_PREFIX}${out}`;
}
