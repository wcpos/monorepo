import * as React from 'react';

import { useObservableSuspense } from 'observable-hooks';

import { StoreStateManager } from './manager';
import { useAppState } from '../app-state';

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
	const { storeDB } = useAppState();
	const storeStateManager = React.useMemo(() => new StoreStateManager(storeDB), [storeDB]);
	console.log('storeStateManager', storeStateManager);

	/**
	 *
	 */
	React.useEffect(() => {
		// Perform any required setup here...
		return () => {
			// Perform any cleanup here...
			if (storeDB) {
				storeDB.destroy();
			}
		};
	}, [storeDB]);

	return (
		<StoreStateManagerContext.Provider value={storeStateManager}>
			{children}
		</StoreStateManagerContext.Provider>
	);
};
