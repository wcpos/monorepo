import type { CouponInput } from '@wcpos/order-math';
import type { CouponDiscountConfig } from '@wcpos/order-math/internal';

export const QUICK_DISCOUNT_META_KEY = '_wcpos_quick_discount';
type QuickDiscountIntent = { discount_type: 'percent' | 'fixed_cart'; amount: string };
type IntentLine = { meta_data?: readonly { key?: string; value?: unknown }[] | null };

export function readQuickDiscountIntent(line: IntentLine): QuickDiscountIntent | null {
	let value = line.meta_data?.find((meta) => meta.key === QUICK_DISCOUNT_META_KEY)?.value;
	if (typeof value === 'string') {
		try {
			value = JSON.parse(value);
		} catch {
			return null;
		}
	}
	if (!value || typeof value !== 'object') return null;
	const { discount_type, amount } = value as Record<string, unknown>;
	if (discount_type !== 'percent' && discount_type !== 'fixed_cart') return null;
	if (
		typeof amount !== 'string' ||
		!/^\d*\.?\d+$/.test(amount) ||
		!Number.isFinite(Number(amount)) ||
		Number(amount) <= 0 ||
		(discount_type === 'percent' && Number(amount) > 100)
	)
		return null;
	return {
		discount_type,
		amount: amount
			.replace(/^0+(?=\d)/, '')
			.replace(/(\.\d*?)0+$/, '$1')
			.replace(/\.$/, '')
			.replace(/^\./, '0.'),
	};
}

export function quickDiscountCouponConfig(intent: QuickDiscountIntent): CouponDiscountConfig {
	return {
		...intent,
		limit_usage_to_x_items: null,
		product_ids: [],
		excluded_product_ids: [],
		product_categories: [],
		excluded_product_categories: [],
		exclude_sale_items: false,
	};
}

export function quickDiscountCouponInput(code: string, intent: QuickDiscountIntent): CouponInput {
	const coupon = {
		...quickDiscountCouponConfig(intent),
		code,
		individual_use: false,
		free_shipping: false,
		date_expires_gmt: null,
		usage_limit: null,
		usage_count: 0,
		usage_limit_per_user: null,
		used_by: [],
		minimum_amount: '0',
		maximum_amount: '0',
		email_restrictions: [],
	};
	return coupon;
}

export function mintQuickDiscountCode(existingCodes: readonly string[]): string {
	const used = new Set(existingCodes.map((code) => code.toLowerCase()));
	let code = 'pos-discount';
	for (let suffix = 2; used.has(code); suffix++) code = `pos-discount-${suffix}`;
	return code;
}

/**
 * The cashier-facing label. `formatNumber` renders the percentage with the store's
 * decimal separator (a comma-locale till shows "Discount (12,5%)"); without it the
 * canonical "12.5" is used.
 */
export function quickDiscountLabel(
	intent: QuickDiscountIntent,
	t: (key: string, options?: Record<string, unknown>) => string,
	formatNumber: (value: number) => string = (value) => String(value)
): string {
	return intent.discount_type === 'percent'
		? t('pos_cart.discount_percent', { percent: formatNumber(Number(intent.amount)) })
		: t('pos_cart.discount');
}

/** A minimal number formatter for contexts without the store hooks (receipt builder). */
export function decimalSeparatorFormatter(separator: string | undefined) {
	return (value: number) => String(value).replace('.', separator || '.');
}
