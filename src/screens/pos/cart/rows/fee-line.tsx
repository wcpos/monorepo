import * as React from 'react';
import { useSnackbar } from '@wcpos/common/src/components/snackbar/use-snackbar';
import Table from '@wcpos/common/src/components/table';
import Button from '@wcpos/common/src/components/button';
import Price from './cells/fee-and-shipping-price';
import Tax from './cells/tax'
import { POSContext } from '../../pos';

type GetCellPropsFunction = import('@wcpos/common/src/components/table/row').GetCellPropsFunction;

interface Props {
	// order: import('@wcpos/common/src/database').OrderDocument;
	fee: import('@wcpos/common/src/database').FeeLineDocument;
	columns: any;
}

const FeeLine = ({ fee, columns }: Props) => {
	const { currentOrder } = React.useContext(POSContext);

	/**  */
	const handleFeeRemove = () => {
		currentOrder?.removeFeeLine(fee);
		showSnackbar();
	};

	/**  */
	const undoFeeRemove = () => {
		console.log('undo');
	};

	/**  */
	const showSnackbar = useSnackbar({
		message: 'Fee removed',
		dismissable: true,
		action: { label: 'Undo', action: undoFeeRemove },
	});

	return (
		<Table.Row rowData={fee} columns={columns}>
			{({ getCellProps }: { getCellProps: GetCellPropsFunction }) => {
				const { cellData, column } = getCellProps();
				return (
					<Table.Row.Cell {...getCellProps()}>
						{((): React.ReactElement | null => {
							switch (column.key) {
								case 'quantity':
									return <></>;
								case 'price':
									return <Price item={fee} />;
								case 'totalTax':
									return <Tax item={fee} />;
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
