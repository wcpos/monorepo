import * as React from 'react';
import { BehaviorSubject, combineLatest, of } from 'rxjs';
import { tap, switchMap, map, debounceTime } from 'rxjs/operators';
import { ObservableResource } from 'observable-hooks';
import useStore from '@wcpos/hooks/src/use-store';
import useOnlineStatus from '@wcpos/hooks/src/use-online-status';
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

const replicationMap = new Map();

const OrdersProvider = ({ children, initialQuery }: OrdersProviderProps) => {
	const query$ = React.useMemo(() => new BehaviorSubject(initialQuery), [initialQuery]);
	const { storeDB } = useStore();
	const collection = storeDB.collections.orders;
	const http = useRestHttpClient();
	const { isConnected } = useOnlineStatus();

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
	 *
	 */
	React.useEffect(() => {
		if (!isConnected) {
			replicationMap.forEach((replicationState) => {
				replicationState.then((result) => {
					result.cancel();
				});
			});
		}
	}, [isConnected]);

	/**
	 * Start replication
	 * - audit id (checks for deleted or new ids on server)
	 * - replication (syncs all data and checks for modified data)
	 */
	React.useEffect(() => {
		if (!replicationMap.get('audit')) {
			replicationMap.set('audit', getAuditIdReplicationState(http, collection));
		}

		if (!replicationMap.get('sync')) {
			replicationMap.set('sync', getReplicationState(http, collection));
		}

		return function cleanUp() {
			replicationMap.forEach((replicationState) => {
				replicationState.then((result) => {
					result.cancel();
				});
			});
		};
	}, [collection, http]);

	/**
	 *
	 */
	const sync = React.useCallback(() => {
		const audit = replicationMap.get('audit');

		if (audit) {
			audit.then((result) => {
				result.run();
			});
		}
	}, []);

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
				}),
				tap((res) => {
					console.log(res);
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
			sync,
		}),
		[query$, resource, setQuery, sync]
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
		sync,
	});

	return <OrdersContext.Provider value={value}>{children}</OrdersContext.Provider>;
};

export default OrdersProvider;
