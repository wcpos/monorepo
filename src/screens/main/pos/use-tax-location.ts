import * as React from 'react';

import { useObservableState } from 'observable-hooks';

import useCurrentOrder from './contexts/current-order';
import useLocalData from '../../../contexts/local-data';
import useBaseTaxLocation from '../hooks/use-base-tax-location';

const useTaxLocation = () => {
	const { store } = useLocalData();
	const { currentOrder } = useCurrentOrder();
	const baseLocation = useBaseTaxLocation();
	const taxBasedOn = useObservableState(store.tax_based_on$, store?.tax_based_on);
	const billing = useObservableState(currentOrder.billing$, currentOrder?.billing);
	const shipping = useObservableState(currentOrder.shipping$, currentOrder?.shipping);

	return React.useMemo(() => {
		if (taxBasedOn === 'base') {
			return baseLocation;
		}
		if (taxBasedOn === 'billing') {
			return {
				city: billing?.city,
				country: billing?.country,
				state: billing?.state,
				postcode: billing?.postcode,
			};
		}
		return {
			city: shipping?.city,
			country: shipping?.country,
			state: shipping?.state,
			postcode: shipping?.postcode,
		};
	}, [
		taxBasedOn,
		baseLocation,
		shipping?.city,
		shipping?.country,
		shipping?.state,
		shipping?.postcode,
		billing?.city,
		billing?.country,
		billing?.state,
		billing?.postcode,
	]);
};

export default useTaxLocation;
