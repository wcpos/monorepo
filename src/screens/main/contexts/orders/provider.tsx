import * as React from 'react';

import { orderBy } from '@shelf/fast-natural-order-by';
import isEqual from 'lodash/isEqual';
import { ObservableResource, useObservableState, useObservableRef } from 'observable-hooks';
import { from, combineLatest, merge, of } from 'rxjs';
import {
	switchMap,
	map,
	distinctUntilChanged,
	filter,
	first,
	expand,
	catchError,
	tap,
	debounceTime,
	skip,
	take,
} from 'rxjs/operators';

import { createTemporaryDB } from '@wcpos/database';
import log from '@wcpos/utils/src/logger';

import useLocalData from '../../../../contexts/local-data';
import useCollection from '../../hooks/use-collection';
import useQuery, { QueryObservable, QueryState, SetQuery } from '../use-query';
import useReplicationState from '../use-replication-state';

type OrderDocument = import('@wcpos/database/src/collections/orders').OrderDocument;

export const OrdersContext = React.createContext<{
	query$: QueryObservable;
	setQuery: SetQuery;
	resource: ObservableResource<{ data: OrderDocument[]; count: number; hasMore: boolean }>;
	sync: () => void;
	clear: () => Promise<any>;
	replicationState: import('../use-replication-state').ReplicationState;
	newOrderResource: ObservableResource<OrderDocument>;
	loadNextPage: () => void;
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
	const { storeDB } = useLocalData();
	const { collection } = useCollection('orders');
	const { query$, setQuery } = useQuery(initialQuery);
	const replicationState = useReplicationState({ collection, query$, prepareQueryParams });
	const pageNumberRef = React.useRef(1);
	const [loadMoreRef, loadMore$] = useObservableRef(Date.now());

	/**
	 * A observable resource we can suspend in the cart and alway get a new order
	 * Emits a new order when the current one is deleted
	 */
	const newOrderResource = React.useMemo(() => {
		async function getOrCreateNewOrder() {
			const db = await createTemporaryDB();
			let order = await db.orders.findOne().exec();
			if (!order) {
				order = await db.orders.insert({ status: 'pos-open' });
			}
			return order;
		}

		// get the new order
		const resource$ = from(getOrCreateNewOrder()).pipe(
			expand((order) =>
				order.deleted$.pipe(
					filter((deleted) => deleted),
					switchMap(() => from(getOrCreateNewOrder())),
					first()
				)
			)
		);

		return new ObservableResource(resource$);
	}, []);

	/**
	 *
	 */
	const resource = React.useMemo(() => {
		const resource$ = query$.pipe(
			// reset the page number when the query changes
			tap(() => {
				pageNumberRef.current = 1;
			}),
			//
			switchMap((query) => {
				const { search } = query;

				if (search) {
					// Return a new observable that emits searchIds
					return collection.search$(search).pipe(
						map(({ hits }) => hits.map((obj) => obj.id)),
						// Combine the searchIds with the original query
						map((searchIds) => ({ ...query, searchIds }))
					);
				}

				// If there is no search value, return an observable of the original query with an empty array for searchIds
				return of({ ...query, searchIds: [] });
			}),
			//
			switchMap(({ searchIds, search, selector: querySelector, sortBy, sortDirection }) => {
				const selector = { $and: [] };

				if (search) {
					selector.$and.push({
						uuid: {
							$in: searchIds,
						},
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

		/**
		 *
		 */
		const debouncedLoadMore$ = merge(
			loadMore$.pipe(take(1)),
			loadMore$.pipe(skip(1), debounceTime(250))
		);

		/**
		 *
		 */
		const paginatedResource$ = combineLatest([resource$, debouncedLoadMore$]).pipe(
			map(([docs, trigger]) => {
				const count = docs.length;
				const pageSize = 10;
				const page = pageNumberRef.current;
				const result = {
					data: docs.slice(0, page * pageSize),
					count,
					hasMore: count > page * pageSize,
				};
				pageNumberRef.current += 1;
				return result;
			})
		);

		return new ObservableResource(paginatedResource$);
	}, [collection, loadMore$, query$]);

	/**
	 *
	 */
	const clear = React.useCallback(async () => {
		// we need to cancel any replications before clearing the collections
		replicationState.cancel();
		await storeDB.reset(['orders', 'line_items', 'fee_lines', 'shipping_lines']);
	}, [replicationState, storeDB]);

	/**
	 *
	 */
	const sync = React.useCallback(() => {
		replicationState.reSync();
	}, [replicationState]);

	/**
	 *
	 */
	const loadNextPage = React.useCallback(() => {
		loadMoreRef.current = Date.now();
	}, [loadMoreRef]);

	/**
	 *
	 */
	return (
		<OrdersContext.Provider
			value={{
				resource,
				query$,
				setQuery,
				replicationState,
				newOrderResource,
				clear,
				sync,
				loadNextPage,
			}}
		>
			{children}
		</OrdersContext.Provider>
	);
};

export default OrdersProvider;
