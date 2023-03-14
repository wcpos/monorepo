import * as React from 'react';

import { useObservableSuspense } from 'observable-hooks';

import { LocalDataContext } from './provider';

export const useLocalData = () => {
	const context = React.useContext(LocalDataContext);
	if (!context) {
		throw new Error(`useLocalData must be called within LocalDataProvider`);
	}

	const data = useObservableSuspense(context.resources);
	/**
	 * NOTE - Do not use deferred data value, the app needs the storeDB immediately
	 * eg: DO NOT use React.useDeferredValue(data);
	 */
	return { ...context, ...data };
};
