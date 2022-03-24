import * as React from 'react';
import { useObservable, useObservableState } from 'observable-hooks';
import {
	switchMap,
	tap,
	debounceTime,
	catchError,
	distinctUntilChanged,
	map,
} from 'rxjs/operators';
import orderBy from 'lodash/orderBy';
import { useTranslation } from 'react-i18next';
import useDataObservable from '@wcpos/common/src/hooks/use-data-observable';
import Combobox from '@wcpos/common/src/components/combobox';
import useAppState from '@wcpos/common/src/hooks/use-app-state';
import useWhyDidYouUpdate from '@wcpos/common/src/hooks/use-why-did-you-update';

type CustomerDocument = import('@wcpos/common/src/database').CustomerDocument;
type StoreDatabase = import('@wcpos/common/src/database').StoreDatabase;

interface CustomerSelectProps {
	selectedCustomer?: CustomerDocument;
	onSelectCustomer: (value: CustomerDocument) => void;
}

const CustomerSelect = ({ selectedCustomer, onSelectCustomer }: CustomerSelectProps) => {
	const { t } = useTranslation();
	const { data$, query, setQuery } = useDataObservable('customers', {
		search: '',
		sortBy: 'lastName',
		sortDirection: 'asc',
	});

	const displayCustomerNameOrUsername = React.useCallback((customer: CustomerDocument) => {
		if (!customer.firstName && !customer.lastName) return customer.username;
		return `${customer.firstName} ${customer.lastName}`;
	}, []);

	const onSearch = React.useCallback(
		(search: string) => {
			setQuery((prev) => ({ ...prev, search }));
		},
		[setQuery]
	);

	const customers = useObservableState(data$, []) as CustomerDocument[];

	const options = React.useMemo(() => {
		const sortedCustomers = orderBy(customers, 'lastName');

		return sortedCustomers.map((customer) => ({
			label: displayCustomerNameOrUsername(customer),
			value: customer,
			key: customer.localID,
		}));
	}, [customers, displayCustomerNameOrUsername]);

	// useWhyDidYouUpdate('Customer Select', {
	// 	selectedCustomer,
	// 	onSelectCustomer,
	// 	customers,
	// 	onSearch,
	// 	query,
	// 	setQuery,
	// 	data$,
	// });

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

export default CustomerSelect;
