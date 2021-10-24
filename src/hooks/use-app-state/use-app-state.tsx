import * as React from 'react';
import { useObservableSuspense } from 'observable-hooks';
import { AppStateContext } from './app-state-provider';

const useAppState = () => {
	const context = React.useContext(AppStateContext);
	if (context === undefined) {
		throw new Error(`useAppState must be called within AppStateProvider`);
	}

	const { userDB, online, resources } = context;

	// /**
	//  * TODO: move these to their own useUser hook?
	//  */
	const { user, site, wpCredentials, store, storeDB } = useObservableSuspense(resources);
	// const site = useObservableSuspense(resources.site);
	// const wpCredentials = useObservableSuspense(resources.wpCredentials);
	// const store = useObservableSuspense(resources.store);
	// const storeDB = useObservableSuspense(resources.storeDB);

	return { userDB, user, site, wpCredentials, store, storeDB, online };
};

export default useAppState;
