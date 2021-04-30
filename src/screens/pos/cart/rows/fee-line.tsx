import * as React from 'react';
import { useSnackbar } from '@wcpos/common/src/components/snackbar/use-snackbar';
import Table from '@wcpos/common/src/components/table';
import Button from '@wcpos/common/src/components/button';
import Price from './cells/fee-and-shipping-price';

type GetCellPropsFunction = import('@wcpos/common/src/components/table/row').GetCellPropsFunction;

interface Props {
	order: import('@wcpos/common/src/database').OrderDocument;
	fee: import('@wcpos/common/src/database').FeeLineDocument;
	columns: any;
}

const FeeLine = ({ order, fee, columns }: Props) => {
	const showSnackbar = useSnackbar({ message: 'hi' });

	const handleFeeRemove = () => {
		order.removeFeeLine(fee);
		showSnackbar();
	};

	return (
		<Table.Row rowData={fee} columns={columns}>
			{({ getCellProps }: { getCellProps: GetCellPropsFunction }) => {
				const { cellData, column } = getCellProps();
				return (
					<Table.Row.Cell {...getCellProps()}>
						{((): React.ReactElement | null => {
							switch (column.key) {
								case 'quantity':
									return null;
								case 'price':
									return <Price item={fee} />;
								case 'actions':
									return <Button title="x" onPress={handleFeeRemove} />;
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
