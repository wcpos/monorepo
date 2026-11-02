import * as React from 'react';

import { useObservableEagerState } from 'observable-hooks';
import { BehaviorSubject } from 'rxjs';

import { Toast } from '@wcpos/components/toast';
import { useQueryRuntime } from '@wcpos/query';
import type { SyncCollectionName } from '@wcpos/sync-engine';
import { getErrorMessage, getLogger } from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/generated/error-codes.generated';

import { useT } from '../../../contexts/translations';

const manualSyncLogger = getLogger(['wcpos', 'health', 'manual-sync']);

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
		// The engine's raw reason is in its own sync row; the cashier gets what to do.
		Toast.show({
			type: 'error',
			text1: t('health.database.sync_failed'),
			text2: t('health.database.sync_failed_hint'),
		});
	} else if (report.status === 'skipped') {
		const reason =
			report.reason === 'offline'
				? t('health.database.sync_skipped_offline')
				: report.reason === 'lifecycle operation pending'
					? t('health.database.sync_skipped_busy')
					: report.reason === 'no active scope'
						? t('health.database.sync_skipped_no_scope')
						: undefined;
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
	const runtime = useQueryRuntime();
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
			const report = await runtime.engine.sync();
			showReportToast(report, t);
		} catch (error) {
			// Thrown before the engine wrote any row (e.g. disposed mid-switch): this is
			// the one record the toast's "Logs has the details" points at.
			manualSyncLogger.error('Manual sync threw', {
				code: ERROR_CODES.UNEXPECTED_ERROR,
				context: { error: getErrorMessage(error) },
			});
			Toast.show({
				type: 'error',
				text1: t('health.database.sync_failed'),
				text2: t('health.database.sync_failed_hint'),
			});
		} finally {
			manualSyncInFlight$.next(false);
		}
	}, [runtime.engine, t]);

	return { syncing, busy, sync };
}

export function useCollectionCheck() {
	const runtime = useQueryRuntime();
	const t = useT();
	const checking = useObservableEagerState(collectionCheckInFlight$);

	const check = React.useCallback(
		async (name: SyncCollectionName) => {
			if (manualSyncInFlight$.getValue() || collectionCheckInFlight$.getValue() !== null) return;
			collectionCheckInFlight$.next(name);
			try {
				showReportToast(await runtime.engine.checkCollection(name), t);
			} catch (error) {
				manualSyncLogger.error('Collection check threw', {
					code: ERROR_CODES.UNEXPECTED_ERROR,
					context: { collection: name, error: getErrorMessage(error) },
				});
				Toast.show({
					type: 'error',
					text1: t('health.database.sync_failed'),
					text2: t('health.database.sync_failed_hint'),
				});
			} finally {
				collectionCheckInFlight$.next(null);
			}
		},
		[runtime.engine, t]
	);

	return { checking, check };
}
