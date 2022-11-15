import * as React from 'react';

import { useObservableSuspense } from 'observable-hooks';

import { StoreContext } from './provider';

export const useStore = () => {
	const context = React.useContext(StoreContext);
	if (!context) {
		throw new Error(`useStore must be called within StoreContext`);
	}

	const storeDB = useObservableSuspense(context.storeDBResource);

	return { storeDB };
};
