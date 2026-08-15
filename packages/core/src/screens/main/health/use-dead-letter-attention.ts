import * as React from 'react';

import { Observable, of } from 'rxjs';
import { map, switchMap } from 'rxjs/operators';

import { useQueryRuntime } from '@wcpos/query';
import { MUTATION_QUEUE_RXDB_COLLECTION } from '@wcpos/sync-engine';
import type { EngineConflict, RxdbSyncEngine } from '@wcpos/sync-engine';

import type { StuckRecord } from '../logs/logs-logic';

/**
 * "Needs attention" derived from the DURABLE queue instead of session logs
 * (#832 follow-up).
 *
 * The banner on Store health → Database was built from `deriveStuckRecords(logs)`,
 * and the log feed is per-session: the 2026-08-06 dev-next smoke watched it
 * disappear on restart while the refused write was still sitting in the queue.
 * If that banner is the only surface a cashier ever sees, a restart hides a sale
 * that never reached the server — the failure mode #832 exists to end, reached by
 * simply quitting the app.
 *
 * A `rejected` row is durable, so it survives the restart and keeps saying so.
 * These rows are deliberately NOT retryable: a plain engine tick cannot fix a
 * payload the server permanently refused (that is what `requeue-rebuilt` is for),
 * so the panel offers Fix record / View log rather than a Retry that would do
 * nothing.
 *
 * Non-suspending on purpose — this feeds a banner that must render on a screen
 * whose other panels are already live, and a banner is not worth a Suspense
 * boundary of its own.
 */
type MutationCollection = {
	find(query: { selector: { status: { $in: string[] } } }): {
		$: Observable<readonly (EngineConflict | { toJSON(): EngineConflict })[]>;
	};
};

type EngineDatabase = NonNullable<ReturnType<RxdbSyncEngine['active']>>['database'];

function toJson(row: EngineConflict | { toJSON(): EngineConflict }): EngineConflict {
	return 'toJSON' in row && typeof row.toJSON === 'function'
		? row.toJSON()
		: (row as EngineConflict);
}

export function deadLetterToStuckRecord(entry: EngineConflict): StuckRecord {
	const reason =
		[entry.rejectedReason, entry.rejectedMessage]
			.filter((part): part is string => typeof part === 'string' && part !== '')
			.join(' · ') || String(entry.rejectedStatus ?? '');
	return {
		key: `${entry.collectionName}:${entry.recordId}`,
		collection: entry.collectionName,
		recordId: entry.recordId,
		reason,
		lastSeen: entry.rejectedAt ? Date.parse(entry.rejectedAt) : 0,
		attempts: entry.requeueCount ?? 0,
		eventType: 'push.rejected',
		direction: 'push',
		// Never retryable: the server refused this payload permanently, so a plain
		// engine tick re-sends the same refusal. Recovery is requeue-rebuilt.
		retryable: false,
	};
}

function deadLetterStuck$(engine: RxdbSyncEngine): Observable<StuckRecord[]> {
	return new Observable<EngineDatabase | null>((subscriber) =>
		engine.db$((database) => subscriber.next(database))
	).pipe(
		switchMap((database) => {
			if (!database) return of<StuckRecord[]>([]);
			const mutations = database.collections[
				MUTATION_QUEUE_RXDB_COLLECTION
			] as unknown as MutationCollection;
			return mutations.find({ selector: { status: { $in: ['rejected'] } } }).$.pipe(
				map((rows) => {
					const described = rows.map((row) => deadLetterToStuckRecord(toJson(row)));
					// Newest refusal first. The RxDB query has no sort clause (`rejectedAt`
					// is not indexed), so without this the row the panel puts forward as
					// THE one to act on is whatever order storage happened to return.
					described.sort((a, b) => b.lastSeen - a.lastSeen);
					// One entry per RECORD, not per mutation: a record can hold several
					// dead letters (a requeue that was refused again leaves its own row),
					// and counting them separately would tell the cashier there are three
					// problems where there is one record to fix.
					const byRecord = new Map<string, StuckRecord>();
					for (const row of described) if (!byRecord.has(row.key)) byRecord.set(row.key, row);
					return [...byRecord.values()];
				})
			);
		})
	);
}

export function useDeadLetterStuckRecords(): StuckRecord[] {
	const { engine } = useQueryRuntime();
	const [rows, setRows] = React.useState<StuckRecord[]>([]);

	React.useEffect(() => {
		// An external RxDB subscription bound to the engine lifecycle, the same
		// shape `useMutationCounts` uses — no Suspense, so the banner cannot hang.
		const subscription = deadLetterStuck$(engine).subscribe(setRows);
		return () => subscription.unsubscribe();
	}, [engine]);

	return rows;
}

/**
 * Durable dead letters FIRST, then whatever this session's logs turned up, with
 * one entry per record. A record that is both dead-lettered and log-stuck is one
 * problem, and the durable row is the one that is still true tomorrow.
 */
export function mergeStuckRecords(
	durable: readonly StuckRecord[],
	fromLogs: readonly StuckRecord[]
): StuckRecord[] {
	// Deduped across BOTH inputs, not just the log side: a record can hold several
	// dead letters (a requeue refused again leaves its own row), and the panel's
	// count is a count of records that need attention, not of queue rows.
	const byRecord = new Map<string, StuckRecord>();
	for (const row of [...durable, ...fromLogs]) {
		if (!byRecord.has(row.key)) byRecord.set(row.key, row);
	}
	return [...byRecord.values()];
}
