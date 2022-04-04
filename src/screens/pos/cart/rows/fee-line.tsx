import * as React from 'react';
import get from 'lodash/get';
import Table from '@wcpos/common/src/components/table3';
import Price from './cells/fee-and-shipping-price';
import Total from './cells/total';
import Tax from './cells/tax';
import Actions from './cells/actions';
import FeeName from './cells/fee-name';

type FeeLineDocument = import('@wcpos/common/src/database').FeeLineDocument;
type ColumnProps = import('@wcpos/common/src/components/table/types').ColumnProps;

interface Props {
	fee: FeeLineDocument;
	columns: any;
}

const cells = {
	actions: Actions,
	price: Price,
	total: Total,
	total_tax: Tax,
	name: FeeName,
};

const FeeLine = ({ fee, columns }: Props) => {
	const cellRenderer = React.useCallback((item: FeeLineDocument, column: ColumnProps) => {
		const Cell = get(cells, column.key);
		// if (column.key === 'quantity') {
		// 	return null;
		// }
		return Cell ? <Cell item={item} column={column} /> : null;
	}, []);

	return <Table.Row<FeeLineDocument> item={fee} columns={columns} cellRenderer={cellRenderer} />;
};

export default FeeLine;
