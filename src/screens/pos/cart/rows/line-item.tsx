import * as React from 'react';
import { useObservableState } from 'observable-hooks';
import Table from '@wcpos/common/src/components/table';
import Button from '@wcpos/common/src/components/button';
import { useSnackbar } from '@wcpos/common/src/components/snackbar/use-snackbar';
import useWhyDidYouUpdate from '@wcpos/common/src/hooks/use-why-did-you-update';
import Quantity from './cells/quantity';
import Price from './cells/price';
import Total from './cells/total';

type GetCellPropsFunction = import('@wcpos/common/src/components/table/row').GetCellPropsFunction;

interface Props {
	order: import('@wcpos/common/src/database').OrderDocument;
	item: import('@wcpos/common/src/database').LineItemDocument;
	columns: any;
}

const LineItem = ({ order, item, columns }: Props) => {
	useWhyDidYouUpdate('CartLineItem', { order, item, columns });
	const showSnackbar = useSnackbar({ message: 'hi' });

	const onRemove = () => {
		order.removeLineItem(item);
		showSnackbar();
	};

	return (
		<Table.Row rowData={item} columns={columns}>
			{({ getCellProps }: { getCellProps: GetCellPropsFunction }) => {
				const { cellData, column } = getCellProps();
				return (
					<Table.Row.Cell {...getCellProps()}>
						{((): React.ReactElement | null => {
							switch (column.key) {
								case 'quantity':
									return <Quantity lineItem={item} />;
								case 'price':
									return <Price lineItem={item} />;
								case 'total':
									return <Total item={item} />;
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

export default LineItem;
