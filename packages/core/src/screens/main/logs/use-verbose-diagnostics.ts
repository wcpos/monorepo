import * as React from 'react';

import { isVerboseDiagnostics, setVerboseDiagnostics } from '@wcpos/utils/logger';

/** The 24 h TTL only needs minute-level fidelity on screen. */
const TTL_POLL_MS = 60_000;

/**
 * The verbose-diagnostics chip state. The logger owns persistence (24 h
 * auto-expiring flag — spec §1); this hook mirrors it into React so the chip
 * re-renders, and polls so an expiry while the screen stays mounted flips the
 * chip (and lets the screen drop `debug` from its filters) instead of lying.
 */
export function useVerboseDiagnostics(): { verbose: boolean; setVerbose: (on: boolean) => void } {
	const [verbose, setVerboseState] = React.useState(() => isVerboseDiagnostics());

	// Effect (last resort per project.mdc): the logger's TTL flag lives outside
	// React with no subscription seam — polling is the only expiry signal.
	React.useEffect(() => {
		const interval = setInterval(() => {
			setVerboseState((previous) => {
				const current = isVerboseDiagnostics();
				return current === previous ? previous : current;
			});
		}, TTL_POLL_MS);
		return () => clearInterval(interval);
	}, []);

	const setVerbose = React.useCallback((on: boolean) => {
		setVerboseDiagnostics(on);
		setVerboseState(isVerboseDiagnostics());
	}, []);

	return { verbose, setVerbose };
}
