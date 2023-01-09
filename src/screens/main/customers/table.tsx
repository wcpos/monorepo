import * as React from 'react';

import { useObservableState } from 'observable-hooks';

import Table, { TableExtraDataProps, CellRenderer } from '@wcpos/components/src/table';
import useWhyDidYouUpdate from '@wcpos/hooks/src/use-why-did-you-update';

import useCustomers from '../../../contexts/customers';
import { t } from '../../../lib/translations';
import cells from './cells';
import Footer from './footer';

type CustomerDocument = import('@wcpos/database').CustomerDocument;
type UIColumn = import('../../../contexts/ui').UIColumn;

interface CustomersTableProps {
	ui: import('../../../contexts/ui').UIDocument;
}

/**
 *
 */
const CustomersTable = ({ ui }: CustomersTableProps) => {
	const { query$, setQuery, data: customers } = useCustomers();
	const query = useObservableState(query$, query$.getValue());
	const columns = useObservableState(ui.get$('columns'), ui.get('columns')) as UIColumn[];

	/**
	 *
	 */
	const cellRenderer = React.useCallback<CellRenderer<CustomerDocument>>(
		({ item, column, index }) => {
			const Cell = cells[column.key];
			return Cell ? <Cell item={item} column={column} index={index} /> : null;
		},
		[]
	);

	/**
	 *
	 */
	const headerLabel = React.useCallback(({ column }) => {
		switch (column.key) {
			case 'avatar_url':
				return t('Image', { _tags: 'core' });
			case 'first_name':
				return t('First Name', { _tags: 'core' });
			case 'last_name':
				return t('Last Name', { _tags: 'core' });
			case 'email':
				return t('Email', { _tags: 'core' });
			case 'billing':
				return t('Billing Address', { _tags: 'core' });
			case 'shipping':
				return t('Shipping Address', { _tags: 'core' });
			case 'role':
				return t('Role', { _tags: 'core' });
			case 'username':
				return t('Username', { _tags: 'core' });
			default:
				return column.key;
		}
	}, []);

	/**
	 *
	 */
	const context = React.useMemo<TableExtraDataProps<CustomerDocument>>(() => {
		return {
			columns: columns.filter((column) => column.show),
			sort: ({ sortBy, sortDirection }) => {
				setQuery('sortBy', sortBy);
				setQuery('sortDirection', sortDirection);
			},
			sortBy: query.sortBy,
			sortDirection: query.sortDirection,
			cellRenderer,
			headerLabel,
		};
	}, [columns, query.sortBy, query.sortDirection, setQuery, cellRenderer, headerLabel]);

	useWhyDidYouUpdate('Table', { customers });

	return (
		<Table<CustomerDocument>
			data={customers}
			footer={<Footer count={customers.length} />}
			estimatedItemSize={100}
			extraData={context}
		/>
	);
};

export default CustomersTable;
