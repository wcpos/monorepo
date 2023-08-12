import * as React from 'react';

import { useObservableState } from 'observable-hooks';

import { useAppStateManager } from '../../../contexts/app-state-manager';

export const useDefaultCustomerID = () => {
	const appState = useAppStateManager();
	const store = useObservableState(appState.store$, appState.store);
	const wpCredentials = useObservableState(appState.wpCredentials$, appState.wpCredentials);
	const is_casher = useObservableState(
		store.default_customer_is_cashier$,
		store.default_customer_is_cashier
	);
	const default_customer = useObservableState(store.default_customer$, store.default_customer);

	React.useEffect(() => {
		console.log('store', store);
	}, [store]);

	React.useEffect(() => {
		console.log('wpCredentials', wpCredentials);
	}, [wpCredentials]);

	React.useEffect(() => {
		console.log('is_casher', is_casher);
	}, [is_casher]);

	React.useEffect(() => {
		console.log('default_customer', default_customer);
	}, [default_customer]);

	return is_casher ? wpCredentials.id : default_customer;
};
