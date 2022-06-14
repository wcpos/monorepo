import * as React from 'react';
import get from 'lodash/get';
import Table from '@wcpos/components/src/table';
import Price from './cells/fee-and-shipping-price';
import Total from './cells/total';
import Tax from './cells/tax';
import Actions from './cells/actions';
import FeeName from './cells/fee-name';

type FeeLineDocument = import('@wcpos/database').FeeLineDocument;
type ColumnProps = import('@wcpos/components/src/table/types').ColumnProps;

interface Props {
	fee: FeeLineDocument;
	columns: any;
	itemIndex: number;
}

const cells = {
	actions: Actions,
	price: Price,
	total: Total,
	total_tax: Tax,
	name: FeeName,
};

const FeeLine = ({ fee, columns, itemIndex }: Props) => {
	const cellRenderer = React.useCallback((item: FeeLineDocument, column: ColumnProps) => {
		const Cell = get(cells, column.key);
		// if (column.key === 'quantity') {
		// 	return null;
		// }
		return Cell ? <Cell item={item} column={column} /> : null;
	}, []);

	return (
		<Table.Row<FeeLineDocument>
			item={fee}
			columns={columns}
			cellRenderer={cellRenderer}
			itemIndex={itemIndex}
		/>
	);
};

export default FeeLine;
