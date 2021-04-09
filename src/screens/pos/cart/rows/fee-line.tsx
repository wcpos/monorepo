import * as React from 'react';
import Table from '@wcpos/common/src/components/table';
import Button from '@wcpos/common/src/components/button';
import Price from './cells/price';

type GetCellPropsFunction = import('@wcpos/common/src/components/table/row').GetCellPropsFunction;

interface Props {
	order: import('@wcpos/common/src/database/orders').OrderDocument;
	fee: import('@wcpos/common/src/database/fee-lines').FeeLineDocument;
	columns: any;
}

const FeeLine = ({ order, fee, columns }: Props) => {
	const handleFeeRemove = () => {
		order.removeFeeLine(fee);
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
									return <Price lineItem={fee} />;
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
