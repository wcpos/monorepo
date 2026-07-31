import * as React from 'react';

import { useObservableState } from 'observable-hooks';
import { combineLatest, of, timer } from 'rxjs';
import { catchError, map, switchMap } from 'rxjs/operators';

import { useQueryManager } from '@wcpos/query';

import { deriveStuckRecords, type LogRow, startOfLocalDay, type StuckRecord } from './logs-logic';

import type { Observable } from 'rxjs';

/** Re-derive the day boundary once a minute. */
const REFRESH_MS = 60_000;
/**
 * Upper bound on scanned record-outcome rows. The selector narrows to
 * `sync.record` rows, which repeat-collapse to one row per (record, reason) —
 * 500 collapsed outcome rows is far beyond any real backlog, so the limit is
 * a runaway guard, not a coverage window.
 */
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
	// Rebuild the inner queries on every tick (not just day-boundary changes):
	// re-subscribing is how a tick that hit the catchError below gets retried
	// within a minute instead of staying zeroed until midnight.
	return timer(0, REFRESH_MS).pipe(
		switchMap(() => {
			const dayStart = startOfLocalDay(Date.now());
			const events$ = logsCollection.count({
				selector: {
					timestamp: { $gte: dayStart },
					level: { $in: ['info', 'warn', 'error'] },
				},
			}).$;
			const errors$ = logsCollection.count({
				selector: { level: { $eq: 'error' }, timestamp: { $gte: dayStart } },
			}).$;
			// No time window: a stuck record stays stuck until a decisive `ok` row —
			// repeat-collapse keeps the ORIGINAL `timestamp` (only `lastSeen` moves),
			// and a permanently rejected record may never write again, so any cutoff
			// on `timestamp` silently un-sticks real failures. Retention (30 days)
			// is the honest horizon. The `[category, timestamp]` index bounds the
			// scan to the sync domain; `operationType` narrows it to outcome rows.
			const stuck$ = logsCollection
				.find({
					selector: {
						category: { $gte: 'wcpos.sync', $lt: 'wcpos.sync/' },
						operationType: { $eq: 'sync.record' },
					},
					sort: [{ timestamp: 'desc' }],
					limit: STUCK_SCAN_LIMIT,
				})
				.$.pipe(map((docs) => deriveStuckRecords(docs.map((doc) => doc.toJSON()))));
			return combineLatest([events$, errors$, stuck$]).pipe(
				map(([eventsToday, errorsToday, stuck]): LogStats => ({ eventsToday, errorsToday, stuck })),
				// Storage trouble must not take the whole Logs tab down — the ledger
				// has its own recovery; the header quietly reads zero for this tick
				// and the outer timer retries on the next one (an outer catchError
				// would complete the stream permanently).
				catchError(() => of(EMPTY_STATS))
			);
		})
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
