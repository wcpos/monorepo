import * as React from 'react';

import { orderBy } from '@shelf/fast-natural-order-by';
import { ObservableResource, useObservableState } from 'observable-hooks';
import { switchMap, map } from 'rxjs/operators';

// import products from '@wcpos/database/src/collections/products';
import log from '@wcpos/utils/src/logger';

import useLocalData from '../../../../contexts/local-data';
import useQuery, { QueryObservable, QueryState, SetQuery } from '../use-query';

type ProductDocument = import('@wcpos/database/src/collections/products').ProductDocument;

export const ProductsContext = React.createContext<{
	query$: QueryObservable;
	setQuery: SetQuery;
	resource: ObservableResource<ProductDocument[]>;
}>(null);

interface ProductsProviderProps {
	children: React.ReactNode;
	initialQuery: QueryState;
	uiSettings: import('../ui-settings').UISettingsDocument;
}

/**
 *
 */
const ProductsProvider = ({ children, initialQuery, uiSettings }: ProductsProviderProps) => {
	log.debug('render product provider');
	const { storeDB } = useLocalData();
	const collection = storeDB.collections.products;
	const showOutOfStock = useObservableState(
		uiSettings.get$('showOutOfStock'),
		uiSettings.get('showOutOfStock')
	);
	const { query$, setQuery, nextPage } = useQuery(initialQuery);

	/**
	 *
	 */
	const value = React.useMemo(() => {
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

		return {
			resource: new ObservableResource(resource$),
		};
	}, [collection, query$]);

	return (
		<ProductsContext.Provider value={{ ...value, setQuery, query$, nextPage }}>
			{children}
		</ProductsContext.Provider>
	);
};

export default ProductsProvider;
