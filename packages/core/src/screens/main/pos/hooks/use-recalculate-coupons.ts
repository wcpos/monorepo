import * as React from 'react';

import { useObservableEagerState } from 'observable-hooks';

import { useQueryManager } from '@wcpos/query';

import { buildEnrichedProductCategories } from './coupon-helpers';
import { recalculateCoupons, type RecalculateResult } from './coupon-recalculate';
import {
	readEngineCategories,
	readEngineCoupons,
	readEngineProductsByWooId,
} from './engine-coupon-data';
import { useAppState } from '../../../../contexts/app-state';
import { useTaxRates } from '../../contexts/tax-rates';

import type { CouponDiscountConfig } from './coupon-discount';

type LineItem = NonNullable<import('@wcpos/database').OrderDocument['line_items']>[number];
type CouponLine = NonNullable<import('@wcpos/database').OrderDocument['coupon_lines']>[number];

/**
 * Hook that wraps the pure recalculateCoupons() function with engine lookups
 * for coupon configs, product categories, and tax context.
 *
 * Returns a callback that takes line items and coupon lines, looks up all
 * necessary context, and returns the recalculated result.
 */
export const useRecalculateCoupons = () => {
	const { store } = useAppState();
	const woocommerceSequential = useObservableEagerState(
		(store as any).woocommerce_calc_discounts_sequentially$
	);
	const legacySequential = useObservableEagerState((store as any).calc_discounts_sequentially$);
	const calcDiscountsSequentially = woocommerceSequential === 'yes' || legacySequential === 'yes';

	const manager = useQueryManager();
	const { rates: taxRates, pricesIncludeTax, taxRoundAtSubtotal, priceNumDecimals } = useTaxRates();

	const recalculate = React.useCallback(
		async (lineItems: LineItem[], couponLines: CouponLine[]): Promise<RecalculateResult> => {
			// Filter to active coupon codes
			const activeCodes = couponLines
				.filter((cl): cl is CouponLine & { code: string } => cl.code != null)
				.map((cl) => cl.code.toLowerCase());

			// Tier-0 coupons are resident in the engine; payload.code remains an exact scan.
			const coupons = await readEngineCoupons(manager);
			const couponConfigs = new Map<string, CouponDiscountConfig>();
			for (const code of activeCodes) {
				const couponDoc = coupons.find((document) => document.code === code);
				if (!couponDoc) {
					// Fail the recalculation when an active coupon is missing locally.
					// Returning stale lineItems with mutated couponLines would persist
					// mismatched discounts. Callers should catch and handle this.
					throw new Error(`Coupon "${code}" not found in local collection`);
				}
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

			// Build product categories map, enriched with ancestor categories.
			// WC's wc_get_product_cat_ids() includes ancestors; we must match.
			let productCategories = new Map<number, { id: number }[]>();
			const productIds = lineItems
				.map((item) => item.product_id)
				.filter((id): id is number => id != null);
			if (productIds.length > 0) {
				const [products, categories] = await Promise.all([
					readEngineProductsByWooId(manager, productIds),
					readEngineCategories(manager),
				]);
				for (const p of products) {
					if (p.id != null) {
						productCategories.set(p.id, (p.categories || []) as { id: number }[]);
					}
				}

				// Enrich with ancestor categories from the category tree
				productCategories = buildEnrichedProductCategories(productCategories, categories);
			}

			return recalculateCoupons({
				lineItems,
				couponLines,
				couponConfigs,
				pricesIncludeTax,
				calcDiscountsSequentially,
				taxRates: taxRates as any,
				productCategories,
				taxRoundAtSubtotal,
				dp: priceNumDecimals,
			});
		},
		[
			manager,
			taxRates,
			pricesIncludeTax,
			calcDiscountsSequentially,
			taxRoundAtSubtotal,
			priceNumDecimals,
		]
	);

	return { recalculate };
};
