import * as React from 'react';

import get from 'lodash/get';

import { ErrorBoundary } from '@wcpos/components/error-boundary';
import { Suspense } from '@wcpos/components/suspense';
import { TableRow } from '@wcpos/components/table';
import { Text } from '@wcpos/components/text';

import { Actions } from '../cells/actions';
import { Price } from '../cells/price';
import { ProductName } from '../cells/product-name';
import { ProductTotal } from '../cells/product-total';
import { Quantity } from '../cells/quantity';
import { RegularPrice } from '../cells/regular_price';
import { Subtotal } from '../cells/subtotal';

type LineItem = NonNullable<import('@wcpos/database').OrderDocument['line_items']>[number];

interface CellRendererProps {
	item: LineItem;
	column: { key: string };
	index: number;
	cellWidth: number;
}

const cells: Record<string, React.ComponentType<any>> = {
	actions: Actions,
	name: ProductName,
	price: Price,
	regular_price: RegularPrice,
	quantity: Quantity,
	subtotal: Subtotal,
	total: ProductTotal,
};

interface LineItemRowProps {
	index: number;
	uuid: string;
	item: LineItem;
}

/**
 *
 */
export const LineItemRow = ({ index, uuid, item }: LineItemRowProps) => {
	/**
	 *
	 */
	const cellRenderer = React.useCallback(
		({ item, column, index: cellIndex, cellWidth }: CellRendererProps) => {
			const Cell = get(cells, column.key) as React.ComponentType<any> | undefined;

			if (Cell) {
				return (
					<ErrorBoundary>
						<Suspense>
							<Cell
								type="line_items"
								uuid={uuid}
								item={item}
								column={column}
								index={cellIndex}
								cellWidth={cellWidth}
							/>
						</Suspense>
					</ErrorBoundary>
				);
			}

			const value = (item as Record<string, unknown>)[column.key];
			if (value) {
				return <Text>{String(value)}</Text>;
			}

			return null;
		},
		[uuid]
	);

	return <TableRow index={index}>{null}</TableRow>;
};
