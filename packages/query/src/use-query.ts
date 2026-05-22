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
	greedy?: boolean;
	infiniteScroll?: boolean;
	pageSize?: number;
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

	/**
	 * Register query immediately when manager or identity changes.
	 * This handles store switches and query key changes.
	 *
	 * Reads `queryOptions` directly from the render closure. The memo only
	 * re-runs when `manager` or `identityKey` change, so the captured options
	 * always carry the current query identity. `registerQuery` is keyed by
	 * queryKeys, so excluded fields (initialParams/hooks) do not affect the result.
	 */
	const initialQuery = React.useMemo(() => {
		logger.debug('Registering query', {
			context: {
				collectionName: queryOptions.collectionName,
				queryKeys: queryOptions.queryKeys,
			},
		});
		return manager.registerQuery(queryOptions);
	}, [manager, identityKey]);

	/**
	 * Observable that emits queries:
	 * 1. Immediately emits initialQuery via startWith (handles manager changes)
	 * 2. Re-emits when collection is reset via reset$
	 *
	 * The reset$ operator callbacks run asynchronously during subscription, not
	 * during render. They read `queryOptions` from the closure of the render
	 * where the memo last re-ran (identity-equivalent to the latest options).
	 */
	const query$ = React.useMemo(
		() =>
			(manager.localDB as any).reset$.pipe(
				filter((collection: any) => collection.name === queryOptions.collectionName),
				map(() => {
					logger.debug('Re-registering query after collection reset', {
						context: { collectionName: queryOptions.collectionName },
					});
					return manager.registerQuery(queryOptions);
				}),
				startWith(initialQuery)
			),
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
			if (query) {
				manager.maybePauseQueryReplications(query);
			}
		};
	}, [query, manager]);

	return query;
};
