import * as React from 'react';

import { ObservableResource } from 'observable-hooks';
import { switchMap, map } from 'rxjs/operators';

import log from '@wcpos/utils/src/logger';

import { useReplication } from './use-replication';
import useLocalData from '../../../../contexts/local-data';
import useQuery, { QueryObservable, QueryState, SetQuery } from '../use-query';

type ProductCategoryDocument =
	import('@wcpos/database/src/collections/categories').ProductCategoryDocument;

export const ProductCategoriesContext = React.createContext<{
	query$: QueryObservable;
	setQuery: SetQuery;
	resource: ObservableResource<ProductCategoryDocument[]>;
	sync: () => void;
}>(null);

interface ProductCategoriesProviderProps {
	children: React.ReactNode;
	initialQuery?: QueryState;
	uiSettings: import('../ui-settings').UISettingsDocument;
}

const ProductCategoriesProvider = ({
	children,
	initialQuery,
	ui,
}: ProductCategoriesProviderProps) => {
	log.debug('render categories provider');
	const { storeDB } = useLocalData();
	const collection = storeDB.collections['products/categories'];
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
			switchMap((query) => {
				const { search, selector = {}, sortBy, sortDirection, barcode } = query;

				const RxQuery = collection.find({ selector });

				return RxQuery.$.pipe(
					map((result) => result)
					// tap((res) => {
					// 	debugger;
					// })
				);
			})
		);

		return {
			query$,
			setQuery,
			resource: new ObservableResource(resource$),
			replicationState,
		};
	}, [query$, setQuery, replicationState, collection]);

	return (
		<ProductCategoriesContext.Provider value={value}>{children}</ProductCategoriesContext.Provider>
	);
};

export default ProductCategoriesProvider;
