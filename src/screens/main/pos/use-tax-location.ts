import * as React from 'react';

import { useObservableState } from 'observable-hooks';

import useCurrentOrder from './contexts/current-order';
import { useAppState } from '../../../contexts/app-state';
import useBaseTaxLocation from '../hooks/use-base-tax-location';

/**
 *
 */
const useTaxLocation = () => {
	const { store } = useAppState();
	// const { currentOrder } = useCurrentOrder();
	const baseLocation = useBaseTaxLocation();
	const taxBasedOn = useObservableState(store.tax_based_on$, store?.tax_based_on);

	/**
	 * TODO - updating billing and shipping based on the current order causes a loop
	 * I need to find a better way to do this.
	 */
	// const billing = currentOrder?.billing;
	// const shipping = currentOrder?.shipping;

	/**
	 *
	 */
	const location = React.useMemo(() => {
		if (taxBasedOn === 'base') {
			return baseLocation;
		}
		// if (taxBasedOn === 'billing') {
		// 	return {
		// 		city: billing?.city,
		// 		country: billing?.country,
		// 		state: billing?.state,
		// 		postcode: billing?.postcode,
		// 	};
		// }
		// return {
		// 	city: shipping?.city,
		// 	country: shipping?.country,
		// 	state: shipping?.state,
		// 	postcode: shipping?.postcode,
		// };
	}, [
		taxBasedOn,
		// shipping?.city,
		// shipping?.country,
		// shipping?.state,
		// shipping?.postcode,
		// baseLocation,
		// billing?.city,
		// billing?.country,
		// billing?.state,
		// billing?.postcode,
	]);

	return location;
};

export default useTaxLocation;
