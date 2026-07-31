import * as React from 'react';

import { useObservableState } from 'observable-hooks';
import { combineLatest, of, timer } from 'rxjs';
import { catchError, distinctUntilChanged, map, switchMap } from 'rxjs/operators';

import { useQueryManager } from '@wcpos/query';

import { deriveStuckRecords, type LogRow, startOfLocalDay, type StuckRecord } from './logs-logic';

import type { Observable } from 'rxjs';

const DAY_MS = 24 * 60 * 60 * 1000;
/** Re-derive the day boundary (and the stuck 24 h window) once a minute. */
const REFRESH_MS = 60_000;
/** sync.record rows are sparse; 500 recent sync rows is a generous window. */
const STUCK_SCAN_LIMIT = 500;

export type LogStats = {
	eventsToday: number;
	errorsToday: number;
	stuck: StuckRecord[];
};

const EMPTY_STATS: LogStats = { eventsToday: 0, errorsToday: 0, stuck: [] };

type LogsCollectionLike = {
	count(query: { selector: Record<string, unknown> }): { $: Observable<number> };
	find(query: {
		selector: Record<string, unknown>;
		sort: Record<string, 'asc' | 'desc'>[];
		limit: number;
	}): { $: Observable<{ toJSON(): LogRow }[]> };
};

/**
 * Module-scope factory: every Date.now() here runs at subscription/emission
 * time (rx callbacks), never during render.
 */
function createLogStats$(logsCollection: LogsCollectionLike): Observable<LogStats> {
	return timer(0, REFRESH_MS).pipe(
		map(() => startOfLocalDay(Date.now())),
		distinctUntilChanged(),
		switchMap((dayStart) => {
			const events$ = logsCollection.count({
				selector: {
					timestamp: { $gte: dayStart },
					level: { $in: ['info', 'warn', 'error'] },
				},
			}).$;
			const errors$ = logsCollection.count({
				selector: { level: { $eq: 'error' }, timestamp: { $gte: dayStart } },
			}).$;
			const stuck$ = logsCollection
				.find({
					selector: {
						category: { $gte: 'wcpos.sync', $lt: 'wcpos.sync/' },
						timestamp: { $gte: Date.now() - DAY_MS },
					},
					sort: [{ timestamp: 'desc' }],
					limit: STUCK_SCAN_LIMIT,
				})
				.$.pipe(map((docs) => deriveStuckRecords(docs.map((doc) => doc.toJSON()))));
			return combineLatest([events$, errors$, stuck$]).pipe(
				map(([eventsToday, errorsToday, stuck]): LogStats => ({ eventsToday, errorsToday, stuck }))
			);
		}),
		// Storage trouble must not take the whole Logs tab down — the ledger has
		// its own recovery; the header quietly reads zero.
		catchError(() => of(EMPTY_STATS))
	);
}

/**
 * Live counts for the Logs stat header. Counts use the `[level, timestamp]`
 * index; the stuck-records derivation scans recent sync-domain rows via the
 * `[category, timestamp]` index and rules per record (spec §4).
 */
export function useLogStats(): LogStats {
	const manager = useQueryManager();
	const logsCollection = (manager.localDB as { collections?: Record<string, unknown> })?.collections
		?.logs as LogsCollectionLike | undefined;

	const stats$ = React.useMemo(
		() => (logsCollection ? createLogStats$(logsCollection) : of(EMPTY_STATS)),
		[logsCollection]
	);

	return useObservableState(stats$, EMPTY_STATS);
}
