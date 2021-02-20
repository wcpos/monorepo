import * as React from 'react';
import { useTranslation } from 'react-i18next';
import Table from '../../../components/table';
import Row from './rows';

type Sort = import('../../../components/table/types').Sort;
type SortDirection = import('../../../components/table/types').SortDirection;
type GetHeaderCellPropsFunction = import('../../../components/table/header-row').GetHeaderCellPropsFunction;

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

	return (
		<Table
			columns={columns}
			data={orders}
			sort={sort}
			sortBy={sortBy}
			sortDirection={sortDirection}
		>
			<Table.Header>
				<Table.HeaderRow>
					{({ getHeaderCellProps }: { getHeaderCellProps: GetHeaderCellPropsFunction }) => {
						const { column } = getHeaderCellProps();
						return (
							<Table.HeaderRow.HeaderCell {...getHeaderCellProps()}>
								{t(`orders.column.label.${column.key}`)}
							</Table.HeaderRow.HeaderCell>
						);
					}}
				</Table.HeaderRow>
			</Table.Header>
			<Table.Body>{({ item }: { item: any }) => <Row order={item} columns={columns} />}</Table.Body>
		</Table>
	);
};

export default OrdersTable;
