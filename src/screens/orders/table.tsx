import * as React from 'react';
import { useObservableState, useObservableSuspense } from 'observable-hooks';
import { useTranslation } from 'react-i18next';
import get from 'lodash/get';
import useOrders from '@wcpos/hooks/src/use-orders';
import useWhyDidYouUpdate from '@wcpos/hooks/src/use-why-did-you-update';
import Table from '@wcpos/components/src/table';
import Text from '@wcpos/components/src/text';
import Actions from './cells/actions';
import Address from './cells/address';
import Customer from './cells/customer';
import CustomerNote from './cells/note';
import Status from './cells/status';
import Total from './cells/total';
import Footer from './footer';

type Sort = import('@wcpos/components/src/table/table').Sort;
type SortDirection = import('@wcpos/components/src/table/table').SortDirection;
type OrderDocument = import('@wcpos/database').OrderDocument;
type ColumnProps = import('@wcpos/components/src/table/table').ColumnProps<OrderDocument>;
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
	 * - filter visible columns
	 * - translate column label
	 * - asssign cell renderer
	 */
	const visibleColumns = React.useMemo(
		() =>
			columns
				.filter((column) => column.show)
				.map((column) => ({
					...column,
					label: t(`orders.column.label.${column.key}`),
				})),
		[columns, t]
	);

	/**
	 * handle sort
	 */
	const handleSort: Sort = React.useCallback(
		({ sortBy, sortDirection }) => {
			setQuery('sortBy', sortBy);
			setQuery('sortDirection', sortDirection);
		},
		[setQuery]
	);

	/**
	 *
	 */
	const cellRenderer = React.useCallback((item: OrderDocument, column: ColumnProps) => {
		const Cell = get(cells, column.key);
		return Cell ? (
			<Cell item={item} column={column} />
		) : (
			<Text numberOfLines={1}>{item[column.key]}</Text>
		);
	}, []);

	/**
	 *
	 */
	const rowRenderer = React.useCallback(
		(
			item,
			index
			// renderContext: TableRowRenderContext<T>,
		) => {
			// subscribe to item, special case to trigger render for data changes
			// @TODO: find a better way to do this
			// @ts-ignore
			// const forceRender = useObservableState(item.$);

			return (
				<Table.Row
					// config={renderContext}
					item={item}
					columns={visibleColumns}
					// itemIndex={index}
					cellRenderer={cellRenderer}
					itemIndex={index}
				/>
			);
		},
		[cellRenderer, visibleColumns]
	);

	useWhyDidYouUpdate('Table', { data });

	return (
		<Table<OrderDocument>
			columns={visibleColumns}
			data={data}
			sort={handleSort}
			sortBy={query.sortBy}
			sortDirection={query.sortDirection}
			footer={<Footer count={data.length} />}
			rowRenderer={rowRenderer}
		/>
	);
};

export default OrdersTable;
