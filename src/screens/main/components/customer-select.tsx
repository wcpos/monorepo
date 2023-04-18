import * as React from 'react';

import { useLayoutObservableState } from 'observable-hooks';

import Combobox from '@wcpos/components/src/combobox';
import Text from '@wcpos/components/src/text';

import { t } from '../../../lib/translations';
import useCustomers, { CustomersProvider } from '../contexts/customers';
import useCustomerNameFormat from '../hooks/use-customer-name-format';

type CustomerDocument = import('@wcpos/database').CustomerDocument;

interface CustomerSelectProps {
	selectedCustomer?: CustomerDocument;
	onSelectCustomer: (value: CustomerDocument) => void;
}

/**
 *
 */
const CustomerSelect = ({ selectedCustomer, onSelectCustomer }: CustomerSelectProps) => {
	const { query$, setQuery, data: customers } = useCustomers();
	const query = useLayoutObservableState(query$, query$.getValue());
	const { format } = useCustomerNameFormat();
	const [search, setSearch] = React.useState(query.search);

	/**
	 *
	 */
	const onSearch = React.useCallback(
		(search) => {
			setSearch(search);
			setQuery('search', search, true);
		},
		[setQuery]
	);

	/**
	 *
	 */
	const options = React.useMemo(() => {
		const opts = customers.map((customer) => ({
			label: format(customer),
			value: customer,
			key: customer.id,
		}));

		opts.unshift({ key: 0, label: t('Guest', { _tags: 'core' }), value: { id: 0 } });
		return opts;
	}, [customers, format]);

	/**
	 *
	 */
	return (
		<Combobox
			options={options}
			placeholder={t('Search Customers', { _tags: 'core' })}
			selected={selectedCustomer ? format(selectedCustomer) : ''}
			onSearch={onSearch}
			searchValue={search}
			onChange={onSelectCustomer}
		/>
	);
};

/**
 *
 */
export default (props: CustomerSelectProps) => {
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
				<CustomerSelect {...props} />
			</React.Suspense>
		</CustomersProvider>
	);
};
