import * as React from 'react';
import { AppState } from 'react-native';

import { useIsFocused } from 'expo-router';

import { getLogger } from '@wcpos/utils/logger';

// A forced re-read walks the whole range again, so only the one-day range gets this timer.
export const REPORTS_REFRESH_MS = 60_000;
const logger = getLogger(['wcpos', 'reports', 'refresh']);

export type ReportsRefreshCadence = 'interval' | 'focus' | 'none';

/** Pure: which re-reads a Reports range gets. */
export function reportsRefreshCadence(
	range: { from?: Date; to?: Date },
	today: { from: Date; to: Date }
): ReportsRefreshCadence {
	// A past range has nothing left to change; a longer range re-walks too much for a timer.
	if (range.to && range.to < today.from) return 'none';
	if (range.from && range.from >= today.from && range.from < today.to) return 'interval';
	return 'focus';
}

/** Re-read the Reports window on focus or foreground return, and on a timer for today. */
// True while a timer pass re-reads a lane that was whole and idle when it started (quiet).
export function useReportsRefresh(
	handle: {
		sync(): Promise<void>;
		readonly value: { laneComplete: boolean; laneProgress: unknown };
	},
	cadenceAt: () => ReportsRefreshCadence
): boolean {
	const cadence = cadenceAt();
	const focused = useIsFocused();
	const [appState, setAppState] = React.useState(AppState.currentState);
	// The latest handle and cadence: a range change keeps the timer, a pass sees the midnight.
	const latest = React.useRef({ handle, cadenceAt });
	React.useEffect(() => {
		latest.current = { handle, cadenceAt };
	}, [handle, cadenceAt]);
	// The handle a quiet pass is re-reading: a handle given mid-pass is not quiet.
	const [quietHandle, setQuietHandle] = React.useState<object | null>(null);
	const inFlight = React.useRef<Promise<void> | null>(null);
	// Mount already declares the window, so only a return from inactive runs a pass.
	const wasInactive = React.useRef(false);
	const active = focused && appState === 'active';

	React.useEffect(() => {
		const subscription = AppState.addEventListener('change', setAppState);
		return () => subscription.remove();
	}, []);

	React.useEffect(() => {
		if (!active) {
			wasInactive.current = true;
			return;
		}
		const returned = wasInactive.current;
		wasInactive.current = false;
		if (cadence === 'none') return;
		const pass = (timer: boolean) => {
			if (inFlight.current) return;
			const { handle: target, cadenceAt: cadenceNow } = latest.current;
			if (timer && cadenceNow() !== 'interval') return;
			// Only the timer re-reading a lane already whole and idle is quiet, never a download.
			const quiet = timer && target.value.laneComplete && target.value.laneProgress == null;
			if (quiet) setQuietHandle(target);
			const current = target
				.sync()
				.catch(() => {
					logger.debug('Reports refresh failed');
				})
				.finally(() => {
					if (inFlight.current === current) inFlight.current = null;
					if (quiet) setQuietHandle((held) => (held === target ? null : held));
				});
			inFlight.current = current;
		};
		if (returned) pass(false);
		if (cadence !== 'interval') return;
		const timer = setInterval(() => pass(true), REPORTS_REFRESH_MS);
		return () => clearInterval(timer);
	}, [active, cadence]);
	return quietHandle === handle;
}
