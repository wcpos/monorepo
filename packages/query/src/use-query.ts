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

	/**
	 * Register query immediately when manager changes.
	 * This handles store switches - new manager = new query registration.
	 */
	const initialQuery = React.useMemo(
		() => manager.registerQuery(queryOptions),
		[manager, queryOptions]
	);

	/**
	 * Subscribe to collection resets to re-register query.
	 * useMemo ensures we subscribe to the current manager's reset$.
	 */
	const reset$ = React.useMemo(
		() =>
			manager.localDB.reset$.pipe(
				filter((collection) => collection.name === queryOptions.collectionName),
				map(() => manager.registerQuery(queryOptions))
			),
		[manager, queryOptions]
	);

	/**
	 * Use initialQuery as the default value, update when reset$ emits.
	 */
	const query = useObservableState(reset$, initialQuery);

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
