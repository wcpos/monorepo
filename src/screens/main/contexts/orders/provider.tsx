import * as React from 'react';

import { orderBy } from '@shelf/fast-natural-order-by';
import { ObservableResource } from 'observable-hooks';
import { switchMap, map } from 'rxjs/operators';

import log from '@wcpos/utils/src/logger';

import useLocalData from '../../../../contexts/local-data';
import clearCollection from '../clear-collection';
import syncCollection from '../sync-collection';
import useQuery, { QueryObservable, QueryState, SetQuery } from '../use-query';
import useReplicationState from '../use-replication-state';

type OrderDocument = import('@wcpos/database/src/collections/orders').OrderDocument;

export const OrdersContext = React.createContext<{
	query$: QueryObservable;
	setQuery: SetQuery;
	resource: ObservableResource<OrderDocument[]>;
	sync: () => void;
	clear: () => Promise<any>;
	replicationState: import('../use-replication-state').ReplicationState;
}>(null);

interface OrdersProviderProps {
	children: React.ReactNode;
	initialQuery: QueryState;
	uiSettings: import('../ui-settings').UISettingsDocument;
}

interface APIQueryParams {
	context?: 'view' | 'edit';
	page?: number;
	per_page?: number;
	search?: string;
	after?: string;
	before?: string;
	modified_after?: string;
	modified_before?: string;
	dates_are_gmt?: boolean;
	exclude?: number[];
	include?: number[];
	offset?: number;
	order?: 'asc' | 'desc';
	orderby?: 'date' | 'id' | 'include' | 'title' | 'slug';
	parent?: number[];
	parent_exclude?: number[];
	status?:
		| 'any'
		| 'pending'
		| 'processing'
		| 'on-hold'
		| 'completed'
		| 'cancelled'
		| 'refunded'
		| 'failed'
		| 'trash';
	customer?: number;
	product?: number;
	dp?: number;
}

/**
 *
 */
const prepareQueryParams = (
	params: APIQueryParams,
	query: QueryState,
	checkpoint,
	batchSize
): APIQueryParams => {
	let orderby = params.orderby;

	if (query.sortBy === 'date_modified_gmt') {
		orderby = 'date';
	}

	if (query.sortBy === 'number') {
		orderby = 'id';
	}

	return {
		...params,
		orderby,
	};
};

/**
 *
 */
const OrdersProvider = ({ children, initialQuery, uiSettings }: OrdersProviderProps) => {
	log.debug('render order provider');
	const { storeDB, store } = useLocalData();
	const collection = storeDB.collections.orders;
	const { query$, setQuery } = useQuery(initialQuery);
	const replicationState = useReplicationState({ collection, query$, prepareQueryParams });

	/**
	 *
	 */
	const resource = React.useMemo(() => {
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

		return new ObservableResource(resource$);
	}, [collection, query$]);

	return (
		<OrdersContext.Provider
			value={{
				resource,
				query$,
				setQuery,
				clear: () => clearCollection(store.localID, collection),
				sync: () => syncCollection(replicationState),
				replicationState,
			}}
		>
			{children}
		</OrdersContext.Provider>
	);
};

export default OrdersProvider;
