import * as React from 'react';

import pick from 'lodash/pick';
import useDeepCompareEffect from 'use-deep-compare-effect';

import { calculateOrderTotals } from './calculate-order-totals';
import { useCartLines } from './use-cart-lines';
import { useCouponAwareStableValue } from './use-coupon-aware-stable-totals';
import { useTaxSettings } from '../../contexts/tax-rates';
import { useLocalMutation } from '../../hooks/mutations/use-local-mutation';
import { useCurrentOrder } from '../contexts/current-order';
import { useOrderMoneyDivergence } from '../contexts/order-money-divergence';

/**
 *
 */
export const useOrderTotals = () => {
	const { currentOrder } = useCurrentOrder();
	const { allRates, taxRoundAtSubtotal, priceNumDecimals, pricesIncludeTax } = useTaxSettings();
	const { localPatch } = useLocalMutation();
	const { line_items, fee_lines, shipping_lines, coupon_lines } = useCartLines();

	const hasCoupons = coupon_lines.length > 0;

	/**
	 *
	 */
	const totals = React.useMemo(() => {
		const totals = calculateOrderTotals({
			lineItems: line_items,
			feeLines: fee_lines,
			shippingLines: shipping_lines,
			couponLines: coupon_lines,
			taxRates: allRates, // NOTE: rates are not used for calc, just to get the tax rate label
			taxRoundAtSubtotal,
			dp: priceNumDecimals,
			pricesIncludeTax,
		});

		return totals;
	}, [
		line_items,
		fee_lines,
		shipping_lines,
		coupon_lines,
		allRates,
		taxRoundAtSubtotal,
		priceNumDecimals,
		pricesIncludeTax,
	]);

	const stableTotals = useCouponAwareStableValue(totals, hasCoupons);

	/**
	 * R1 re-push guard. This effect writes the cart's arithmetic onto the order,
	 * and for an engine-backed order that write ENQUEUES A SERVER UPDATE. That is
	 * right while the cashier is building a sale and wrong once the server has
	 * already answered with different money: WooCommerce's calculation is the
	 * source of truth, so re-asserting the till's number here would push it back
	 * over the server's, and provoke the identical divergence on the next drain.
	 *
	 * The suppression is LATCHED ON THE ARITHMETIC, not on the banner. Keying it
	 * to `divergence` alone made dismissing the alert — or any later clean save
	 * retiring it — flip the guard off while the cart still computed the same
	 * overruled numbers, and the very next effect run pushed them straight back:
	 * the loop again, one click later. So the overruled totals are remembered,
	 * and stay suppressed until the cart inputs actually change. A real edit
	 * produces different arithmetic, clears the latch, and converges as normal.
	 *
	 * Latched per order, so a divergence on one open tab never freezes another.
	 */
	const { divergence } = useOrderMoneyDivergence(
		(currentOrder as unknown as { uuid?: string } | undefined)?.uuid
	);
	const overruledTotals = React.useRef<string | null>(null);

	useDeepCompareEffect(() => {
		const newTotals = pick(totals, [
			'discount_tax',
			'discount_total',
			'shipping_tax',
			'shipping_total',
			'cart_tax',
			'total_tax',
			'total',
			'tax_lines',
		]);
		const computed = JSON.stringify(newTotals);

		if (divergence) {
			overruledTotals.current = computed;
			return;
		}
		// Same arithmetic the server already overruled — the banner's visibility
		// says nothing about whether re-pushing it is safe.
		if (overruledTotals.current === computed) return;
		overruledTotals.current = null;

		const currentTotals = pick(currentOrder, [
			'discount_tax',
			'discount_total',
			'shipping_tax',
			'shipping_total',
			'cart_tax',
			'total_tax',
			'total',
			'tax_lines',
		]);

		if (JSON.stringify(currentTotals) === computed) {
			return;
		}

		void localPatch({
			document: currentOrder,
			data: {
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
	}, [totals, { diverged: divergence !== null }]);

	return hasCoupons ? stableTotals : totals;
};
