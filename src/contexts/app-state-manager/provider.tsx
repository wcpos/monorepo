import * as React from 'react';

import { AppStateManager } from './manager';

export const AppStateManagerContext = React.createContext<AppStateManager | undefined>(undefined);

interface StoreStateManagerProviderProps {
	children: React.ReactNode;
	initialProps: any;
}

/**
 *
 */
export const AppStateManagerProvider = ({
	children,
	initialProps,
}: StoreStateManagerProviderProps) => {
	const appStateManager = React.useMemo(() => new AppStateManager(), []);
	console.log('appStateManager', appStateManager);

	/**
	 *
	 */
	React.useEffect(() => {
		// Perform any required setup here...
		return () => {
			// Perform any cleanup here...
			// manager.clearAllReplicationStates();
			// manager.clearAllResourceStreams();
		};
	}, [appStateManager]);

	return (
		<AppStateManagerContext.Provider value={appStateManager}>
			{children}
		</AppStateManagerContext.Provider>
	);
};
