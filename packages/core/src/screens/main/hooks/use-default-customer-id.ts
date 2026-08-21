import * as React from 'react';

import { useDocField } from '@wcpos/query';

import { useStoreSession } from '../../../contexts/app-state';

/**
 * Hook to get the default customer ID, used for new orders.
 * If the user is a cashier, we use their ID as the default customer.
 *
 * Memoized to prevent unnecessary fetches.
 */
export const useDefaultCustomerID = () => {
	const { store, wpCredentials } = useStoreSession();
	const is_casher = useDocField(store, (value) => value.default_customer_is_cashier);
	const default_customer = useDocField(store, (value) => value.default_customer);

	return React.useMemo(
		() => (is_casher ? wpCredentials.id : default_customer),
		[default_customer, is_casher, wpCredentials.id]
	);
};
