import * as React from 'react';
import { ObservableResource, useObservableState } from 'observable-hooks';
import { switchMap, map, debounceTime, tap } from 'rxjs/operators';
import useStore from '@wcpos/hooks/src/use-store';
import _set from 'lodash/set';
import _get from 'lodash/get';
import _isEmpty from 'lodash/isEmpty';
import { orderBy } from '@shelf/fast-natural-order-by';
import useQuery, { QueryObservable, QueryState, SetQuery } from '../use-query';

type OrderDocument = import('@wcpos/database/src/collections/orders').OrderDocument;

export const OrdersContext = React.createContext<{
	query$: QueryObservable;
	setQuery: SetQuery;
	resource: ObservableResource<OrderDocument[]>;
	sync: () => void;
}>(null);

interface OrdersProviderProps {
	children: React.ReactNode;
	initialQuery: QueryState;
	ui?: import('@wcpos/hooks/src/use-store').UIDocument;
}

const OrdersProvider = ({ children, initialQuery, ui }: OrdersProviderProps) => {
	console.log('render order provider');
	const { storeDB } = useStore();
	const collection = storeDB.collections.orders;
	const { query$, setQuery } = useQuery(initialQuery);

	/**
	 *
	 */
	const sync = React.useCallback(() => {}, []);

	/**
	 *
	 */
	const value = React.useMemo(() => {
		const orders$ = query$.pipe(
			// debounce hits to the local db
			debounceTime(100),
			// switchMap to the collection query
			switchMap((q) => {
				const selector = {};

				// search
				// _set(selector, ['number', '$regex'], new RegExp(escape(_get(q, 'search', '')), 'i'));

				if (_get(q, 'filters.status')) {
					_set(selector, ['status'], _get(q, 'filters.status'));
				}

				const RxQuery = collection.find({ selector });

				return RxQuery.$.pipe(
					// sort the results
					map((result) => {
						return orderBy(result, [q.sortBy], [q.sortDirection]);
					}),
					tap((res) => {
						console.log(res);
					})
				);
			})
		);

		return {
			query$,
			setQuery,
			resource: new ObservableResource(orders$),
			sync,
		};
	}, [collection, query$, setQuery, sync]);

	return <OrdersContext.Provider value={value}>{children}</OrdersContext.Provider>;
};

export default OrdersProvider;
