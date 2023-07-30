import * as React from 'react';

import { StoreStateManager } from './manager';
import useLocalData from '../local-data';

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
	const { store, storeDB } = useLocalData();
	const manager = React.useMemo(() => new StoreStateManager(storeDB), [storeDB]);

	React.useEffect(() => {
		// Perform any required setup here...
		return () => {
			// Perform any cleanup here...
			// manager.clearAllReplicationStates();
			// manager.clearAllResourceStreams();
		};
	}, [manager]);

	return (
		<StoreStateManagerContext.Provider value={manager}>
			{children}
		</StoreStateManagerContext.Provider>
	);
};
