import * as React from 'react';

import isEqual from 'lodash/isEqual';

/**
 * Keeps the last settled value visible while coupon replay updates the cart in stages.
 */
export function useCouponAwareStableValue<T>(value: T, hasCoupons: boolean): T {
	const [stableValue, setStableValue] = React.useState(value);

	// Coupon-free values publish immediately, so retain them in the same render cycle.
	if (!hasCoupons && !isEqual(stableValue, value)) setStableValue(value);

	React.useEffect(() => {
		// Coupon replay crosses several observable writes; publish only after they settle.
		if (!hasCoupons) return;

		const timer = setTimeout(() => {
			setStableValue(value);
		}, 50);

		return () => clearTimeout(timer);
	}, [hasCoupons, value]);

	return hasCoupons ? stableValue : value;
}
