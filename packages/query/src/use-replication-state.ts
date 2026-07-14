import * as React from 'react';

import { useObservable } from 'observable-hooks';
import { of } from 'rxjs';
import { distinctUntilChanged, map, switchMap } from 'rxjs/operators';

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
 * `useReplicationState` — best-effort 1b projection over the engine demand plane
 * (ADR 0023 / ADR 0027). The old per-query replication states are gone; the
 * `{ active$, total$, totalSource$, sync }` shape is preserved/extended for components:
 *
 *  - `active$`  — in-flight demand THIS surface initiated OR fixed-coverage
 *    lane activity mapped to the query's collection.
 *  - `total$`   — the manager's coverage-aware projection (fresh engine query
 *    total / complete-lane cardinality where available, local count fallback).
 *  - `totalSource$` — whether `total$` is verified coverage or a local fallback.
 *  - `sync()`   — forced re-declaration of the bound query's requirement
 *    (forceRefresh) then a scheduler drain — never a bare `engine.sync()`.
 *
 * @param query - query ID, query keys, or a Query object.
 */
export const useReplicationState = (
	query: string | RegisterQueryConfig['queryKeys'] | Query<any>
) => {
	const queryID = getQueryID(query);
	const manager = useQueryManager();
	const directQuery =
		typeof query === 'object' && !Array.isArray(query) ? (query as Query<any>) : undefined;

	// active$: in-flight demand for this query (re-resolved each render, cheap).
	const active$ = useObservable(
		(inputs$) =>
			inputs$.pipe(
				switchMap(([id]) => manager.replicationActive$(id as string) ?? of(false)),
				distinctUntilChanged()
			),
		[queryID]
	);

	// total$: coverage-aware where the engine exposes a matching lane; local fallback.
	const total$ = useObservable(
		(inputs$) =>
			inputs$.pipe(
				switchMap(
					([id, queryState]) =>
						manager.replicationTotal$(id as string) ??
						(queryState
							? (queryState as Query<any>).result$.pipe(map((result) => result.count ?? 0))
							: of(0))
				),
				distinctUntilChanged()
			),
		[queryID, directQuery]
	);

	const totalSource$ = useObservable(
		(inputs$) =>
			inputs$.pipe(
				switchMap(([id]) => manager.replicationTotalSource$(id as string) ?? of('local' as const)),
				distinctUntilChanged()
			),
		[queryID]
	);

	const sync = React.useCallback(async () => {
		await manager.syncQuery(queryID);
	}, [manager, queryID]);

	return {
		active$,
		sync,
		total$,
		totalSource$,
	};
};
