import * as React from 'react';

import find from 'lodash/find';
import get from 'lodash/get';
import uniq from 'lodash/uniq';
import { useObservable, useSubscription } from 'observable-hooks';
import { combineLatest } from 'rxjs';
import { debounceTime, distinctUntilChanged, map, tap } from 'rxjs/operators';

import ErrorBoundary from '@wcpos/components/src/error-boundary';
import Suspense from '@wcpos/components/src/suspense';
import Table, { CellRenderer, TableProps } from '@wcpos/components/src/table';
import Text from '@wcpos/components/src/text';

import { useTaxCalculation } from './use-tax-calculation';
import { useTaxHelpers } from '../../../contexts/tax-helpers';
import { Actions } from '../cells/actions';
import { Price } from '../cells/price';
import { ProductName } from '../cells/product-name';
import { ProductTotal } from '../cells/product-total';
import { Quantity } from '../cells/quantity';
import { Subtotal } from '../cells/subtotal';

type LineItemDocument = import('@wcpos/database').LineItemDocument;
type RenderItem = TableProps<LineItemDocument>['renderItem'];

const cells = {
	actions: Actions,
	name: ProductName,
	price: Price,
	quantity: Quantity,
	subtotal: Subtotal,
	total: ProductTotal,
};

/**
 * When rxdb properties are updated, they emit for each, eg: total and subtotal
 * This triggers unnecessary calculations, so we debounce the updates
 */
const DEBOUNCE_TIME_MS = 10;

/**
 *
 */
export const LineItemRow: RenderItem = ({ item, index, target }) => {
	const { calculateLineItemTaxes } = useTaxCalculation(item);

	const lineItem$ = useObservable(
		() =>
			combineLatest([item.subtotal$, item.total$, item.tax_class$, item.meta_data$]).pipe(
				map(([subtotal, total, taxClass, metaData = []]) => ({
					subtotal,
					total,
					taxClass,
					metaData,
				})),
				distinctUntilChanged((prev, next) => JSON.stringify(prev) === JSON.stringify(next)),
				debounceTime(DEBOUNCE_TIME_MS)
			),
		[calculateLineItemTaxes]
	);

	/**
	 * Calculate taxes
	 */
	useSubscription(lineItem$, calculateLineItemTaxes);

	/**
	 *
	 */
	const cellRenderer = React.useCallback<CellRenderer<LineItemDocument>>(
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
