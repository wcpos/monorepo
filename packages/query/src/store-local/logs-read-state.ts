import { defer, from, of } from 'rxjs';
import { catchError, distinctUntilChanged, map, switchMap } from 'rxjs/operators';

import { storeDatabase } from './ensure-local-document';
import { recoverLogsCollectionStorage } from '../logs-storage-recovery';
import { observeFollowedCollection } from '../use-local-collection';

import type { LogRow } from './logs';
import type { StoreLocalDatabase } from '../reads/store-local';

/** Durable timestamp of the last time the Logs tab was viewed. */
export const LOGS_READ_STATE_KEY = 'logs_read_v1';
const LAST_VIEWED_PATH = 'lastViewedAt';

/** Count errors newer than the watermark; initialize only when subscribed. */
export function observeUnreadErrorCount(storeDB: StoreLocalDatabase) {
	if (!storeDB) return of(0);
	return defer(() =>
		storeDatabase(storeDB)
			.addState<{ lastViewedAt: number }>(LOGS_READ_STATE_KEY)
			.then(async (state) => {
				// First run on an existing install: logs are retained for up to
				// 30 days, so a missing watermark must mean "read up to now",
				// not epoch — otherwise upgrading floods the badge with history.
				if (typeof state.get(LAST_VIEWED_PATH) !== 'number') {
					await state.set(LAST_VIEWED_PATH, () => Date.now());
				}
				return state;
			})
	).pipe(
		switchMap((state) =>
			observeFollowedCollection<LogRow>(storeDB, 'logs').pipe(
				switchMap((logsCollection) => {
					if (!logsCollection) return of(0);
					return state.get$(LAST_VIEWED_PATH).pipe(
						map((value) => (typeof value === 'number' ? value : 0)),
						distinctUntilChanged(),
						switchMap((lastViewedAt) =>
							logsCollection
								.count({
									selector: {
										level: { $eq: 'error' },
										timestamp: { $gt: lastViewedAt },
									},
								})
								.$.pipe(
									catchError((error: unknown) =>
										from(
											recoverLogsCollectionStorage(
												logsCollection as Parameters<typeof recoverLogsCollectionStorage>[0],
												error
											)
										).pipe(
											map((recovered) => {
												if (!recovered) {
													throw error;
												}
												return 0;
											})
										)
									)
								)
						),
						// The badge is decoration — storage trouble must not crash the drawer.
						catchError(() => of(0))
					);
				})
			)
		),
		catchError(() => of(0))
	);
}

/** Advance the durable watermark when Logs receives focus. */
export async function markLogsRead(storeDB: StoreLocalDatabase, nowMs = Date.now()): Promise<void> {
	if (!storeDB) return;
	const state = await storeDatabase(storeDB).addState<{ lastViewedAt: number }>(
		LOGS_READ_STATE_KEY
	);
	await state.set(LAST_VIEWED_PATH, () => nowMs);
}
