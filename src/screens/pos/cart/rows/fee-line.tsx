import * as React from 'react';
import Table from '@wcpos/common/src/components/table';
import Price from './cells/fee-and-shipping-price';
import Tax from './cells/tax';
import Actions from './cells/actions';

type GetCellPropsFunction = import('@wcpos/common/src/components/table/row').GetCellPropsFunction;

interface Props {
	// order: import('@wcpos/common/src/database').OrderDocument;
	fee: import('@wcpos/common/src/database').FeeLineDocument;
	columns: any;
}

const FeeLine = ({ fee, columns }: Props) => {
	return (
		<Table.Body.Row rowData={fee} columns={columns}>
			{({ getCellProps }: { getCellProps: GetCellPropsFunction }) => {
				const { cellData, column } = getCellProps();
				return (
					<Table.Body.Row.Cell {...getCellProps()}>
						{((): React.ReactElement | null => {
							switch (column.key) {
								case 'quantity':
									return <></>;
								case 'price':
									return <Price item={fee} />;
								case 'totalTax':
									return <Tax item={fee} />;
								case 'actions':
									return <Actions item={fee} />;
								default:
									return null;
							}
						})()}
					</Table.Body.Row.Cell>
				);
			}}
		</Table.Body.Row>
	);
};

export default FeeLine;
