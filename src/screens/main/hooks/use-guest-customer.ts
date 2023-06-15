import { useObservableState } from 'observable-hooks';

import useLocalData from '../../../contexts/local-data';

/**
 *
 */
const useGuestCustomer = () => {
	const { store } = useLocalData();
	const defaultCountry = useObservableState(store.default_country$, store.default_country);
	const [country, state] = defaultCountry.split(':');

	return {
		customer_id: 0,
		billing: {
			first_name: '',
			last_name: '',
			company: '',
			address_1: '',
			address_2: '',
			city: '',
			postcode: '',
			country,
			state: '',
			email: '',
			phone: '',
		},
		shipping: {
			first_name: '',
			last_name: '',
			company: '',
			address_1: '',
			address_2: '',
			city: '',
			postcode: '',
			country: '',
			state: '',
		},
	};
};

export default useGuestCustomer;
