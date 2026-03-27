import * as React from 'react';

import pick from 'lodash/pick';
import useDeepCompareEffect from 'use-deep-compare-effect';

import { calculateOrderTotals } from './calculate-order-totals';
import { useCartLines } from './use-cart-lines';
import { useTaxRates } from '../../contexts/tax-rates';
import { useLocalMutation } from '../../hooks/mutations/use-local-mutation';
import { useCurrentOrder } from '../contexts/current-order';

type Totals = ReturnType<typeof calculateOrderTotals>;

/**
 *
 */
export const useOrderTotals = () => {
	const { currentOrder } = useCurrentOrder();
	const { allRates, taxRoundAtSubtotal, priceNumDecimals, pricesIncludeTax } = useTaxRates();
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

	/**
	 * When coupons are active, debounce the returned totals so transient
	 * intermediate values (from pre-coupon calculation or server response)
	 * don't flash in the UI. The component keeps showing the previous
	 * correct value until the totals settle.
	 */
	const [stableTotals, setStableTotals] = React.useState<Totals>(totals);

	React.useEffect(() => {
		if (!hasCoupons) {
			setStableTotals(totals);
			return;
		}
		const timer = setTimeout(() => setStableTotals(totals), 50);
		return () => clearTimeout(timer);
	}, [totals, hasCoupons]);

	/**
	 *
	 */
	useDeepCompareEffect(() => {
		// When coupons are active, the coupon replay in useCartLines computes
		// and patches totals atomically. Skip patching here to avoid writing
		// stale pre-coupon totals.
		if (hasCoupons) {
			return;
		}

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

		if (JSON.stringify(currentTotals) === JSON.stringify(newTotals)) {
			return;
		}

		localPatch({
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
	}, [totals, hasCoupons]);

	return hasCoupons ? stableTotals : totals;
};
