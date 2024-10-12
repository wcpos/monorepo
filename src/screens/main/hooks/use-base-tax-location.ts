import * as React from 'react';

import { useObservableEagerState } from 'observable-hooks';

import { useAppState } from '../../../contexts/app-state';

/**
 *
 */
const useBaseTaxLocation = () => {
	const { store } = useAppState();
	const storeCity = useObservableEagerState(store.store_city$);
	const storeCountry = useObservableEagerState(store.default_country$);
	const storePostcode = useObservableEagerState(store.store_postcode$);
	const [country, state] = (storeCountry || '').split(':');

	return React.useMemo(
		() => ({
			city: storeCity,
			country,
			state,
			postcode: storePostcode,
		}),
		[country, state, storeCity, storePostcode]
	);
};

export default useBaseTaxLocation;
