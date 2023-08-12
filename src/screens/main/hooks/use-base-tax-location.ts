import { useObservableState } from 'observable-hooks';

import { useAppStateManager } from '../../../contexts/app-state-manager';

/**
 *
 */
const useBaseTaxLocation = () => {
	const appState = useAppStateManager();
	const store = useObservableState(appState.store$, appState.store);
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
