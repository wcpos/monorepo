import * as React from 'react';
import get from 'lodash/get';
import Table from '@wcpos/common/src/components/table3';
import Text from '@wcpos/common/src/components/text';
import Price from './cells/fee-and-shipping-price';
import Quantity from './cells/quantity';
import Total from './cells/total';
import Tax from './cells/tax';
import Actions from './cells/actions';

type ShippingLineDocument = import('@wcpos/common/src/database').ShippingLineDocument;
type ColumnProps = import('@wcpos/common/src/components/table/types').ColumnProps;

interface Props {
	// order: import('@wcpos/common/src/database').OrderDocument;
	shipping: ShippingLineDocument;
	columns: any;
}

const cells = {
	actions: Actions,
	price: Price,
	quantity: Quantity,
	subtotal: Total,
	subtotalTax: Tax,
	total: Total,
	totalTax: Tax,
};

const ShippingLine = ({ shipping, columns }: Props) => {
	const cellRenderer = React.useCallback((item: ShippingLineDocument, column: ColumnProps) => {
		const Cell = get(cells, column.key);
		return Cell ? <Cell item={item} column={column} /> : null;
	}, []);

	return (
		<Table.Row<ShippingLineDocument>
			item={shipping}
			columns={columns}
			cellRenderer={cellRenderer}
		/>
	);
};

export default ShippingLine;
