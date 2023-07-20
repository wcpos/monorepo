import * as React from 'react';

import { orderBy } from '@shelf/fast-natural-order-by';
import isEqual from 'lodash/isEqual';
import { ObservableResource, useObservableState, useObservableRef } from 'observable-hooks';
import { combineLatest, merge, of } from 'rxjs';
import {
	switchMap,
	map,
	distinctUntilChanged,
	catchError,
	tap,
	debounceTime,
	skip,
	take,
} from 'rxjs/operators';

// import products from '@wcpos/database/src/collections/products';
import log from '@wcpos/utils/src/logger';

import useVariationsQuery from './use-variation-query';
import useLocalData from '../../../../contexts/local-data';
import useCollection from '../../hooks/use-collection';
import useQuery, { QueryObservable, QueryState, SetQuery } from '../use-query';
import useReplicationState from '../use-replication-state';

type ProductDocument = import('@wcpos/database/src/collections/products').ProductDocument;

export const ProductsContext = React.createContext<{
	query$: QueryObservable;
	setQuery: SetQuery;
	resource: ObservableResource<{ data: ProductDocument[]; count: number; hasMore: boolean }>;
	sync: () => void;
	clear: () => Promise<any>;
	replicationState: import('../use-replication-state').ReplicationState;
	loadNextPage: () => void;
}>(null);

interface ProductsProviderProps {
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
	orderby?: 'date' | 'id' | 'include' | 'title' | 'slug' | 'price' | 'popularity' | 'rating';
	parent?: number[];
	parent_exclude?: number[];
	slug?: string;
	status?: 'any' | 'draft' | 'pending' | 'private' | 'publish';
	type?: 'simple' | 'grouped' | 'external' | 'variable';
	sku?: string;
	featured?: boolean;
	category?: string;
	tag?: string;
	shipping_class?: string;
	attribute?: string;
	attribute_term?: string;
	tax_class?: 'standard' | 'reduced-rate' | 'zero-rate';
	on_sale?: boolean;
	min_price?: string;
	max_price?: string;
	stock_status?: 'instock' | 'outofstock' | 'onbackorder';
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

	if (query.sortBy === 'name') {
		orderby = 'title';
	}

	if (query.sortBy === 'date_created') {
		orderby = 'date';
	}

	return {
		...params,
		orderby,
		status: 'publish',
	};
};

/**
 *
 */
const ProductsProvider = ({ children, initialQuery, uiSettings }: ProductsProviderProps) => {
	const { storeDB } = useLocalData();
	const { collection } = useCollection('products');
	const showOutOfStock = useObservableState(
		uiSettings.get$('showOutOfStock'),
		uiSettings.get('showOutOfStock')
	);
	const { query$, setQuery } = useQuery(initialQuery);
	const replicationState = useReplicationState({ collection, query$, prepareQueryParams });
	const pageNumberRef = React.useRef(1);
	const [loadMoreRef, loadMore$] = useObservableRef(Date.now());
	const { shownVariations$, setVariationsQuery } = useVariationsQuery();

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

				if (!showOutOfStock) {
					selector.$and.push({
						$or: [
							{ manage_stock: false },
							{ $and: [{ manage_stock: true }, { stock_quantity: { $gt: 0 } }] },
						],
					});
				}

				const RxQuery = collection.find({ selector });

				return RxQuery.$.pipe(
					map((result) => {
						return orderBy(result, [sortBy], [sortDirection]);
					})
					// distinctUntilChanged((prev, next) => {
					// 	// only emit when the uuids change
					// 	return isEqual(
					// 		prev.map((doc) => doc.uuid),
					// 		next.map((doc) => doc.uuid)
					// 	);
					// })
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
	}, [collection, query$, showOutOfStock, loadMore$]);

	/**
	 *
	 */
	const clear = React.useCallback(async () => {
		// we need to cancel any replications before clearing the collections
		replicationState.cancel();
		await storeDB.reset(['products', 'variations']);
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
		<ProductsContext.Provider
			value={{
				resource,
				query$,
				setQuery,
				clear,
				sync,
				replicationState,
				loadNextPage,
				shownVariations$,
				setVariationsQuery,
			}}
		>
			{children}
		</ProductsContext.Provider>
	);
};

export default ProductsProvider;
