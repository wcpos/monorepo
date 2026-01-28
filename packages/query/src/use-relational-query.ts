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
	});
}

export const useRelationalQuery = (parentOptions: QueryOptions, childOptions: QueryOptions) => {
	const manager = useQueryManager();

	// Stable identity keys
	const parentIdentityKey = getQueryIdentityKey(parentOptions);
	const childIdentityKey = getQueryIdentityKey(childOptions);

	// Store options in refs for access in callbacks without adding to deps
	const parentOptionsRef = React.useRef(parentOptions);
	const childOptionsRef = React.useRef(childOptions);
	parentOptionsRef.current = parentOptions;
	childOptionsRef.current = childOptions;

	/**
	 * Helper function to register all necessary queries.
	 */
	const registerQueries = React.useCallback(() => {
		const parent = parentOptionsRef.current;
		const child = childOptionsRef.current;

		logger.debug('Registering relational queries', {
			context: {
				parentCollection: parent.collectionName,
				childCollection: child.collectionName,
			},
		});

		try {
			const childQuery = manager.registerQuery(child);

			const parentLookupQuery = manager.registerQuery({
				...parent,
				queryKeys: [...parent.queryKeys, 'parentLookup'],
				initialParams: {
					selector: {
						id: { $in: [] },
					},
				},
				infiniteScroll: false,
			});

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
			manager.localDB.reset$.pipe(
				filter((collection) => collection.name === parentOptionsRef.current.collectionName),
				map(() => {
					logger.debug('Re-registering relational queries after collection reset', {
						context: { collectionName: parentOptionsRef.current.collectionName },
					});
					return registerQueries();
				}),
				startWith(initialQueries)
			),
		[manager, parentIdentityKey, registerQueries, initialQueries]
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
			manager.maybePauseQueryReplications(parentQuery);
			manager.maybePauseQueryReplications(childQuery);
			manager.maybePauseQueryReplications(parentLookupQuery);
		};
	}, [parentQuery, childQuery, parentLookupQuery, manager]);

	return { parentQuery };
};
