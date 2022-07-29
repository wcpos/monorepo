import * as React from 'react';
import { useObservableState, useObservableSuspense } from 'observable-hooks';
import { useTranslation } from 'react-i18next';
import get from 'lodash/get';
import useCustomers from '@wcpos/hooks/src/use-customers';
import useWhyDidYouUpdate from '@wcpos/hooks/src/use-why-did-you-update';
import Table, { TableContextProps } from '@wcpos/components/src/table';
import Footer from './footer';
import cells from './cells';

type CustomerDocument = import('@wcpos/database').CustomerDocument;
type UIColumn = import('@wcpos/hooks/src/use-ui-resource').UIColumn;

interface CustomersTableProps {
	ui: import('@wcpos/hooks/src/use-ui-resource').UIDocument;
}

/**
 *
 */
const CustomersTable = ({ ui }: CustomersTableProps) => {
	const { t } = useTranslation();
	const { query$, setQuery, resource } = useCustomers();
	const query = useObservableState(query$, query$.getValue());
	const data = useObservableSuspense(resource);
	const columns = useObservableState(ui.get$('columns'), ui.get('columns')) as UIColumn[];

	/**
	 *
	 */
	const cellRenderer = React.useCallback(({ item, column, index }) => {
		const Cell = cells[column.key];
		return Cell ? <Cell item={item} column={column} index={index} /> : null;
	}, []);

	/**
	 *
	 */
	const headerLabel = React.useCallback(
		({ column }) => {
			return t(`customers.column.label.${column.key}`);
		},
		[t]
	);

	/**
	 *
	 */
	const tableContext = React.useMemo<TableContextProps<CustomerDocument>>(() => {
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

	useWhyDidYouUpdate('Table', { data });

	return (
		<Table<CustomerDocument>
			data={data}
			footer={<Footer count={data.length} />}
			estimatedItemSize={100}
			context={tableContext}
		/>
	);
};

export default CustomersTable;
