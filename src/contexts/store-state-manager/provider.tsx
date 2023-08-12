import * as React from 'react';

import { useObservableSuspense } from 'observable-hooks';

import { StoreStateManager } from './manager';
import { useAppStateManager } from '../app-state-manager';

export const StoreStateManagerContext = React.createContext<StoreStateManager | undefined>(
	undefined
);

interface StoreStateManagerProviderProps {
	children: React.ReactNode;
}

/**
 *
 */
export const StoreStateManagerProvider = ({ children }: StoreStateManagerProviderProps) => {
	const appStateManager = useAppStateManager();
	const { storeDB } = useObservableSuspense(appStateManager.isReadyResource);
	const storeStateManager = React.useMemo(() => new StoreStateManager(storeDB), [storeDB]);
	console.log('storeStateManager', storeStateManager);

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
	}, [storeStateManager]);

	return (
		<StoreStateManagerContext.Provider value={storeStateManager}>
			{children}
		</StoreStateManagerContext.Provider>
	);
};
