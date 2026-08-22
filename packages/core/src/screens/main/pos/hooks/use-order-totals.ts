import * as React from 'react';

import { calculateOrderTotals } from './calculate-order-totals';
import { useCartLines } from './use-cart-lines';
import { useTaxSettings } from '../../contexts/tax-rates';

type Totals = ReturnType<typeof calculateOrderTotals>;

/**
 *
 */
export const useOrderTotals = () => {
	const { allRates, taxRoundAtSubtotal, priceNumDecimals, pricesIncludeTax } = useTaxSettings();
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
		// When coupons are active, debounce (50ms) so transient values don't flash.
		// When they're not, sync immediately (delay 0). Either way the update goes
		// through the timer callback so it never runs synchronously in the effect.
		const timer = setTimeout(() => setStableTotals(totals), hasCoupons ? 50 : 0);
		return () => clearTimeout(timer);
	}, [totals, hasCoupons]);

	return hasCoupons ? stableTotals : totals;
};
