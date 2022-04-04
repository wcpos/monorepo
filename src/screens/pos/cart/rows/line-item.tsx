import * as React from 'react';
import get from 'lodash/get';
import Table from '@wcpos/common/src/components/table3';
import useWhyDidYouUpdate from '@wcpos/common/src/hooks/use-why-did-you-update';
import Quantity from './cells/quantity';
import Price from './cells/price';
import Total from './cells/total';
import Tax from './cells/tax';
import Actions from './cells/actions';
import Name from './cells/product-name';

type LineItemDocument = import('@wcpos/common/src/database').LineItemDocument;
type ColumnProps = import('@wcpos/common/src/components/table/types').ColumnProps;

interface LineItemProps {
	lineItem: LineItemDocument;
	columns: ColumnProps[];
}

const cells = {
	actions: Actions,
	price: Price,
	quantity: Quantity,
	subtotal: Total,
	subtotal_tax: Tax,
	total: Total,
	total_tax: Tax,
	name: Name,
};

const LineItem = ({ lineItem, columns }: LineItemProps) => {
	useWhyDidYouUpdate('CartLineItem', { lineItem, columns });

	const cellRenderer = React.useCallback((item: LineItemDocument, column: ColumnProps) => {
		const Cell = get(cells, column.key);
		return Cell ? <Cell item={item} column={column} /> : null;
	}, []);

	return (
		<Table.Row<LineItemDocument> item={lineItem} columns={columns} cellRenderer={cellRenderer} />
	);
};

export default LineItem;
