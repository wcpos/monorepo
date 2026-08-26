import * as React from 'react';

/**
 * Keeps the last settled totals visible while coupon replay updates the cart in stages.
 */
export function useCouponAwareStableTotals<T>(totals: T, hasCoupons: boolean): T {
	const [stableTotals, setStableTotals] = React.useState(totals);

	React.useEffect(() => {
		// Coupon replay crosses several observable writes; publish only after they settle.
		// Coupon-free totals remain immediate, while the zero-delay update keeps the held
		// value current in case a coupon is subsequently added.
		const timer = setTimeout(
			() => {
				setStableTotals(totals);
			},
			hasCoupons ? 50 : 0
		);

		return () => clearTimeout(timer);
	}, [hasCoupons, totals]);

	return hasCoupons ? stableTotals : totals;
}
