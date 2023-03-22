import * as React from 'react';

import { orderBy } from '@shelf/fast-natural-order-by';
import isEqual from 'lodash/isEqual';
import { ObservableResource } from 'observable-hooks';
import { switchMap, map, tap, distinctUntilChanged } from 'rxjs/operators';

import log from '@wcpos/utils/src/logger';

import useLocalData from '../../../../contexts/local-data';
import useOrderReplication from '../use-order-replication';
import useQuery, { QueryObservable, QueryState, SetQuery } from '../use-query';

type OrderDocument = import('@wcpos/database/src/collections/orders').OrderDocument;

export const OrdersContext = React.createContext<{
	query$: QueryObservable;
	setQuery: SetQuery;
	resource: ObservableResource<OrderDocument[]>;
	sync: () => void;
	clear: () => Promise<any>;
}>(null);

interface OrdersProviderProps {
	children: React.ReactNode;
	initialQuery: QueryState;
	uiSettings: import('../ui-settings').UISettingsDocument;
}

const OrdersProvider = ({ children, initialQuery, uiSettings }: OrdersProviderProps) => {
	log.debug('render order provider');
	const { storeDB } = useLocalData();
	const collection = storeDB.collections.orders;
	const { query$, setQuery } = useQuery(initialQuery);
	const { replicationState } = useOrderReplication({ params: initialQuery });

	/**
	 * Only run the replication when the Provider is mounted
	 */
	React.useEffect(() => {
		replicationState.start();
		return () => {
			// this is async, should we wait?
			replicationState.cancel();
		};
	}, []);

	/**
	 *
	 */
	const value = React.useMemo(() => {
		const resource$ = query$.pipe(
			switchMap((query) => {
				const { search, selector = {}, sortBy, sortDirection } = query;

				const RxQuery = collection.find({ selector });

				return RxQuery.$.pipe(
					distinctUntilChanged((prev, next) => {
						// only emit when the uuids change
						return isEqual(
							prev.map((doc) => doc.uuid),
							next.map((doc) => doc.uuid)
						);
					}),
					map((result) => {
						return orderBy(result, [sortBy], [sortDirection]);
					})
				);
			})
		);

		return {
			resource: new ObservableResource(resource$),
		};
	}, [collection, query$]);

	return (
		<OrdersContext.Provider value={{ ...value, query$, setQuery }}>
			{children}
		</OrdersContext.Provider>
	);
};

export default OrdersProvider;
