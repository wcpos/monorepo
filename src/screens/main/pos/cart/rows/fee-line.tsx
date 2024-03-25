import * as React from 'react';

import get from 'lodash/get';
import { useObservable, useSubscription } from 'observable-hooks';
import { combineLatest } from 'rxjs';
import { debounceTime, distinctUntilChanged, map } from 'rxjs/operators';

import ErrorBoundary from '@wcpos/components/src/error-boundary';
import Suspense from '@wcpos/components/src/suspense';
import Table, { CellRenderer, TableProps } from '@wcpos/components/src/table';
import Text from '@wcpos/components/src/text';

import { useTaxCalculation } from './use-tax-calculation';
import { Actions } from '../cells/actions';
import { FeeName } from '../cells/fee-name';
import { FeeTotal } from '../cells/fee-total';

type FeeLineDocument = import('@wcpos/database').FeeLineDocument;
type RenderItem = TableProps<FeeLineDocument>['renderItem'];

const cells = {
	actions: Actions,
	name: FeeName,
	price: () => null,
	subtotal: () => null,
	total: FeeTotal,
};

/**
 * When rxdb properties are updated, they emit for each, eg: total and subtotal
 * This triggers unnecessary calculations, so we debounce the updates
 */
const DEBOUNCE_TIME_MS = 10;

/**
 *
 */
export const FeeLineRow: RenderItem = ({ item, index, target }) => {
	// const { calculateLineItemTaxes } = useTaxCalculation(item);

	// /**
	//  *
	//  */
	// const feeLine$ = useObservable(() =>
	// 	combineLatest([item.total$, item.tax_class$, item.tax_status$]).pipe(
	// 		map(([total, taxClass, taxStatus]) => ({ total, taxClass, taxStatus })),
	// 		distinctUntilChanged((prev, next) => JSON.stringify(prev) === JSON.stringify(next)),
	// 		debounceTime(DEBOUNCE_TIME_MS)
	// 	)
	// );

	// useSubscription(feeLine$, calculateLineItemTaxes);

	/**
	 *
	 */
	const cellRenderer = React.useCallback<CellRenderer<FeeLineDocument>>(
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
