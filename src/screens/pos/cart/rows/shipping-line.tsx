import * as React from 'react';
import Table from '@wcpos/common/src/components/table';
import Button from '@wcpos/common/src/components/button';
import Text from '@wcpos/common/src/components/text';
import Price from './cells/price';

type GetCellPropsFunction = import('@wcpos/common/src/components/table/row').GetCellPropsFunction;

interface Props {
	order: import('@wcpos/common/src/database').OrderDocument;
	shipping: import('@wcpos/common/src/database').ShippingLineDocument;
	columns: any;
}

const ShippingLine = ({ order, shipping, columns }: Props) => {
	const handleRemove = () => {
		order.removeShippingLine(shipping);
	};

	return (
		<Table.Row rowData={shipping} columns={columns}>
			{({ getCellProps }: { getCellProps: GetCellPropsFunction }) => {
				const { cellData, column } = getCellProps();
				return (
					<Table.Row.Cell {...getCellProps()}>
						{((): React.ReactElement | null => {
							switch (column.key) {
								case 'quantity':
									return null;
								case 'price':
									return <Price lineItem={shipping} />;
								case 'name':
									return <Text>{shipping.methodTitle}</Text>;
								case 'actions':
									return <Button title="x" onPress={handleRemove} />;
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

export default ShippingLine;
