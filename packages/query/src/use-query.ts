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

/**
 * Create a stable identity key from query options.
 * This determines when a query should be re-registered.
 *
 * Includes: collectionName, queryKeys, locale, endpoint
 * Excludes: initialParams (changed via setParams), hooks (callbacks)
 */
function getQueryIdentityKey(options: QueryOptions): string {
	return JSON.stringify({
		collectionName: options.collectionName,
		queryKeys: options.queryKeys,
		locale: options.locale,
		endpoint: options.endpoint,
	});
}

export const useQuery = (queryOptions: QueryOptions) => {
	const manager = useQueryManager();

	// Stable identity key - changes only when query identity changes
	const identityKey = getQueryIdentityKey(queryOptions);

	// Store queryOptions in a ref so useMemo callbacks have access to current value
	// without adding queryOptions to dependency array
	const queryOptionsRef = React.useRef(queryOptions);
	queryOptionsRef.current = queryOptions;

	/**
	 * Register query immediately when manager or identity changes.
	 * This handles store switches and query key changes.
	 */
	const initialQuery = React.useMemo(() => {
		logger.debug('Registering query', {
			context: {
				collectionName: queryOptionsRef.current.collectionName,
				queryKeys: queryOptionsRef.current.queryKeys,
			},
		});
		return manager.registerQuery(queryOptionsRef.current);
		// eslint-disable-next-line react-hooks/exhaustive-deps -- identityKey triggers re-registration when query identity changes
	}, [manager, identityKey]);

	/**
	 * Observable that emits queries:
	 * 1. Immediately emits initialQuery via startWith (handles manager changes)
	 * 2. Re-emits when collection is reset via reset$
	 */
	const query$ = React.useMemo(
		() =>
			manager.localDB.reset$.pipe(
				filter((collection) => collection.name === queryOptionsRef.current.collectionName),
				map(() => {
					logger.debug('Re-registering query after collection reset', {
						context: { collectionName: queryOptionsRef.current.collectionName },
					});
					return manager.registerQuery(queryOptionsRef.current);
				}),
				startWith(initialQuery)
			),
		// eslint-disable-next-line react-hooks/exhaustive-deps -- identityKey triggers re-registration when query identity changes
		[manager, identityKey, initialQuery]
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
