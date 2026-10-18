import * as React from 'react';

import { useObservableState } from 'observable-hooks';
import { combineLatest, of, timer } from 'rxjs';
import { catchError, map, switchMap } from 'rxjs/operators';

import {
	observeClockCheckRows,
	observeLogVolume,
	observeRecordOutcomeRows,
	type StoreLocalDatabase,
} from '@wcpos/query/store-local';

import { useAppState } from '../../../contexts/app-state';
import {
	type ClockSkewWarning,
	deriveClockSkew,
	deriveStuckRecords,
	startOfLocalDay,
	type StuckRecord,
} from './logs-logic';

import type { Observable } from 'rxjs';

/** Re-derive the day boundary once a minute. */
const REFRESH_MS = 60_000;

/**
 * Log categories whose settled `sync.record` rows count towards stuck records.
 * Each is scanned as a prefix range on the `[category, timestamp]` index.
 */
const STUCK_RECORD_DOMAINS = [
	'wcpos.sync',
	'wcpos.payments',
	'wcpos.checkout',
	'wcpos.terminal-payments',
] as const;

// Bound each reactive result/OPFS clone even for an existing escalation storm.
// 5,000 covers the reported 1,652 stuck records with headroom, not all history.
// Applied per domain range scan, so each domain keeps its own newest window.
const STUCK_OUTCOME_LIMIT = 5_000;

export type LogStats = {
	/**
	 * LOG VOLUME, not a fault-counter family (CONTEXT.md § Language — Fault
	 * counters). These count what HAPPENED today, derived from the row level —
	 * never what is outstanding. `errorsToday` will not agree with the sync
	 * backlog or with needs-a-decision and is not meant to: a backlog cleared
	 * this morning leaves its errors in today's count, and a quiet day can still
	 * end with a full queue.
	 */
	eventsToday: number;
	errorsToday: number;
	stuck: StuckRecord[];
	clockSkew: ClockSkewWarning | null;
};

const EMPTY_STATS: LogStats = { eventsToday: 0, errorsToday: 0, stuck: [], clockSkew: null };

/**
 * Module-scope factory: every Date.now() here runs at subscription/emission
 * time (rx callbacks), never during render.
 */
function createLogStats$(storeDB: StoreLocalDatabase): Observable<LogStats> {
	// Rebuild the inner queries on every tick (not just day-boundary changes):
	// re-subscribing is how a tick that hit the catchError below gets retried
	// within a minute instead of staying zeroed until midnight.
	return timer(0, REFRESH_MS).pipe(
		switchMap(() => {
			const dayStart = startOfLocalDay(Date.now());
			const volume$ = observeLogVolume(storeDB, dayStart);
			// A row cap bounds repeated materialization without a timestamp cutoff:
			// quiet failures remain visible until newer outcomes displace them.
			// This is a recent diagnostic window, not the engine's standing ledger;
			// older unresolved records can fall out. Keep successes in the window
			// so their latest decisive row still clears a failure (#2058).
			// One range scan per domain that writes settled record outcomes, merged before
			// the derivation rules per record. A refused payment is written by the checkout
			// path under `wcpos.payments` with the same terminal shape as a sync rejection,
			// and scanning only the sync range is why a till could lose a payment and still
			// report 0 stuck.
			const stuck$ = observeRecordOutcomeRows(
				storeDB,
				STUCK_RECORD_DOMAINS,
				STUCK_OUTCOME_LIMIT
			).pipe(map(deriveStuckRecords));
			const clockSkew$ = observeClockCheckRows(storeDB).pipe(
				map((rows) => deriveClockSkew(rows, Date.now()))
			);
			return combineLatest([volume$, stuck$, clockSkew$]).pipe(
				map(([{ eventsToday, errorsToday }, stuck, clockSkew]): LogStats => ({
					eventsToday,
					errorsToday,
					stuck,
					clockSkew,
				})),
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
 * index; the stuck-records derivation reads a bounded window of record outcomes
 * per settled domain (see `STUCK_RECORD_DOMAINS`) and rules per record within
 * that window.
 */
export function useLogStats(): LogStats {
	const { storeDB } = useAppState();
	const stats$ = React.useMemo(() => createLogStats$(storeDB), [storeDB]);

	return useObservableState(stats$, EMPTY_STATS);
}
