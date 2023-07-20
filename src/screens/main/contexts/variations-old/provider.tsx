import * as React from 'react';

import get from 'lodash/get';
import isEqual from 'lodash/isEqual';
import set from 'lodash/set';
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

import { filterVariationsByAttributes } from './query.helpers';
import useLocalData from '../../../../contexts/local-data';
import useCollection from '../../hooks/use-collection';
import useQuery, { QueryObservable, QueryState, SetQuery } from '../use-query';
import useReplicationState from '../use-replication-state';

import type { AuditStatus } from '../use-replication-state/use-audit';

type ProductVariationDocument =
	import('@wcpos/database/src/collections/variations').ProductVariationDocument;
type ProductDocument = import('@wcpos/database/src/collections/products').ProductDocument;

export const VariationsContext = React.createContext<{
	query$: QueryObservable;
	setQuery: SetQuery;
	resource: ObservableResource<ProductVariationDocument[]>;
	sync: () => void;
	clear: () => void;
	replicationState: import('../use-replication-state').ReplicationState;
}>(null);

interface VariationsProviderProps {
	children: React.ReactNode;
	initialQuery?: QueryState;
	parent: ProductDocument;
	// uiSettings?: import('../ui-settings').UISettingsDocument;
}

interface APIQueryParams {
	context?: 'view' | 'edit';
	page?: number;
	per_page?: number;
	search?: string;
	after?: string;
	before?: string;
	exclude?: number[];
	include?: number[];
	offset?: number;
	order?: 'asc' | 'desc';
	orderby?: 'date' | 'id' | 'include' | 'title' | 'slug';
	parent?: number[];
	parent_exclude?: number[];
	slug?: string;
	status?: 'any' | 'draft' | 'pending' | 'private' | 'publish';
	sku?: string;
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
	status: AuditStatus,
	batchSize: number
): APIQueryParams => {
	let orderby = params.orderby;

	if (query.sortBy === 'name') {
		orderby = 'title';
	}

	return {
		...params,
		orderby,
	};
};

/**
 *
 */
const VariationsProvider = ({
	children,
	initialQuery,
	parent,
}: // uiSettings,
VariationsProviderProps) => {
	const { storeDB } = useLocalData();
	const { collection } = useCollection('variations');
	const apiEndpoint = `products/${parent.id}/variations`;
	const { query$, setQuery } = useQuery(initialQuery);
	const pageNumberRef = React.useRef(1);
	const [loadMoreRef, loadMore$] = useObservableRef(Date.now());

	// const replicationState = useReplication({ parent, query$ });
	const replicationState = useReplicationState({
		collection,
		query$,
		prepareQueryParams,
		apiEndpoint,
	});

	/**
	 *
	 */
	const resource = React.useMemo(() => {
		const resource$ = combineLatest([query$, parent.variations$]).pipe(
			// reset the page number when the query changes
			tap(() => {
				pageNumberRef.current = 1;
			}),
			switchMap(([query, variationIDs]) => {
				console.log(query);
				const { search, selector: querySelector, sortBy, sortDirection, limit, skip } = query;
				const selector = { $and: [{ id: { $in: variationIDs } }] };

				/**
				 *  $allMatch is not supported so I will have to filter the results
				 */
				const allMatch = get(querySelector, 'attributes.$allMatch', null);

				if (querySelector && !allMatch) {
					selector.$and.push(querySelector);
				}

				const RxQuery = collection.find({ selector });

				/**
				 *  $allMatch is not supported so I will have to filter the results
				 */
				return RxQuery.$.pipe(
					map((result) => {
						if (allMatch) {
							return filterVariationsByAttributes(result, allMatch);
						}
						return result;
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
	}, [collection, loadMore$, parent.variations$, query$]);

	/**
	 *
	 */
	const clear = React.useCallback(async () => {
		// we need to cancel any replications before clearing the collections
		replicationState.cancel();
		await storeDB.reset(['variations']);
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
		<VariationsContext.Provider
			value={{
				resource,
				query$,
				setQuery,
				clear,
				sync,
				replicationState,
				loadNextPage,
			}}
		>
			{children}
		</VariationsContext.Provider>
	);
};

export default VariationsProvider;
