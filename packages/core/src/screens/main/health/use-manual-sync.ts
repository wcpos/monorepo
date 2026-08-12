import * as React from 'react';

import { useObservableState } from 'observable-hooks';
import { BehaviorSubject } from 'rxjs';

import { Toast } from '@wcpos/components/toast';
import { useQueryRuntime } from '@wcpos/query';

import { useT } from '../../../contexts/translations';

/**
 * One in-flight flag shared by EVERY manual-sync control: a manual pass is a single
 * engine-wide operation, so while one runs, all entry points (attention Retry, Check
 * everything now, each row's Sync now) must show it and refuse a duplicate start —
 * per-instance state only guarded re-presses of the same button (codex review).
 * Transient by construction (true only while a sync promise is in flight), so it never
 * carries stale state across store switches.
 */
const manualSyncInFlight$ = new BehaviorSubject(false);

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
	const syncing = useObservableState(manualSyncInFlight$, manualSyncInFlight$.getValue());

	const sync = React.useCallback(async () => {
		if (manualSyncInFlight$.getValue()) return;
		manualSyncInFlight$.next(true);
		try {
			const report = await engine.sync();
			if (report.status === 'error') {
				const detail = report.error ?? report.reason;
				Toast.show({
					type: 'error',
					text1: t('health.database.sync_failed'),
					...(detail ? { text2: detail } : {}),
				});
			} else if (report.status === 'skipped') {
				// All-lanes skipped means nothing ran at all (offline, or a lifecycle
				// op in flight) — ending the spinner silently would read as success.
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
		} catch (error) {
			Toast.show({
				type: 'error',
				text1: t('health.database.sync_failed'),
				text2: error instanceof Error ? error.message : String(error),
			});
		} finally {
			manualSyncInFlight$.next(false);
		}
	}, [engine, t]);

	return { syncing, sync };
}
