import * as React from 'react';

import { useObservableState } from 'observable-hooks';

import { useAppState } from '../../../contexts/app-state';
import { useT } from '../../../contexts/translations';

/**
 *
 */
export const useGuestCustomer = () => {
	const { store } = useAppState();
	const defaultCountry = useObservableState(store.default_country$, store.default_country);
	const [country, state] = defaultCountry.split(':');
	const t = useT();

	return React.useMemo(
		() => ({
			id: 0,
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
		[country, t]
	);
};
