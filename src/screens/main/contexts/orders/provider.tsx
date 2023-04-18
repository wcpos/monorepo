import * as React from 'react';

import { orderBy } from '@shelf/fast-natural-order-by';
import isEqual from 'lodash/isEqual';
import { ObservableResource } from 'observable-hooks';
import { switchMap, map, distinctUntilChanged } from 'rxjs/operators';

import log from '@wcpos/utils/src/logger';

import useLocalData from '../../../../contexts/local-data';
import useCollection from '../../hooks/use-collection';
import { clearCollections } from '../clear-collection';
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
	status,
	batchSize
): APIQueryParams => {
	let orderby = params.orderby;

	if (query.sortBy === 'date_created' || query.sortBy === 'date_created_gmt') {
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
	const { store } = useLocalData();
	const collection = useCollection('orders');
	const lineItemsCollection = useCollection('line_items');
	const feeLinesCollection = useCollection('fee_lines');
	const shippingLinesCollection = useCollection('shipping_lines');
	const { query$, setQuery } = useQuery(initialQuery);
	const replicationState = useReplicationState({ collection, query$, prepareQueryParams });

	/**
	 *
	 */
	const resource = React.useMemo(() => {
		const resource$ = query$.pipe(
			switchMap((query) => {
				const { search, selector: querySelector, sortBy, sortDirection, limit, skip } = query;
				const selector = { $and: [] };

				if (search) {
					selector.$and.push({
						$or: [
							{ uuid: search },
							{ id: { $regex: new RegExp(escape(search), 'i') } },
							{ number: { $regex: new RegExp(escape(search), 'i') } },
						],
					});
				}

				if (querySelector) {
					selector.$and.push(querySelector);
				}

				const RxQuery = collection.find({ selector });

				return RxQuery.$.pipe(
					map((result) => {
						return orderBy(result, [sortBy], [sortDirection]);
					}),
					distinctUntilChanged((prev, next) => {
						// only emit when the uuids change
						return isEqual(
							prev.map((doc) => doc.uuid),
							next.map((doc) => doc.uuid)
						);
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
				clear: () =>
					clearCollections(store.localID, [
						collection,
						lineItemsCollection,
						feeLinesCollection,
						shippingLinesCollection,
					]),
				sync: () => syncCollection(replicationState),
				replicationState,
			}}
		>
			{children}
		</OrdersContext.Provider>
	);
};

export default OrdersProvider;
