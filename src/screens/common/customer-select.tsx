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
type OrderDocument = import('@wcpos/common/src/database').OrderDocument;
type StoreDatabase = import('@wcpos/common/src/database').StoreDatabase;

interface CustomerSelectProps {
	order?: OrderDocument;
}

const CustomerSelect = ({ order }: CustomerSelectProps) => {
	const [selectedCustomer, setSelectedCustomer] = React.useState<CustomerDocument>();
	const { storeDB } = useAppState() as { storeDB: StoreDatabase };
	const { t } = useTranslation();
	const { data$, query, setQuery } = useDataObservable('customers', {
		search: '',
		sortBy: 'lastName',
		sortDirection: 'asc',
	});

	const onSearch = React.useCallback(
		(search: string) => {
			setQuery((prev) => ({ ...prev, search }));
		},
		[setQuery]
	);

	const handleSelectCustomer = React.useCallback(
		(value: CustomerDocument) => {
			if (order) {
				order.addCustomer(value);
			}
			setSelectedCustomer(value);
		},
		[order]
	);

	const customers = useObservableState(data$, []) as CustomerDocument[];

	const choices = React.useMemo(() => {
		const sortedCustomers = orderBy(customers, 'lastName');

		return sortedCustomers.map((customer) => ({
			label: `${customer.firstName} ${customer.lastName}`,
			value: customer,
			key: customer._id,
		}));
	}, [customers]);

	useWhyDidYouUpdate('Customer Select', {
		customers,
		handleSelectCustomer,
		onSearch,
		order,
		query,
		setQuery,
		data$,
	});

	return (
		<Combobox
			label="Search customers"
			hideLabel
			choices={choices}
			placeholder={
				selectedCustomer
					? // @ts-ignore
					  `${selectedCustomer.firstName} ${selectedCustomer.lastName}`
					: t('customers.search.placeholder')
			}
			onSearch={onSearch}
			searchValue={query.search}
			onChange={handleSelectCustomer}
		/>
	);
};

export default CustomerSelect;
