import * as React from 'react';
import { BehaviorSubject, combineLatest } from 'rxjs';
import { tap, switchMap, map, debounceTime } from 'rxjs/operators';
import { ObservableResource } from 'observable-hooks';
import useAppState from '@wcpos/hooks/src/use-app-state';
import _map from 'lodash/map';
import _set from 'lodash/set';
import _get from 'lodash/get';
import _orderBy from 'lodash/orderBy';
import useRestHttpClient from '../use-rest-http-client';
import { getAuditIdReplicationState } from './id-audit';
import { getReplicationState } from './replication';

type ProductDocument = import('@wcpos/database/src/collections/products').ProductDocument;
type SortDirection = import('@wcpos/components/src/table/table').SortDirection;

export interface QueryState {
	search?: string;
	sortBy: string;
	sortDirection: SortDirection;
	filters?: Record<string, unknown>;
}

export const ProductsContext = React.createContext<{
	query$: BehaviorSubject<QueryState>;
	setQuery: (path: string | string[], value: any) => void;
	resource: ObservableResource<ProductDocument[]>;
}>(null);

interface ProductsProviderProps {
	children: React.ReactNode;
	initialQuery: QueryState;
}

const escape = (text: string) => text.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');

const ProductsProvider = ({ children, initialQuery }: ProductsProviderProps) => {
	const query$ = React.useMemo(() => new BehaviorSubject(initialQuery), [initialQuery]);
	const { storeDB } = useAppState();
	const collection = storeDB.collections.products;
	const http = useRestHttpClient();

	/**
	 *
	 */
	const setQuery = React.useCallback(
		(path, value) => {
			const prev = { ...query$.getValue() }; // query needs to be immutable
			const next = _set(prev, path, value);
			query$.next(next);
		},
		[query$]
	);

	/**
	 * Start id audit
	 */
	React.useEffect(() => {
		const replicationState = getAuditIdReplicationState(http, collection);

		return function cleanUp() {
			replicationState.then((result) => {
				result.cancel();
			});
		};
	}, [collection, http]);

	/**
	 * Start replication
	 */
	React.useEffect(() => {
		const replicationState = getReplicationState(http, collection);

		return function cleanUp() {
			replicationState.then((result) => {
				result.cancel();
			});
		};
	}, [collection, http]);

	/**
	 *
	 */
	const products$ = query$.pipe(
		// debounce hits to the local db
		debounceTime(100),
		// switchMap to the collection query
		switchMap((q) => {
			const selector = {};
			// forEach(q.search, function (value, key) {
			// 	if (value) {
			// 		set(selector, [key, '$regex'], new RegExp(escape(value), 'i'));
			// 	}
			// });
			// search
			_set(selector, ['name', '$regex'], new RegExp(escape(_get(q, 'search', '')), 'i'));

			// filters
			if (_get(q, 'filters.category.id')) {
				_set(selector, ['categories', '$elemMatch', 'id'], _get(q, 'filters.category.id'));
			}
			if (_get(q, 'filters.tag.id')) {
				_set(selector, ['tags', '$elemMatch', 'id'], _get(q, 'filters.tag.id'));
			}

			const RxQuery = collection.find({ selector });

			return RxQuery.$.pipe(
				// sort the results
				map((result) => {
					return _orderBy(result, [q.sortBy], [q.sortDirection]);
				})
				// @ts-ignore
				// map((result) => {
				// 	const array = Array.isArray(result) ? result : [];
				// 	const productSorter = (product: any) => {
				// 		if (q.sortBy === 'name') {
				// 			// @TODO - this doens't work
				// 			return product[q.sortBy].toLowerCase();
				// 		}
				// 		return product[q.sortBy];
				// 	};
				// 	return orderBy(array, [productSorter], [q.sortDirection]);
				// })
			);
		})
	);

	const resource = React.useMemo(() => new ObservableResource(products$), [products$]);

	/**
	 *
	 */
	const value = React.useMemo(
		() => ({
			query$,
			// query: query$.getValue(),
			setQuery,
			resource,
		}),
		[query$, resource, setQuery]
	);

	return <ProductsContext.Provider value={value}>{children}</ProductsContext.Provider>;
};

export default ProductsProvider;
