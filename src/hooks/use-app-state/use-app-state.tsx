import * as React from 'react';
import { useObservableSuspense } from 'observable-hooks';
import { AppStateContext } from './app-state-provider';

export const useAppState = () => {
	const context = React.useContext(AppStateContext);
	if (context === undefined) {
		throw new Error(`useAppState must be called within AppStateProvider`);
	}

	return context;

	// /**
	//  * TODO: move these to their own useUser hook?
	//  */
	// const { user, site, wpCredentials, store, storeDB } = useObservableSuspense(resources);
	// const site = useObservableSuspense(resources.site);
	// const wpCredentials = useObservableSuspense(resources.wpCredentials);
	// const store = useObservableSuspense(resources.store);
	// const storeDB = useObservableSuspense(resources.storeDB);

	// return {
	// 	userDB,
	// 	user: null,
	// 	site: null,
	// 	wpCredentials: null,
	// 	store: null,
	// 	storeDB: null,
	// };
};
