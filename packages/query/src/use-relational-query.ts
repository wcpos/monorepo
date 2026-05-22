import * as React from 'react';

import { useObservableState } from 'observable-hooks';
import { filter, map, startWith } from 'rxjs/operators';

import { getLogger } from '@wcpos/utils/logger';

import { useQueryManager } from './provider';

import type { QueryOptions } from './use-query';

const logger = getLogger(['wcpos', 'query', 'useRelationalQuery']);

/**
 * Create a stable identity key from query options.
 */
function getQueryIdentityKey(options: QueryOptions): string {
	return JSON.stringify({
		collectionName: options.collectionName,
		queryKeys: options.queryKeys,
		locale: options.locale,
		endpoint: options.endpoint,
		greedy: options.greedy,
		infiniteScroll: options.infiniteScroll,
		pageSize: options.pageSize,
	});
}

export const useRelationalQuery = (parentOptions: QueryOptions, childOptions: QueryOptions) => {
	const manager = useQueryManager();

	// Stable identity keys
	const parentIdentityKey = getQueryIdentityKey(parentOptions);
	const childIdentityKey = getQueryIdentityKey(childOptions);

	/**
	 * Helper function to register all necessary queries.
	 *
	 * Reads `parentOptions`/`childOptions` directly from the render closure. The
	 * callback is only recreated when the identity keys change, so the captured
	 * options always carry the current identity. `registerQuery` is keyed by
	 * queryKeys, so excluded fields (initialParams/hooks) do not affect the result.
	 */
	const registerQueries = React.useCallback(() => {
		const parent = parentOptions;
		const child = childOptions;

		logger.debug('Registering relational queries', {
			context: {
				parentCollection: parent.collectionName,
				childCollection: child.collectionName,
			},
		});

		try {
			const childQuery = manager.registerQuery(child)!;

			const parentLookupQuery = manager.registerQuery({
				...parent,
				queryKeys: [...parent.queryKeys, 'parentLookup'],
				initialParams: {
					selector: {
						id: { $in: [] },
					},
				},
				infiniteScroll: false,
			})!;

			const parentQuery = manager.registerRelationalQuery(parent, childQuery, parentLookupQuery);

			return { childQuery, parentLookupQuery, parentQuery };
		} catch (error: any) {
			logger.error('Error registering queries', {
				showToast: false,
				saveToDb: false,
				context: { error: error.message, stack: error.stack },
			});
			throw error;
		}
	}, [manager, parentIdentityKey, childIdentityKey]);

	/**
	 * Register queries immediately when manager or identity changes.
	 */
	const initialQueries = React.useMemo(() => registerQueries(), [registerQueries]);

	/**
	 * Observable that emits queries:
	 * 1. Immediately emits initialQueries via startWith
	 * 2. Re-emits when collection is reset via reset$
	 */
	const queries$ = React.useMemo(
		() =>
			(manager.localDB as any).reset$.pipe(
				filter(
					(collection: any) =>
						collection.name === parentOptions.collectionName ||
						collection.name === childOptions.collectionName
				),
				map(() => {
					logger.debug('Re-registering relational queries after collection reset', {
						context: {
							parentCollectionName: parentOptions.collectionName,
							childCollectionName: childOptions.collectionName,
						},
					});
					return registerQueries();
				}),
				startWith(initialQueries)
			),
		[manager, parentIdentityKey, childIdentityKey, registerQueries, initialQueries]
	);

	/**
	 * Subscribe to queries$ - will immediately emit initialQueries,
	 * then update if collection is reset.
	 */
	const { parentQuery, childQuery, parentLookupQuery } = useObservableState(
		queries$,
		initialQueries
	);

	/**
	 * Cleanup: pause replications when component unmounts
	 */
	React.useEffect(() => {
		return () => {
			if (parentQuery) manager.maybePauseQueryReplications(parentQuery);
			if (childQuery) manager.maybePauseQueryReplications(childQuery);
			if (parentLookupQuery) manager.maybePauseQueryReplications(parentLookupQuery);
		};
	}, [parentQuery, childQuery, parentLookupQuery, manager]);

	return { parentQuery };
};
