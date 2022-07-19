import * as React from 'react';
import { BehaviorSubject, combineLatest } from 'rxjs';
import { tap, switchMap, map, debounceTime } from 'rxjs/operators';
import { ObservableResource, useObservableState } from 'observable-hooks';
import useAppState from '@wcpos/hooks/src/use-app-state';
import useWhyDidYouUpdate from '@wcpos/hooks/src/use-why-did-you-update';
import _map from 'lodash/map';
import _set from 'lodash/set';
import _get from 'lodash/get';
import { orderBy } from '@shelf/fast-natural-order-by';
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
	sync: () => void;
}>(null);

interface ProductsProviderProps {
	children: React.ReactNode;
	initialQuery: QueryState;
	ui: import('@wcpos/hooks/src/use-ui-resource').UIDocument;
}

const escape = (text: string) => text.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');

const ProductsProvider = ({ children, initialQuery, ui }: ProductsProviderProps) => {
	const query$ = React.useMemo(() => new BehaviorSubject(initialQuery), [initialQuery]);
	const { storeDB } = useAppState();
	const collection = storeDB.collections.products;
	const http = useRestHttpClient();
	const replicationStates = React.useRef({ audit: null, sync: null });
	const showOutOfStock = useObservableState(ui.get$('showOutOfStock'), ui.get('showOutOfStock'));

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
		replicationStates.current.audit = replicationState;

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
		replicationStates.current.sync = replicationState;

		return function cleanUp() {
			replicationState.then((result) => {
				result.cancel();
			});
		};
	}, [collection, http]);

	/**
	 *
	 */
	const sync = React.useCallback(() => {
		const { audit } = replicationStates.current;

		if (audit) {
			audit.then((result) => {
				result.run();
			});
		}
	}, []);

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

			// hide out-of-stock products
			if (!showOutOfStock) {
				selector.$or = [{ manage_stock: { $eq: false } }, { stock_quantity: { $gt: 0 } }];
			}

			const RxQuery = collection.find({ selector });

			return RxQuery.$.pipe(
				map((result) => {
					return orderBy(result, [(p) => p[q.sortBy]], [q.sortDirection]);
				})
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
			sync,
		}),
		[query$, resource, setQuery, sync]
	);

	useWhyDidYouUpdate('ProductsProvider', {
		value,
		query$,
		resource,
		setQuery,
		products$,
		storeDB,
		collection,
		http,
		replicationStates,
		showOutOfStock,
		sync,
	});

	return <ProductsContext.Provider value={value}>{children}</ProductsContext.Provider>;
};

export default ProductsProvider;
