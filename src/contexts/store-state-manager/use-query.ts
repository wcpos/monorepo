import { useEffect } from 'react';

import { useStoreStateManager } from './';
import { Query, QueryState } from './query';

interface QueryOptions {
	queryKeys: (string | number | object)[];
	collectionName: string;
	initialQuery?: QueryState;
}

/**
 *
 */
export const useQuery = <T>({
	queryKeys,
	collectionName,
	initialQuery,
}: QueryOptions): Query<T> => {
	const manager = useStoreStateManager();
	const collection = manager.storeDB.collections[collectionName];

	// get the query (it will be registered if it doesn't exist)
	const query = manager.registerQuery<T>(queryKeys, collection, initialQuery);

	useEffect(() => {
		// Add cleanup logic
		return () => {
			// @TODO - this cleans up too often and causes issues
			// how to cleanup only when the query is no longer needed?
			// manager.deregisterQuery(queryKeys);
		};
	}, [manager, queryKeys]);

	return query;
};
