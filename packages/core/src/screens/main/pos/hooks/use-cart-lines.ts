import * as React from 'react';

import { useObservable, useObservableEagerState, useSubscription } from 'observable-hooks';
import { distinctUntilChanged, map, skip } from 'rxjs/operators';

import { calculateCouponDiscount } from './coupon-discount';
import { useFeeLineData } from './use-fee-line-data';
import { useUpdateFeeLine } from './use-update-fee-line';
import { getUuidFromLineItem } from './utils';
import { useCollection } from '../../hooks/use-collection';
import { useLocalMutation } from '../../hooks/mutations/use-local-mutation';
import { useCurrentOrder } from '../contexts/current-order';

import type { CouponLineItem } from './coupon-helpers';

type FeeLine = NonNullable<import('@wcpos/database').OrderDocument['fee_lines']>[number];

/**
 * @NOTE - when current order is updated, eg: date_modified, the cart lines will re-subscribe.
 */
export const useCartLines = () => {
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

	/**
	 * We need to filter out any items that have been 'removed', eg: product_id === null.
	 */
	const cartLines = React.useMemo(() => {
		return {
			line_items: (lineItems || []).filter((item) => item.product_id !== null),
			fee_lines: (feeLines || []).filter((item) => item.name !== null),
			shipping_lines: (shippingLines || []).filter((item) => item.method_id !== null),
			coupon_lines: (couponLines || []).filter((item) => item.code !== null),
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

		// Recalculate coupon discounts when line items change
		const activeCouponLines = (couponLines || []).filter((cl: any) => cl.code !== null);
		if (activeCouponLines.length > 0) {
			const activeLineItems = (lineItems || []).filter((item: any) => item.product_id !== null);
			const productIds = activeLineItems.map((item: any) => item.product_id).filter(Boolean);
			const products =
				productIds.length > 0
					? await productCollection.find({ selector: { id: { $in: productIds } } }).exec()
					: [];
			const productMap = new Map(products.map((p: any) => [p.id, p]));

			const couponLineItems: CouponLineItem[] = activeLineItems.map((item: any) => {
				const product = productMap.get(item.product_id);
				const qty = item.quantity || 1;
				return {
					product_id: item.product_id,
					quantity: qty,
					price: parseFloat(item.subtotal || '0') / qty,
					subtotal: item.subtotal || '0',
					total: item.total || '0',
					categories: product?.categories || [],
					on_sale: product
						? parseFloat(product.price || '0') < parseFloat(product.regular_price || '0')
						: false,
				};
			});

			let needsUpdate = false;
			const updatedCouponLines = await Promise.all(
				activeCouponLines.map(async (cl: any) => {

					const coupon = await couponCollection.findOne({ selector: { code: cl.code } }).exec();

					if (!coupon) return cl;

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
						couponLineItems
					);

					const newDiscount = String(result.totalDiscount);
					if (newDiscount !== cl.discount) {
						needsUpdate = true;
					}

					return { ...cl, discount: newDiscount, discount_tax: '0' };
				})
			);

			if (needsUpdate) {
				const order = currentOrder.getLatest();
				await localPatch({
					document: order,
					data: { coupon_lines: updatedCouponLines },
				});
			}
		}
	});

	return cartLines;
};
