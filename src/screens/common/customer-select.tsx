import * as React from 'react';
import { useObservableState, useObservableSuspense } from 'observable-hooks';
import useStore from '@wcpos/hooks/src/use-store';
import useCustomers, { CustomersProvider } from '@wcpos/hooks/src/use-customers';
import orderBy from 'lodash/orderBy';
import { useTranslation } from 'react-i18next';
import Combobox from '@wcpos/components/src/combobox';
import useWhyDidYouUpdate from '@wcpos/hooks/src/use-why-did-you-update';

type CustomerDocument = import('@wcpos/database').CustomerDocument;
type StoreDatabase = import('@wcpos/database').StoreDatabase;

interface CustomerSelectProps {
	selectedCustomer?: CustomerDocument;
	onSelectCustomer: (value: CustomerDocument) => void;
}

/**
 *
 */
const CustomerSelect = ({ selectedCustomer, onSelectCustomer }: CustomerSelectProps) => {
	const { t } = useTranslation();
	const { storeDB } = useStore();
	const { query$, setQuery, resource } = useCustomers();
	const query = useObservableState(query$, query$.getValue());
	const customers = useObservableSuspense(resource);

	/**
	 *
	 */
	const displayCustomerNameOrUsername = React.useCallback((customer: CustomerDocument) => {
		if (!customer.first_name && !customer.last_name) return customer.username;
		return `${customer.first_name} ${customer.last_name}`;
	}, []);

	/**
	 *
	 */
	const onSearch = React.useCallback(
		(search: string) => {
			setQuery('search', search);
		},
		[setQuery]
	);

	/**
	 *
	 */
	const options = React.useMemo(() => {
		const guest = storeDB?.collections.customers.newDocument({ id: 0, first_name: 'Guest ' });
		customers.unshift(guest);

		return customers.map((customer) => ({
			label: displayCustomerNameOrUsername(customer),
			value: customer,
			key: customer.id,
		}));
	}, [customers, displayCustomerNameOrUsername, storeDB?.collections.customers]);

	useWhyDidYouUpdate('Customer Select', {
		selectedCustomer,
		onSelectCustomer,
		customers,
		onSearch,
		query,
		setQuery,
		options,
	});

	/**
	 *
	 */
	return (
		<Combobox
			label="Search customers"
			hideLabel
			options={options}
			placeholder={t('customers.search.placeholder')}
			selected={selectedCustomer ? displayCustomerNameOrUsername(selectedCustomer) : ''}
			onSearch={onSearch}
			searchValue={query.search}
			onChange={onSelectCustomer}
		/>
	);
};

export default (props: CustomerSelectProps) => (
	<CustomersProvider
		initialQuery={{
			search: '',
			sortBy: 'last_name',
			sortDirection: 'asc',
		}}
	>
		<CustomerSelect {...props} />
	</CustomersProvider>
);
