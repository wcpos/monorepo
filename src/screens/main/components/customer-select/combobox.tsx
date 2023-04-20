import * as React from 'react';

import delay from 'lodash/delay';
import { useLayoutObservableState } from 'observable-hooks';

import Combobox from '@wcpos/components/src/combobox';

import { CustomerItem } from './item';
import { t } from '../../../../lib/translations';
import useCustomers from '../../contexts/customers';
// import useCustomerNameFormat from '../../hooks/use-customer-name-format';

type CustomerDocument = import('@wcpos/database').CustomerDocument;
type TextInput = import('react-native').TextInput;

export interface CustomerComboboxProps {
	selectedCustomer?: CustomerDocument;
	onSelectCustomer: (value: CustomerDocument) => void;
}

/**
 *
 */
export const CustomerCombobox = ({ selectedCustomer, onSelectCustomer }: CustomerComboboxProps) => {
	const { query$, setQuery, data: customers } = useCustomers();
	const query = useLayoutObservableState(query$, query$.getValue());
	// const { format } = useCustomerNameFormat();
	const [search, setSearch] = React.useState(query.search);
	const textInputRef = React.useRef<TextInput>(null);

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
	 * FIXME: this is a hack, useEffect is being called before onLayout for the Popover.Target
	 * which means the width is not set correctly.
	 */
	React.useEffect(() => {
		if (textInputRef.current) {
			delay(() => {
				textInputRef.current.focus();
			}, 100);
		}
	}, []);

	/**
	 *
	 */
	return (
		<Combobox
			options={options}
			placeholder={t('Search Customers', { _tags: 'core' })}
			onSearch={onSearch}
			searchValue={search}
			onChange={onSelectCustomer}
			renderOption={CustomerItem}
			textInputRef={textInputRef}
		/>
	);
};
