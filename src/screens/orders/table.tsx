import * as React from 'react';
import { useObservableState, useObservableSuspense } from 'observable-hooks';
import { useTranslation } from 'react-i18next';
import get from 'lodash/get';
import useOrders from '@wcpos/hooks/src/use-orders';
import useWhyDidYouUpdate from '@wcpos/hooks/src/use-why-did-you-update';
import Table, { TableContextProps } from '@wcpos/components/src/table';
import Text from '@wcpos/components/src/text';
import Actions from './cells/actions';
import Address from './cells/address';
import Customer from './cells/customer';
import CustomerNote from './cells/note';
import Status from './cells/status';
import Total from './cells/total';
import DateCreated from './cells/date-created';
import Footer from './footer';

type OrderDocument = import('@wcpos/database').OrderDocument;
type UIColumn = import('@wcpos/hooks/src/use-ui-resource').UIColumn;

interface OrdersTableProps {
	ui: import('@wcpos/hooks/src/use-ui-resource').UIDocument;
}

const cells = {
	actions: Actions,
	billing: Address,
	shipping: Address,
	customer: Customer,
	customer_note: CustomerNote,
	status: Status,
	total: Total,
	date_created: DateCreated,
};

/**
 *
 */
const OrdersTable = ({ ui }: OrdersTableProps) => {
	const { t } = useTranslation();
	const { query$, setQuery, resource } = useOrders();
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
			return t(`orders.column.label.${column.key}`);
		},
		[t]
	);

	/**
	 *
	 */
	const tableContext = React.useMemo<TableContextProps<OrderDocument>>(() => {
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
		<Table<OrderDocument>
			data={data}
			footer={<Footer count={data.length} />}
			estimatedItemSize={100}
			context={tableContext}
		/>
	);
};

export default OrdersTable;
