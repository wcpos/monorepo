import * as React from 'react';

import { useAppState } from '@wcpos/core/contexts/app-state';
import type { StoreDatabase } from '@wcpos/database';
import { getLogger } from '@wcpos/utils/logger';

import {
	getSyncStatusEpoch,
	getSyncStatusState,
	hydrateSyncStatus,
	resetSyncStatus,
	subscribeSyncStatus,
	SYNC_STATUS_STATE_KEY,
	type SyncStatusState,
} from './sync-status';

const syncStatusLogger = getLogger(['wcpos', 'sync', 'status']);

export function SyncStatusPersistenceBridge() {
	const { storeDB } = useAppState() as { storeDB?: StoreDatabase };

	// Bridge the module-level sync status to the active per-store RxDB lifecycle.
	React.useEffect(() => {
		if (!storeDB) return;
		let cancelled = false;
		let timer: ReturnType<typeof setTimeout> | null = null;
		resetSyncStatus();
		const bridgeEpoch = getSyncStatusEpoch();

		const statePromise = storeDB.addState<SyncStatusState>(SYNC_STATUS_STATE_KEY);
		void statePromise
			.then((state) => {
				if (cancelled) return;
				hydrateSyncStatus(state.get());
			})
			.catch((error: unknown) => {
				syncStatusLogger.warn('Failed to hydrate sync status', {
					context: { error: String(error) },
				});
			});

		const persist = async (): Promise<void> => {
			try {
				const snapshot = getSyncStatusState();
				const state = await statePromise;
				await state.set('', () => snapshot);
			} catch (error) {
				syncStatusLogger.warn('Failed to persist sync status', {
					context: { error: String(error) },
				});
			}
		};
		const unsubscribe = subscribeSyncStatus(() => {
			if (timer !== null) return;
			timer = setTimeout(() => {
				timer = null;
				void persist();
			}, 5_000);
		});

		return () => {
			cancelled = true;
			unsubscribe();
			if (timer !== null) clearTimeout(timer);
			// Skip the terminal flush if any reset has bumped the epoch since this
			// bridge captured it: on a fast store switch the incoming engine's first
			// diagnostic can lazily reset module state before React runs this cleanup,
			// and flushing then would persist the wrong (post-reset) state into the old
			// store's doc. Only the terminal flush is unsafe after a reset — mid-life
			// epoch bumps (cashier-swap engine supersede on the same storeDB) must keep
			// persisting, so this guard is NOT applied to the debounced persist() nor
			// re-baselined in subscribe. Accepted residuals: (a) a mid-life supersede
			// forfeits only the final ≤5s window at teardown (debounced persists carried
			// the session); (b) a pending debounce timer firing inside the sub-frame gap
			// between a lazy reset and this cleanup could still write post-reset state —
			// accepted as vanishingly narrow.
			if (getSyncStatusEpoch() !== bridgeEpoch) return;
			void persist(); // final flush — snapshot taken synchronously inside
		};
	}, [storeDB]);

	return null;
}
