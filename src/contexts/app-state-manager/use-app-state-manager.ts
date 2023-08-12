import * as React from 'react';

import { AppStateManagerContext } from './provider';

export const useAppStateManager = () => {
	const context = React.useContext(AppStateManagerContext);
	if (!context) {
		throw new Error(`useStoreStateManager must be called within AppStateManagerContext`);
	}

	return context;
};
