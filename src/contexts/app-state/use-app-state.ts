import * as React from 'react';

import { AppStateContext } from './provider';

export const useAppState = () => {
	const context = React.useContext(AppStateContext);
	if (!context) {
		throw new Error(`useAppState must be called within AppStateContext`);
	}

	return context;
};
