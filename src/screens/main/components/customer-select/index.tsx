import * as React from 'react';

import { CustomerCombobox, CustomerComboboxProps } from './combobox';
import { CustomersProvider } from '../../contexts/customers';

/**
 *
 */
export default (props: CustomerComboboxProps) => {
	const initialQuery = React.useMemo(
		() => ({
			// search: '',
			sortBy: 'last_name',
			sortDirection: 'asc',
		}),
		[]
	);

	return (
		<CustomersProvider initialQuery={initialQuery}>
			<React.Suspense>
				<CustomerCombobox {...props} />
			</React.Suspense>
		</CustomersProvider>
	);
};
