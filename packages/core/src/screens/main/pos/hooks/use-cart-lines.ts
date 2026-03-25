import * as React from 'react';

import { useObservable, useObservableEagerState, useSubscription } from 'observable-hooks';
import { distinctUntilChanged, map, skip } from 'rxjs/operators';

import { useFeeLineData } from './use-fee-line-data';
import { useRecalculateCoupons } from './use-recalculate-coupons';
import { useUpdateFeeLine } from './use-update-fee-line';
import { getUuidFromLineItem } from './utils';
import { useTaxRates } from '../../contexts/tax-rates';
import { useLocalMutation } from '../../hooks/mutations/use-local-mutation';
import { useCurrentOrder } from '../contexts/current-order';

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
	const { localPatch } = useLocalMutation();
	const { recalculate } = useRecalculateCoupons();
	const { priceNumDecimals } = useTaxRates();

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
	 * Also triggers coupon replay when priceNumDecimals changes (issue #222).
	 *
	 * @TODO - this is a bit hacky, we should probably have a better way to handle this.
	 */
	const cartTotal$ = useObservable(
		(inputs$) =>
			inputs$.pipe(
				skip(1),
				map(([items, dp]) => {
					const totals = (items || []).reduce(
						(acc, item) => {
							acc.cart_total += parseFloat(item.total ?? '0');
							acc.cart_total_tax += parseFloat(item.total_tax ?? '0');
							return acc;
						},
						{ cart_total: 0, cart_total_tax: 0 }
					);
					return { ...totals, dp };
				}),
				distinctUntilChanged((prev, next) => JSON.stringify(prev) === JSON.stringify(next))
				// @TODO - this gets triggered twice, because if fee updates, line items will be a new array.
			),
		[lineItems, priceNumDecimals]
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

		// Replay coupon discounts via recalculateCoupons() which handles:
		// - POS price as coupon base (via _woocommerce_pos_data meta)
		// - lineIndex-based allocation for duplicate product_id lines
		// - Per-item capping to prevent over-allocation when stacking coupons
		// - Sequential discount mode
		// - Correct tax-inclusive/exclusive rounding
		const freshOrder = currentOrder.getLatest();
		const allCouponLines = freshOrder.coupon_lines || [];
		const hasActiveCoupons = allCouponLines.some((cl: any) => cl.code != null);
		if (hasActiveCoupons) {
			try {
				const result = await recalculate(freshOrder.line_items || [], allCouponLines);
				// Bail if order changed during async replay to avoid overwriting concurrent edits
				if (currentOrder.getLatest() !== freshOrder) return;
				await localPatch({
					document: freshOrder,
					data: {
						coupon_lines: result.couponLines,
						line_items: result.lineItems,
					},
				});
			} catch {
				// recalculate throws when a coupon is missing locally — bail silently
				// to avoid overwriting totals with partial data
			}
		}
	});

	return cartLines;
};
