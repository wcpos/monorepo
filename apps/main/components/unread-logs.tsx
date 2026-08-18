import * as React from 'react';

import { useUnreadErrorCount } from '@wcpos/core/screens/main/components/drawer-content/logs-badge';

type UnreadLogsActions = { markAsRead: () => void };

/**
 * Split in two on purpose.
 *
 * The count changes whenever an error is logged; `markAsRead` never changes. Publishing
 * them together meant the logs screen — which only ever calls `markAsRead` — re-rendered on
 * every new error log, which is exactly the traffic that screen exists to display.
 */
const UnreadLogsCountContext = React.createContext<number | undefined>(undefined);
const UnreadLogsActionsContext = React.createContext<UnreadLogsActions | undefined>(undefined);

export function UnreadLogsProvider({ children }: { children: React.ReactNode }) {
	const { count, markAsRead } = useUnreadErrorCount();
	const actions = React.useMemo(() => ({ markAsRead }), [markAsRead]);

	return (
		<UnreadLogsActionsContext.Provider value={actions}>
			<UnreadLogsCountContext.Provider value={count}>{children}</UnreadLogsCountContext.Provider>
		</UnreadLogsActionsContext.Provider>
	);
}

/** For the badges. Re-renders on every new error log, which is the point. */
export function useUnreadLogsCount(): number {
	const count = React.useContext(UnreadLogsCountContext);
	if (count === undefined) {
		throw new Error('useUnreadLogsCount must be used within an UnreadLogsProvider');
	}
	return count;
}

/** For the logs screen. Stable, so it never drags the screen into a count change. */
export function useMarkLogsAsRead(): () => void {
	const actions = React.useContext(UnreadLogsActionsContext);
	if (!actions) {
		throw new Error('useMarkLogsAsRead must be used within an UnreadLogsProvider');
	}
	return actions.markAsRead;
}
