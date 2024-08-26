import * as React from 'react';

import get from 'lodash/get';

import { ErrorBoundary } from '@wcpos/components/src/error-boundary';
import { Suspense } from '@wcpos/components/src/suspense';
import Table, { CellRenderer, TableProps } from '@wcpos/components/src/table';
import { Text } from '@wcpos/components/src/text';

import { Actions } from '../cells/actions';
import { FeeAndShippingTotal } from '../cells/fee-and-shipping-total';
import { FeeName } from '../cells/fee-name';
import { FeePrice } from '../cells/fee-price';

type FeeLine = import('@wcpos/database').OrderDocument['fee_lines'][number];
type RenderItem = TableProps<FeeLine>['renderItem'];

const cells = {
	actions: Actions,
	name: FeeName,
	price: FeePrice,
	subtotal: () => null,
	total: FeeAndShippingTotal,
};

/**
 *
 */
export const FeeLineRow = ({ uuid, item, index, target }) => {
	/**
	 *
	 */
	const cellRenderer = React.useCallback<CellRenderer<FeeLine>>(
		({ item, column, index, cellWidth }) => {
			const Cell = get(cells, column.key);

			if (Cell) {
				return (
					<ErrorBoundary>
						<Suspense>
							<Cell
								type="fee_lines"
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
