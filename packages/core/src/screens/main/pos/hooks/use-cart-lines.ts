import * as React from 'react';

import { useObservable, useObservableEagerState, useSubscription } from 'observable-hooks';
import { distinctUntilChanged, map, skip } from 'rxjs/operators';

import { getLogger } from '@wcpos/utils/logger';

import { useAppliedCouponReferenceDemand } from '../../../../query';
import { calculateOrderTotals } from './calculate-order-totals';
import { useFeeLineData } from './use-fee-line-data';
import { useRecalculateCoupons } from './use-recalculate-coupons';
import { useUpdateFeeLine } from './use-update-fee-line';
import { getUuidFromLineItem } from './utils';
import { useTaxRates } from '../../contexts/tax-rates';
import { useLocalMutation } from '../../hooks/mutations/use-local-mutation';
import { useCurrentOrder } from '../contexts/current-order';

type FeeLine = NonNullable<import('@wcpos/database').OrderDocument['fee_lines']>[number];

const cartLogger = getLogger(['wcpos', 'pos', 'cart', 'lines']);

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
	const { allRates, taxRoundAtSubtotal, priceNumDecimals, pricesIncludeTax } = useTaxRates();

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
	 * Coupon replay below scans the resident coupons/categories collections directly, which
	 * declares no demand of its own. Since reference lanes fetch on demand (#952), a cart
	 * carrying coupon lines has to declare that demand itself or the replay throws on a
	 * device that never opened the coupon picker.
	 */
	const { whenSettled: whenCouponReferencesSettled } = useAppliedCouponReferenceDemand(
		cartLines.coupon_lines.length > 0
	);

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

	const handleCartTotalChange = async () => {
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
		const hasActiveCoupons = allCouponLines.some((cl) => cl.code != null);
		if (hasActiveCoupons) {
			// The demand declared above is asynchronous, and this edit can land while the pull
			// is still in flight — scanning now would hit the still-empty collections and throw
			// (or validate a category-restricted coupon against an empty tree). Wait for it, and
			// if the wait times out, bail rather than replaying against residents we know are
			// not ready: same "avoid partial data" rule as the missing-coupon bail below. The
			// next cart edit re-runs the replay.
			if (!(await whenCouponReferencesSettled())) return;
			const result = await recalculate(freshOrder.line_items || [], allCouponLines);
			if (!result) return; // coupon missing locally — bail to avoid partial data
			// Bail if order changed during async replay to avoid overwriting concurrent edits
			if (currentOrder.getLatest() !== freshOrder) return;

			// Compute order totals from the coupon-adjusted line items in the same
			// tick. This prevents useOrderTotals from running with stale pre-coupon
			// line items and flashing incorrect tax values.
			const totals = calculateOrderTotals({
				lineItems: result.lineItems.filter((item) => item.product_id !== null),
				feeLines: (freshOrder.fee_lines || []).filter((item) => item.name !== null),
				shippingLines: (freshOrder.shipping_lines || []).filter((item) => item.method_id !== null),
				couponLines: result.couponLines.filter((item) => item.code != null),
				taxRates: allRates,
				taxRoundAtSubtotal,
				dp: priceNumDecimals,
				pricesIncludeTax,
			});

			await localPatch({
				document: freshOrder,
				data: {
					coupon_lines: result.couponLines,
					line_items: result.lineItems,
					discount_tax: totals.discount_tax,
					discount_total: totals.discount_total,
					shipping_tax: totals.shipping_tax,
					shipping_total: totals.shipping_total,
					cart_tax: totals.cart_tax,
					total_tax: totals.total_tax,
					total: totals.total,
					tax_lines: totals.tax_lines as NonNullable<
						import('@wcpos/database').OrderDocument['tax_lines']
					>,
				},
			});
		}
	};

	useSubscription(
		cartTotal$,
		() => void handleCartTotalChange().catch((error) => cartLogger.error(String(error)))
	);

	return cartLines;
};
