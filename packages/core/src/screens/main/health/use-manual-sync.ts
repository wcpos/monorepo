import * as React from 'react';

import { useObservableEagerState } from 'observable-hooks';
import { BehaviorSubject } from 'rxjs';

import { Toast } from '@wcpos/components/toast';
import { useQueryRuntime } from '@wcpos/query';
import type { SyncCollectionName } from '@wcpos/sync-engine';
import { getErrorMessage } from '@wcpos/utils/logger';

import { useT } from '../../../contexts/translations';

/**
 * One in-flight flag shared by every full manual-sync control. Row checks use the
 * collection subject below, and both operations refuse to start while either is active.
 * Transient by construction (true only while a sync promise is in flight), so it never
 * carries stale state across store switches.
 */
const manualSyncInFlight$ = new BehaviorSubject(false);
const collectionCheckInFlight$ = new BehaviorSubject<string | null>(null);

function showReportToast(
	report: {
		status: 'ran' | 'skipped' | 'error';
		reason?: string;
		error?: string;
	},
	t: ReturnType<typeof useT>
) {
	if (report.status === 'error') {
		const detail = report.error ?? report.reason;
		Toast.show({
			type: 'error',
			text1: t('health.database.sync_failed'),
			...(detail ? { text2: detail } : {}),
		});
	} else if (report.status === 'skipped') {
		const reason =
			report.reason === 'offline'
				? t('health.database.sync_skipped_offline')
				: report.reason === 'lifecycle operation pending'
					? t('health.database.sync_skipped_busy')
					: report.reason;
		Toast.show({
			type: 'warning',
			text1: t('health.database.sync_skipped'),
			...(reason ? { text2: reason } : {}),
		});
	}
}

/**
 * Manual engine sync with cashier-visible feedback: an in-flight flag for the
 * button spinner, and a toast when the tick fails or never ran. `engine.sync()`
 * reports failure via `status: 'error'` (and a no-op via `status: 'skipped'`)
 * on the returned report instead of throwing, so a bare `void engine.sync()`
 * swallows the outcome entirely.
 */
export function useManualSync() {
	const { engine } = useQueryRuntime();
	const t = useT();
	// `useObservableEagerState`, not `useObservableState(subject$, subject$.getValue())`:
	// the seed of `useObservableState` is the INITIAL state, read once on the first
	// render, so a getter there reads current state and then latches it (#1542, #1551 —
	// guarded by `wcpos/no-live-seed-in-observable-state`). The eager hook reads the
	// BehaviorSubject's synchronous value on every render instead, with no seed to latch.
	const syncing = useObservableEagerState(manualSyncInFlight$);
	const checking = useObservableEagerState(collectionCheckInFlight$);
	// Any manual pass in flight — full sync OR a row check. Controls outside the
	// Database screen (attention Retry) disable on this, or a press during a row
	// check would silently no-op through the duplicate-start guard.
	const busy = syncing || checking !== null;

	const sync = React.useCallback(async () => {
		if (manualSyncInFlight$.getValue() || collectionCheckInFlight$.getValue() !== null) return;
		manualSyncInFlight$.next(true);
		try {
			const report = await engine.sync();
			showReportToast(report, t);
		} catch (error) {
			Toast.show({
				type: 'error',
				text1: t('health.database.sync_failed'),
				text2: getErrorMessage(error),
			});
		} finally {
			manualSyncInFlight$.next(false);
		}
	}, [engine, t]);

	return { syncing, busy, sync };
}

export function useCollectionCheck() {
	const { engine } = useQueryRuntime();
	const t = useT();
	const checking = useObservableEagerState(collectionCheckInFlight$);

	const check = React.useCallback(
		async (name: SyncCollectionName) => {
			if (manualSyncInFlight$.getValue() || collectionCheckInFlight$.getValue() !== null) return;
			collectionCheckInFlight$.next(name);
			try {
				showReportToast(await engine.checkCollection(name), t);
			} catch (error) {
				Toast.show({
					type: 'error',
					text1: t('health.database.sync_failed'),
					text2: getErrorMessage(error),
				});
			} finally {
				collectionCheckInFlight$.next(null);
			}
		},
		[engine, t]
	);

	return { checking, check };
}
