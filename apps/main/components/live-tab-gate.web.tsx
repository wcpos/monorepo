import * as React from 'react';

import { flushSync } from 'react-dom';
import { skip } from 'rxjs';

import {
	createLiveTab,
	HANDOVER_TEARDOWN_DEADLINE_MS,
	holdLiveTab,
	type LiveTabState,
} from '@wcpos/database/live-tab/live-tab.web';
import {
	onStorageWorkerLost,
	terminateStorageWorker,
} from '@wcpos/database/adapters/storage/index.web';
import {
	closeRegisteredDatabases,
	getRegisteredDatabaseNames,
} from '@wcpos/database/plugins/rx-database-registry';
import {
	degradedStorage$,
	markStorageTerminallyFailed,
} from '@wcpos/database/plugins/wrapped-error-handler-storage';
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
		locks: typeof navigator === 'undefined' ? undefined : navigator.locks,
		channel: (name) => new BroadcastChannel(name),
		onUnavailable: () => log.warn('Web Locks unavailable; live-tab coordination disabled'),
		onError: (error) =>
			log.error('Live-tab handover failed', {
				code: ERROR_CODES.LOCAL_DB_UNAVAILABLE,
				context: { error: String(error) },
			}),
		async onHandover() {
			retired = true;
			// Do not wait for hydration's HTTP probes. Retirement rejects their late opens.
			const closing = Promise.all([disposeAppSyncEngine(), closeRegisteredDatabases()]);
			let timer: ReturnType<typeof setTimeout> | undefined;
			try {
				await Promise.race([
					closing,
					new Promise<void>((resolve) => {
						timer = setTimeout(() => {
							for (const name of getRegisteredDatabaseNames())
								markStorageTerminallyFailed(name, 'live-tab handover');
							// Unknown-outcome writes may have committed: the NEXT owner reads back.
							resolve();
						}, HANDOVER_TEARDOWN_DEADLINE_MS);
					}),
				]);
				await closing; // Terminal failure rejects wedged calls so close can finish.
				terminateStorageWorker();
			} finally {
				clearTimeout(timer);
			}
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
const LIVE: LiveTabState = { kind: 'live' };
const ACQUIRING: LiveTabState = { kind: 'acquiring' };
const getSnapshot = () =>
	liveTab?.getState() ?? (typeof navigator === 'undefined' || !navigator.locks ? LIVE : ACQUIRING);
// SSR and browser hydration must both exclude children until ownership is resolved.
const getServerSnapshot = () => ACQUIRING;
const subscribe = (notify: () => void) => {
	// Synchronous unmount precedes database teardown, rather than waiting for a React batch.
	const subscription = liveTab?.state$.pipe(skip(1)).subscribe(() => flushSync(notify));
	return () => subscription?.unsubscribe();
};
export function LiveTabGate({ children }: React.PropsWithChildren) {
	// Page-lifetime ownership is a browser side effect, never part of SSR/render.
	React.useEffect(() => {
		getLiveTab();
	}, []);
	const state = React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
	// scripts/live-tab-probe.mjs found premium retains the terminated worker:
	// a former owner must reacquire, then reload, rather than reuse cached hydration/storage.
	React.useEffect(() => {
		if (retired && state.kind === 'live') reloadApp();
	}, [state]);
	if (state.kind === 'live') return retired ? null : children;
	if (state.kind === 'acquiring') return null;
	return <ParkedTab state={state} takeOver={liveTab!.takeOver} />;
}
