import * as React from 'react';

import { ObservableResource } from 'observable-hooks';
import { from } from 'rxjs';

import { storeDBPromise } from '@wcpos/database/src/stores-db';

import useAuth from '../auth';
import useLanguage from '../language';

export const StoreContext = React.createContext<{
	storeDBResource: ObservableResource<import('@wcpos/database').StoreDatabase | null>;
}>(null);

interface StoreProviderProps {
	children: React.ReactNode;
}

/**
 *
 */
export const StoreProvider = ({ children }: StoreProviderProps) => {
	const { store } = useAuth();

	/**
	 * Loading language here, and adding to the key so that the app re-renders
	 * @TODO - refine this init process
	 */
	const language = useLanguage();

	/**
	 *
	 */
	const value = React.useMemo(() => {
		const promise = store?.localID ? storeDBPromise(store.localID) : Promise.resolve(null);
		const storeDBResource = new ObservableResource(from(promise));
		return { storeDBResource };
	}, [store.localID]);

	/**
	 *
	 */
	return (
		<StoreContext.Provider key={language.locale} value={value}>
			{children}
		</StoreContext.Provider>
	);
};

export default StoreProvider;
