import * as React from 'react';

import { useObservable, useObservableEagerState, useSubscription } from 'observable-hooks';
import { distinctUntilChanged, map, skip } from 'rxjs/operators';

import { calculateCouponDiscount } from './coupon-discount';
import { applyPerItemDiscountsToLineItems, isProductOnSale } from './coupon-helpers';
import { useFeeLineData } from './use-fee-line-data';
import { useUpdateFeeLine } from './use-update-fee-line';
import { getUuidFromLineItem } from './utils';
import { useAppState } from '../../../../contexts/app-state';
import { useCollection } from '../../hooks/use-collection';
import { useLocalMutation } from '../../hooks/mutations/use-local-mutation';
import { useCurrentOrder } from '../contexts/current-order';

import type { CouponLineItem } from './coupon-helpers';

type FeeLine = NonNullable<import('@wcpos/database').OrderDocument['fee_lines']>[number];

/**
 * @NOTE - when current order is updated, eg: date_modified, the cart lines will re-subscribe.
 */
export const useCartLines = () => {
	const { store } = useAppState();
	const { currentOrder } = useCurrentOrder();
	const lineItems = useObservableEagerState(currentOrder.line_items$!);
	const feeLines = useObservableEagerState(currentOrder.fee_lines$!);
	const shippingLines = useObservableEagerState(currentOrder.shipping_lines$!);
	const couponLines = useObservableEagerState(currentOrder.coupon_lines$!);
	const { getFeeLineData } = useFeeLineData();
	const { updateFeeLine } = useUpdateFeeLine();
	const { collection: couponCollection } = useCollection('coupons');
	const { collection: productCollection } = useCollection('products');
	const { localPatch } = useLocalMutation();
	const woocommerceSequential = useObservableEagerState(
		(store as any).woocommerce_calc_discounts_sequentially$
	);
	const legacySequential = useObservableEagerState((store as any).calc_discounts_sequentially$);
	const calcDiscountsSequentially = woocommerceSequential === 'yes' || legacySequential === 'yes';

	/**
	 * We need to filter out any items that have been 'removed', eg: product_id === null.
	 */
	const cartLines = React.useMemo(() => {
		return {
			line_items: (lineItems || []).filter((item) => item.product_id !== null),
			fee_lines: (feeLines || []).filter((item) => item.name !== null),
			shipping_lines: (shippingLines || []).filter((item) => item.method_id !== null),
			coupon_lines: (couponLines || []).filter((item) => item.code != null),
		};
	}, [lineItems, feeLines, shippingLines, couponLines]);

	/**
	 * If line items change, and we have a percentage fee line, we need to recalculate the fee line total.
	 *
	 * @TODO - this is a bit hacky, we should probably have a better way to handle this.
	 */
	const cartTotal$ = useObservable(
		(inputs$) =>
			inputs$.pipe(
				skip(1),
				map(([items]) => {
					// Sum the total and total_tax of all line items
					const test = (items || []).reduce(
						(acc, item) => {
							acc.cart_total += parseFloat(item.total ?? '0');
							acc.cart_total_tax += parseFloat(item.total_tax ?? '0');
							return acc;
						},
						{ cart_total: 0, cart_total_tax: 0 }
					);
					return test;
				}),
				distinctUntilChanged((prev, next) => JSON.stringify(prev) === JSON.stringify(next))
				// @TODO - this gets triggered twice, because if fee updates, line items will be a new array.
			),
		[lineItems]
	);

	useSubscription(cartTotal$, async () => {
		// Recalculate percentage-based fee lines
		const percentageFeeLines = (feeLines || []).filter((item: FeeLine) => {
			const { percent } = getFeeLineData(item);
			return percent;
		});

		if (percentageFeeLines.length > 0) {
			// Update each percentage fee line
			for (const feeLine of percentageFeeLines) {
				const uuid = getUuidFromLineItem(feeLine);
				await updateFeeLine(uuid ?? '', {});
			}
		}

		// Recalculate local-only coupon discounts when line items change.
		// Synced coupon lines (with an id) are server-authoritative and should not be recalculated.
		const allCouponLines = couponLines || [];
		const activeCouponLines = allCouponLines.filter((cl: any) => cl.code != null && !cl.id);
		if (activeCouponLines.length > 0) {
			const activeLineItems = (lineItems || []).filter((item: any) => item.product_id !== null);
			const productIds = activeLineItems.map((item: any) => item.product_id).filter(Boolean);
			const products =
				productIds.length > 0
					? await productCollection.find({ selector: { id: { $in: productIds } } }).exec()
					: [];
			const productMap = new Map(products.map((p: any) => [p.id, p]));

			const couponLineItems: CouponLineItem[] = activeLineItems
				.map((item: any) => {
					const product = productMap.get(item.product_id);
					const qty = item.quantity ?? 1;
					if (qty <= 0) return null;
					return {
						product_id: item.product_id,
						quantity: qty,
						price: parseFloat(item.subtotal || '0') / qty,
						subtotal: item.subtotal || '0',
						total: item.total || '0',
						categories: product?.categories || [],
						on_sale: isProductOnSale(product),
					};
				})
				.filter(Boolean) as CouponLineItem[];

			let needsUpdate = false;
			let discountItems = couponLineItems;
			const updatedCouponLines: any[] = [];

			for (const cl of activeCouponLines) {
				const coupon = await couponCollection.findOne({ selector: { code: cl.code } }).exec();
				if (!coupon) {
					updatedCouponLines.push(cl);
					continue;
				}

				const couponData = coupon.toJSON();
				const result = calculateCouponDiscount(
					{
						discount_type: couponData.discount_type as any,
						amount: couponData.amount || '0',
						limit_usage_to_x_items: couponData.limit_usage_to_x_items ?? null,
						product_ids: [...(couponData.product_ids || [])],
						excluded_product_ids: [...(couponData.excluded_product_ids || [])],
						product_categories: [...(couponData.product_categories || [])],
						excluded_product_categories: [...(couponData.excluded_product_categories || [])],
						exclude_sale_items: couponData.exclude_sale_items || false,
					},
					discountItems
				);

				const newDiscount = String(result.totalDiscount);
				if (newDiscount !== cl.discount) {
					needsUpdate = true;
				}

				updatedCouponLines.push({ ...cl, discount: newDiscount, discount_tax: '0' });

				if (calcDiscountsSequentially) {
					discountItems = applyPerItemDiscountsToLineItems(discountItems, result.perItem);
				}
			}

			if (needsUpdate) {
				// Merge updated local coupons back into full list to preserve synced coupons
				const updatedByCode = new Map(updatedCouponLines.map((cl: any) => [cl.code, cl]));
				const mergedCouponLines = allCouponLines.map((cl: any) =>
					!cl.id && cl.code != null ? (updatedByCode.get(cl.code) ?? cl) : cl
				);

				const order = currentOrder.getLatest();
				await localPatch({
					document: order,
					data: { coupon_lines: mergedCouponLines },
				});
			}
		}
	});

	return cartLines;
};
