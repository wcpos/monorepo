import * as React from 'react';
import { useObservableState } from 'observable-hooks';
import useCustomers from '@wcpos/core/src/contexts/customers';
import useWhyDidYouUpdate from '@wcpos/hooks/src/use-why-did-you-update';
import Table, { TableExtraDataProps, CellRenderer } from '@wcpos/components/src/table';
import { t } from '@wcpos/core/src/lib/translations';
import Footer from './footer';
import cells from './cells';

type CustomerDocument = import('@wcpos/database').CustomerDocument;
type UIColumn = import('@wcpos/hooks/src/use-store').UIColumn;

interface CustomersTableProps {
	ui: import('@wcpos/hooks/src/use-store').UIDocument;
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
				return t('Image');
			case 'first_name':
				return t('First Name');
			case 'last_name':
				return t('Last Name');
			case 'email':
				return t('Email');
			case 'billing':
				return t('Billing Address');
			case 'shipping':
				return t('Shipping Address');
			case 'role':
				return t('Role');
			case 'username':
				return t('Username');
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
