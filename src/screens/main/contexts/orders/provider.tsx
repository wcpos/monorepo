import * as React from 'react';

import { orderBy } from '@shelf/fast-natural-order-by';
import { ObservableResource } from 'observable-hooks';
import { switchMap, map } from 'rxjs/operators';

import log from '@wcpos/utils/src/logger';

import useOrderReplication from './use-order-replication';
import useLocalData from '../../../../contexts/local-data';
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
	const { replicationState, clear, sync } = useOrderReplication(query$);

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
				const { search, selector: querySelector, sortBy, sortDirection, limit, skip } = query;
				let selector;

				const searchSelector = search
					? {
							$or: [
								{ id: { $regex: new RegExp(escape(search), 'i') } },
								{ number: { $regex: new RegExp(escape(search), 'i') } },
							],
					  }
					: null;

				if (querySelector && searchSelector) {
					selector = {
						$and: [querySelector, searchSelector],
					};
				} else {
					selector = querySelector || searchSelector || {};
				}

				const RxQuery = collection.find({ selector });

				return RxQuery.$.pipe(
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
		<OrdersContext.Provider value={{ ...value, query$, setQuery, replicationState, clear, sync }}>
			{children}
		</OrdersContext.Provider>
	);
};

export default OrdersProvider;
