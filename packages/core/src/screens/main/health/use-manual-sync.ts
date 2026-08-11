import * as React from 'react';

import { Toast } from '@wcpos/components/toast';
import { useQueryRuntime } from '@wcpos/query';

import { useT } from '../../../contexts/translations';

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
	const [syncing, setSyncing] = React.useState(false);

	const sync = React.useCallback(async () => {
		setSyncing(true);
		try {
			const report = await engine.sync();
			if (report.status === 'error') {
				Toast.show({
					type: 'error',
					text1: t('health.database.sync_failed'),
					...(report.error ? { text2: report.error } : {}),
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
			setSyncing(false);
		}
	}, [engine, t]);

	return { syncing, sync };
}
