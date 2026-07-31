import * as React from 'react';

import { isVerboseDiagnostics, setVerboseDiagnostics } from '@wcpos/utils/logger';

/**
 * The verbose-diagnostics chip state. The logger owns persistence (24 h
 * auto-expiring localStorage flag — spec §1); this hook just mirrors it into
 * React so the chip re-renders.
 */
export function useVerboseDiagnostics(): { verbose: boolean; setVerbose: (on: boolean) => void } {
	const [verbose, setVerboseState] = React.useState(() => isVerboseDiagnostics());

	const setVerbose = React.useCallback((on: boolean) => {
		setVerboseDiagnostics(on);
		setVerboseState(isVerboseDiagnostics());
	}, []);

	return { verbose, setVerbose };
}
