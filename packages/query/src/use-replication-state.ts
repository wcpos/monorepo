import * as React from 'react';

import { useObservable } from 'observable-hooks';
import { combineLatest, of } from 'rxjs';
import { map, switchMap } from 'rxjs/operators';

import { useQueryManager } from './provider';

import type { RegisterQueryConfig } from './manager';
import type { Query } from './query-state';

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
		return manager.activeCollectionReplications.get(queryID);
		// eslint-disable-next-line react-hooks/exhaustive-deps -- refreshCounter is a cache buster to force re-fetch from Map
	}, [manager, queryID, refreshCounter]);

	/**
	 * Get the query replication state, refreshing when counter changes
	 */
	const queryReplication = React.useMemo(() => {
		return manager.activeQueryReplications.get(queryID);
		// eslint-disable-next-line react-hooks/exhaustive-deps -- refreshCounter is a cache buster to force re-fetch from Map
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

		if (isStale) {
			setRefreshCounter((c) => c + 1);
		}

		// Subscribe to add$ for future changes
		const sub = manager.activeCollectionReplications.add$.subscribe((id) => {
			if (id === queryID) {
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
					return combineLatest(
						collectionReplication?.active$ || of(false),
						queryReplication?.active$ || of(false)
					).pipe(map(([collectionActive, queryActive]) => collectionActive || queryActive));
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
