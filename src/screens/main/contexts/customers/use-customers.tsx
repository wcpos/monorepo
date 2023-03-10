import * as React from 'react';

import { useObservableSuspense } from 'observable-hooks';

import { CustomersContext } from './provider';

export const useCustomers = () => {
	const context = React.useContext(CustomersContext);
	if (!context) {
		throw new Error(`useCustomers must be called within CustomersContext`);
	}

	const data = useObservableSuspense(context.resource);

	return { ...context, data };
};
