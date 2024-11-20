import * as React from 'react';

import { useObservableEagerState } from 'observable-hooks';

import { useAppState } from '../../../contexts/app-state';

/**
 * Hook to get the default customer ID, used for new orders.
 * If the user is a cashier, we use their ID as the default customer.
 *
 * Memoized to prevent unnecessary fetches.
 */
export const useDefaultCustomerID = () => {
	const { store, wpCredentials } = useAppState();
	const is_casher = useObservableEagerState(store.default_customer_is_cashier$);
	const default_customer = useObservableEagerState(store.default_customer$);

	return React.useMemo(
		() => (is_casher ? wpCredentials.id : default_customer),
		[default_customer, is_casher, wpCredentials.id]
	);
};
