import type { CouponDiscountConfig } from './discount';
import type { CouponInput } from '../../types';

/**
 * Map `CouponInput`s (the adapter-prefetched coupon documents) to the replay's
 * `CouponDiscountConfig` shape, keyed by the given (lowercase) codes.
 *
 * Extracted from `settleCart` so the legacy-convergence oracle
 * (settle.oracle.test.ts) replays today's loop with the EXACT mapping settle
 * uses — the defaults here (`amount || '0'`, `?? null`, `?? false`, array
 * copies) must never be duplicated.
 *
 * Codes absent from the map are skipped; `settleCart`'s missing_coupon gate
 * guarantees presence before this runs, and `recalculateCoupons` zeroes the
 * discount for any coupon line without a config.
 */
export function toCouponConfigs(
	codes: readonly string[],
	coupons: ReadonlyMap<string, CouponInput>
): Map<string, CouponDiscountConfig> {
	const couponConfigs = new Map<string, CouponDiscountConfig>();
	for (const code of codes) {
		const coupon = coupons.get(code);
		if (!coupon) continue;
		couponConfigs.set(code, {
			discount_type: coupon.discount_type,
			amount: coupon.amount || '0',
			limit_usage_to_x_items: coupon.limit_usage_to_x_items ?? null,
			product_ids: [...(coupon.product_ids ?? [])],
			excluded_product_ids: [...(coupon.excluded_product_ids ?? [])],
			product_categories: [...(coupon.product_categories ?? [])],
			excluded_product_categories: [...(coupon.excluded_product_categories ?? [])],
			exclude_sale_items: coupon.exclude_sale_items ?? false,
		});
	}
	return couponConfigs;
}
