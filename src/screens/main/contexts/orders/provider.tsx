import * as React from 'react';

import { orderBy } from '@shelf/fast-natural-order-by';
import _get from 'lodash/get';
import isEqual from 'lodash/isEqual';
import _set from 'lodash/set';
import { ObservableResource } from 'observable-hooks';
import { switchMap, map, debounceTime, tap, distinctUntilChanged } from 'rxjs/operators';

import log from '@wcpos/utils/src/logger';

import { useReplication } from './use-replication';
import useStore from '../../../../contexts/store';
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
	ui?: import('../ui').UIDocument;
}

const OrdersProvider = ({ children, initialQuery, ui }: OrdersProviderProps) => {
	log.debug('render order provider');
	const { storeDB } = useStore();
	const collection = storeDB.collections.orders;
	const { query$, setQuery } = useQuery(initialQuery);
	const replicationState = useReplication({ collection });

	/**
	 * Only run the replication when the Provider is mounted
	 */
	React.useEffect(() => {
		replicationState.start();
		return () => {
			// this is async, should we wait?
			replicationState.cancel();
		};
	}, [replicationState]);

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

				if (_get(q, 'filters._id')) {
					_set(selector, ['_id'], _get(q, 'filters._id'));
				}

				/**
				 * @TODO - hack for find by uuid
				 */
				if (_get(q, 'filters.uuid')) {
					return collection.findOneFix(q.filters.uuid).$;
				}

				const RxQuery = collection.find({ selector });

				return RxQuery.$.pipe(
					// query will update for any change to orders, eg: totals
					distinctUntilChanged((prev, curr) => {
						return isEqual(
							prev.map((doc) => doc._id),
							curr.map((doc) => doc._id)
						);
					}),
					// sort the results
					map((result) => {
						return orderBy(result, [q.sortBy], [q.sortDirection]);
					}),
					tap((res) => {
						log.silly(res);
					})
				);
			})
		);

		return {
			query$,
			setQuery,
			resource: new ObservableResource(orders$),
			replicationState,
		};
	}, [collection, query$, setQuery, replicationState]);

	return <OrdersContext.Provider value={value}>{children}</OrdersContext.Provider>;
};

export default OrdersProvider;
