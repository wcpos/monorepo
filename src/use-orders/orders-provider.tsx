import * as React from 'react';
import { BehaviorSubject, combineLatest } from 'rxjs';
import { tap, switchMap, map, debounceTime } from 'rxjs/operators';
import { ObservableResource } from 'observable-hooks';
import useStore from '@wcpos/hooks/src/use-store';
import useWhyDidYouUpdate from '@wcpos/hooks/src/use-why-did-you-update';
import _map from 'lodash/map';
import _set from 'lodash/set';
import _get from 'lodash/get';
import _cloneDeep from 'lodash/cloneDeep';
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

const escape = (text: string) => text.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');

const OrdersProvider = ({ children, initialQuery }: OrdersProviderProps) => {
	const query$ = React.useMemo(() => new BehaviorSubject(initialQuery), [initialQuery]);
	const { storeDB } = useStore();
	const collection = storeDB.collections.orders;
	const http = useRestHttpClient();

	/**
	 *
	 */
	const setQuery = React.useCallback(
		(path, value) => {
			const prev = _cloneDeep(query$.getValue()); // query needs to be immutable
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
				})
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
			collection,
		}),
		[query$, resource, setQuery, collection]
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
