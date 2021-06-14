import * as React from 'react';
import Table from '@wcpos/common/src/components/table';
import useWhyDidYouUpdate from '@wcpos/common/src/hooks/use-why-did-you-update';
import Quantity from './cells/quantity';
import Price from './cells/price';
import Total from './cells/total';
import Tax from './cells/tax';
import Actions from './cells/actions';

type GetCellPropsFunction = import('@wcpos/common/src/components/table/row').GetCellPropsFunction;

interface Props {
	// order: import('@wcpos/common/src/database').OrderDocument;
	item: import('@wcpos/common/src/database').LineItemDocument;
	columns: any;
}

const LineItem = ({ item, columns }: Props) => {
	useWhyDidYouUpdate('CartLineItem', { item, columns });

	return (
		<Table.Body.Row rowData={item} columns={columns}>
			{({ getCellProps }: { getCellProps: GetCellPropsFunction }) => {
				const { cellData, column } = getCellProps();
				return (
					<Table.Body.Row.Cell {...getCellProps()}>
						{((): React.ReactElement | null => {
							switch (column.key) {
								case 'quantity':
									return <Quantity lineItem={item} />;
								case 'price':
									return <Price lineItem={item} />;
								case 'subtotalTax':
									return <Tax item={item} type="subtotalTax" />;
								case 'subtotal':
									return <Total item={item} type="subtotal" />;
								case 'totalTax':
									return <Tax item={item} />;
								case 'total':
									return <Total item={item} />;
								case 'actions':
									return <Actions item={item} />;
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

export default LineItem;
