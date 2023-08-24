import * as React from 'react';

import get from 'lodash/get';
import { useObservable, useSubscription } from 'observable-hooks';
import { combineLatest } from 'rxjs';
import { debounceTime, distinctUntilChanged, map } from 'rxjs/operators';

import ErrorBoundary from '@wcpos/components/src/error-boundary';
import Suspense from '@wcpos/components/src/suspense';
import Table, { CellRenderer, TableProps } from '@wcpos/components/src/table';
import Text from '@wcpos/components/src/text';

import { useShippingTaxCalculation } from './use-shipping-tax-calculation';
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
 * When rxdb properties are updated, they emit for each, eg: total and subtotal
 * This triggers unnecessary calculations, so we debounce the updates
 */
const DEBOUNCE_TIME_MS = 10;

/**
 *
 */
export const ShippingLineRow: RenderItem = ({ item, index, target }) => {
	const { calculateShippingLineTaxes } = useShippingTaxCalculation(item);

	const shippingLine$ = useObservable(
		() =>
			combineLatest([item.total$]).pipe(
				map(([total]) => ({ total })),
				distinctUntilChanged((prev, next) => JSON.stringify(prev) === JSON.stringify(next)),
				debounceTime(DEBOUNCE_TIME_MS)
			),
		[]
	);

	useSubscription(shippingLine$, calculateShippingLineTaxes);

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
							<Cell item={item} column={column} index={index} cellWidth={cellWidth} />
						</Suspense>
					</ErrorBoundary>
				);
			}

			if (item[column.key]) {
				return <Text>{String(item[column.key])}</Text>;
			}

			return null;
		},
		[]
	);

	return <Table.Row item={item} index={index} target={target} cellRenderer={cellRenderer} />;
};
