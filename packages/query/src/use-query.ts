import * as React from 'react';

import { useObservableState } from 'observable-hooks';
import { filter, map } from 'rxjs/operators';

import { useQueryManager } from './provider';

import type { QueryHooks, QueryParams } from './query-state';

export interface QueryOptions {
	queryKeys: (string | number | object)[];
	collectionName: string;
	initialParams?: QueryParams;
	hooks?: QueryHooks;
	locale?: string;
	endpoint?: string;
}

export const useQuery = (queryOptions: QueryOptions) => {
	const manager = useQueryManager();
	const query = useObservableState(
		manager.localDB.reset$.pipe(
			filter((collection) => collection.name === queryOptions.collectionName),
			map(() => manager.registerQuery(queryOptions))
		),
		manager.registerQuery(queryOptions)
	);

	/**
	 * Cleanup query replications when the component unmounts.
	 * Legitimate useEffect for resource cleanup with external query manager.
	 */
	React.useEffect(() => {
		return () => {
			manager.maybePauseQueryReplications(query);
		};
	}, [query, manager]);

	return query;
};
