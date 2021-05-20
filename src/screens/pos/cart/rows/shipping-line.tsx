import * as React from 'react';
import Table from '@wcpos/common/src/components/table';
import Text from '@wcpos/common/src/components/text';
import Price from './cells/fee-and-shipping-price';
import Tax from './cells/tax';
import Actions from './cells/actions';

type GetCellPropsFunction = import('@wcpos/common/src/components/table/row').GetCellPropsFunction;

interface Props {
	// order: import('@wcpos/common/src/database').OrderDocument;
	shipping: import('@wcpos/common/src/database').ShippingLineDocument;
	columns: any;
}

const ShippingLine = ({ shipping, columns }: Props) => {
	return (
		<Table.Row rowData={shipping} columns={columns}>
			{({ getCellProps }: { getCellProps: GetCellPropsFunction }) => {
				const { cellData, column } = getCellProps();
				return (
					<Table.Row.Cell {...getCellProps()}>
						{((): React.ReactElement | null => {
							switch (column.key) {
								case 'quantity':
									return <></>;
								case 'price':
									return <Price item={shipping} />;
								case 'name':
									return <Text>{shipping.methodTitle}</Text>;
								case 'totalTax':
									return <Tax item={shipping} />;
								case 'actions':
									return <Actions item={shipping} />;
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
