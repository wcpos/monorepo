import * as React from 'react';

import { useObservableState } from 'observable-hooks';

import Table, { TableExtraDataProps, CellRenderer } from '@wcpos/components/src/table';
import Text from '@wcpos/components/src/text';
import useWhyDidYouUpdate from '@wcpos/hooks/src/use-why-did-you-update';

import Actions from './cells/actions';
import Address from './cells/address';
import Customer from './cells/customer';
import DateCreated from './cells/date-created';
import CustomerNote from './cells/note';
import Status from './cells/status';
import Total from './cells/total';
import Footer from './footer';
import useOrders from '../contexts/orders';
import { t } from '../../../lib/translations';

type OrderDocument = import('@wcpos/database').OrderDocument;
type UIColumn = import('../contexts/ui').UIColumn;

interface OrdersTableProps {
	ui: import('../contexts/ui').UIDocument;
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
	const { query$, setQuery, data: orders } = useOrders();
	const query = useObservableState(query$, query$.getValue());
	const columns = useObservableState(ui.get$('columns'), ui.get('columns')) as UIColumn[];

	/**
	 *
	 */
	const cellRenderer = React.useCallback<CellRenderer<OrderDocument>>(({ item, column, index }) => {
		const Cell = cells[column.key];
		return Cell ? (
			<Cell item={item} column={column} index={index} />
		) : (
			<Text>{item[column.key]}</Text>
		);
	}, []);

	/**
	 *
	 */
	const headerLabel = React.useCallback(({ column }) => {
		switch (column.key) {
			case 'status':
				return t('Status', { _tags: 'core' });
			case 'number':
				return t('Order Number', { _tags: 'core' });
			case 'customer':
				return t('Customer', { _tags: 'core' });
			case 'billing':
				return t('Billing Address', { _tags: 'core' });
			case 'shipping':
				return t('Shipping Address', { _tags: 'core' });
			case 'customer_note':
				return t('Note', { _tags: 'core' });
			case 'date_created':
				return t('Date Created', { _tags: 'core' });
			case 'date_completed':
				return t('Date Completed', { _tags: 'core' });
			case 'date_modified':
				return t('Date Modified', { _tags: 'core' });
			case 'total':
				return t('Total', { _tags: 'core' });
			default:
				return column.key;
		}
	}, []);

	/**
	 *
	 */
	const context = React.useMemo<TableExtraDataProps<OrderDocument>>(() => {
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

	useWhyDidYouUpdate('Table', { orders, context });

	return (
		<Table<OrderDocument>
			data={orders}
			footer={<Footer count={orders.length} />}
			estimatedItemSize={100}
			extraData={context}
		/>
	);
};

export default OrdersTable;
