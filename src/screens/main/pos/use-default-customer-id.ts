import * as React from 'react';

import { useObservableState } from 'observable-hooks';

import { useAppState } from '../../../contexts/app-state';

export const useDefaultCustomerID = () => {
	const { store, wpCredentials } = useAppState();
	const is_casher = useObservableState(
		store.default_customer_is_cashier$,
		store.default_customer_is_cashier
	);
	const default_customer = useObservableState(store.default_customer$, store.default_customer);

	React.useEffect(() => {
		console.log('store', store);
	}, [store]);

	return is_casher ? wpCredentials.id : default_customer;
};
