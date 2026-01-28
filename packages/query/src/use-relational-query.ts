import * as React from 'react';

import { useObservableState } from 'observable-hooks';
import { filter, map, startWith } from 'rxjs/operators';

import { getLogger } from '@wcpos/utils/logger';

import { useQueryManager } from './provider';

import type { QueryOptions } from './use-query';

const logger = getLogger(['wcpos', 'query', 'useRelationalQuery']);

export const useRelationalQuery = (parentOptions: QueryOptions, childOptions: QueryOptions) => {
	const manager = useQueryManager();

	/**
	 * Helper function to register all necessary queries.
	 */
	const registerQueries = React.useCallback(() => {
		logger.debug('Registering relational queries', {
			context: {
				parentCollection: parentOptions.collectionName,
				childCollection: childOptions.collectionName,
			},
		});

		try {
			logger.debug('Registering childQuery', {
				context: { collection: childOptions.collectionName },
			});
			const childQuery = manager.registerQuery(childOptions);

			logger.debug('Registering parentLookupQuery', {
				context: { collection: parentOptions.collectionName },
			});
			const parentLookupQuery = manager.registerQuery({
				...parentOptions,
				queryKeys: [...parentOptions.queryKeys, 'parentLookup'],
				initialParams: {
					selector: {
						id: { $in: [] },
					},
				},
				infiniteScroll: false,
			});

			logger.debug('Registering parentQuery (relational)', {
				context: { collection: parentOptions.collectionName },
			});
			const parentQuery = manager.registerRelationalQuery(
				parentOptions,
				childQuery,
				parentLookupQuery
			);

			logger.debug('All queries registered', {
				context: {
					childQuery: !!childQuery,
					parentLookupQuery: !!parentLookupQuery,
					parentQuery: !!parentQuery,
				},
			});

			return { childQuery, parentLookupQuery, parentQuery };
		} catch (error: any) {
			logger.error('Error registering queries', {
				showToast: false,
				saveToDb: false,
				context: { error: error.message, stack: error.stack },
			});
			throw error;
		}
	}, [manager, parentOptions, childOptions]);

	/**
	 * Register queries immediately when manager changes.
	 * This is used as the starting value for the observable stream.
	 */
	const initialQueries = React.useMemo(() => registerQueries(), [registerQueries]);

	/**
	 * Observable that emits queries:
	 * 1. Immediately emits initialQueries via startWith (handles manager changes)
	 * 2. Re-emits when collection is reset via reset$
	 *
	 * startWith ensures we always get the current queries even before reset$ emits.
	 */
	const queries$ = React.useMemo(
		() =>
			manager.localDB.reset$.pipe(
				filter((collection) => {
					logger.debug('useRelationalQuery: reset$ received', {
						context: {
							receivedCollection: collection.name,
							filteringFor: parentOptions.collectionName,
							matches: collection.name === parentOptions.collectionName,
						},
					});
					return collection.name === parentOptions.collectionName;
				}),
				map(() => {
					logger.debug('Re-registering relational queries after collection reset', {
						context: { collectionName: parentOptions.collectionName },
					});
					return registerQueries();
				}),
				startWith(initialQueries)
			),
		[manager, parentOptions.collectionName, registerQueries, initialQueries]
	);

	/**
	 * Subscribe to queries$ - will immediately emit initialQueries,
	 * then update if collection is reset.
	 */
	const { parentQuery, childQuery, parentLookupQuery } = useObservableState(
		queries$,
		initialQueries
	);

	// Diagnostic: log on EVERY render
	const db = manager.localDB as any;
	const currentCollection = db.collections?.[parentOptions.collectionName];
	logger.debug('useRelationalQuery: render', {
		context: {
			parentCollection: parentOptions.collectionName,
			hasParentQuery: !!parentQuery,
			parentQueryId: parentQuery?.id,
			isSameCollection: parentQuery ? currentCollection === parentQuery.collection : 'n/a',
			queryCollectionDestroyed: parentQuery ? (parentQuery.collection as any)?.destroyed : 'n/a',
			currentCollectionExists: !!currentCollection,
		},
	});

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
