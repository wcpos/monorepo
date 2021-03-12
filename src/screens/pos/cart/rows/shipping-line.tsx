import * as React from 'react';
import Table from '../../../../components/table';
import Button from '../../../../components/button';
import Text from '../../../../components/text';
import Price from './cells/price';

type GetCellPropsFunction = import('../../../../components/table/row').GetCellPropsFunction;

type Props = {
	order: any;
	shipping: any;
	columns: any;
};

const ShippingLine = ({ order, shipping, columns }: Props): React.ReactElement => {
	const onRemove = () => {
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
									return <Price lineItem={shipping} price={cellData} />;
								case 'name':
									return <Text>{shipping.method_title}</Text>;
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

export default ShippingLine;
