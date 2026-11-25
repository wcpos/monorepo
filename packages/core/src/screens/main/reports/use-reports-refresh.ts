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
export function useReportsRefresh(
	handle: { sync(): Promise<void> },
	cadence: ReportsRefreshCadence
): void {
	const focused = useIsFocused();
	const [appState, setAppState] = React.useState(AppState.currentState);
	// The latest handle, so a range change does not restart the timer.
	const latest = React.useRef(handle);
	React.useEffect(() => {
		latest.current = handle;
	}, [handle]);
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
		const pass = () => {
			if (inFlight.current) return;
			const current = latest.current
				.sync()
				.catch(() => {
					logger.debug('Reports refresh failed');
				})
				.finally(() => {
					if (inFlight.current === current) inFlight.current = null;
				});
			inFlight.current = current;
		};
		if (returned) pass();
		if (cadence !== 'interval') return;
		const timer = setInterval(pass, REPORTS_REFRESH_MS);
		return () => clearInterval(timer);
	}, [active, cadence]);
}
