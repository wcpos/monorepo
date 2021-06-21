import * as React from 'react';
import Table from '../../../../components/table';
import Image from './cells/image';
import Actions from './cells/actions';
import Address from './cells/address';
import Name from './cells/name';
import Email from './cells/email';

type ColumnProps = import('../../../../components/table/types').ColumnProps;
type GetCellPropsFunction = import('../../../../components/table/row').GetCellPropsFunction;
type CellRenderProps = {
	cellData: any;
	column: ColumnProps;
	getCellProps: GetCellPropsFunction;
};

interface ICustomerRowProps {
	customer: any;
	columns: ColumnProps[];
}

const Row = ({ customer, columns }: ICustomerRowProps) => {
	return (
		<Table.Body.Row rowData={customer} columns={columns}>
			{({ cellData, column, getCellProps }: CellRenderProps): React.ReactElement => (
				<Table.Body.Row.Cell {...getCellProps()}>
					{((): React.ReactElement | null => {
						switch (column.key) {
							case 'avatarUrl':
								return <Image customer={customer} />;
							case 'firstName':
							case 'lastName':
								return <Name customer={customer} type={column.key} />;
							case 'email':
								return <Email customer={customer} />;
							case 'billing':
							case 'shipping':
								return <Address customer={customer} type={column.key} />;
							case 'actions':
								return <Actions customer={customer} />;
							default:
								return null;
						}
					})()}
				</Table.Body.Row.Cell>
			)}
		</Table.Body.Row>
	);
};

export default Row;
