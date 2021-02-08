import * as React from 'react';
import Table from '../../../../components/table';
import Image from './cells/image';
import Actions from './cells/actions';
import Address from './cells/address';

interface Props {
	customer: any;
	columns: [];
}

const Row = ({ customer, columns }: Props) => {
	return (
		<Table.Row rowData={customer} columns={columns}>
			{({ cellData, column, getCellProps }) => (
				<Table.Row.Cell {...getCellProps()}>
					{((): React.ReactElement | null => {
						switch (column.key) {
							case 'avatar_url':
								return <Image customer={customer} />;
							case 'billing':
							case 'shipping':
								return <Address customer={customer} type={column.key} />;
							case 'actions':
								return <Actions customer={customer} />;
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
