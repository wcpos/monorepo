import * as React from 'react';

import { getLogger } from '@wcpos/utils/logger';

import { recalculateCoupons } from './coupon-recalculate';
import { useT } from '../../../../contexts/translations';
import { useTaxRates } from '../../contexts/tax-rates';
import { useCollection } from '../../hooks/use-collection';
import { useLocalMutation } from '../../hooks/mutations/use-local-mutation';
import { useCurrentOrder } from '../contexts/current-order';

import type { CouponDiscountConfig } from './coupon-discount';

const cartLogger = getLogger(['wcpos', 'pos', 'cart']);

/**
 * Hook for removing a coupon from the current order.
 *
 * Removes the coupon from coupon_lines by code. For synced items (with id),
 * sets code to null to signal deletion to WooCommerce.
 * After removal, recalculates all remaining coupon discounts from scratch.
 */
export const useRemoveCoupon = () => {
	const { currentOrder } = useCurrentOrder();
	const { localPatch } = useLocalMutation();
	const t = useT();
	const { collection: couponCollection } = useCollection('coupons');
	const { collection: productCollection } = useCollection('products');
	const { rates: taxRates, pricesIncludeTax } = useTaxRates();

	const orderLogger = React.useMemo(
		() =>
			cartLogger.with({
				orderUUID: currentOrder.uuid,
				orderID: currentOrder.id,
				orderNumber: currentOrder.number,
			}),
		[currentOrder.uuid, currentOrder.id, currentOrder.number]
	);

	const removeCoupon = React.useCallback(
		async (couponCode: string) => {
			const order = currentOrder.getLatest();
			const couponLines = order.coupon_lines || [];
			const normalizedCode = couponCode.toLowerCase().trim();

			let removed = false;
			const updatedCouponLines = couponLines
				.map((cl: any) => {
					if ((cl.code ?? '').toLowerCase() === normalizedCode) {
						removed = true;
						// If synced (has id), null the code to signal deletion
						if (cl.id) {
							return { ...cl, code: null };
						}
						// If local-only, remove entirely
						return null;
					}
					return cl;
				})
				.filter((cl: any) => cl !== null);

			if (!removed) return;

			// Build couponConfigs for remaining active coupons
			const remainingActiveCodes = updatedCouponLines
				.filter((cl: any) => cl.code != null)
				.map((cl: any) => cl.code.toLowerCase());

			const couponConfigs = new Map<string, CouponDiscountConfig>();
			for (const code of remainingActiveCodes) {
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

			// Build product categories for restriction checks
			const productCategories = new Map<number, { id: number }[]>();
			const productIds = (order.line_items || [])
				.map((item: any) => item.product_id)
				.filter(Boolean);
			if (productIds.length > 0) {
				const products = await productCollection
					.find({ selector: { id: { $in: productIds } } })
					.exec();
				for (const p of products) {
					productCategories.set(p.id, p.categories || []);
				}
			}

			const result = recalculateCoupons({
				lineItems: order.line_items || [],
				couponLines: updatedCouponLines,
				couponConfigs,
				pricesIncludeTax,
				calcDiscountsSequentially: false,
				taxRates: taxRates as any,
				productCategories,
			});

			await localPatch({
				document: order,
				data: {
					coupon_lines: result.couponLines,
					line_items: result.lineItems,
				},
			});

			orderLogger.info(t('pos_cart.coupon_removed', { defaultValue: 'Coupon removed' }), {
				showToast: true,
				context: { couponCode },
			});
		},
		[
			currentOrder,
			localPatch,
			couponCollection,
			productCollection,
			t,
			orderLogger,
			taxRates,
			pricesIncludeTax,
		]
	);

	return { removeCoupon };
};
