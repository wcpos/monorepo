import * as React from 'react';

import get from 'lodash/get';

import { ErrorBoundary } from '@wcpos/components/src/error-boundary';
import { Suspense } from '@wcpos/components/src/suspense';
import Table, { CellRenderer, TableProps } from '@wcpos/components/src/table';
import { Text } from '@wcpos/components/src/text';

import { Actions } from '../cells/actions';
import { Price } from '../cells/price';
import { ProductName } from '../cells/product-name';
import { ProductTotal } from '../cells/product-total';
import { Quantity } from '../cells/quantity';
import { RegularPrice } from '../cells/regular_price';
import { Subtotal } from '../cells/subtotal';

type LineItem = import('@wcpos/database').OrderDocument['line_items'][number];
type RenderItem = TableProps<LineItem>['renderItem'];

const cells = {
	actions: Actions,
	name: ProductName,
	price: Price,
	regular_price: RegularPrice,
	quantity: Quantity,
	subtotal: Subtotal,
	total: ProductTotal,
};

/**
 *
 */
export const LineItemRow = ({ index, uuid, item }) => {
	/**
	 *
	 */
	const cellRenderer = React.useCallback<CellRenderer<LineItem>>(
		({ item, column, index, cellWidth }) => {
			const Cell = get(cells, column.key);

			if (Cell) {
				return (
					<ErrorBoundary>
						<Suspense>
							<Cell
								type="line_items"
								uuid={uuid}
								item={item}
								column={column}
								index={index}
								cellWidth={cellWidth}
							/>
						</Suspense>
					</ErrorBoundary>
				);
			}

			if (item[column.key]) {
				return <Text>{String(item[column.key])}</Text>;
			}

			return null;
		},
		[uuid]
	);

	return <Table.Row item={item} index={index} cellRenderer={cellRenderer} />;
};
