import * as React from 'react';

import { useObservable } from 'observable-hooks';
import { combineLatest, of } from 'rxjs';
import { map, switchMap } from 'rxjs/operators';

import { getLogger } from '@wcpos/utils/logger';

import { useQueryManager } from './provider';

import type { RegisterQueryConfig } from './manager';
import type { Query } from './query-state';

const logger = getLogger(['wcpos', 'query', 'useReplicationState']);

function getQueryID(query: string | RegisterQueryConfig['queryKeys'] | Query<any>) {
	if (typeof query === 'string') {
		return query;
	} else if (Array.isArray(query)) {
		return JSON.stringify(query);
	} else {
		return query.id;
	}
}

/**
 * @param query - Can be query ID, query keys or query object
 */
export const useReplicationState = (
	query: string | RegisterQueryConfig['queryKeys'] | Query<any>
) => {
	const queryID = getQueryID(query);
	const manager = useQueryManager();

	// Force re-fetch counter - incremented when we detect stale replication
	const [refreshCounter, setRefreshCounter] = React.useState(0);

	/**
	 * Get the collection replication state, refreshing when counter changes
	 */
	const collectionReplication = React.useMemo(() => {
		const repl = manager.activeCollectionReplications.get(queryID);
		logger.debug('[DEBUG_REPL] useMemo getting collectionReplication', {
			context: {
				queryID,
				refreshCounter,
				hasReplication: !!repl,
				endpoint: repl?.endpoint,
			},
		});
		return repl;
	}, [manager, queryID, refreshCounter]);

	/**
	 * Get the query replication state, refreshing when counter changes
	 */
	const queryReplication = React.useMemo(() => {
		const repl = manager.activeQueryReplications.get(queryID);
		logger.debug('[DEBUG_REPL] useMemo getting queryReplication', {
			context: {
				queryID,
				refreshCounter,
				hasReplication: !!repl,
				endpoint: repl?.endpoint,
			},
		});
		return repl;
	}, [manager, queryID, refreshCounter]);

	/**
	 * Listen for replication changes and refresh.
	 * Handles both add$ signals and mount-time stale detection for Suspense.
	 */
	React.useEffect(() => {
		// Check on mount: if manager has a different replication than what we cached,
		// we need to refresh (handles Suspense race condition)
		const currentReplication = manager.activeCollectionReplications.get(queryID);
		const isStale = currentReplication && currentReplication !== collectionReplication;

		logger.debug('[DEBUG_REPL] useEffect mount check', {
			context: {
				queryID,
				refreshCounter,
				hasCurrentInManager: !!currentReplication,
				hasCachedReplication: !!collectionReplication,
				isStale,
				currentEndpoint: currentReplication?.endpoint,
				cachedEndpoint: collectionReplication?.endpoint,
			},
		});

		if (isStale) {
			setRefreshCounter((c) => c + 1);
		}

		// Subscribe to add$ for future changes
		const sub = manager.activeCollectionReplications.add$.subscribe((id) => {
			if (id === queryID) {
				logger.debug('[DEBUG_REPL] add$ fired, incrementing refreshCounter', {
					context: { queryID },
				});
				setRefreshCounter((c) => c + 1);
			}
		});
		return () => sub.unsubscribe();
	}, [manager, queryID, collectionReplication, refreshCounter]);

	/**
	 * Combine the active$ observables of collectionReplication and queryReplication
	 */
	const active$ = useObservable(
		(inputs$) =>
			inputs$.pipe(
				switchMap(([collectionReplication, queryReplication]) => {
					logger.debug('[DEBUG_ACTIVE] switchMap triggered', {
						context: {
							queryID,
							hasCollectionReplication: !!collectionReplication,
							hasQueryReplication: !!queryReplication,
							hasCollectionActive$: !!collectionReplication?.active$,
							hasQueryActive$: !!queryReplication?.active$,
						},
					});
					return combineLatest(
						collectionReplication?.active$ || of(false),
						queryReplication?.active$ || of(false)
					).pipe(
						map(([collectionActive, queryActive]) => {
							const isActive = collectionActive || queryActive;
							logger.debug('[DEBUG_ACTIVE] active$ emitting', {
								context: { queryID, collectionActive, queryActive, isActive },
							});
							return isActive;
						})
					);
				})
			),
		[collectionReplication, queryReplication]
	);

	/**
	 * Trigger a manual sync of both collection and query replications
	 */
	const sync = React.useCallback(async () => {
		await collectionReplication?.run({ force: true });
		await queryReplication?.run({ force: true });
	}, [collectionReplication, queryReplication]);

	return {
		active$,
		sync,
		total$: collectionReplication?.total$,
		collectionReplication,
		queryReplication,
	};
};
