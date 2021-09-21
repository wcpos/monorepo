import * as React from 'react';
import { StoreDBContext } from './store-db-provider';

const useStoreDB = () => {
	const context = React.useContext(StoreDBContext);
	if (context === undefined) {
		throw new Error(`useStoreDB must be called within StoreDBProvider`);
	}
	return context;
};

export default useStoreDB;
