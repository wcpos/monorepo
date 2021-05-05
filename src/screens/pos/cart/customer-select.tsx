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
import { useTranslation } from 'react-i18next';
import Combobox from '@wcpos/common/src/components/combobox';
import useAppState from '@wcpos/common/src/hooks/use-app-state';

type CustomerDocument = import('@wcpos/common/src/database').CustomerDocument;
type OrderDocument = import('@wcpos/common/src/database').OrderDocument;
type StoreDatabase = import('@wcpos/common/src/database').StoreDatabase;

interface CustomerSelectProps {
	order?: OrderDocument;
}

const CustomerSelect = ({ order }: CustomerSelectProps) => {
	const [search, setSearch] = React.useState('');
	const [selectedCustomer, setSelectedCustomer] = React.useState<CustomerDocument>();
	const { storeDB } = useAppState() as { storeDB: StoreDatabase };
	const { t } = useTranslation();

	const customers$ = useObservable(
		(inputs$) =>
			inputs$.pipe(
				distinctUntilChanged((a, b) => a[0] === b[0]),
				debounceTime(150),
				switchMap(([q]) => {
					console.log(q);
					const regexp = new RegExp(escape(q), 'i');
					const selector = {
						firstName: { $regex: regexp },
						// categories: { $elemMatch: { id: 20 } },
					};
					const RxQuery = storeDB.collections.customers.find({ selector });
					// .sort({ [q.sortBy]: q.sortDirection });
					return RxQuery.$;
				}),
				catchError((err) => {
					console.error(err);
					return err;
				})
			),
		[search]
	);

	const customers = useObservableState(customers$, []) as any[];

	const handleSelectCustomer = (value: CustomerDocument) => {
		if (order) {
			order.addCustomer(value);
		}
		setSelectedCustomer(value);
	};

	return (
		<Combobox
			choices={customers.map((customer) => ({
				label: `${customer.firstName} ${customer.lastName}`,
				value: customer,
			}))}
			placeholder={
				selectedCustomer
					? // @ts-ignore
					  `${selectedCustomer.firstName} ${selectedCustomer.lastName}`
					: t('Search customers')
			}
			onSearch={setSearch}
			searchValue={search}
			onChange={handleSelectCustomer}
		/>
	);
};

export default CustomerSelect;
