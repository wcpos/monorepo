import * as React from 'react';

import get from 'lodash/get';

import { ErrorBoundary } from '@wcpos/components/error-boundary';
import { Suspense } from '@wcpos/components/suspense';
import { TableRow } from '@wcpos/components/table';
import { Text } from '@wcpos/components/text';

import { Actions } from '../cells/actions';
import { FeeAndShippingTotal } from '../cells/fee-and-shipping-total';
import { FeeName } from '../cells/fee-name';
import { FeePrice } from '../cells/fee-price';

type FeeLine = NonNullable<import('@wcpos/database').OrderDocument['fee_lines']>[number];

interface CellRendererProps {
	item: FeeLine;
	column: { key: string };
	index: number;
	cellWidth: number;
}

const cells: Record<string, React.ComponentType<any>> = {
	actions: Actions,
	name: FeeName,
	price: FeePrice,
	subtotal: () => null,
	total: FeeAndShippingTotal,
};

interface FeeLineRowProps {
	uuid: string;
	item: FeeLine;
	index: number;
	target?: string;
}

/**
 *
 */
export const FeeLineRow = ({ uuid, item, index, target }: FeeLineRowProps) => {
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
								type="fee_lines"
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
