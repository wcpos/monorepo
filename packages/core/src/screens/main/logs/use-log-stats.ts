import * as React from 'react';

import { useObservableState } from 'observable-hooks';
import { combineLatest, of, timer } from 'rxjs';
import { catchError, map, switchMap } from 'rxjs/operators';

import { useLocalCollection$ } from '@wcpos/query';

import {
	type ClockSkewWarning,
	deriveClockSkew,
	deriveStuckRecords,
	type LogRow,
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

type LogsCollectionLike = {
	count(query: { selector: Record<string, unknown> }): { $: Observable<number> };
	find(query: {
		selector: Record<string, unknown>;
		sort: Record<string, 'asc' | 'desc'>[];
		limit?: number;
	}): {
		$: Observable<{ toJSON(): LogRow }[]>;
	};
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
			const stuck$ = combineLatest(
				STUCK_RECORD_DOMAINS.map(
					(domain) =>
						logsCollection.find({
							selector: {
								category: { $gte: domain, $lt: `${domain}/` },
								operationType: { $eq: 'sync.record' },
							},
							sort: [{ timestamp: 'desc' }],
							limit: STUCK_OUTCOME_LIMIT,
						}).$
				)
			).pipe(
				map((perDomain) =>
					deriveStuckRecords(
						perDomain
							.flat()
							.map((doc) => doc.toJSON())
							// Each query sorts its own domain, so the concatenation is grouped by
							// domain rather than by time. The derivation takes the FIRST row per
							// record as decisive, so an older sync success would otherwise mask a
							// newer payment refusal on the same order.
							.sort((a, b) => b.timestamp - a.timestamp)
					)
				)
			);
			// The engine writes its once-per-store-open clock check to this exact
			// category at `warn`; the derivation ignores unrelated warn rows.
			const clockSkew$ = logsCollection
				.find({
					selector: {
						category: { $eq: 'wcpos.sync.engine' },
						level: { $eq: 'warn' },
					},
					sort: [{ timestamp: 'desc' }],
				})
				.$.pipe(
					map((docs) =>
						deriveClockSkew(
							docs.map((doc) => doc.toJSON()),
							Date.now()
						)
					)
				);
			return combineLatest([events$, errors$, stuck$, clockSkew$]).pipe(
				map(([eventsToday, errorsToday, stuck, clockSkew]): LogStats => ({
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
	// Follow the collection: logs-storage-recovery removes and re-creates `logs`
	// in place, and the stat header has nothing to re-render it when that lands.
	const collection$ = useLocalCollection$('logs');

	const stats$ = React.useMemo(
		() =>
			collection$.pipe(
				switchMap((collection) =>
					collection
						? createLogStats$(collection as unknown as LogsCollectionLike)
						: of(EMPTY_STATS)
				)
			),
		[collection$]
	);

	return useObservableState(stats$, EMPTY_STATS);
}
