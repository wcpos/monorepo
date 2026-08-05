import * as React from 'react';
import { View } from 'react-native';

import { useObservableState } from 'observable-hooks';
import { from, of } from 'rxjs';
import { catchError, distinctUntilChanged, map, switchMap } from 'rxjs/operators';

import { Badge } from '@wcpos/components/badge';
import { recoverLogsCollectionStorage, useQueryRuntime } from '@wcpos/query';

import type { Observable } from 'rxjs';

/**
 * Durable read-state for the unread-error badge (#843: read-state must
 * survive restart). One number on an RxDB state doc — the timestamp of the
 * last time the Logs tab was viewed.
 */
export const LOGS_READ_STATE_KEY = 'logs_read_v1';
const LAST_VIEWED_PATH = 'lastViewedAt';

type LogsReadState = {
	get(path: string): number | undefined;
	get$(path: string): Observable<number | undefined>;
	set(path: string, modifier: () => number): Promise<unknown>;
};

type StoreDBLike = {
	addState(key: string): Promise<LogsReadState>;
	collections?: Record<string, unknown>;
};

/**
 * Count of error-level logs newer than the persisted last-viewed watermark.
 * markAsRead() advances the watermark (the logs route calls it on focus).
 */
export function useUnreadErrorCount() {
	const runtime = useQueryRuntime();
	const storeDB = runtime.localDB as unknown as StoreDBLike;
	const logsCollection = storeDB?.collections?.logs as
		| {
				count(query: { selector: Record<string, unknown> }): { $: Observable<number> };
		  }
		| undefined;

	const statePromise = React.useMemo(
		() =>
			storeDB?.addState
				? storeDB.addState(LOGS_READ_STATE_KEY).then(async (state) => {
						// First run on an existing install: logs are retained for up to
						// 30 days, so a missing watermark must mean "read up to now",
						// not epoch — otherwise upgrading floods the badge with history.
						if (typeof state.get(LAST_VIEWED_PATH) !== 'number') {
							await state.set(LAST_VIEWED_PATH, () => Date.now());
						}
						return state;
					})
				: null,
		[storeDB]
	);

	const count = useObservableState(
		React.useMemo(() => {
			if (!statePromise || !logsCollection) return of(0);
			return from(statePromise).pipe(
				switchMap((state) => state.get$(LAST_VIEWED_PATH)),
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
		}, [logsCollection, statePromise]),
		0
	);

	const markAsRead = React.useCallback(() => {
		if (!statePromise) return;
		void statePromise
			.then((state) => state.set(LAST_VIEWED_PATH, () => Date.now()))
			.catch(() => undefined);
	}, [statePromise]);

	return { count, markAsRead };
}

/**
 * Small badge that shows the count of unread error logs.
 * Renders nothing when count is 0.
 */
export function LogsBadge({ count }: { count: number }) {
	if (count === 0) return null;

	return (
		<View className="absolute -top-1 -right-0.5">
			<Badge count={count} max={99} variant="destructive" size="sm" />
		</View>
	);
}
