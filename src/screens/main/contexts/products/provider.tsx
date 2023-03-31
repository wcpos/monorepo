import * as React from 'react';

import { orderBy } from '@shelf/fast-natural-order-by';
import { ObservableResource, useObservableState } from 'observable-hooks';
import { switchMap, map, tap } from 'rxjs/operators';

// import products from '@wcpos/database/src/collections/products';
import log from '@wcpos/utils/src/logger';

import useProductsCollection from '../../hooks/use-products-collection';
import clearCollection from '../clear-collection';
import syncCollection from '../sync-collection';
import useQuery, { QueryObservable, QueryState, SetQuery } from '../use-query';
import useReplicationState from '../use-replication-state';

type ProductDocument = import('@wcpos/database/src/collections/products').ProductDocument;

export const ProductsContext = React.createContext<{
	query$: QueryObservable;
	setQuery: SetQuery;
	resource: ObservableResource<ProductDocument[]>;
	sync: () => void;
	clear: () => Promise<any>;
	replicationState: import('../use-replication-state').ReplicationState;
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
	checkpoint,
	batchSize
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
const ProductsProvider = ({ children, initialQuery, uiSettings }: ProductsProviderProps) => {
	log.debug('render product provider');
	const collection = useProductsCollection();
	const showOutOfStock = useObservableState(
		uiSettings.get$('showOutOfStock'),
		uiSettings.get('showOutOfStock')
	);
	const { query$, setQuery } = useQuery(initialQuery);
	const replicationState = useReplicationState({ collection, query$, prepareQueryParams });

	/**
	 *
	 */
	const resource = React.useMemo(() => {
		const resource$ = query$.pipe(
			switchMap((query) => {
				const { search, selector: querySelector, sortBy, sortDirection, limit, skip } = query;
				let selector;

				const searchSelector = search
					? {
							$or: [
								{ name: { $regex: new RegExp(escape(search), 'i') } },
								{ sku: { $regex: new RegExp(escape(search), 'i') } },
								{ barcode: { $regex: new RegExp(escape(search), 'i') } },
							],
					  }
					: null;

				if (querySelector && searchSelector) {
					selector = {
						$and: [querySelector, searchSelector],
					};
				} else {
					selector = querySelector || searchSelector || {};
				}

				const RxQuery = collection.find({ selector });

				return RxQuery.$.pipe(
					map((result) => {
						return orderBy(result, [sortBy], [sortDirection]);
					})
				);
			})
		);

		return new ObservableResource(resource$);
	}, [collection, query$]);

	return (
		<ProductsContext.Provider
			value={{
				resource,
				query$,
				setQuery,
				clear: () => clearCollection(store.localID, collection),
				sync: () => syncCollection(replicationState),
				replicationState,
			}}
		>
			{children}
		</ProductsContext.Provider>
	);
};

export default ProductsProvider;
