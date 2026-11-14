import * as React from 'react';

import { requestStateManager } from '@wcpos/hooks/use-http-client';
import { syncTemplates, takeDeferredTemplatesSync } from '@wcpos/query/store-local';

import { useStoreSession } from '../../../../contexts/app-state';
import { useRestHttpClient } from '../../hooks/use-rest-http-client';

/** Keep the dedicated local templates collection fresh without creating a query manager. */
export function useTemplatesSync(
	type: 'receipt' | 'report' | 'closure' = 'receipt',
	storeId?: number
): { synced: boolean } {
	const { storeDB } = useStoreSession();
	const httpClient = useRestHttpClient();
	const [settled, setSettled] = React.useState<{
		key: { type: typeof type; storeId: typeof storeId };
		storeDB: typeof storeDB;
	} | null>(null);

	// A sync deferred while the window was hidden re-runs on wake — otherwise the
	// receipt modal shows no templates until the next remount. Only a deferred sync
	// re-runs; a routine wake must not re-pull the whole set.
	const [wakeTick, setWakeTick] = React.useState(0);
	React.useEffect(
		() =>
			requestStateManager.onWake(() => {
				if (!takeDeferredTemplatesSync(storeDB, type, storeId)) return;
				setWakeTick((tick) => tick + 1);
			}),
		[storeDB, type, storeId]
	);

	// Publish readiness when the external sync settles, including a failed first request.
	React.useEffect(() => {
		if (!storeDB) return;
		// A run that settles after the scope moved on must not overwrite the current scope's
		// readiness (two keyed runs can finish out of order); it is simply ignored.
		let current = true;
		const settle = () => {
			if (!current) return;
			setSettled((previous) =>
				previous?.key.type === type &&
				previous.key.storeId === storeId &&
				previous.storeDB === storeDB
					? previous
					: { key: { type, storeId }, storeDB }
			);
		};
		void syncTemplates(storeDB, httpClient, type, storeId).then(settle, settle);
		return () => {
			current = false;
		};
	}, [storeDB, httpClient, wakeTick, type, storeId]);
	return {
		synced:
			settled?.key.type === type && settled.key.storeId === storeId && settled.storeDB === storeDB,
	};
}
