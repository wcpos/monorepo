import * as React from 'react';

import { orderBy } from '@shelf/fast-natural-order-by';
import isEqual from 'lodash/isEqual';
import { ObservableResource, useObservableRef } from 'observable-hooks';
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

import log from '@wcpos/utils/src/logger';

import useLocalData from '../../../../contexts/local-data';
import useCollection from '../../hooks/use-collection';
import useQuery, { QueryObservable, QueryState, SetQuery } from '../use-query';
import useReplicationState from '../use-replication-state';

type ProductCategoryDocument =
	import('@wcpos/database/src/collections/categories').ProductCategoryDocument;

export const ProductCategoriesContext = React.createContext<{
	query$: QueryObservable;
	setQuery: SetQuery;
	resource: ObservableResource<{
		data: ProductCategoryDocument[];
		count: number;
		hasMore: boolean;
	}>;
	// sync: () => void;
	// clear: () => Promise<any>;
	replicationState: import('../use-replication-state').ReplicationState;
	loadNextPage: () => void;
}>(null);

interface ProductCategoriesProviderProps {
	children: React.ReactNode;
	initialQuery?: QueryState;
	uiSettings: import('../ui-settings').UISettingsDocument;
}

interface APIQueryParams {
	context?: 'view' | 'edit';
	page?: number;
	per_page?: number;
	search?: string;
	exclude?: number[];
	include?: number[];
	order?: 'asc' | 'desc';
	orderby?: 'id' | 'include' | 'name' | 'slug' | 'term_group' | 'description' | 'count';
	hide_empty?: boolean;
	parent?: number;
	product?: number;
	slug?: string;
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
	/**
	 * FIXME: category has no modified after and will keep fetching over and over
	 */
	if (params.modified_after) {
		params.earlyReturn = true;
	}
	return params;
};

const ProductCategoriesProvider = ({
	children,
	initialQuery,
	ui,
}: ProductCategoriesProviderProps) => {
	const { storeDB } = useLocalData();
	const { collection } = useCollection('products/categories');
	const { query$, setQuery } = useQuery(initialQuery, 'products/categories');
	const replicationState = useReplicationState({ collection, query$, prepareQueryParams });
	const pageNumberRef = React.useRef(1);
	const [loadMoreRef, loadMore$] = useObservableRef(Date.now());

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
	}, [query$, loadMore$, collection]);

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
		<ProductCategoriesContext.Provider
			value={{
				resource,
				query$,
				setQuery,
				// clear,
				// sync,
				replicationState,
				loadNextPage,
			}}
		>
			{children}
		</ProductCategoriesContext.Provider>
	);
};

export default ProductCategoriesProvider;
