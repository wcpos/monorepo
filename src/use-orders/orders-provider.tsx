import * as React from 'react';
import { BehaviorSubject, combineLatest } from 'rxjs';
import { tap, switchMap, map, debounceTime } from 'rxjs/operators';
import { ObservableResource } from 'observable-hooks';
import useAppState from '@wcpos/hooks/src/use-app-state';
import useWhyDidYouUpdate from '@wcpos/hooks/src/use-why-did-you-update';
import _map from 'lodash/map';
import _set from 'lodash/set';
import _get from 'lodash/get';
import { orderBy } from '@shelf/fast-natural-order-by';
import useRestHttpClient from '../use-rest-http-client';
import { getAuditIdReplicationState } from './id-audit';
import { getReplicationState } from './replication';

type OrderDocument = import('@wcpos/database/src/collections/customers').OrderDocument;
type SortDirection = import('@wcpos/components/src/table/table').SortDirection;

export interface QueryState {
	// search?: Record<string, unknown>;
	search?: string;
	sortBy: string;
	sortDirection: SortDirection;
	filters?: Record<string, unknown>;
}

export const OrdersContext = React.createContext<{
	query$: BehaviorSubject<QueryState>;
	setQuery: (path: string | string[], value: any) => void;
	resource: ObservableResource<OrderDocument[]>;
}>(null);

interface OrdersProviderProps {
	children: React.ReactNode;
	initialQuery: QueryState;
}

const OrdersProvider = ({ children, initialQuery }: OrdersProviderProps) => {
	const query$ = React.useMemo(() => new BehaviorSubject(initialQuery), [initialQuery]);
	const { storeDB } = useAppState();
	const collection = storeDB.collections.orders;
	const http = useRestHttpClient();

	/**
	 *
	 */
	const setQuery = React.useCallback(
		(path, value) => {
			const prev = query$.getValue();
			const next = _set(prev, path, value);
			query$.next(next);
		},
		[query$]
	);

	/**
	 * Start id audit
	 */
	React.useEffect(() => {
		const replicationState = getAuditIdReplicationState(http, collection);

		return function cleanUp() {
			replicationState.then((result) => {
				result.cancel();
			});
		};
	}, [collection, http]);

	/**
	 * Start replication
	 */
	React.useEffect(() => {
		const replicationState = getReplicationState(http, collection);

		return function cleanUp() {
			replicationState.then((result) => {
				result.cancel();
			});
		};
	}, [collection, http]);

	/**
	 *
	 */
	const orders$ = query$.pipe(
		// debounce hits to the local db
		debounceTime(100),
		// switchMap to the collection query
		switchMap((q) => {
			const selector = {};
			// forEach(q.search, function (value, key) {
			// 	if (value) {
			// 		set(selector, [key, '$regex'], new RegExp(escape(value), 'i'));
			// 	}
			// });

			if (_get(q, 'filters.status')) {
				_set(selector, ['status'], _get(q, 'filters.status'));
			}

			const RxQuery = collection.find({ selector });

			return RxQuery.$.pipe(
				// sort the results
				// sort the results
				map((result) => {
					return orderBy(result, [q.sortBy], [q.sortDirection]);
				})
				// @ts-ignore
				// map((result) => {
				// 	const array = Array.isArray(result) ? result : [];
				// 	const productSorter = (product: any) => {
				// 		if (q.sortBy === 'name') {
				// 			// @TODO - this doens't work
				// 			return product[q.sortBy].toLowerCase();
				// 		}
				// 		return product[q.sortBy];
				// 	};
				// 	return orderBy(array, [productSorter], [q.sortDirection]);
				// })
			);
		})
	);

	const resource = React.useMemo(() => new ObservableResource(orders$), [orders$]);

	/**
	 *
	 */
	const value = React.useMemo(
		() => ({
			query$,
			// query: query$.getValue(),
			setQuery,
			resource,
		}),
		[query$, resource, setQuery]
	);

	useWhyDidYouUpdate('OrdersProvider', {
		value,
		query$,
		resource,
		setQuery,
		orders$,
		storeDB,
		collection,
		http,
	});

	return <OrdersContext.Provider value={value}>{children}</OrdersContext.Provider>;
};

export default OrdersProvider;
