import type { CouponDiscountConfig } from './discount';
import type { CouponInput } from '../../types';

/**
 * Map `CouponInput`s (the adapter-prefetched coupon documents) to the replay's
 * `CouponDiscountConfig` shape, keyed by the given (lowercase) codes.
 *
 * Extracted from `settleCart` so a differential harness can replay the composition
 * with the EXACT mapping settle uses — the defaults here (`amount || '0'`, `?? null`,
 * `?? false`, array copies) must never be duplicated. The original caller,
 * `settle.oracle.test.ts`, is retired; `settle-cart-differential.test.ts` in
 * packages/core is the harness that relies on this now (via its own
 * `toLegacyCouponConfigs`, which must stay in step with this function).
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
