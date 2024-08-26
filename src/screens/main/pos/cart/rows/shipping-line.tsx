import * as React from 'react';

import get from 'lodash/get';

import { ErrorBoundary } from '@wcpos/components/src/error-boundary';
import { Suspense } from '@wcpos/components/src/suspense';
import Table, { CellRenderer, TableProps } from '@wcpos/components/src/table';
import { Text } from '@wcpos/components/src/text';

import { Actions } from '../cells/actions';
import { FeeAndShippingTotal } from '../cells/fee-and-shipping-total';
import { ShippingPrice } from '../cells/shipping-price';
import { ShippingTitle } from '../cells/shipping-title';

type ShippingLine = import('@wcpos/database').OrderDocument['shipping_lines'][number];
type RenderItem = TableProps<ShippingLine>['renderItem'];

const cells = {
	actions: Actions,
	name: ShippingTitle,
	price: ShippingPrice,
	subtotal: () => null,
	total: FeeAndShippingTotal,
};

/**
 *
 */
export const ShippingLineRow = ({ uuid, item, index, target }) => {
	/**
	 *
	 */
	const cellRenderer = React.useCallback<CellRenderer<ShippingLine>>(
		({ item, column, index, cellWidth }) => {
			const Cell = get(cells, column.key);

			if (Cell) {
				return (
					<ErrorBoundary>
						<Suspense>
							<Cell
								type="shipping_lines"
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

	return <Table.Row item={item} index={index} target={target} cellRenderer={cellRenderer} />;
};
