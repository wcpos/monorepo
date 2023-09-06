import * as React from 'react';

import { useSubscription } from 'observable-hooks';

import { useSnackbar } from '@wcpos/components/src/snackbar/use-snackbar';

import { StoreStateManager } from './manager';
import { useAppState } from '../../../../contexts/app-state';

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
	const addSnackbar = useSnackbar();

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

	/**
	 * @TODO - manage all HTTP errors
	 */
	useSubscription(storeStateManager.replicationStateErrors$, (error) => {
		addSnackbar({
			message: `${error}`,
			type: 'critical',
		});
	});

	return (
		<StoreStateManagerContext.Provider value={storeStateManager}>
			{children}
		</StoreStateManagerContext.Provider>
	);
};
