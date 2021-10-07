import * as React from 'react';
import { useObservableSuspense, ObservableResource } from 'observable-hooks';
import { StoreDBContext } from './store-db-provider';

const useStoreDB = () => {
	const context = React.useContext(StoreDBContext);
	if (context === undefined) {
		throw new Error(`useStoreDB must be called within StoreDBProvider`);
	}

	const { storeResource, storeDBResource } = context;
	const store = useObservableSuspense(storeResource);
	const storeDB = useObservableSuspense(storeDBResource);

	return { store, storeDB };
};

export default useStoreDB;
