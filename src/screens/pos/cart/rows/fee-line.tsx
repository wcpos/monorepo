import * as React from 'react';
import get from 'lodash/get';
import Table from '@wcpos/common/src/components/table3';
import Price from './cells/fee-and-shipping-price';
import Quantity from './cells/quantity';
import Total from './cells/total';
import Tax from './cells/tax';
import Actions from './cells/actions';

type FeeLineDocument = import('@wcpos/common/src/database').FeeLineDocument;
type ColumnProps = import('@wcpos/common/src/components/table/types').ColumnProps;

interface Props {
	fee: FeeLineDocument;
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

const FeeLine = ({ fee, columns }: Props) => {
	const cellRenderer = React.useCallback((item: FeeLineDocument, column: ColumnProps) => {
		const Cell = get(cells, column.key);
		return Cell ? <Cell item={item} column={column} /> : null;
	}, []);

	return <Table.Row<FeeLineDocument> item={fee} columns={columns} cellRenderer={cellRenderer} />;
};

export default FeeLine;
