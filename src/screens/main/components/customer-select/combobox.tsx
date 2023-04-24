import * as React from 'react';

import isInteger from 'lodash/isInteger';
import { useLayoutObservableState } from 'observable-hooks';

import Combobox, { ComboboxProps } from '@wcpos/components/src/combobox';

import { CustomerItem } from './item';
import { t } from '../../../../lib/translations';
import useCustomers from '../../contexts/customers';
import useCustomerNameFormat from '../../hooks/use-customer-name-format';

type CustomerDocument = import('@wcpos/database').CustomerDocument;
type TextInput = import('react-native').TextInput;

export interface CustomerComboboxProps extends Omit<ComboboxProps, 'options'> {
	selectedCustomer?: CustomerDocument;
	onSelectCustomer: (value: CustomerDocument) => void;
}

/**
 *
 */
export const CustomerCombobox = ({ onSelectCustomer, value, ...props }: CustomerComboboxProps) => {
	const { query$, setQuery, data: customers } = useCustomers();
	const query = useLayoutObservableState(query$, query$.getValue());
	// const { format } = useCustomerNameFormat();
	const [search, setSearch] = React.useState(query.search);
	const { format } = useCustomerNameFormat();
	// const name = format({ billing, shipping, id: customer_id });

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
			value: customer,
			key: customer.uuid,
		}));

		opts.unshift({ key: 0, value: { id: 0 } });
		return opts;
	}, [customers]);

	/**
	 *
	 */
	const selectedCustomer = React.useMemo(() => {
		if (isInteger(value)) {
			return customers.find((customer) => customer.id === value);
		}
		return props.selectedCustomer;
	}, [value, props.selectedCustomer, customers]);

	/**
	 *
	 */
	const placeholder = React.useMemo(() => {
		if (selectedCustomer) {
			return format(selectedCustomer);
		}

		return t('Search Customers', { _tags: 'core' });
	}, [selectedCustomer, format]);

	/**
	 *
	 */
	return (
		<Combobox
			{...props}
			placeholder={placeholder}
			options={options}
			onSearch={onSearch}
			searchValue={search}
			onChange={onSelectCustomer}
			renderOption={CustomerItem}
		/>
	);
};
