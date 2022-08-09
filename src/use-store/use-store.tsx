import * as React from 'react';
import { StoreContext } from './store-provider';

export const useStore = () => {
	const context = React.useContext(StoreContext);
	if (!context) {
		throw new Error(`useStore must be called within StoreProvider`);
	}

	return context;
};
