import * as React from 'react';

import { ObservableResource, useObservable } from 'observable-hooks';
import { isRxDocument } from 'rxdb';
import { of } from 'rxjs';
import { switchMap, distinctUntilChanged } from 'rxjs/operators';

import { useNewOrder } from './use-new-order';
import { useCollection } from '../../../hooks/use-collection';

/**
 *
 */
export const useCurrentOrderResource = ({ uuid }: { uuid?: string }) => {
	const { newOrder$ } = useNewOrder();
	const { collection } = useCollection('orders');

	/**
	 * Construct observable which emits order document when orderID changes
	 */
	const currentOrder$ = useObservable(
		(inputs$) =>
			inputs$.pipe(
				switchMap(([uuid]) => {
					if (!uuid) return newOrder$;
					return collection.findOne({ selector: { uuid, status: 'pos-open' } }).$.pipe(
						// make sure we have an order, eg: voiding an order will emit null
						switchMap((order) => (isRxDocument(order) ? of(order) : newOrder$)),
						distinctUntilChanged((prev, next) => prev?.uuid === next?.uuid)
					);
				})
			),
		[uuid]
	);

	/**
	 * Create resource so we can suspend until order is loaded
	 */
	const resource = React.useMemo(() => new ObservableResource(currentOrder$), [currentOrder$]);

	return { resource };
};
