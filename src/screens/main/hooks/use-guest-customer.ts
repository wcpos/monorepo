import * as React from 'react';

import { useObservableState } from 'observable-hooks';

import { useAppStateManager } from '../../../contexts/app-state-manager';
import { t } from '../../../lib/translations';

/**
 *
 */
const useGuestCustomer = () => {
	const appStateManager = useAppStateManager();
	const store = useObservableState(appStateManager.store$, appStateManager.store);
	const defaultCountry = useObservableState(store.default_country$, store.default_country);
	const [country, state] = defaultCountry.split(':');

	return React.useMemo(
		() => ({
			customer_id: 0,
			billing: {
				first_name: t('Guest', { _tags: 'core' }),
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
		}),
		[country]
	);
};

export default useGuestCustomer;
