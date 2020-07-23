import React from 'react';
import Table from '../../../../components/table';
import Button from '../../../../components/button';
import Price from './cells/price';

type Props = {
	order: any;
	fee: any;
	columns: any;
};

const FeeLine = ({ order, fee, columns }: Props): React.ReactElement => {
	const onRemove = () => {
		order.removeFeeLine(fee);
	};

	return (
		<Table.Row rowData={fee} columns={columns}>
			{({ getCellProps }) => {
				const { cellData, column } = getCellProps();
				return (
					<Table.Row.Cell {...getCellProps()}>
						{((): React.ReactElement | null => {
							switch (column.key) {
								case 'quantity':
									return null;
								case 'price':
									return <Price lineItem={fee} price={cellData} />;
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

export default FeeLine;
