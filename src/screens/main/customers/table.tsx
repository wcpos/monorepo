import * as React from 'react';

import get from 'lodash/get';
import { useObservableState } from 'observable-hooks';

import Table, { TableExtraDataProps, CellRenderer } from '@wcpos/components/src/table';
import useWhyDidYouUpdate from '@wcpos/hooks/src/use-why-did-you-update';

import cells from './cells';
import Footer from './footer';
import { t } from '../../../lib/translations';
import TextCell from '../components/text-cell';
import useCustomers from '../contexts/customers';
import { labels } from '../contexts/ui';

type CustomerDocument = import('@wcpos/database').CustomerDocument;
type UIColumn = import('../contexts/ui').UIColumn;

interface CustomersTableProps {
	ui: import('../contexts/ui').UIDocument;
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
			const Cell = get(cells, column.key, TextCell);
			return <Cell item={item} column={column} index={index} />;
		},
		[]
	);

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
			headerLabel: ({ column }) => get(labels, ['customers', column.key], column.key),
		};
	}, [columns, query.sortBy, query.sortDirection, setQuery, cellRenderer]);

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
