import * as React from 'react';
import Table from '../../../../components/table';
import Status from './cells/status';
import Customer from './cells/customer';
import Actions from './cells/actions';
import Address from './cells/address';
import Note from './cells/note';

type ColumnProps = import('../../../../components/table/types').ColumnProps;
type GetCellPropsFunction = import('../../../../components/table/row').GetCellPropsFunction;
type CellRenderProps = {
	cellData: any;
	column: ColumnProps;
	getCellProps: GetCellPropsFunction;
};

interface Props {
	order: any;
	columns: ColumnProps[];
}

const Row = ({ order, columns }: Props) => {
	return (
		<Table.Row rowData={order} columns={columns}>
			{({ cellData, column, getCellProps }: CellRenderProps) => (
				<Table.Row.Cell {...getCellProps()}>
					{((): React.ReactElement | null => {
						switch (column.key) {
							case 'status':
								return <Status status={order.status} />;
							case 'customer':
								return <Customer order={order} />;
							case 'billing':
							case 'shipping':
								return <Address order={order} type={column.key} />;
							case 'customerNote':
								return <Note note={cellData} />;
							case 'actions':
								return <Actions order={order} />;
							default:
								return null;
						}
					})()}
				</Table.Row.Cell>
			)}
		</Table.Row>
	);
};

export default Row;
