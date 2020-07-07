import React from 'react';
import { useTranslation } from 'react-i18next';
import Table from '../../components/table';
import Text from '../../components/text';

interface Props {
	columns: any;
	orders: any;
	sort: () => void;
	sortBy: string;
	sortDirection: string;
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
					{({ getHeaderCellProps }) => {
						const { column } = getHeaderCellProps();
						return (
							<Table.HeaderRow.HeaderCell {...getHeaderCellProps()}>
								{t(`orders.column.label.${column.key}`)}
							</Table.HeaderRow.HeaderCell>
						);
					}}
				</Table.HeaderRow>
			</Table.Header>
			<Table.Body>
				{({ item }) => (
					<Table.Row rowData={item} columns={columns}>
						{({ cellData, column, getCellProps }) => (
							<Table.Row.Cell {...getCellProps()}>
								<Text>{String(cellData)}</Text>
							</Table.Row.Cell>
						)}
					</Table.Row>
				)}
			</Table.Body>
		</Table>
	);
};

export default OrdersTable;
