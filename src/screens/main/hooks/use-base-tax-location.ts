import { useObservableState } from 'observable-hooks';

import useLocalData from '../../../contexts/local-data';

/**
 *
 */
const useBaseTaxLocation = () => {
	const { store } = useLocalData();
	const storeCity = useObservableState(store.store_city$, store?.store_city);
	const storeCountry = useObservableState(store.default_country$, store?.default_country);
	const storePostcode = useObservableState(store.store_postcode$, store?.store_postcode);
	const [country, state] = (storeCountry || '').split(':');

	return {
		city: storeCity,
		country,
		state,
		postcode: storePostcode,
	};
};

export default useBaseTaxLocation;
