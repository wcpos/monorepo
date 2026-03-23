import * as React from 'react';

import { recalculateCoupons, type RecalculateResult } from './coupon-recalculate';
import { useTaxRates } from '../../contexts/tax-rates';
import { useCollection } from '../../hooks/use-collection';

import type { CouponDiscountConfig } from './coupon-discount';

type LineItem = NonNullable<import('@wcpos/database').OrderDocument['line_items']>[number];
type CouponLine = NonNullable<import('@wcpos/database').OrderDocument['coupon_lines']>[number];

/**
 * Hook that wraps the pure recalculateCoupons() function with RxDB lookups
 * for coupon configs, product categories, and tax context.
 *
 * Returns a callback that takes line items and coupon lines, looks up all
 * necessary context, and returns the recalculated result.
 */
export const useRecalculateCoupons = () => {
	const { collection: couponCollection } = useCollection('coupons');
	const { collection: productCollection } = useCollection('products');
	const { rates: taxRates, pricesIncludeTax } = useTaxRates();

	const recalculate = React.useCallback(
		async (lineItems: LineItem[], couponLines: CouponLine[]): Promise<RecalculateResult> => {
			// Filter to active coupon codes
			const activeCodes = couponLines
				.filter((cl): cl is CouponLine & { code: string } => cl.code != null)
				.map((cl) => cl.code.toLowerCase());

			// Build couponConfigs from RxDB
			const couponConfigs = new Map<string, CouponDiscountConfig>();
			for (const code of activeCodes) {
				const couponDoc = await couponCollection.findOne({ selector: { code } }).exec();
				if (couponDoc) {
					const cd = couponDoc.toJSON();
					couponConfigs.set(code, {
						discount_type: cd.discount_type as any,
						amount: cd.amount || '0',
						limit_usage_to_x_items: cd.limit_usage_to_x_items ?? null,
						product_ids: [...(cd.product_ids || [])],
						excluded_product_ids: [...(cd.excluded_product_ids || [])],
						product_categories: [...(cd.product_categories || [])],
						excluded_product_categories: [...(cd.excluded_product_categories || [])],
						exclude_sale_items: cd.exclude_sale_items || false,
					});
				}
			}

			// Build product categories map
			const productCategories = new Map<number, { id: number }[]>();
			const productIds = lineItems
				.map((item) => item.product_id)
				.filter((id): id is number => id != null);
			if (productIds.length > 0) {
				const products = await productCollection
					.find({ selector: { id: { $in: productIds } } })
					.exec();
				for (const p of products) {
					if (p.id != null) {
						productCategories.set(p.id, (p.categories || []) as { id: number }[]);
					}
				}
			}

			return recalculateCoupons({
				lineItems,
				couponLines,
				couponConfigs,
				pricesIncludeTax,
				calcDiscountsSequentially: false, // WC default
				taxRates: taxRates as any,
				productCategories,
			});
		},
		[couponCollection, productCollection, taxRates, pricesIncludeTax]
	);

	return { recalculate };
};
