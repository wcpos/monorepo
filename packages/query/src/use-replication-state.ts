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

	// Force re-render trigger — stable dispatch avoids dependency cycles
	const [, forceUpdate] = React.useReducer((c: number) => c + 1, 0);

	// Fresh lookup every render (cheap Map.get)
	const collectionReplication = manager.activeCollectionReplications.get(queryID);
	const queryReplication = manager.activeQueryReplications.get(queryID);

	// Track the render-time values so the effect can detect stale reads
	const lastSeenCollectionRef = React.useRef(collectionReplication);
	lastSeenCollectionRef.current = collectionReplication;
	const lastSeenQueryRef = React.useRef(queryReplication);
	lastSeenQueryRef.current = queryReplication;

	/**
	 * Subscribe to replication add$ events and handle Suspense race condition.
	 * Only depends on manager and queryID — forceUpdate is a stable dispatch.
	 */
	React.useEffect(() => {
		// Stale check: replications may have been added between render and effect
		const currentCollection = manager.activeCollectionReplications.get(queryID);
		if (currentCollection !== lastSeenCollectionRef.current) {
			forceUpdate();
		}
		const currentQuery = manager.activeQueryReplications.get(queryID);
		if (currentQuery !== lastSeenQueryRef.current) {
			forceUpdate();
		}

		const collectionSub = manager.activeCollectionReplications.add$.subscribe((id) => {
			if (id === queryID) {
				forceUpdate();
			}
		});
		const querySub = manager.activeQueryReplications.add$.subscribe((id) => {
			if (id === queryID) {
				forceUpdate();
			}
		});
		return () => {
			collectionSub.unsubscribe();
			querySub.unsubscribe();
		};
	}, [manager, queryID]);

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
