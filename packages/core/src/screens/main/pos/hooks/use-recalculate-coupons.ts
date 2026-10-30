import * as React from 'react';

import { resolveCouponReplay } from '@wcpos/order-math/internal';

import {
	recalculateCoupons,
	type RecalculateInput,
	type RecalculateResult,
} from './coupon-recalculate';
import { useCartConfig } from './use-cart-config';
import { useCouponContext } from './use-coupon-context';

type LineItem = import('@wcpos/query').OrderLineItem;
type CouponLine = import('@wcpos/query').OrderCouponLine;

/**
 * Hook that wraps the pure recalculateCoupons() function with engine lookups
 * for coupon configs, product categories, and tax context.
 *
 * Returns a callback that takes line items and coupon lines, looks up all
 * necessary context, and returns the recalculated result.
 */
export const useRecalculateCoupons = () => {
	const config = useCartConfig();
	const { getCouponContext } = useCouponContext();

	const recalculate = React.useCallback(
		async (lineItems: LineItem[], couponLines: CouponLine[]): Promise<RecalculateResult> => {
			// Filter to active coupon codes
			const activeCodes = couponLines
				.filter((cl): cl is CouponLine & { code: string } => cl.code != null)
				.map((cl) => cl.code.toLowerCase());

			const context = await getCouponContext(lineItems, couponLines);
			const replay = resolveCouponReplay(context, activeCodes);
			if (!replay.ok) {
				// Do not persist coupon lines with stale discounts when a record is missing.
				throw new Error(`Coupon "${replay.missingCodes[0]}" not found in local collection`);
			}

			return recalculateCoupons({
				lineItems,
				couponLines,
				couponConfigs: replay.couponConfigs,
				productCategories: replay.productCategories,
				pricesIncludeTax: config.pricesIncludeTax,
				vatExempt: config.vatExempt,
				calcDiscountsSequentially: config.calcDiscountsSequentially,
				taxRates: [...config.rates] as RecalculateInput['taxRates'],
				taxRoundAtSubtotal: config.taxRoundAtSubtotal,
				dp: config.dp,
			});
		},
		[config, getCouponContext]
	);

	return { recalculate };
};
