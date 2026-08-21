import * as React from 'react';

import { GUEST_CUSTOMER_ID } from '@wcpos/sync-core';
import { useDocField } from '@wcpos/query';

import { useAppState } from '../../../contexts/app-state';
import { useT } from '../../../contexts/translations';

/**
 *
 */
export const useGuestCustomer = () => {
	const { store } = useAppState();
	const country = useDocField(store, (value) => value.store_country);
	const t = useT();

	return React.useMemo(
		() => ({
			id: GUEST_CUSTOMER_ID,
			billing: {
				first_name: t('common.guest'),
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
