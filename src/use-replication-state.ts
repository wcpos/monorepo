import * as React from 'react';

import { useObservableState, useObservable } from 'observable-hooks';
import { combineLatest, of } from 'rxjs';
import { filter, map, switchMap } from 'rxjs/operators';

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

	/**
	 * Get the collection replication state for the query
	 */
	const collectionReplication = useObservableState(
		manager.activeCollectionReplications.add$.pipe(
			filter((id) => id === queryID),
			map(() => {
				return manager.activeCollectionReplications.get(queryID);
			})
		),
		manager.activeCollectionReplications.get(queryID)
	);

	/**
	 * Get the query replication state for the query
	 */
	const queryReplication = useObservableState(
		manager.activeQueryReplications.add$.pipe(
			filter((id) => id === queryID),
			map(() => {
				return manager.activeQueryReplications.get(queryID);
			})
		),
		manager.activeQueryReplications.get(queryID)
	);

	/**
	 * Combine the active$ observables of collectionReplication and queryReplication
	 */
	const active$ = useObservable(
		(inputs$) =>
			inputs$.pipe(
				switchMap(([collectionReplication, queryReplication]) => {
					// Combine the active$ observables of collectionReplication and queryReplication
					return combineLatest(
						collectionReplication?.active$ || of(false),
						queryReplication?.active$ || of(false)
					).pipe(
						map(([collectionActive, queryActive]) => {
							// Return true if either collection or query is active
							return collectionActive || queryActive;
						})
					);
				})
			),
		[collectionReplication, queryReplication]
	);

	/**
	 *
	 */
	const sync = React.useCallback(() => {
		console.log('sync');
	}, []);

	return {
		active$,
		sync,
		total$: collectionReplication.total$,
		collectionReplication,
		queryReplication,
	};
};
