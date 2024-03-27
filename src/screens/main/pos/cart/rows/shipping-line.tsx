import * as React from 'react';

import get from 'lodash/get';
import { useObservable, useSubscription } from 'observable-hooks';
import { combineLatest } from 'rxjs';
import { debounceTime, distinctUntilChanged, map } from 'rxjs/operators';

import ErrorBoundary from '@wcpos/components/src/error-boundary';
import Suspense from '@wcpos/components/src/suspense';
import Table, { CellRenderer, TableProps } from '@wcpos/components/src/table';
import Text from '@wcpos/components/src/text';

import { Actions } from '../cells/actions';
import { ShippingTitle } from '../cells/shipping-title';
import { ShippingTotal } from '../cells/shipping-total';

type ShippingLineDocument = import('@wcpos/database').ShippingLineDocument;
type RenderItem = TableProps<ShippingLineDocument>['renderItem'];

const cells = {
	actions: Actions,
	name: ShippingTitle,
	price: () => null,
	subtotal: () => null,
	total: ShippingTotal,
};

/**
 *
 */
export const ShippingLineRow = ({ id, item, index, target }) => {
	/**
	 *
	 */
	const cellRenderer = React.useCallback<CellRenderer<ShippingLineDocument>>(
		({ item, column, index, cellWidth }) => {
			const Cell = get(cells, column.key);

			if (Cell) {
				return (
					<ErrorBoundary>
						<Suspense>
							<Cell uuid={id} item={item} column={column} index={index} cellWidth={cellWidth} />
						</Suspense>
					</ErrorBoundary>
				);
			}

			if (item[column.key]) {
				return <Text>{String(item[column.key])}</Text>;
			}

			return null;
		},
		[id]
	);

	return <Table.Row item={item} index={index} target={target} cellRenderer={cellRenderer} />;
};
