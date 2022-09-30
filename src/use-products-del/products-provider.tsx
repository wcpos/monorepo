import * as React from 'react';
import { BehaviorSubject, combineLatest } from 'rxjs';
import { tap, switchMap, map, debounceTime } from 'rxjs/operators';
import { ObservableResource, useObservableState } from 'observable-hooks';
import useStore from '@wcpos/hooks/src/use-store';
import useOnlineStatus from '@wcpos/hooks/src/use-online-status';
import useWhyDidYouUpdate from '@wcpos/hooks/src/use-why-did-you-update';
import _map from 'lodash/map';
import _set from 'lodash/set';
import _get from 'lodash/get';
import _cloneDeep from 'lodash/cloneDeep';
import _isEmpty from 'lodash/isEmpty';
import { orderBy } from '@shelf/fast-natural-order-by';
import useRestHttpClient from '../use-rest-http-client';
import { getAuditIdReplicationState } from './id-audit';
import { getReplicationState } from './replication';

type ProductDocument = import('@wcpos/database/src/collections/products').ProductDocument;
type SortDirection = import('@wcpos/components/src/table').SortDirection;

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
	sync: () => void;
}>(null);

interface ProductsProviderProps {
	children: React.ReactNode;
	initialQuery: QueryState;
	ui: import('@wcpos/hooks/src/use-store').UIDocument;
}

const escape = (text: string) => text.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');

const replicationMap = new Map();

const ProductsProvider = ({ children, initialQuery, ui }: ProductsProviderProps) => {
	console.log('render product provider');
	const query$ = React.useMemo(() => new BehaviorSubject(initialQuery), [initialQuery]);
	const { storeDB } = useStore();
	const collection = storeDB.collections.products;
	const http = useRestHttpClient();
	const showOutOfStock = useObservableState(ui.get$('showOutOfStock'), ui.get('showOutOfStock'));
	// const { isConnected } = useOnlineStatus();

	/**
	 *
	 */
	const setQuery = React.useCallback(
		(path, value) => {
			const prev = _cloneDeep(query$.getValue()); // query needs to be immutable
			const next = _set(prev, path, value);
			query$.next(next);
		},
		[query$]
	);

	/**
	 *
	 */
	// React.useEffect(() => {
	// 	if (!isConnected) {
	// 		replicationMap.forEach((replicationState) => {
	// 			replicationState.then((result) => {
	// 				result.cancel();
	// 			});
	// 		});
	// 	}
	// }, [isConnected]);

	/**
	 * Start replication
	 * - audit id (checks for deleted or new ids on server)
	 * - replication (syncs all data and checks for modified data)
	 */
	// React.useEffect(() => {
	// 	if (!replicationMap.get('audit')) {
	// 		replicationMap.set('audit', getAuditIdReplicationState(http, collection));
	// 	}

	// 	if (!replicationMap.get('sync')) {
	// 		replicationMap.set('sync', getReplicationState(http, collection));
	// 	}

	// 	return function cleanUp() {
	// 		replicationMap.forEach((replicationState) => {
	// 			replicationState.then((result) => {
	// 				result.cancel();
	// 			});
	// 		});
	// 	};
	// }, [collection, http]);

	/**
	 *
	 */
	// const sync = React.useCallback(() => {
	// 	const audit = replicationMap.get('audit');

	// 	if (audit) {
	// 		audit.then((result) => {
	// 			result.run();
	// 		});
	// 	}
	// }, []);

	/**
	 *
	 */
	const resource = React.useMemo(
		() =>
			new ObservableResource(
				query$.pipe(
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
						if (!_isEmpty(_get(q, 'search'))) {
							_set(selector, ['name', '$regex'], new RegExp(escape(_get(q, 'search', '')), 'i'));
						}

						// filters
						if (_get(q, 'filters.category.id')) {
							// _set(selector, ['categories[0].id', '$eq'], _get(q, 'filters.category.id'));
							_set(selector, ['categories', '$elemMatch', 'id'], _get(q, 'filters.category.id'));
						}
						if (_get(q, 'filters.tag.id')) {
							_set(selector, ['tags', '$elemMatch', 'id'], _get(q, 'filters.tag.id'));
						}

						// hide out-of-stock products
						if (!showOutOfStock) {
							selector.$or = [{ manage_stock: { $eq: false } }, { stock_quantity: { $gt: 0 } }];
						}
						console.log(selector);

						const RxQuery = collection.find({ selector });

						return RxQuery.$.pipe(
							map((result) => {
								console.log('product query result');
								return orderBy(result, [(p) => p[q.sortBy]], [q.sortDirection]);
							})
						);
					})
				)
			),
		[collection, query$, showOutOfStock]
	);

	/**
	 *
	 */
	const value = React.useMemo(
		() => ({
			query$,
			// query: query$.getValue(),
			setQuery,
			resource,
			// sync,
		}),
		[
			query$,
			resource,
			setQuery,
			// sync
		]
	);

	useWhyDidYouUpdate('ProductsProvider', {
		value,
		query$,
		resource,
		setQuery,
		// products$,
		storeDB,
		collection,
		http,
		showOutOfStock,
		// sync,
	});

	return <ProductsContext.Provider value={value}>{children}</ProductsContext.Provider>;
};

const ProductsProviderMemoized = React.memo(ProductsProvider);
export default ProductsProviderMemoized;
