import * as React from 'react';

import { flushSync } from 'react-dom';
import { skip } from 'rxjs';

import { createLiveTab, holdLiveTab } from '@wcpos/database/live-tab/live-tab.web';
import {
	onStorageWorkerLost,
	terminateStorageWorker,
} from '@wcpos/database/adapters/storage/index.web';
import { closeRegisteredDatabases } from '@wcpos/database/plugins/rx-database-registry';
import { degradedStorage$ } from '@wcpos/database/plugins/wrapped-error-handler-storage';
import { finishPendingHydration } from '@wcpos/core/contexts/app-state/use-hydration-suspense';
import { reloadApp } from '@wcpos/core/utils/reload-app';
import { log } from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/generated/error-codes.generated';

import { disposeAppSyncEngine } from '../lib/create-app-engine';
import { ParkedTab } from './parked-tab';

let liveTab: ReturnType<typeof createLiveTab> | undefined;
let retired = false;
function getLiveTab() {
	if (liveTab) return liveTab;
	liveTab = createLiveTab({
		locks: navigator.locks,
		channel: (name) => new BroadcastChannel(name),
		onUnavailable: () => log.warn('Web Locks unavailable; live-tab coordination disabled'),
		onError: (error) =>
			log.error('Live-tab handover failed', {
				code: ERROR_CODES.LOCAL_DB_UNAVAILABLE,
				context: { error: String(error) },
			}),
		async onHandover() {
			retired = true;
			await finishPendingHydration();
			await disposeAppSyncEngine();
			await closeRegisteredDatabases();
			terminateStorageWorker();
		},
	});
	const workerLost = () => {
		terminateStorageWorker();
		liveTab!.park('worker-lost');
	};
	onStorageWorkerLost(workerLost);
	degradedStorage$.subscribe((events) => {
		if (events.some((event) => event.kind === 'worker-lost')) workerLost();
	});
	if (__DEV__ || process.env.EXPO_PUBLIC_WCPOS_E2E === '1') {
		(
			globalThis as typeof globalThis & { __wcposLiveTabHold?: typeof holdLiveTab }
		).__wcposLiveTabHold = holdLiveTab;
	}
	return liveTab;
}
const subscribe = (notify: () => void) => {
	// Synchronous unmount precedes database teardown, rather than waiting for a React batch.
	const subscription = getLiveTab()
		.state$.pipe(skip(1))
		.subscribe(() => flushSync(notify));
	return () => subscription.unsubscribe();
};
export function LiveTabGate({ children }: React.PropsWithChildren) {
	const tab = getLiveTab();
	const state = React.useSyncExternalStore(subscribe, tab.getState, tab.getState);
	// A former holder has closed cached hydration/worker objects: reacquire, then reload.
	React.useEffect(() => {
		if (retired && state.kind === 'live') reloadApp();
	}, [state]);
	if (state.kind === 'live') return retired ? null : children;
	if (state.kind === 'acquiring') return null;
	return <ParkedTab state={state} takeOver={tab.takeOver} />;
}
