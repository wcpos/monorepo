import * as React from 'react';
import { useTranslation } from 'react-i18next';
import forEach from 'lodash/forEach';
import Table from '../../../components/table';
import Row from './rows';

type Sort = import('../../../components/table/types').Sort;
type SortDirection = import('../../../components/table/types').SortDirection;
type GetHeaderCellPropsFunction =
	import('../../../components/table/header-row').GetHeaderCellPropsFunction;

interface Props {
	columns: any;
	orders: any;
	sort: Sort;
	sortBy: string;
	sortDirection: SortDirection;
}

/**
 *
 */
const OrdersTable: React.FC<Props> = ({ columns, orders, sort, sortBy, sortDirection }) => {
	const { t } = useTranslation();
	const syncingOrders = React.useRef<number[]>([]);

	const handleVieweableItemsChanged = React.useCallback(({ changed }) => {
		forEach(changed, ({ item, isViewable }) => {
			if (isViewable && !item.isSynced() && !syncingOrders.current.includes(item.id)) {
				syncingOrders.current.push(item.id);
				const replicationState = item.syncRestApi({
					pull: {},
				});
				replicationState.run(false);
			}
		});
	}, []);

	return (
		<Table
			columns={columns}
			data={orders}
			sort={sort}
			sortBy={sortBy}
			sortDirection={sortDirection}
			// @ts-ignore
			onViewableItemsChanged={handleVieweableItemsChanged}
		>
			<Table.Header>
				<Table.Header.Row>
					{({ getHeaderCellProps }: { getHeaderCellProps: GetHeaderCellPropsFunction }) => {
						const { column } = getHeaderCellProps();
						return (
							<Table.Header.Row.Cell {...getHeaderCellProps()}>
								{t(`orders.column.label.${column.key}`)}
							</Table.Header.Row.Cell>
						);
					}}
				</Table.Header.Row>
			</Table.Header>
			<Table.Body>{({ item }: { item: any }) => <Row order={item} columns={columns} />}</Table.Body>
		</Table>
	);
};

export default OrdersTable;
