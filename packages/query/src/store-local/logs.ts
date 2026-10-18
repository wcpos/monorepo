import { combineLatest, firstValueFrom, of } from 'rxjs';
import { map, switchMap } from 'rxjs/operators';

import type { LogDocument } from '@wcpos/database';

import { observeFollowedCollection } from '../use-local-collection';

import type { StoreLocalDatabase } from '../reads/store-local';

// Preserve the consumer's log identity/time contract; the schema marks all fields optional.
export type LogRow = ReturnType<LogDocument['toJSON']> & { logId: string; timestamp: number };

/** Today's log volume, not outstanding faults; absent database emits zeros. */
export function observeLogVolume(storeDB: StoreLocalDatabase, dayStartMs: number) {
	return observeFollowedCollection<LogRow>(storeDB, 'logs').pipe(
		switchMap((logsCollection) => {
			if (!logsCollection) return of({ eventsToday: 0, errorsToday: 0 });
			const events$ = logsCollection.count({
				selector: {
					timestamp: { $gte: dayStartMs },
					level: { $in: ['info', 'warn', 'error'] },
				},
			}).$;
			const errors$ = logsCollection.count({
				selector: { level: { $eq: 'error' }, timestamp: { $gte: dayStartMs } },
			}).$;
			return combineLatest([events$, errors$]).pipe(
				map(([eventsToday, errorsToday]) => ({ eventsToday, errorsToday }))
			);
		})
	);
}

/** Bounded outcome windows per domain, merged newest-first; absent database emits []. */
export function observeRecordOutcomeRows(
	storeDB: StoreLocalDatabase,
	domains: readonly string[],
	limitPerDomain: number
) {
	return observeFollowedCollection<LogRow>(storeDB, 'logs').pipe(
		switchMap((logsCollection) =>
			logsCollection
				? combineLatest(
						domains.map(
							(domain) =>
								logsCollection.find({
									selector: {
										category: { $gte: domain, $lt: `${domain}/` },
										operationType: { $eq: 'sync.record' },
									},
									sort: [{ timestamp: 'desc' }],
									limit: limitPerDomain,
								}).$
						)
					).pipe(
						map((perDomain) =>
							perDomain
								.flat()
								.map((doc) => doc.toJSON())
								// The first row per record is decisive, including across different domains.
								.sort((a, b) => b.timestamp - a.timestamp)
						)
					)
				: of([])
		)
	);
}

/** The engine's once-per-store-open clock-check warn rows; absent database emits []. */
export function observeClockCheckRows(storeDB: StoreLocalDatabase) {
	return observeFollowedCollection<LogRow>(storeDB, 'logs').pipe(
		switchMap((logsCollection) =>
			logsCollection
				? logsCollection
						.find({
							selector: {
								category: { $eq: 'wcpos.sync.engine' },
								level: { $eq: 'warn' },
							},
							sort: [{ timestamp: 'desc' }],
						})
						.$.pipe(map((docs) => docs.map((doc) => doc.toJSON())))
				: of([])
		)
	);
}

/** Resolve the current collection at call time, not when the screen rendered. */
export async function readRecentErrorLogs(
	storeDB: StoreLocalDatabase,
	limit = 10
): Promise<LogRow[]> {
	const logsCollection = await firstValueFrom(observeFollowedCollection<LogRow>(storeDB, 'logs'));
	const docs = logsCollection
		? await logsCollection
				.find({
					selector: { level: { $eq: 'error' } },
					sort: [{ timestamp: 'desc' }],
					limit,
				})
				.exec()
		: [];
	return docs.map((doc) => doc.toJSON());
}
