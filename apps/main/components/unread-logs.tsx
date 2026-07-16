import * as React from 'react';

import { useUnreadErrorCount } from '@wcpos/core/screens/main/components/drawer-content/logs-badge';

type UnreadLogsValue = ReturnType<typeof useUnreadErrorCount>;

const UnreadLogsContext = React.createContext<UnreadLogsValue | undefined>(undefined);

export function UnreadLogsProvider({ children }: { children: React.ReactNode }) {
	const value = useUnreadErrorCount();

	return <UnreadLogsContext.Provider value={value}>{children}</UnreadLogsContext.Provider>;
}

export function useUnreadLogs(): UnreadLogsValue {
	const value = React.useContext(UnreadLogsContext);
	if (!value) {
		throw new Error('useUnreadLogs must be used within an UnreadLogsProvider');
	}
	return value;
}
