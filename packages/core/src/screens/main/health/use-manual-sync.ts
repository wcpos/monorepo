import * as React from 'react';

import { Toast } from '@wcpos/components/toast';
import { useQueryRuntime } from '@wcpos/query';

import { useT } from '../../../contexts/translations';

/**
 * Manual engine sync with cashier-visible feedback: an in-flight flag for the
 * button spinner, and an error toast when the tick fails. `engine.sync()`
 * reports failure via `status: 'error'` on the returned report instead of
 * throwing, so a bare `void engine.sync()` swallows the outcome entirely.
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
