import * as React from 'react';

import { useObservableState } from 'observable-hooks';
import { filter, map, startWith } from 'rxjs/operators';

import { getLogger } from '@wcpos/utils/logger';

import { useQueryManager } from './provider';

import type { QueryHooks, QueryParams } from './query-state';

const logger = getLogger(['wcpos', 'query', 'useQuery']);

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
	const initialQuery = React.useMemo(() => {
		logger.debug('Registering query', {
			context: {
				collectionName: queryOptions.collectionName,
				queryKeys: queryOptions.queryKeys,
			},
		});
		return manager.registerQuery(queryOptions);
	}, [manager, queryOptions]);

	/**
	 * Observable that emits queries:
	 * 1. Immediately emits initialQuery via startWith (handles manager changes)
	 * 2. Re-emits when collection is reset via reset$
	 *
	 * startWith ensures we always get the current query even before reset$ emits.
	 */
	const query$ = React.useMemo(
		() =>
			manager.localDB.reset$.pipe(
				filter((collection) => collection.name === queryOptions.collectionName),
				map(() => {
					logger.debug('Re-registering query after collection reset', {
						context: { collectionName: queryOptions.collectionName },
					});
					return manager.registerQuery(queryOptions);
				}),
				startWith(initialQuery)
			),
		[manager, queryOptions, initialQuery]
	);

	/**
	 * Subscribe to query$ - will immediately emit initialQuery,
	 * then update if collection is reset.
	 */
	const query = useObservableState(query$, initialQuery);

	/**
	 * Cleanup query replications when the component unmounts.
	 */
	React.useEffect(() => {
		return () => {
			manager.maybePauseQueryReplications(query);
		};
	}, [query, manager]);

	return query;
};
