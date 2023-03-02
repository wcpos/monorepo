import * as React from 'react';

import { orderBy } from '@shelf/fast-natural-order-by';
import isEmpty from 'lodash/isEmpty';
import { ObservableResource, useObservableState } from 'observable-hooks';
import { switchMap, map } from 'rxjs/operators';

// import products from '@wcpos/database/src/collections/products';
import useWhyDidYouUpdate from '@wcpos/hooks/src/use-why-did-you-update';
import log from '@wcpos/utils/src/logger';

import { useReplication } from './use-replication';
import useLocalData from '../../../../contexts/local-data';
import useQuery, { QueryObservable, QueryState, SetQuery } from '../use-query';

type ProductDocument = import('@wcpos/database/src/collections/products').ProductDocument;

export const ProductsContext = React.createContext<{
	query$: QueryObservable;
	setQuery: SetQuery;
	resource: ObservableResource<ProductDocument[]>;
	sync: () => void;
	clear: () => Promise<any>;
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
	const { query$, setQuery } = useQuery(initialQuery);
	const { replicationState } = useReplication({ collection });

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
	 * Clear all docs
	 * TODO - I thought it would be better to use the collection.remove() method
	 * but it seems to make the app hang. Need to investigate later.
	 * // await collection.remove();
	 * // return storeDB?.addCollections({ products });
	 */
	const clear = React.useCallback(async () => {
		const query = collection.find();
		return query.remove();
	}, [collection]);

	/**
	 * Sync
	 */
	const sync = React.useCallback(() => {
		replicationState.reSync();
	}, [replicationState]);

	/**
	 *
	 */
	const value = React.useMemo(() => {
		const resource$ = query$.pipe(
			switchMap((query) => {
				const { search, selector: querySelector, sortBy, sortDirection } = query;

				const searchSelector = search
					? {
							$or: [
								{ name: { $regex: new RegExp(escape(search), 'i') } },
								{ sku: { $regex: new RegExp(escape(search), 'i') } },
								{ barcode: { $regex: new RegExp(escape(search), 'i') } },
							],
					  }
					: {};

				const selector = querySelector ? { $and: [querySelector, searchSelector] } : searchSelector;

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

	useWhyDidYouUpdate('ProductsProvider', {
		value,
		children,
		initialQuery,
		uiSettings,
		storeDB,
		collection,
		showOutOfStock,
		query$,
		setQuery,
		replicationState,
		// sync,
	});

	return (
		<ProductsContext.Provider value={{ ...value, sync, clear, setQuery, query$, replicationState }}>
			{children}
		</ProductsContext.Provider>
	);
};

export default ProductsProvider;
