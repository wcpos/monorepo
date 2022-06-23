import * as React from 'react';
import { CustomersContext } from './customers-provider';

export const useCustomers = () => {
	const context = React.useContext(CustomersContext);
	if (!context) {
		throw new Error(`useCustomers must be called within CustomersProvider`);
	}

	return context;
};
