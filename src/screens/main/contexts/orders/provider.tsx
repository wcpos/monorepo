import * as React from 'react';

import { orderBy } from '@shelf/fast-natural-order-by';
import isEqual from 'lodash/isEqual';
import { ObservableResource, useObservable } from 'observable-hooks';
import { combineLatest, from } from 'rxjs';
import { switchMap, map, distinctUntilChanged, tap, withLatestFrom, filter } from 'rxjs/operators';

import { createTemporaryDB } from '@wcpos/database';
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
	appendNewOrder?: boolean;
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
const OrdersProvider = ({
	children,
	initialQuery,
	uiSettings,
	appendNewOrder = false,
}: OrdersProviderProps) => {
	const { store } = useLocalData();
	const collection = useCollection('orders');
	const lineItemsCollection = useCollection('line_items');
	const feeLinesCollection = useCollection('fee_lines');
	const shippingLinesCollection = useCollection('shipping_lines');
	const { query$, setQuery } = useQuery(initialQuery);
	const replicationState = useReplicationState({ collection, query$, prepareQueryParams });

	/**
	 * TODO - need a way to update newOrder on settings change, without emitting new value
	 */
	const newOrder$ = React.useMemo(
		() =>
			combineLatest([from(createTemporaryDB()), store?.currency$, store?.prices_include_tax$]).pipe(
				switchMap(([db, currency, prices_include_tax]) =>
					db.orders.findOne().$.pipe(
						tap((newOrder) => {
							if (!newOrder) {
								db.orders.insert({
									status: 'pos-open',
									currency,
									prices_include_tax,
								});
							}
						})
					)
				),
				filter((newOrder) => !!newOrder)
			),
		[store]
	);

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

				return combineLatest([RxQuery.$, newOrder$]).pipe(
					map(([result, newOrder]) => {
						const sortedResult = orderBy(result, [sortBy], [sortDirection]);

						// Prepend newOrder if appendNewOrder flag is true
						if (appendNewOrder) {
							return [...sortedResult, newOrder];
						} else {
							return sortedResult;
						}
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
	}, [appendNewOrder, collection, newOrder$, query$]);

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
