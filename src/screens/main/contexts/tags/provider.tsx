import * as React from 'react';

import { ObservableResource } from 'observable-hooks';
import { switchMap, map } from 'rxjs/operators';

import log from '@wcpos/utils/src/logger';

import { useReplication } from './use-replication';
import useCollection from '../../hooks/use-collection';
import useQuery, { QueryObservable, QueryState, SetQuery } from '../use-query';

type ProductTagDocument = import('@wcpos/database').ProductTagDocument;

export const ProductTagsContext = React.createContext<{
	query$: QueryObservable;
	setQuery: SetQuery;
	resource: ObservableResource<ProductTagDocument[]>;
	sync: () => void;
}>(null);

interface ProductTagsProviderProps {
	children: React.ReactNode;
	initialQuery?: QueryState;
	uiSettings: import('../ui-settings').UISettingsDocument;
}

const ProductTagsProvider = ({ children, initialQuery, ui }: ProductTagsProviderProps) => {
	log.debug('render categories provider');
	const collection = useCollection('products/tags');
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
		<ProductTagsContext.Provider value={{ ...value, collection }}>
			{children}
		</ProductTagsContext.Provider>
	);
};

export default ProductTagsProvider;
