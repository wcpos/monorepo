import * as React from 'react';

import { StoreStateManagerContext } from './provider';

const useStoreStateManager = () => {
	const context = React.useContext(StoreStateManagerContext);
	if (!context) {
		throw new Error(`useStoreStateManager must be called within StoreStateManagerProvider`);
	}

	return context;
};

export { useStoreStateManager };
