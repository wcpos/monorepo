import React from 'react';
import Table from '../../../../components/table';
import Button from '../../../../components/button';
import Quantity from './cells/quantity';

type Props = {
	order: any;
	item: any;
	columns: any;
};

const LineItem = ({ order, item, columns }: Props): React.ReactElement => {
	const onRemove = () => {
		order.removeLineItem(item);
	};

	return (
		<Table.Row rowData={item} columns={columns}>
			{({ getCellProps }) => {
				const { cellData, column } = getCellProps();
				return (
					<Table.Row.Cell {...getCellProps()}>
						{((): React.ReactElement | null => {
							switch (column.key) {
								case 'quantity':
									return <Quantity lineItem={item} quantity={cellData} />;
								case 'actions':
									return <Button title="x" onPress={onRemove} />;
								default:
									return null;
							}
						})()}
					</Table.Row.Cell>
				);
			}}
		</Table.Row>
	);
};

export default LineItem;
