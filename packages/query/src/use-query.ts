import * as React from 'react';

import { useObservableState } from 'observable-hooks';
import { filter, map, startWith } from 'rxjs/operators';

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

	/**
	 * Create the observable that re-registers queries on collection reset.
	 * useMemo ensures we re-subscribe when manager changes (e.g., store switch).
	 */
	const reset$ = React.useMemo(
		() =>
			manager.localDB.reset$.pipe(
				filter((collection) => collection.name === queryOptions.collectionName),
				map(() => manager.registerQuery(queryOptions)),
				startWith(manager.registerQuery(queryOptions))
			),
		[manager, queryOptions]
	);

	const query = useObservableState(reset$);

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
