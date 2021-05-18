import * as React from 'react';
import { useSnackbar } from '@wcpos/common/src/components/snackbar/use-snackbar';
import Table from '@wcpos/common/src/components/table';
import Button from '@wcpos/common/src/components/button';
import Text from '@wcpos/common/src/components/text';
import Price from './cells/fee-and-shipping-price';
import Tax from './cells/tax';
import { POSContext } from '../../pos';

type GetCellPropsFunction = import('@wcpos/common/src/components/table/row').GetCellPropsFunction;

interface Props {
	// order: import('@wcpos/common/src/database').OrderDocument;
	shipping: import('@wcpos/common/src/database').ShippingLineDocument;
	columns: any;
}

const ShippingLine = ({ shipping, columns }: Props) => {
	const { currentOrder } = React.useContext(POSContext);

	const showSnackbar = useSnackbar({ message: 'hi' });

	const handleRemove = () => {
		currentOrder?.removeShippingLine(shipping);
		showSnackbar();
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
									return <></>;
								case 'price':
									return <Price item={shipping} />;
								case 'name':
									return <Text>{shipping.methodTitle}</Text>;
								case 'totalTax':
									return <Tax item={shipping} />;
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
