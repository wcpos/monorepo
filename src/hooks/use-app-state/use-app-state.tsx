import * as React from 'react';
import { useObservableSuspense } from 'observable-hooks';
import { AppStateContext } from './app-state-provider';

const useAppState = () => {
	const context = React.useContext(AppStateContext);
	if (context === undefined) {
		throw new Error(`useAppState must be called within AppStateProvider`);
	}

	const { userDB, userResource, siteResource, wpCredResource, storeResource, storeDBResource } =
		context;

	const user = useObservableSuspense(userResource);
	const site = useObservableSuspense(siteResource);
	const wpCredentials = useObservableSuspense(wpCredResource);
	const store = useObservableSuspense(storeResource);
	const storeDB = useObservableSuspense(storeDBResource);

	return { userDB, user, site, wpCredentials, store, storeDB, online: true };
};

export default useAppState;
