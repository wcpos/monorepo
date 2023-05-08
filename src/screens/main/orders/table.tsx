import * as React from 'react';

import get from 'lodash/get';
import { useObservableState, useObservableSuspense } from 'observable-hooks';

import ErrorBoundary from '@wcpos/components/src/error-boundary';
import Table, { TableExtraDataProps, CellRenderer } from '@wcpos/components/src/table';

import Actions from './cells/actions';
import Address from './cells/address';
import Customer from './cells/customer';
import CustomerNote from './cells/note';
import PaymentMethod from './cells/payment-method';
import Status from './cells/status';
import Total from './cells/total';
import Footer from './footer';
import { t } from '../../../lib/translations';
import Date from '../components/date';
import EmptyTableRow from '../components/empty-table-row';
import TextCell from '../components/text-cell';
import useOrders from '../contexts/orders';

type OrderDocument = import('@wcpos/database').OrderDocument;
type UISettingsColumn = import('../contexts/ui-settings').UISettingsColumn;

interface OrdersTableProps {
	uiSettings: import('../contexts/ui-settings').UISettingsDocument;
}

const cells = {
	actions: Actions,
	billing: Address,
	shipping: Address,
	customer_id: Customer,
	customer_note: CustomerNote,
	status: Status,
	total: Total,
	date_created: Date,
	date_modified: Date,
	date_completed: Date,
	payment_method: PaymentMethod,
};

/**
 *
 */
const OrdersTable = ({ uiSettings }: OrdersTableProps) => {
	const { query$, setQuery, resource } = useOrders();
	const orders = useObservableSuspense(resource);
	const query = useObservableState(query$, query$.getValue());
	const columns = useObservableState(
		uiSettings.get$('columns'),
		uiSettings.get('columns')
	) as UISettingsColumn[];

	/**
	 *
	 */
	const cellRenderer = React.useCallback<CellRenderer<OrderDocument>>(({ item, column, index }) => {
		const Cell = get(cells, [column.key]);

		if (Cell) {
			return (
				<ErrorBoundary>
					<React.Suspense>
						<Cell item={item} column={column} index={index} />
					</React.Suspense>
				</ErrorBoundary>
			);
		}

		return <TextCell item={item} column={column} />;
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
			headerLabel: ({ column }) => uiSettings.getLabel(column.key),
		};
	}, [columns, query.sortBy, query.sortDirection, cellRenderer, setQuery, uiSettings]);

	return (
		<Table<OrderDocument>
			data={orders}
			footer={<Footer count={orders.length} />}
			estimatedItemSize={100}
			extraData={context}
			ListEmptyComponent={<EmptyTableRow message={t('No orders found', { _tags: 'core' })} />}
		/>
	);
};

export default OrdersTable;
