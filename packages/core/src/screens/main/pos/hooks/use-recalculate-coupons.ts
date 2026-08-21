import * as React from 'react';

import { useDocField, useQueryRuntime } from '@wcpos/query';
import { wooIdOf } from '@wcpos/sync-core';

import { buildEnrichedProductCategories } from './coupon-helpers';
import {
	recalculateCoupons,
	type RecalculateInput,
	type RecalculateResult,
} from './coupon-recalculate';
import {
	readEngineCategories,
	readEngineCoupons,
	readEngineProductRecordsByWooId,
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
	const woocommerceSequential = useDocField(
		store,
		(value) => value.woocommerce_calc_discounts_sequentially
	);
	const legacySequential = useDocField(store, (value) => value.calc_discounts_sequentially);
	const calcDiscountsSequentially = woocommerceSequential === 'yes' || legacySequential === 'yes';

	const runtime = useQueryRuntime();
	const { rates: taxRates, pricesIncludeTax, taxRoundAtSubtotal, priceNumDecimals } = useTaxRates();

	const recalculate = React.useCallback(
		async (lineItems: LineItem[], couponLines: CouponLine[]): Promise<RecalculateResult> => {
			// Filter to active coupon codes
			const activeCodes = couponLines
				.filter((cl): cl is CouponLine & { code: string } => cl.code != null)
				.map((cl) => cl.code.toLowerCase());

			// Tier-0 coupons are resident in the engine; payload.code remains an exact scan.
			const coupons = await readEngineCoupons(runtime);
			const couponConfigs = new Map<string, CouponDiscountConfig>();
			for (const code of activeCodes) {
				const coupon = coupons.find((record) => record.payload.code === code);
				if (!coupon) {
					// Fail the recalculation when an active coupon is missing locally.
					// Returning stale lineItems with mutated couponLines would persist
					// mismatched discounts. Callers should catch and handle this.
					throw new Error(`Coupon "${code}" not found in local collection`);
				}
				const cd = coupon.payload;
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
					readEngineProductRecordsByWooId(runtime, productIds),
					readEngineCategories(runtime),
				]);
				for (const p of products) {
					if (p.remoteId !== null) {
						productCategories.set(
							wooIdOf(p.remoteId),
							(p.payload.categories || []) as { id: number }[]
						);
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
				taxRates: taxRates as RecalculateInput['taxRates'],
				productCategories,
				taxRoundAtSubtotal,
				dp: priceNumDecimals,
			});
		},
		[
			runtime,
			taxRates,
			pricesIncludeTax,
			calcDiscountsSequentially,
			taxRoundAtSubtotal,
			priceNumDecimals,
		]
	);

	return { recalculate };
};
