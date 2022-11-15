import * as React from 'react';

import { orderBy } from '@shelf/fast-natural-order-by';
import _get from 'lodash/get';
import _isEmpty from 'lodash/isEmpty';
import _set from 'lodash/set';
import { ObservableResource, useObservableState } from 'observable-hooks';
import { switchMap, map } from 'rxjs/operators';

import useWhyDidYouUpdate from '@wcpos/hooks/src/use-why-did-you-update';
import log from '@wcpos/utils/src/logger';

import useStore from '../../contexts/store';
import useQuery, { QueryObservable, QueryState, SetQuery } from '../use-query';
import { useReplication } from './use-replication';

type ProductDocument = import('@wcpos/database/src/collections/products').ProductDocument;

export const ProductsContext = React.createContext<{
	query$: QueryObservable;
	setQuery: SetQuery;
	resource: ObservableResource<ProductDocument[]>;
	sync: () => void;
}>(null);

interface ProductsProviderProps {
	children: React.ReactNode;
	initialQuery: QueryState;
	ui?: import('../../contexts/ui').UIDocument;
}

/**
 *
 */
const ProductsProvider = ({ children, initialQuery, ui }: ProductsProviderProps) => {
	log.debug('render product provider');
	const { storeDB } = useStore();
	const collection = storeDB.collections.products;
	const showOutOfStock = useObservableState(ui.get$('showOutOfStock'), ui.get('showOutOfStock'));
	const { query$, setQuery } = useQuery(initialQuery);
	const replicationState = useReplication({ collection });

	/**
	 * Only run the replication when the Provider is mounted
	 */
	React.useEffect(() => {
		replicationState.start();
		return () => {
			// this is async, should we wait?
			replicationState.cancel();
		};
	}, [replicationState]);

	/**
	 *
	 */
	const value = React.useMemo(() => {
		const resource$ = query$.pipe(
			// debounce hits to the local db
			// debounceTime(100),
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
				// @TODO - filter out-of-stock products after query
				// if (!showOutOfStock) {
				// 	selector.$or = [
				// 		{ manage_stock: { $eq: false } },
				// 		{ stock_quantity: { $gt: 0 } },
				// 		{ date_created_gmt: { $eq: undefined } },
				// 	];
				// }

				const RxQuery = collection.find({ selector });

				return RxQuery.$.pipe(
					map((result) => {
						log.silly('product query result', result);
						return orderBy(result, [(p) => p[q.sortBy]], [q.sortDirection]);
					})
				);
			})
		);

		return {
			query$,
			setQuery,
			resource: new ObservableResource(resource$),
			replicationState,
		};
	}, [collection, query$, replicationState, setQuery]);

	useWhyDidYouUpdate('ProductsProvider', {
		value,
		children,
		initialQuery,
		ui,
		storeDB,
		collection,
		showOutOfStock,
		query$,
		setQuery,
		// sync,
	});

	return <ProductsContext.Provider value={value}>{children}</ProductsContext.Provider>;
};

export default ProductsProvider;
