import React from 'react';
import Table from '../../../../../components/table';
import Button from '../../../../../components/button';

const VariationRow = ({ variation, columns }) => {
	const addToCart = async () => {
		const order = await variation.collections().orders.findOne().exec();
		order.addOrUpdateLineItem(variation);
	};

	return (
		<Table.Row rowData={variation} columns={columns}>
			{({ getCellProps }) => {
				const { cellData, column } = getCellProps();
				return (
					<Table.Row.Cell {...getCellProps()}>
						{((): React.ReactElement | null => {
							switch (column.key) {
								case 'actions':
									return <Button title="->" onPress={addToCart} />;
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

export default VariationRow;
