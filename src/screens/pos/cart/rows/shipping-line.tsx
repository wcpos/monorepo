import * as React from 'react';
import get from 'lodash/get';
import Table from '@wcpos/components/src/table';
import Text from '@wcpos/components/src/text';
import Price from './cells/fee-and-shipping-price';
import Total from './cells/total';
import Tax from './cells/tax';
import Actions from './cells/actions';
import ShippingTitle from './cells/shipping-title';

type ShippingLineDocument = import('@wcpos/database').ShippingLineDocument;
type ColumnProps = import('@wcpos/components/src/table/types').ColumnProps;

interface Props {
	// order: import('@wcpos/database').OrderDocument;
	shipping: ShippingLineDocument;
	columns: any;
	itemIndex: number;
}

const cells = {
	actions: Actions,
	price: Price,
	total: Total,
	total_tax: Tax,
	name: ShippingTitle,
};

const ShippingLine = ({ shipping, columns, itemIndex }: Props) => {
	const cellRenderer = React.useCallback((item: ShippingLineDocument, column: ColumnProps) => {
		const Cell = get(cells, column.key);
		// if (column.key === 'quantity') {
		// 	return null;
		// }
		return Cell ? <Cell item={item} column={column} /> : null;
	}, []);

	return (
		<Table.Row<ShippingLineDocument>
			item={shipping}
			columns={columns}
			cellRenderer={cellRenderer}
			itemIndex={itemIndex}
		/>
	);
};

export default ShippingLine;
